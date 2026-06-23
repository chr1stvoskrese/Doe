from fastapi import APIRouter, HTTPException, status, UploadFile, File, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.watcher import ws_manager  # <-- ДОБАВИТЬ ЭТО
from src.db.database import get_session # Добавили
from src.services.task_service import cleanup_orphaned_attachments # Добавили
from pydantic import BaseModel
from typing import Optional, Any # Any добавлен для статической типизации параметров DTO
import os
import sys
import subprocess
import re
from pathlib import Path
import shutil
import webbrowser # <--- Добавили для открытия веб-ссылок
import urllib.parse # <--- Для работы с file://
from src.core.config import get_vault_history, remove_vault_from_history, reorder_vault_history, relink_vault_history

import json
import anyio
from datetime import datetime, timezone
from sqlalchemy.orm import selectinload
from sqlalchemy import select, or_
from urllib.parse import unquote

# ColumnMode добавлен на верхний уровень импортов для соответствия PEP 8 и оптимизации работы СУБД
from src.db.models import WorkspaceModel, ColumnModel, ColumnMode, TaskModel, TimerSessionModel, task_relations
from src.db.database import switch_vault
from src.core.config import get_active_vault, get_ui_settings, set_ui_settings, get_attachments_dir
from src.core.watcher import vault_observer

router = APIRouter(prefix="/system", tags=["system"])

# --- Вспомогательные функции для JSON DTO ---
def _fmt_dt(dt) -> Optional[str]:
    if not dt:
        return None
    # Защита от Double Timezone Formatting: приводим к UTC перед форматированием
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None).isoformat() + "Z"
    return dt.isoformat() + "Z"

def _parse_dt(dt_str: Any) -> Optional[datetime]: # Any импортирован из typing в начале файла
    if not dt_str:
        return None
    # Защита от Already-parsed Datetime Collision
    if isinstance(dt_str, datetime):
        return dt_str.replace(tzinfo=None)
    try:
        # Для обратной совместимости с Python < 3.11 заменяем Z на UTC-смещение
        if dt_str.endswith('Z'):
            dt_str = dt_str[:-1] + '+00:00'
        dt = datetime.fromisoformat(dt_str)
        # Если строка содержала часовой пояс, приводим к UTC и убираем tzinfo для SQLite
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt
    except Exception:
        # Резервный срез на случай нестандартных форматов (YYYY-MM-DDTHH:MM:SS)
        try:
            return datetime.fromisoformat(dt_str[:19])
        except Exception:
            return datetime.utcnow()

def _ensure_list(val) -> list:
    """Гарантирует распаковку JSON-полей в Python-список независимо от поведения драйвера."""
    if isinstance(val, list):
        return val
    if isinstance(val, str):
        try:
            parsed = json.loads(val)
            if isinstance(parsed, list):
                return parsed
        except Exception:
            pass
    return []

def _filter_model_kwargs(model_class, kwargs: dict) -> dict:
    """
    Инспектирует схему SQLAlchemy-модели и оставляет только те ключи, 
    которые физически присутствуют в текущей версии таблицы базы данных.
    """
    from sqlalchemy.inspection import inspect
    try:
        mapper = inspect(model_class)
        # Извлекаем все доступные имена колонок и отношений (relationships)
        valid_keys = set(mapper.columns.keys()) | set(mapper.relationships.keys())
        return {k: v for k, v in kwargs.items() if k in valid_keys}
    except Exception:
        return kwargs # Фолбэк на случай сбоев инспектора

# Очередь для передачи событий от ОС к фронтенду
pending_highlights = []

class HighlightReq(BaseModel):
    task_id: int
    vault_path: Optional[str] = None

@router.post("/highlight-task")
async def trigger_highlight(req: HighlightReq):
    pending_highlights.append({"task_id": req.task_id, "vault_path": req.vault_path})
    
    def _bring_to_front():
        try:
            import webview
            import sys
            for w in webview.windows:
                if 'Kanban' in w.title or 'Select Vault' in w.title:
                    w.restore()
                    w.show()
                    if sys.platform == 'win32':
                        import ctypes
                        hwnd = ctypes.windll.user32.FindWindowW(None, w.title)
                        if hwnd:
                            ctypes.windll.user32.ShowWindow(hwnd, 9)
                            ctypes.windll.user32.SetForegroundWindow(hwnd)
                    elif sys.platform == 'darwin':
                        import AppKit
                        AppKit.NSApp.activateIgnoringOtherApps_(True)
                    break
        except Exception as e:
            print(f"[System] Failed to bring window to front: {e}")

    import sys
    if sys.platform == 'darwin':
        try:
            from Foundation import NSOperationQueue
            NSOperationQueue.mainQueue().addOperationWithBlock_(_bring_to_front)
        except Exception:
            pass
    else:
        import threading
        threading.Timer(0.1, _bring_to_front).start()

    return {"success": True}

@router.get("/pending-highlights")
async def get_pending_highlights():
    # Быстрая память (горячий старт)
    if pending_highlights:
        return pending_highlights.pop(0)
    
    # Фолбэк для холодного старта (когда бэкенд поднимался с нуля)
    try:
        from src.core.config import _load_config, _save_config
        config_data = _load_config()
        ph = config_data.get("pending_highlight")
        if ph:
            config_data.pop("pending_highlight", None)
            _save_config(config_data)
            return ph
    except Exception:
        pass
        
    return {"task_id": None}

class VaultResponse(BaseModel):
    name: Optional[str] = None
    path: Optional[str] = None
    canceled: bool = False
    already_active: bool = False  # <-- ДОБАВЛЕН ФЛАГ

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

class VaultResponse(BaseModel):
    name: Optional[str] = None
    path: Optional[str] = None
    canceled: bool = False
    already_active: bool = False  # <-- Флаг для фронтенда и wrapper'а

class SwitchVaultRequest(BaseModel):
    new_path: str
    trigger_ui: Optional[bool] = False

