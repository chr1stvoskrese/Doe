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
)
import shutil
from src.core.watcher import vault_observer # <-- ИМПОРТ НАШЕГО WATCHER'A
from src.core import vault_crypto
from src.core import fs_store

_engine = None
_session_factory = None

# Состояние фоновой инициализации при старте приложения:
# 'starting' → 'ready' | 'no_vault' | 'error'
# Позволяет серверу начать отвечать МГНОВЕННО (окно приложения появляется
# сразу с прогресс-баром), пока миграции/инициализация большого хранилища
# идут в фоне. Фронтенд ждёт готовности через /system/startup-status.
startup_state = {"state": "starting"}

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


# Имя скрытого SQLite-индекса нового (файлового) формата хранилища.
# Оканчивается на .db.doe, поэтому вся существующая логика обнаружения
# хранилищ (vault picker, notify_worker, wrapper) продолжает работать.
INDEX_DB_NAME = ".doe.index.db.doe"

# ============================================================
#  Режимы представления данных хранилища
# ============================================================
# STORAGE_FILES ("files") — формат v2: папки/.md — источник правды,
#   SQLite живёт скрытым индексом .doe.index.db.doe. Признак — маркер
#   .doe.board.json в корне хранилища.
# STORAGE_DB ("db") — вся доска в одном видимом файле <Имя>.db.doe,
#   папки/markdown не материализуются. Признак — отсутствие маркера.
STORAGE_FILES = "files"
STORAGE_DB = "db"

# Режим текущего ОТКРЫТОГО хранилища (выставляется в init_database)
_storage_mode: str | None = None


def detect_storage_mode(vault_path: str) -> str:
    """Определяет режим хранилища по маркеру .doe.board.json."""
    return STORAGE_FILES if fs_store.has_board_marker(vault_path) else STORAGE_DB


def get_storage_mode() -> str | None:
    """Режим текущего открытого хранилища (None, если БД закрыта)."""
    return _storage_mode


def _visible_db_path(vault_dir: Path) -> Path:
    """Путь к видимому одиночному файлу БД: <ИмяХранилища>.db.doe."""
    return vault_dir / f"{vault_dir.resolve().name}.db.doe"


def _move_db_with_sidecars(src: Path, dst: Path) -> Path:
    """Переименовывает файл БД вместе с -wal/-shm. Возвращает итоговый путь."""
    try:
        for sfx in ("-wal", "-shm"):
            side = Path(str(src) + sfx)
            if side.exists():
                side.rename(Path(str(dst) + sfx))
        src.rename(dst)
        print(f"[Database] 🔄 DB file moved: {src.name} -> {dst.name}")
        return dst
    except Exception as e:
        print(f"[Database] ❌ Failed to move DB file ({src.name} -> {dst.name}): {e}")
        return src  # Фолбэк на исходный файл, если нет прав


