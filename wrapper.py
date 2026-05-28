import sys
import subprocess
import os
import time

if len(sys.argv) >= 5 and sys.argv[1] == "--notify":
    try:
        delay = int(sys.argv[2])
        title = sys.argv[3]
        message = sys.argv[4]
        task_id = sys.argv[5] if len(sys.argv) >= 6 else None
        vault_path = sys.argv[6] if len(sys.argv) >= 7 else None
        
        time.sleep(delay)
        
        import os
        import json
        from pathlib import Path

        config_file = Path.home() / ".doe_config.json"
        reminder_valid = False
        current_vault_path = vault_path  # Фолбэк на старый путь

        if task_id and config_file.exists():
            try:
                with open(config_file, 'r', encoding='utf-8') as f:
                    config_data = json.load(f)
                
                reminders = config_data.get("active_reminders", [])
                for r in reminders:
                    if str(r.get("task_id")) == str(task_id):
                        reminder_valid = True
                        # Берем СВЕЖИЙ путь, если хранилище переехало
                        if r.get("vault_path"):
                            current_vault_path = r.get("vault_path")
                        break
            except Exception:
                # Если конфиг поврежден или заблокирован, разрешаем показ (лучше показать, чем пропустить)
                reminder_valid = True
                
        # Если напоминание было удалено пользователем
        if task_id and not reminder_valid:
            os._exit(0)
            
        # Если папка была удалена из системы или перенесена (но НЕ перепривязана в приложении)
        if current_vault_path and not os.path.exists(current_vault_path):
            os._exit(0)
            
        # Обновляем переменную для использования в кликах по уведомлению
        vault_path = current_vault_path
        
        if sys.platform == 'darwin':
            try:
                import subprocess
                import json
                import urllib.request
                
                safe_title = title.replace('"', '\\"')
                safe_message = message.replace('"', '\\"')
                
                # 1. Показываем нативное уведомление macOS через AppleScript (НЕ создает иконку в Dock)
                apple_script = f'display notification "{safe_message}" with title "{safe_title}"'
                subprocess.call(["osascript", "-e", apple_script])
                
                # 2. Отправляем сигнал на подсветку карточки в фоне
                payload = json.dumps({"task_id": int(task_id) if task_id else None, "vault_path": vault_path})
                req = urllib.request.Request(
                    "http://127.0.0.1:8000/api/v1/system/highlight-task",
                    data=payload.encode('utf-8'),
                    headers={'Content-Type': 'application/json'}
                )
                urllib.request.urlopen(req, timeout=1.0)
            except Exception:
                pass
        elif sys.platform == 'win32':
            safe_title = title.replace("'", "''")
            safe_message = message.replace("'", "''")
            
            import json
            # Безопасно формируем JSON для PowerShell
            ps_payload = json.dumps({"task_id": int(task_id) if task_id else None, "vault_path": vault_path})
            ps_payload_safe = ps_payload.replace("'", "''")
            
            ps_script = f"""
            Add-Type -AssemblyName System.Windows.Forms;
            $notify = New-Object System.Windows.Forms.NotifyIcon;
            $notify.Icon = [System.Drawing.SystemIcons]::Information;
            $notify.BalloonTipTitle = '{safe_title}';
            $notify.BalloonTipText = '{safe_message}';
            $notify.Visible = $True;
            
            $action = {{
                try {{
                    $body = '{ps_payload_safe}'
                    if ($body -match '"task_id": \\d+') {{
                        Invoke-WebRequest -Uri 'http://127.0.0.1:8000/api/v1/system/highlight-task' -Method POST -Body $body -ContentType 'application/json' -UseBasicParsing | Out-Null
                    }}
                }} catch {{ 
                    # Если приложение закрыто, пробуем его запустить
                    Start-Process "Doe.exe" -ErrorAction SilentlyContinue
                }}
                $notify.Visible = $False;
                [System.Windows.Forms.Application]::ExitThread();
            }}
            
            $notify.add_BalloonTipClicked($action);
            $notify.add_BalloonTipClosed({{ $notify.Visible = $False; [System.Windows.Forms.Application]::ExitThread(); }});
            
            $notify.ShowBalloonTip(10000);
            [System.Windows.Forms.Application]::Run();
            """
            import os
            os.system(f'powershell -WindowStyle Hidden -Command "{ps_script}"')
    except Exception:
        pass
    import os
    os._exit(0)

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
                self.file.flush()
            except Exception:
                pass
        if self.terminal:
            try:
                self.terminal.write(message)
                self.terminal.flush()
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


