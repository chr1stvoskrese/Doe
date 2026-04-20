import os
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base
from .models import Base
from pathlib import Path
from sqlalchemy import select


_engine = None
_session_factory = None

def get_database_url(vault_path: str) -> str:
    db_file = os.path.join(vault_path, "board.db")
    return f"sqlite+aiosqlite:///{db_file}"

async def init_database(vault_path: str):
    global _engine, _session_factory
    database_url = get_database_url(vault_path)
    _engine = create_async_engine(database_url, echo=False)
    _session_factory = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)
    
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Если база только что создана — добавляем стартовые колонки
    from .models import ColumnModel, ColumnMode
    async with _session_factory() as session:
        result = await session.execute(select(ColumnModel).limit(1))
        if result.first() is None:
            # Колонок нет — создаём три стартовые
            default_columns = [
                ColumnModel(title="Входящие", mode=ColumnMode.DEFAULT, position=1.0),
                ColumnModel(title="В работе", mode=ColumnMode.TRACK_TIME, position=2.0),
                ColumnModel(title="Готово", mode=ColumnMode.COMPLETION, position=3.0),
            ]
            session.add_all(default_columns)
            await session.commit()


async def get_session() -> AsyncSession:
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
    Инициализирует базу данных для разработки во временной папке.
    Создаёт папку ~/DoeDevVault, если её нет.
    """
    dev_vault = Path.home() / "DoeDevVault"
    dev_vault.mkdir(exist_ok=True)
    await init_database(str(dev_vault))
    return dev_vault