def _resolve_db_path(vault_path: str, storage_mode: str | None = None) -> Path:
    """
    Возвращает путь к рабочему файлу БД для данного хранилища.

    В режиме STORAGE_FILES (v2) БД живёт скрытым индексом .doe.index.db.doe;
    старые видимые файлы БД бесшовно переносятся на роль скрытого индекса.
    В режиме STORAGE_DB БД — видимый одиночный файл <Имя>.db.doe; скрытый
    индекс (после конвертации из v2) переименовывается в видимый файл.
    """
    vault_dir = Path(vault_path)
    index_db = vault_dir / INDEX_DB_NAME
    mode = storage_mode or detect_storage_mode(vault_path)

    def _newest(files):
        return max(files, key=lambda p: p.stat().st_mtime)

    # Видимые рабочие БД *.db.doe (не бэкапы, не скрытый индекс, не мусор macOS)
    visible = [f for f in vault_dir.glob("*.db.doe")
               if not _is_backup_file(f) and not f.name.startswith("._") and f.name != INDEX_DB_NAME]

    if mode == STORAGE_DB:
        target = _visible_db_path(vault_dir)
        # 1. Видимый файл уже есть — работаем с ним как есть
        if visible:
            return _newest(visible)
        # 2. Остался скрытый индекс (конвертация из формата папок) — делаем видимым
        if index_db.exists():
            return _move_db_with_sidecars(index_db, target)
        # 3. Совсем старые форматы — принимаем под каноничным видимым именем
        for pattern, extra_filter in (("*.doe.db", None), ("*.db", "legacy")):
            cands = [f for f in vault_dir.glob(pattern) if not f.name.startswith("._")]
            if extra_filter == "legacy":
                cands = [f for f in cands if not f.name.endswith(".db.doe")
                         and not f.name.endswith(".backup.db") and not f.name.endswith(".doe.db")]
            if cands:
                return _move_db_with_sidecars(_newest(cands), target)
        # 4. Файлов нет (создание нового хранилища в режиме одного файла)
        print(f"[Database] No existing DB found. Targeting new single file: {target.name}")
        return target

    # --- Режим STORAGE_FILES (v2): скрытый индекс ---
    # 0. Скрытый индекс уже существует
    if index_db.exists():
        return index_db

    def _adopt(old_db: Path) -> Path:
        """Перенос старой БД на роль скрытого индекса (вместе с -wal/-shm)."""
        return _move_db_with_sidecars(old_db, index_db)

    # 1. Рабочая БД старого формата *.db.doe
    if visible:
        return _adopt(_newest(visible))

    # 2. Совсем старый формат .doe.db
    doe_db_candidates = [f for f in vault_dir.glob("*.doe.db") if not f.name.startswith("._")]
    if doe_db_candidates:
        return _adopt(_newest(doe_db_candidates))

    # 3. Легаси .db (не backup)
    legacy_candidates = [f for f in vault_dir.glob("*.db") if not f.name.endswith(".db.doe") and not f.name.endswith(".backup.db") and not f.name.endswith(".doe.db") and not f.name.startswith("._")]
    if legacy_candidates:
        return _adopt(_newest(legacy_candidates))

    # 4. Файлов нет (создание абсолютно нового хранилища)
    print(f"[Database] No existing DB found. Targeting new index file: {INDEX_DB_NAME}")
    return index_db


def get_database_url(vault_path: str, storage_mode: str | None = None) -> str:
    db_file = _resolve_db_path(vault_path, storage_mode)
    # SQLite-URL с абсолютным путём корректно работает с пробелами и кириллицей.
    # POSIX-разделители безопасны и на Windows.
    return f"sqlite+aiosqlite:///{db_file.as_posix()}"


def run_migrations(vault_path: str, storage_mode: str | None = None):
    alembic_ini_path = BASE_DIR / "alembic.ini"
    alembic_scripts_path = BASE_DIR / "alembic"

    db_file = _resolve_db_path(vault_path, storage_mode)
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