@router.post("/vault/switch", response_model=VaultResponse)
async def switch_vault_endpoint(req: SwitchVaultRequest):
    new_path = req.new_path
    if not new_path:
        return VaultResponse(canceled=True)

    # --- ПРОВЕРКА ВАЛИДНОСТИ ХРАНИЛИЩА ---
    vault_dir = Path(new_path)
    if not vault_dir.exists() or not vault_dir.is_dir():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="INVALID_VAULT")

    has_db = any(
        f for f in vault_dir.iterdir()
        if f.is_file() and (f.name.endswith(".db.doe") or f.name.endswith(".db")) and "backup" not in f.name and not f.name.startswith("._")
    )
    if not has_db:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="INVALID_VAULT")
    # -------------------------------------

    from src.core.config import get_active_vault, set_active_vault
    import os
    current_vault = get_active_vault()
    
    # Проверяем, открываем ли мы то же самое хранилище
    already_active = (os.path.normpath(new_path) == os.path.normpath(current_vault))

    if not already_active:
        await switch_vault(new_path)
    else:
        # Просто обновляем "last_opened" в конфиге
        set_active_vault(new_path)

    name = Path(new_path).resolve().name

    if req.trigger_ui:
        import sys as _sys_check
        def _update_ui():
            try:
                import sys
                import webview
                
                print(f"[System] 🔄 _update_ui invoked (already_active={already_active}, windows={[w.title for w in webview.windows]})")
                
                # Проверяем, открыто ли главное окно доски
                is_main_open = any('Kanban' in w.title for w in webview.windows)
                
                if already_active and is_main_open:
                    for w in webview.windows:
                        if 'Kanban' in w.title:
                            w.restore()
                            w.show()
                            # На Windows вытягиваем окно наверх через WinAPI
                            if sys.platform == 'win32':
                                import ctypes
                                hwnd = ctypes.windll.user32.FindWindowW(None, w.title)
                                if hwnd:
                                    ctypes.windll.user32.ShowWindow(hwnd, 9) # SW_RESTORE
                                    ctypes.windll.user32.SetForegroundWindow(hwnd)
                            break
                else:
                    # КРИТИЧНО: на macOS НЕЛЬЗЯ destroy() последнего окна, чтобы потом create_window().
                    # AppKit обрабатывает applicationShouldTerminateAfterLastWindowClosed: СИНХРОННО,
                    # ещё до того, как pywebview успеет зарегистрировать новое окно — процесс умирает.
                    # Поэтому НЕ вызываем open_main_window (он делает destroy+create), а просто
                    # перенавигируем уже существующее окно Vault Selector на доску и подгоняем
                    # размер/заголовок. Это работает на всех платформах одинаково и не зависит
                    # от window lifecycle.
                    target_url = 'http://127.0.0.1:8000/app'
                    
                    if webview.windows:
                        target_window = webview.windows[0]
                        try:
                            print(f"[System] 🪟 Navigating existing window '{target_window.title}' → {target_url}")
                            target_window.load_url(target_url)
                            print("[System] ✅ load_url completed")
                            
                            # 🚀 ФИКС: Если мы уже в Kanban (переключаемся) — НЕ ТРОГАЕМ размер (он остается текущим).
                            # Если переходим из маленького Vault Selector — грузим геометрию нового хранилища.
                            if not is_main_open:
                                try:
                                    from src.core.config import get_vault_geometry
                                    t_w, t_h = get_vault_geometry(new_path)
                                    target_window.resize(t_w, t_h)
                                    print(f"[System] ✅ window resized to saved geometry: {t_w}x{t_h}")
                                except Exception as e:
                                    print(f"[System] resize failed (non-fatal): {e}")
                                
                            # 🚀 ФИКС: Нативно возвращаем окну ОС возможность ресайза и разворота на весь экран
                            try:
                                import sys
                                if sys.platform == 'darwin':
                                    import AppKit
                                    if hasattr(target_window, 'gui') and hasattr(target_window.gui, 'window'):
                                        nswin = target_window.gui.window
                                        # Добавляем маски: Resizable (8) и Miniaturizable (4)
                                        nswin.setStyleMask_(nswin.styleMask() | 8 | 4)
                                        # Принудительно включаем зеленую кнопку (NSWindowZoomButton = 2)
                                        zoom_btn = nswin.standardWindowButton_(2)
                                        if zoom_btn:
                                            zoom_btn.setEnabled_(True)
                                elif sys.platform == 'win32':
                                    import ctypes
                                    # Ищем HWND окна по текущему или старому заголовку
                                    hwnd = ctypes.windll.user32.FindWindowW(None, target_window.title)
                                    if not hwnd:
                                        hwnd = ctypes.windll.user32.FindWindowW(None, 'Doe — Select Vault')
                                    
                                    if hwnd:
                                        # GWL_STYLE = -16
                                        style = ctypes.windll.user32.GetWindowLongW(hwnd, -16)
                                        # Внедряем WS_THICKFRAME (ресайз) | WS_MAXIMIZEBOX | WS_MINIMIZEBOX
                                        ctypes.windll.user32.SetWindowLongW(hwnd, -16, style | 0x00040000 | 0x00010000 | 0x00020000)
                                        # Принудительно заставляем Windows перерисовать рамку: 
                                        # SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED (0x27)
                                        ctypes.windll.user32.SetWindowPos(hwnd, 0, 0, 0, 0, 0, 0x27)
                                print("[System] ✅ window resizability restored natively")
                            except Exception as e:
                                print(f"[System] Failed to restore resizability: {e}")
                            
                            try:
                                target_window.set_title('Doe — Kanban')
                                print("[System] ✅ window title updated")
                            except Exception as e:
                                print(f"[System] set_title failed (non-fatal): {e}")
                            
                            try:
                                target_window.show()
                                target_window.restore()
                            except Exception as e:
                                print(f"[System] show/restore failed (non-fatal): {e}")
                            
                            # 🚀 ФИКС: Мгновенное включение ресайза без визуальных задержек
                            def _force_native_resizability():
                                try:
                                    import sys
                                    if sys.platform == 'darwin':
                                        import AppKit
                                        for win in AppKit.NSApp.windows():
                                            if win.canBecomeKeyWindow():
                                                win.setStyleMask_(win.styleMask() | 8 | 4)
                                                zoom_btn = win.standardWindowButton_(2)
                                                if zoom_btn is not None: zoom_btn.setEnabled_(True)
                                                min_btn = win.standardWindowButton_(1)
                                                if min_btn is not None: min_btn.setEnabled_(True)
                                                win.display()
                                        print("[System] 🍏 macOS native resizability enforced instantly")
                                    elif sys.platform == 'win32':
                                        import ctypes
                                        hwnd = ctypes.windll.user32.FindWindowW(None, 'Doe — Kanban')
                                        if not hwnd: hwnd = ctypes.windll.user32.FindWindowW(None, 'Doe — Select Vault')
                                        if hwnd:
                                            style = ctypes.windll.user32.GetWindowLongW(hwnd, -16)
                                            ctypes.windll.user32.SetWindowLongW(hwnd, -16, style | 0x00040000 | 0x00010000 | 0x00020000)
                                            ctypes.windll.user32.SetWindowPos(hwnd, 0, 0, 0, 0, 0, 0x27)
                                        print("[System] 🪟 Windows native resizability enforced instantly")
                                except Exception as ex:
                                    print(f"[System] ❌ Native resize hack failed: {ex}")

                            import sys
                            if sys.platform == 'darwin':
                                try:
                                    from Foundation import NSOperationQueue
                                    # Кладем хак в ту же очередь Main Thread сразу после команды resize от pywebview.
                                    # Выполнится за ~1 миллисекунду, до того как экран успеет нарисовать кадр.
                                    NSOperationQueue.mainQueue().addOperationWithBlock_(_force_native_resizability)
                                except Exception as e:
                                    print(f"[System] macOS dispatch failed: {e}")
                            else:
                                import threading
                                # Микро-задержка 30мс. Хватает для обработки очереди событий Windows, но невидимо для глаза.
                                threading.Timer(0.03, _force_native_resizability).start()

                            print("[System] ✅ Vault switch UI update complete")
                        except Exception as e:
                            print(f"[System] ❌ load_url failed: {e}")
                            import traceback
                            traceback.print_exc()
                    else:
                        # Окон нет вообще — попытка fallback на open_main_window только в этом случае,
                        # т.к. terminate-after-last-window-closed уже не страшен (последнего окна и так нет,
                        # AppKit либо уже всё прибрал, либо мы в очень странном состоянии).
                        print("[System] ⚠️ No windows present, falling back to open_main_window")
                        wrapper_mod = sys.modules.get('wrapper') or sys.modules.get('__main__')
                        if wrapper_mod and hasattr(wrapper_mod, 'WindowAPI'):
                            api = wrapper_mod.WindowAPI()
                            api.open_main_window()
                            print("[System] ✅ open_main_window invoked")
                        else:
                            print("[System] ❌ WindowAPI not found and no existing windows — cannot recover")
            except Exception as e:
                print(f"[System] UI update failed: {e}")
                import traceback
                traceback.print_exc()
        
        if _sys_check.platform == 'darwin':
            # На macOS pywebview-операции (create_window/destroy/show) ОБЯЗАНЫ выполняться
            # на главном потоке Cocoa. threading.Timer запускает callback в фоновом потоке,
            # из-за чего AppKit молча игнорирует вызовы. NSOperationQueue.mainQueue даёт
            # стандартный dispatch на главный thread — это правильный путь.
            try:
                from Foundation import NSOperationQueue
                NSOperationQueue.mainQueue().addOperationWithBlock_(_update_ui)
                print("[System] 🧵 _update_ui dispatched to main thread via NSOperationQueue")
            except Exception as e:
                print(f"[System] Failed to dispatch to main thread: {e}")
                import traceback
                traceback.print_exc()
        else:
            import threading
            threading.Timer(0.1, _update_ui).start()

    return VaultResponse(name=name, path=new_path, canceled=False, already_active=already_active)


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
    ui_font: Optional[str] = None
    extensions: Optional[dict] = None
    priority_settings: Optional[dict] = None  # <--- ДОБАВЛЕНО

class SettingsResponse(BaseModel):
    theme: str
    language: str
    active_workspace_id: Optional[int] = None
    global_attachments_path: Optional[str] = None
    custom_font: Optional[str] = None
    ui_font: Optional[str] = ""
    extensions: Optional[dict] = None
    priority_settings: Optional[dict] = None  # <--- ДОБАВЛЕНО

