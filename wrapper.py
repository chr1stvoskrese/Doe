import sys
import subprocess
import os
import time
import json

if sys.platform.startswith('linux'):
    os.environ['WEBKIT_DISABLE_COMPOSITING_MODE'] = '1'
import urllib.request
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

# === КРИТИЧЕСКИЙ ФИКС ДЛЯ MACOS + PYINSTALLER + LLAMA.CPP ===
# macOS даёт фоновым потокам всего 512 KB памяти (в отличие от 8 MB для главного).
# При аллокации графа нейросети в asyncio.to_thread стек переполняется и приложение падает (SIGABRT).
# Заставляем Python создавать фоновые потоки с 8 MB памяти:
if sys.platform == 'darwin':
    threading.stack_size(8 * 1024 * 1024)
# ============================================================

# DPI FIX (Windows, 4K/мульти-мониторы): объявляем Per-Monitor V2 awareness

# DPI FIX (Windows, 4K/мульти-мониторы): объявляем Per-Monitor V2 awareness
# ДО создания первого окна. Без этого при запуске `python wrapper.py` Windows
# виртуализирует координаты со скейлингом, и сохранённая геометрия означает
# разные физические размеры в разных запусках ("ерунда с размерами").
if sys.platform == 'win32':
    import ctypes
    try:
        # Per-Monitor V2 (Windows 10 1703+): у каждого монитора свой DPI
        ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
    except Exception:
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(2)  # Per-Monitor (8.1+)
        except Exception:
            try:
                ctypes.windll.user32.SetProcessDPIAware()  # System-aware (легаси)
            except Exception:
                pass

