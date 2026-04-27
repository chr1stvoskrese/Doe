from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from src.db.database import get_session
from src.schemas.workspace import WorkspaceCreate, WorkspaceResponse
from src.services import workspace_service

from src.schemas.workspace import WorkspaceCreate, WorkspaceResponse, WorkspaceReorder

router = APIRouter(prefix="/workspaces", tags=["workspaces"])

@router.get("/", response_model=List[WorkspaceResponse])
async def get_workspaces(db: AsyncSession = Depends(get_session)):
    return await workspace_service.get_all_workspaces(db)

@router.post("/", response_model=WorkspaceResponse)
async def create_workspace(ws_in: WorkspaceCreate, db: AsyncSession = Depends(get_session)):
    return await workspace_service.create_workspace(db, ws_in)

@router.delete("/{ws_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace(ws_id: int, db: AsyncSession = Depends(get_session)):
    try:
        await workspace_service.delete_workspace(db, ws_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/reorder", status_code=status.HTTP_200_OK)
async def reorder_workspaces_endpoint(reorder_data: WorkspaceReorder, db: AsyncSession = Depends(get_session)):
    await workspace_service.reorder_workspaces(db, reorder_data.ordered_ids)
    return {"message": "Порядок вкладок обновлен"}
