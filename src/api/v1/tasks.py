from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Dict, Any
import sys
import os
import subprocess
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.database import get_session
from src.services import task_service
from src.schemas.task import (
    TaskCreate,
    TaskUpdate,
    TaskMove,
    TaskResponse,
    TaskCreateResponse,
    TaskReorder,
    TaskExportReq,
    TaskSetTimeReq,
    TaskNotifyReq,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.post("/", response_model=TaskCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_task(task_in: TaskCreate, db: AsyncSession = Depends(get_session)):
    try:
        task = await task_service.create_task(db, task_in)
        return task
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{task_id}", response_model=TaskCreateResponse)
async def update_task(task_id: int, task_in: TaskUpdate, db: AsyncSession = Depends(get_session)):
    try:
        task = await task_service.update_task(db, task_id, task_in)
        return task
    except ValueError as e:
        # Семантически верный статус для ошибок бизнес-логики (циклы)
        status_code = 400 if "цикл" in str(e).lower() or "зависимост" in str(e).lower() or "самой себя" in str(e).lower() else 404
        raise HTTPException(status_code=status_code, detail=str(e))


@router.delete("/{task_id}", status_code=status.HTTP_200_OK)
async def delete_task(task_id: int, db: AsyncSession = Depends(get_session)):
    try:
        deleted_ids = await task_service.delete_task(db, task_id)
        return {"deleted_ids": deleted_ids}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{task_id}/move", response_model=TaskCreateResponse)
async def move_task(task_id: int, move_in: TaskMove, db: AsyncSession = Depends(get_session)):
    try:
        task = await task_service.move_task(db, task_id, move_in.target_column_id)
        return task
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
@router.post("/reorder", status_code=status.HTTP_200_OK)
async def reorder_tasks_endpoint(reorder_data: TaskReorder, db: AsyncSession = Depends(get_session)):
    await task_service.reorder_tasks(db, reorder_data.ordered_ids)
    return {"message": "Порядок задач обновлен"}

@router.post("/{task_id}/clear-timer", response_model=TaskCreateResponse)
async def clear_task_timer_endpoint(task_id: int, db: AsyncSession = Depends(get_session)):
    try:
        task = await task_service.clear_task_timer(db, task_id)
        return task
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/{task_id}/export")
async def export_task_endpoint(task_id: int, req: TaskExportReq, db: AsyncSession = Depends(get_session)):
    try:
        result = await task_service.export_task_to_markdown(db, task_id, req.export_path, req.include_attachments)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(task_id: int, db: AsyncSession = Depends(get_session)):
    try:
        task = await task_service.get_task_with_details(db, task_id)
        return task
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/{task_id}/set-time", response_model=TaskCreateResponse)
async def set_task_time_endpoint(task_id: int, req: TaskSetTimeReq, db: AsyncSession = Depends(get_session)):
    try:
        task = await task_service.set_task_time(db, task_id, req.total_seconds)
        return task
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

from datetime import datetime, timedelta
from src.db.models import TaskModel
from sqlalchemy import select
from src.core.config import add_active_reminder, get_active_vault
import uuid

@router.post("/{task_id}/notify")
async def schedule_notification_endpoint(task_id: int, req: TaskNotifyReq, db: AsyncSession = Depends(get_session)):
    try:
        res = await db.execute(select(TaskModel).where(TaskModel.id == task_id))
        task = res.scalar_one_or_none()
        task_title = task.title if task else "Doe Task"

        due_time = datetime.utcnow() + timedelta(seconds=req.delay_seconds)
        due_time_iso = due_time.isoformat() + "Z"
        vault_path = get_active_vault()
        
        reminder_id = str(uuid.uuid4())

        from src.core.config import spawn_notification_worker, add_active_reminder
        
        pid = spawn_notification_worker(
            task_id=task_id,
            task_title=task_title,
            message=req.message,
            due_time_iso=due_time_iso,
            vault_path=vault_path,
            reminder_id=reminder_id
        )
            
        add_active_reminder(task_id, task_title, req.message, due_time_iso, pid, vault_path, reminder_id)
            
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{task_id}/context")
async def get_task_context_endpoint(task_id: int, db: AsyncSession = Depends(get_session)):
    try:
        return await task_service.get_task_context(db, task_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/{task_id}/paths", response_model=List[List[Dict[str, Any]]])
async def get_task_paths_endpoint(task_id: int, db: AsyncSession = Depends(get_session)):
    try:
        return await task_service.get_task_paths(db, task_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
