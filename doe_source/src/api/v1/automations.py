from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.database import get_session
from src.services import automation_service
from src.schemas.automation import (
    AutomationCreate,
    AutomationUpdate,
    AutomationResponse,
)

router = APIRouter(prefix="/automations", tags=["automations"])


@router.get("/", response_model=list[AutomationResponse])
async def list_automations(db: AsyncSession = Depends(get_session)):
    return await automation_service.list_automations(db)


@router.get("/{auto_id}", response_model=AutomationResponse)
async def get_automation(auto_id: int, db: AsyncSession = Depends(get_session)):
    """Получить одну автоматизацию по ID (для редактирования)."""
    auto = await automation_service.get_automation(db, auto_id)
    if auto is None:
        raise HTTPException(status_code=404, detail="Automation not found")
    return auto


@router.post("/", response_model=AutomationResponse, status_code=status.HTTP_201_CREATED)
async def create_automation(data: AutomationCreate, db: AsyncSession = Depends(get_session)):
    try:
        return await automation_service.create_automation(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{auto_id}", response_model=AutomationResponse)
async def update_automation(auto_id: int, data: AutomationUpdate, db: AsyncSession = Depends(get_session)):
    result = await automation_service.update_automation(db, auto_id, data)
    if result is None:
        raise HTTPException(status_code=404, detail="Automation not found")
    return result


@router.delete("/{auto_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_automation(auto_id: int, db: AsyncSession = Depends(get_session)):
    deleted = await automation_service.delete_automation(db, auto_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Automation not found")


@router.post("/{auto_id}/run")
async def run_automation(auto_id: int, db: AsyncSession = Depends(get_session)):
    try:
        result = await automation_service.run_automation_now(db, auto_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if result is None:
        raise HTTPException(status_code=404, detail="Automation not found or failed")
    # Полиморфный ответ: task_id для recurring_card, cleared для остальных
    auto = await automation_service.get_automation(db, auto_id)
    if auto and auto.type == 'recurring_card':
        return {"task_id": result}
    else:
        return {"task_id": result, "cleared": result}
