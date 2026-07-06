# src/core/config.py
import json
import os
from pathlib import Path
from datetime import datetime, timedelta

CONFIG_FILE = Path.home() / ".doe_config.json"

import copy

_config_cache = {"stat": None, "data": None}

# ============================================================
#  Доступные расширения (allowlist, запечённый в сборку build.py)
# ============================================================
# Канонический список ключей расширений. Держать синхронным с фронтендом
# (ext-toggle-<key>) и с EXTENSION_FEATURES в build.py.
ALL_EXTENSION_KEYS = (
    "search", "calendar", "reminders", "graph", "tabs", "deadlines",
    "export", "priority", "ai", "automations", "statistics", "memory", "space",
)

_feature_flags_cache = {"loaded": False, "available": None}

def _bundled_available_extensions():
    """Список доступных расширений из feature_flags.json (запекается build.py).

    Возвращает set ключей, либо None, если файла нет — тогда доступны все
    расширения (обычная сборка / dev-режим, поведение прежнее). Результат
    кэшируется: файл статичен в пределах запуска приложения."""
    if _feature_flags_cache["loaded"]:
        return _feature_flags_cache["available"]

    result = None
    try:
        import sys
        if getattr(sys, "frozen", False):
            base = Path(sys._MEIPASS)
        else:
            # config.py -> core -> src -> корень репозитория
            base = Path(__file__).resolve().parents[2]
        flags_file = base / "feature_flags.json"
        if flags_file.exists():
            with open(flags_file, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            avail = data.get("available")
            if isinstance(avail, list):
                result = {str(x) for x in avail}
    except Exception:
        result = None

    _feature_flags_cache["loaded"] = True
    _feature_flags_cache["available"] = result
    return result

def get_available_extensions() -> list | None:
    """Allowlist в каноническом порядке для отдачи фронтенду (или None)."""
    available = _bundled_available_extensions()
    if available is None:
        return None
    return [k for k in ALL_EXTENSION_KEYS if k in available]

def _load_config() -> dict:
    try:
        st = CONFIG_FILE.stat()
        stat_key = (st.st_mtime_ns, st.st_size)
    except OSError:
        _config_cache["stat"] = None
        _config_cache["data"] = None
        return {}

    if _config_cache["stat"] == stat_key and _config_cache["data"] is not None:
        return copy.deepcopy(_config_cache["data"])

    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        _config_cache["stat"] = stat_key
        _config_cache["data"] = copy.deepcopy(data)
        return data
    except Exception:
        return {}

def _save_config(data: dict) -> None:
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    try:
        st = CONFIG_FILE.stat()
        _config_cache["stat"] = (st.st_mtime_ns, st.st_size)
        _config_cache["data"] = copy.deepcopy(data)
    except OSError:
        _config_cache["stat"] = None
        _config_cache["data"] = None

def get_active_vault() -> str | None:
    data = _load_config()
    return data.get("active_vault")

def set_active_vault(vault_path: str) -> None:
    data = _load_config()
    data["active_vault"] = vault_path
    
    history = data.get("vault_history", [])
    
    cleaned = []
    for item in history:
        if isinstance(item, str):
            if item != vault_path:
                cleaned.append({"path": item, "last_opened": None})
        elif isinstance(item, dict):
            if item.get("path") != vault_path:
                cleaned.append(item)
                
    now_iso = datetime.utcnow().isoformat() + "Z"
    cleaned.insert(0, {"path": vault_path, "last_opened": now_iso})
    
    data["vault_history"] = cleaned[:10]
    _save_config(data)

def remove_vault_from_history(vault_path: str) -> None:
    data = _load_config()
    history = data.get("vault_history", [])
    
    cleaned = []
    for item in history:
        if isinstance(item, str) and item != vault_path:
            cleaned.append(item)
        elif isinstance(item, dict) and item.get("path") != vault_path:
            cleaned.append(item)
            
    data["vault_history"] = cleaned
    
    if data.get("active_vault") == vault_path:
        data.pop("active_vault", None)
        active_ws = data.get("active_workspaces", {})
        if vault_path in active_ws:
            active_ws.pop(vault_path, None)
    
    _save_config(data)

def get_vault_history() -> list[str]:
    data = _load_config()
    return data.get("vault_history", [])

def get_attachments_dir() -> Path:
    data = _load_config()
    custom_path = data.get("global_attachments_path")
    if custom_path and os.path.exists(custom_path):
        return Path(custom_path)
    vault_path = get_active_vault()
    if vault_path:
        return Path(vault_path) / "doe"
    return Path.home() / ".doe_temp_attachments" # Резервный фолбэк

def get_ui_settings() -> dict:
    data = _load_config()
    vault_path = get_active_vault()
    active_workspaces = data.get("active_workspaces", {})
    default_extensions = {"search": True, "calendar": True, "reminders": True, "graph": True, "tabs": True, "deadlines": True, "export": True, "priority": True, "ai": True, "automations": True, "statistics": True, "memory": True, "space": True}

    # Дефолтные настройки запоминания (spaced repetition)
    default_memory = {
        "learning_steps_min": [10, 60, 540],
        "graduating_interval_days": 1.0,
        "easy_interval_days": 4.0,
        "starting_ease": 2.5,
        "surface_on_board": True,
        "os_notification": True,
    }

    # Дефолтные настройки приоритетности
    default_priority = {
        "show_always": False,
        "t_low": 40, "t_mid": 70,
        "e_low": "😞", "e_mid": "😐", "e_high": "🤩", "e_none": "?",
        "c_low": "#D35446", "c_mid": "#B3863A", "c_high": "#89A085", "c_none": "#7C5CB7"
    }

    # Читаем состояние для конкретного хранилища
    vault_states = data.get("vault_states", {})
    state = vault_states.get(vault_path, {})

    # Применяем allowlist сборки: недоступные расширения жёстко выключены и
    # присутствуют в словаре как False, чтобы фронтенд их гарантированно скрыл.
    # Без файла feature_flags.json (обычная сборка/dev) — поведение прежнее.
    stored_exts = data.get("extensions", default_extensions)
    available = _bundled_available_extensions()
    if available is None:
        effective_exts = stored_exts
    else:
        effective_exts = {}
        for k in ALL_EXTENSION_KEYS:
            if k in available:
                effective_exts[k] = bool(stored_exts.get(k, default_extensions.get(k, True)))
            else:
                effective_exts[k] = False

    return {
        "theme": data.get("theme", "light"),
        "language": data.get("language", "ru"),
        "active_workspace_id": active_workspaces.get(vault_path),
        "global_attachments_path": data.get("global_attachments_path"),
        "ui_font": data.get("ui_font", ""),
        "extensions": effective_exts,
        "available_extensions": get_available_extensions(),
        "priority_settings": data.get("priority_settings", default_priority),
        "memory_settings": {**default_memory, **data.get("memory_settings", {})},
        "tabs_hidden": state.get("tabs_hidden", False),
        "hb_index": state.get("hb_index", 999)
    }

def set_ui_settings(
    theme: str = None, 
    language: str = None, 
    active_workspace_id: int = None, 
    global_attachments_path: str = None, 
    reset_attachments: bool = False, 
    ui_font: str = None, 
    extensions: dict = None,
    priority_settings: dict = None,
    memory_settings: dict = None,
    tabs_hidden: bool = None,
    hb_index: int = None
) -> None:
    data = _load_config()
    if theme is not None: data["theme"] = theme
    if language is not None: data["language"] = language
    if ui_font is not None: data["ui_font"] = ui_font
    if extensions is not None:
        # Нельзя включить расширение, исключённое из сборки (allowlist).
        available = _bundled_available_extensions()
        if available is not None:
            extensions = {k: v for k, v in extensions.items() if k in available}
        current_exts = data.get("extensions", {"search": True, "calendar": True, "reminders": True, "graph": True, "tabs": True, "deadlines": True, "export": True, "priority": True, "ai": True, "automations": True, "statistics": True, "memory": True, "space": True})
        current_exts.update(extensions)
        data["extensions"] = current_exts
    if memory_settings is not None:
        current_mem = data.get("memory_settings", {})
        current_mem.update(memory_settings)
        data["memory_settings"] = current_mem
    if priority_settings is not None:
        current_prio = data.get("priority_settings", {
            "show_always": False,
            "t_low": 40, "t_mid": 70,
            "e_low": "😞", "e_mid": "😐", "e_high": "🤩", "e_none": "❔",
            "c_low": "#D35446", "c_mid": "#B3863A", "c_high": "#89A085", "c_none": "#828A80"
        })
        current_prio.update(priority_settings)
        data["priority_settings"] = current_prio
    
    if reset_attachments:
        data.pop("global_attachments_path", None)
    elif global_attachments_path is not None:
        data["global_attachments_path"] = global_attachments_path
        
    vault_path = get_active_vault()
    
    if active_workspace_id is not None:
        if "active_workspaces" not in data:
            data["active_workspaces"] = {}
        data["active_workspaces"][vault_path] = active_workspace_id
        
    # Сохраняем состояние элементов для текущего хранилища
    if tabs_hidden is not None or hb_index is not None:
        if "vault_states" not in data:
            data["vault_states"] = {}
        if vault_path not in data["vault_states"]:
            data["vault_states"][vault_path] = {}
            
        if tabs_hidden is not None:
            data["vault_states"][vault_path]["tabs_hidden"] = tabs_hidden
        if hb_index is not None:
            data["vault_states"][vault_path]["hb_index"] = hb_index
            
    _save_config(data)

def reorder_vault_history(ordered_paths: list[str]) -> None:
    data = _load_config()
    history = data.get("vault_history", [])
    
    history_map = {}
    for item in history:
        if isinstance(item, str):
            history_map[item] = {"path": item, "last_opened": None}
        elif isinstance(item, dict):
            history_map[item.get("path")] = item
            
    new_history = []
    for p in ordered_paths[:10]:
        if p in history_map:
            new_history.append(history_map[p])
        else:
            new_history.append({"path": p, "last_opened": None})
            
    data["vault_history"] = new_history
    _save_config(data)

def relink_vault_history(old_path: str, new_path: str) -> None:
    data = _load_config()
    
    history = data.get("vault_history", [])
    new_history = []
    for item in history:
        if isinstance(item, str):
            if item == old_path:
                new_history.append({"path": new_path, "last_opened": None})
            else:
                new_history.append(item)
        elif isinstance(item, dict):
            if item.get("path") == old_path:
                item["path"] = new_path
                new_history.append(item)
            else:
                new_history.append(item)
    data["vault_history"] = new_history

    reminders = data.get("active_reminders", [])
    for r in reminders:
        if r.get("vault_path") == old_path:
            r["vault_path"] = new_path
    data["active_reminders"] = reminders

    active_ws = data.get("active_workspaces", {})
    if old_path in active_ws:
        active_ws[new_path] = active_ws.pop(old_path)
    data["active_workspaces"] = active_ws

    if data.get("active_vault") == old_path:
        data["active_vault"] = new_path
        
    _save_config(data)

def get_vault_geometry(vault_path: str) -> tuple[int, int]:
    data = _load_config()
    geom = data.get("vault_geometry", {}).get(vault_path)
    if geom:
        return geom.get("width", 1200), geom.get("height", 800)
    return 1200, 800

def get_vault_geometry_full(vault_path: str) -> dict:
    """Полная геометрия окна: размер + позиция (x/y могут быть None для старых конфигов)."""
    data = _load_config()
    geom = data.get("vault_geometry", {}).get(vault_path) or {}
    return {
        "width": geom.get("width", 1200),
        "height": geom.get("height", 800),
        "x": geom.get("x"),
        "y": geom.get("y"),
    }

def set_vault_geometry(vault_path: str, width: int, height: int, x: int = None, y: int = None) -> None:
    data = _load_config()
    if "vault_geometry" not in data:
        data["vault_geometry"] = {}
    geom = {"width": int(width), "height": int(height)}
    if x is not None and y is not None:
        geom["x"] = int(x)
        geom["y"] = int(y)
    data["vault_geometry"][vault_path] = geom
    _save_config(data)

def get_active_reminders() -> list:
    data = _load_config()
    return data.get("active_reminders", [])

def add_active_reminder(task_id: int, task_title: str, message: str, due_time_iso: str, pid: int, vault_path: str, reminder_id: str) -> None:
    data = _load_config()
    reminders = data.get("active_reminders", [])
    
    reminders.append({
        "reminder_id": reminder_id,
        "task_id": task_id,
        "vault_path": vault_path,
        "pid": pid,
        "task_title": task_title,
        "message": message,
        "due_time": due_time_iso
    })
    
    data["active_reminders"] = reminders
    _save_config(data)

import os
import signal

def remove_reminders_for_task(task_id: int) -> None:
    data = _load_config()
    reminders = data.get("active_reminders", [])
    
    new_reminders = []
    for r in reminders:
        if r.get("task_id") == task_id:
            pid = r.get("pid")
            if pid:
                try:
                    os.kill(pid, signal.SIGTERM)
                except Exception:
                    pass
        else:
            new_reminders.append(r)
            
    data["active_reminders"] = new_reminders
    _save_config(data)

def remove_active_reminder(reminder_id: str) -> None:
    data = _load_config()
    reminders = data.get("active_reminders", [])
    
    new_reminders = []
    for r in reminders:
        if r.get("reminder_id") == reminder_id:
            pid = r.get("pid")
            if pid:
                try:
                    os.kill(pid, signal.SIGTERM)
                except Exception:
                    pass
        else:
            new_reminders.append(r)
            
    data["active_reminders"] = new_reminders
    _save_config(data)

def remove_all_vault_reminders(vault_path: str) -> None:
    data = _load_config()
    reminders = data.get("active_reminders", [])
    
    new_reminders = []
    for r in reminders:
        if r.get("vault_path") == vault_path:
            pid = r.get("pid")
            if pid:
                try:
                    os.kill(pid, signal.SIGTERM)
                except Exception:
                    pass
        else:
            new_reminders.append(r)
            
    data["active_reminders"] = new_reminders
    _save_config(data)

def spawn_notification_worker(task_id: int, task_title: str, message: str, due_time_iso: str, vault_path: str, reminder_id: str) -> int:
    import sys
    import subprocess
    
    title = "Doe"

    # DOCK FIX (macOS): оконный бинарник Doe.app нельзя использовать как воркер —
    # его bootloader (windowed + argv-emulation) регистрируется в Dock сразу при
    # старте процесса, ДО исполнения Python-кода. Поэтому в собранном приложении
    # используем специально собранный "тихий" консольный notify_worker,
    # который build.py кладёт рядом с главным бинарником.
    silent_worker = None
    if sys.platform == 'darwin' and getattr(sys, 'frozen', False):
        candidate = os.path.join(os.path.dirname(sys.executable), 'notify_worker')
        if os.path.exists(candidate):
            silent_worker = candidate

    if silent_worker:
        args = [silent_worker, due_time_iso, title, message, str(task_id), vault_path, reminder_id]
    else:
        # Разделяем логику для собранного приложения (Doe.exe) и режима разработки (python wrapper.py)
        if getattr(sys, 'frozen', False):
            args = [sys.executable, "--worker", due_time_iso, title, message, str(task_id), vault_path, reminder_id]
        else:
            script_path = os.path.abspath(sys.argv[0])
            args = [sys.executable, script_path, "--worker", due_time_iso, title, message, str(task_id), vault_path, reminder_id]
    
    # 0x00000008: DETACHED_PROCESS (Полная отвязка процесса от консоли и главного окна)
    # Это позволяет процессу "выжить" после закрытия приложения.
    creationflags = 0x00000008 if sys.platform == 'win32' else 0
    p = subprocess.Popen(args, creationflags=creationflags, start_new_session=(sys.platform != 'win32'))
    return p.pid

def restore_all_reminders() -> None:
    data = _load_config()
    reminders = data.get("active_reminders", [])
    if not reminders:
        return
        
    import sys
    import os
    import datetime
    
    now = datetime.datetime.utcnow()
    updated_reminders = []
    
    for r in reminders:
        due_time_str = r.get("due_time")
        if not due_time_str:
            continue
        try:
            due_time = datetime.datetime.fromisoformat(due_time_str.replace("Z", ""))
        except Exception:
            continue
        
        if due_time <= now:
            fire_time = now + datetime.timedelta(seconds=1)
            due_time_iso = fire_time.isoformat() + "Z"
        else:
            due_time_iso = due_time_str
            
        pid = r.get("pid")
        is_running = False
        if pid:
            try:
                if sys.platform != 'win32':
                    os.kill(pid, 0)
                    is_running = True
                else:
                    import ctypes
                    PROCESS_QUERY_INFORMATION = 0x0400
                    handle = ctypes.windll.kernel32.OpenProcess(PROCESS_QUERY_INFORMATION, False, pid)
                    if handle:
                        ctypes.windll.kernel32.CloseHandle(handle)
                        is_running = True
            except Exception:
                pass
                
        if not is_running:
            try:
                new_pid = spawn_notification_worker(
                    task_id=r.get("task_id"),
                    task_title=r.get("task_title"),
                    message=r.get("message"),
                    due_time_iso=due_time_iso,
                    vault_path=r.get("vault_path"),
                    reminder_id=r.get("reminder_id")
                )
                r["pid"] = new_pid
                r["due_time"] = due_time_iso
                print(f"[System] Restored reminder {r.get('reminder_id')} with new PID: {new_pid}")
            except Exception as e:
                print(f"[System] Failed to restore reminder {r.get('reminder_id')}: {e}")
                
        updated_reminders.append(r)
        
    data["active_reminders"] = updated_reminders
    _save_config(data)


# ============================================================
#  Уведомления интервального повторения (memory / spaced repetition)
#  Отдельный реестр (не смешиваем с обычными напоминаниями колокольчика).
# ============================================================
def _pid_alive(pid) -> bool:
    if not pid:
        return False
    import sys
    import os as _os
    try:
        if sys.platform != 'win32':
            _os.kill(pid, 0)
            return True
        else:
            import ctypes
            PROCESS_QUERY_INFORMATION = 0x0400
            handle = ctypes.windll.kernel32.OpenProcess(PROCESS_QUERY_INFORMATION, False, pid)
            if handle:
                ctypes.windll.kernel32.CloseHandle(handle)
                return True
    except Exception:
        return False
    return False


def get_memory_notifications() -> dict:
    return _load_config().get("memory_notifications", {})


def cancel_memory_notification(item_id) -> None:
    import os as _os
    import signal as _signal
    data = _load_config()
    store = data.get("memory_notifications", {})
    info = store.pop(str(item_id), None)
    if info and info.get("pid"):
        try:
            _os.kill(info["pid"], _signal.SIGTERM)
        except Exception:
            pass
    data["memory_notifications"] = store
    _save_config(data)


def upsert_memory_notification(item_id, task_id, task_title, message,
                               due_time_iso, vault_path) -> None:
    """Планирует (или перепланирует) системное уведомление о повторении карточки.

    Идемпотентно: если на это же время уже есть живой воркер — ничего не делает.
    Просроченное due стреляет почти сразу (через 5 секунд)."""
    import os as _os
    import signal as _signal
    import datetime as _dt

    data = _load_config()
    store = data.get("memory_notifications", {})
    key = str(item_id)
    existing = store.get(key)

    if existing and existing.get("due_time") == due_time_iso and _pid_alive(existing.get("pid")):
        return

    if existing and existing.get("pid"):
        try:
            _os.kill(existing["pid"], _signal.SIGTERM)
        except Exception:
            pass

    fire_iso = due_time_iso
    try:
        due_dt = _dt.datetime.fromisoformat(due_time_iso.replace("Z", ""))
        if due_dt <= _dt.datetime.utcnow():
            fire_iso = (_dt.datetime.utcnow() + _dt.timedelta(seconds=5)).isoformat() + "Z"
    except Exception:
        pass

    reminder_id = (existing or {}).get("reminder_id") or f"mem-{item_id}"
    try:
        pid = spawn_notification_worker(
            task_id=task_id,
            task_title=task_title,
            message=message,
            due_time_iso=fire_iso,
            vault_path=vault_path,
            reminder_id=reminder_id,
        )
    except Exception as e:
        print(f"[Memory] failed to schedule notification for item {item_id}: {e}")
        return

    store[key] = {
        "pid": pid,
        "due_time": due_time_iso,
        "reminder_id": reminder_id,
        "task_id": task_id,
        "vault_path": vault_path,
    }
    data["memory_notifications"] = store
    _save_config(data)