# --- СХЕМЫ СТАТИСТИКИ (PRO-уровень) ---
class TopTask(BaseModel):
    id: int
    title: str
    time_spent: int
    percentage: float # Доля от общего времени (за неделю или день)

class StatDay(BaseModel):
    date: str
    day_name: int  # 0-6 (Пн-Вс)
    tasks_done: int
    time_spent: int
    tasks: list[TopTask]  # <--- ДОБАВЛЕНО: Задачи конкретного дня

class StatisticsResponse(BaseModel):
    date_range_label: str       # "12 Авг - 18 Авг"
    total_done: int
    total_time: int
    overdue_count: int
    trend_done_pct: float       # Тренд к прошлой неделе (+20%)
    trend_time_pct: float
    best_day: Optional[int]     # Индекс самого продуктивного дня
    chart_data: list[StatDay]
    top_tasks: list[TopTask]

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

# === Эндпоинты управления шрифтами ===
class SetFontReq(BaseModel):
    absolute_path: str

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
        reset_attachments=settings.reset_attachments,
        ui_font=settings.ui_font,
        extensions=settings.extensions,
        priority_settings=settings.priority_settings
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
    # Очищаем префикс приложения и убираем ведущие слэши, чтобы Path / filename работал корректно
    filename = req.path.replace("doe/", "", 1).lstrip("/")
    abs_path = get_attachments_dir() / filename
    
    if not abs_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
        
    try:
        if sys.platform == 'darwin':
            # На macOS команда 'open' запускает файл в приложении по умолчанию для данного типа
            subprocess.call(['open', str(abs_path)])
        elif sys.platform == 'win32':
            # На Windows 'os.startfile' аналогичен двойному клику в Проводнике
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
        # Если ссылка указывает на внутреннее вложение нашего сервера (например, http://127.0.0.1:8000/doe/file.pdf),
        # перенаправляем ее на открытие локального файла в нативной системной читалке
        if "/doe/" in target:
            filename = target.split("/doe/")[-1].lstrip("/")
            abs_path = get_attachments_dir() / filename
            if abs_path.exists() and abs_path.is_file():
                if sys.platform == 'darwin':
                    subprocess.call(['open', str(abs_path)])
                elif sys.platform == 'win32':
                    os.startfile(str(abs_path))
                return {"success": True}

        # 1. Если это внешняя веб-ссылка или IP -> открываем в браузере
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

class RevealFolderReq(BaseModel):
    path: str

@router.post("/reveal-folder")
async def reveal_folder_endpoint(req: RevealFolderReq):
    target = req.path
    try:
        clean_path = target.replace("file://", "", 1)
        if sys.platform == 'win32' and clean_path.startswith('/'):
            clean_path = clean_path[1:]
            
        clean_path = urllib.parse.unquote(clean_path)
        if clean_path.startswith("~"):
            clean_path = os.path.expanduser(clean_path)
            
        final_path = Path(clean_path).absolute()

        if sys.platform == 'darwin':
            subprocess.call(['open', '-R', str(final_path)])
        elif sys.platform == 'win32':
            subprocess.call(['explorer', f'/select,{str(final_path)}'])
            
        return {"success": True}
    except Exception as e:
        print(f"[System] Failed to reveal folder {target}: {e}")
        return {"success": False, "error": str(e)}

@router.post("/cleanup-attachments")
async def cleanup_attachments_endpoint(db: AsyncSession = Depends(get_session)):
    """
    Фоновый эндпоинт для сборки мусора (Garbage Collector).
    Вызывается фронтендом при закрытии карточки и при запуске приложения.
    """
    await cleanup_orphaned_attachments(db)
    return {"success": True}

