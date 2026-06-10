import sys
import subprocess
import os
import time
import json
import urllib.request
import sqlite3
from datetime import datetime
from pathlib import Path

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
    due_time_iso = sys.argv[2]
    title = sys.argv[3]
    message = sys.argv[4]
    task_id = sys.argv[5]
    vault_path = sys.argv[6]
    reminder_id = sys.argv[7]

    due_time = datetime.fromisoformat(due_time_iso.replace("Z", ""))
    while datetime.utcnow() < due_time:
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

    payload = json.dumps({"task_id": int(task_id), "vault_path": vault_path}).encode('utf-8')

    def send_highlight_request():
        try:
            req = urllib.request.Request(
                "http://127.0.0.1:8000/api/v1/system/highlight-task",
                data=payload,
                headers={'Content-Type': 'application/json'}
            )
            urllib.request.urlopen(req, timeout=1.0)
            return True
        except Exception:
            return False

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
        import AppKit
        from Foundation import NSObject, NSRunLoop, NSDate
        
        global_state = {"keep_running": True}

        class NotificationDelegate(NSObject):
            def userNotificationCenter_didActivateNotification_(self, center, notification):
                write_pending_highlight()
                if not send_highlight_request():
                    subprocess.Popen(['open', '-n', '-a', str(Path(sys.executable).parent.parent.parent)])
                else:
                    subprocess.Popen(['open', '-a', str(Path(sys.executable).parent.parent.parent)])
                global_state["keep_running"] = False
                
            def userNotificationCenter_shouldPresentNotification_(self, center, notification): return True
            def userNotificationCenter_didDismissNotification_(self, center, notification): global_state["keep_running"] = False
            def timeout_(self, timer): global_state["keep_running"] = False

        notification = AppKit.NSUserNotification.alloc().init()
        notification.setTitle_(title)
        notification.setInformativeText_(message)
        notification.setSoundName_(AppKit.NSUserNotificationDefaultSoundName)
        
        delegate = NotificationDelegate.alloc().init()
        globals()['_mac_delegate_retained'] = delegate
        center = AppKit.NSUserNotificationCenter.defaultUserNotificationCenter()
        center.setDelegate_(delegate)
        center.deliverNotification_(notification)
        
        AppKit.NSTimer.scheduledTimerWithTimeInterval_target_selector_userInfo_repeats_(60.0, delegate, "timeout:", None, False)
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
                    if not send_highlight_request():
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
                
                # Универсальная проверка: жив ли уже наш сервер (наш процесс или дубль)
                server_running = False
                try:
                    urllib.request.urlopen(f"http://127.0.0.1:{PORT}/", timeout=0.5)
                    server_running = True
                except Exception:
                    pass
                
                if server_running:
                    # Сервер уже запущен — единый путь через HTTP-эндпоинт.
                    # Эндпоинт /vault/switch:
                    #   • переключит БД через switch_vault() (внутри обновится vault_history)
                    #   • сам решит что делать с окнами (vault-селектор / Kanban)
                    #   • для same-vault просто поднимет существующее окно
                    # Этот же эндпоинт уже годами работает для Windows file-association.
                    print(f"[System] 🚀 Forwarding vault switch via HTTP: {vault_dir}")
                    
                    import threading
                    def _fire_switch():
                        try:
                            req = urllib.request.Request(
                                f"http://127.0.0.1:{PORT}/api/v1/system/vault/switch",
                                data=_json.dumps({"new_path": vault_dir, "trigger_ui": True}).encode('utf-8'),
                                headers={'Content-Type': 'application/json'}
                            )
                            urllib.request.urlopen(req, timeout=10.0)
                        except Exception as e:
                            print(f"[System] HTTP forward failed: {e}")
                            traceback.print_exc()
                    # HTTP кидаем в фон, чтобы не блокировать AppKit-поток (никаких beach-ball).
                    threading.Thread(target=_fire_switch, daemon=True).start()
                    
                    # Если у нас нет своих окон — мы дубль-процесс, нужно завершиться,
                    # чтобы в macOS Dock не висела вторая иконка приложения.
                    import webview
                    if not webview.windows:
                        threading.Timer(0.5, lambda: os._exit(0)).start()
                    return True
                else:
                    # Сервер ещё не поднят — холодный запуск.
                    # Просто запоминаем путь, чтобы init_dev_database() инициализировал нужную БД.
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
                    # Формируем имя файла: [НазваниеХранилища].log.doe.txt внутри самой папки хранилища
                    return vp / f"{vp.name}.log.doe.txt"
    except Exception:
        pass
    # Фолбэк: если хранилище еще не выбрано или конфиг недоступен
    return Path.home() / ".log.doe.txt"