# =========================================================================
# 1. ФОНОВЫЙ РЕЖИМ (WORKER) - Срабатывает мгновенно, без загрузки UI
# =========================================================================
if len(sys.argv) >= 8 and sys.argv[1] == "--worker":
    if sys.platform == 'darwin':
        try:
            import AppKit
            _wapp = AppKit.NSApplication.sharedApplication()
            _wapp.setActivationPolicy_(AppKit.NSApplicationActivationPolicyProhibited)
            _wapp.setActivationPolicy_(AppKit.NSApplicationActivationPolicyAccessory)
        except Exception:
            pass

    due_time_iso = sys.argv[2]
    title = sys.argv[3]
    message = sys.argv[4]
    task_id = sys.argv[5]
    vault_path = sys.argv[6]
    reminder_id = sys.argv[7]

    due_time = datetime.fromisoformat(due_time_iso.replace("Z", ""))
    while datetime.now(timezone.utc).replace(tzinfo=None) < due_time:
        time.sleep(1)

    config_file = Path.home() / ".doe_config.json"
    
    def remove_self_from_config():
        if config_file.exists():
            try:
                with open(config_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                rems = data.get("active_reminders", [])
                new_rems = [r for r in rems if r.get("reminder_id") != reminder_id]
                if len(new_rems) != len(rems):
                    data["active_reminders"] = new_rems
                    with open(config_file, 'w', encoding='utf-8') as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
            except Exception:
                pass

    is_active = False
    if config_file.exists():
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            for r in data.get("active_reminders", []):
                if r.get("reminder_id") == reminder_id:
                    is_active = True
                    break
        except Exception:
            pass

    if not is_active:
        os._exit(0)

    if vault_path and os.path.exists(vault_path):
        db_files = [f for f in Path(vault_path).glob("*.db.doe") if not f.name.endswith(".backup.db.doe")]
        if not db_files:
            remove_self_from_config()
            os._exit(0)
    else:
        os._exit(0)

    remove_self_from_config()

    # 🔒 Без сетевого сервера: подсветку задачи в уже запущенном инстансе
    # доставляем ТОЛЬКО через файловый сигнал write_pending_highlight() —
    # запущенный инстанс подхватывает его поллингом /system/pending-highlights.
    # Активацию окна делает ОС (`open -a` на macOS / запуск exe на Windows).

    def write_pending_highlight():
        if config_file.exists():
            try:
                with open(config_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                data["pending_highlight"] = {"task_id": task_id, "vault_path": vault_path}
                with open(config_file, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
            except Exception:
                pass

    if sys.platform == 'darwin':
        import objc
        from Foundation import (
            NSObject, 
            NSRunLoop, 
            NSDate, 
            NSTimer, 
            NSBundle, 
            NSUserNotification, 
            NSUserNotificationCenter, 
            NSUserNotificationDefaultSoundName
        )
        
        # 🌟 Динамический swizzling для обхода ограничения unbundled-процессов в dev-режиме
        if NSBundle.mainBundle().bundleIdentifier() is None:
            objc.classAddMethods(NSBundle, [
                objc.selector(lambda self: "com.aesthetic.doe", selector=b"bundleIdentifier", signature=b"@@:")
            ])
        
        global_state = {"keep_running": True}

        class NotificationDelegate(NSObject):
            def userNotificationCenter_didActivateNotification_(self, center, notification):
                write_pending_highlight()
                # `open -a` активирует уже запущенный инстанс либо запускает новый.
                subprocess.Popen(['open', '-a', str(Path(sys.executable).parent.parent.parent)])
                global_state["keep_running"] = False
                
            def userNotificationCenter_shouldPresentNotification_(self, center, notification): 
                return True
                
            def userNotificationCenter_didDismissNotification_(self, center, notification): 
                global_state["keep_running"] = False
                
            def timeout_(self, timer): 
                global_state["keep_running"] = False

        notification = NSUserNotification.alloc().init()
        notification.setTitle_(title)
        notification.setInformativeText_(message)
        notification.setSoundName_(NSUserNotificationDefaultSoundName)
        
        delegate = NotificationDelegate.alloc().init()
        globals()['_mac_delegate_retained'] = delegate
        
        center = NSUserNotificationCenter.defaultUserNotificationCenter()
        center.setDelegate_(delegate)
        center.deliverNotification_(notification)
        
        NSTimer.scheduledTimerWithTimeInterval_target_selector_userInfo_repeats_(
            60.0, delegate, "timeout:", None, False
        )
        
        run_loop = NSRunLoop.currentRunLoop()
        while global_state["keep_running"]:
            run_loop.runUntilDate_(NSDate.dateWithTimeIntervalSinceNow_(0.5))
            
        os._exit(0)

    elif sys.platform == 'win32':
        import ctypes
        from ctypes import wintypes
        import winreg

        # Используем c_void_p вместо отсутствующих в wintypes хэндлов
        HCURSOR = ctypes.c_void_p
        HICON = ctypes.c_void_p
        HBRUSH = ctypes.c_void_p

        bundle_dir = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
        icon_path = os.path.join(bundle_dir, "favicon.ico")
        doe_exe_path = sys.executable

        aumid = 'doe.aesthetic.kanban.app.1'
        try:
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(aumid)
        except Exception:
            pass

        WM_USER, WM_DESTROY = 0x0400, 0x0002
        NIM_ADD, NIM_DELETE = 0x00000000, 0x00000002
        NIF_MESSAGE, NIF_ICON, NIF_TIP, NIF_INFO = 0x0001, 0x0002, 0x0004, 0x0010
        NIIF_INFO = 0x00000001
        NIN_BALLOONTIMEOUT, NIN_BALLOONUSERCLICK = WM_USER + 4, WM_USER + 5
        WM_TRAYMSG = WM_USER + 20

        class NOTIFYICONDATAW(ctypes.Structure):
            _fields_ = [("cbSize", wintypes.DWORD), ("hWnd", wintypes.HWND), ("uID", wintypes.UINT),
                        ("uFlags", wintypes.UINT), ("uCallbackMessage", wintypes.UINT), ("hIcon", HICON),
                        ("szTip", wintypes.WCHAR * 128), ("dwState", wintypes.DWORD), ("dwStateMask", wintypes.DWORD),
                        ("szInfo", wintypes.WCHAR * 256), ("uTimeout", wintypes.UINT), ("szInfoTitle", wintypes.WCHAR * 64),
                        ("dwInfoFlags", wintypes.DWORD), ("guidItem", ctypes.c_byte * 16), ("hBalloonIcon", HICON)]

        WNDPROC = ctypes.WINFUNCTYPE(ctypes.c_int, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM)

        class WNDCLASSW(ctypes.Structure):
            _fields_ = [("style", wintypes.UINT), ("lpfnWndProc", WNDPROC), ("cbClsExtra", ctypes.c_int),
                        ("cbWndExtra", ctypes.c_int), ("hInstance", ctypes.c_void_p), ("hIcon", HICON),
                        ("hCursor", HCURSOR), ("hbrBackground", HBRUSH), ("lpszMenuName", wintypes.LPCWSTR),
                        ("lpszClassName", wintypes.LPCWSTR)]

        def wnd_proc(hwnd, msg, wparam, lparam):
            if msg == WM_TRAYMSG:
                if lparam == NIN_BALLOONUSERCLICK:
                    write_pending_highlight()
                    subprocess.Popen([doe_exe_path])
                    nid = NOTIFYICONDATAW(); nid.cbSize = ctypes.sizeof(NOTIFYICONDATAW); nid.hWnd = hwnd; nid.uID = 1
                    ctypes.windll.shell32.Shell_NotifyIconW(NIM_DELETE, ctypes.byref(nid))
                    ctypes.windll.user32.PostQuitMessage(0)
                elif lparam in (NIN_BALLOONTIMEOUT, NIN_BALLOONTIMEOUT + 1):
                    nid = NOTIFYICONDATAW(); nid.cbSize = ctypes.sizeof(NOTIFYICONDATAW); nid.hWnd = hwnd; nid.uID = 1
                    ctypes.windll.shell32.Shell_NotifyIconW(NIM_DELETE, ctypes.byref(nid))
                    ctypes.windll.user32.PostQuitMessage(0)
            elif msg == WM_DESTROY:
                ctypes.windll.user32.PostQuitMessage(0)
            return ctypes.windll.user32.DefWindowProcW(hwnd, msg, wparam, lparam)

        wc = WNDCLASSW()
        wc.lpfnWndProc = WNDPROC(wnd_proc)
        wc.lpszClassName = "DoeNotificationWindowClass"
        wc.hInstance = None
        
        _global_wndproc_ref = wc.lpfnWndProc
        ctypes.windll.user32.RegisterClassW(ctypes.byref(wc))
        
        hwnd = ctypes.windll.user32.CreateWindowExW(0, ctypes.c_wchar_p(wc.lpszClassName), ctypes.c_wchar_p("DoeNotificationWindow"), 0, 0, 0, 0, 0, 0, 0, 0, 0)

        hIcon = ctypes.windll.user32.LoadImageW(0, ctypes.c_wchar_p(icon_path), 1, 0, 0, 0x0010 | 0x8000) if os.path.exists(icon_path) else ctypes.windll.user32.LoadIconW(0, 32512)

        nid = NOTIFYICONDATAW()
        nid.cbSize = ctypes.sizeof(NOTIFYICONDATAW)
        nid.hWnd = hwnd
        nid.uID = 1
        nid.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP | NIF_INFO
        nid.uCallbackMessage = WM_TRAYMSG
        nid.hIcon = hIcon
        nid.szTip = "Doe"[:127]
        nid.szInfo = message[:255]
        nid.szInfoTitle = title[:63]
        nid.dwInfoFlags = NIIF_INFO

        ctypes.windll.shell32.Shell_NotifyIconW(NIM_ADD, ctypes.byref(nid))

        msg = wintypes.MSG()
        while ctypes.windll.user32.GetMessageW(ctypes.byref(msg), 0, 0, 0) > 0:
            ctypes.windll.user32.TranslateMessage(ctypes.byref(msg))
            ctypes.windll.user32.DispatchMessageW(ctypes.byref(msg))
            
        os._exit(0)

# =========================================================================
# 2. ОСНОВНОЕ ПРИЛОЖЕНИЕ (GUI)
# =========================================================================

# ПРОГРЕВ ТЯЖЕЛЫХ С-БИБЛИОТЕК В ГЛАВНОМ ПОТОКЕ (Защита от крашей PyInstaller)
try:
    import numpy
except ImportError:
    pass

if getattr(sys, 'frozen', False):
    bundle_dir = sys._MEIPASS
else:
    bundle_dir = os.path.dirname(os.path.abspath(__file__))

if sys.platform == 'darwin':
    try:
        import AppKit
        import objc
        import urllib.parse
        
        app = AppKit.NSApplication.sharedApplication()
        app.setActivationPolicy_(0)

        import webview.platforms.cocoa

        # ============================================================
        # 📎 Перехват нативных путей файлов при Drag & Drop.
        #
        # DOM-событие drop в WKWebView не отдаёт JS настоящие пути файлов
        # (только имя и размер). Из-за этого раньше файл приходилось гнать
        # через HTTP-загрузку, что для больших файлов (200 ГБ+) означало
        # медленную двойную запись на диск. Здесь мы подменяем
        # performDragOperation: у WKWebView-подкласса pywebview: до передачи
        # события в WebKit читаем пути из NSPasteboard и складываем их в
        # реестр. JS сразу после drop забирает их через
        # pywebview.api.get_dropped_files() и прикрепляет файлы по нативному
        # пути (мгновенный APFS-клон, как Cmd+C/Cmd+V в Finder).
        # Само DOM-событие продолжает работать как раньше (вызываем super).
        # ============================================================
        try:
            import threading as _dd_threading
            import time as _dd_time

            _doe_drop_registry = {"ts": 0.0, "files": []}
            _doe_drop_lock = _dd_threading.Lock()

            def _doe_store_dropped_paths(paths):
                files = []
                for p in paths:
                    try:
                        files.append({
                            "path": p,
                            "name": os.path.basename(p),
                            "size": os.path.getsize(p) if os.path.isfile(p) else -1,
                            "is_dir": os.path.isdir(p),
                        })
                    except Exception:
                        pass
                with _doe_drop_lock:
                    _doe_drop_registry["ts"] = _dd_time.time()
                    _doe_drop_registry["files"] = files
                if files:
                    print(f"[DnD] 📎 Captured {len(files)} native path(s) from drop")

            def _doe_take_dropped_files(max_age=15.0):
                """Отдаёт и очищает пути последнего drop (не старше max_age сек)."""
                with _doe_drop_lock:
                    ts = _doe_drop_registry["ts"]
                    files = _doe_drop_registry["files"]
                    _doe_drop_registry["files"] = []
                    _doe_drop_registry["ts"] = 0.0
                if not files or (_dd_time.time() - ts) > max_age:
                    return []
                return files

            _WebKitHost = webview.platforms.cocoa.BrowserView.WebKitHost

            def _doe_performDragOperation_(self, sender):
                try:
                    pboard = sender.draggingPasteboard()
                    ns_urls = pboard.readObjectsForClasses_options_(
                        [AppKit.NSURL],
                        {AppKit.NSPasteboardURLReadingFileURLsOnlyKey: True},
                    )
                    paths = []
                    for u in (ns_urls or []):
                        try:
                            p = u.path()
                            if p:
                                paths.append(str(p))
                        except Exception:
                            pass
                    if paths:
                        _doe_store_dropped_paths(paths)
                except Exception as e:
                    print(f"[DnD] ⚠️ Failed to read drop pasteboard: {e}")
                # Обязательно отдаём событие WebKit — DOM-drop работает как раньше.
                try:
                    return objc.super(_WebKitHost, self).performDragOperation_(sender)
                except Exception as e:
                    print(f"[DnD] ⚠️ super performDragOperation failed: {e}")
                    return False

            _doe_drag_selector = objc.selector(
                _doe_performDragOperation_,
                selector=b'performDragOperation:',
                signature=b'Z@:@',  # BOOL (self, _cmd, id) — 'Z' как в остальных патчах файла
            )
            objc.classAddMethods(_WebKitHost, [_doe_drag_selector])
            print("[DnD] ✅ Native drop path capture installed on WKWebView.")
        except Exception as e:
            # Некритично: без перехвата DnD откатится на потоковую загрузку.
            print(f"[DnD] ⚠️ Could not install drop path capture: {e}")
            def _doe_take_dropped_files(max_age=15.0):
                return []

        # Единая логика обработки пути к файлу хранилища.
        # Выделена в отдельную функцию, чтобы её могли вызвать оба селектора macOS:
        # deprecated application:openFile: (старые системы) и
        # современный application:openURLs: (macOS 10.13+, в т.ч. Tahoe).
        def _doe_handle_vault_path(raw_path):
            try:
                import os
                import urllib.parse
                import urllib.request
                import json as _json
                import traceback
                
                clean_path = str(raw_path)  # NSString → Python str (важно для новых pyobjc)
                if clean_path.startswith("file://"):
                    clean_path = clean_path.replace("file://", "", 1)
                clean_path = urllib.parse.unquote(clean_path)
                clean_path = os.path.abspath(clean_path)
                
                print(f"[System] 📂 macOS openFile event: {clean_path}")
                
                if not os.path.exists(clean_path):
                    print(f"[System] ⚠️ File does not exist: {clean_path}")
                    return False
                if not (clean_path.endswith(".doe") or clean_path.endswith(".db.doe")):
                    print(f"[System] ⚠️ File extension not recognized: {clean_path}")
                    return False
                    
                vault_dir = os.path.dirname(clean_path)
                
                # 🔒 Без сетевого сервера: AppleEvent приходит В уже запущенный
                # инстанс (LaunchServices маршрутизирует 'odoc'/openURLs сюда).
                # Наличие окон == мы работающий инстанс с UI.
                import webview
                if webview.windows:
                    # Переключаем vault ПРЯМО в процессе через in-process ASGI
                    # (эндпоинт /vault/switch сам обновит БД, историю и окна).
                    print(f"[System] 🚀 Forwarding vault switch in-process: {vault_dir}")

                    import threading
                    def _fire_switch():
                        try:
                            DATA_LOOP.request(
                                'POST', '/api/v1/system/vault/switch',
                                {'content-type': 'application/json'},
                                _json.dumps({"new_path": vault_dir, "trigger_ui": True}).encode('utf-8'),
                            )
                        except Exception as e:
                            print(f"[System] In-process vault switch failed: {e}")
                            traceback.print_exc()
                    # В фон, чтобы не блокировать AppKit-поток (никаких beach-ball).
                    threading.Thread(target=_fire_switch, daemon=True).start()
                    return True
                else:
                    # Окон ещё нет — холодный запуск. Просто запоминаем путь,
                    # чтобы init_dev_database() инициализировал нужную БД.
                    from src.core.config import set_active_vault
                    set_active_vault(vault_dir)
                    print(f"[System] 🆕 Cold launch with vault: {vault_dir}")
                    return True
            except Exception as e:
                print(f"[System] Error in _doe_handle_vault_path: {e}")
                import traceback
                traceback.print_exc()
                return True

        # Deprecated селектор application:openFile: для совместимости со старыми macOS.
        def handle_mac_file_open(self, sender, filename):
            try:
                return _doe_handle_vault_path(filename)
            except Exception as e:
                print(f"[System] Error in handle_mac_file_open: {e}")
                return True

        # Современный селектор application:openURLs: для macOS 10.13+.
        # На свежих системах (включая Tahoe / macOS 26) AppKit отдаёт события
        # открытия файлов именно сюда, а deprecated openFile: может не вызываться.
        def handle_mac_open_urls(self, sender, urls):
            try:
                for url in urls:
                    # NSURL → строковый путь без префикса file://
                    path = str(url.path()) if hasattr(url, 'path') else str(url)
                    _doe_handle_vault_path(path)
            except Exception as e:
                print(f"[System] Error in handle_mac_open_urls: {e}")
                import traceback
                traceback.print_exc()

        # ОСНОВНОЙ МЕХАНИЗМ: регистрируем handler напрямую на Apple Event 'odoc'.
        # Это работает ВНЕ зависимости от внутренностей pywebview: событие
        # перехватывается ДО того, как AppKit передаст его делегату или
        # NSDocumentController (который и показывает "could not be opened").
        try:
            from Foundation import NSAppleEventManager, NSObject, NSURL
            
            def _fourcc(s):
                return (ord(s[0]) << 24) | (ord(s[1]) << 16) | (ord(s[2]) << 8) | ord(s[3])
            
            kCoreEventClass = _fourcc('aevt')   # 1701867620
            kAEOpenDocuments = _fourcc('odoc')  # 1868853091
            keyDirectObject = _fourcc('----')   # 757935405
            typeFileURL     = _fourcc('furl')   # 0x6675726C
            
            class DoeOpenDocHandler(NSObject):
                def handleOpenDoc_withReplyEvent_(self, event, replyEvent):
                    # Этот print должен появляться в логе ПРИ КАЖДОМ клике по .db.doe.
                    # Если его нет — handler не вызывается (т.е. AppKit его не нашёл).
                    print(f"[System] 🎯 AppleEvent 'odoc' INVOKED")
                    try:
                        direct_param = event.paramDescriptorForKeyword_(keyDirectObject)
                        if direct_param is None:
                            print("[System] AppleEvent: no direct object")
                            return
                        count = direct_param.numberOfItems()
                        print(f"[System] AppleEvent: {count} file(s) in event")
                        for i in range(1, count + 1):
                            item = direct_param.descriptorAtIndex_(i)
                            path = None
                            
                            # ПРАВИЛЬНЫЙ способ: через NSURL.URLWithDataRepresentation
                            # (typeFileURL хранит URL в специальном бинарном формате, а не plain text)
                            try:
                                coerced = item.coerceToDescriptorType_(typeFileURL)
                                if coerced is not None:
                                    data = coerced.data()
                                    if data is not None:
                                        url = NSURL.URLWithDataRepresentation_relativeToURL_(data, None)
                                        if url is not None:
                                            url_path = url.path()
                                            if url_path is not None:
                                                path = str(url_path)
                            except Exception as e:
                                print(f"[System] NSURL coerce failed: {e}")
                            
                            # Fallback: попробовать stringValue (для legacy alias-дескрипторов)
                            if not path:
                                try:
                                    sv = item.stringValue()
                                    if sv:
                                        path = str(sv)
                                except Exception:
                                    pass
                            
                            if path:
                                print(f"[System] AppleEvent extracted path: {path}")
                                _doe_handle_vault_path(path)
                            else:
                                print(f"[System] AppleEvent: could NOT extract path from item {i}")
                    except Exception as e:
                        print(f"[System] AppleEvent handler error: {e}")
                        import traceback
                        traceback.print_exc()
                
                # КРИТИЧНО: явно задаём Objective-C сигнатуру метода.
                # Без неё pyobjc угадывает и часто ошибается, из-за чего AppleEventManager
                # регистрирует метод "успешно", но никогда его не вызывает.
                # 'v@:@@' = void return, self, _cmd, NSAppleEventDescriptor*, NSAppleEventDescriptor*
                handleOpenDoc_withReplyEvent_ = objc.selector(
                    handleOpenDoc_withReplyEvent_,
                    signature=b'v@:@@'
                )
            
            # ВАЖНО: handler нужно сохранить в модульной переменной, иначе сборщик мусора
            # уничтожит Objective-C объект и AppKit упадёт при попытке вызвать метод.
            _doe_open_doc_handler = DoeOpenDocHandler.alloc().init()
            globals()['_doe_open_doc_handler'] = _doe_open_doc_handler
            
            def _register_apple_event_handler():
                """Регистрирует наш handler на 'odoc'. Вынесено в функцию, чтобы можно было
                перевызвать после старта pywebview — на случай если AppKit/pywebview
                переинициализирует AppleEventManager при создании NSApp delegate."""
                NSAppleEventManager.sharedAppleEventManager().setEventHandler_andSelector_forEventClass_andEventID_(
                    _doe_open_doc_handler,
                    b'handleOpenDoc:withReplyEvent:',
                    kCoreEventClass,
                    kAEOpenDocuments,
                )
            
            _register_apple_event_handler()
            print("[System] macOS: AppleEvent 'odoc' handler registered (primary mechanism).")
            
            # Сохраняем функцию для повторной регистрации через 1 секунду после старта окна.
            # Это страховка: если pywebview/AppKit при инициализации NSApp перезатирают
            # наш handler своим дефолтным (который кидает alert), мы возвращаем своё право.
            globals()['_doe_reregister_apple_event'] = _register_apple_event_handler
            
            # Дополнительная страховка: переопределяем applicationShouldTerminateAfterLastWindowClosed:
            # на NO. По умолчанию AppKit убивает процесс при закрытии последнего окна — это ломает
            # сценарии, когда мы destroy() одно окно и create_window() сразу после: AppKit успевает
            # терминировать процесс ДО создания нового окна. У нас приложение по архитектуре
            # многооконное (Vault Selector ↔ Kanban), поэтому такое поведение нежелательно.
            try:
                def _should_terminate_after_last_closed(self, sender):
                    return False
                
                sel_no_terminate = objc.selector(
                    _should_terminate_after_last_closed,
                    selector=b'applicationShouldTerminateAfterLastWindowClosed:',
                    signature=b'Z@:@'
                )
                
                # Применяем ко всем найденным AppDelegate-классам (top-level и вложенным)
                applied_to = []
                for delegate_name in ['AppDelegate', 'ApplicationDelegate', 'BrowserDelegate']:
                    if hasattr(webview.platforms.cocoa, delegate_name):
                        cls = getattr(webview.platforms.cocoa, delegate_name)
                        try:
                            objc.classAddMethods(cls, [sel_no_terminate])
                            applied_to.append(delegate_name)
                        except Exception:
                            setattr(cls, 'applicationShouldTerminateAfterLastWindowClosed_', sel_no_terminate)
                            applied_to.append(f"{delegate_name}(setattr)")
                
                if hasattr(webview.platforms.cocoa, 'BrowserView'):
                    bv = webview.platforms.cocoa.BrowserView
                    for nested_name in ['AppDelegate', 'ApplicationDelegate']:
                        if hasattr(bv, nested_name):
                            cls = getattr(bv, nested_name)
                            try:
                                objc.classAddMethods(cls, [sel_no_terminate])
                                applied_to.append(f"BrowserView.{nested_name}")
                            except Exception:
                                setattr(cls, 'applicationShouldTerminateAfterLastWindowClosed_', sel_no_terminate)
                                applied_to.append(f"BrowserView.{nested_name}(setattr)")
                
                print(f"[System] applicationShouldTerminateAfterLastWindowClosed → NO registered on: {applied_to}")
            except Exception as e:
                print(f"[System] terminate-after-last-window override failed (non-fatal): {e}")

            # КРИТИЧНО: переопределяем applicationShouldTerminate: .
            # На macOS Ctrl+C в терминале перехватывается Mach-уровнем PyObjC
            # (installMachInterrupt, который pywebview вызывает в cocoa.py), а НЕ
            # Python'овским signal.signal(). Mach-хендлер зовёт
            # NSApp().terminate_(None) → applicationShouldTerminate: → exit() →
            # C++ __cxa_finalize_ranges → ggml_metal_device_free →
            # GGML_ASSERT([rsets->data count] == 0) → abort (SIGABRT).
            # Стоковый AppDelegate pywebview возвращает YES без очистки Metal.
            # Перехватываем: чистим LLM и выходим через os._exit(0), минуя
            # C++-деструкторы (поэтому ggml_metal_device_free не зовётся вообще).
            try:
                def _should_terminate(self, sender):
                    # 🔐 Cmd+Q / Quit из меню: выход делегируем ФРОНТЕНДУ —
                    # window.appExit() покажет оверлей шифрования с прогресс-баром
                    # (вместо молчаливого замирания окна) и сам завершит процесс
                    # через force_close. Возвращаем NSTerminateCancel, чтобы AppKit
                    # не убил приложение до окончания шифрования.
                    # ВАЖНО: evaluate_js нельзя звать с главного потока AppKit
                    # (дедлок ожидания результата) — уводим в фоновый поток.
                    import threading as _threading

                    def _delegate_exit_to_js():
                        try:
                            import webview as _wv
                            for w in list(_wv.windows):
                                try:
                                    res = w.evaluate_js('window.appExit ? (window.appExit(), true) : false')
                                    if res:
                                        print("[System] 🔐 Quit delegated to JS (progress overlay)")
                                        return
                                except Exception:
                                    continue
                        except Exception:
                            pass
                        # Фолбэк: JS недоступен (окно мертво) — старый путь:
                        # блокирующее шифрование и жёсткий выход.
                        try:
                            _lock_vault_before_exit()
                        except Exception:
                            pass
                        try:
                            DATA_LOOP.shutdown()
                        except Exception:
                            pass
                        import time as _time
                        _time.sleep(0.15)
                        try:
                            sys.stdout.flush(); sys.stderr.flush()
                        except Exception:
                            pass
                        import os as _os
                        _os._exit(0)

                    _threading.Thread(target=_delegate_exit_to_js, daemon=True).start()
                    return 0  # NSTerminateCancel — завершимся сами после шифрования

                # Возвращаемый тип NSApplicationTerminateReply в разных версиях
                # macOS/PyObjC кодируется по-разному: I (unsigned int), q (NSInteger),
                # Q (NSUInteger). Рантайм отвергает несовпадающую сигнатуру
                # ("I@:@ != q@:@"), поэтому перебираем совместимые варианты.
                def _apply_terminate_override(cls, label, applied):
                    for sig in (b'I@:@', b'q@:@', b'Q@:@'):
                        sel = objc.selector(
                            _should_terminate,
                            selector=b'applicationShouldTerminate:',
                            signature=sig
                        )
                        try:
                            objc.classAddMethods(cls, [sel])
                            applied.append(f"{label}[{sig.decode()}]")
                            return True
                        except Exception:
                            pass
                        try:
                            setattr(cls, 'applicationShouldTerminate_', sel)
                            applied.append(f"{label}(setattr[{sig.decode()}])")
                            return True
                        except Exception:
                            continue
                    print(f"[System] ⚠️ Could not override applicationShouldTerminate on {label}")
                    return False

                applied_term = []
                for delegate_name in ['AppDelegate', 'ApplicationDelegate', 'BrowserDelegate']:
                    if hasattr(webview.platforms.cocoa, delegate_name):
                        _apply_terminate_override(getattr(webview.platforms.cocoa, delegate_name), delegate_name, applied_term)

                if hasattr(webview.platforms.cocoa, 'BrowserView'):
                    bv = webview.platforms.cocoa.BrowserView
                    for nested_name in ['AppDelegate', 'ApplicationDelegate']:
                        if hasattr(bv, nested_name):
                            _apply_terminate_override(getattr(bv, nested_name), f"BrowserView.{nested_name}", applied_term)

                print(f"[System] applicationShouldTerminate: → Metal cleanup + os._exit registered on: {applied_term}")
            except Exception as e:
                print(f"[System] applicationShouldTerminate override failed (non-fatal): {e}")
            
        except Exception as e:
            print(f"[System] AppleEvent registration failed: {e}")
            import traceback
            traceback.print_exc()
        
        # ДОПОЛНИТЕЛЬНЫЙ СЛОЙ (legacy): пытаемся также пропатчить AppDelegate pywebview.
        # В pywebview 4.4.1 AppDelegate — ВЛОЖЕННЫЙ класс внутри BrowserView,
        # поэтому помимо top-level имён ищем его и там. Если не нашли — не страшно,
        # основной механизм через AppleEventManager уже работает.
        delegate_candidates = []
        for delegate_name in ['AppDelegate', 'ApplicationDelegate', 'BrowserDelegate']:
            if hasattr(webview.platforms.cocoa, delegate_name):
                delegate_candidates.append((delegate_name, getattr(webview.platforms.cocoa, delegate_name)))
        # pywebview 4.4.1: AppDelegate внутри BrowserView
        if hasattr(webview.platforms.cocoa, 'BrowserView'):
            bv = webview.platforms.cocoa.BrowserView
            for nested_name in ['AppDelegate', 'ApplicationDelegate']:
                if hasattr(bv, nested_name):
                    delegate_candidates.append((f'BrowserView.{nested_name}', getattr(bv, nested_name)))
        
        for delegate_name, cls in delegate_candidates:
            try:
                sel_file = objc.selector(
                    handle_mac_file_open,
                    selector=b'application:openFile:',
                    signature=b'Z@:@@'
                )
                sel_urls = objc.selector(
                    handle_mac_open_urls,
                    selector=b'application:openURLs:',
                    signature=b'v@:@@'
                )
                try:
                    objc.classAddMethods(cls, [sel_file, sel_urls])
                    print(f"[System] macOS {delegate_name}: openFile + openURLs registered via classAddMethods.")
                except Exception as e:
                    setattr(cls, 'application_openFile_', sel_file)
                    setattr(cls, 'application_openURLs_', sel_urls)
                    print(f"[System] macOS {delegate_name}: fallback setattr ({e}).")
            except Exception as e:
                print(f"[System] Delegate patching failed for {delegate_name}: {e}")
        
        if not delegate_candidates:
            print("[System] No AppDelegate classes found in pywebview (using AppleEvent fallback only).")

        # МЕНЯЕМ ИКОНКУ КОДОМ ТОЛЬКО В РЕЖИМЕ РАЗРАБОТКИ
        # В собранном .app это не нужно и вызывает "прыжок" размера
        if not getattr(sys, 'frozen', False):
            if getattr(sys, 'frozen', False):
                current_bundle_dir = sys._MEIPASS
            else:
                current_bundle_dir = os.path.dirname(os.path.abspath(__file__))
            
            icon_p = os.path.join(current_bundle_dir, "doe.png")

            if os.path.exists(icon_p):
                original_image = AppKit.NSImage.alloc().initWithContentsOfFile_(icon_p)
                if original_image:
                    target_size = AppKit.NSMakeSize(512, 512)
                    padding_factor = 0.82 
                    new_size = AppKit.NSMakeSize(target_size.width * padding_factor, target_size.height * padding_factor)
                    
                    canvas = AppKit.NSImage.alloc().initWithSize_(target_size)
                    canvas.lockFocus()
                    rect = AppKit.NSMakeRect(
                        (target_size.width - new_size.width) / 2,
                        (target_size.height - new_size.height) / 2,
                        new_size.width,
                        new_size.height
                    )
                    original_image.drawInRect_(rect)
                    canvas.unlockFocus()
                    app.setApplicationIconImage_(canvas)

        app.activateIgnoringOtherApps_(True)
        print("[System] macOS App Policy initialized.")
    except Exception as e:
        print(f"[System] macOS Early Fix failed: {e}")

        # МЕНЯЕМ ИКОНКУ КОДОМ ТОЛЬКО В РЕЖИМЕ РАЗРАБОТКИ
        # В собранном .app это не нужно и вызывает "прыжок" размера
        if not getattr(sys, 'frozen', False):
            if getattr(sys, 'frozen', False):
                current_bundle_dir = sys._MEIPASS
            else:
                current_bundle_dir = os.path.dirname(os.path.abspath(__file__))
            
            icon_p = os.path.join(current_bundle_dir, "doe.png")

            if os.path.exists(icon_p):
                original_image = AppKit.NSImage.alloc().initWithContentsOfFile_(icon_p)
                if original_image:
                    target_size = AppKit.NSMakeSize(512, 512)
                    padding_factor = 0.82 
                    new_size = AppKit.NSMakeSize(target_size.width * padding_factor, target_size.height * padding_factor)
                    
                    canvas = AppKit.NSImage.alloc().initWithSize_(target_size)
                    canvas.lockFocus()
                    rect = AppKit.NSMakeRect(
                        (target_size.width - new_size.width) / 2,
                        (target_size.height - new_size.height) / 2,
                        new_size.width,
                        new_size.height
                    )
                    original_image.drawInRect_(rect)
                    canvas.unlockFocus()
                    app.setApplicationIconImage_(canvas)

        app.activateIgnoringOtherApps_(True)
        print("[System] macOS App Policy initialized.")
    except Exception as e:
        print(f"[System] macOS Early Fix failed: {e}")

import traceback
import time
from datetime import datetime
import sys
import os

# ОПРЕДЕЛЯЕМ ДИНАМИЧЕСКИЙ ПУТЬ ДЛЯ ЛОГОВ
from pathlib import Path
import json

def get_dynamic_log_path():
    """Возвращает путь к логу текущего хранилища. Если не выбрано — во временный лог пользователя."""
    try:
        config_file = Path.home() / ".doe_config.json"
        if config_file.exists():
            with open(config_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                vault_path = data.get("active_vault")
                if vault_path and os.path.exists(vault_path):
                    vp = Path(vault_path)
                    return vp / f"{vp.name}.log.doe.txt"
    except Exception:
        pass
    return Path.home() / ".log.doe.txt"

# Глобальные переменные для гарантии единого дескриптора на оба потока (stdout/stderr)
_global_log_file = None
_global_log_path = None

def _ensure_log_file():
    global _global_log_file, _global_log_path
    new_path = get_dynamic_log_path()
    
    # Если путь изменился ИЛИ файл почему-то потерялся (None) — открываем заново
    if new_path != _global_log_path or _global_log_file is None:
        if _global_log_file:
            try:
                _global_log_file.write(f"\n[System] 🔄 Redirecting logs to new vault: {new_path}\n")
                _global_log_file.flush()
                _global_log_file.close()
            except Exception:
                pass
        
        _global_log_path = new_path
        try:
            # buffering=1 гарантирует, что каждая новая строка (\n) сразу прописывается на диск
            _global_log_file = open(_global_log_path, 'a', encoding='utf-8', buffering=1)
            _global_log_file.write(f"\n{'='*50}\n🚀 DOE APP Session Started: {datetime.now()}\n📁 Log Location: {_global_log_path}\n{'='*50}\n")
        except Exception:
            _global_log_file = None

class LoggerWriter:
    def __init__(self, original_stream):
        self.terminal = original_stream
        self.last_check_time = 0
        _ensure_log_file()

    def write(self, message):
        now = time.time()
        # Проверяем, не сменилась ли папка, но не чаще раза в 2 секунды (экономим ресурсы)
        if now - self.last_check_time > 2.0:
            _ensure_log_file()
            self.last_check_time = now
            
        global _global_log_file
        if _global_log_file:
            try:
                _global_log_file.write(message)
                # Принудительный flush каждой посылки гарантирует, 
                # что мы увидим ошибку даже при мгновенном краше приложения.
                _global_log_file.flush()
            except Exception:
                pass
        
        if self.terminal:
            try:
                self.terminal.write(message)
                self.terminal.flush()
            except Exception:
                pass

    def flush(self):
        global _global_log_file
        if _global_log_file:
            try:
                _global_log_file.flush()
            except Exception:
                pass
        if self.terminal:
            try:
                self.terminal.flush()
            except Exception:
                pass

    def isatty(self):
        if self.terminal:
            try:
                return self.terminal.isatty()
            except Exception:
                return False
        return False

    def __getattr__(self, name):
        if self.terminal and hasattr(self.terminal, name):
            return getattr(self.terminal, name)
        raise AttributeError(f"LoggerWriter has no attribute '{name}'")

# Глобальный перехват вывода для ВСЕХ ОС (включая macOS)
sys.stdout = LoggerWriter(sys.__stdout__)
sys.stderr = LoggerWriter(sys.__stderr__)

import atexit
atexit.register(lambda: (sys.stdout.flush(), sys.stderr.flush()))

# NullReader требуется только для PyInstaller windowed mode на Windows
if sys.platform == 'win32':
    class NullReader:
        def read(self, *args, **kwargs): return ""
        def readline(self, *args, **kwargs): return ""
        def isatty(self): return False
    sys.stdin = NullReader()

def global_exception_handler(exc_type, exc_value, exc_tb):
    print("\n!!! FATAL APPLICATION ERROR OCCURRED !!!")
    traceback.print_exception(exc_type, exc_value, exc_tb, file=sys.stderr)

sys.excepthook = global_exception_handler

print("[System] Importing libraries...")
import multiprocessing
import threading
import webview
import subprocess  # Для macOS 'open'
import os          # Для Windows 'os.startfile'
import asyncio

print("[System] Loading FastAPI core...")
from main import app, startup as _app_startup, shutdown as _app_shutdown, frontend_path
from src.core.config import get_ui_settings

# ============================================================================
# 🔒 БЕЗ СЕТЕВОГО СЕРВЕРА
# Раньше здесь поднимался uvicorn на http://127.0.0.1:8000, а окно грузило
# `/app` по HTTP. Теперь окно грузится из локального файла (file://), а фронт
# общается с бэкендом через мост `window.pywebview.api.api_request`, который
# гоняет то же самое ASGI-приложение `app` in-process через httpx.ASGITransport
# — без сокета, порта и CORS. Это устраняет поверхность атаки (открытый порт).
# ============================================================================

def runtime_index_url(mode: str = 'board') -> str:
    """Собирает index.html с инъекцией темы/языка/режима, кладёт рядом с
    ассетами в frontend/ (чтобы относительные ссылки резолвились по file://)
    и возвращает file://-URL. mode: 'board' | 'vault'."""
    settings = get_ui_settings()
    theme = settings.get('theme', 'light')
    lang = settings.get('language', 'ru')
    bg = '#161815' if theme == 'dark' else '#F4F3EF'
    with open(frontend_path / 'index.html', 'r', encoding='utf-8') as f:
        html = f.read()
    launch_mode = 'vault' if mode == 'vault' else 'board'
    # Инъекция БАЗОВОГО фона в <head> — гарантирует нужный цвет вьюпорта ещё
    # до загрузки CSS (тот же приём, что был в main.py:serve_index).
    inject = (
        f'<style id="doe-bg-lock">html, body {{ background-color: {bg} !important; }}</style>'
        '<script>'
        f'window.__doeLaunchMode = "{launch_mode}";'
        'window.addEventListener("DOMContentLoaded", function(){ setTimeout(function(){ var e=document.getElementById("doe-bg-lock"); if(e) e.remove(); }, 50); });'
        f'if ("{theme}" === "dark") document.documentElement.setAttribute("data-theme", "dark");'
        f'try {{ localStorage.setItem("doe-theme", "{theme}"); localStorage.setItem("doe-lang", "{lang}"); }} catch(e) {{}}'
        '</script>'
        '</head>'
    )
    html = html.replace('</head>', inject, 1)
    out = frontend_path / ('.doe_runtime_vault.html' if launch_mode == 'vault' else '.doe_runtime_board.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)
    url = out.resolve().as_uri()
    if launch_mode == 'vault':
        url += '?mode=vault'
    return url


class _AsgiResponse:
    """Лёгкий контейнер ответа ASGI (аналог httpx.Response, но без зависимости)."""
    __slots__ = ('status_code', 'headers', 'content')

    def __init__(self, status_code, headers, content):
        self.status_code = status_code
        self.headers = headers  # dict[str, str]
        self.content = content  # bytes


async def _call_asgi(asgi_app, method, path, headers, body):
    """Вызывает ASGI-приложение НАПРЯМУЮ, без сети/сокета/HTTP-стека.
    Полностью офлайн: строим http-scope, гоняем receive/send, собираем ответ."""
    import urllib.parse as _uparse
    raw_path, _, query = path.partition('?')
    scope = {
        'type': 'http',
        'asgi': {'version': '3.0', 'spec_version': '2.3'},
        'http_version': '1.1',
        'method': str(method).upper(),
        'scheme': 'http',
        'path': _uparse.unquote(raw_path),
        'raw_path': raw_path.encode('utf-8'),
        'query_string': query.encode('utf-8'),
        'root_path': '',
        'headers': [
            (str(k).lower().encode('latin-1'), str(v).encode('latin-1'))
            for k, v in (headers or {}).items()
        ],
        'client': ('127.0.0.1', 0),
        'server': ('doe.local', 80),
    }

    _sent = {'done': False}

    async def receive():
        if not _sent['done']:
            _sent['done'] = True
            return {'type': 'http.request', 'body': body or b'', 'more_body': False}
        return {'type': 'http.disconnect'}

    result = {'status': 500, 'headers': [], 'body': bytearray()}

    async def send(message):
        t = message['type']
        if t == 'http.response.start':
            result['status'] = message['status']
            result['headers'] = message.get('headers', []) or []
        elif t == 'http.response.body':
            result['body'].extend(message.get('body', b'') or b'')

    await asgi_app(scope, receive, send)
    hdrs = {k.decode('latin-1'): v.decode('latin-1') for k, v in result['headers']}
    return _AsgiResponse(result['status'], hdrs, bytes(result['body']))


class DataLoop:
    """Единый asyncio-цикл в фоновом потоке — заменяет uvicorn-сервер.
    Запросы фронта (/api/v1/...) маршрутизируются в in-process `app` через
    прямой вызов ASGI, БЕЗ сети/сокета/порта."""

    def __init__(self):
        self.loop = asyncio.new_event_loop()
        self._ready = threading.Event()
        self.thread = threading.Thread(target=self._run, daemon=True, name='doe-data-loop')

    def _run(self):
        asyncio.set_event_loop(self.loop)
        # Инициализация хранилища в фоне — окно появляется мгновенно, а фронт
        # ждёт готовности через /system/startup-status.
        self.loop.create_task(_app_startup())
        self._ready.set()
        self.loop.run_forever()

    def start(self):
        self.thread.start()
        self._ready.wait(timeout=10)

    def request(self, method, path, headers, body):
        """Синхронный вызов ASGI-приложения из потока pywebview."""
        fut = asyncio.run_coroutine_threadsafe(
            _call_asgi(app, method, path, headers, body), self.loop)
        return fut.result(timeout=300)

    def shutdown(self):
        try:
            fut = asyncio.run_coroutine_threadsafe(_app_shutdown(), self.loop)
            fut.result(timeout=5)
        except Exception:
            pass


DATA_LOOP = DataLoop()


def push_db_updated():
    """Замена WebSocket-события `db_updated`: пушим уведомление о внешнем
    изменении БД во все окна через evaluate_js (см. src/core/watcher.py)."""
    try:
        for w in list(webview.windows):
            try:
                w.evaluate_js('window.__doeOnDbUpdated && window.__doeOnDbUpdated()')
            except Exception:
                pass
    except Exception:
        pass

print("[Settings] Reading configuration...")
settings = get_ui_settings()
theme = settings.get("theme", "light")
bg_color = '#161815' if theme == 'dark' else '#F4F3EF'

# Глобальный кэш для доступа к аппаратному приводу Taptic Engine трекпада
_mac_actuator = None
_mt_lib = None

def _trigger_macos_hardware_haptic():
    """Прямое обращение к физическому актуатору трекпада macOS через приватный фреймворк"""
    global _mac_actuator, _mt_lib
    import ctypes
    import os
    
    try:
        framework_path = '/System/Library/PrivateFrameworks/MultitouchSupport.framework/MultitouchSupport'
        if not os.path.exists(framework_path):
            return False
            
        if _mt_lib is None:
            # Загружаем системную библиотеку поддержки мультитача и Taptic Engine
            _mt_lib = ctypes.CDLL(framework_path)
            _mt_lib.MTDeviceCreateDefault.restype = ctypes.c_void_p
            _mt_lib.MTActuatorCreateFromDevice.argtypes = [ctypes.c_void_p]
            _mt_lib.MTActuatorCreateFromDevice.restype = ctypes.c_void_p
            _mt_lib.MTActuatorPlayTap.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int]
            _mt_lib.MTActuatorPlayTap.restype = ctypes.c_int

        if _mac_actuator is None:
            # Получаем указатель на встроенное устройство ввода
            device = _mt_lib.MTDeviceCreateDefault()
            if device:
                # Создаем интерфейс управления актуатором
                _mac_actuator = _mt_lib.MTActuatorCreateFromDevice(device)

        if _mac_actuator:
            # Параметры: actuator, pattern, intensity
            # pattern=1 (Alignment/Snap - четкий щелчок стыковки)
            # intensity=3 (сочная средняя физическая отдача)
            _mt_lib.MTActuatorPlayTap(_mac_actuator, 1, 3)
            return True
    except Exception as e:
        print(f"[Haptic] macOS Hardware Taptic Engine trigger failed: {e}")
    return False



MAIN_WINDOW_TITLE = 'Doe (demo)'

def _dump_geometry_diagnostics():
    """Однократный дамп DPI-состояния и карты мониторов в лог (Windows)."""
    if sys.platform != 'win32':
        return
    try:
        import ctypes
        from ctypes import wintypes
        user32 = ctypes.windll.user32
        aware = bool(user32.IsProcessDPIAware())

        monitors = []

        class MONITORINFO(ctypes.Structure):
            _fields_ = [("cbSize", wintypes.DWORD), ("rcMonitor", wintypes.RECT),
                        ("rcWork", wintypes.RECT), ("dwFlags", wintypes.DWORD)]

        # Правильные типы для callback (BOOL, HMONITOR, HDC, LPRECT, LPARAM)
        MonitorEnumProc = ctypes.WINFUNCTYPE(
            wintypes.BOOL, ctypes.c_void_p, ctypes.c_void_p,
            ctypes.POINTER(wintypes.RECT), wintypes.LPARAM)

        # Явно указываем типы аргументов, чтобы избежать OverflowError на 64-битных системах
        user32.GetMonitorInfoW.argtypes = [ctypes.c_void_p, ctypes.POINTER(MONITORINFO)]

        def _cb(hmon, hdc, lprc, lparam):
            mi = MONITORINFO()
            mi.cbSize = ctypes.sizeof(MONITORINFO)
            
            # Явный каст hmon в c_void_p защищает от сбоев
            hmon_ptr = ctypes.c_void_p(hmon)
            
            if user32.GetMonitorInfoW(hmon_ptr, ctypes.byref(mi)):
                dpi_x = wintypes.UINT()
                dpi_y = wintypes.UINT()
                scale = None
                try:
                    ctypes.windll.shcore.GetDpiForMonitor.argtypes = [
                        ctypes.c_void_p, ctypes.c_uint, 
                        ctypes.POINTER(wintypes.UINT), ctypes.POINTER(wintypes.UINT)
                    ]
                    ctypes.windll.shcore.GetDpiForMonitor(
                        hmon_ptr, 0, ctypes.byref(dpi_x), ctypes.byref(dpi_y))
                    scale = round(dpi_x.value / 96.0, 2)
                except Exception:
                    pass
                r = mi.rcMonitor
                w_area = mi.rcWork
                monitors.append(
                    f"({r.left},{r.top})-({r.right},{r.bottom}) "
                    f"work={w_area.right - w_area.left}x{w_area.bottom - w_area.top} "
                    f"scale={scale}")
            return 1

        user32.EnumDisplayMonitors(None, None, MonitorEnumProc(_cb), 0)
        print(f"[Geometry] engine v3 | DPI-aware process: {aware}")
        for i, m in enumerate(monitors, 1):
            print(f"[Geometry] monitor {i}: {m}")
    except Exception as e:
        print(f"[Geometry] diagnostics failed: {e}")


def _win32_monitor_dpi_scale(x, y, w, h):
    """DPI-масштаб монитора, на котором окажется центр окна (1.0 = 100%)."""
    try:
        import ctypes
        from ctypes import wintypes
        class POINT(ctypes.Structure):
            _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]
        pt = POINT(int(x + w // 2), int(y + h // 2))
        hmon = ctypes.windll.user32.MonitorFromPoint(pt, 2)  # MONITOR_DEFAULTTONEAREST
        dpi_x = ctypes.c_uint(96)
        dpi_y = ctypes.c_uint(96)
        # MDT_EFFECTIVE_DPI = 0
        ctypes.windll.shcore.GetDpiForMonitor.argtypes = [
            ctypes.c_void_p, ctypes.c_uint, 
            ctypes.POINTER(ctypes.c_uint), ctypes.POINTER(ctypes.c_uint)
        ]
        if ctypes.windll.shcore.GetDpiForMonitor(ctypes.c_void_p(hmon), 0, ctypes.byref(dpi_x), ctypes.byref(dpi_y)) == 0:
            return max(0.5, dpi_x.value / 96.0)
    except Exception:
        pass
    return 1.0

def _win32_hwnd_for(win):
    """HWND конкретного окна pywebview: сначала точно по uid через внутренности
    winforms-бэкенда (надёжно при пересоздании окон с одинаковым заголовком),
    затем фолбэк по заголовку."""
    try:
        from webview.platforms.winforms import BrowserView
        bv = BrowserView.instances.get(win.uid)
        if bv is not None:
            return int(bv.Handle.ToInt64())
    except Exception:
        pass
    try:
        import ctypes
        hwnd = ctypes.windll.user32.FindWindowW(None, MAIN_WINDOW_TITLE)
        return hwnd or None
    except Exception:
        return None

def _win32_get_rect(hwnd):
    import ctypes
    from ctypes import wintypes
    rect = wintypes.RECT()
    if not ctypes.windll.user32.GetWindowRect(hwnd, ctypes.byref(rect)):
        return None
    return (rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top)

def _win32_workarea_for_hwnd(hwnd):
    import ctypes
    from ctypes import wintypes
    class MONITORINFO(ctypes.Structure):
        _fields_ = [("cbSize", wintypes.DWORD), ("rcMonitor", wintypes.RECT),
                    ("rcWork", wintypes.RECT), ("dwFlags", wintypes.DWORD)]
    user32 = ctypes.windll.user32
    user32.GetMonitorInfoW.argtypes = [ctypes.c_void_p, ctypes.POINTER(MONITORINFO)]
    hmon = user32.MonitorFromWindow(hwnd, 2)
    mi = MONITORINFO()
    mi.cbSize = ctypes.sizeof(MONITORINFO)
    if not user32.GetMonitorInfoW(ctypes.c_void_p(hmon), ctypes.byref(mi)):
        return None
    w = mi.rcWork
    return (w.left, w.top, w.right - w.left, w.bottom - w.top)

def bind_geometry_enforcement(win, target_rect):
    """pywebview/WinForms (AutoScaleMode.Dpi) умножает размер окна на DPI-масштаб
    при создании — на 4K со 150% окно «распухает» с каждым циклом запуска.
    После показа окна принудительно выставляем ТОЧНЫЙ физический прямоугольник
    через SetWindowPos — тот же API, которым пользуется toggle_maximize_window."""
    if sys.platform != 'win32' or not target_rect:
        return
    x, y, w, h = (int(v) for v in target_rect)

    # Одноразовость: enforcement нужен только против DPI-«распухания» при
    # СОЗДАНИИ окна. Событие 'loaded' стреляет и при смене хранилища
    # (load_url) — без этого флага окно возвращалось бы к геометрии
    # предыдущего хранилища.
    _state = {'done': False}

    def _matches(cur):
        return cur and all(abs(a - b) <= 2 for a, b in zip(cur, (x, y, w, h)))

    def _enforce(*args):
        import threading
        if _state['done']:
            return
        _state['done'] = True
        def _loop(attempt=0):
            try:
                import ctypes
                # 🪟 НЕ ВОЮЕМ С ПОЛЬЗОВАТЕЛЕМ: если зажата левая кнопка мыши,
                # вероятно идёт перетаскивание или ресайз окна. SetWindowPos в
                # этот момент "дёргает" окно по экрану. Пропускаем попытку.
                if ctypes.windll.user32.GetAsyncKeyState(0x01) & 0x8000:
                    if attempt < 14:
                        threading.Timer(0.2, _loop, args=(attempt + 1,)).start()
                    return
                hwnd = _win32_hwnd_for(win)
                if hwnd:
                    cur = _win32_get_rect(hwnd)
                    if _matches(cur):
                        if attempt > 0:
                            print(f"[Geometry] enforced OK after {attempt} attempts: {cur}")
                        return
                    SWP_NOZORDER = 0x0004
                    SWP_NOACTIVATE = 0x0010
                    ctypes.windll.user32.SetWindowPos(
                        hwnd, 0, x, y, w, h, SWP_NOZORDER | SWP_NOACTIVATE)
                    after = _win32_get_rect(hwnd)
                    if attempt == 0:
                        print(f"[Geometry] target={(x, y, w, h)} was={cur} now={after}")
                    if _matches(after):
                        return
            except Exception as e:
                print(f"[Geometry] enforce error: {e}")
            # WinForms/WebView2 могут перетирать размер на поздних стадиях
            # инициализации — повторяем, пока не победим (до ~3 секунд)
            if attempt < 14:
                threading.Timer(0.2, _loop, args=(attempt + 1,)).start()
            else:
                print("[Geometry] enforce gave up after 14 attempts")
        _loop()

    for ev_name in ('shown', 'loaded'):
        try:
            ev = getattr(win.events, ev_name)
            ev += _enforce
        except Exception:
            pass



def get_safe_geometry():
    """Возвращает (width, height, x, y) с валидацией под текущие мониторы (Windows).
    Гарантирует: окно не шире/выше рабочей области своего монитора и целиком
    внутри неё. Если сохранённой позиции нет или монитор отключили —
    центрирует на подходящем мониторе. На macOS позицию не трогаем (x=y=None)."""
    try:
        from src.core.config import get_vault_geometry_full, get_active_vault
        g = get_vault_geometry_full(get_active_vault())
        w, h = int(g["width"]), int(g["height"])
        x, y = g.get("x"), g.get("y")
    except Exception:
        w, h, x, y = 1200, 800, None, None

    if sys.platform != 'win32':
        return w, h, None, None

    try:
        import ctypes
        from ctypes import wintypes

        class POINT(ctypes.Structure):
            _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]

        class MONITORINFO(ctypes.Structure):
            _fields_ = [
                ("cbSize", wintypes.DWORD),
                ("rcMonitor", wintypes.RECT),
                ("rcWork", wintypes.RECT),
                ("dwFlags", wintypes.DWORD),
            ]

        user32 = ctypes.windll.user32
        MONITOR_DEFAULTTOPRIMARY = 1
        MONITOR_DEFAULTTONEAREST = 2

        if x is not None and y is not None:
            pt = POINT(int(x + w // 2), int(y + h // 2))
            hmon = user32.MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST)
        else:
            hmon = user32.MonitorFromPoint(POINT(0, 0), MONITOR_DEFAULTTOPRIMARY)

        user32.GetMonitorInfoW.argtypes = [ctypes.c_void_p, ctypes.POINTER(MONITORINFO)]
        mi = MONITORINFO()
        mi.cbSize = ctypes.sizeof(MONITORINFO)
        if not user32.GetMonitorInfoW(ctypes.c_void_p(hmon), ctypes.byref(mi)):
            return w, h, None, None

        work_left = mi.rcWork.left
        work_top = mi.rcWork.top
        work_w = mi.rcWork.right - mi.rcWork.left
        work_h = mi.rcWork.bottom - mi.rcWork.top

        # САМОЛЕЧЕНИЕ: размер ~во всю рабочую область — артефакт старого бага
        # (сохранённый maximize): честный размер такого масштаба сейв-гард
        # в конфиг не пишет. Сбрасываем на дефолт, окно центрируем.
        if w >= work_w - 16 and h >= work_h - 16:
            print(f"[Geometry] stale fullscreen-size {w}x{h} in config -> reset to default")
            w = min(1440, max(800, work_w - 320))
            h = min(960, max(600, work_h - 240))
            x, y = None, None

        # Размер не больше рабочей области ОДНОГО монитора
        w = max(800, min(w, work_w))
        h = max(600, min(h, work_h))

        if x is None or y is None:
            x = work_left + (work_w - w) // 2
            y = work_top + (work_h - h) // 2
        else:
            # Окно целиком внутри рабочей области своего монитора
            x = max(work_left, min(int(x), work_left + work_w - w))
            y = max(work_top, min(int(y), work_top + work_h - h))

        return int(w), int(h), int(x), int(y)
    except Exception:
        return w, h, None, None


_resize_timer = None
def bind_resize_event(win):
    """Дебаунс-сохранение геометрии окна (размер + позиция) через 1с после остановки мыши.
    Развёрнутое (maximized) окно не сохраняется: иначе на 4K в конфиг попадает 3840x2160,
    и следующий запуск создаёт гигантское обычное окно, расползающееся на два монитора."""
    state = {"maximized": False}

    def _do_save():
        try:
            if state["maximized"]:
                return
            if sys.platform == 'win32':
                import ctypes
                hwnd = _win32_hwnd_for(win)
                if not hwnd:
                    return
                # Настоящий maximize (Win+Up и т.п.) не сохраняем
                if ctypes.windll.user32.IsZoomed(hwnd):
                    return
                rect = _win32_get_rect(hwnd)
                if not rect:
                    return
                x, y, w, h = rect
                # РУЧНОЙ maximize (toggle_maximize_window растягивает окно SetWindowPos'ом
                # до рабочей области — IsZoomed его не видит): окно, покрывающее
                # ~всю рабочую область своего монитора, не считаем "размером пользователя"
                work = _win32_workarea_for_hwnd(hwnd)
                if work and w >= work[2] - 8 and h >= work[3] - 8:
                    return
            else:
                w, h = win.width, win.height
                try:
                    x, y = win.x, win.y
                except Exception:
                    x, y = None, None
            # Защита: не сохраняем размеры маленького окна выбора хранилищ
            if w <= 760 and h <= 680:
                return
            from src.core.config import set_vault_geometry, get_active_vault
            vault = get_active_vault()
            if vault:
                set_vault_geometry(vault, w, h, x, y)
                print(f"[Geometry] saved {w}x{h} @ ({x},{y}) for vault: {vault}")
        except Exception:
            pass

    def _schedule(*args):
        global _resize_timer
        if _resize_timer:
            _resize_timer.cancel()
        import threading
        _resize_timer = threading.Timer(1.0, _do_save)
        _resize_timer.start()

    win.events.resized += _schedule
    try:
        win.events.moved += _schedule
    except Exception:
        pass
    try:
        win.events.maximized += (lambda *a: state.update(maximized=True))
        win.events.restored += (lambda *a: state.update(maximized=False))
    except Exception:
        pass
    try:
        def _on_closing():
            _do_save()
            if getattr(win, '_is_shutting_down', False):
                return True
            
            win._is_shutting_down = True
            try:
                win.evaluate_js('if(window.appExit) { window.appExit(); } else { window.pywebview.api.force_close(); }')
            except Exception:
                _lock_vault_before_exit() # 🔐 шифруем защищённое хранилище
                import os
                os._exit(0)
            return False

        win.events.closing += _on_closing
    except Exception:
        pass


# ============================================================
#  🔐 Шифрование защищённого хранилища перед выходом из процесса
# ============================================================
_vault_exit_lock_done = False

def _lock_vault_before_exit():
    """
    Штатное завершение приложения: закрываем БД и шифруем защищённое хранилище.

    Делаем это через эндпоинт /vault/lock, но БЕЗ сети — вызываем его на том же
    asyncio-цикле (DATA_LOOP), где живёт БД, чтобы корректно закрыть SQLite
    (WAL checkpoint) перед шифрованием. Вызов идемпотентен (страхуемся флагом)
    и безопасен: если пароль не установлен или ключа сессии нет — no-op.

    При аварийном завершении (kill -9, краш) этот код не выполняется —
    шифрование не происходит (осознанное поведение: данные не теряются,
    а пароль при следующем входе всё равно будет запрошен).
    """
    global _vault_exit_lock_done
    if _vault_exit_lock_done:
        return
    _vault_exit_lock_done = True
    try:
        from src.core.config import get_active_vault
        from src.core import vault_crypto
        vault = get_active_vault()
        if not vault or not vault_crypto.is_protected(vault):
            return
        if vault_crypto.get_session_key(vault) is None:
            return

        print("[Security] 🔒 Locking protected vault before exit...")
        resp = DATA_LOOP.request(
            "POST", "/api/v1/system/vault/lock",
            {"content-type": "application/json"}, b"{}",
        )
        print(f"[Security] ✅ Vault locked on exit (status {resp.status_code})")
    except Exception as e:
        # Не блокируем выход: в худшем случае файлы останутся расшифрованными,
        # но пароль при следующем входе будет запрошен в любом случае.
        print(f"[Security] ⚠️ Lock on exit failed: {e}")


# --- ЗАМЕНИТЕ КЛАСС WindowAPI в wrapper.py на этот ---
class WindowAPI:
    # ------------------------------------------------------------------
    # 🌉 Мост данных: замена HTTP-сервера. Фронтенд шлёт сюда все запросы,
    # которые раньше уходили в fetch('/api/v1/...'). Метод прогоняет их через
    # in-process ASGI-приложение (без сети) и возвращает ответ фронту.
    # ------------------------------------------------------------------
    def api_request(self, method, path, headers=None, body_b64=None):
        """Единая точка входа фронта к бэкенду вместо HTTP.
        method — 'GET'/'POST'/... ; path — '/api/v1/...'(+query);
        headers — dict; body_b64 — base64 тела запроса или None.
        Возвращает {status, headers, body_b64} (тело всегда base64,
        чтобы одинаково обслуживать текст и бинарь)."""
        import base64 as _b64
        import json as _json
        try:
            body = _b64.b64decode(body_b64) if body_b64 else b""
            hdrs = {str(k): str(v) for k, v in (headers or {}).items()}
            resp = DATA_LOOP.request(method, path, hdrs, body)
            content = resp.content or b""
            return {
                "status": resp.status_code,
                "headers": {k: v for k, v in resp.headers.items()},
                "body_b64": _b64.b64encode(content).decode("ascii"),
            }
        except Exception as e:
            import traceback
            traceback.print_exc()
            payload = _json.dumps({"detail": str(e)}).encode("utf-8")
            return {
                "status": 500,
                "headers": {"content-type": "application/json"},
                "body_b64": _b64.b64encode(payload).decode("ascii"),
            }

    def get_asset_roots(self):
        """Абсолютные корни для резолвинга вложений в file://-URL:
        attachments_dir — папка вложений (было /doe/...),
        vault_dir — активное хранилище. Фронт кэширует и обновляет при смене
        vault. Используется в resolveMarkdownAssetSrc (app.js)."""
        try:
            from src.core.config import get_attachments_dir, get_active_vault
            attach = get_attachments_dir()
            vault = get_active_vault()
            return {
                "attachments_dir": str(attach) if attach else "",
                "vault_dir": str(vault) if vault else "",
            }
        except Exception as e:
            print(f"[Bridge] get_asset_roots failed: {e}")
            return {"attachments_dir": "", "vault_dir": ""}

    def get_pdfjs_dir(self):
        """Абсолютный путь к локально закэшированному PDF.js (file://-загрузка
        воркера/скрипта). Файлы кладёт эндпоинт /system/ensure-pdfjs."""
        try:
            from src.api.v1.system import get_pdfjs_dir as _gp
            return str(_gp())
        except Exception as e:
            print(f"[Bridge] get_pdfjs_dir failed: {e}")
            return ""

    def force_close(self):
        """Вызывается из JS для завершения работы приложения."""
        import os
        import sys
        import threading
        import time
            
        # 🐛 ФИКС ЗАВИСАНИЯ (Beachball of Death на macOS):
        # Если вызвать os._exit(0) прямо здесь, IPC-мост pywebview зависнет, 
        # ожидая возврата функции, и не отдаст команду обратно в JS.
        # Запускаем "убийцу" в отдельном потоке с микро-задержкой.
        def _kill_process():
            time.sleep(0.05) # Ждём 50мс, пока return True долетит до браузера
            _lock_vault_before_exit() # 🔐 шифруем защищённое хранилище
            try:
                sys.stdout.flush()
                sys.stderr.flush()
            except Exception:
                pass
            os._exit(0)

        threading.Thread(target=_kill_process, daemon=True).start()
        
        return True # Освобождаем мост!

    def close_window(self):
        """Закрывает окно (красная кнопка) — abort AI в JS уже сделан, просто выходим."""
        import sys
        if sys.platform == 'darwin':
            # ── Сохраняем геометрию окна ПЕРЕД os._exit ──
            # events.closing не сработает: os._exit убивает процесс мгновенно,
            # в обход Cocoa windowShouldClose_. А отложенный таймер
            # bind_resize_event (1 с) мог ещё не отработать, если пользователь
            # изменил размер окна и сразу закрыл приложение.
            try:
                win = webview.windows[-1] if webview.windows else None
                if win:
                    w, h = win.width, win.height
                    try:
                        x, y = win.x, win.y
                    except Exception:
                        x, y = None, None
                    # Не сохраняем геометрию окна выбора хранилищ
                    if not (w <= 760 and h <= 680):
                        from src.core.config import set_vault_geometry, get_active_vault
                        vault = get_active_vault()
                        if vault:
                            set_vault_geometry(vault, int(w), int(h),
                                              int(x) if x is not None else None,
                                              int(y) if y is not None else None)
            except Exception:
                pass

            import os as _os
            import threading
            import time
            
            # Также используем отложенное закрытие, чтобы избежать дедлока UI потока
            def _kill_process():
                time.sleep(0.05)
                _lock_vault_before_exit() # 🔐 шифруем защищённое хранилище
                try:
                    sys.stdout.flush()
                    sys.stderr.flush()
                except: pass
                _os._exit(0)
                
            threading.Thread(target=_kill_process, daemon=True).start()
            return True
        else:
            if webview.windows:
                import threading
                try:
                    import ctypes
                    hwnd = self._win_hwnd()
                    if hwnd:
                        # Нативное асинхронное закрытие средствами Windows.
                        # PostMessageW не блокирует поток, мост pywebview спокойно 
                        # возвращает ответ в JS, а ОС сама закрывает окно.
                        WM_CLOSE = 0x0010
                        ctypes.windll.user32.PostMessageW(hwnd, WM_CLOSE, 0, 0)
                        return
                except Exception as e:
                    print(f"[Close] WinAPI error: {e}")
                
                # ФОЛБЭК: Если WinAPI недоступен, откладываем destroy на 0.15с.
                # Этого времени достаточно, чтобы pywebview завершил JS-транзакцию
                # и избежал KeyError: 'child_...'
                win = webview.windows[-1]
                threading.Timer(0.15, win.destroy).start()
    def minimize_window(self):
        """Сворачивает окно в Dock (желтая кнопка)"""
        import sys
        if sys.platform == 'darwin':
            from PyObjCTools import AppHelper
            def _minimize():
                try:
                    import AppKit
                    app = AppKit.NSApplication.sharedApplication()
                    win = app.keyWindow() or app.mainWindow()
                    if win:
                        win.miniaturize_(None)
                except Exception as e:
                    print(f"[Minimize] Cocoa error: {e}")
            AppHelper.callAfter(_minimize)
        else:
            if webview.windows:
                webview.windows[-1].minimize()

    def _win_hwnd(self):
        """100% надёжное получение HWND текущего окна из внутренностей WinForms."""
        import sys
        if sys.platform != 'win32' or not webview.windows:
            return None
        win = webview.windows[-1]
        hwnd = None
        try:
            from webview.platforms.winforms import BrowserView
            bv = BrowserView.instances.get(win.uid)
            if bv is not None:
                hwnd = int(bv.Handle.ToInt64())
        except Exception:
            pass
        if not hwnd:
            hwnd = _win32_hwnd_for(win)
        # Страховка: поднимаемся до top-level окна (GA_ROOT = 2). Нативные
        # WM_NCLBUTTONDOWN (drag/resize/Aero Snap) работают только с ним.
        if hwnd:
            try:
                import ctypes
                root = ctypes.windll.user32.GetAncestor(hwnd, 2)
                if root:
                    hwnd = root
            except Exception:
                pass
        return hwnd

    def start_window_drag(self):
        """Бесшовное нативное перетаскивание заголовочной рамки."""
        import sys
        if sys.platform != 'win32':
            return False
        import ctypes
        
        hwnd = self._win_hwnd()
        if not hwnd:
            return False
            
        self._win_maximized = False
        
        # 1. КРИТИЧНО: Принудительно отбираем захват мыши у Chromium
        ctypes.windll.user32.ReleaseCapture()
        
        # 2. Получаем координаты курсора для ядра Windows
        class POINT(ctypes.Structure):
            _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]
        pt = POINT()
        ctypes.windll.user32.GetCursorPos(ctypes.byref(pt))
        lparam = ((pt.y & 0xFFFF) << 16) | (pt.x & 0xFFFF)
        
        # 3. Начинаем нативный Drag, вызывающий Aero Snap (HTCAPTION = 2)
        WM_NCLBUTTONDOWN = 0x00A1
        ctypes.windll.user32.PostMessageW(hwnd, WM_NCLBUTTONDOWN, 2, lparam)
        return True

    def start_window_resize(self, ht):
        """Плавный нативный ресайз за любые края окна."""
        import sys
        if sys.platform != 'win32':
            return False
        import ctypes
        
        hwnd = self._win_hwnd()
        if not hwnd:
            return False
            
        self._win_maximized = False
        
        # 1. КРИТИЧНО: Принудительно отбираем захват мыши у Chromium
        ctypes.windll.user32.ReleaseCapture()
        
        # 2. Получаем координаты курсора для ядра Windows
        class POINT(ctypes.Structure):
            _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]
        pt = POINT()
        ctypes.windll.user32.GetCursorPos(ctypes.byref(pt))
        lparam = ((pt.y & 0xFFFF) << 16) | (pt.x & 0xFFFF)
        
        # 3. Начинаем нативный ресайз ядром DWM (без подергиваний)
        WM_NCLBUTTONDOWN = 0x00A1
        ctypes.windll.user32.PostMessageW(hwnd, WM_NCLBUTTONDOWN, int(ht), lparam)
        return True

    def _win_rect(self, hwnd):
        import ctypes
        from ctypes import wintypes
        user32 = ctypes.windll.user32
        user32.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
        r = wintypes.RECT()
        user32.GetWindowRect(hwnd, ctypes.byref(r))
        return r.left, r.top, r.right, r.bottom

    def _cursor(self):
        import ctypes
        from ctypes import wintypes
        user32 = ctypes.windll.user32
        user32.GetCursorPos.argtypes = [ctypes.POINTER(wintypes.POINT)]
        p = wintypes.POINT()
        user32.GetCursorPos(ctypes.byref(p))
        return p.x, p.y

    def _set_bounds(self, hwnd, x, y, w, h):
        import ctypes
        from ctypes import wintypes
        user32 = ctypes.windll.user32
        user32.SetWindowPos.argtypes = [wintypes.HWND, wintypes.HWND,
                                        ctypes.c_int, ctypes.c_int,
                                        ctypes.c_int, ctypes.c_int, ctypes.c_uint]
        SWP_NOZORDER, SWP_NOACTIVATE = 0x0004, 0x0010
        user32.SetWindowPos(hwnd, 0, int(x), int(y), int(w), int(h),
                            SWP_NOZORDER | SWP_NOACTIVATE)

    def _start_interactive_loop(self, kind):
        """Запускает фоновый поток-таймер, который ~60 раз в секунду вызывает
        update_win_move/update_win_resize, пока номер поколения не сменится.
        Жизненно важно для безрамочного окна: когда курсор покидает клиентскую
        область (выходит за край окна при перетаскивании), события mousemove из
        WebView прекращаются. Опрос GetCursorPos ведёт себя независимо от этого,
        поэтому движение/ресайз не "залипают" на границе окна."""
        gen = self._interactive_gen
        import threading

        def _loop():
            while getattr(self, '_interactive_gen', -1) == gen:
                try:
                    if kind == 'move':
                        self.update_win_move()
                    else:
                        self.update_win_resize()
                except Exception:
                    pass
                time.sleep(1.0 / 60.0)

        t = threading.Thread(target=_loop, daemon=True)
        t.start()

    def begin_win_move(self):
        import sys
        if sys.platform != 'win32':
            return False
        hwnd = self._win_hwnd()
        if not hwnd:
            return False
        l, t, r, b = self._win_rect(hwnd)
        cx, cy = self._cursor()
        self._winmv = {'hwnd': hwnd, 'x': l, 'y': t, 'cx': cx, 'cy': cy}
        self._win_maximized = False
        # Поднимаем поколение -> останавливаем возможный прошлый цикл и
        # стартуем новый, привязанный к этому перетаскиванию.
        self._interactive_gen = getattr(self, '_interactive_gen', 0) + 1
        self._start_interactive_loop('move')
        return True

    def update_win_move(self):
        import sys, ctypes
        if sys.platform != 'win32':
            return False
        mv = getattr(self, '_winmv', None)
        if not mv:
            return False
        cx, cy = self._cursor()
        nx = mv['x'] + (cx - mv['cx'])
        ny = mv['y'] + (cy - mv['cy'])

        SWP_NOSIZE = 0x0001
        SWP_NOZORDER = 0x0004
        SWP_NOACTIVATE = 0x0010
        ctypes.windll.user32.SetWindowPos(mv['hwnd'], 0, int(nx), int(ny), 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE)
        return True

    def end_win_move(self):
        # Смена поколения останавливает фоновый цикл опроса.
        self._interactive_gen = getattr(self, '_interactive_gen', 0) + 1
        self._winmv = None
        return True

    def begin_win_resize(self, edges):
        import sys
        if sys.platform != 'win32':
            return False
        hwnd = self._win_hwnd()
        if not hwnd:
            return False
        l, t, r, b = self._win_rect(hwnd)
        cx, cy = self._cursor()
        self._winrz = {'hwnd': hwnd, 'l': l, 't': t, 'r': r, 'b': b,
                       'cx': cx, 'cy': cy, 'edges': str(edges)}
        self._win_maximized = False
        self._interactive_gen = getattr(self, '_interactive_gen', 0) + 1
        self._start_interactive_loop('resize')
        return True

    def update_win_resize(self):
        import sys
        if sys.platform != 'win32':
            return False
        rz = getattr(self, '_winrz', None)
        if not rz:
            return False
        cx, cy = self._cursor()
        dx, dy = cx - rz['cx'], cy - rz['cy']
        l, t, r, b = rz['l'], rz['t'], rz['r'], rz['b']
        e = rz['edges']
        if 'l' in e: l = rz['l'] + dx
        if 'r' in e: r = rz['r'] + dx
        if 't' in e: t = rz['t'] + dy
        if 'b' in e: b = rz['b'] + dy
        MINW, MINH = 800, 600
        if r - l < MINW:
            if 'l' in e: l = r - MINW
            else: r = l + MINW
        if b - t < MINH:
            if 't' in e: t = b - MINH
            else: b = t + MINH
        self._set_bounds(rz['hwnd'], l, t, r - l, b - t)
        return True

    def end_win_resize(self):
        self._interactive_gen = getattr(self, '_interactive_gen', 0) + 1
        self._winrz = None
        return True

    def toggle_maximize_window(self):
        """Разворот/восстановление. Разворачиваем в рабочую область монитора,
           чтобы безрамочное окно НЕ перекрывало панель задач."""
        import sys
        if sys.platform != 'win32':
            return False
        import ctypes
        from ctypes import wintypes
        hwnd = self._win_hwnd()
        if not hwnd:
            return False
        user32 = ctypes.windll.user32
        SWP_FRAMECHANGED = 0x0020

        if getattr(self, '_win_maximized', False):
            r = getattr(self, '_win_restore_rect', None)
            if r:
                user32.SetWindowPos(hwnd, 0, r[0], r[1], r[2], r[3], SWP_FRAMECHANGED)
            self._win_maximized = False
        else:
            rect = wintypes.RECT()
            user32.GetWindowRect(hwnd, ctypes.byref(rect))
            self._win_restore_rect = (rect.left, rect.top,
                                        rect.right - rect.left, rect.bottom - rect.top)
            MONITOR_DEFAULTTONEAREST = 2
            hmon = user32.MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST)

            class MONITORINFO(ctypes.Structure):
                _fields_ = [("cbSize", wintypes.DWORD),
                            ("rcMonitor", wintypes.RECT),
                            ("rcWork", wintypes.RECT),
                            ("dwFlags", wintypes.DWORD)]
            user32.GetMonitorInfoW.argtypes = [ctypes.c_void_p, ctypes.POINTER(MONITORINFO)]
            mi = MONITORINFO()
            mi.cbSize = ctypes.sizeof(MONITORINFO)
            user32.GetMonitorInfoW(ctypes.c_void_p(hmon), ctypes.byref(mi))
            w = mi.rcWork
            user32.SetWindowPos(hwnd, 0, w.left, w.top,
                                w.right - w.left, w.bottom - w.top, SWP_FRAMECHANGED)
            self._win_maximized = True
        return True

    def begin_window_drag(self):
        """Старт ручного перетаскивания. Всю работу с окном выполняем СТРОГО
           на главном потоке — иначе AppKit вешает приложение намертво."""
        import sys
        if sys.platform != 'darwin':
            return False
        from PyObjCTools import AppHelper

        def _begin():
            try:
                import AppKit
                app = AppKit.NSApplication.sharedApplication()
                win = app.keyWindow() or app.mainWindow()
                if win is None:
                    return

                # 🍏 НАТИВНОЕ перетаскивание: performWindowDragWithEvent_ отдаёт
                # жест системе, поэтому работают все штатные механики macOS —
                # визуальные "прилипания" к краям/углам, подсказки Window Tiling
                # (macOS 15+), корректные Spaces. Требуется живое мышиное событие
                # текущего жеста — успеваем его поймать, т.к. JS шлёт вызов
                # прямо из mousedown.
                ev = app.currentEvent()
                try:
                    ev_type = int(ev.type()) if ev is not None else -1
                except Exception:
                    ev_type = -1
                # 1 = NSEventTypeLeftMouseDown, 6 = NSEventTypeLeftMouseDragged
                if ev is not None and ev_type in (1, 6) and hasattr(win, 'performWindowDragWithEvent_'):
                    self._drag_native = True
                    self._drag_win = None  # ручной цикл не нужен
                    win.performWindowDragWithEvent_(ev)
                    return

                # Фолбэк: ручное перетаскивание (если событие не поймали)
                self._drag_native = False
                frame = win.frame()
                mouse = AppKit.NSEvent.mouseLocation()  # экранные коорд., origin снизу-слева
                self._drag_win = win
                self._drag_off_x = mouse.x - frame.origin.x
                self._drag_off_y = mouse.y - frame.origin.y
            except Exception as e:
                print(f"[Drag] begin error: {e}")

        AppHelper.callAfter(_begin)   # выполнится на главном потоке
        return True

    def drag_window(self):
        """Двигаем окно к текущей позиции мыши на главном потоке.
           Координаты целиком в системе Cocoa — без переворотов оси Y."""
        import sys
        if sys.platform != 'darwin':
            return False
        from PyObjCTools import AppHelper

        def _move():
            win = getattr(self, '_drag_win', None)
            if win is None:
                return
            try:
                import AppKit
                mouse = AppKit.NSEvent.mouseLocation()
                new_x = mouse.x - self._drag_off_x
                new_y = mouse.y - self._drag_off_y
                win.setFrameOrigin_(AppKit.NSMakePoint(new_x, new_y))
            except Exception as e:
                print(f"[Drag] move error: {e}")

        AppHelper.callAfter(_move)
        return True

    def end_window_drag(self):
        """Конец перетаскивания."""
        self._drag_win = None
        self._drag_native = False
        return True

    def set_traffic_lights(self, visible):
        """macOS: показать/скрыть «светофор» (кнопки закрытия/сворачивания/зума).
        Используется полноэкранными режимами приложения (например, Space —
        бесконечный холст), чтобы не отвлекать кнопками окна. На других ОС —
        no-op."""
        import sys
        if sys.platform != 'darwin':
            return True
        try:
            from PyObjCTools import AppHelper
        except Exception:
            return False

        def _apply():
            try:
                import AppKit
                app = AppKit.NSApplication.sharedApplication()
                win = app.keyWindow() or app.mainWindow()
                if win is None:
                    for w in (app.windows() or []):
                        if w.isVisible():
                            win = w
                            break
                if win is None:
                    return
                hidden = not bool(visible)
                # 0 = close, 1 = miniaturize, 2 = zoom
                for idx in (0, 1, 2):
                    try:
                        btn = win.standardWindowButton_(idx)
                        if btn is not None:
                            btn.setHidden_(hidden)
                    except Exception:
                        pass
            except Exception as e:
                print(f"[TrafficLights] error: {e}")

        AppHelper.callAfter(_apply)
        return True

    def zoom_window(self):
        """macOS: нативный zoom окна (двойной клик по заголовку, как у любого окна)."""
        import sys
        if sys.platform != 'darwin':
            return False
        from PyObjCTools import AppHelper

        def _zoom():
            try:
                import AppKit
                app = AppKit.NSApplication.sharedApplication()
                win = app.keyWindow() or app.mainWindow()
                if win is not None and (win.styleMask() & 8):  # NSWindowStyleMaskResizable
                    win.performZoom_(None)
            except Exception as e:
                print(f"[Zoom] error: {e}")

        AppHelper.callAfter(_zoom)
        return True

    def toggle_fullscreen(self):
        """Переключает нативный полноэкранный режим на macOS (зеленая кнопка)"""
        import sys
        if sys.platform == 'darwin':
            from PyObjCTools import AppHelper
            def _toggle():
                try:
                    import AppKit
                    app = AppKit.NSApplication.sharedApplication()
                    win = app.keyWindow() or app.mainWindow()
                    if win:
                        # Разрешаем окну переходить в нативный полноэкранный режим
                        # NSWindowCollectionBehaviorFullScreenPrimary = 128 (1 << 7)
                        behavior = win.collectionBehavior()
                        if not (behavior & 128):
                            win.setCollectionBehavior_(behavior | 128)
                        
                        # Вызываем нативный переход в полноэкранный режим
                        win.toggleFullScreen_(None)
                except Exception as e:
                    print(f"[Fullscreen] Cocoa error: {e}")
            AppHelper.callAfter(_toggle)
        else:
            if webview.windows:
                webview.windows[-1].toggle_fullscreen()

    def trigger_haptic(self):
        """Генерирует тактильный отклик на трекпадах macOS"""
        import sys
        if sys.platform == 'darwin':
            # На Apple Silicon (M1/M2/M3) приватный фреймворк MultitouchSupport возвращает True, 
            # но аппаратно глушится песочницей macOS, из-за чего старый код пропускал фолбэк.
            # Мы убираем хак и используем 100% надежный официальный API AppKit.
            try:
                import AppKit
                performer = AppKit.NSHapticFeedbackManager.defaultPerformer()
                if performer:
                    # pattern: 1 = NSHapticFeedbackPatternAlignment (Четкий физический щелчок стыковки)
                    # performanceTime: 1 = NSHapticFeedbackPerformanceTimeNow 
                    # ВАЖНО: Флаг "1" заставляет Taptic Engine сработать мгновенно, даже если 
                    # WebView "съел" нативный фокус мыши в момент кастомного Drag & Drop.
                    performer.performFeedbackPattern_performanceTime_(1, 1)
            except Exception as e:
                print(f"[Haptic] Error: {e}")
        return True

    def choose_file(self):
        """Вызывает нативный диалог выбора файла (macOS/Windows)"""
        if not webview.windows:
            return None
            
        window = webview.windows[0]
        result = window.create_file_dialog(
            dialog_type=webview.OPEN_DIALOG,
            allow_multiple=False
        )
        
        if result and len(result) > 0:
            return result[0]
        return None

    def choose_files(self):
        """Нативный диалог выбора НЕСКОЛЬКИХ файлов. Возвращает список путей.

        Пути отдаются фронтенду, который прикрепляет файлы через
        /system/attach-local: копирование в фоне с прогрессом, на macOS —
        мгновенный APFS-клон. Так вложения любого размера (200 ГБ+)
        прикрепляются без загрузки по HTTP и без подвисаний."""
        if not webview.windows:
            return []

        window = webview.windows[0]
        result = window.create_file_dialog(
            dialog_type=webview.OPEN_DIALOG,
            allow_multiple=True
        )

        if result:
            return list(result)
        return []

    def get_dropped_files(self):
        """Пути файлов из последнего Drag & Drop (только macOS).

        WKWebView не отдаёт JS настоящие пути при drop; их перехватывает
        патч performDragOperation: (см. верх файла) и складывает в реестр.
        Возвращает [{path, name, size, is_dir}] и очищает реестр."""
        taker = globals().get('_doe_take_dropped_files')
        if taker is None:
            return []
        try:
            return taker()
        except Exception as e:
            print(f"[DnD] ⚠️ get_dropped_files failed: {e}")
            return []

    def choose_directory(self):
        """Вызывает нативный диалог выбора папки (macOS/Windows)"""
        if not webview.windows:
            return None
            
        window = webview.windows[0]
        result = window.create_file_dialog(
            dialog_type=webview.FOLDER_DIALOG,
            allow_multiple=False
        )
        
        if result and len(result) > 0:
            return result[0]
        return None
    
    def open_local_path(self, path):
        """Открывает файл или папку в стандартном приложении ОС"""
        print(f"[System] Attempting to open path: {path}")
        try:
            clean_path = path.replace('file://', '')
            import urllib.parse
            clean_path = urllib.parse.unquote(clean_path)
            
            if sys.platform == 'darwin':
                subprocess.call(['open', clean_path])
            elif sys.platform == 'win32':
                os.startfile(clean_path)
            elif sys.platform.startswith('linux'):
                subprocess.call(['xdg-open', clean_path])
            return True
        except Exception as e:
            print(f"[System] Failed to open path: {e}")
            return False

    def reveal_local_path(self, path):
        """Открывает родительскую папку и выделяет в ней целевой файл/папку"""
        print(f"[System] Revealing path: {path}")
        try:
            clean_path = path.replace('file://', '')
            import urllib.parse
            clean_path = urllib.parse.unquote(clean_path)
            
            if sys.platform == 'darwin':
                # Флаг -R (Reveal) открывает Finder и выделяет элемент
                subprocess.call(['open', '-R', clean_path])
            elif sys.platform == 'win32':
                # Флаг /select открывает Проводник и выделяет элемент
                subprocess.call(['explorer', f'/select,{clean_path}'])
            elif sys.platform.startswith('linux'):
                # В Linux нет стандартизированного флага для выделения файла.
                # Безопасный фолбэк: просто открываем родительскую директорию.
                parent_dir = os.path.dirname(clean_path)
                subprocess.call(['xdg-open', parent_dir])
            return True
        except Exception as e:
            print(f"[System] Failed to reveal path: {e}")
            return False

    def reveal_window(self):
        print("[WebView] Signal received from JS: Interface is ready, showing window.")
        if not webview.windows:
            return
        
        # Берем последнее созданное окно
        window = webview.windows[-1]
        
        # 1. Показываем окно
        window.show()
        
        # 2. Вытягиваем окно на передний план
        import sys
        if sys.platform == 'darwin':
            try:
                import AppKit
                from Foundation import NSOperationQueue, NSNotificationCenter, NSObject
                
                # Создаем системный слушатель, который будет переключать заголовок
                if 'TitleToggleObserver' not in globals():
                    class TitleToggleObserver(NSObject):
                        def windowWillEnterFullScreen_(self, notification):
                            win = notification.object()
                            if hasattr(win, 'setTitleVisibility_'):
                                win.setTitleVisibility_(0) # 0 = Показывать на серой рамке
                                
                        def windowWillExitFullScreen_(self, notification):
                            win = notification.object()
                            if hasattr(win, 'setTitleVisibility_'):
                                win.setTitleVisibility_(1) # 1 = Прятать в оконном режиме
                                
                    globals()['TitleToggleObserver'] = TitleToggleObserver
                    globals()['_title_observer_instance'] = TitleToggleObserver.alloc().init()
                    
                    nc = NSNotificationCenter.defaultCenter()
                    nc.addObserver_selector_name_object_(
                        globals()['_title_observer_instance'],
                        b'windowWillEnterFullScreen:',
                        AppKit.NSWindowWillEnterFullScreenNotification,
                        None
                    )
                    nc.addObserver_selector_name_object_(
                        globals()['_title_observer_instance'],
                        b'windowWillExitFullScreen:',
                        AppKit.NSWindowWillExitFullScreenNotification,
                        None
                    )

                def _activate():
                    try:
                        AppKit.NSApp.activateIgnoringOtherApps_(True)
                        # Прячем заголовок при старте (т.к. стартуем в оконном режиме)
                        for win in AppKit.NSApp.windows():
                            if hasattr(win, 'setTitleVisibility_'):
                                if not (win.styleMask() & 16384): # 16384 = NSWindowStyleMaskFullScreen
                                    win.setTitleVisibility_(1)
                    except Exception:
                        pass
                        
                NSOperationQueue.mainQueue().addOperationWithBlock_(_activate)
            except Exception as e:
                print(f"[System] macOS UI Sync failed: {e}")
                
        elif sys.platform == 'win32':
            import ctypes
            from ctypes import wintypes
            try:
                # 🪟 ФИКС: раньше HWND искался по заголовку окна (FindWindowW),
                # а тип окна определялся по 'Select Vault' в title. При смене
                # хранилища окно перенавигируется и title меняется асинхронно —
                # гонка приводила к тому, что главное окно оставалось без
                # WS_THICKFRAME (нет нативного ресайза и Aero Snap).
                # Теперь: HWND берём напрямую из WinForms, тип окна — по URL.
                hwnd = self._win_hwnd() or ctypes.windll.user32.FindWindowW(None, window.title)
                if hwnd:
                    icon_path = os.path.join(bundle_dir, "favicon.ico")
                    if os.path.exists(icon_path):
                        hicon = ctypes.windll.user32.LoadImageW(0, icon_path, 1, 32, 32, 0x00000010)
                        ctypes.windll.user32.SendMessageW(hwnd, 0x0080, 0, hicon)
                        ctypes.windll.user32.SendMessageW(hwnd, 0x0080, 1, hicon)

                    # Разделяем логику: окно выбора хранилищ не должно менять размеры.
                    # Определяем по URL (надёжно), title — фолбэк на случай ошибки.
                    try:
                        _cur_url = window.get_current_url() or ''
                        is_resizable = 'mode=vault' not in _cur_url
                    except Exception:
                        is_resizable = "Select Vault" not in window.title

                    if is_resizable:
                        # 🌟 СТИЛИ ДЛЯ ГЛАВНОГО ОКНА (Разрешен ресайз + Aero Snap + Фикс полосы) 🌟
                        GWL_STYLE = -16
                        WS_CAPTION = 0x00C00000     
                        WS_THICKFRAME = 0x00040000  
                        WS_MINIMIZEBOX = 0x00020000
                        WS_MAXIMIZEBOX = 0x00010000
                        WS_SYSMENU = 0x00080000     
                        
                        style = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_STYLE)
                        new_style = (style & ~WS_CAPTION) | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU
                        ctypes.windll.user32.SetWindowLongW(hwnd, GWL_STYLE, new_style)

                        # WndProc Hook для удаления белой полосы (растягивает контент на 100% окна)
                        if ctypes.sizeof(ctypes.c_void_p) == 8:
                            GetWindowLongPtr = ctypes.windll.user32.GetWindowLongPtrW
                            GetWindowLongPtr.argtypes = [wintypes.HWND, ctypes.c_int]
                            GetWindowLongPtr.restype = ctypes.c_void_p

                            SetWindowLongPtr = ctypes.windll.user32.SetWindowLongPtrW
                            SetWindowLongPtr.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_void_p]
                            SetWindowLongPtr.restype = ctypes.c_void_p
                        else:
                            GetWindowLongPtr = ctypes.windll.user32.GetWindowLongW
                            GetWindowLongPtr.argtypes = [wintypes.HWND, ctypes.c_int]
                            GetWindowLongPtr.restype = ctypes.c_void_p

                            SetWindowLongPtr = ctypes.windll.user32.SetWindowLongW
                            SetWindowLongPtr.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_void_p]
                            SetWindowLongPtr.restype = ctypes.c_void_p

                        GWLP_WNDPROC = -4
                        WM_NCCALCSIZE = 0x0083

                        old_proc = GetWindowLongPtr(hwnd, GWLP_WNDPROC)

                        call_wnd_proc = ctypes.windll.user32.CallWindowProcW
                        call_wnd_proc.argtypes = [ctypes.c_void_p, wintypes.HWND, ctypes.c_uint, ctypes.c_void_p, ctypes.c_void_p]
                        call_wnd_proc.restype = ctypes.c_void_p

                        def custom_wndproc(h, msg, wp, lp):
                            if msg == WM_NCCALCSIZE and wp:
                                return 0
                            return call_wnd_proc(old_proc, h, msg, wp, lp)

                        WNDPROC_TYPE = ctypes.WINFUNCTYPE(ctypes.c_void_p, wintypes.HWND, ctypes.c_uint, ctypes.c_void_p, ctypes.c_void_p)
                        new_proc = WNDPROC_TYPE(custom_wndproc)

                        self._wndproc_keepalive = new_proc
                        SetWindowLongPtr(hwnd, GWLP_WNDPROC, ctypes.cast(new_proc, ctypes.c_void_p))
                        
                        ctypes.windll.user32.SetWindowPos(hwnd, 0, 0, 0, 0, 0, 0x0027) # SWP_FRAMECHANGED | NOMOVE | NOSIZE
                    else:
                        # 🔒 СТИЛИ ДЛЯ ОКНА ВЫБОРА ХРАНИЛИЩ (Ресайз заблокирован, Aero Snap выключен) 🔒
                        GWL_STYLE = -16
                        WS_CAPTION = 0x00C00000     
                        WS_THICKFRAME = 0x00040000  
                        WS_MAXIMIZEBOX = 0x00010000 
                        
                        style = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_STYLE)
                        # Полностью убираем рамку изменения размеров (WS_THICKFRAME) и кнопку развертывания (WS_MAXIMIZEBOX)
                        new_style = style & ~WS_CAPTION & ~WS_THICKFRAME & ~WS_MAXIMIZEBOX
                        ctypes.windll.user32.SetWindowLongW(hwnd, GWL_STYLE, new_style)
                        
                        ctypes.windll.user32.SetWindowPos(hwnd, 0, 0, 0, 0, 0, 0x0027) # SWP_FRAMECHANGED

                    # --- ОБЩИЕ СТИЛИ ДЛЯ ОБОИХ ОКОН (Визуальное оформление) ---
                    # Убираем стандартную рамку Windows 11
                    ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, 34, ctypes.byref(ctypes.c_uint(0xFFFFFFFE)), 4)
                    
                    # Тень вокруг окна
                    class MARGINS(ctypes.Structure):
                        _fields_ = [("cxLeftWidth", ctypes.c_int),
                                    ("cxRightWidth", ctypes.c_int),
                                    ("cyTopHeight", ctypes.c_int),
                                    ("cyBottomHeight", ctypes.c_int)]
                    margins = MARGINS(0, 0, 1, 0)
                    ctypes.windll.dwmapi.DwmExtendFrameIntoClientArea(hwnd, ctypes.byref(margins))
                    
                    # Темный режим нативной подложки
                    is_dark = 1 if bg_color == '#161815' else 0
                    ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, 20, ctypes.byref(ctypes.c_int(is_dark)), 4)

                    # Скругление углов Windows 11
                    DWMWA_WINDOW_CORNER_PREFERENCE = 33
                    DWMWCP_ROUND = 2
                    ctypes.windll.dwmapi.DwmSetWindowAttribute(
                        hwnd, DWMWA_WINDOW_CORNER_PREFERENCE,
                        ctypes.byref(ctypes.c_int(DWMWCP_ROUND)), 4
                    )
            except Exception as e:
                print(f"[WebView] Windows UI Sync failed: {e}")

    def open_main_window(self):
        """Порождает новое окно приложения и убивает ВСЕ старые окна (включая окно выбора хранилища)"""
        old_windows = list(webview.windows)

        t_w, t_h, t_x, t_y = get_safe_geometry()
        c_w, c_h = t_w, t_h
        if sys.platform == 'win32' and t_x is not None:
            # WinForms (AutoScaleMode.Dpi) умножит размер на DPI-масштаб монитора —
            # делим заранее, чтобы итог совпал с целевым физическим размером
            _scale = _win32_monitor_dpi_scale(t_x, t_y, t_w, t_h)
            c_w, c_h = max(800, round(t_w / _scale)), max(600, round(t_h / _scale))

        new_win = webview.create_window(
            title=MAIN_WINDOW_TITLE,
            url=runtime_index_url('board'),
            width=c_w,
            height=c_h,
            x=t_x,
            y=t_y,
            min_size=(800, 600),
            resizable=True,
            frameless=(sys.platform in ('darwin', 'win32')),
            easy_drag=False,
            background_color=bg_color,
            text_select=True,
            hidden=(not sys.platform.startswith('linux')),
            js_api=WindowAPI()
        )
        try:
            bind_resize_event(new_win)
            if sys.platform == 'win32' and t_x is not None:
                bind_geometry_enforcement(new_win, (t_x, t_y, t_w, t_h))
        except Exception:
            pass

        # Отложенное уничтожение старых окон. Если убить их прямо здесь, мост
        # pywebview (util._call) попытается вернуть результат этого вызова в уже
        # удалённое окно 'master' через evaluate_js → KeyError: 'master'.
        # Даём вызову завершить round-trip, потом чистим окна.
        def _kill_old():
            for w in old_windows:
                try:
                    w.destroy()
                except Exception:
                    pass
        threading.Timer(0.4, _kill_old).start()

    def open_vault_window(self):
        """Порождает маленькое окно выбора хранилища и убивает ВСЕ основные окна"""
        old_windows = list(webview.windows)
        webview.create_window(
            title='Doe — Select Vault',
            url=runtime_index_url('vault'),
            width=760,
            height=680,
            min_size=(760, 680),
            resizable=False,
            frameless=(sys.platform in ('darwin', 'win32')),
            easy_drag=False,
            background_color=bg_color,
            text_select=True,
            hidden=(not sys.platform.startswith('linux')),
            js_api=WindowAPI()
        )

        # См. комментарий в open_main_window: отложенный destroy, иначе
        # evaluate_js моста попадёт в уже мёртвое окно → KeyError: 'master'.
        def _kill_old():
            for w in old_windows:
                try:
                    w.destroy()
                except Exception:
                    pass
        threading.Timer(0.4, _kill_old).start()

