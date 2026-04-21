"""
Pydantic-схемы для задач (карточек).
"""
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List


class TaskBase(BaseModel):
    """Общие поля задачи."""
    title: str = Field(..., min_length=1, max_length=200, description="Текст задачи")


class TaskCreate(TaskBase):
    """Данные для создания новой задачи."""
    column_id: int = Field(..., description="ID колонки, в которой создаётся задача")
    parent_id: Optional[int] = Field(None, description="ID родительской задачи, если это подзадача")


class TaskUpdate(BaseModel):
    """Данные для обновления задачи (все поля необязательные)."""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    column_id: Optional[int] = None
    parent_id: Optional[int] = None
    position: Optional[float] = None


class TaskMove(BaseModel):
    """Схема для перемещения задачи в другую колонку."""
    target_column_id: int = Field(..., description="ID колонки, куда перемещается задача")


class TimerSessionResponse(BaseModel):
    """Информация об активной сессии таймера (для отображения на фронте)."""
    id: int
    start_time: datetime
    is_active: bool

    class Config:
        from_attributes = True
        json_encoders = {
            datetime: lambda v: v.isoformat() + 'Z'  # явно добавляем Z (UTC)
        }


class TaskCreateResponse(TaskBase):
    """Упрощённый ответ при создании/обновлении/перемещении задачи."""
    id: int
    column_id: int
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
    parent_id: Optional[int]
    position: float
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime]
    subtasks: List["TaskResponse"] = []
    active_timer: Optional[TimerSessionResponse] = None
    total_time_spent: Optional[int] = None

    class Config:
        from_attributes = True

class TaskReorder(BaseModel):
    """Схема для изменения порядка задач."""
    ordered_ids: List[int]

TaskResponse.model_rebuild()