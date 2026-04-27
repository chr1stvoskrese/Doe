from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Optional
import asyncio
from pathlib import Path

from src.db.database import switch_vault
from src.core.config import get_active_vault, get_ui_settings, set_ui_settings # Добавили настройки UI


router = APIRouter(prefix="/system", tags=["system"])

class VaultResponse(BaseModel):
    name: Optional[str] = None
    path: Optional[str] = None
    canceled: bool = False

@router.get("/vault", response_model=VaultResponse)
async def get_vault():
    path = get_active_vault()
    name = Path(path).resolve().name
    return VaultResponse(name=name, path=path)

@router.post("/vault/switch", response_model=VaultResponse)
async def switch_vault_endpoint():
    # Возвращаем привязку окна к активному приложению (браузеру)
    script = """
    try
        tell application (path to frontmost application as text)
            set myFolder to choose folder with prompt "Выберите хранилище (Doe Vault)"
            return POSIX path of myFolder
        end tell
    on error number -128
        return ""
    end try
    """
    
    process = await asyncio.create_subprocess_exec(
        'osascript', '-e', script,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await process.communicate()
    
    if process.returncode != 0:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Ошибка вызова диалога macOS")
        
    new_path = stdout.decode('utf-8').strip()
    
    # Если нажали "Отмена"
    if not new_path:
        return VaultResponse(canceled=True)
        
    await switch_vault(new_path)
    name = Path(new_path).resolve().name
    return VaultResponse(name=name, path=new_path, canceled=False)

class SettingsUpdate(BaseModel):
    theme: Optional[str] = None
    language: Optional[str] = None
    active_workspace_id: Optional[int] = None

class SettingsResponse(BaseModel):
    theme: str
    language: str
    active_workspace_id: Optional[int] = None

@router.get("/settings", response_model=SettingsResponse)
async def get_settings_endpoint():
    return SettingsResponse(**get_ui_settings())

@router.put("/settings", response_model=SettingsResponse)
async def update_settings_endpoint(settings: SettingsUpdate):
    set_ui_settings(
        theme=settings.theme, 
        language=settings.language,
        active_workspace_id=settings.active_workspace_id
    )
    return SettingsResponse(**get_ui_settings())
