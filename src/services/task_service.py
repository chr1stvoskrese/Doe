"""
Бизнес-логика для работы с задачами.
"""
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from src.db.models import TaskModel, ColumnModel, TimerSessionModel, ColumnMode
from src.schemas.task import TaskCreate, TaskUpdate, TimerSessionResponse


def _calculate_task_time(task: TaskModel) -> None:
    """Вспомогательная функция для подсчета времени и сдвига таймера для фронтенда."""
    # 1. Считаем сумму всех УЖЕ ЗАКРЫТЫХ отрезков времени
    total_seconds = sum(
        (s.end_time - s.start_time).total_seconds() 
        for s in task.timer_sessions if s.end_time is not None
    )

    # 2. Ищем, есть ли сейчас активный таймер
    current_active = next((s for s in task.timer_sessions if s.is_active), None)
    
    if current_active:
        # СДВИГАЕМ ВРЕМЯ НАЗАД для фронтенда, чтобы он продолжил счет с паузы
        shifted_start = current_active.start_time - timedelta(seconds=total_seconds)
        task.active_timer = TimerSessionResponse(
            id=current_active.id,
            start_time=shifted_start,
            is_active=True
        )
    else:
        task.active_timer = None

    task.total_time_spent = int(total_seconds)


async def create_task(db: AsyncSession, task_in: TaskCreate) -> TaskModel:
    result = await db.execute(
        select(TaskModel)
        .where(TaskModel.column_id == task_in.column_id)
        .order_by(TaskModel.position.desc())
        .limit(1)
    )
    last_task = result.scalar()
    position = (last_task.position + 1.0) if last_task else 1.0

    db_task = TaskModel(
        title=task_in.title,
        column_id=task_in.column_id,
        parent_id=task_in.parent_id,
        position=position,
    )
    db.add(db_task)
    await db.commit()
    await db.refresh(db_task)

    # Получаем данные колонки, чтобы проверить её режим
    result = await db.execute(select(ColumnModel).where(ColumnModel.id == task_in.column_id))
    column = result.scalar_one()

    # 1. Если создаем в режиме таймера — запускаем таймер
    if column.mode == ColumnMode.TRACK_TIME:
        new_session = TimerSessionModel(
            task_id=db_task.id,
            start_time=datetime.utcnow(),
            is_active=True,
        )
        db.add(new_session)
        await db.commit()

    # 2. ИСПРАВЛЕНИЕ: Если создаем в режиме завершения — помечаем как выполненную
    if column.mode == ColumnMode.COMPLETION:
        db_task.completed_at = datetime.utcnow()
        await db.commit()

    await db.refresh(db_task, attribute_names=['timer_sessions'])
    _calculate_task_time(db_task)
    return db_task


async def update_task(db: AsyncSession, task_id: int, task_in: TaskUpdate) -> TaskModel:
    result = await db.execute(
        select(TaskModel)
        .options(selectinload(TaskModel.timer_sessions))
        .where(TaskModel.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise ValueError("Задача не найдена")

    update_data = task_in.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(task, field, value)

    await db.commit()
    await db.refresh(task)
    _calculate_task_time(task)
    return task


async def delete_task(db: AsyncSession, task_id: int) -> None:
    result = await db.execute(select(TaskModel).where(TaskModel.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise ValueError("Задача не найдена")

    await db.delete(task)
    await db.commit()


async def move_task(db: AsyncSession, task_id: int, target_column_id: int) -> TaskModel:
    result = await db.execute(
        select(TaskModel)
        .options(
            selectinload(TaskModel.column),
            selectinload(TaskModel.timer_sessions)
        )
        .where(TaskModel.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise ValueError("Задача не найдена")

    source_column = task.column
    if source_column.id == target_column_id:
        _calculate_task_time(task)
        return task

    result = await db.execute(select(ColumnModel).where(ColumnModel.id == target_column_id))
    target_column = result.scalar_one_or_none()
    if not target_column:
        raise ValueError("Целевая колонка не найдена")

    task.column_id = target_column_id

    # 1. Если уходим из режима таймера - СТАВИМ НА ПАУЗУ (сохраняем время закрытия)
    if source_column.mode == ColumnMode.TRACK_TIME:
        for session in task.timer_sessions:
            if session.is_active:
                session.is_active = False
                session.end_time = datetime.utcnow()

    # 2. Обработка завершения задачи
    if target_column.mode == ColumnMode.COMPLETION:
        if task.completed_at is None:
            task.completed_at = datetime.utcnow()
    else:
        task.completed_at = None

    # 3. Если заходим в колонку таймера - создаем НОВУЮ СЕССИЮ
    if target_column.mode == ColumnMode.TRACK_TIME:
        new_session = TimerSessionModel(
            task_id=task.id,
            start_time=datetime.utcnow(),
            is_active=True,
        )
        db.add(new_session)

    await db.commit()
    await db.refresh(task)
    
    _calculate_task_time(task)
    return task