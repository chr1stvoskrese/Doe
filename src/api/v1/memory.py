"""
API интервального повторения (spaced repetition / «Запоминание»).
"""
from typing import Optional, List, Dict, Any
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.database import get_session
from src.services import memory_service, srs

router = APIRouter(prefix="/memory", tags=["memory"])


class MemoryItemCreate(BaseModel):
    fragment_text: Optional[str] = None


class MemoryEnableReq(BaseModel):
    enabled: bool


class MemoryGradeReq(BaseModel):
    grade: int = Field(..., ge=1, le=4)  # 1=Again, 2=Hard, 3=Good, 4=Easy


@router.get("/due")
async def get_due_endpoint(limit: int = 50, db: AsyncSession = Depends(get_session)):
    items = await memory_service.get_due(db, limit=limit)
    return {"items": items, "count": len(items)}


@router.post("/schedule-offline")
async def schedule_offline_endpoint(db: AsyncSession = Depends(get_session)):
    """Планирует системные уведомления для ближайших повторений (работают даже
    при закрытом приложении). Вызывается фронтендом при открытии и при закрытии
    приложения — НЕ во время обычной работы, чтобы не плодить процессы."""
    try:
        await memory_service.ensure_notifications(db)
    except Exception:
        pass
    return {"success": True}


@router.get("/stats")
async def get_stats_endpoint(db: AsyncSession = Depends(get_session)):
    return await memory_service.stats(db)


@router.get("/cards/{task_id}")
async def list_card_items_endpoint(task_id: int, db: AsyncSession = Depends(get_session)):
    return {"items": await memory_service.list_items(db, task_id)}


@router.post("/cards/{task_id}", status_code=201)
async def create_item_endpoint(task_id: int, req: MemoryItemCreate,
                               db: AsyncSession = Depends(get_session)):
    try:
        return await memory_service.create_item(db, task_id, req.fragment_text)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/items/{item_id}")
async def delete_item_endpoint(item_id: int, db: AsyncSession = Depends(get_session)):
    try:
        await memory_service.delete_item(db, item_id)
        return {"success": True}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/items/{item_id}")
async def set_enabled_endpoint(item_id: int, req: MemoryEnableReq,
                               db: AsyncSession = Depends(get_session)):
    try:
        return await memory_service.set_enabled(db, item_id, req.enabled)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/items/{item_id}/grade")
async def grade_item_endpoint(item_id: int, req: MemoryGradeReq,
                              db: AsyncSession = Depends(get_session)):
    try:
        return await memory_service.grade(db, item_id, req.grade)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/items/{item_id}/preview")
async def preview_endpoint(item_id: int, db: AsyncSession = Depends(get_session)):
    """Что покажет каждая из 4 кнопок оценки (даты следующего повтора)."""
    from sqlalchemy import select
    from src.db.models import MemoryItemModel
    res = await db.execute(select(MemoryItemModel).where(MemoryItemModel.id == item_id))
    item = res.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Элемент запоминания не найден")
    state = {
        "state": item.state, "step_index": item.step_index,
        "ease_factor": item.ease_factor, "interval_days": item.interval_days,
        "repetitions": item.repetitions, "lapses": item.lapses,
    }
    settings = memory_service._settings()
    preview = srs.preview_intervals(state, settings)
    return {k: (v.isoformat() + "Z") for k, v in preview.items()}
