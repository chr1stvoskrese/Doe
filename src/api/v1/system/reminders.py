from fastapi import APIRouter

from src.core.config import get_active_reminders, remove_active_reminder, get_active_vault

router = APIRouter(tags=["reminders"])


@router.get("/reminders")
async def get_reminders_endpoint():
    """Возвращает активные напоминания ТОЛЬКО текущего (активного) хранилища.

    Фоновые воркеры по-прежнему привязаны к своему vault_path и срабатывают
    независимо; здесь мы лишь ограничиваем то, что показывается в UI
    (колокольчик/бейдж), чтобы не «протекали» напоминания из других хранилищ.
    """
    active_vault = get_active_vault()
    reminders = get_active_reminders()
    if not active_vault:
        return reminders
    return [r for r in reminders if r.get("vault_path") == active_vault]


# Внимание: путь меняется с {task_id} на {reminder_id}
@router.delete("/reminders/{reminder_id}")
async def cancel_reminder_endpoint(reminder_id: str):
    """Отменяет запланированное напоминание по его UUID."""
    remove_active_reminder(reminder_id)
    return {"success": True}


@router.get("/reminders/check")
async def check_reminder_status_endpoint(task_id: int):
    """Используется фоновым процессом для проверки, не было ли напоминание отменено."""
    reminders = get_active_reminders()
    is_active = any(r.get("task_id") == task_id for r in reminders)
    return {"active": is_active}