class LoggerWriter:
    def __init__(self, original_stream, is_main=False):
        self.terminal = original_stream
        self.is_main = is_main
        self.current_path = None
        self.file = None
        self.last_check_time = 0
        self._check_and_switch_file(force=True)

    def _check_and_switch_file(self, force=False):
        now = time.time()
        # Троттлинг: проверяем смену папки не чаще раза в 2 секунды, чтобы не грузить диск
        if not force and (now - self.last_check_time < 2.0):
            return
        self.last_check_time = now

        new_path = get_dynamic_log_path()
        if new_path != self.current_path:
            # Если путь изменился на лету (пользователь сменил Vault)
            if self.file:
                try:
                    self.file.write(f"\n[System] 🔄 Redirecting logs to new vault: {new_path}\n")
                    self.file.close()
                except Exception:
                    pass
            
            self.current_path = new_path
            try:
                self.file = open(self.current_path, 'a', encoding='utf-8')
                if self.is_main:
                    self.file.write(f"\n{'='*50}\n")
                    self.file.write(f"🚀 DOE APP Session Started: {datetime.now()}\n")
                    self.file.write(f"📁 Log Location: {self.current_path}\n")
                    self.file.write(f"{'='*50}\n")
                    self.is_main = False
            except Exception:
                self.file = None

    def write(self, message):
        self._check_and_switch_file()
        if self.file:
            try:
                self.file.write(message)
                # PERF: flush не чаще раза в секунду вместо каждой строки.
                # Это убирает постоянное дисковое I/O (и iCloud-синхронизацию,
                # если vault лежит в облачной папке). Контент лога идентичен.
                now = time.time()
                if now - getattr(self, '_last_flush', 0) >= 1.0:
                    self._last_flush = now
                    self.file.flush()
            except Exception:
                pass
        if self.terminal:
            try:
                self.terminal.write(message)
            except Exception:
                pass

    def flush(self):
        if self.file:
            try:
                self.file.flush()
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
        if self.file and hasattr(self.file, name):
            return getattr(self.file, name)
        raise AttributeError(f"Neither terminal nor file has attribute '{name}'")

# Глобальный перехват вывода для ВСЕХ ОС (включая macOS)
sys.stdout = LoggerWriter(sys.__stdout__, is_main=True)

# PERF: т.к. flush теперь троттлится, гарантируем сброс хвоста лога при выходе
import atexit
atexit.register(lambda: (sys.stdout.flush(), sys.stderr.flush()))
sys.stderr = LoggerWriter(sys.__stderr__, is_main=False)

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
import urllib.request
import webview
import uvicorn
import subprocess  # Для macOS 'open'
import os          # Для Windows 'os.startfile'

print("[System] Loading FastAPI core...")
from main import app
from src.core.config import get_ui_settings

PORT = 8000
URL = f"http://127.0.0.1:{PORT}/app"

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



MAIN_WINDOW_TITLE = 'Doe — Aesthetic Kanban'

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
            return int(bv.Handle.ToInt32())
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

    def _matches(cur):
        return cur and all(abs(a - b) <= 2 for a, b in zip(cur, (x, y, w, h)))

    def _enforce(*args):
        import threading
        def _loop(attempt=0):
            try:
                import ctypes
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
        win.events.closing += (lambda *a: _do_save())
    except Exception:
        pass


