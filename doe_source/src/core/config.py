# src/core/config.py
import json
import os
from pathlib import Path
from datetime import datetime, timedelta

CONFIG_FILE = Path.home() / ".doe_config.json"
DEFAULT_VAULT = Path.home() / "DoeDevVault"

import copy

_config_cache = {"stat": None, "data": None}

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

def get_active_vault() -> str:
    data = _load_config()
    return data.get("active_vault", str(DEFAULT_VAULT))

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
    return Path(get_active_vault()) / "doe"

def get_ui_settings() -> dict:
    data = _load_config()
    vault_path = get_active_vault()
    active_workspaces = data.get("active_workspaces", {})
    default_extensions = {"search": True, "calendar": True, "reminders": True, "graph": True, "tabs": True, "deadlines": True, "export": True, "priority": True, "ai": True, "automations": True}

    # Дефолтные настройки приоритетности
    default_priority = {
        "show_always": False,
        "t_low": 40, "t_mid": 70,
        "e_low": "😞", "e_mid": "😐", "e_high": "🤩", "e_none": "?",
        "c_low": "#D35446", "c_mid": "#B3863A", "c_high": "#89A085", "c_none": "#7C5CB7"
    }

    return {
        "theme": data.get("theme", "light"),
        "language": data.get("language", "ru"),
        "active_workspace_id": active_workspaces.get(vault_path),
        "global_attachments_path": data.get("global_attachments_path"),
        "ui_font": data.get("ui_font", ""),
        "extensions": data.get("extensions", default_extensions),
        "priority_settings": data.get("priority_settings", default_priority) # <--- ДОБАВЛЕНО
    }

def set_ui_settings(theme: str = None, language: str = None, active_workspace_id: int = None, global_attachments_path: str = None, reset_attachments: bool = False, ui_font: str = None, extensions: dict = None, priority_settings: dict = None) -> None:
    data = _load_config()
    if theme is not None: data["theme"] = theme
    if language is not None: data["language"] = language
    if ui_font is not None: data["ui_font"] = ui_font
    if extensions is not None: 
        current_exts = data.get("extensions", {"search": True, "calendar": True, "reminders": True, "graph": True, "tabs": True, "deadlines": True, "export": True, "priority": True, "ai": True, "automations": True})
        current_exts.update(extensions)
        data["extensions"] = current_exts
    if priority_settings is not None: # <--- ДОБАВЛЕНО
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
        
    if active_workspace_id is not None:
        vault_path = get_active_vault()
        if "active_workspaces" not in data:
            data["active_workspaces"] = {}
        data["active_workspaces"][vault_path] = active_workspace_id
        
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
    # который build_mac.sh кладёт рядом с главным бинарником.
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