if __name__ == '__main__':
    multiprocessing.freeze_support()
    print("[System] Starting main thread...")
    
    # --- Восстановление напоминаний при старте ---
    try:
        from src.core.config import restore_all_reminders
        restore_all_reminders()
        print("[System] Active reminders verified and restored.")
    except Exception as e:
        print(f"[System] Failed to restore active reminders: {e}")
    
    # Регистрируем себя в sys.modules под именем 'wrapper' даже когда запущены как __main__.
    # Это нужно, чтобы src/api/v1/system.py мог найти WindowAPI через sys.modules['wrapper'].
    sys.modules['wrapper'] = sys.modules['__main__']
    
    # ПЕРЕХВАТ ДВОЙНОГО КЛИКА ПО ФАЙЛУ .db.doe ИЗ ОС
    if len(sys.argv) == 2 and not sys.argv[1].startswith("--"):
        file_arg = sys.argv[1]
        if file_arg.endswith(".db.doe") and os.path.exists(file_arg):
            vault_dir = os.path.dirname(os.path.abspath(file_arg))

            # 🔒 Без сетевого сервера передать vault другому процессу по HTTP
            # больше нельзя. На macOS запущенный инстанс ловит файл через
            # AppleEvent (_doe_handle_vault_path). В остальных случаях просто
            # запоминаем vault и запускаемся штатно с нужной БД.
            from src.core.config import set_active_vault
            set_active_vault(vault_dir)
            print(f"[System] 🚀 Launched from file association. Active vault set to: {vault_dir}")

    # ФИКС ИКОНКИ И РЕЕСТРА ДЛЯ WINDOWS
    if sys.platform == 'win32':
        import ctypes
        try:
            app_id = 'doe.aesthetic.kanban.app.1'
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(app_id)
            print("[System] AppUserModelID set successfully.")
        except Exception as e:
            print(f"[System] Failed to set AppUserModelID: {e}")
            
        # ТИХАЯ РЕГИСТРАЦИЯ РАСШИРЕНИЯ В РЕЕСТРЕ WINDOWS (если запущено как .exe)
        try:
            if getattr(sys, 'frozen', False):
                import winreg
                exe_path = os.path.abspath(sys.argv[0])
                
                # Привязываем расширение. ВАЖНО: Windows (как и macOS) определяет расширение
                # только по последней точке, поэтому регистрируем .doe, а не .db.doe —
                # иначе ассоциация и иконка не подхватываются вообще.
                winreg.SetValue(winreg.HKEY_CURRENT_USER, r"Software\Classes\.doe", winreg.REG_SZ, "Doe.Vault")
                # Указываем команду на открытие
                winreg.SetValue(winreg.HKEY_CURRENT_USER, r"Software\Classes\Doe.Vault\shell\open\command", winreg.REG_SZ, f'"{exe_path}" "%1"')
                # Ставим иконку от нашего же экзешника
                winreg.SetValue(winreg.HKEY_CURRENT_USER, r"Software\Classes\Doe.Vault\DefaultIcon", winreg.REG_SZ, f'"{exe_path}",0')
                
                # Мгновенно уведомляем систему об изменении иконок (очистка кэша Explorer)
                import ctypes
                from ctypes import wintypes
                SHCNE_ASSOCCHANGED = 0x08000000
                SHCNF_IDLIST = 0x0000
                ctypes.windll.shell32.SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, None, None)
        except Exception as e:
            print(f"[System] Failed to register file association in Windows Registry: {e}")

    import signal
    import threading

    def force_quit():
        print("\n[System] 🛑 Завершение работы по CTRL+C...")
        # При жестком выходе не пытаемся выгружать LLM вручную,
        # так как это провоцирует SIGABRT/SIGBUS.
        # os._exit(0) ниже гарантирует, что деструкторы не будут вызваны,
        # а ОС сама безопасно очистит память.

        try:
            DATA_LOOP.shutdown()
        except Exception:
            pass

        time.sleep(0.2)
        try:
            sys.stdout.flush(); sys.stderr.flush()
        except Exception:
            pass
        # os._exit(0) пропускает ВСЕ деструкторы (Python atexit + C++ __cxa_finalize),
        # поэтому ggml_metal_device_free не вызывается вообще → нет SIGBUS.
        os._exit(0)

    def sigint_handler(signum, frame):
        force_quit()

    signal.signal(signal.SIGINT, sigint_handler)
    signal.signal(signal.SIGTERM, sigint_handler)

    # --- macOS/Unix: надёжный перехват Ctrl+C ---
    # На macOS главный поток уходит в нативный цикл Cocoa внутри webview.start(),
    # из-за чего питоновский SIGINT-обработчик откладывается до ближайшего UI-события,
    # и приложение «зависает» при Ctrl+C.
    # Решение — self-pipe через signal.set_wakeup_fd: низкоуровневый C-обработчик
    # CPython асинхронно (прямо в момент доставки сигнала, прерывая нативный код
    # Cocoa) записывает номер сигнала в pipe. Отдельный поток читает байт из pipe
    # и сразу делает os._exit(0). Это не зависит ни от состояния главного потока,
    # ни от того, кто и когда успеет выполнить питоновский обработчик.
    if sys.platform != 'win32':
        try:
            _sig_r, _sig_w = os.pipe()
            os.set_blocking(_sig_w, False)
            signal.set_wakeup_fd(_sig_w)

            # Должен быть установлен НЕ-дефолтный обработчик, иначе C-уровневый
            # хендлер CPython не запишет номер сигнала в wakeup-fd.
            def _noop_signal(signum, frame):
                pass
            signal.signal(signal.SIGINT, _noop_signal)
            signal.signal(signal.SIGTERM, _noop_signal)

            def _signal_reader():
                try:
                    os.read(_sig_r, 1)
                except Exception:
                    return
                # Жёсткий выход, как и в force_quit: os._exit обходит C++/atexit
                # деструкторы (ggml_metal_device_free) → исключаем SIGBUS.
                print("\n[System] 🛑 Завершение работы по CTRL+C...")
                try:
                    sys.stdout.flush(); sys.stderr.flush()
                except Exception:
                    pass
                os._exit(0)

            threading.Thread(
                target=_signal_reader, daemon=True, name="sigint-reader"
            ).start()
        except Exception as _sig_e:
            # Если механизм недоступен — остаёмся на штатном signal.signal-обработчике.
            print(f"[System] Signal watcher unavailable, fallback to default handler: {_sig_e}")


    # Обёртка: используется ПОСЛЕ webview.start(), т.к. pywebview перетирает хендлеры.
    def _wrapped_sigint(signum, frame):
        # Выходим максимально жёстко. Не пытаемся чистить LLM, 
        # так как ручная очистка в обработчике вызывает краш-диалог на macOS.
        # os._exit(0) обходит C++ atexit-деструкторы.
        print("\n[System] 🛑 Завершение работы по CTRL+C...")
        import os as _os
        _os._exit(0)

    if sys.platform == 'win32':
        import ctypes
        from ctypes import wintypes
        
        HandlerRoutine = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.DWORD)
        
        def console_ctrl_handler(ctrl_type):
            if ctrl_type in (0, 2):
                force_quit()
            return True
            
        _ctrl_handler = HandlerRoutine(console_ctrl_handler)
        ctypes.windll.kernel32.SetConsoleCtrlHandler(_ctrl_handler, True)

    try:
        # 🔒 Вместо uvicorn-сервера — единый asyncio-цикл с in-process ASGI.
        # Инициализация БД идёт в фоне (см. DataLoop._run → _app_startup),
        # окно появляется мгновенно, фронт ждёт /system/startup-status.
        DATA_LOOP.start()
        print("[Main] ✅ In-process data loop started (no network server).")

        # Push-уведомления о внешних изменениях БД (замена WebSocket).
        try:
            from src.core import watcher as _watcher
            _watcher.set_push_hook(push_db_updated)
        except Exception as _wh_e:
            print(f"[Main] Failed to register db-update push hook: {_wh_e}")

        print("[WebView] Creating invisible browser window...")
        _dump_geometry_diagnostics()
        
        # Проверяем, есть ли у нас уже активное хранилище И СУЩЕСТВУЕТ ЛИ ОНО
        from src.core.config import _load_config
        config_data = _load_config()
        active_vault = config_data.get("active_vault")
        is_configured = bool(active_vault and os.path.exists(active_vault))

        # 🔐 Защищённое хранилище при старте всегда заблокировано (ключ сессии
        # живёт только в памяти процесса), поэтому пользователь увидит экран
        # выбора хранилищ. Открываем компактное НЕресайзабельное окно селектора,
        # а не большое окно доски.
        if is_configured:
            try:
                from src.core import vault_crypto
                if vault_crypto.is_protected(active_vault):
                    is_configured = False
                    print("[System] 🔐 Active vault is protected — starting with Vault Selector window.")
            except Exception as _vc_e:
                print(f"[System] Vault protection check failed (non-fatal): {_vc_e}")

        # Задаем параметры в зависимости от того, первый ли это запуск
        if is_configured:
            t_w, t_h, t_x, t_y = get_safe_geometry()
        else:
            t_w, t_h, t_x, t_y = 760, 680, None, None

        start_url = runtime_index_url('board' if is_configured else 'vault')
        start_w = t_w
        start_h = t_h
        if sys.platform == 'win32' and is_configured and t_x is not None:
            _scale = _win32_monitor_dpi_scale(t_x, t_y, t_w, t_h)
            start_w = max(800, round(t_w / _scale))
            start_h = max(600, round(t_h / _scale))
        min_w = 800 if is_configured else 760
        min_h = 600 if is_configured else 680
        is_resizable = is_configured

        window = webview.create_window(
            title=MAIN_WINDOW_TITLE if is_configured else 'Doe — Select Vault',
            url=start_url,
            width=start_w,           
            height=start_h,          
            x=t_x,
            y=t_y,
            min_size=(min_w, min_h), 
            resizable=is_resizable,
            frameless=(sys.platform in ('darwin', 'win32')),
            easy_drag=False,     
            background_color=bg_color, 
            text_select=True,
            hidden=(not sys.platform.startswith('linux')),            
            js_api=WindowAPI()      
        )
        bind_resize_event(window)
        if sys.platform == 'win32' and is_configured and t_x is not None:
            bind_geometry_enforcement(window, (t_x, t_y, t_w, t_h))
        
        try:
            print("[WebView] Starting GUI engine...")
            
            # Перерегистрируем Apple Event handler через 1 секунду после старта GUI,
            # чтобы перекрыть любые попытки AppKit/pywebview восстановить дефолтный
            # handler 'odoc' (который показывает alert "could not be opened").
            if sys.platform == 'darwin':
                import threading
                def _reregister_safely():
                    try:
                        reg = globals().get('_doe_reregister_apple_event')
                        if reg:
                            reg()
                            print("[System] macOS: AppleEvent handler re-registered after webview start.")
                    except Exception as e:
                        print(f"[System] Re-registration failed: {e}")
                threading.Timer(1.0, _reregister_safely).start()
                # И ещё раз через 3 секунды — на случай отложенной инициализации делегата
                threading.Timer(3.0, _reregister_safely).start()
            
            # КЛЮЧЕВОЙ ФИКС ЗАВИСАНИЯ НА CTRL+C (macOS):
            # pywebview внутри webview.start() зовёт PyObjCTools.AppHelper.installMachInterrupt(),
            # который ставит Mach-обработчик SIGINT = AppHelper.machInterrupt. Тот на Ctrl+C
            # вызывает NSApp().terminate_(), запускающий штатное завершение Cocoa через exit():
            # выгружаются C++/Metal-деструкторы LLM (ggml_metal_device_free) → SIGBUS/зависание.
            # Этот Mach-обработчик перебивает ЛЮБОЙ питоновский signal.signal/set_wakeup_fd.
            #
            # installMachInterrupt() берёт функцию machInterrupt из глобалей модуля AppHelper
            # В МОМЕНТ ВЫЗОВА. Поэтому подменяем её ДО webview.start() — pywebview сам
            # корректно (на главном потоке, через свой Mach-порт) зарегистрирует нашу версию,
            # которая делает мгновенный os._exit(0) в обход NSApp.terminate_().
            if sys.platform == 'darwin':
                try:
                    from PyObjCTools import AppHelper as _AppHelper

                    def _fast_mach_quit(signum):
                        try:
                            sys.stdout.write("\n[System] 🛑 Завершение работы по CTRL+C...\n")
                            sys.stdout.flush()
                        except Exception:
                            pass
                        _lock_vault_before_exit() # 🔐 шифруем защищённое хранилище
                        # os._exit обходит atexit/C++ __cxa_finalize → нет ggml_metal_device_free → нет SIGBUS.
                        os._exit(0)

                    _AppHelper.machInterrupt = _fast_mach_quit
                    print("[System] macOS: Mach SIGINT handler patched for instant quit.")
                except Exception as _mach_e:
                    print(f"[System] macOS: failed to patch Mach interrupt: {_mach_e}")

            webview.start(debug=False)
        except KeyboardInterrupt:
            pass
        except Exception as e:
            print("[Main] WebView crashed:")
            traceback.print_exc()
        finally:
            # Чистим LLM при штатном закрытии окна
            try:
                from src.services.ai_service import _cleanup_llm
                _cleanup_llm()
            except Exception:
                pass
            print("[System] Window closed. Shutting down.")
            _lock_vault_before_exit() # 🔐 шифруем защищённое хранилище (идемпотентно)
            try:
                DATA_LOOP.shutdown()
            except Exception:
                pass
            print("[System] Data loop stopped. Exiting.")
            try:
                sys.stdout.flush(); sys.stderr.flush()  # PERF: добиваем буфер лога (os._exit обходит atexit)
            except Exception:
                pass
            os._exit(0)
            
    except Exception as e:
        print("[Main] FATAL ERROR IN MAIN BLOCK:")
        traceback.print_exc()
        sys.exit(1)
