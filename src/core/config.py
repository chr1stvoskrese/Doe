"""
Ядро приложения: Конфигурация и утилиты
"""
import json
from pathlib import Path

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
    """Возвращает путь к активному хранилищу."""
    data = _load_config()
    return data.get("active_vault", str(DEFAULT_VAULT))

def set_active_vault(vault_path: str) -> None:
    """Сохраняет путь к активному хранилищу."""
    data = _load_config()
    data["active_vault"] = vault_path
    _save_config(data)

def get_ui_settings() -> dict:
    """Возвращает настройки интерфейса (тема, язык, активная вкладка)."""
    data = _load_config()
    vault_path = get_active_vault()
    active_workspaces = data.get("active_workspaces", {})
    return {
        "theme": data.get("theme", "light"),
        "language": data.get("language", "ru"),
        "active_workspace_id": active_workspaces.get(vault_path)
    }

def set_ui_settings(theme: str = None, language: str = None, active_workspace_id: int = None) -> None:
    """Обновляет настройки интерфейса."""
    data = _load_config()
    if theme is not None:
        data["theme"] = theme
    if language is not None:
        data["language"] = language
        
    if active_workspace_id is not None:
        vault_path = get_active_vault()
        if "active_workspaces" not in data:
            data["active_workspaces"] = {}
        data["active_workspaces"][vault_path] = active_workspace_id
        
    _save_config(data)
