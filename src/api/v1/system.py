# --- ПОЛНОСТЬЮ ЗАМЕНИТЕ src/api/v1/system.py ---
from fastapi import APIRouter, HTTPException, status, UploadFile, File
from pydantic import BaseModel
from typing import Optional
import os
import sys
import subprocess
from pathlib import Path
import shutil

from src.db.database import switch_vault
from src.core.config import get_active_vault, get_ui_settings, set_ui_settings

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

class SwitchVaultRequest(BaseModel):
    new_path: str

@router.post("/vault/switch", response_model=VaultResponse)
async def switch_vault_endpoint(req: SwitchVaultRequest):
    new_path = req.new_path
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

# ЗАГРУЗКА ИЗ ПЕРЕТАСКИВАНИЯ (Drag & Drop)
@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    vault_path = Path(get_active_vault())
    attachments_dir = vault_path / "attachments"
    attachments_dir.mkdir(parents=True, exist_ok=True)
    
    file_path = attachments_dir / file.filename
    counter = 1
    while file_path.exists():
        file_path = attachments_dir / f"{Path(file.filename).stem}_{counter}{Path(file.filename).suffix}"
        counter += 1
        
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"path": f"attachments/{file_path.name}", "name": file_path.name}

class ImportFileReq(BaseModel):
    absolute_path: str

# ИМПОРТ ИЗ НАТИВНОГО ДИАЛОГА
@router.post("/import-file")
async def import_file(req: ImportFileReq):
    vault_path = Path(get_active_vault())
    attachments_dir = vault_path / "attachments"
    attachments_dir.mkdir(parents=True, exist_ok=True)
    
    src_path = Path(req.absolute_path)
    if not src_path.exists() or not src_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
        
    file_path = attachments_dir / src_path.name
    counter = 1
    while file_path.exists():
        file_path = attachments_dir / f"{src_path.stem}_{counter}{src_path.suffix}"
        counter += 1
        
    shutil.copy2(src_path, file_path)
    return {"path": f"attachments/{file_path.name}", "name": file_path.name}

class OpenFileReq(BaseModel):
    path: str

# НАТИВНОЕ ОТКРЫТИЕ ФАЙЛА
@router.post("/open-file")
async def open_file_endpoint(req: OpenFileReq):
    vault_path = Path(get_active_vault())
    # Формируем абсолютный путь из относительного
    abs_path = vault_path / req.path
    
    if not abs_path.exists():
        raise HTTPException(status_code=404, detail="File not found in vault")
        
    try:
        if sys.platform == 'darwin':
            subprocess.call(['open', str(abs_path)])
        elif sys.platform == 'win32':
            os.startfile(str(abs_path))
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
