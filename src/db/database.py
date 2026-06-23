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
from src.core.config import (
    get_active_vault,
    set_active_vault,
    get_ui_settings,
    _load_config,
    _save_config,
    DEFAULT_VAULT,
)
import shutil
from src.core.watcher import vault_observer # <-- ИМПОРТ НАШЕГО WATCHER'A

_engine = None
_session_factory = None

# Определение базовой директории (с учетом сборки PyInstaller)
if getattr(sys, 'frozen', False):
    BASE_DIR = Path(sys._MEIPASS)
else:
    # Если мы в src/db/database.py, то корень проекта на 3 уровня выше
    BASE_DIR = Path(__file__).resolve().parent.parent.parent


def _backup_filename(db_path: Path) -> Path:
    """Имя аварийного бэкапа: 'MyVault.backup.db.doe'."""
    return db_path.parent / db_path.name.replace(".db.doe", ".backup.db.doe")


def _is_backup_file(p: Path) -> bool:
    """Распознаём бэкап независимо от имени хранилища."""
    return p.name.endswith(".backup.db.doe")


def _resolve_db_path(vault_path: str) -> Path:
    """
    Возвращает путь к рабочему файлу БД для данного хранилища.
    Использует уникальное расширение .db.doe
    """
    vault_dir = Path(vault_path)
    
    # 0.1 БЕСШОВНАЯ МИГРАЦИЯ со старого .doe.db на новый .db.doe
    doe_db_candidates = [f for f in vault_dir.glob("*.doe.db") if not f.name.startswith("._")]
    if doe_db_candidates:
        old_db = max(doe_db_candidates, key=lambda p: p.stat().st_mtime)
        new_db_name = old_db.name.replace(".doe.db", ".db.doe")
        new_db_path = vault_dir / new_db_name
        try:
            old_db.rename(new_db_path)
            print(f"[Database] 🔄 Migrated DB extension: {old_db.name} -> {new_db_path.name}")
        except Exception as e:
            print(f"[Database] ❌ Failed to migrate DB extension: {e}")
            return old_db

    # 0.2 БЕСШОВНАЯ МИГРАЦИЯ: Если есть старый .db (не backup), переименовываем в .db.doe
    legacy_candidates = [f for f in vault_dir.glob("*.db") if not f.name.endswith(".db.doe") and not f.name.endswith(".backup.db") and not f.name.endswith(".doe.db") and not f.name.startswith("._")]
    if legacy_candidates:
        old_db = max(legacy_candidates, key=lambda p: p.stat().st_mtime)
        new_db_name = old_db.stem + ".db.doe"
        new_db_path = vault_dir / new_db_name
        try:
            old_db.rename(new_db_path)
            print(f"[Database] 🔄 Migrated DB extension: {old_db.name} -> {new_db_path.name}")
        except Exception as e:
            print(f"[Database] ❌ Failed to migrate DB extension: {e}")
            return old_db # Фолбэк на старый файл, если нет прав

    # 1. Ищем все .db.doe файлы в папке
    candidates = [f for f in vault_dir.glob("*.db.doe") if not _is_backup_file(f) and not f.name.startswith("._")]
    
    if candidates:
        target_db = max(candidates, key=lambda p: p.stat().st_mtime)
        print(f"[Database] Found existing database file: {target_db.name}")
        return target_db

    # 2. Если файлов нет (создание абсолютно нового хранилища)
    vault_name = vault_dir.name
    new_db_target = vault_dir / f"{vault_name}.db.doe"
    print(f"[Database] No existing DB found. Targeting new file: {new_db_target.name}")
    return new_db_target


def get_database_url(vault_path: str) -> str:
    db_file = _resolve_db_path(vault_path)
    # SQLite-URL с абсолютным путём корректно работает с пробелами и кириллицей.
    # POSIX-разделители безопасны и на Windows.
    return f"sqlite+aiosqlite:///{db_file.as_posix()}"


