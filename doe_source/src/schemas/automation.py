"""
Pydantic-схемы для автоматизаций.
Поддерживает типы: recurring_card, sort_column, clear_column.
"""
from __future__ import annotations
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Dict, Any


class ScheduleConfig(BaseModel):
    """Расписание (для recurring_card и clear_column)."""
    type: str = Field(..., description="hourly | daily | weekdays | weekly | monthly")
    time: str = Field("09:00", description="Время в формате HH:MM")
    days: list[int] = Field(default=[], description="Дни недели для weekly (0=ПН, 6=ВС)")
    day_of_month: int = Field(default=1, description="День месяца для monthly")


# ── Конфигурации по типам ──

class RecurringCardConfig(BaseModel):
    """Конфигурация recurring_card: создание карточек по расписанию."""
    column_id: int
    title_template: str = Field(..., min_length=1, max_length=1000)
    description_template: str = Field(default="", max_length=50000)
    schedule: ScheduleConfig


class SortColumnConfig(BaseModel):
    """Конфигурация sort_column: сортировка карточек в колонке."""
    column_id: int
    sort_by: str = Field(default="position", description="position | title | created_at | priority | due_date")
    sort_order: str = Field(default="asc", description="asc | desc")


class ClearColumnConfig(BaseModel):
    """Конфигурация clear_column: удаление старых карточек из колонки."""
    column_id: int
    max_age_minutes: int = Field(default=1440, ge=1, description="Максимальный возраст карточки в минутах")
    schedule: ScheduleConfig = Field(
        default_factory=lambda: ScheduleConfig(type="daily", time="03:00"),
        description="Как часто проверять и удалять старые карточки"
    )


# ── Общие схемы ──

class AutomationBase(BaseModel):
    """Общие поля автоматизации."""
    type: str = Field(..., description="recurring_card | sort_column | clear_column")
    name: str = Field(..., min_length=1, max_length=200)
    enabled: bool = True
    config: Dict[str, Any] = Field(..., description="Type-specific configuration")


class AutomationCreate(AutomationBase):
    """Данные для создания автоматизации."""
    pass


class AutomationUpdate(BaseModel):
    """Данные для обновления (все поля опциональны)."""
    type: Optional[str] = None
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    enabled: Optional[bool] = None
    config: Optional[Dict[str, Any]] = None


class AutomationResponse(BaseModel):
    """Ответ API."""
    id: int
    type: str
    name: str
    enabled: bool
    config: Dict[str, Any]
    last_run_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
