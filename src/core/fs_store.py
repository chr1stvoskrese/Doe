# src/core/fs_store.py
"""
Файловое хранилище доски (формат v2, совместимый с Obsidian).

Структура vault'а:
    MyVault/
      .doe.board.json          ← маркер формата (скрытый)
      .doe.index.db.doe        ← SQLite-индекс (скрытый; доска пересобирается из файлов,
                                  служебные данные — таймеры, SRS, автоматизации — живут тут)
      doe/                     ← вложения (как раньше)
      <Вкладка>/               ← workspace = папка
        .doe.json              ← {id, position, name?}
        <Колонка>/             ← column = папка
          .doe.json            ← {id, position, mode, collapsed, width, name?}
          <Заметка>.md         ← task: YAML frontmatter + описание

Принципы:
- Файлы и папки — ЕДИНСТВЕННЫЙ источник правды для вкладок/колонок/карточек.
  SQLite-индекс пересобирается из них при каждом открытии (reconcile).
- Запись сквозная: каждый commit SQLAlchemy зеркалируется в файлы
  (хуки after_flush/after_commit → асинхронный воркер).
- Правки извне (Obsidian) подхватывает watcher → reconcile → WebSocket.
- Служебные таблицы (timer_sessions, memory_items, automations) остаются
  только в индексе и привязаны к карточкам по стабильным doe_id.
- Шифрование не затрагивается: lock_vault/unlock_vault и так работают
  пофайлово и рекурсивно, структура папок восстанавливается из контейнеров.

Безопасность данных:
- Удаления в БД при reconcile выполняются ТОЛЬКО если маркер .doe.board.json
  на месте, нет зашифрованных контейнеров и нет iCloud-заглушек (*.icloud).
  Иначе — недеструктивный режим (только добавления/обновления).
- Файлы перезаписываются только при реальном изменении содержимого.
"""

import asyncio
import json
import os
import re
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import yaml
from sqlalchemy import event, select
from sqlalchemy.orm import Session, selectinload

from src.db.models import (
    WorkspaceModel,
    ColumnModel,
    TaskModel,
    ColumnMode,
)

MARKER_NAME = ".doe.board.json"
FOLDER_META_NAME = ".doe.json"
FORMAT_VERSION = 2

# Папки в корне vault'а, которые никогда не считаются вкладками
_EXCLUDED_ROOT_DIRS = {"doe", "__pycache__"}

# ============================================================
#  Глобальное состояние (одно активное хранилище на процесс)
# ============================================================
_vault: Optional[Path] = None
_session_factory = None          # async_sessionmaker
_sync_engine = None              # для фильтрации чужих сессий в хуках
_loop: Optional[asyncio.AbstractEventLoop] = None

_suspended = 0                   # >0 → хуки не собирают изменения (идёт reconcile/export_all)
_fs_lock = asyncio.Lock()        # сериализация reconcile/export/flush

# Реестр путей: ("ws"|"col"|"task", id) -> Path
_registry: dict[tuple, Path] = {}

# Очередь сквозной записи (наполняется в after_commit)
_pending_up: set = set()         # {(kind, id)}
_pending_del: list = []          # [(kind, id, Path)]
_pending_event: Optional[asyncio.Event] = None
_worker_task: Optional[asyncio.Task] = None

# Пути, недавно записанные самим приложением (подавление эха для watcher'а)
_self_writes: dict[str, float] = {}
_SELF_WRITE_WINDOW = 4.0  # секунд


def is_active() -> bool:
    return _vault is not None


def get_vault() -> Optional[Path]:
    return _vault


# ============================================================
#  Подавление эха собственных записей
# ============================================================
def _mark_self(path: Path) -> None:
    now = time.monotonic()
    _self_writes[str(path)] = now
    # Лёгкая уборка устаревших записей
    if len(_self_writes) > 2048:
        cutoff = now - _SELF_WRITE_WINDOW
        for k in [k for k, v in _self_writes.items() if v < cutoff]:
            _self_writes.pop(k, None)


