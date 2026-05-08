import os
import sys
import asyncio
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import select
from typing import AsyncGenerator

from alembic.config import Config
from alembic import command

from .models import Base
from src.core.config import get_active_vault, set_active_vault, get_ui_settings
import shutil

_engine = None
_session_factory = None

# Определение базовой директории (с учетом сборки PyInstaller)
if getattr(sys, 'frozen', False):
    BASE_DIR = Path(sys._MEIPASS)
else:
    # Если мы в src/db/database.py, то корень проекта на 3 уровня выше
    BASE_DIR = Path(__file__).resolve().parent.parent.parent

def get_database_url(vault_path: str) -> str:
    db_file = os.path.join(vault_path, "board.db")
    return f"sqlite+aiosqlite:///{db_file}"

def run_migrations(vault_path: str):
    alembic_ini_path = BASE_DIR / "alembic.ini"
    alembic_scripts_path = BASE_DIR / "alembic"
    
    db_file = os.path.join(vault_path, "board.db")
    
    # === SENIOR HACK: AUTO-BACKUP ===
    # Перед тем как Alembic начнет трогать базу, делаем её копию
    if os.path.exists(db_file):
        backup_file = os.path.join(vault_path, "board.backup.db")
        try:
            shutil.copy2(db_file, backup_file)
            print(f"[Database] Backup created at {backup_file}")
        except Exception as e:
            print(f"[Database] Failed to create backup: {e}")
    # ================================

    sync_url = f"sqlite:///{db_file}"

    alembic_cfg = Config(str(alembic_ini_path))
    alembic_cfg.set_main_option("script_location", str(alembic_scripts_path))
    alembic_cfg.set_main_option("sqlalchemy.url", sync_url)

    # Выполняем миграцию
    command.upgrade(alembic_cfg, "head")
    
    # (Опционально) Если миграция прошла успешно, бэкап можно удалить,
    # но лучше оставлять 1 последний бэкап на всякий случай.

async def init_database(vault_path: str):
    global _engine, _session_factory
    
    # 1. ЗАПУСКАЕМ МИГРАЦИИ ДО ИНИЦИАЛИЗАЦИИ
    # Выполняем в отдельном потоке, чтобы не блокировать async loop
    await asyncio.to_thread(run_migrations, vault_path)

    # 2. Инициализируем async движок приложения
    database_url = get_database_url(vault_path)
    _engine = create_async_engine(database_url, echo=False)
    _session_factory = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)
    
    # ВНИМАНИЕ: Base.metadata.create_all УБРАНО! Теперь всем рулит Alembic.
    
    from .models import WorkspaceModel, ColumnModel, ColumnMode
    async with _session_factory() as session:
        # 3. Дефолтное наполнение, если база абсолютно пустая
        result = await session.execute(select(WorkspaceModel).limit(1))
        if result.first() is None:
            # Читаем язык из глобальных настроек приложения
            lang = get_ui_settings().get("language", "ru")
            
            # Задаем локализованные названия
            ws_name = "Main Board" if lang == "en" else "Начальная вкладка"
            col1_title = "To Do" if lang == "en" else "Входящие"
            col2_title = "In Progress" if lang == "en" else "В работе"
            col3_title = "Done" if lang == "en" else "Готово"

            default_ws = WorkspaceModel(name=ws_name, position=1.0)
            session.add(default_ws)
            await session.commit()
            await session.refresh(default_ws)

            default_columns = [
                ColumnModel(title=col1_title, mode=ColumnMode.DEFAULT, position=1.0, workspace_id=default_ws.id),
                ColumnModel(title=col2_title, mode=ColumnMode.TRACK_TIME, position=2.0, workspace_id=default_ws.id),
                ColumnModel(title=col3_title, mode=ColumnMode.COMPLETION, position=3.0, workspace_id=default_ws.id),
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
    vault_path = get_active_vault()
    dev_vault = Path(vault_path)
    dev_vault.mkdir(parents=True, exist_ok=True)
    await init_database(str(dev_vault))
    return dev_vault

async def switch_vault(new_vault_path: str):
    global _engine
    if _engine:
        await close_database()
    
    Path(new_vault_path).mkdir(parents=True, exist_ok=True)
    await init_database(new_vault_path)
    set_active_vault(new_vault_path)
