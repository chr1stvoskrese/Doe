"""
Pydantic-схемы для задач (карточек).
"""
from pydantic import BaseModel, Field, field_serializer
from datetime import datetime
from typing import Optional, List


class TaskBase(BaseModel):
    """Общие поля задачи."""
    title: str = Field(..., min_length=1, max_length=1000, description="Текст задачи")


class TaskCreate(TaskBase):
    """Данные для создания новой задачи."""
    column_id: int = Field(..., description="ID колонки, в которой создаётся задача")
    parent_id: Optional[int] = Field(None, description="ID родительской задачи, если это подзадача")


class TaskUpdate(BaseModel):
    """Данные для обновления задачи (все поля необязательные)."""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    column_id: Optional[int] = None
    parent_id: Optional[int] = None
    position: Optional[float] = None
    attachments_order: Optional[List[str]] = None


class TaskMove(BaseModel):
    """Схема для перемещения задачи в другую колонку."""
    target_column_id: int = Field(..., description="ID колонки, куда перемещается задача")


class TimerSessionResponse(BaseModel):
    """Информация об активной сессии таймера (для отображения на фронте)."""
    id: int
    start_time: datetime
    is_active: bool

    @field_serializer('start_time')
    def serialize_start_time(self, start_time: datetime, _info):
        # Гарантируем 'Z' на конце, если дата наивная, чтобы JS железно парсил её как UTC
        return start_time.isoformat() + ('Z' if start_time.tzinfo is None else '')

    class Config:
        from_attributes = True


class TaskCreateResponse(TaskBase):
    """Упрощённый ответ при создании/обновлении/перемещении задачи."""
    id: int
    column_id: int
    description: Optional[str] = None
    attachments_order: List[str] = []
    parent_id: Optional[int]
    position: float
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime]
    active_timer: Optional[TimerSessionResponse] = None
    total_time_spent: Optional[int] = None  # в секундах

    class Config:
        from_attributes = True


class TaskResponse(TaskBase):
    """Полная информация о задаче, возвращаемая API (с подзадачами)."""
    id: int
    column_id: int
    description: Optional[str] = None
    attachments_order: List[str] = []
    parent_id: Optional[int]
    position: float
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime]
    # Заменяем List на Optional, чтобы Pydantic не лез в базу, если мы не подложили данные
    subtasks: Optional[List["TaskResponse"]] = None
    active_timer: Optional[TimerSessionResponse] = None
    total_time_spent: Optional[int] = None

    class Config:
        from_attributes = True

class TaskReorder(BaseModel):
    """Схема для изменения порядка задач."""
    ordered_ids: List[int]

TaskResponse.model_rebuild()