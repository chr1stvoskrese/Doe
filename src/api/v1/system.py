from fastapi import APIRouter, HTTPException, status, UploadFile, File, Depends  # Добавили Depends
from sqlalchemy.ext.asyncio import AsyncSession # Добавили
from src.db.database import get_session # Добавили
from src.services.task_service import cleanup_orphaned_attachments # Добавили
from pydantic import BaseModel
from typing import Optional
import os
import sys
import subprocess
from pathlib import Path
import shutil
import webbrowser # <--- Добавили для открытия веб-ссылок
import urllib.parse # <--- Для работы с file://
from src.core.config import get_vault_history, remove_vault_from_history
from src.core.config import reorder_vault_history

from urllib.parse import unquote

from src.db.database import switch_vault
from src.core.config import get_active_vault, get_ui_settings, set_ui_settings, get_attachments_dir

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

class ReorderHistoryReq(BaseModel):
    ordered_paths: list[str]

@router.post("/vault/history/reorder")
async def reorder_vault_history_endpoint(req: ReorderHistoryReq):
    reorder_vault_history(req.ordered_paths)
    return {"success": True}

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
    global_attachments_path: Optional[str] = None
    reset_attachments: Optional[bool] = False

class SettingsResponse(BaseModel):
    theme: str
    language: str
    active_workspace_id: Optional[int] = None
    global_attachments_path: Optional[str] = None

@router.get("/settings", response_model=SettingsResponse)
async def get_settings_endpoint():
    return SettingsResponse(**get_ui_settings())

from src.db.models import TaskModel
from sqlalchemy import select
from urllib.parse import unquote
import re

@router.put("/settings", response_model=SettingsResponse)
async def update_settings_endpoint(settings: SettingsUpdate, db: AsyncSession = Depends(get_session)):
    # 1. Запоминаем СТАРУЮ папку вложений и её тип
    old_att_dir = get_attachments_dir()
    old_settings = get_ui_settings()
    was_global = bool(old_settings.get("global_attachments_path"))

    # 2. Применяем новые настройки
    set_ui_settings(
        theme=settings.theme, 
        language=settings.language,
        active_workspace_id=settings.active_workspace_id,
        global_attachments_path=settings.global_attachments_path,
        reset_attachments=settings.reset_attachments
    )

    # 3. Узнаем НОВУЮ папку вложений
    new_att_dir = get_attachments_dir()

    # 4. 🔥 УМНАЯ МИГРАЦИЯ ФАЙЛОВ
    if old_att_dir != new_att_dir and old_att_dir.exists() and old_att_dir.is_dir():
        new_att_dir.mkdir(parents=True, exist_ok=True)
        
        # Если мы уходим из глобальной папки в локальную, нужно забрать ТОЛЬКО СВОИ файлы
        allowed_files = None
        if was_global and settings.reset_attachments:
            allowed_files = set()
            result = await db.execute(select(TaskModel.description).where(TaskModel.description.isnot(None)))
            descriptions = result.scalars().all()
            pattern = re.compile(r'\]\((doe/[^\)]+)\)')
            for desc in descriptions:
                matches = pattern.findall(desc)
                for match in matches:
                    # Извлекаем чистое имя файла: "doe/img.png" -> "img.png"
                    clean_name = unquote(match).replace("doe/", "", 1)
                    allowed_files.add(clean_name)

        # Перенос файлов
        for item in old_att_dir.iterdir():
            if item.is_file():
                # Если фильтр включен, пропускаем чужие файлы
                if allowed_files is not None and item.name not in allowed_files:
                    continue

                target_file = new_att_dir / item.name
                if not target_file.exists():
                    try:
                        shutil.move(str(item), str(target_file))
                    except Exception as e:
                        print(f"[System] Failed to move attachment {item.name}: {e}")

        # Очищаем старую папку, только если мы уходим из ЛОКАЛЬНОЙ,
        # глобальную папку удалять опасно, вдруг там файлы других хранилищ.
        if not was_global:
            try:
                if not any(old_att_dir.iterdir()):
                    old_att_dir.rmdir()
            except Exception:
                pass

    return SettingsResponse(**get_ui_settings())

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    attachments_dir = get_attachments_dir()
    attachments_dir.mkdir(parents=True, exist_ok=True)
    
    file_path = attachments_dir / file.filename
    counter = 1
    while file_path.exists():
        file_path = attachments_dir / f"{Path(file.filename).stem}_{counter}{Path(file.filename).suffix}"
        counter += 1
        
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"path": f"doe/{file_path.name}", "name": file_path.name}

class ImportFileReq(BaseModel):
    absolute_path: str

@router.post("/import-file")
async def import_file(req: ImportFileReq):
    attachments_dir = get_attachments_dir()
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
    return {"path": f"doe/{file_path.name}", "name": file_path.name}

class OpenFileReq(BaseModel):
    path: str

