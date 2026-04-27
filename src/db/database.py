import os
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base
from .models import Base
from pathlib import Path
from sqlalchemy import select
from typing import AsyncGenerator

from src.core.config import get_active_vault, set_active_vault

_engine = None
_session_factory = None

def get_database_url(vault_path: str) -> str:
    db_file = os.path.join(vault_path, "board.db")
    return f"sqlite+aiosqlite:///{db_file}"

# --- ИЗМЕНИТЬ ФУНКЦИЮ init_database В src/db/database.py ---
async def init_database(vault_path: str):
    global _engine, _session_factory
    database_url = get_database_url(vault_path)
    _engine = create_async_engine(database_url, echo=False)
    _session_factory = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)
    
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    from .models import WorkspaceModel, ColumnModel, ColumnMode
    async with _session_factory() as session:
        # Проверяем наличие вкладок
        result = await session.execute(select(WorkspaceModel).limit(1))
        if result.first() is None:
            # Создаем дефолтную вкладку
            default_ws = WorkspaceModel(name="Начальная вкладка", position=1.0) # Как на скрине
            session.add(default_ws)
            await session.commit()
            await session.refresh(default_ws)

            # Создаем колонки и привязываем к вкладке
            default_columns =[
                ColumnModel(title="Входящие", mode=ColumnMode.DEFAULT, position=1.0, workspace_id=default_ws.id),
                ColumnModel(title="В работе", mode=ColumnMode.TRACK_TIME, position=2.0, workspace_id=default_ws.id),
                ColumnModel(title="Готово", mode=ColumnMode.COMPLETION, position=3.0, workspace_id=default_ws.id),
            ]
            session.add_all(default_columns)
            await session.commit()


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    if _session_factory is None:
        raise RuntimeError("База данных не инициализирована.")
    async with _session_factory() as session:
        yield session

def get_session_factory():
    if _session_factory is None:
        raise RuntimeError("База данных не инициализирована.")
    return _session_factory

async def close_database():
    global _engine
    if _engine:
        await _engine.dispose()
        _engine = None

async def init_dev_database():
    """
    Инициализирует БД в активном хранилище.
    """
    vault_path = get_active_vault()
    dev_vault = Path(vault_path)
    dev_vault.mkdir(parents=True, exist_ok=True)
    await init_database(str(dev_vault))
    return dev_vault

async def switch_vault(new_vault_path: str):
    """
    Переключает активное хранилище "на лету".
    """
    global _engine
    if _engine:
        await close_database()
    
    Path(new_vault_path).mkdir(parents=True, exist_ok=True)
    await init_database(new_vault_path)
    set_active_vault(new_vault_path)