async def init_database(vault_path: str, storage_mode: str | None = None):
    global _engine, _session_factory, _storage_mode

    # 0. Режим представления данных: явный (создание/конвертация) или по маркеру.
    # Фиксируем ДО первых обращений к _resolve_db_path — он от режима зависит.
    mode = storage_mode or detect_storage_mode(vault_path)
    _storage_mode = mode
    print(f"[Database] Storage mode: {mode} ({'папки+markdown' if mode == STORAGE_FILES else 'один файл .db.doe'})")

    # 1. ЗАПУСКАЕМ МИГРАЦИИ ДО ИНИЦИАЛИЗАЦИИ
    # Выполняем в отдельном потоке, чтобы не блокировать async loop
    await asyncio.to_thread(run_migrations, vault_path, mode)

    # 2. Инициализируем async движок приложения
    database_url = get_database_url(vault_path, mode)
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

    # 📁 ФАЙЛОВОЕ ХРАНИЛИЩЕ (формат v2): активируем сквозную запись в .md/папки
    # и пересобираем индекс из файлов — папки и .md-файлы являются источником
    # правды для вкладок/колонок/карточек (полная совместимость с Obsidian).
    # В режиме одного файла (STORAGE_DB) файловое зеркало не активируется:
    # источник правды — сама SQLite-БД.
    if mode == STORAGE_FILES:
        fs_store.init(vault_path, _session_factory, _engine)
        try:
            async with _session_factory() as session:
                await fs_store.reconcile(session)
        except Exception as e:
            # Ошибка синхронизации не должна блокировать открытие хранилища
            print(f"[Database] ⚠️ FS reconcile failed (non-fatal): {e}")

    # ⚠️ ВАЖНО: планировщик автоматизаций здесь НЕ запускаем. Его первый тик
    # выполняется в отдельном потоке со своим event loop и, стартуя параллельно
    # с первыми запросами инициализации, устраивает гонку за создание первого
    # соединения пула SQLAlchemy → дедлок всего lifespan (сервер не отвечает).
    # Запуск делается ПОСЛЕ полной инициализации: в lifespan (main.py)
    # и в switch_vault (вход в хранилище, в т.ч. после ввода пароля).

    # ВНИМАНИЕ: Base.metadata.create_all УБРАНО! Теперь всем рулит Alembic.

    from .models import WorkspaceModel, ColumnModel, ColumnMode
    async with _session_factory() as session:
        # 3. Дефолтное наполнение, если база абсолютно пустая
        # (reconcile выше уже импортировал структуру из файлов, если она есть)
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

    # 📁 Материализуем доску в файлы: после миграции со старого db.doe это
    # создаст всю структуру папок/.md; при обычном открытии — дешёвый no-op
    # (файлы перезаписываются только при реальном изменении содержимого).
    # В режиме одного файла ничего не материализуем и маркер не пишем.
    if mode == STORAGE_FILES:
        try:
            async with _session_factory() as session:
                await fs_store.export_all(session)
        except Exception as e:
            print(f"[Database] ⚠️ FS export failed (non-fatal): {e}")

    # Запускаем системного "слушателя" папки (iCloud Sync + правки из Obsidian).
    # Строго ПОСЛЕ export_all, чтобы не ловить шквал собственных событий.
    vault_observer.start(vault_path)

async def get_session() -> AsyncGenerator[AsyncSession, None]:
    if _session_factory is None:
        # 🔐 Штатная ситуация: хранилище заблокировано/закрыто (экран выбора),
        # а фоновые опросы фронтенда ещё идут. Отвечаем чистым 503 вместо
        # RuntimeError с трейсбеком в логах.
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="DB_NOT_INITIALIZED")
    async with _session_factory() as session:
        yield session

def get_session_factory():
    if _session_factory is None:
        raise RuntimeError("База данных не инициализирована.")
    return _session_factory

def is_database_open() -> bool:
    return _session_factory is not None

async def close_database():
    global _engine, _session_factory, _storage_mode
    _storage_mode = None

    # 📁 Дописываем на диск все накопленные изменения файлового хранилища,
    # пока фабрика сессий ещё жива (иначе последние правки не попадут в .md).
    try:
        await fs_store.shutdown()
    except Exception as e:
        print(f"[Database] FS store shutdown failed: {e}")

    if _engine:
        from sqlalchemy import text
        if _session_factory:
            try:
                async with _session_factory() as session:
                    await session.execute(text("PRAGMA wal_checkpoint(TRUNCATE)"))
                    await session.commit()
            except Exception as e:
                print(f"[Database] WAL Checkpoint failed: {e}")
        
        await _engine.dispose()
        _engine = None
        _session_factory = None
        
        # Гарантированное освобождение файловых дескрипторов SQLite
        import gc
        import asyncio
        gc.collect()
        await asyncio.sleep(0.5) # Даем ОС время снять локи

