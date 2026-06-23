"""
Pydantic-схемы для колонок.
"""
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum
from typing import Optional, List

# Импортируем TaskResponse из модуля task (относительный импорт)
from .task import TaskResponse


class ColumnMode(str, Enum):
    DEFAULT = "default"
    TRACK_TIME = "track_time"
    COMPLETION = "completion"


class ColumnBase(BaseModel):
    title: str = Field(..., min_length=1)
    mode: ColumnMode = Field(default=ColumnMode.DEFAULT)


class ColumnCreate(ColumnBase):
    position: Optional[float] = Field(None)
    workspace_id: int # <--- ДОБАВИТЬ ЭТУ СТРОКУ


class ColumnUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1)
    mode: Optional[ColumnMode] = None
    position: Optional[float] = None
    collapsed: Optional[bool] = None
    workspace_id: Optional[int] = None
    width: Optional[float] = None


class ColumnResponse(ColumnBase):
    id: int
    position: float
    collapsed: bool
    width: Optional[float] = None
    created_at: datetime
    updated_at: datetime
    tasks: List[TaskResponse] = []   # список задач в колонке

    class Config:
        from_attributes = True

class ColumnReorder(BaseModel):
    ordered_ids: List[int]