@router.post("/open-file")
async def open_file_endpoint(req: OpenFileReq):
    filename = req.path.replace("doe/", "", 1)
    abs_path = get_attachments_dir() / filename
    
    if not abs_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
        
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
    att_dir = get_attachments_dir()
    result = {}
    
    for p in req.paths:
        try:
            decoded_path = unquote(p)
            filename = decoded_path.replace("doe/", "", 1)
            abs_path = att_dir / filename
            
            if abs_path.exists() and abs_path.is_file():
                result[p] = {"exists": True, "real_name": abs_path.name}
            else:
                result[p] = {"exists": False, "real_name": filename}
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

@router.post("/cleanup-attachments")
async def cleanup_attachments_endpoint(db: AsyncSession = Depends(get_session)):
    """
    Фоновый эндпоинт для сборки мусора (Garbage Collector).
    Вызывается фронтендом при закрытии карточки и при запуске приложения.
    """
    await cleanup_orphaned_attachments(db)
    return {"success": True}


class DeleteFileReq(BaseModel):
    path: str

@router.post("/delete-file")
async def delete_file_endpoint(req: DeleteFileReq):
    """
    Мгновенное физическое удаление файла с диска.
    Используется только при явном нажатии на 'Удалить' во вложениях.
    """
    att_dir = get_attachments_dir()
    clean_rel_path = unquote(req.path)
    filename = clean_rel_path.replace("doe/", "", 1)
    
    # Защита от выхода за пределы папки (path traversal)
    abs_path = (att_dir / filename).resolve()
    
    if not str(abs_path).startswith(str(att_dir.resolve())):
        raise HTTPException(status_code=403, detail="Access denied")

    try:
        if abs_path.exists() and abs_path.is_file():
            os.remove(abs_path)
            print(f"[System] File physically deleted: {abs_path.name}")
            return {"success": True}
        else:
            # Если файла уже нет, считаем задачу выполненной
            return {"success": True, "info": "File already gone"}
    except Exception as e:
        print(f"[System] Failed to delete file {abs_path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/vault/history")
async def get_vault_history_endpoint():
    items = get_vault_history()
    result = []
    for item in items:
        try:
            if isinstance(item, str):
                p = item
                last_opened = None
            else:
                p = item.get("path")
                last_opened = item.get("last_opened")
                
            name = Path(p).resolve().name
            result.append({"name": name, "path": p, "last_opened": last_opened})
        except Exception:
            pass
    return result


class RemoveHistoryReq(BaseModel):
    path: str

@router.post("/vault/history/remove")
async def remove_vault_history_endpoint(req: RemoveHistoryReq):
    remove_vault_from_history(req.path)
    return {"success": True}

from sqlalchemy import text

@router.get("/search")
async def global_search(q: str, db: AsyncSession = Depends(get_session)):
    """Ультра-быстрый глобальный поиск."""
    if not q or len(q.strip()) < 2:
        return {"workspaces": [], "columns": [], "tasks": []}

    safe_q = q.strip()
    like_q = f"%{safe_q}%"
    
    # 1. Поиск по вкладкам (workspaces)
    ws_sql = text("SELECT id, name FROM workspaces WHERE name LIKE :like_q LIMIT 5")
    ws_res = await db.execute(ws_sql, {"like_q": like_q})
    workspaces = [{"id": r[0], "name": r[1], "type": "workspace"} for r in ws_res.fetchall()]

    # 2. Поиск по колонкам
    col_sql = text("""
        SELECT c.id, c.title, c.workspace_id, w.name 
        FROM columns c 
        JOIN workspaces w ON c.workspace_id = w.id 
        WHERE c.title LIKE :like_q LIMIT 5
    """)
    col_res = await db.execute(col_sql, {"like_q": like_q})
    columns = [{"id": r[0], "title": r[1], "workspace_id": r[2], "workspace_name": r[3], "type": "column"} for r in col_res.fetchall()]

    # 3. FTS5 Поиск по карточкам и их содержимому (включая markdown-ссылки вложений)
    # Формируем префиксный запрос: 'apple pie' -> '"apple"* "pie"*'
    safe_words = [w.replace('"', '').replace("'", "") for w in safe_q.split()]
    fts_query = " ".join([f'"{w}"*' for w in safe_words if w])

    task_sql = text("""
        SELECT 
            t.id, 
            t.title, 
            t.column_id, 
            c.title AS col_title, 
            c.workspace_id, 
            w.name AS ws_name,
            snippet(tasks_fts, 1, '<mark>', '</mark>', '...', 10) AS snippet_desc
        FROM tasks_fts fts
        JOIN tasks t ON t.id = fts.rowid
        JOIN columns c ON t.column_id = c.id
        JOIN workspaces w ON c.workspace_id = w.id
        WHERE tasks_fts MATCH :fts_q
        ORDER BY rank
        LIMIT 30
    """)
    
    try:
        task_res = await db.execute(task_sql, {"fts_q": fts_query})
        tasks = [{
            "id": r[0], "title": r[1], "column_id": r[2], "column_title": r[3], 
            "workspace_id": r[4], "workspace_name": r[5], "snippet": r[6], "type": "task"
        } for r in task_res.fetchall()]
    except Exception as e:
        print(f"[Search] FTS query failed (likely syntax): {e}")
        tasks = []

    return {"workspaces": workspaces, "columns": columns, "tasks": tasks}