_resize_timer = None
def bind_resize_event(win):
    """Дебаунс-сохранение геометрии окна без нагрузки на диск (срабатывает через 1с после остановки мыши)."""
    def _on_resized(width, height):
        global _resize_timer
        if _resize_timer:
            _resize_timer.cancel()
        def _save():
            try:
                from src.core.config import set_vault_geometry, get_active_vault
                # Защита: не сохраняем размеры маленького окна выбора хранилищ
                if width > 760 or height > 680:
                    vault = get_active_vault()
                    if vault:
                        set_vault_geometry(vault, width, height)
            except Exception:
                pass
        import threading
        _resize_timer = threading.Timer(1.0, _save)
        _resize_timer.start()
    win.events.resized += _on_resized


# --- ЗАМЕНИТЕ КЛАСС WindowAPI в wrapper.py на этот ---
class WindowAPI:
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
        
        # Берем последнее созданное окно (надежнее при пересоздании окон)
        window = webview.windows[-1]
        
        if sys.platform == 'win32':
            import ctypes
            try:
                hwnd = ctypes.windll.user32.FindWindowW(None, window.title)
                if hwnd:
                    icon_path = os.path.join(bundle_dir, "favicon.ico")
                    if os.path.exists(icon_path):
                        hicon = ctypes.windll.user32.LoadImageW(0, icon_path, 1, 32, 32, 0x00000010)
                        ctypes.windll.user32.SendMessageW(hwnd, 0x0080, 0, hicon)
                        ctypes.windll.user32.SendMessageW(hwnd, 0x0080, 1, hicon)

                    hex_color = bg_color.lstrip('#')
                    r, g, b = tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
                    colorref = (b << 16) | (g << 8) | r
                    ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, 35, ctypes.byref(ctypes.c_int(colorref)), 4)
            except Exception as e:
                print(f"[WebView] Windows UI Sync failed: {e}")

        window.show()

    def open_main_window(self):
        """Порождает новое окно приложения и убивает ВСЕ старые окна (включая окно выбора хранилища)"""
        old_windows = list(webview.windows)
        
        try:
            from src.core.config import get_vault_geometry, get_active_vault
            t_w, t_h = get_vault_geometry(get_active_vault())
        except Exception:
            t_w, t_h = 1200, 800
            
        new_win = webview.create_window(
            title='Doe — Aesthetic Kanban',
            url=URL,
            width=t_w,
            height=t_h,
            min_size=(800, 600),
            resizable=True,
            background_color=bg_color,
            text_select=True,
            hidden=True,
            js_api=WindowAPI()
        )
        try:
            bind_resize_event(new_win)
        except Exception:
            pass

        # Уничтожаем все ранее открытые окна
        for w in old_windows:
            try:
                w.destroy()
            except Exception:
                pass

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
            background_color=bg_color,
            text_select=True,
            hidden=True,
            js_api=WindowAPI()
        )
        for w in old_windows:
            try:
                w.destroy()
            except Exception:
                pass

class APIServerThread(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        print(f"[Uvicorn] Initializing web server on port {PORT}...")
        config = uvicorn.Config(
            app, 
            host="127.0.0.1", 
            port=PORT, 
            log_level="info",
            access_log=True
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
        
        # Проверяем, есть ли у нас уже активное хранилище
        from src.core.config import _load_config
        config_data = _load_config()
        is_configured = "active_vault" in config_data

        # Задаем параметры в зависимости от того, первый ли это запуск
        if is_configured:
            from src.core.config import get_vault_geometry, get_active_vault
            try:
                t_w, t_h = get_vault_geometry(get_active_vault())
            except Exception:
                t_w, t_h = 1200, 800
        else:
            t_w, t_h = 760, 680

        start_url = URL if is_configured else f"{URL}?mode=vault"
        start_w = t_w
        start_h = t_h
        min_w = 800 if is_configured else 760
        min_h = 600 if is_configured else 680
        is_resizable = is_configured

        window = webview.create_window(
            title='Doe — Aesthetic Kanban' if is_configured else 'Doe — Select Vault',
            url=start_url,
            width=start_w,           
            height=start_h,          
            min_size=(min_w, min_h), 
            resizable=is_resizable,     
            background_color=bg_color, 
            text_select=True,
            hidden=True,            
            js_api=WindowAPI()      
        )
        bind_resize_event(window)
        
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
            os._exit(0)
            
    except Exception as e:
        print("[Main] FATAL ERROR IN MAIN BLOCK:")
        traceback.print_exc()
        sys.exit(1)
