from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from src.db.database import get_session
from src.db.models import ColumnModel, ColumnMode as DBColumnMode
from src.schemas.column import ColumnCreate, ColumnUpdate, ColumnResponse, ColumnMode as SchemaColumnMode
from src.services import column_service

router = APIRouter(prefix="/columns", tags=["columns"])


def db_mode_to_schema(mode: DBColumnMode) -> SchemaColumnMode:
    return SchemaColumnMode(mode.value)


def schema_mode_to_db(mode: SchemaColumnMode) -> DBColumnMode:
    return DBColumnMode(mode.value)


@router.get("/", response_model=List[ColumnResponse])
async def get_columns(db: AsyncSession = Depends(get_session)):
    # Теперь сервис возвращает готовые Pydantic-схемы
    return await column_service.get_columns_with_tasks(db)


@router.post("/", response_model=ColumnResponse, status_code=status.HTTP_201_CREATED)
async def create_column(column_in: ColumnCreate, db: AsyncSession = Depends(get_session)):
    if column_in.position is None:
        result = await db.execute(select(ColumnModel).order_by(ColumnModel.position.desc()).limit(1))
        last_col = result.scalar()
        new_position = (last_col.position + 1.0) if last_col else 1.0
    else:
        new_position = column_in.position

    db_column = ColumnModel(
        title=column_in.title,
        mode=schema_mode_to_db(column_in.mode),
        position=new_position,
    )
    db.add(db_column)
    await db.commit()
    await db.refresh(db_column)

    # Возвращаем схему без задач (они пустые)
    return ColumnResponse(
        id=db_column.id,
        title=db_column.title,
        mode=db_column.mode.value,
        position=db_column.position,
        created_at=db_column.created_at,
        updated_at=db_column.updated_at,
        tasks=[],
    )


@router.put("/{column_id}", response_model=ColumnResponse)
async def update_column(column_id: int, column_in: ColumnUpdate, db: AsyncSession = Depends(get_session)):
    update_data = column_in.dict(exclude_unset=True)
    if "mode" in update_data:
        update_data["mode"] = schema_mode_to_db(update_data["mode"])

    try:
        db_column = await column_service.update_column_with_tasks(db, column_id, update_data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Возвращаем упрощённую схему (можно без задач)
    return ColumnResponse(
        id=db_column.id,
        title=db_column.title,
        mode=db_column.mode.value,
        position=db_column.position,
        created_at=db_column.created_at,
        updated_at=db_column.updated_at,
        tasks=[],  # фронтенд сам перезапросит данные через refreshBoard
    )

@router.delete("/{column_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_column(column_id: int, db: AsyncSession = Depends(get_session)):
    result = await db.execute(select(ColumnModel).where(ColumnModel.id == column_id))
    db_column = result.scalar_one_or_none()
    if db_column is None:
        raise HTTPException(status_code=404, detail="Колонка не найдена")

    await db.delete(db_column)
    await db.commit()
    return