def is_self_event(path: str) -> bool:
    """True, если путь (или его родитель) недавно записан самим приложением."""
    now = time.monotonic()
    p = Path(path)
    for candidate in [p, *p.parents]:
        t = _self_writes.get(str(candidate))
        if t is not None and now - t < _SELF_WRITE_WINDOW:
            return True
        if _vault is not None and candidate == _vault:
            break
    return False


# ============================================================
#  Имена файлов и папок
# ============================================================
_INVALID_CHARS = re.compile(r'[\\/:*?"<>|\x00-\x1f]')
_WIN_RESERVED = {
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}


def _sanitize(name: str) -> str:
    s = _INVALID_CHARS.sub("", str(name or "")).strip()
    s = s.lstrip(".").rstrip(". ")
    if s.upper() in _WIN_RESERVED:
        s += "_"
    return s[:120].strip()


def _stem_matches_title(stem: str, title: str) -> bool:
    """Совпадает ли имя на диске с заголовком (учитывая суффикс ' (N)')."""
    san = _sanitize(title)
    if not san:
        return False
    if stem == san:
        return True
    return re.fullmatch(re.escape(san) + r" \(\d+\)", stem) is not None


def _unique_name(parent: Path, base: str, ext: str, self_path: Optional[Path]) -> str:
    """Свободное имя в папке: 'base', 'base (2)', 'base (3)'..."""
    if not base:
        base = "Untitled"
    taken = set()
    if parent.exists():
        for child in parent.iterdir():
            if self_path is not None and child == self_path:
                continue
            taken.add(child.name.lower())
    # Занятые реестром цели (ещё не созданные на диске)
    for key, rp in _registry.items():
        if rp.parent == parent and rp != self_path:
            taken.add(rp.name.lower())
    candidate = f"{base}{ext}"
    n = 2
    while candidate.lower() in taken:
        candidate = f"{base} ({n}){ext}"
        n += 1
    return candidate


# ============================================================
#  Дата-время (naive UTC в БД ↔ ISO-строки с 'Z' в файлах)
# ============================================================
def _dt_out(dt) -> Optional[str]:
    if not dt:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt.isoformat(timespec="seconds") + "Z"


def _dt_in(val) -> Optional[datetime]:
    if val is None or val == "":
        return None
    if isinstance(val, datetime):
        if val.tzinfo is not None:
            return val.astimezone(timezone.utc).replace(tzinfo=None)
        return val
    try:
        s = str(val).strip()
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt
    except Exception:
        return None


# ============================================================
#  Frontmatter (.md) и метафайлы папок (.doe.json)
# ============================================================
_FM_OPEN = re.compile(r"^---\s*\r?\n")


def _serialize_task(task: TaskModel, parent_ids: list[int], filename_stem: str) -> str:
    fm: dict = {"doe_id": task.id}
    if not _stem_matches_title(filename_stem, task.title):
        fm["title"] = task.title
    elif _sanitize(task.title) != task.title or filename_stem != _sanitize(task.title):
        # Имя на диске отличается от заголовка (символы вырезаны / суффикс (N))
        fm["title"] = task.title
    fm["position"] = float(task.position or 0.0)
    if task.created_at:
        fm["created"] = _dt_out(task.created_at)
    if task.updated_at:
        fm["updated"] = _dt_out(task.updated_at)
    if task.completed_at:
        fm["completed"] = _dt_out(task.completed_at)
    if task.due_date:
        fm["due"] = _dt_out(task.due_date)
    if task.priority is not None:
        fm["priority"] = float(task.priority)
    if task.priority_data:
        fm["priority_data"] = task.priority_data
    if task.is_visible_on_board:
        fm["visible_on_board"] = True
    if task.folded_headings:
        fm["folded_headings"] = task.folded_headings
    if task.attachments_order:
        fm["attachments_order"] = task.attachments_order
    if parent_ids:
        fm["parents"] = sorted(parent_ids)

    yaml_text = yaml.safe_dump(
        fm, allow_unicode=True, sort_keys=False, default_flow_style=False
    )
    body = task.description or ""
    return f"---\n{yaml_text}---\n{body}"


