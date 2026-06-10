"""
Бизнес-логика для работы с колонками.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import set_committed_value # <-- ДОБАВИТЬ ЭТО
from datetime import datetime, timedelta
from src.services.task_service import cleanup_orphaned_attachments

from sqlalchemy import select, or_

from src.db.models import ColumnModel, TaskModel, TimerSessionModel, ColumnMode
from src.schemas.column import ColumnResponse
from src.schemas.task import TaskResponse, TimerSessionResponse


async def get_columns_with_tasks(db: AsyncSession, workspace_id: int):
    # Загружаем колонки
    stmt = (
        select(ColumnModel)
        .where(ColumnModel.workspace_id == workspace_id)
        .order_by(ColumnModel.position)
    )
    result = await db.execute(stmt)
    columns = result.scalars().all()

    # Тянем только ТОП-ЛЕВЕЛ задачи (у которых нет родителей) или те, что вынесены на доску.
    # ОДНИМ запросом для всех колонок воркспейса вместо запроса на каждую колонку (N+1).
    tasks_by_column: dict[int, list] = {}
    column_ids = [c.id for c in columns]
    if column_ids:
        tasks_stmt = (
            select(TaskModel)
            .where(
                TaskModel.column_id.in_(column_ids),
                or_(~TaskModel.parents.any(), TaskModel.is_visible_on_board == True)
            )
            .options(
                selectinload(TaskModel.timer_sessions),
                selectinload(TaskModel.subtasks),
                selectinload(TaskModel.parents) # Нужно для Pydantic parent_ids
            )
            .order_by(TaskModel.position)
        )
        tasks_result = await db.execute(tasks_stmt)
        for task in tasks_result.scalars().all():
            tasks_by_column.setdefault(task.column_id, []).append(task)

    response_columns = []
    for col in columns:
        root_tasks = tasks_by_column.get(col.id, [])

        task_responses = []
        for task in root_tasks:
            # Безопасная сериализация подзадач без мутации SQLAlchemy Identity Map!
            # Это возвращает счетчик подзадач для вынесенных на доску карточек (глазик).
            serialized_subtasks = []
            for sub in task.subtasks:
                serialized_subtasks.append(
                    TaskResponse(
                        id=sub.id,
                        title=sub.title,
                        description=sub.description,
                        attachments_order=sub.attachments_order,
                        column_id=sub.column_id,
                        parent_ids=sub.parent_ids,
                        position=sub.position,
                        created_at=sub.created_at,
                        updated_at=sub.updated_at,
                        completed_at=sub.completed_at,
                        due_date=sub.due_date,
                        is_visible_on_board=sub.is_visible_on_board,
                        subtasks=[], # Жестко обрываем рекурсию для Pydantic, не ломая ORM-кэш!
                        active_timer=None,
                        total_time_spent=0,
                        folded_headings=sub.folded_headings or []
                    )
                )

            total_seconds = sum(
                (s.end_time - s.start_time).total_seconds() 
                for s in task.timer_sessions if s.end_time is not None
            )

            # Ищем активный таймер
            active_sessions = [s for s in task.timer_sessions if s.is_active]
            active_timer = None
            if active_sessions:
                current_active = active_sessions[-1]
                active_timer = TimerSessionResponse(
                    id=current_active.id,
                    start_time=current_active.start_time, # БЕЗ СДВИГОВ
                    is_active=True,
                )

            task_resp = TaskResponse(
                id=task.id,
                title=task.title,
                description=task.description,
                column_id=task.column_id,
                parent_ids=task.parent_ids,
                position=task.position,
                created_at=task.created_at,
                updated_at=task.updated_at,
                completed_at=task.completed_at,
                due_date=task.due_date,
                is_visible_on_board=task.is_visible_on_board,
                # Передаем подзадачи, чтобы на доске отображался счетчик (например, 1/5)
                subtasks=serialized_subtasks, 
                active_timer=active_timer,
                total_time_spent=int(total_seconds),
                folded_headings=task.folded_headings or []
            )
            task_responses.append(task_resp)

        col_resp = ColumnResponse(
            id=col.id,
            title=col.title,
            mode=col.mode.value,
            position=col.position,
            collapsed=col.collapsed,
            created_at=col.created_at,
            updated_at=col.updated_at,
            tasks=task_responses,
        )
        response_columns.append(col_resp)

    return response_columns

async def reorder_columns(db: AsyncSession, ordered_ids: list[int]) -> None:
    # Запрашиваем нужные колонки
    result = await db.execute(select(ColumnModel).where(ColumnModel.id.in_(ordered_ids)))
    columns = result.scalars().all()
    
    col_map = {col.id: col for col in columns}
    
    # Обновляем позиции (используем индекс в массиве как позицию)
    for index, col_id in enumerate(ordered_ids):
        if col_id in col_map:
            col_map[col_id].position = float(index)
            
    await db.commit()

async def update_column_with_tasks(db: AsyncSession, column_id: int, update_data: dict) -> ColumnModel:
    result = await db.execute(select(ColumnModel).where(ColumnModel.id == column_id))
    column = result.scalar_one_or_none()
    if not column:
        raise ValueError("Колонка не найдена")

    old_mode = column.mode
    new_mode = update_data.get("mode", old_mode)

    for field, value in update_data.items():
        setattr(column, field, value)

    if new_mode != old_mode:
        tasks_result = await db.execute(
            select(TaskModel)
            .options(selectinload(TaskModel.timer_sessions))
            .where(TaskModel.column_id == column_id)
        )
        tasks = tasks_result.scalars().all()

        for task in tasks:
            # 1. Уходим из режима таймера - СТАВИМ НА ПАУЗУ
            if old_mode == ColumnMode.TRACK_TIME and new_mode != ColumnMode.TRACK_TIME:
                for session in task.timer_sessions:
                    if session.is_active:
                        session.is_active = False
                        session.end_time = datetime.utcnow()

            # 2. Управление статусом завершения
            if new_mode == ColumnMode.COMPLETION:
                if task.completed_at is None:
                    task.completed_at = datetime.utcnow()
            else:
                task.completed_at = None

            # 3. Приходим в режим таймера - СОЗДАЕМ НОВЫЕ СЕССИИ
            if new_mode == ColumnMode.TRACK_TIME and old_mode != ColumnMode.TRACK_TIME:
                new_session = TimerSessionModel(
                    task_id=task.id,
                    start_time=datetime.utcnow(),
                    is_active=True,
                )
                db.add(new_session)

    await db.commit()
    await db.refresh(column)
    return column

async def clear_column_tasks(db: AsyncSession, column_id: int) -> None:
    # Проверяем, существует ли колонка
    result = await db.execute(select(ColumnModel).where(ColumnModel.id == column_id))
    column = result.scalar_one_or_none()
    if not column:
        raise ValueError("Колонка не найдена")

    # Получаем все задачи колонки и удаляем их (ORM сама каскадно удалит таймеры)
    tasks_result = await db.execute(select(TaskModel).where(TaskModel.column_id == column_id))
    tasks = tasks_result.scalars().all()
    
    for task in tasks:
        await db.delete(task)
        
    await db.commit()
    await cleanup_orphaned_attachments(db)
