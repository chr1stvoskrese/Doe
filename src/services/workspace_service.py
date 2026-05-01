from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from src.db.models import WorkspaceModel
from src.schemas.workspace import WorkspaceCreate, WorkspaceUpdate

async def get_all_workspaces(db: AsyncSession):
    # Сортируем выдачу по position
    result = await db.execute(select(WorkspaceModel).order_by(WorkspaceModel.position))
    return result.scalars().all()

async def create_workspace(db: AsyncSession, ws_in: WorkspaceCreate):
    # Вычисляем следующую позицию (в конец списка)
    result = await db.execute(select(WorkspaceModel).order_by(WorkspaceModel.position.desc()).limit(1))
    last_ws = result.scalar()
    new_position = (last_ws.position + 1.0) if last_ws else 1.0

    ws = WorkspaceModel(name=ws_in.name, position=new_position)
    db.add(ws)
    await db.commit()
    await db.refresh(ws)
    return ws

async def update_workspace(db: AsyncSession, ws_id: int, ws_in: WorkspaceUpdate):
    result = await db.execute(select(WorkspaceModel).where(WorkspaceModel.id == ws_id))
    ws = result.scalar_one_or_none()
    if not ws:
        raise ValueError("Воркспейс не найден")
    
    ws.name = ws_in.name
    await db.commit()
    await db.refresh(ws)
    return ws

async def delete_workspace(db: AsyncSession, ws_id: int):
    result = await db.execute(select(WorkspaceModel).where(WorkspaceModel.id == ws_id))
    ws = result.scalar_one_or_none()
    if not ws:
        raise ValueError("Воркспейс не найден")
    await db.delete(ws)
    await db.commit()

async def reorder_workspaces(db: AsyncSession, ordered_ids: list[int]) -> None:
    result = await db.execute(select(WorkspaceModel).where(WorkspaceModel.id.in_(ordered_ids)))
    workspaces = result.scalars().all()
    
    ws_map = {ws.id: ws for ws in workspaces}
    
    for index, ws_id in enumerate(ordered_ids):
        if ws_id in ws_map:
            ws_map[ws_id].position = float(index)
            
    await db.commit()