def run_migrations(vault_path: str):
    alembic_ini_path = BASE_DIR / "alembic.ini"
    alembic_scripts_path = BASE_DIR / "alembic"

    db_file = _resolve_db_path(vault_path)
    backup_file = _backup_filename(db_file)

    # === АВАРИЙНЫЙ БЭКАП ===
    # Создаём временную копию ТОЛЬКО на время миграций.
    # Если миграции пройдут успешно — копия будет удалена.
    # Если упадут — копия останется как точка восстановления.
    backup_created = False
    if db_file.exists():
        try:
            shutil.copy2(db_file, backup_file)
            backup_created = True
            print(f"[Database] Pre-migration safety backup created: {backup_file.name}")
        except Exception as e:
            print(f"[Database] Failed to create safety backup: {e}")

    # Собираем URL для синхронного Alembic.
    # Экранируем '%', чтобы ConfigParser в Alembic не пытался его интерполировать.
    sync_url = f"sqlite:///{db_file.as_posix()}".replace("%", "%%")

    alembic_cfg = Config(str(alembic_ini_path))
    alembic_cfg.set_main_option("script_location", str(alembic_scripts_path))
    alembic_cfg.set_main_option("sqlalchemy.url", sync_url)

    try:
        command.upgrade(alembic_cfg, "head")
    except Exception as e:
        # Миграция упала — НЕ удаляем бэкап, оставляем его пользователю
        if backup_created:
            print(f"[Database] ❌ MIGRATION FAILED! Safety backup preserved at: {backup_file}")
        raise

    # Миграция прошла успешно — папку не засоряем, чистим за собой
    if backup_created and backup_file.exists():
        try:
            backup_file.unlink()
            print(f"[Database] Migration successful — safety backup removed")
        except Exception as e:
            print(f"[Database] Could not remove safety backup: {e}")

async def init_database(vault_path: str):
    global _engine, _session_factory
    
    # 1. ЗАПУСКАЕМ МИГРАЦИИ ДО ИНИЦИАЛИЗАЦИИ
    # Выполняем в отдельном потоке, чтобы не блокировать async loop
    await asyncio.to_thread(run_migrations, vault_path)

    # 2. Инициализируем async движок приложения
    database_url = get_database_url(vault_path)
    _engine = create_async_engine(database_url, echo=False)
    
    # Регистрируем кастомную SQL-функцию LOWER_RU для регистронезависимого поиска
    # на любых языках (включая кириллицу). Штатный SQLite LOWER() умеет только ASCII.
    from sqlalchemy import event
    
    @event.listens_for(_engine.sync_engine, "connect")
    def _register_unicode_lower(dbapi_conn, conn_record):
        def lower_ru(s):
            return s.lower() if s is not None else None
        dbapi_conn.create_function("LOWER_RU", 1, lower_ru, deterministic=True)
    
    _session_factory = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)
    
    # Запускаем системного "слушателя" папки для iCloud Sync
    vault_observer.start(vault_path)
    
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
    
    # 🛡 Защита от воскрешения удалённого хранилища.
    # Если active_vault указывает на несуществующую папку (юзер удалил её
    # через Finder/Explorer или вынес флешку), НЕ создаём её обратно.
    # Чистим протухший указатель в конфиге и откатываемся на DEFAULT_VAULT
    # как нейтральный плейсхолдер — реальное хранилище пользователь выберет
    # на экране Vault, который теперь откроет wrapper.py (т.к. active_vault пуст).
    if not dev_vault.exists():
        config_data = _load_config()
        if config_data.get("active_vault") == str(dev_vault):
            config_data.pop("active_vault", None)
            active_ws = config_data.get("active_workspaces", {})
            active_ws.pop(str(dev_vault), None)
            _save_config(config_data)
            print(f"[Database] Stale active_vault cleared: {dev_vault}")
        dev_vault = Path(DEFAULT_VAULT)
    
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
