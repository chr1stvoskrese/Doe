"""
Бизнес-логика для работы с колонками.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from datetime import datetime, timedelta

from src.db.models import ColumnModel, TaskModel, TimerSessionModel, ColumnMode
from src.schemas.column import ColumnResponse
from src.schemas.task import TaskResponse, TimerSessionResponse


async def get_columns_with_tasks(db: AsyncSession):
    stmt = (
        select(ColumnModel)
        .options(
            selectinload(ColumnModel.tasks).selectinload(TaskModel.subtasks)
        )
        .options(
            selectinload(ColumnModel.tasks).selectinload(TaskModel.timer_sessions)
        )
        .order_by(ColumnModel.position)
    )

    result = await db.execute(stmt)
    columns = result.scalars().unique().all()

    response_columns = []
    for col in columns:
        task_responses = []
        for task in col.tasks:
            # Считаем сумму только закрытых отрезков времени
            total_seconds = sum(
                (s.end_time - s.start_time).total_seconds() 
                for s in task.timer_sessions if s.end_time is not None
            )

            # Ищем активный таймер и сдвигаем его для фронтенда
            active_sessions = [s for s in task.timer_sessions if s.is_active]
            active_timer = None
            if active_sessions:
                current_active = active_sessions[-1]
                # Сдвигаем назад на накопленное время, чтобы JS корректно продолжил отсчет
                shifted_start = current_active.start_time - timedelta(seconds=total_seconds)
                active_timer = TimerSessionResponse(
                    id=current_active.id,
                    start_time=shifted_start,
                    is_active=True,
                )

            task_resp = TaskResponse(
                id=task.id,
                title=task.title,
                column_id=task.column_id,
                parent_id=task.parent_id,
                position=task.position,
                created_at=task.created_at,
                updated_at=task.updated_at,
                completed_at=task.completed_at,
                subtasks=[],
                active_timer=active_timer,
                total_time_spent=int(total_seconds),
            )
            task_responses.append(task_resp)

        col_resp = ColumnResponse(
            id=col.id,
            title=col.title,
            mode=col.mode.value,
            position=col.position,
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
