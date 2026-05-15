import json
import os
from pathlib import Path
from datetime import datetime

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