# --- ЗАМЕНИТЕ КЛАСС WindowAPI в wrapper.py на этот ---
class WindowAPI:
    def close_window(self):
        """Закрывает окно (красная кнопка)"""
        import sys
        if sys.platform == 'darwin':
            from PyObjCTools import AppHelper
            def _close():
                try:
                    import AppKit
                    app = AppKit.NSApplication.sharedApplication()
                    win = app.keyWindow() or app.mainWindow()
                    if win:
                        win.performClose_(None)
                except Exception as e:
                    print(f"[Close] Cocoa error: {e}")
            AppHelper.callAfter(_close)
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
        """Достаём HWND текущего окна (тем же способом, что и reveal_window)."""
        import ctypes
        try:
            title = webview.windows[-1].title
            return ctypes.windll.user32.FindWindowW(None, title)
        except Exception:
            return None

    def start_window_drag(self):
        """Нативное перетаскивание безрамочного окна (Aero Snap включён)."""
        import sys
        if sys.platform != 'win32':
            return False
        import ctypes
        
        # 1. Надежно получаем активное окно (оно всегда в фокусе, раз мы по нему кликнули)
        hwnd = ctypes.windll.user32.GetForegroundWindow()
        if not hwnd:
            return False
        
        self._win_maximized = False
        
        # 2. Обходим защиту Windows (ReleaseCapture работает только в UI-потоке)
        gui_thread_id = ctypes.windll.user32.GetWindowThreadProcessId(hwnd, None)
        current_thread_id = ctypes.windll.kernel32.GetCurrentThreadId()
        
        ctypes.windll.user32.AttachThreadInput(current_thread_id, gui_thread_id, True)
        ctypes.windll.user32.ReleaseCapture()
        ctypes.windll.user32.AttachThreadInput(current_thread_id, gui_thread_id, False)
        
        # 3. Передаем точные координаты мыши, чтобы окно не прыгнуло в (0,0)
        class POINT(ctypes.Structure):
            _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]
        pt = POINT()
        ctypes.windll.user32.GetCursorPos(ctypes.byref(pt))
        lparam = (pt.y << 16) | (pt.x & 0xFFFF)
        
        WM_NCLBUTTONDOWN, HTCAPTION = 0x00A1, 2
        ctypes.windll.user32.PostMessageW(hwnd, WM_NCLBUTTONDOWN, HTCAPTION, lparam)
        return True

    def start_window_resize(self, ht):
        """Нативный ресайз за край без визуальных артефактов."""
        import sys
        if sys.platform != 'win32':
            return False
        import ctypes
        
        hwnd = ctypes.windll.user32.GetForegroundWindow()
        if not hwnd:
            return False
            
        self._win_maximized = False
        
        gui_thread_id = ctypes.windll.user32.GetWindowThreadProcessId(hwnd, None)
        current_thread_id = ctypes.windll.kernel32.GetCurrentThreadId()
        
        ctypes.windll.user32.AttachThreadInput(current_thread_id, gui_thread_id, True)
        ctypes.windll.user32.ReleaseCapture()
        ctypes.windll.user32.AttachThreadInput(current_thread_id, gui_thread_id, False)
        
        class POINT(ctypes.Structure):
            _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]
        pt = POINT()
        ctypes.windll.user32.GetCursorPos(ctypes.byref(pt))
        lparam = (pt.y << 16) | (pt.x & 0xFFFF)
        
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
        from ctypes import wintypes
        user32 = ctypes.windll.user32
        user32.SetWindowPos.argtypes = [wintypes.HWND, wintypes.HWND,
                                        ctypes.c_int, ctypes.c_int,
                                        ctypes.c_int, ctypes.c_int, ctypes.c_uint]
        SWP_NOSIZE, SWP_NOZORDER, SWP_NOACTIVATE = 0x0001, 0x0004, 0x0010
        user32.SetWindowPos(mv['hwnd'], 0, int(nx), int(ny), 0, 0,
                            SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE)
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
                from Foundation import NSOperationQueue
                
                def _activate():
                    try:
                        AppKit.NSApp.activateIgnoringOtherApps_(True)
                    except Exception:
                        pass
                        
                NSOperationQueue.mainQueue().addOperationWithBlock_(_activate)
            except Exception as e:
                print(f"[System] macOS UI Sync failed: {e}")
                
        elif sys.platform == 'win32':
            import ctypes
            from ctypes import wintypes
            try:
                hwnd = ctypes.windll.user32.FindWindowW(None, window.title)
                if hwnd:
                    icon_path = os.path.join(bundle_dir, "favicon.ico")
                    if os.path.exists(icon_path):
                        hicon = ctypes.windll.user32.LoadImageW(0, icon_path, 1, 32, 32, 0x00000010)
                        ctypes.windll.user32.SendMessageW(hwnd, 0x0080, 0, hicon)
                        ctypes.windll.user32.SendMessageW(hwnd, 0x0080, 1, hicon)

                    # Разделяем логику: окно выбора хранилищ не должно менять размеры
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
            url=URL,
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
            hidden=True,
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
            url=f"{URL}?mode=vault",
            width=760,
            height=680,
            min_size=(760, 680),
            resizable=False,
            frameless=(sys.platform in ('darwin', 'win32')),
            easy_drag=False,
            background_color=bg_color,
            text_select=True,
            hidden=True,
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

