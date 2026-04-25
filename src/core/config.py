"""
Ядро приложения: Конфигурация и утилиты
"""
import json
from pathlib import Path

CONFIG_FILE = Path.home() / ".doe_config.json"
DEFAULT_VAULT = Path.home() / "DoeDevVault"

def get_active_vault() -> str:
    """Возвращает путь к активному хранилищу."""
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("active_vault", str(DEFAULT_VAULT))
        except Exception:
            pass
    return str(DEFAULT_VAULT)

def set_active_vault(vault_path: str) -> None:
    """Сохраняет путь к активному хранилищу."""
    data = {}
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            pass
    
    data["active_vault"] = vault_path
    
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
