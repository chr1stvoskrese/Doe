"""
Сервис интервального повторения (spaced repetition) поверх БД.

Работает с таблицей memory_items. Чистый алгоритм планирования — в src.services.srs.
Глобальные настройки берутся из UI-настроек (config.get_ui_settings()['memory_settings']).
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.models import MemoryItemModel, TaskModel, ColumnModel
from src.services import srs


def _utcnow() -> datetime:
    # naive UTC — то же значение, что и _utcnow(), но без DeprecationWarning
    return datetime.now(timezone.utc).replace(tzinfo=None)


NOTIFY_HORIZON_HOURS = 24  # планируем системные уведомления на ближайшие сутки


def _settings() -> dict:
    try:
        from src.core.config import get_ui_settings
        return get_ui_settings().get("memory_settings", {}) or {}
    except Exception:
        return {}


async def _schedule_item_notification(db: AsyncSession, item: MemoryItemModel) -> None:
    """Планирует/снимает системное уведомление для одного элемента."""
    from datetime import datetime, timedelta
    from src.core import config

    if (not item.enabled) or item.due_at is None or not _settings().get("os_notification", True):
        config.cancel_memory_notification(item.id)
        return
    # слишком далеко — запланируем позже (когда due войдёт в горизонт)
    if item.due_at > _utcnow() + timedelta(hours=NOTIFY_HORIZON_HOURS):
        config.cancel_memory_notification(item.id)
        return

    res = await db.execute(select(TaskModel.title).where(TaskModel.id == item.task_id))
    title = res.scalar_one_or_none() or "Doe"
    frag = (item.fragment_text or "").strip()
    if frag:
        snippet = frag[:60] + ("…" if len(frag) > 60 else "")
        message = f"Пора повторить: {snippet}"
    else:
        message = f"Пора повторить карточку: {title}"

    due_iso = item.due_at.isoformat() + "Z"
    config.upsert_memory_notification(item.id, item.task_id, title, message,
                                      due_iso, config.get_active_vault())


async def ensure_notifications(db: AsyncSession) -> None:
    """Свип: планирует уведомления для всех включённых элементов, чьё due в горизонте.
    Вызывается поллером (через /memory/due) — пока приложение открыто, ближайшие
    повторения получают отвязанные воркеры, которые сработают даже после закрытия."""
    from datetime import datetime, timedelta
    from src.core import config

    now = _utcnow()
    horizon = now + timedelta(hours=NOTIFY_HORIZON_HOURS)
    res = await db.execute(
        select(MemoryItemModel)
        .where(MemoryItemModel.enabled.is_(True))
        .where(MemoryItemModel.due_at.isnot(None))
        .where(MemoryItemModel.due_at <= horizon)
    )
    items = res.scalars().all()
    if not _settings().get("os_notification", True):
        for it in items:
            config.cancel_memory_notification(it.id)
        return
    for it in items:
        try:
            await _schedule_item_notification(db, it)
        except Exception:
            pass


def _serialize(item: MemoryItemModel) -> Dict[str, Any]:
    return {
        "id": item.id,
        "task_id": item.task_id,
        "fragment_text": item.fragment_text,
        "enabled": item.enabled,
        "state": item.state,
        "step_index": item.step_index,
        "ease_factor": round(item.ease_factor or 0.0, 3),
        "interval_days": round(item.interval_days or 0.0, 4),
        "repetitions": item.repetitions,
        "lapses": item.lapses,
        "due_at": (item.due_at.isoformat() + "Z") if item.due_at else None,
        "last_reviewed_at": (item.last_reviewed_at.isoformat() + "Z") if item.last_reviewed_at else None,
        "last_grade": item.last_grade,
    }


async def list_items(db: AsyncSession, task_id: int) -> List[Dict[str, Any]]:
    res = await db.execute(
        select(MemoryItemModel).where(MemoryItemModel.task_id == task_id)
        .order_by(MemoryItemModel.created_at)
    )
    return [_serialize(i) for i in res.scalars().all()]


async def create_item(db: AsyncSession, task_id: int,
                      fragment_text: Optional[str] = None) -> Dict[str, Any]:
    # карточка должна существовать
    res = await db.execute(select(TaskModel.id).where(TaskModel.id == task_id))
    if res.scalar_one_or_none() is None:
        raise ValueError("Карточка не найдена")

    settings = _settings()
    state = srs.default_state(settings)
    item = MemoryItemModel(
        task_id=task_id,
        fragment_text=(fragment_text or None),
        enabled=True,
        state=state["state"],
        step_index=state["step_index"],
        ease_factor=state["ease_factor"],
        interval_days=state["interval_days"],
        repetitions=state["repetitions"],
        lapses=state["lapses"],
        due_at=srs.initial_due(settings),
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return _serialize(item)


async def delete_item(db: AsyncSession, item_id: int) -> None:
    res = await db.execute(select(MemoryItemModel).where(MemoryItemModel.id == item_id))
    item = res.scalar_one_or_none()
    if item is None:
        raise ValueError("Элемент запоминания не найден")
    try:
        from src.core import config
        config.cancel_memory_notification(item.id)
    except Exception:
        pass
    await db.delete(item)
    await db.commit()


async def set_enabled(db: AsyncSession, item_id: int, enabled: bool) -> Dict[str, Any]:
    res = await db.execute(select(MemoryItemModel).where(MemoryItemModel.id == item_id))
    item = res.scalar_one_or_none()
    if item is None:
        raise ValueError("Элемент запоминания не найден")
    item.enabled = enabled
    await db.commit()
    await db.refresh(item)
    if not enabled:
        try:
            from src.core import config
            config.cancel_memory_notification(item.id)
        except Exception:
            pass
    return _serialize(item)


async def grade(db: AsyncSession, item_id: int, grade_value: int) -> Dict[str, Any]:
    res = await db.execute(select(MemoryItemModel).where(MemoryItemModel.id == item_id))
    item = res.scalar_one_or_none()
    if item is None:
        raise ValueError("Элемент запоминания не найден")

    now = _utcnow()
    state = {
        "state": item.state,
        "step_index": item.step_index,
        "ease_factor": item.ease_factor,
        "interval_days": item.interval_days,
        "repetitions": item.repetitions,
        "lapses": item.lapses,
    }
    new = srs.schedule(state, grade_value, _settings(), now)

    item.state = new["state"]
    item.step_index = new["step_index"]
    item.ease_factor = new["ease_factor"]
    item.interval_days = new["interval_days"]
    item.repetitions = new["repetitions"]
    item.lapses = new["lapses"]
    item.due_at = new["due_at"]
    item.last_reviewed_at = now
    item.last_grade = grade_value
    await db.commit()
    await db.refresh(item)
    return _serialize(item)


async def get_due(db: AsyncSession, now: Optional[datetime] = None,
                  limit: int = 50) -> List[Dict[str, Any]]:
    """Элементы, у которых подошло время повторения, с инфой о карточке для всплытия."""
    now = now or _utcnow()
    res = await db.execute(
        select(MemoryItemModel, TaskModel, ColumnModel)
        .join(TaskModel, MemoryItemModel.task_id == TaskModel.id)
        .join(ColumnModel, TaskModel.column_id == ColumnModel.id)
        .where(MemoryItemModel.enabled.is_(True))
        .where(MemoryItemModel.due_at.isnot(None))
        .where(MemoryItemModel.due_at <= now)
        .order_by(MemoryItemModel.due_at)
        .limit(limit)
    )
    out = []
    for item, task, column in res.all():
        out.append({
            **_serialize(item),
            "task_title": task.title,
            "task_description": task.description,
            "column_id": task.column_id,
            "workspace_id": column.workspace_id,
        })
    return out


async def due_count(db: AsyncSession, now: Optional[datetime] = None) -> int:
    now = now or _utcnow()
    res = await db.execute(
        select(func.count(MemoryItemModel.id))
        .where(MemoryItemModel.enabled.is_(True))
        .where(MemoryItemModel.due_at.isnot(None))
        .where(MemoryItemModel.due_at <= now)
    )
    return int(res.scalar() or 0)


async def stats(db: AsyncSession) -> Dict[str, Any]:
    total = await db.execute(select(func.count(MemoryItemModel.id)))
    learning = await db.execute(
        select(func.count(MemoryItemModel.id)).where(MemoryItemModel.state == "learning"))
    review = await db.execute(
        select(func.count(MemoryItemModel.id)).where(MemoryItemModel.state == "review"))
    return {
        "total": int(total.scalar() or 0),
        "learning": int(learning.scalar() or 0),
        "review": int(review.scalar() or 0),
        "due": await due_count(db),
    }
