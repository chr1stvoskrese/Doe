from fastapi import APIRouter, HTTPException
from pathlib import Path
from urllib.parse import unquote
import re
import shutil

from sqlalchemy import select

from src.db.models import TaskModel
from src.core.config import get_attachments_dir, get_ui_settings, set_ui_settings
from src.schemas.system import SettingsUpdate, SettingsResponse, SetFontReq

router = APIRouter(tags=["settings"])


@router.get("/settings", response_model=SettingsResponse)
async def get_settings_endpoint():
    settings = get_ui_settings()
    
    # Ищем кастомный шрифт в папке хранилища (doe/)
    att_dir = get_attachments_dir()
    custom_font = None
    if att_dir.exists():
        for ext in ['.ttf', '.otf', '.woff', '.woff2']:
            if (att_dir / f"custom_font{ext}").exists():
                custom_font = f"doe/custom_font{ext}"
                break
    settings["custom_font"] = custom_font
    
    return SettingsResponse(**settings)


@router.post("/font/set")
async def set_custom_font(req: SetFontReq):
    att_dir = get_attachments_dir()
    att_dir.mkdir(parents=True, exist_ok=True)
    
    src_path = Path(req.absolute_path)
    if not src_path.exists() or not src_path.is_file():
        raise HTTPException(status_code=404, detail="Файл шрифта не найден")
        
    ext = src_path.suffix.lower()
    if ext not in ['.ttf', '.otf', '.woff', '.woff2']:
        raise HTTPException(status_code=400, detail="Поддерживаются только шрифты .ttf, .otf, .woff, .woff2")
        
    # Удаляем старые шрифты перед копированием
    for old_ext in ['.ttf', '.otf', '.woff', '.woff2']:
        old_font = att_dir / f"custom_font{old_ext}"
        if old_font.exists():
            try:
                old_font.unlink()
            except Exception:
                pass
                
    dest_path = att_dir / f"custom_font{ext}"
    try:
        shutil.copy2(src_path, dest_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка копирования: {e}")
        
    return {"success": True, "path": f"doe/{dest_path.name}"}


@router.post("/font/clear")
async def clear_custom_font():
    att_dir = get_attachments_dir()
    for ext in ['.ttf', '.otf', '.woff', '.woff2']:
        font_path = att_dir / f"custom_font{ext}"
        if font_path.exists():
            try:
                font_path.unlink()
            except Exception:
                pass
    return {"success": True}


@router.put("/settings", response_model=SettingsResponse)
async def update_settings_endpoint(settings: SettingsUpdate):
    # ⚠️ БЕЗ Depends(get_session)! Настройки (тема, язык и т.д.) хранятся в
    # конфиг-файле и должны сохраняться и с ЭКРАНА ВЫБОРА ХРАНИЛИЩ, когда БД
    # закрыта (например, защищённое хранилище заблокировано). Раньше зависимость
    # роняла запрос — тема/язык, выбранные на селекторе, молча не сохранялись.
    # БД нужна только миграции вложений — берём сессию лениво ниже.
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
        reset_attachments=settings.reset_attachments,
        ui_font=settings.ui_font,
        extensions=settings.extensions,
        priority_settings=settings.priority_settings,
        tabs_hidden=settings.tabs_hidden,
        hb_index=settings.hb_index
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
            # Ленивая сессия: смена папки вложений возможна только при открытом
            # хранилище, но страхуемся на случай закрытой БД.
            try:
                from src.db.database import get_session_factory
                async with get_session_factory()() as db:
                    result = await db.execute(select(TaskModel.description).where(TaskModel.description.isnot(None)))
                    descriptions = result.scalars().all()
            except RuntimeError:
                descriptions = []
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