async def init_dev_database():
    vault_path = get_active_vault()
    if not vault_path:
        return None
        
    dev_vault = Path(vault_path)

    # 🔐 ЗАЩИТА ПАРОЛЕМ: защищённое хранилище НИКОГДА не открывается автоматически.
    # Пароль требуется при каждом входе (даже если после аварийного завершения
    # файлы остались расшифрованными). Ключ сессии живёт только в памяти,
    # поэтому при старте приложения он всегда пуст — уходим на экран выбора.
    if dev_vault.exists() and vault_crypto.is_protected(str(dev_vault)):
        if vault_crypto.get_session_key(str(dev_vault)) is None:
            print(f"[Database] 🔐 Vault is password-protected, waiting for unlock: {dev_vault}")
            return None

    # 🛡 СТРОГАЯ ЗАЩИТА: Если папки нет ИЛИ в ней нет файлов БД (.db.doe / .db.doe.doelock)
    # мы сбрасываем хранилище и возвращаем на экран выбора, чтобы не наплодить фантомов.
    has_db = False
    if dev_vault.exists() and dev_vault.is_dir():
        has_db = any(f for f in dev_vault.iterdir() if f.is_file() and (f.name.endswith(".db.doe") or f.name.endswith(vault_crypto.ENC_SUFFIX)) and "backup" not in f.name and not f.name.startswith("._"))
        # Формат v2: хранилище может состоять из одних .md-файлов (индекс
        # пересоберётся автоматически) — маркер доски тоже признак хранилища.
        if not has_db:
            has_db = fs_store.has_board_marker(str(dev_vault))

    if not has_db:
        config_data = _load_config()
        if config_data.get("active_vault") == str(dev_vault):
            config_data.pop("active_vault", None)
            active_ws = config_data.get("active_workspaces", {})
            active_ws.pop(str(dev_vault), None)
            _save_config(config_data)
            print(f"[Database] Invalid or empty vault cleared from config: {dev_vault}")
        return None # 🛑 НИЧЕГО НЕ СОЗДАЕМ САМИ!
    
    await init_database(str(dev_vault))
    return dev_vault

async def switch_vault(new_vault_path: str, storage_mode: str | None = None):
    global _engine

    # 🔐 Целевое защищённое хранилище нельзя открыть без ключа сессии
    # (ключ появляется только после успешного ввода пароля в /vault/unlock).
    if vault_crypto.is_protected(new_vault_path) and vault_crypto.get_session_key(new_vault_path) is None:
        raise PermissionError("VAULT_LOCKED")

    old_vault = get_active_vault()

    if _engine:
        await close_database()

    # 🔒 Уходим из защищённого хранилища — шифруем его содержимое и забываем ключ
    import os as _os
    is_same = old_vault and _os.path.normpath(old_vault) == _os.path.normpath(new_vault_path)
    if old_vault and not is_same:
        await lock_vault_files(old_vault)

    Path(new_vault_path).mkdir(parents=True, exist_ok=True)
    await init_database(new_vault_path, storage_mode)
    set_active_vault(new_vault_path)
    startup_state["state"] = "ready"

    # Планировщик автоматизаций — строго ПОСЛЕ полной инициализации БД
    try:
        from src.core.config import get_ui_settings
        exts = get_ui_settings().get("extensions", {})
        if exts.get("automations", True):
            from src.services.automation_service import start_scheduler
            start_scheduler(get_session_factory())
    except Exception as e:
        print(f"[Automation] Scheduler start failed (non-fatal): {e}")


