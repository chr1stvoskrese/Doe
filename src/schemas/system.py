"""Pydantic-схемы системных эндпоинтов (vault, security, settings, attachments...)."""
from pydantic import BaseModel
from typing import Optional


class HighlightReq(BaseModel):
    task_id: int
    vault_path: Optional[str] = None


class ReorderHistoryReq(BaseModel):
    ordered_paths: list[str]


class VaultResponse(BaseModel):
    name: Optional[str] = None
    path: Optional[str] = None
    canceled: bool = False
    already_active: bool = False


class SwitchVaultRequest(BaseModel):
    new_path: str
    trigger_ui: Optional[bool] = False


class CreateVaultRequest(BaseModel):
    parent_path: str
    name: str


class VaultUnlockRequest(BaseModel):
    path: str
    password: str


class VaultPasswordSetRequest(BaseModel):
    password: str
    old_password: Optional[str] = None


class VaultPasswordRemoveRequest(BaseModel):
    password: str


class VaultPathRequest(BaseModel):
    path: str


class TouchIdToggleRequest(BaseModel):
    enabled: bool


class SettingsUpdate(BaseModel):
    theme: Optional[str] = None
    language: Optional[str] = None
    active_workspace_id: Optional[int] = None
    global_attachments_path: Optional[str] = None
    reset_attachments: Optional[bool] = False
    ui_font: Optional[str] = None
    extensions: Optional[dict] = None
    priority_settings: Optional[dict] = None
    tabs_hidden: Optional[bool] = None
    hb_index: Optional[int] = None


class SettingsResponse(BaseModel):
    theme: str
    language: str
    active_workspace_id: Optional[int] = None
    global_attachments_path: Optional[str] = None
    custom_font: Optional[str] = None
    ui_font: Optional[str] = ""
    extensions: Optional[dict] = None
    priority_settings: Optional[dict] = None
    tabs_hidden: Optional[bool] = False
    hb_index: Optional[int] = 999


class TopTask(BaseModel):
    id: int
    title: str
    time_spent: int
    percentage: float # Доля от общего времени (за неделю или день)


class StatDay(BaseModel):
    date: str
    day_name: int  # 0-6 (Пн-Вс)
    tasks_done: int
    time_spent: int
    tasks: list[TopTask]  # <--- ДОБАВЛЕНО: Задачи конкретного дня


class StatisticsResponse(BaseModel):
    date_range_label: str       # "12 Авг - 18 Авг"
    total_done: int
    total_time: int
    trend_done_pct: float       # Тренд к прошлой неделе (+20%)
    trend_time_pct: float
    best_day: Optional[int]     # Индекс самого продуктивного дня
    chart_data: list[StatDay]
    top_tasks: list[TopTask]


class SetFontReq(BaseModel):
    absolute_path: str


class AttachLocalReq(BaseModel):
    absolute_path: str


class ImportFileReq(BaseModel):
    absolute_path: str


class OpenFileReq(BaseModel):
    path: str


class ValidateAttachmentsReq(BaseModel):
    paths: list[str]


class OpenLinkReq(BaseModel):
    url: str


class RevealFolderReq(BaseModel):
    path: str


class DeleteFileReq(BaseModel):
    path: str


class RelinkHistoryReq(BaseModel):
    old_path: str
    new_path: str


class RemoveHistoryReq(BaseModel):
    path: str