@router.get("/statistics", response_model=StatisticsResponse)
async def get_statistics(offset_weeks: int = 0, db: AsyncSession = Depends(get_session)):
    """Агрегация глубокой статистики с поддержкой путешествия в прошлое (сдвиг по неделям)."""
    from datetime import datetime, timedelta
    
    # 1. Определяем границы текущей запрашиваемой "недели" (строго с ПН по ВС)
    now = datetime.utcnow()
    # Находим понедельник текущей недели
    current_monday = now - timedelta(days=now.weekday())
    current_monday = current_monday.replace(hour=0, minute=0, second=0, microsecond=0)
    
    start_date = current_monday - timedelta(weeks=offset_weeks)
    end_date = start_date + timedelta(days=6, hours=23, minutes=59, seconds=59)
    
    # Границы ПРЕДЫДУЩЕЙ недели (для расчета трендов)
    prev_start_date = start_date - timedelta(days=7)
    prev_end_date = start_date - timedelta(seconds=1)
    
    # 2. ОПТИМИЗАЦИЯ: Достаем только задачи, которые имеют таймеры или завершены, 
    # чтобы не тянуть из БД 10 000 висяков.
    stmt = select(TaskModel).options(selectinload(TaskModel.timer_sessions)).where(
        or_(
            TaskModel.completed_at.isnot(None),
            TaskModel.due_date.isnot(None),
            TaskModel.timer_sessions.any()
        )
    )
    res = await db.execute(stmt)
    tasks = res.scalars().unique().all()
    
    # --- Сбор данных за ТЕКУЩУЮ выборку ---
    cur_done = 0
    cur_time = 0
    overdue_count = 0
    top_tasks_dict = {}
    
    # Подготавливаем массив дней для графика (всегда 7 дней, начиная с понедельника)
    chart_data = {}
    for i in range(7):
        dt = start_date + timedelta(days=i)
        chart_data[dt.strftime("%Y-%m-%d")] = {"day_name": dt.weekday(), "tasks_done": 0, "time_spent": 0, "tasks": {}}

    # --- Сбор данных за ПРОШЛУЮ выборку (тренд) ---
    prev_done = 0
    prev_time = 0

    for t in tasks:
        # Просроченные (считаем только для текущей недели, если offset == 0)
        if offset_weeks == 0 and not t.completed_at and t.due_date and t.due_date < now:
            overdue_count += 1
            
        # Завершенные
        if t.completed_at:
            if start_date <= t.completed_at <= end_date:
                cur_done += 1
                date_key = t.completed_at.strftime("%Y-%m-%d")
                if date_key in chart_data:
                    chart_data[date_key]["tasks_done"] += 1
            elif prev_start_date <= t.completed_at <= prev_end_date:
                prev_done += 1

        # 🔥 НОВАЯ ЛОГИКА ВРЕМЕНИ: Размазываем длинные сессии по дням
        task_time_cur = 0
        for s in t.timer_sessions:
            st = s.start_time
            en = s.end_time or now
            
            # 1. Считаем пересечение с ТЕКУЩЕЙ неделей (cur_time)
            # Пересечение двух отрезков: [max(start1, start2), min(end1, end2)]
            overlap_cur_start = max(st, start_date)
            overlap_cur_end = min(en, end_date)
            
            if overlap_cur_end > overlap_cur_start:
                dur_cur = int((overlap_cur_end - overlap_cur_start).total_seconds())
                task_time_cur += dur_cur
                cur_time += dur_cur
                
                # Размазываем это время по конкретным дням графика
                # Идем по всем 7 дням недели и смотрим пересечение сессии с КАЖДЫМИ СУТКАМИ
                for i in range(7):
                    day_start = start_date + timedelta(days=i)
                    day_end = day_start + timedelta(days=1)
                    
                    overlap_day_start = max(st, day_start)
                    overlap_day_end = min(en, day_end)
                    
                    if overlap_day_end > overlap_day_start:
                        day_dur = int((overlap_day_end - overlap_day_start).total_seconds())
                        date_key = day_start.strftime("%Y-%m-%d")
                        
                        if date_key in chart_data:
                            chart_data[date_key]["time_spent"] += day_dur
                            if t.id not in chart_data[date_key]["tasks"]:
                                chart_data[date_key]["tasks"][t.id] = {"id": t.id, "title": t.title, "time_spent": 0}
                            chart_data[date_key]["tasks"][t.id]["time_spent"] += day_dur

            # 2. Считаем пересечение с ПРОШЛОЙ неделей (prev_time для тренда)
            overlap_prev_start = max(st, prev_start_date)
            overlap_prev_end = min(en, prev_end_date)
            
            if overlap_prev_end > overlap_prev_start:
                dur_prev = int((overlap_prev_end - overlap_prev_start).total_seconds())
                prev_time += dur_prev
                
        if task_time_cur > 0:
            top_tasks_dict[t.id] = {"id": t.id, "title": t.title, "time_spent": task_time_cur}

    # --- Подготовка ответов ---
    # Топ задачи
    sorted_top = sorted(top_tasks_dict.values(), key=lambda x: x["time_spent"], reverse=True)[:3]
    top_tasks = []
    for tt in sorted_top:
        pct = (tt["time_spent"] / cur_time * 100) if cur_time > 0 else 0
        top_tasks.append(TopTask(id=tt["id"], title=tt["title"], time_spent=tt["time_spent"], percentage=round(pct, 1)))

    # Тренды (защита от деления на ноль)
    trend_time_pct = ((cur_time - prev_time) / prev_time * 100) if prev_time > 0 else (100.0 if cur_time > 0 else 0.0)
    trend_done_pct = ((cur_done - prev_done) / prev_done * 100) if prev_done > 0 else (100.0 if cur_done > 0 else 0.0)

    # Ищем лучший день (по времени)
    best_day_idx = None
    max_day_time = -1
    for k, v in chart_data.items():
        if v["time_spent"] > max_day_time and v["time_spent"] > 0:
            max_day_time = v["time_spent"]
            best_day_idx = v["day_name"]

    # Красивый лейбл даты с учетом локали
    lang = get_ui_settings().get("language", "ru")
    if lang == "ru":
        months = ["", "июня", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"]
        # Фикс: "января" вместо опечатки
        months[1] = "января" 
        label = f"{start_date.day} {months[start_date.month]} – {end_date.day} {months[end_date.month]}"
    else:
        months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        label = f"{months[start_date.month]} {start_date.day} – {months[end_date.month]} {end_date.day}"

    chart_array = []
    for k, v in chart_data.items():
        day_tasks = []
        for tk, tv in v["tasks"].items():
            pct = (tv["time_spent"] / v["time_spent"] * 100) if v["time_spent"] > 0 else 0
            day_tasks.append(TopTask(id=tv["id"], title=tv["title"], time_spent=tv["time_spent"], percentage=round(pct, 1)))
        
        # Сортируем задачи дня по убыванию времени
        day_tasks = sorted(day_tasks, key=lambda x: x.time_spent, reverse=True)
        chart_array.append(StatDay(date=k, day_name=v["day_name"], tasks_done=v["tasks_done"], time_spent=v["time_spent"], tasks=day_tasks))

    return StatisticsResponse(
        date_range_label=label,
        total_done=cur_done,
        total_time=cur_time,
        overdue_count=overdue_count,
        trend_done_pct=round(trend_done_pct, 1), # Теперь показывает реальную динамику по задачам
        trend_time_pct=round(trend_time_pct, 1),
        best_day=best_day_idx,
        chart_data=chart_array,
        top_tasks=top_tasks
    )


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
                
            vault_dir = Path(p)
            exists = False
            # Проверяем, что папка жива и в ней есть рабочая база
            if vault_dir.exists() and vault_dir.is_dir():
                if any(f for f in vault_dir.iterdir() if f.is_file() and (f.name.endswith(".db.doe") or f.name.endswith(".db")) and "backup" not in f.name and not f.name.startswith("._")):
                    exists = True

            name = vault_dir.name
            result.append({
                "name": name, 
                "path": p, 
                "last_opened": last_opened, 
                "exists": exists
            })
        except Exception:
            pass
    return result


class RelinkHistoryReq(BaseModel):
    old_path: str
    new_path: str

@router.post("/vault/history/relink")
async def relink_vault_history_endpoint(req: RelinkHistoryReq):
    vault_dir = Path(req.new_path)
    
    # 1. Проверяем валидность новой папки
    if not vault_dir.exists() or not vault_dir.is_dir():
        raise HTTPException(status_code=400, detail="INVALID_VAULT")
    if not any(f for f in vault_dir.iterdir() if f.is_file() and (f.name.endswith(".db.doe") or f.name.endswith(".db")) and "backup" not in f.name and not f.name.startswith("._")):
        raise HTTPException(status_code=400, detail="INVALID_VAULT")
        
    from src.core.config import _load_config, _save_config
    data = _load_config()
    history = data.get("vault_history", [])
    
    # 2. Проверяем на дубликат (если это хранилище уже есть в истории)
    for item in history:
        p = item if isinstance(item, str) else item.get("path")
        if p == req.new_path:
            raise HTTPException(status_code=409, detail="DUPLICATE_VAULT")
    
    # 3. Перепривязываем
    new_history = []
    for item in history:
        if isinstance(item, str):
            if item == req.old_path:
                new_history.append({"path": req.new_path, "last_opened": None})
            else:
                new_history.append(item)
        elif isinstance(item, dict):
            if item.get("path") == req.old_path:
                item["path"] = req.new_path
                new_history.append(item)
            else:
                new_history.append(item)
    
    data["vault_history"] = new_history
    _save_config(data)
    return {"success": True}


class RemoveHistoryReq(BaseModel):
    path: str

from src.core.config import get_active_reminders, remove_active_reminder, remove_all_vault_reminders

@router.post("/vault/history/remove")
async def remove_vault_history_endpoint(req: RemoveHistoryReq):
    # УДАЛЕНО: remove_all_vault_reminders(req.path) — при удалении пути из истории,
    # напоминания не должны уничтожаться на случай повторного открытия папки.
    remove_vault_from_history(req.path)
    return {"success": True}


@router.get("/reminders")
async def get_reminders_endpoint():
    """Возвращает список всех активных запланированных напоминаний."""
    return get_active_reminders()


# Внимание: путь меняется с {task_id} на {reminder_id}
@router.delete("/reminders/{reminder_id}")
async def cancel_reminder_endpoint(reminder_id: str):
    """Отменяет запланированное напоминание по его UUID."""
    remove_active_reminder(reminder_id)
    return {"success": True}


@router.get("/reminders/check")
async def check_reminder_status_endpoint(task_id: int):
    """Используется фоновым процессом для проверки, не было ли напоминание отменено."""
    reminders = get_active_reminders()
    is_active = any(r.get("task_id") == task_id for r in reminders)
    return {"active": is_active}

from sqlalchemy import text

# ==========================================
# ПАРСЕР БУЛЕВЫХ ВЫРАЖЕНИЙ ДЛЯ ПОИСКА
# ==========================================
# Грамматика (от слабого к сильному):
#   expr   := or_expr
#   or_expr  := and_expr ( '||' and_expr )*
#   and_expr := term ( ('&&' | <whitespace>) term )*
#   term     := '(' expr ')' | WORD
#
# Дерево: ('word', 'купить') | ('and', [t1, t2, ...]) | ('or', [t1, t2, ...])

def _tokenize_search(s: str):
    """Разбивает строку на токены: WORD, AND, OR, LPAREN, RPAREN."""
    tokens = []
    i = 0
    n = len(s)
    while i < n:
        ch = s[i]
        if ch.isspace():
            i += 1
            continue
        if ch == '(':
            tokens.append(('LPAREN', '('))
            i += 1
        elif ch == ')':
            tokens.append(('RPAREN', ')'))
            i += 1
        elif ch == '&' and i + 1 < n and s[i+1] == '&':
            tokens.append(('AND', '&&'))
            i += 2
        elif ch == '|' and i + 1 < n and s[i+1] == '|':
            tokens.append(('OR', '||'))
            i += 2
        else:
            # Слово — всё до пробела, скобки или оператора
            start = i
            while i < n and not s[i].isspace() and s[i] not in '()':
                # Останавливаемся перед && и ||
                if s[i] == '&' and i + 1 < n and s[i+1] == '&':
                    break
                if s[i] == '|' and i + 1 < n and s[i+1] == '|':
                    break
                i += 1
            word = s[start:i]
            if word:
                tokens.append(('WORD', word))
    return tokens


class _SearchParser:
    """Рекурсивный спуск для парсинга булевого выражения поиска."""
    def __init__(self, tokens):
        self.tokens = tokens
        self.pos = 0

    def peek(self):
        return self.tokens[self.pos] if self.pos < len(self.tokens) else (None, None)

    def consume(self):
        tok = self.peek()
        self.pos += 1
        return tok

    def parse(self):
        if not self.tokens:
            return None
        node = self.parse_or()
        return node

    def parse_or(self):
        left = self.parse_and()
        items = [left] if left else []
        while self.peek()[0] == 'OR':
            self.consume()
            right = self.parse_and()
            if right:
                items.append(right)
        if len(items) == 0:
            return None
        if len(items) == 1:
            return items[0]
        return ('or', items)

    def parse_and(self):
        left = self.parse_term()
        items = [left] if left else []
        # Неявный AND через пробел И явный через &&
        while True:
            tok = self.peek()
            if tok[0] == 'AND':
                self.consume()
                right = self.parse_term()
                if right:
                    items.append(right)
            elif tok[0] in ('WORD', 'LPAREN'):
                # Неявный AND (пробел между словами)
                right = self.parse_term()
                if right:
                    items.append(right)
            else:
                break
        if len(items) == 0:
            return None
        if len(items) == 1:
            return items[0]
        return ('and', items)

    def parse_term(self):
        tok = self.peek()
        if tok[0] == 'LPAREN':
            self.consume()
            node = self.parse_or()
            # Съедаем закрывающую скобку, если есть; если потерялась — терпим, не падаем
            if self.peek()[0] == 'RPAREN':
                self.consume()
            return node
        elif tok[0] == 'WORD':
            self.consume()
            return ('word', tok[1])
        return None


def _build_search_sql(node, field_exprs, params, counter=[0]):
    """
    Превращает дерево в SQL-условие.
    field_exprs — список SQL-выражений, по которым проверяется слово (например 
    ['LOWER_RU(t.title)', 'LOWER_RU(t.description)']). Слово ищется через OR
    между ними (т.е. слово найдено, если оно есть хотя бы в одном поле).
    """
    if node is None:
        return "1=1"
    
    kind = node[0]
    if kind == 'word':
        word = node[1].lower()
        key = f"w{counter[0]}"
        counter[0] += 1
        params[key] = f"%{word}%"
        field_or = " OR ".join(f"{fe} LIKE :{key}" for fe in field_exprs)
        return f"({field_or})"
    elif kind == 'and':
        parts = [_build_search_sql(child, field_exprs, params, counter) for child in node[1]]
        return "(" + " AND ".join(parts) + ")"
    elif kind == 'or':
        parts = [_build_search_sql(child, field_exprs, params, counter) for child in node[1]]
        return "(" + " OR ".join(parts) + ")"
    return "1=1"


def _collect_words(node):
    """Достаёт все слова из дерева — нужно для подсветки сниппетов."""
    if node is None:
        return []
    if node[0] == 'word':
        return [node[1]]
    result = []
    for child in node[1]:
        result.extend(_collect_words(child))
    return result

async def _search_by_tags(db: AsyncSession, inner: str):
    """
    Поиск карточек по тегам внутри описания.
    Тэг — это #имя на границе слов (т.е. #тест не сматчит #тестировщик).
    Возвращает только список карточек, без сниппетов.
    
    Поддерживает операторы:
      tags(#a, #b)      → A AND B (обратная совместимость с запятой)
      tags(#a && #b)    → A AND B
      tags(#a || #b)    → A OR B
      tags((#a || #b) && #c) → (A OR B) AND C
    """
    # Заменяем запятые на пробелы — старый синтаксис tags(#a, #b) превращается в неявный AND
    normalized = inner.replace(',', ' ')

    # Парсим выражение, где "словом" является сам тэг (без решётки)
    # Сначала вытаскиваем все имена тегов в правильном порядке
    tokens = _tokenize_search(normalized)
    
    # Превращаем токены WORD из вида "#имя" в "имя", остальные не-тэги отбрасываем
    cleaned = []
    for kind, val in tokens:
        if kind == 'WORD':
            if val.startswith('#') and len(val) > 1:
                cleaned.append(('WORD', val[1:].lower()))
            # Слова без # внутри tags(...) игнорируем — это мусор
        else:
            cleaned.append((kind, val))

    parser = _SearchParser(cleaned)
    tree = parser.parse()

    if tree is None:
        return {
            "workspaces": [], "columns": [], "tasks": [],
            "search_mode": "tags", "tags": []
        }

    all_tags = _collect_words(tree)

    # SQL pre-filter: грубо отсеиваем кандидатов через LIKE по дереву
    # Для тегов важна решётка → собираем условие сами с префиксом #
    params = {}
    counter = [0]
    
    def build_tag_sql(node):
        if node is None:
            return "1=1"
        kind = node[0]
        if kind == 'word':
            tag = node[1]
            key = f"tag{counter[0]}"
            counter[0] += 1
            params[key] = f"%#{tag}%"
            return f"LOWER_RU(t.description) LIKE :{key}"
        parts = [build_tag_sql(child) for child in node[1]]
        op = " AND " if kind == 'and' else " OR "
        return "(" + op.join(parts) + ")"
    
    where_sql = build_tag_sql(tree)

    sql = text(f"""
        SELECT t.id, t.title, t.column_id, c.title, c.workspace_id, w.name, t.description
        FROM tasks t
        JOIN columns c ON t.column_id = c.id
        JOIN workspaces w ON c.workspace_id = w.id
        WHERE t.description IS NOT NULL AND {where_sql}
        ORDER BY t.updated_at DESC
        LIMIT 50
    """)

    # Python post-filter: проверяем дерево на точные границы тегов
    def eval_tree_for_tags(node, desc):
        if node is None:
            return True
        kind = node[0]
        if kind == 'word':
            tag = node[1]
            return bool(re.search(r'(?<!\w)#' + re.escape(tag) + r'(?!\w)', desc, re.IGNORECASE))
        if kind == 'and':
            return all(eval_tree_for_tags(c, desc) for c in node[1])
        if kind == 'or':
            return any(eval_tree_for_tags(c, desc) for c in node[1])
        return False

    tasks = []
    try:
        res = await db.execute(sql, params)
        rows = res.fetchall()

        for r in rows:
            desc = r[6] or ""
            if eval_tree_for_tags(tree, desc):
                tasks.append({
                    "id": r[0],
                    "title": r[1],
                    "column_id": r[2],
                    "column_title": r[3],
                    "workspace_id": r[4],
                    "workspace_name": r[5],
                    "snippet": "",
                    "type": "task"
                })
    except Exception as e:
        import traceback
        print(f"[Search] Tag query failed: {e}")
        traceback.print_exc()

    return {
        "workspaces": [], "columns": [], "tasks": tasks,
        "search_mode": "tags", "tags": all_tags
    }

@router.get("/search")
async def global_search(q: str, db: AsyncSession = Depends(get_session)):
    """
    Глобальный поиск:
    - Регистронезависимый для любых языков (через LOWER_RU + Python str.lower)
    - Многословный AND: все слова должны быть найдены
    - Внутри карточки: каждое слово ищется в title ИЛИ description
    - Сниппет с подсветкой первого вхождения для удобства
    - Спец-режим тегов: tags(#tag1, #tag2) — возвращает только список карточек
    """
    if not q or len(q.strip()) < 2:
        return {"workspaces": [], "columns": [], "tasks": []}

    raw_q = q.strip()

    # === Спец-режим: поиск по тегам ===
    tag_match = re.match(r'^tags\s*\(\s*(.+?)\s*\)\s*$', raw_q, re.IGNORECASE)
    if tag_match:
        return await _search_by_tags(db, tag_match.group(1))

    # === Обычный режим с поддержкой && и || ===
    tokens = _tokenize_search(raw_q)
    parser = _SearchParser(tokens)
    tree = parser.parse()

    if tree is None:
        return {"workspaces": [], "columns": [], "tasks": []}

    # Все слова — для подсветки сниппетов и фильтрации вкладок/колонок
    all_words = _collect_words(tree)
    if not all_words:
        return {"workspaces": [], "columns": [], "tasks": []}

    # 1. Воркспейсы — ищем по дереву, поля только name
    ws_params = {}
    ws_where = _build_search_sql(tree, ["LOWER_RU(name)"], ws_params, [0])
    ws_sql = text(f"SELECT id, name FROM workspaces WHERE {ws_where} LIMIT 5")
    ws_res = await db.execute(ws_sql, ws_params)
    workspaces = [
        {"id": r[0], "name": r[1], "type": "workspace"}
        for r in ws_res.fetchall()
    ]

    # 2. Колонки — по дереву, поле c.title
    col_params = {}
    col_where = _build_search_sql(tree, ["LOWER_RU(c.title)"], col_params, [0])
    col_sql = text(f"""
        SELECT c.id, c.title, c.workspace_id, w.name 
        FROM columns c 
        JOIN workspaces w ON c.workspace_id = w.id 
        WHERE {col_where}
        LIMIT 5
    """)
    col_res = await db.execute(col_sql, col_params)
    columns = [
        {"id": r[0], "title": r[1], "workspace_id": r[2], "workspace_name": r[3], "type": "column"}
        for r in col_res.fetchall()
    ]

    # 3. Карточки — по дереву, ищем в title ИЛИ description
    task_params = {}
    where_sql = _build_search_sql(
        tree,
        ["LOWER_RU(t.title)", "LOWER_RU(t.description)"],
        task_params, [0]
    )

    task_sql = text(f"""
        SELECT 
            t.id, 
            t.title, 
            t.column_id, 
            c.title AS col_title, 
            c.workspace_id, 
            w.name AS ws_name,
            t.description AS full_desc
        FROM tasks t
        JOIN columns c ON t.column_id = c.id
        JOIN workspaces w ON c.workspace_id = w.id
        WHERE {where_sql}
        ORDER BY t.updated_at DESC
        LIMIT 30
    """)

    words_lower = [w.lower() for w in all_words]

    tasks = []
    try:
        task_res = await db.execute(task_sql, task_params)
        rows = task_res.fetchall()

        for r in rows:
            full_desc = r[6] or ""
            snippet_text = ""

            if full_desc:
                lower_desc = full_desc.lower()
                # Ищем самое раннее вхождение любого из слов
                first_hit_pos = -1
                first_hit_word = None
                for w in words_lower:
                    pos = lower_desc.find(w)
                    if pos != -1 and (first_hit_pos == -1 or pos < first_hit_pos):
                        first_hit_pos = pos
                        first_hit_word = w

                if first_hit_pos != -1:
                    start = max(0, first_hit_pos - 30)
                    end = min(len(full_desc), first_hit_pos + len(first_hit_word) + 50)
                    snippet_text = full_desc[start:end].strip()

                    # Подсветка всех слов запроса в сниппете
                    for w in all_words:
                        pattern = re.compile(re.escape(w), re.IGNORECASE)
                        snippet_text = pattern.sub(
                            lambda m: f"<mark>{m.group(0)}</mark>",
                            snippet_text
                        )

            tasks.append({
                "id": r[0],
                "title": r[1],
                "column_id": r[2],
                "column_title": r[3],
                "workspace_id": r[4],
                "workspace_name": r[5],
                "snippet": snippet_text,
                "type": "task"
            })
    except Exception as e:
        import traceback
        print(f"[Search] LIKE query failed: {e}")
        traceback.print_exc()
        tasks = []

    return {"workspaces": workspaces, "columns": columns, "tasks": tasks}


@router.get("/graph")
async def get_graph(db: AsyncSession = Depends(get_session)):
    """Возвращает граф связей: узлы (карточки) и рёбра (связи родитель → потомок)."""
    edges_res = await db.execute(text("SELECT parent_id, child_id FROM task_relations"))
    edge_rows = edges_res.fetchall()

    edges = []
    degree = {}
    for r in edge_rows:
        pid, cid = r[0], r[1]
        edges.append({"source": pid, "target": cid})
        degree[pid] = degree.get(pid, 0) + 1
        degree[cid] = degree.get(cid, 0) + 1

    # Берём ВСЕ карточки (а не только участвующие в связях),
    # чтобы одиночные карточки показывались отдельными точками (degree = 0).
    nodes = []
    nodes_res = await db.execute(text("""
        SELECT t.id, t.title, t.column_id, c.workspace_id
        FROM tasks t
        JOIN columns c ON t.column_id = c.id
    """))
    for row in nodes_res.fetchall():
        nodes.append({
            "id": row[0],
            "title": row[1],
            "column_id": row[2],
            "workspace_id": row[3],
            "degree": degree.get(row[0], 0)
        })

    return {"nodes": nodes, "edges": edges}


from sqlalchemy.orm import selectinload

@router.get("/calendar")
async def get_calendar_events(db: AsyncSession = Depends(get_session)):
    """Возвращает все задачи с дедлайном и/или сессиями учета времени для календаря."""
    from src.db.models import TaskModel, ColumnModel
    from sqlalchemy import or_
    from datetime import datetime
    
    stmt = select(TaskModel).options(
        selectinload(TaskModel.timer_sessions),
        selectinload(TaskModel.column)
    ).where(
        or_(TaskModel.due_date.isnot(None), TaskModel.timer_sessions.any())
    )
    
    res = await db.execute(stmt)
    tasks = res.scalars().unique().all()
    
    events = []
    now = datetime.utcnow()

    for t in tasks:
        has_timers = len(t.timer_sessions) > 0
        
        # 1. Добавляем блоки таймера (Toggl Track style)
        for s in t.timer_sessions:
            start_time = s.start_time
            end_time = s.end_time if s.end_time else now
            duration = int((end_time - start_time).total_seconds())
            
            events.append({
                "event_id": f"session_{s.id}",
                "id": t.id,
                "title": t.title,
                "due_date": start_time.isoformat() + 'Z',
                "completed": t.completed_at is not None,
                "column_id": t.column_id,
                "workspace_id": t.column.workspace_id if t.column else None,
                "duration": duration,
                "is_active": s.is_active
            })
            
        # 2. Добавляем блок дедлайна, если нет таймеров (для обратной совместимости планирования)
        if t.due_date and not has_timers:
            events.append({
                "event_id": f"deadline_{t.id}",
                "id": t.id,
                "title": t.title,
                "due_date": t.due_date.isoformat() + 'Z',
                "completed": t.completed_at is not None,
                "column_id": t.column_id,
                "workspace_id": t.column.workspace_id if t.column else None,
                "duration": 3600,  # Дефолтная длительность 1 час для дедлайнов без таймера
                "is_active": False
            })
            
    return events

# ==========================================
# WEBSOCKET ДЛЯ ICLOUD SYNC
# ==========================================
@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Канал связи с фронтендом для передачи эвентов от ОС (iCloud Sync)"""
    await ws_manager.connect(websocket)
    try:
        while True:
            # Просто держим соединение живым
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)

import ctypes
from ctypes import wintypes

def get_system_font_families() -> list[str]:
    """
    Возвращает список всех зарегистрированных в системе семейств шрифтов.
    Работает нативно без сторонних тяжелых библиотек.
    """
    families = set()
    
    if sys.platform == 'darwin':
        try:
            import AppKit
            manager = AppKit.NSFontManager.sharedFontManager()
            for f in manager.availableFontFamilies():
                families.add(str(f))
        except Exception as e:
            print(f"[Fonts] macOS AppKit font query failed: {e}")
            
    elif sys.platform == 'win32':
        try:
            # Описываем структуры GDI Windows для EnumFontFamiliesExW
            LF_FACESIZE = 32
            LF_FULLFACESIZE = 64

            class LOGFONTW(ctypes.Structure):
                _fields_ = [
                    ("lfHeight", wintypes.LONG),
                    ("lfWidth", wintypes.LONG),
                    ("lfEscapement", wintypes.LONG),
                    ("lfOrientation", wintypes.LONG),
                    ("lfWeight", wintypes.LONG),
                    ("lfItalic", ctypes.c_byte),
                    ("lfUnderline", ctypes.c_byte),
                    ("lfStrikeOut", ctypes.c_byte),
                    ("lfCharSet", ctypes.c_byte),
                    ("lfOutPrecision", ctypes.c_byte),
                    ("lfClipPrecision", ctypes.c_byte),
                    ("lfQuality", ctypes.c_byte),
                    ("lfPitchAndFamily", ctypes.c_byte),
                    ("lfFaceName", wintypes.WCHAR * LF_FACESIZE),
                ]

            class ENUMLOGFONTEXW(ctypes.Structure):
                _fields_ = [
                    ("elfLogFont", LOGFONTW),
                    ("elfFullName", wintypes.WCHAR * LF_FULLFACESIZE),
                    ("elfStyle", wintypes.WCHAR * LF_FACESIZE),
                    ("elfScript", wintypes.WCHAR * LF_FACESIZE),
                ]

            FONT_ENUM_PROC = ctypes.WINFUNCTYPE(
                ctypes.c_int,
                ctypes.POINTER(ENUMLOGFONTEXW),
                ctypes.c_void_p,
                wintypes.DWORD,
                wintypes.LPARAM
            )

            def callback_proc(lpelfe, lpntme, font_type, lparam):
                face_name = lpelfe.contents.elfLogFont.lfFaceName
                # Игнорируем вертикальные шрифты для азиатских языков (начинаются с @)
                if face_name and not face_name.startswith('@'):
                    families.add(face_name)
                return 1

            hdc = ctypes.windll.user32.GetDC(None)
            logfont = LOGFONTW()
            logfont.lfCharSet = 1  # DEFAULT_CHARSET
            logfont.lfFaceName = ""

            c_callback = FONT_ENUM_PROC(callback_proc)
            ctypes.windll.gdi32.EnumFontFamiliesExW(
                hdc,
                ctypes.byref(logfont),
                c_callback,
                0,
                0
            )
            ctypes.windll.user32.ReleaseDC(None, hdc)
        except Exception as e:
            print(f"[Fonts] Windows GDI font query failed: {e}")

    if not families:
        # Фолбэк на случай непредвиденных сбоев API
        return [
            "Inter", "Roboto", "Open Sans", "Segoe UI",
            "Helvetica Neue", "Arial", "Georgia", "Times New Roman",
            "Courier New", "Consolas", "Comic Sans MS", "JetBrains Mono"
        ]

    return sorted(list(families))


@router.get("/fonts/available", response_model=list[str])
async def get_available_fonts():
    """Эндпоинт для получения списка установленных в ОС шрифтов."""
    return get_system_font_families()

class ExportJsonReq(BaseModel):
    path: str
    include_codebase: bool = False

@router.post("/export-json")
async def export_json_endpoint(req: ExportJsonReq, db: AsyncSession = Depends(get_session)):
    target_dir = Path(req.path)
    if not target_dir.exists() or not target_dir.is_dir():
        raise HTTPException(status_code=400, detail="Invalid directory")

    ws_res = await db.execute(select(WorkspaceModel))
    workspaces = ws_res.scalars().all()
    
    col_res = await db.execute(select(ColumnModel))
    columns = col_res.scalars().all()
    
    # .unique() строго обязательно для selectinload в асинхронном режиме SQLAlchemy
    task_res = await db.execute(select(TaskModel).options(
        selectinload(TaskModel.parents),
        selectinload(TaskModel.timer_sessions)
    ))
    tasks = task_res.scalars().unique().all()
    
    # Сборка плоского семантического DTO
    data = {
        "metadata": {
            "app": "Doe Kanban",
            "version": "1.0",
            "exported_at": datetime.utcnow().isoformat() + "Z"
        },
        "workspaces": [
            {"ref_id": w.id, "name": w.name, "position": w.position, "created_at": _fmt_dt(w.created_at)} for w in workspaces
        ],
        "columns": [
            {
                "ref_id": c.id, "workspace_ref": c.workspace_id, 
                "title": c.title, "mode": c.mode.value, 
                "position": c.position, "collapsed": c.collapsed,
                "created_at": _fmt_dt(c.created_at), "updated_at": _fmt_dt(c.updated_at)
            } for c in columns
        ],
        "tasks": [
            {
                "ref_id": t.id, "column_ref": t.column_id, "title": t.title,
                "description": t.description, "position": t.position,
                "completed_at": _fmt_dt(t.completed_at), "due_date": _fmt_dt(t.due_date),
                "priority": t.priority,
                "priority_data": t.priority_data,
                "is_visible_on_board": t.is_visible_on_board,
                "attachments_order": _ensure_list(t.attachments_order),
                "folded_headings": _ensure_list(t.folded_headings),
                "created_at": _fmt_dt(t.created_at), "updated_at": _fmt_dt(t.updated_at),
                "parent_refs": [p.id for p in t.parents],
                "timer_sessions": [
                    {
                        "start_time": _fmt_dt(s.start_time),
                        "end_time": _fmt_dt(s.end_time),
                        "is_active": s.is_active
                    } for s in t.timer_sessions
                ]
            } for t in tasks
        ]
    }
    
    export_file = target_dir / f"doe_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    
    # Выполняем синхронную запись файла в отдельном системном потоке, сохраняя отзывчивость UI
    def _save_file():
        with open(export_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            
        if req.include_codebase:
            codebase_folder_name = f"Doe_Source_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            codebase_export_dir = target_dir / codebase_folder_name
            
            if getattr(sys, 'frozen', False):
                # В релизной сборке извлекаем подготовленный чистый zip-архив
                zip_path = Path(sys._MEIPASS) / "doe_source.zip"
                if zip_path.exists():
                    import zipfile
                    try:
                        with zipfile.ZipFile(zip_path, 'r') as zf:
                            zf.extractall(codebase_export_dir)
                        print(f"[Export] Codebase extracted to {codebase_folder_name}")
                    except Exception as e:
                        print(f"[Export] Failed to extract codebase archive: {e}")
                else:
                    print("[Export] doe_source.zip not found in bundled app.")
            else:
                # В режиме разработки копируем файлы как обычно
                src_root = Path(__file__).resolve().parents[3]
                
                def _copy_recursive(src_path: Path, dst_path: Path):
                    ignore_names = {
                        'venv', '.git', '__pycache__', 'node_modules', 
                        '.idea', '.vscode', 'build', 'dist', '__MACOSX',
                        'board_dev.db', 'board_dev.db.doe', 'Doe.app'
                    }
                    ignore_exts = {
                        '.db', '.sqlite', '.sqlite3', '.pyc', '.DS_Store', 
                        '.zip', '.tar', '.gz'
                    }
                    
                    dst_path.mkdir(parents=True, exist_ok=True)
                    for item in src_path.iterdir():
                        if item.name in ignore_names or item.suffix in ignore_exts or item.name == 'doe_source.zip':
                            continue
                        if item.is_dir():
                            _copy_recursive(item, dst_path / item.name)
                        elif item.is_file():
                            try:
                                shutil.copy2(item, dst_path / item.name)
                            except Exception as e:
                                print(f"[Export Codebase] Error copying file {item.name}: {e}")

                try:
                    _copy_recursive(src_root, codebase_export_dir)
                    print(f"[Export] Codebase copied to {codebase_folder_name}")
                except Exception as e:
                    print(f"[Export] Failed to copy codebase: {e}")
            
    await anyio.to_thread.run_sync(_save_file)
    return {"success": True, "file": str(export_file)}

class ImportJsonReq(BaseModel):
    path: str

@router.post("/import-json")
async def import_json_endpoint(req: ImportJsonReq, db: AsyncSession = Depends(get_session)):
    file_path = Path(req.path)
    if not file_path.exists() or file_path.suffix.lower() != '.json':
        raise HTTPException(status_code=400, detail="Invalid JSON file")
        
    # Считывание файла в фоновом потоке
    def _read_file():
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
            
    try:
        data = await anyio.to_thread.run_sync(_read_file)
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to parse JSON")
        
    if data.get("metadata", {}).get("app") != "Doe Kanban":
        raise HTTPException(status_code=400, detail="Not a Doe Kanban export file")

    # Временно останавливаем фонового наблюдателя за БД.
    # Это предотвращает коллизии SQLite-транзакций и ложные перезагрузки фронтенда во время массового импорта.
    vault_observer.stop()
    
    try:
        # Избегаем коллизий: сдвигаем позиции воркспейсов
        max_ws_res = await db.execute(select(WorkspaceModel.position).order_by(WorkspaceModel.position.desc()).limit(1))
        max_ws_pos = max_ws_res.scalar()
        if max_ws_pos is None:
            max_ws_pos = 0.0
        ws_offset = max_ws_pos + 1.0

        ws_map = {}
        col_map = {}
        col_modes_map = {} # Карта режимов колонок для отслеживания бизнес-логики таймеров
        task_map = {}
        first_new_ws_id = None
        
        # Получаем фолбэк-время экспорта
        exported_at_dt = _parse_dt(data.get("metadata", {}).get("exported_at")) or datetime.utcnow()

        # 1. Воркспейсы
        for ws_data in data.get("workspaces", []):
            ws_pos = ws_data.get("position")
            if ws_pos is None:
                ws_pos = 0.0
                
            ws_kwargs = _filter_model_kwargs(WorkspaceModel, {
                "name": ws_data["name"], # Вызовет KeyError, если поле отсутствует в JSON
                "position": ws_pos + ws_offset,
                "created_at": _parse_dt(ws_data.get("created_at")) or datetime.utcnow()
            })
            new_ws = WorkspaceModel(**ws_kwargs)
            db.add(new_ws)
            await db.flush() # Выполняем flush, чтобы БД выдала нам реальный ID
            # Принудительное приведение к строке страхует от несовпадения типов в словаре маппинга (str vs int)
            ws_map[str(ws_data["ref_id"])] = new_ws.id
            if first_new_ws_id is None:
                first_new_ws_id = new_ws.id
            
        # 2. Колонки
        from src.db.models import ColumnMode
        for col_data in data.get("columns", []):
            old_ws_ref = str(col_data.get("workspace_ref"))
            if old_ws_ref not in ws_map:
                continue
                
            raw_mode = col_data.get("mode", "default")
            try:
                db_mode = ColumnMode(raw_mode)
            except ValueError:
                db_mode = ColumnMode.DEFAULT
                
            col_pos = col_data.get("position")
            if col_pos is None:
                col_pos = 0.0
                
            col_collapsed = col_data.get("collapsed")
            if col_collapsed is None:
                col_collapsed = False
                
            col_kwargs = _filter_model_kwargs(ColumnModel, {
                "title": col_data["title"], # Вызовет KeyError, если поле отсутствует в JSON
                "mode": db_mode,
                "position": col_pos,
                "collapsed": col_collapsed,
                "workspace_id": ws_map[old_ws_ref],
                "created_at": _parse_dt(col_data.get("created_at")) or datetime.utcnow(),
                "updated_at": _parse_dt(col_data.get("updated_at")) or datetime.utcnow()
            })
            new_col = ColumnModel(**col_kwargs)
            db.add(new_col)
            await db.flush()
            col_id_str = str(new_col.id)
            col_map[str(col_data["ref_id"])] = new_col.id
            col_modes_map[str(col_data["ref_id"])] = db_mode # Накапливаем режимы для последующего импорта задач
            
        # 3. Задачи и Таймеры
        tasks_to_link = []
        for task_data in data.get("tasks", []):
            old_col_ref = task_data.get("column_ref")
            if old_col_ref is None or str(old_col_ref) not in col_map:
                continue
                
            task_pos = task_data.get("position")
            if task_pos is None:
                task_pos = 0.0
                
            is_visible = task_data.get("is_visible_on_board")
            if is_visible is None:
                is_visible = False
                
            # Проверяем, импортируем ли мы карточку в колонку учета времени
            is_track_time_column = (col_modes_map.get(str(old_col_ref)) == ColumnMode.TRACK_TIME)
                
            task_kwargs = _filter_model_kwargs(TaskModel, {
                "title": task_data["title"], # Вызовет KeyError, если поле отсутствует в JSON
                "description": task_data.get("description"),
                "position": task_pos,
                "column_id": col_map[str(old_col_ref)],
                "completed_at": _parse_dt(task_data.get("completed_at")),
                "due_date": _parse_dt(task_data.get("due_date")),
                "priority": task_data.get("priority"),
                "priority_data": task_data.get("priority_data"),
                "is_visible_on_board": is_visible,
                "attachments_order": _ensure_list(task_data.get("attachments_order")),
                "folded_headings": _ensure_list(task_data.get("folded_headings")),
                "created_at": _parse_dt(task_data.get("created_at")) or datetime.utcnow(),
                "updated_at": _parse_dt(task_data.get("updated_at")) or datetime.utcnow()
            })
            new_task = TaskModel(**task_kwargs)
            db.add(new_task)
            await db.flush()
            task_map[str(task_data["ref_id"])] = new_task.id
            
            has_active_session_in_json = False
            for timer_data in task_data.get("timer_sessions", []):
                st = _parse_dt(timer_data.get("start_time")) or datetime.utcnow()
                et = _parse_dt(timer_data.get("end_time"))
                is_act = bool(timer_data.get("is_active", False))
                
                # Если колонка требует учета времени и сессия была активна при экспорте — сохраняем ее активной
                if is_track_time_column and is_act and et is None:
                    new_is_active = True
                    new_end_time = None
                    has_active_session_in_json = True
                else:
                    # В обычных колонках или для архивных сессий — глушим/сохраняем архивный статус
                    new_is_active = False
                    new_end_time = et or exported_at_dt
                    
                timer_kwargs = _filter_model_kwargs(TimerSessionModel, {
                    "task_id": new_task.id,
                    "start_time": st,
                    "end_time": new_end_time,
                    "is_active": new_is_active
                })
                new_timer = TimerSessionModel(**timer_kwargs)
                db.add(new_timer)
                
            # Если колонка — учет времени, но в бэкапе для задачи не было активной сессии,
            # принудительно запускаем таймер с текущего момента, соблюдая бизнес-логику доски
            if is_track_time_column and not has_active_session_in_json:
                new_active_timer = TimerSessionModel(
                    task_id=new_task.id,
                    start_time=datetime.utcnow(),
                    end_time=None,
                    is_active=True
                )
                db.add(new_active_timer)
                
            # Защита от Null Boolean Bug в списке связей родительских задач
            parent_refs = task_data.get("parent_refs")
            if not isinstance(parent_refs, list):
                parent_refs = []
                
            tasks_to_link.append((new_task.id, parent_refs))
            
        # 4. Восстановление Графа Связей через пакетную вставку (Bulk Insert)
        relations_to_insert = []
        for new_task_id, old_parent_refs in tasks_to_link:
            # set() исключает ошибку дублирования ключей связи (UniqueConstraint) в поврежденном JSON
            for old_pid in set(old_parent_refs):
                old_pid_str = str(old_pid)
                if old_pid_str in task_map:
                    new_pid = task_map[old_pid_str]
                    # Защита от циклической ссылки на саму себя
                    if new_pid != new_task_id:
                        relations_to_insert.append({
                            "parent_id": new_pid,
                            "child_id": new_task_id
                        })
                        
        if relations_to_insert:
            # Выполняем ОДИН пакетный SQL-запрос для всех связей вместо O(N) запросов в цикле
            await db.execute(task_relations.insert(), relations_to_insert)
                    
        await db.commit()
    except KeyError as ke:
        # Информативный перехват ошибок структуры JSON: сообщаем фронтенду точное имя отсутствующего поля
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail=f"Missing required field: {ke.args[0]}"
        )
    except Exception as e:
        # Гарантируем мгновенный откат транзакции SQLite для предотвращения Transaction Lock
        await db.rollback()
        raise e
    finally:
        # Защищаем блок finally от падения в случае, если папка была удалена/изменена во время импорта
        try:
            # Восстанавливаем работу фонового наблюдателя за БД
            vault_observer.start(get_active_vault())
        except Exception as obs_err:
            print(f"[System] Watchdog restart bypassed: {obs_err}")
        
    return {"success": True, "new_workspace_id": first_new_ws_id}