async def convert_vault_storage(target_mode: str) -> dict:
    """
    Меняет представление данных АКТИВНОГО хранилища:
      files → db : структура папок/.md и маркер удаляются, скрытый индекс
                   становится видимым одиночным файлом <Имя>.db.doe.
                   Данные не теряются: индекс и есть рабочая БД, файлы —
                   её зеркало. Вложения (папка doe/) не трогаются.
      db → files : видимый файл принимается на роль скрытого индекса,
                   export_all материализует папки/.md и пишет маркер
                   (штатный путь миграции старого формата).
    Возвращает {"mode": ..., "changed": bool}.
    """
    if target_mode not in (STORAGE_FILES, STORAGE_DB):
        raise ValueError(f"Unknown storage mode: {target_mode}")

    vault_path = get_active_vault()
    if not vault_path or not is_database_open():
        raise RuntimeError("NO_ACTIVE_VAULT")

    current = _storage_mode or detect_storage_mode(vault_path)
    if target_mode == current:
        return {"mode": current, "changed": False}

    vault_dir = Path(vault_path)
    print(f"[Database] 🔄 Converting vault storage: {current} → {target_mode} ({vault_path})")

    # Останавливаем watcher и закрываем БД (close_database дожимает очередь
    # fs_store на диск и делает WAL-checkpoint — данные целиком в файле БД).
    try:
        vault_observer.stop()
    except Exception:
        pass
    await close_database()

    if target_mode == STORAGE_DB:
        index_db = vault_dir / INDEX_DB_NAME
        visible_db = [f for f in vault_dir.glob("*.db.doe")
                      if not _is_backup_file(f) and not f.name.startswith("._") and f.name != INDEX_DB_NAME]
        # 🛡 Страховка: удалять файловую структуру можно только когда данные
        # гарантированно есть в БД (скрытый индекс или уже видимый файл).
        if not index_db.exists() and not visible_db:
            await init_database(str(vault_dir), STORAGE_FILES)
            raise RuntimeError("INDEX_DB_MISSING")

        # Удаляем маркер и ТОЛЬКО папки досок (те, что содержат .doe.json).
        # Папка вложений doe/, логи и любые посторонние файлы не трогаются.
        try:
            (vault_dir / fs_store.MARKER_NAME).unlink()
        except OSError:
            pass
        for child in vault_dir.iterdir():
            if (child.is_dir()
                    and child.name not in ("doe", "__pycache__")
                    and (child / fs_store.FOLDER_META_NAME).exists()):
                shutil.rmtree(child, ignore_errors=True)
                print(f"[Database] 🧹 Removed board folder: {child.name}")

    # Переоткрываем хранилище в целевом режиме:
    #  db    → _resolve_db_path переименует скрытый индекс в видимый файл;
    #  files → примет видимый файл как индекс, export_all создаст папки+маркер.
    await init_database(str(vault_dir), target_mode)
    startup_state["state"] = "ready"

    # Планировщик автоматизаций — как в switch_vault, строго после init.
    try:
        exts = get_ui_settings().get("extensions", {})
        if exts.get("automations", True):
            from src.services.automation_service import start_scheduler
            start_scheduler(get_session_factory())
    except Exception as e:
        print(f"[Automation] Scheduler start failed (non-fatal): {e}")

    print(f"[Database] ✅ Vault storage converted to '{target_mode}'")
    return {"mode": target_mode, "changed": True}


async def lock_vault_files(vault_path: str) -> dict:
    """
    Шифрует содержимое хранилища, если оно защищено паролем и ключ сессии ещё в памяти.
    БД к этому моменту должна быть закрыта. Ключ после шифрования сбрасывается.
    """
    if not vault_path:
        return {"locked": False}
    key = vault_crypto.get_session_key(vault_path)
    if key is None or not vault_crypto.is_protected(vault_path):
        return {"locked": False}
    result = await asyncio.to_thread(vault_crypto.lock_vault, vault_path, key)
    vault_crypto.clear_session_key(vault_path)
    return {"locked": True, **result}


async def lock_active_vault() -> dict:
    """
    Полный «выход» из активного хранилища: остановка watcher'а, закрытие БД,
    шифрование файлов (если установлен пароль), сброс ключа сессии.
    Используется при выходе на экран выбора хранилищ и при закрытии приложения.
    """
    vault_path = get_active_vault()
    if not vault_path:
        return {"locked": False}

    protected = vault_crypto.is_protected(vault_path)
    if protected:
        try:
            vault_observer.stop()
        except Exception:
            pass
        if _engine:
            await close_database()
        return await lock_vault_files(vault_path)
    return {"locked": False}
