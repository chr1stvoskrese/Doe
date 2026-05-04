from fastapi import APIRouter, Depends, HTTPException, status
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
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: int, db: AsyncSession = Depends(get_session)):
    try:
        await task_service.delete_task(db, task_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return


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

@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(task_id: int, db: AsyncSession = Depends(get_session)):
    try:
        task = await task_service.get_task_with_details(db, task_id)
        return task
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