def parse_md(text: str) -> tuple[dict, str]:
    """Возвращает (frontmatter, body). При битом YAML пытается спасти doe_id."""
    if not _FM_OPEN.match(text):
        return {}, text
    m = re.search(r"\r?\n---\s*(\r?\n|$)", text)
    if not m:
        return {}, text
    head = text[text.index("\n") + 1 : m.start()]
    body = text[m.end():]
    try:
        fm = yaml.safe_load(head)
        if not isinstance(fm, dict):
            fm = {}
        return fm, body
    except Exception:
        # YAML сломан руками — не теряем привязку к карточке
        fm = {}
        id_m = re.search(r"^doe_id:\s*(\d+)\s*$", head, re.M)
        if id_m:
            fm["doe_id"] = int(id_m.group(1))
        return fm, body


def _read_json(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _write_text(path: Path, content: str) -> None:
    """Атомарная запись с отметкой self-write. Пишем только при изменении."""
    try:
        if path.exists() and path.read_text(encoding="utf-8") == content:
            return
    except Exception:
        pass
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".doetmp")
    tmp.write_text(content, encoding="utf-8")
    _mark_self(path)
    _mark_self(path.parent)
    os.replace(tmp, path)


def _write_json(path: Path, data: dict) -> None:
    _write_text(path, json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def write_marker() -> None:
    if _vault is None:
        return
    _write_json(_vault / MARKER_NAME, {"app": "Doe", "format": FORMAT_VERSION})
    if os.name == "nt":
        try:
            import ctypes
            ctypes.windll.kernel32.SetFileAttributesW(str(_vault / MARKER_NAME), 0x02)
        except Exception:
            pass


def has_board_marker(vault_path: str) -> bool:
    try:
        return (Path(vault_path) / MARKER_NAME).exists()
    except Exception:
        return False


# ============================================================
#  Экспорт сущностей БД → файлы
# ============================================================
def _folder_meta_for_ws(ws: WorkspaceModel, folder_name: str) -> dict:
    meta = {"id": ws.id, "position": float(ws.position or 0.0)}
    if not _stem_matches_title(folder_name, ws.name):
        meta["name"] = ws.name
    elif folder_name != ws.name:
        meta["name"] = ws.name
    return meta


def _folder_meta_for_col(col: ColumnModel, folder_name: str) -> dict:
    meta = {
        "id": col.id,
        "position": float(col.position or 0.0),
        "mode": col.mode.value if col.mode else "default",
        "collapsed": bool(col.collapsed),
    }
    if col.width is not None:
        meta["width"] = col.width
    if not _stem_matches_title(folder_name, col.title):
        meta["name"] = col.title
    elif folder_name != col.title:
        meta["name"] = col.title
    return meta


def _place_folder(key: tuple, parent: Path, title: str) -> Path:
    """Гарантирует папку для сущности: создаёт или переименовывает при смене названия."""
    current = _registry.get(key)
    if current is not None and current.exists() and current.parent == parent:
        if _stem_matches_title(current.name, title):
            return current  # имя актуально (возможно, с суффиксом (N)) — не трогаем
        new_name = _unique_name(parent, _sanitize(title) or f"Folder_{key[1]}", "", current)
        target = parent / new_name
        _mark_self(current)
        _mark_self(target)
        _mark_self(parent)
        current.rename(target)
        _rebase_registry(current, target)
        _registry[key] = target
        return target
    # Новая папка (или реестр пуст)
    name = _unique_name(parent, _sanitize(title) or f"Folder_{key[1]}", "", None)
    target = parent / name
    _mark_self(target)
    _mark_self(parent)
    target.mkdir(parents=True, exist_ok=True)
    _registry[key] = target
    return target


def _rebase_registry(old_base: Path, new_base: Path) -> None:
    """После переименования папки обновляем пути детей в реестре."""
    for k, p in list(_registry.items()):
        try:
            rel = p.relative_to(old_base)
        except ValueError:
            continue
        _registry[k] = new_base / rel


def _export_workspace(ws: WorkspaceModel) -> Path:
    folder = _place_folder(("ws", ws.id), _vault, ws.name)
    _write_json(folder / FOLDER_META_NAME, _folder_meta_for_ws(ws, folder.name))
    return folder


def _export_column(col: ColumnModel, ws_folder: Path) -> Path:
    folder = _place_folder(("col", col.id), ws_folder, col.title)
    _write_json(folder / FOLDER_META_NAME, _folder_meta_for_col(col, folder.name))
    return folder


def _export_task(task: TaskModel, parent_ids: list[int], col_folder: Path) -> Path:
    key = ("task", task.id)
    current = _registry.get(key)
    base = _sanitize(task.title) or f"Card_{task.id}"

    if current is not None and current.exists():
        target = current
        if current.parent != col_folder or not _stem_matches_title(current.stem, task.title):
            new_name = _unique_name(col_folder, base, ".md", current)
            target = col_folder / new_name
            _mark_self(current)
            _mark_self(target)
            _mark_self(current.parent)
            _mark_self(col_folder)
            col_folder.mkdir(parents=True, exist_ok=True)
            os.replace(current, target)
        _registry[key] = target
    else:
        name = _unique_name(col_folder, base, ".md", None)
        target = col_folder / name
        _registry[key] = target

    _write_text(target, _serialize_task(task, parent_ids, target.stem))
    return target


def _delete_path(key: tuple) -> None:
    path = _registry.pop(key, None)
    if path is None or _vault is None:
        return
    try:
        path.relative_to(_vault)  # страховка: удаляем только внутри vault'а
    except ValueError:
        return
    _mark_self(path)
    _mark_self(path.parent)
    try:
        if key[0] == "task":
            path.unlink(missing_ok=True)
        else:
            if path.is_dir():
                shutil.rmtree(path, ignore_errors=True)
            # Дочерние записи реестра больше не актуальны
            for k, p in list(_registry.items()):
                try:
                    p.relative_to(path)
                    _registry.pop(k, None)
                except ValueError:
                    pass
    except Exception as e:
        print(f"[FSStore] ❌ Failed to delete {path}: {e}")


async def export_all(session) -> None:
    """Материализует ВСЮ доску из БД в файлы (идемпотентно, без лишних записей)."""
    if _vault is None:
        return
    global _suspended
    _suspended += 1
    try:
        ws_rows = (
            (await session.execute(select(WorkspaceModel).order_by(WorkspaceModel.position)))
            .scalars().all()
        )
        col_rows = (
            (await session.execute(select(ColumnModel).order_by(ColumnModel.position)))
            .scalars().all()
        )
        task_rows = (
            (await session.execute(
                select(TaskModel).options(selectinload(TaskModel.parents))
            )).scalars().all()
        )
        ws_folders: dict[int, Path] = {}
        for ws in ws_rows:
            ws_folders[ws.id] = _export_workspace(ws)
        col_folders: dict[int, Path] = {}
        for col in col_rows:
            parent = ws_folders.get(col.workspace_id)
            if parent is None:
                continue
            col_folders[col.id] = _export_column(col, parent)
        for task in task_rows:
            folder = col_folders.get(task.column_id)
            if folder is None:
                continue
            _export_task(task, [p.id for p in task.parents], folder)
        write_marker()
    finally:
        _suspended -= 1


# ============================================================
#  Сканирование vault'а (файлы → снимок структуры)
# ============================================================
def _scan_vault() -> Optional[dict]:
    """
    Снимок структуры. None → сканировать нельзя (vault зашифрован/переходное состояние).
    Возвращает {"destructive": bool, "workspaces": [...]}.
    """
    if _vault is None or not _vault.exists():
        return None

    destructive = has_board_marker(str(_vault))
    workspaces = []
    icloud_placeholders = False

    try:
        root_entries = sorted(_vault.iterdir(), key=lambda p: p.name.lower())
    except Exception:
        return None

    for entry in root_entries:
        if entry.name.endswith(".doelock"):
            return None  # идёт шифрование/расшифровка — не трогаем БД
        if entry.name.endswith(".icloud"):
            icloud_placeholders = True

    for ws_dir in root_entries:
        if not ws_dir.is_dir() or ws_dir.is_symlink():
            continue
        if ws_dir.name.startswith(".") or ws_dir.name.startswith("_"):
            continue
        if ws_dir.name in _EXCLUDED_ROOT_DIRS:
            continue

        ws_meta = _read_json(ws_dir / FOLDER_META_NAME)
        columns = []
        try:
            children = sorted(ws_dir.iterdir(), key=lambda p: p.name.lower())
        except Exception:
            children = []

        for col_dir in children:
            if col_dir.name.endswith(".icloud"):
                icloud_placeholders = True
            if not col_dir.is_dir() or col_dir.is_symlink() or col_dir.name.startswith("."):
                continue
            col_meta = _read_json(col_dir / FOLDER_META_NAME)
            tasks = []
            try:
                files = sorted(col_dir.iterdir(), key=lambda p: p.name.lower())
            except Exception:
                files = []
            for f in files:
                if f.name.endswith(".icloud"):
                    icloud_placeholders = True
                if not f.is_file() or f.suffix.lower() != ".md":
                    continue
                if f.name.startswith("._") or f.name.startswith("."):
                    continue
                try:
                    text = f.read_text(encoding="utf-8")
                except Exception:
                    # Нечитаемый файл — не считаем его отсутствующим
                    icloud_placeholders = True
                    continue
                fm, body = parse_md(text)
                tasks.append({"path": f, "fm": fm, "body": body, "stem": f.stem})
            columns.append({"path": col_dir, "meta": col_meta, "name": col_dir.name, "tasks": tasks})
        workspaces.append({"path": ws_dir, "meta": ws_meta, "name": ws_dir.name, "columns": columns})

    if icloud_placeholders:
        destructive = False  # часть файлов не скачана — удалять из БД нельзя

    return {"destructive": destructive, "workspaces": workspaces}


def _display_name(meta_name, disk_name: str) -> str:
    """Название сущности: из меты, если оно соответствует имени на диске, иначе — имя на диске."""
    if meta_name and _stem_matches_title(disk_name, str(meta_name)):
        return str(meta_name)
    return disk_name


def _rewrite_task_id(path: Path, fm: dict, body: str, new_id: int) -> None:
    fm = dict(fm)
    fm["doe_id"] = new_id
    yaml_text = yaml.safe_dump(fm, allow_unicode=True, sort_keys=False, default_flow_style=False)
    _write_text(path, f"---\n{yaml_text}---\n{body}")


# ============================================================
#  Reconcile: файлы → БД (файлы — источник правды)
# ============================================================
async def reconcile(session) -> bool:
    """Синхронизирует БД со структурой папок. True, если синхронизация выполнена."""
    if _vault is None:
        return False
    global _suspended
    async with _fs_lock:
        _suspended += 1
        try:
            snapshot = _scan_vault()
            if snapshot is None:
                return False
            await _apply_snapshot(session, snapshot)
            return True
        finally:
            _suspended -= 1


async def _apply_snapshot(session, snapshot: dict) -> None:
    destructive = snapshot["destructive"]

    db_ws = {w.id: w for w in (await session.execute(select(WorkspaceModel))).scalars()}
    db_col = {c.id: c for c in (await session.execute(select(ColumnModel))).scalars()}
    db_task = {
        t.id: t
        for t in (
            await session.execute(select(TaskModel).options(selectinload(TaskModel.parents)))
        ).scalars()
    }

    seen_ws, seen_col, seen_task = set(), set(), set()
    new_registry: dict[tuple, Path] = {}
    pending_parents: list[tuple[TaskModel, list]] = []
    id_rewrites: list[tuple[Path, dict, str, TaskModel]] = []

    for ws_idx, ws_node in enumerate(snapshot["workspaces"]):
        meta = ws_node["meta"]
        ws_id = meta.get("id")
        ws = db_ws.get(ws_id) if isinstance(ws_id, int) else None
        if ws is not None and ws.id in seen_ws:
            ws = None  # дубликат меты (скопированная папка) → новая вкладка
        name = _display_name(meta.get("name"), ws_node["name"])
        position = meta.get("position")
        if not isinstance(position, (int, float)):
            position = float(ws_idx + 1)

        if ws is None:
            ws = WorkspaceModel(name=name, position=float(position))
            session.add(ws)
            await session.flush()
            _write_json(ws_node["path"] / FOLDER_META_NAME, _folder_meta_for_ws(ws, ws_node["name"]))
        else:
            ws.name = name
            ws.position = float(position)
        seen_ws.add(ws.id)
        new_registry[("ws", ws.id)] = ws_node["path"]

        for col_idx, col_node in enumerate(ws_node["columns"]):
            cmeta = col_node["meta"]
            col_id = cmeta.get("id")
            col = db_col.get(col_id) if isinstance(col_id, int) else None
            if col is not None and col.id in seen_col:
                col = None
            title = _display_name(cmeta.get("name"), col_node["name"])
            cpos = cmeta.get("position")
            if not isinstance(cpos, (int, float)):
                cpos = float(col_idx + 1)
            try:
                mode = ColumnMode(cmeta.get("mode", "default"))
            except ValueError:
                mode = ColumnMode.DEFAULT
            width = cmeta.get("width")
            if not isinstance(width, (int, float)):
                width = None
            collapsed = bool(cmeta.get("collapsed", False))

            if col is None:
                col = ColumnModel(
                    title=title, position=float(cpos), mode=mode,
                    collapsed=collapsed, width=width, workspace_id=ws.id,
                )
                session.add(col)
                await session.flush()
                _write_json(col_node["path"] / FOLDER_META_NAME, _folder_meta_for_col(col, col_node["name"]))
            else:
                col.title = title
                col.position = float(cpos)
                col.mode = mode
                col.collapsed = collapsed
                col.width = width
                col.workspace_id = ws.id
            seen_col.add(col.id)
            new_registry[("col", col.id)] = col_node["path"]

            for t_idx, t_node in enumerate(col_node["tasks"]):
                fm = t_node["fm"]
                t_id = fm.get("doe_id")
                task = db_task.get(t_id) if isinstance(t_id, int) else None
                if task is not None and task.id in seen_task:
                    task = None  # скопированный файл → новая карточка с новым id

                title_fm = fm.get("title")
                if title_fm and _stem_matches_title(t_node["stem"], str(title_fm)):
                    t_title = str(title_fm)
                else:
                    t_title = t_node["stem"]
                tpos = fm.get("position")
                if not isinstance(tpos, (int, float)):
                    tpos = float(t_idx + 1)
                body = t_node["body"]
                description = body if body.strip() else None
                priority = fm.get("priority")
                if not isinstance(priority, (int, float)):
                    priority = None
                p_data = fm.get("priority_data")
                if not isinstance(p_data, dict):
                    p_data = None
                folded = fm.get("folded_headings")
                if not isinstance(folded, list):
                    folded = []
                att_order = fm.get("attachments_order")
                if not isinstance(att_order, list):
                    att_order = []
                parents_fm = fm.get("parents")
                if not isinstance(parents_fm, list):
                    parents_fm = []

                if task is None:
                    task = TaskModel(
                        title=t_title,
                        description=description,
                        column_id=col.id,
                        position=float(tpos),
                        created_at=_dt_in(fm.get("created")) or datetime.utcnow(),
                        updated_at=_dt_in(fm.get("updated")) or datetime.utcnow(),
                        completed_at=_dt_in(fm.get("completed")),
                        due_date=_dt_in(fm.get("due")),
                        priority=float(priority) if priority is not None else None,
                        priority_data=p_data,
                        is_visible_on_board=bool(fm.get("visible_on_board", False)),
                        folded_headings=folded,
                        attachments_order=att_order,
                    )
                    session.add(task)
                    await session.flush()
                    id_rewrites.append((t_node["path"], fm, body, task))
                else:
                    task.title = t_title
                    task.description = description
                    task.column_id = col.id
                    task.position = float(tpos)
                    task.completed_at = _dt_in(fm.get("completed"))
                    task.due_date = _dt_in(fm.get("due"))
                    task.priority = float(priority) if priority is not None else None
                    task.priority_data = p_data
                    task.is_visible_on_board = bool(fm.get("visible_on_board", False))
                    task.folded_headings = folded
                    task.attachments_order = att_order
                    upd = _dt_in(fm.get("updated"))
                    if upd is not None:
                        task.updated_at = upd
                seen_task.add(task.id)
                new_registry[("task", task.id)] = t_node["path"]
                pending_parents.append((task, parents_fm))

    # Второй проход: графовые связи (родители могли получить id только сейчас)
    all_tasks = {t.id: t for t in db_task.values() if t.id in seen_task}
    for task, _ in pending_parents:
        all_tasks[task.id] = task
    for task, parents_fm in pending_parents:
        wanted = sorted({int(p) for p in parents_fm
                         if isinstance(p, (int, float)) and int(p) in all_tasks and int(p) != task.id})
        current = sorted(p.id for p in task.parents)
        if wanted != current:
            task.parents = [all_tasks[i] for i in wanted]

    # Удаления — только в деструктивном режиме (см. _scan_vault)
    if destructive:
        for t_id, task in db_task.items():
            if t_id not in seen_task:
                await session.delete(task)
        for c_id, col in db_col.items():
            if c_id not in seen_col:
                await session.delete(col)
        for w_id, ws in db_ws.items():
            if w_id not in seen_ws:
                await session.delete(ws)

    await session.commit()

    # id для новых файлов дописываем ПОСЛЕ commit'а (id уже стабильны)
    for path, fm, body, task in id_rewrites:
        try:
            _rewrite_task_id(path, fm, body, task.id)
        except Exception as e:
            print(f"[FSStore] Failed to write id back to {path.name}: {e}")

    global _registry
    _registry = new_registry
    print(f"[FSStore] Reconcile done: {len(seen_ws)} tab(s), {len(seen_col)} column(s), "
          f"{len(seen_task)} card(s){' [destructive]' if destructive else ' [additive]'}")


async def resync() -> bool:
    """Полная пересинхронизация (для watcher'а): файлы → БД."""
    if _session_factory is None:
        return False
    async with _session_factory() as session:
        return await reconcile(session)


# ============================================================
#  Сквозная запись: SQLAlchemy-хуки → очередь → воркер
# ============================================================
_KIND_MAP = {WorkspaceModel: "ws", ColumnModel: "col", TaskModel: "task"}


def _kind_of(obj) -> Optional[str]:
    return _KIND_MAP.get(type(obj))


@event.listens_for(Session, "after_flush")
def _hook_after_flush(session, flush_context):
    if _vault is None or _suspended or _sync_engine is None:
        return
    if session.bind is not _sync_engine:
        return
    stash = session.info.setdefault("_doe_fs", {"up": set(), "del": []})
    for obj in list(session.new) + list(session.dirty):
        kind = _kind_of(obj)
        if kind and obj.id is not None:
            stash["up"].add((kind, obj.id))
    for obj in session.deleted:
        kind = _kind_of(obj)
        if kind and obj.id is not None:
            stash["del"].append((kind, obj.id))


@event.listens_for(Session, "after_commit")
def _hook_after_commit(session):
    stash = session.info.pop("_doe_fs", None)
    if not stash or _vault is None:
        return
    deleted_ids = {d for d in stash["del"]}
    _pending_del.extend(stash["del"])
    for item in stash["up"]:
        if item not in deleted_ids:
            _pending_up.add(item)
    if _pending_event is not None and _loop is not None:
        _loop.call_soon_threadsafe(_pending_event.set)


@event.listens_for(Session, "after_rollback")
def _hook_after_rollback(session):
    session.info.pop("_doe_fs", None)


async def _flush_pending() -> None:
    """Применяет накопленные изменения БД к файлам."""
    if _vault is None or _session_factory is None:
        return
    async with _fs_lock:
        dels = list(_pending_del)
        ups = list(_pending_up)
        _pending_del.clear()
        _pending_up.clear()
        if not dels and not ups:
            return

        # Сначала удаления (по старым путям из реестра)
        order = {"task": 0, "col": 1, "ws": 2}
        for kind, obj_id in sorted(dels, key=lambda d: order[d[0]]):
            _delete_path((kind, obj_id))

        if not ups:
            return
        prio = {"ws": 0, "col": 1, "task": 2}
        ups.sort(key=lambda u: prio[u[0]])
        try:
            async with _session_factory() as session:
                for kind, obj_id in ups:
                    try:
                        if kind == "ws":
                            ws = await session.get(WorkspaceModel, obj_id)
                            if ws is not None:
                                _export_workspace(ws)
                        elif kind == "col":
                            col = await session.get(ColumnModel, obj_id)
                            if col is not None:
                                ws_folder = await _ensure_ws_folder(session, col.workspace_id)
                                if ws_folder is not None:
                                    _export_column(col, ws_folder)
                        else:
                            res = await session.execute(
                                select(TaskModel)
                                .options(selectinload(TaskModel.parents))
                                .where(TaskModel.id == obj_id)
                            )
                            task = res.scalar_one_or_none()
                            if task is not None:
                                col_folder = await _ensure_col_folder(session, task.column_id)
                                if col_folder is not None:
                                    _export_task(task, [p.id for p in task.parents], col_folder)
                    except Exception as e:
                        print(f"[FSStore] ❌ Export failed for {kind}#{obj_id}: {e}")
        except Exception as e:
            print(f"[FSStore] ❌ Flush failed: {e}")


async def _ensure_ws_folder(session, ws_id: int) -> Optional[Path]:
    folder = _registry.get(("ws", ws_id))
    if folder is not None and folder.exists():
        return folder
    ws = await session.get(WorkspaceModel, ws_id)
    if ws is None:
        return None
    return _export_workspace(ws)


async def _ensure_col_folder(session, col_id: int) -> Optional[Path]:
    folder = _registry.get(("col", col_id))
    if folder is not None and folder.exists():
        return folder
    col = await session.get(ColumnModel, col_id)
    if col is None:
        return None
    ws_folder = await _ensure_ws_folder(session, col.workspace_id)
    if ws_folder is None:
        return None
    return _export_column(col, ws_folder)


async def _worker() -> None:
    while True:
        await _pending_event.wait()
        _pending_event.clear()
        await asyncio.sleep(0.25)  # коалесценция серии commit'ов
        try:
            await _flush_pending()
        except Exception as e:
            print(f"[FSStore] Worker error: {e}")


# ============================================================
#  Жизненный цикл
# ============================================================
def init(vault_path: str, session_factory, engine) -> None:
    """Активирует файловое хранилище для vault'а. Вызывается из init_database."""
    global _vault, _session_factory, _sync_engine, _loop, _pending_event, _worker_task
    _vault = Path(vault_path)
    _session_factory = session_factory
    _sync_engine = engine.sync_engine
    _registry.clear()
    _pending_up.clear()
    _pending_del.clear()
    _self_writes.clear()
    try:
        _loop = asyncio.get_running_loop()
    except RuntimeError:
        _loop = None
    _pending_event = asyncio.Event()
    if _worker_task is None or _worker_task.done():
        _worker_task = asyncio.ensure_future(_worker())
    print(f"[FSStore] Activated for vault: {vault_path}")


async def shutdown() -> None:
    """Останавливает воркер, дописывает всё накопленное на диск."""
    global _vault, _session_factory, _sync_engine, _worker_task, _pending_event
    if _worker_task is not None:
        _worker_task.cancel()
        try:
            await _worker_task
        except (asyncio.CancelledError, Exception):
            pass
        _worker_task = None
    try:
        if _vault is not None and _session_factory is not None:
            await _flush_pending()
    except Exception as e:
        print(f"[FSStore] Final flush failed: {e}")
    _vault = None
    _session_factory = None
    _sync_engine = None
    _pending_event = None
    _registry.clear()
    print("[FSStore] Deactivated")
