from fastapi import APIRouter, HTTPException, status
from pathlib import Path
import os

from src.core.config import get_vault_history, remove_vault_from_history, reorder_vault_history
from src.core.config import get_active_vault, set_active_vault
from src.db.database import switch_vault, is_database_open
from src.core import vault_crypto, fs_store
from src.schemas.system import (
    HighlightReq, ReorderHistoryReq, VaultResponse, SwitchVaultRequest,
    CreateVaultRequest, RelinkHistoryReq, RemoveHistoryReq,
)

router = APIRouter(tags=["vault"])


def _is_vault_db_file(name: str) -> bool:
    """
    Признак того, что папка — хранилище Doe: обычный файл БД или зашифрованный
    контейнер (.doelock). Имена контейнеров случайные (не содержат '.db.doe'),
    поэтому достаточно самого расширения .doelock.
    """
    return (
        name.endswith(".db.doe")
        or name.endswith(".db")
        or name.endswith(vault_crypto.ENC_SUFFIX)
    )

# Очередь для передачи событий от ОС к фронтенду
pending_highlights = []


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


@router.post("/vault/history/reorder")
async def reorder_vault_history_endpoint(req: ReorderHistoryReq):
    reorder_vault_history(req.ordered_paths)
    return {"success": True}


@router.get("/vault", response_model=VaultResponse)
async def get_vault():
    path = get_active_vault()

    if not path or not Path(path).exists():
        return VaultResponse(
            name=None, path=None, canceled=False, already_active=False
        )

    # 🔐 Защищённое хранилище без введённого пароля не считается "открытым":
    # фронтенд обязан показать экран выбора и запросить пароль.
    if vault_crypto.is_protected(path) and vault_crypto.get_session_key(path) is None:
        return VaultResponse(
            name=None, path=None, canceled=False, already_active=False
        )

    # 🛑 СТРОГАЯ ПРОВЕРКА: Является ли папка реальным хранилищем Doe?
    has_db = any(
        f for f in Path(path).iterdir()
        if f.is_file() and _is_vault_db_file(f.name) and "backup" not in f.name and not f.name.startswith("._")
    )
    if not has_db:
        has_db = fs_store.has_board_marker(path)

    if not has_db:
        return VaultResponse(
            name=None, path=None, canceled=False, already_active=False
        )

    name = Path(path).resolve().name
    return VaultResponse(name=name, path=path)


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
        if f.is_file() and _is_vault_db_file(f.name) and "backup" not in f.name and not f.name.startswith("._")
    )
    if not has_db:
        has_db = fs_store.has_board_marker(str(vault_dir))

    if not has_db:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="INVALID_VAULT")
    # -------------------------------------

    # 🔐 Защищённое хранилище открывается только после ввода пароля (/vault/unlock)
    if vault_crypto.is_protected(new_path) and vault_crypto.get_session_key(new_path) is None:
        raise HTTPException(status_code=status.HTTP_423_LOCKED, detail="VAULT_LOCKED")

    from src.core.config import get_active_vault, set_active_vault
    import os
    current_vault = get_active_vault()

    # 🐛 ФИКС: Безопасная проверка на None при холодном старте
    if current_vault is None:
        already_active = False
    else:
        already_active = (os.path.normpath(new_path) == os.path.normpath(current_vault))

    # 🔐 После лока (выход на экран выбора) БД закрыта, даже если путь совпадает —
    # требуется полная реинициализация.
    if already_active and not is_database_open():
        already_active = False

    if not already_active:
        try:
            await switch_vault(new_path)
        except PermissionError:
            raise HTTPException(status_code=status.HTTP_423_LOCKED, detail="VAULT_LOCKED")
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
                    # 🔒 Без сетевого сервера окно грузится из локального файла
                    # (file://). Собираем актуальный board-URL через wrapper.
                    import sys as _sys_nav
                    _wrapper = _sys_nav.modules.get('wrapper') or _sys_nav.modules.get('__main__')
                    if _wrapper and hasattr(_wrapper, 'runtime_index_url'):
                        target_url = _wrapper.runtime_index_url('board')
                    else:
                        target_url = 'about:blank'

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
                                    
                                    # 1. Снимаем внутренние тиски .NET Form.MaximumSize
                                    try:
                                        from webview.platforms.winforms import BrowserView
                                        from System.Drawing import Size
                                        if webview.windows:
                                            bv = BrowserView.instances.get(webview.windows[0].uid)
                                            if bv:
                                                bv.MinimumSize = Size(800, 600)
                                                bv.MaximumSize = Size(0, 0) # 0,0 в WinForms = безлимит!
                                    except Exception as ex_form:
                                        print(f"[System] WinForms unclamp bypassed: {ex_form}")

                                    # 2. Внедряем нативные стили ресайза WinAPI
                                    hwnd = ctypes.windll.user32.FindWindowW(None, target_window.title)
                                    if not hwnd:
                                        hwnd = ctypes.windll.user32.FindWindowW(None, 'Doe — Select Vault')
                                    
                                    if hwnd:
                                        style = ctypes.windll.user32.GetWindowLongW(hwnd, -16)
                                        # WS_THICKFRAME (ресайз) | WS_MAXIMIZEBOX | WS_MINIMIZEBOX
                                        ctypes.windll.user32.SetWindowLongW(hwnd, -16, style | 0x00040000 | 0x00010000 | 0x00020000)
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

    return VaultResponse(
        name=name, 
        path=new_path, 
        canceled=False, 
        already_active=already_active
    )


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


@router.get("/startup-status")
async def startup_status_endpoint():
    """
    Состояние фоновой инициализации хранилища при старте приложения:
    'starting' — миграции/открытие БД ещё идут (фронтенд показывает прогресс),
    'ready' — можно загружать доску, 'no_vault' — экран выбора хранилищ,
    'error' — инициализация не удалась (фронтенд уйдёт на экран выбора).
    """
    from src.db.database import startup_state
    return {"state": startup_state["state"]}


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
            # Проверяем, что папка жива и в ней есть рабочая база (в т.ч. зашифрованная)
            if vault_dir.exists() and vault_dir.is_dir():
                if any(f for f in vault_dir.iterdir() if f.is_file() and _is_vault_db_file(f.name) and "backup" not in f.name and not f.name.startswith("._")):
                    exists = True
                elif fs_store.has_board_marker(str(vault_dir)):
                    exists = True

            name = vault_dir.name
            result.append({
                "name": name,
                "path": p,
                "last_opened": last_opened,
                "exists": exists,
                "protected": exists and vault_crypto.is_protected(p)
            })
        except Exception:
            pass
    return result


@router.post("/vault/history/relink")
async def relink_vault_history_endpoint(req: RelinkHistoryReq):
    vault_dir = Path(req.new_path)
    
    # 1. Проверяем валидность новой папки
    if not vault_dir.exists() or not vault_dir.is_dir():
        raise HTTPException(status_code=400, detail="INVALID_VAULT")
    if not any(f for f in vault_dir.iterdir() if f.is_file() and _is_vault_db_file(f.name) and "backup" not in f.name and not f.name.startswith("._")):
        if not fs_store.has_board_marker(str(vault_dir)):
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


@router.post("/vault/history/remove")
async def remove_vault_history_endpoint(req: RemoveHistoryReq):
    # УДАЛЕНО: remove_all_vault_reminders(req.path) — при удалении пути из истории,
    # напоминания не должны уничтожаться на случай повторного открытия папки.
    remove_vault_from_history(req.path)
    return {"success": True}