class APIServerThread(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        print(f"[Uvicorn] Initializing web server on port {PORT}...")
        config = uvicorn.Config(
            app, 
            host="127.0.0.1", 
            port=PORT, 
            # PERF: access-лог писал строку + flush на диск при КАЖДОМ запросе.
            # Фронтенд поллит API каждую секунду => постоянная запись в папку vault
            # (плюс лишние события для watchdog и churn для iCloud).
            log_level="warning",
            access_log=False
        )
        self.server = uvicorn.Server(config)

    def run(self):
        print("[Uvicorn] Server thread started.")
        try:
            self.server.run()
        except Exception as e:
            print(f"[Uvicorn] CRITICAL SERVER ERROR: {e}")
            traceback.print_exc()

    def stop(self):
        print("[Uvicorn] Stop command received for the server...")
        self.server.should_exit = True

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
            
            # Проверяем, запущен ли уже сервер (первый процесс)
            server_running = False
            try:
                import urllib.request
                import json as _json
                req = urllib.request.Request(
                    f"http://127.0.0.1:{PORT}/api/v1/system/vault/switch",
                    data=_json.dumps({"new_path": vault_dir, "trigger_ui": True}).encode('utf-8'),
                    headers={'Content-Type': 'application/json'}
                )
                urllib.request.urlopen(req, timeout=2)
                server_running = True
            except Exception:
                pass
                
            if server_running:
                print(f"[System] Passed vault to existing instance. Exiting.")
                import os
                os._exit(0) # Убиваем второй процесс, первый процесс всё сделает сам
            else:
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

    server_thread = None

    import signal
    import threading
    
    def force_quit():
        print("\n[System] 🛑 Завершение работы по CTRL+C...")
        if webview.windows:
            try:
                webview.windows[0].destroy()
            except Exception:
                pass

        global server_thread
        if server_thread is not None:
            try:
                server_thread.stop()
                server_thread.join(timeout=0.5)
            except Exception:
                pass
                
        time.sleep(0.2)
        try:
            sys.stdout.flush(); sys.stderr.flush()  # PERF: добиваем буфер лога
        except Exception:
            pass
        os._exit(0)

    def sigint_handler(signum, frame):
        if webview.windows:
            try:
                webview.windows[0].destroy()
            except Exception:
                pass
        threading.Timer(0.5, force_quit).start()

    signal.signal(signal.SIGINT, sigint_handler)
    signal.signal(signal.SIGTERM, sigint_handler)

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
        server_thread = APIServerThread()
        server_thread.start()

        print("[Main] Waiting for server readiness (5 seconds timeout)...")
        timeout = 5.0
        start_time = time.time()
        server_ready = False
        
        while time.time() - start_time < timeout:
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{PORT}/")
                server_ready = True
                print(f"[Main] ✅ Server successfully responded on port {PORT}!")
                break
            except Exception:
                time.sleep(0.05)

        if not server_ready:
            print("[Main] ❌ WARNING: Server did not respond within 5 seconds. Port might be in use or DB is broken.")

        print("[WebView] Creating invisible browser window...")
        _dump_geometry_diagnostics()
        
        # Проверяем, есть ли у нас уже активное хранилище
        from src.core.config import _load_config
        config_data = _load_config()
        is_configured = "active_vault" in config_data

        # Задаем параметры в зависимости от того, первый ли это запуск
        if is_configured:
            t_w, t_h, t_x, t_y = get_safe_geometry()
        else:
            t_w, t_h, t_x, t_y = 760, 680, None, None

        start_url = URL if is_configured else f"{URL}?mode=vault"
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
            hidden=True,            
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
            
            webview.start(debug=False)
        except KeyboardInterrupt:
            pass
        except Exception as e:
            print("[Main] WebView crashed:")
            traceback.print_exc()
        finally:
            print("[System] Window closed. Shutting down.")
            if server_thread:
                server_thread.stop()
                server_thread.join(timeout=0.2)
            print("[System] Server stopped. Exiting.")
            try:
                sys.stdout.flush(); sys.stderr.flush()  # PERF: добиваем буфер лога (os._exit обходит atexit)
            except Exception:
                pass
            os._exit(0)
            
    except Exception as e:
        print("[Main] FATAL ERROR IN MAIN BLOCK:")
        traceback.print_exc()
        sys.exit(1)
