import json
import os
from pathlib import Path
from datetime import datetime, timedelta

CONFIG_FILE = Path.home() / ".doe_config.json"
DEFAULT_VAULT = Path.home() / "DoeDevVault"

def _load_config() -> dict:
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def _save_config(data: dict) -> None:
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def get_active_vault() -> str:
    data = _load_config()
    return data.get("active_vault", str(DEFAULT_VAULT))

def set_active_vault(vault_path: str) -> None:
    data = _load_config()
    data["active_vault"] = vault_path
    
    history = data.get("vault_history", [])
    
    # Очистка от дублей и миграция старого формата (список строк) в список словарей
    cleaned = []
    for item in history:
        if isinstance(item, str):
            if item != vault_path:
                cleaned.append({"path": item, "last_opened": None})
        elif isinstance(item, dict):
            if item.get("path") != vault_path:
                cleaned.append(item)
                
    # Формируем текущую дату в формате ISO + Z (для фронтенда)
    now_iso = datetime.utcnow().isoformat() + "Z"
    # Добавляем текущее хранилище на самый верх
    cleaned.insert(0, {"path": vault_path, "last_opened": now_iso})
    
    data["vault_history"] = cleaned[:10]  # Храним только 10 последних
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
    
    # Если удаляемое хранилище = активному, стираем active_vault
    # и привязку активной вкладки именно для этого пути. Иначе при следующем
    # запуске приложение увидит "active_vault" в конфиге, откроет главное окно
    # и init_dev_database() молча пересоздаст удалённую папку как пустое хранилище.
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
    # Если путь задан и папка физически существует - используем её
    if custom_path and os.path.exists(custom_path):
        return Path(custom_path)
    # Иначе фолбэк на стандартную локальную папку внутри хранилища.
    # Папка называется "doe" — это файлы, принадлежащие приложению.
    return Path(get_active_vault()) / "doe"

def get_ui_settings() -> dict:
    data = _load_config()
    vault_path = get_active_vault()
    active_workspaces = data.get("active_workspaces", {})
    return {
        "theme": data.get("theme", "light"),
        "language": data.get("language", "ru"),
        "active_workspace_id": active_workspaces.get(vault_path),
        "global_attachments_path": data.get("global_attachments_path")
    }

def set_ui_settings(theme: str = None, language: str = None, active_workspace_id: int = None, global_attachments_path: str = None, reset_attachments: bool = False) -> None:
    data = _load_config()
    if theme is not None: data["theme"] = theme
    if language is not None: data["language"] = language
    
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
    
    # Создаем словарь для быстрого поиска, чтобы не потерять даты при Drag&Drop
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
    
    # 1. Обновляем пути в истории хранилищ
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

    # 2. Обновляем пути в ждущих напоминаниях (ЧТОБЫ ОНИ ВЫЖИЛИ ПРИ ПЕРЕЕЗДЕ ПАПКИ)
    reminders = data.get("active_reminders", [])
    for r in reminders:
        if r.get("vault_path") == old_path:
            r["vault_path"] = new_path
    data["active_reminders"] = reminders

    # 3. Обновляем привязку вкладок
    active_ws = data.get("active_workspaces", {})
    if old_path in active_ws:
        active_ws[new_path] = active_ws.pop(old_path)
    data["active_workspaces"] = active_ws

    # 4. Обновляем текущее хранилище (если оно открыто)
    if data.get("active_vault") == old_path:
        data["active_vault"] = new_path
        
    _save_config(data)


def get_vault_geometry(vault_path: str) -> tuple[int, int]:
    """Возвращает сохраненную геометрию окна для конкретного хранилища. По умолчанию 1200x800."""
    data = _load_config()
    geom = data.get("vault_geometry", {}).get(vault_path)
    if geom:
        return geom.get("width", 1200), geom.get("height", 800)
    return 1200, 800

def set_vault_geometry(vault_path: str, width: int, height: int) -> None:
    """Сохраняет геометрию окна для конкретного хранилища."""
    data = _load_config()
    if "vault_geometry" not in data:
        data["vault_geometry"] = {}
    data["vault_geometry"][vault_path] = {"width": width, "height": height}
    _save_config(data)


def get_active_reminders() -> list:
    """Возвращает список запланированных напоминаний."""
    data = _load_config()
    # Фильтрация по времени удалена. Воркер сам удалит себя из списка 
    # в момент срабатывания, чтобы мгновенно очистить индикатор.
    return data.get("active_reminders", [])

import os
import signal
import uuid

def add_active_reminder(task_id: int, task_title: str, message: str, due_time_iso: str, pid: int, vault_path: str, reminder_id: str) -> None:
    data = _load_config()
    reminders = data.get("active_reminders", [])
    
    # [БАГ 1] Больше не убиваем процессы других напоминаний для этой же карточки!
    
    reminders.append({
        "reminder_id": reminder_id, # Уникальный ID
        "task_id": task_id,
        "vault_path": vault_path,
        "pid": pid,
        "task_title": task_title,
        "message": message,
        "due_time": due_time_iso
    })
    
    data["active_reminders"] = reminders
    _save_config(data)

def remove_reminders_for_task(task_id: int) -> None:
    """Удаляет все напоминания, связанные с конкретной карточкой."""
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
        # [БАГ 2] Удаляем только совпадение по конкретному UUID
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
    """Удаляет все напоминания, связанные с конкретным хранилищем (при его удалении)."""
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
    """Централизованный запуск фонового процесса напоминания."""
    import sys
    import subprocess
    import os
    
    title = "Doe"
    
    if getattr(sys, 'frozen', False):
        if sys.platform == 'darwin':
            worker_path = os.path.join(os.path.dirname(sys.executable), "notify_worker")
            args = [worker_path, due_time_iso, title, message, str(task_id), vault_path, reminder_id]
        else:
            worker_path = os.path.join(os.path.dirname(sys.executable), "notify_worker.exe")
            args = [worker_path, due_time_iso, title, message, str(task_id), vault_path, reminder_id]
    else:
        # Режим разработки
        project_root = Path(__file__).resolve().parent.parent.parent
        worker_path = os.path.join(project_root, "notify_worker.py")
        args = [sys.executable, worker_path, due_time_iso, title, message, str(task_id), vault_path, reminder_id]
    
    creationflags = 0x08000000 | 0x00000008 if sys.platform == 'win32' else 0
    p = subprocess.Popen(args, creationflags=creationflags, start_new_session=(sys.platform != 'win32'))
    return p.pid

def restore_all_reminders() -> None:
    """Восстановление фоновых процессов напоминаний при запуске приложения."""
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
        
        # Если время уже наступило во время отключения компьютера - запускаем через 1 секунду
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
