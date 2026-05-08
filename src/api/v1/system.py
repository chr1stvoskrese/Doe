from fastapi import APIRouter, HTTPException, status, UploadFile, File
from pydantic import BaseModel
from typing import Optional
import os
import sys
import subprocess
from pathlib import Path
import shutil
import webbrowser # <--- Добавили для открытия веб-ссылок
import urllib.parse # <--- Для работы с file://

from urllib.parse import unquote

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
        
    # --- НОВАЯ ПРОВЕРКА ---
    db_file = os.path.join(new_path, "board.db")
    if not os.path.exists(db_file):
        # Возвращаем 400 ошибку, чтобы фронтенд понял: это не хранилище
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="INVALID_VAULT"
        )
    # ----------------------
        
    await switch_vault(new_path)
    name = Path(new_path).resolve().name
    return VaultResponse(name=name, path=new_path, canceled=False)

class CreateVaultRequest(BaseModel):
    parent_path: str
    name: str

@router.post("/vault/create", response_model=VaultResponse)
async def create_vault_endpoint(req: CreateVaultRequest):
    if not req.parent_path or not req.name:
        return VaultResponse(canceled=True)
        
    # Склеиваем родительскую папку (например, ~/Documents) и имя хранилища (DoeProject)
    new_path = os.path.join(req.parent_path, req.name)
    
    # switch_vault автоматически создаст нужную папку с помощью exist_ok=True
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

@router.post("/open-file")
async def open_file_endpoint(req: OpenFileReq):
    vault_path = Path(get_active_vault())
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

class ValidateAttachmentsReq(BaseModel):
    paths: list[str]

@router.post("/validate-attachments")
async def validate_attachments(req: ValidateAttachmentsReq):
    vault_path = Path(get_active_vault())
    result = {}
    
    for p in req.paths:
        try:
            decoded_path = unquote(p)
            abs_path = vault_path / decoded_path
            
            if abs_path.exists() and abs_path.is_file():
                result[p] = {"exists": True, "real_name": abs_path.name}
            else:
                result[p] = {"exists": False, "real_name": Path(decoded_path).name}
        except Exception:
            result[p] = {"exists": False, "real_name": "Unknown"}
            
    return result


# ==============================================================
# НОВЫЙ ЭНДПОИНТ: БЕЗОПАСНОЕ ОТКРЫТИЕ ВНЕШНИХ ССЫЛОК И ПУТЕЙ
# ==============================================================
class OpenLinkReq(BaseModel):
    url: str

@router.post("/open-link")
async def open_link_endpoint(req: OpenLinkReq):
    target = req.url
    try:
        # 1. Если это веб-ссылка или IP -> открываем в браузере
        if target.startswith(("http://", "https://")):
            webbrowser.open(target)
            return {"success": True}

        # 2. Обработка локальных путей
        clean_path = target
        
        # Убираем file:// если есть
        if clean_path.startswith("file://"):
            clean_path = clean_path.replace("file://", "", 1)
            # Фикс для Windows (убираем лишний слэш перед диском, например /C:/)
            if sys.platform == 'win32' and clean_path.startswith('/'):
                clean_path = clean_path[1:]
        
        # Декодируем URL-символы (%20 и прочее) в нормальные строки
        clean_path = urllib.parse.unquote(clean_path)

        # --- МАГИЯ ТИЛЬДЫ (Senior Developer Trick) ---
        # os.path.expanduser автоматически заменит ~ на домашнюю папку текущего пользователя
        # Она работает кроссплатформенно.
        if clean_path.startswith("~"):
            clean_path = os.path.expanduser(clean_path)
        # ----------------------------------------------

        # Превращаем в абсолютный путь (на случай, если пользователь ввел относительный не от ~)
        final_path = Path(clean_path).absolute()

        print(f"[System] Attempting to open path: {final_path}")

        if sys.platform == 'darwin':
            # macOS: команда open идеально справляется и с файлами, и с папками
            subprocess.call(['open', str(final_path)])
        elif sys.platform == 'win32':
            # Windows: os.startfile — это аналог двойного клика в проводнике
            if final_path.exists():
                os.startfile(str(final_path))
            else:
                # Если файла нет, не вызываем исключение, а просто логируем
                print(f"[System] Path does not exist: {final_path}")
                return {"success": False, "error": "File not found"}
        
        return {"success": True}
        
    except Exception as e:
        print(f"[System] Failed to open external link {target}: {e}")
        return {"success": False, "error": str(e)}