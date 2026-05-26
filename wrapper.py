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
        

        # Глобальное удержание ссылки на ранний делегат во избежание сборки мусора (Garbage Collection)
        early_delegate_keep_alive = None
        if sys.platform == 'darwin':
            try:
                import AppKit
                import objc
                import urllib.parse
                
                app = AppKit.NSApplication.sharedApplication()
                app.setActivationPolicy_(0)

                # Единая логика для перехвата открытия файла в macOS.
                # Первым аргументом обязательно принимает self, так как метод связывается с инстансом делегата.
                def handle_mac_file_open(self, sender, filename):
                    try:
                        import os
                        import urllib.parse
                        import urllib.request
                        import json as _json
                        
                        clean_path = filename
                        if clean_path.startswith("file://"):
                            clean_path = clean_path.replace("file://", "", 1)
                        clean_path = urllib.parse.unquote(clean_path)
                        clean_path = os.path.abspath(clean_path)
                        
                        if not (clean_path.endswith(".doe") or clean_path.endswith(".db.doe")) or not os.path.exists(clean_path):
                            return False
                            
                        vault_dir = os.path.dirname(clean_path)
                        
                        import webview
                        if webview.windows:
                            # 1. Мы находимся в первом (активном) процессе.
                            # Безопасно переключаем БД через внутренний HTTP-запрос к самому себе (исключает конфликты потоков БД)
                            print(f"[System] 🚀 Hot-switch triggered in the running instance. Vault: {vault_dir}")
                            import threading
                            def perform_hot_switch():
                                try:
                                    req = urllib.request.Request(
                                        f"http://127.0.0.1:{PORT}/api/v1/system/vault/switch",
                                        data=_json.dumps({"new_path": vault_dir, "trigger_ui": True}).encode('utf-8'),
                                        headers={'Content-Type': 'application/json'}
                                    )
                                    urllib.request.urlopen(req, timeout=5.0)
                                except Exception as e:
                                    print(f"[System] Hot switch HTTP request failed: {e}")
                            
                            threading.Thread(target=perform_hot_switch, daemon=True).start()
                            return True
                        else:
                            # 2. Мы находимся в процессе-дублере, либо это первый запуск (холодный старт).
                            server_running_elsewhere = False
                            try:
                                req = urllib.request.urlopen(f"http://127.0.0.1:{PORT}/", timeout=0.3)
                                server_running_elsewhere = True
                            except Exception:
                                pass
                                
                            if server_running_elsewhere:
                                print(f"[System] Existing instance detected. Forwarding path to: {vault_dir}")
                                try:
                                    req = urllib.request.Request(
                                        f"http://127.0.0.1:{PORT}/api/v1/system/vault/switch",
                                        data=_json.dumps({"new_path": vault_dir, "trigger_ui": True}).encode('utf-8'),
                                        headers={'Content-Type': 'application/json'}
                                    )
                                    urllib.request.urlopen(req, timeout=2.0)
                                except Exception as e:
                                    print(f"[System] Failed to forward switch command: {e}")
                                
                                # Нативное изящное закрытие дублера через Cocoa RunLoop (устраняет Finder-ошибку "could not be opened")
                                import AppKit
                                import threading
                                threading.Timer(0.1, lambda: AppKit.NSApplication.sharedApplication().terminate_(None)).start()
                                return True
                            else:
                                from src.core.config import set_active_vault
                                set_active_vault(vault_dir)
                                print(f"[System] 🚀 Cold launch. Active vault set to: {vault_dir}")
                                return True
                    except Exception as e:
                        print(f"[System] Error in openFile: {e}")
                        return True

                class EarlyAppDelegate(AppKit.NSObject):
                    @objc.typedSelector(b'Z@:@@')
                    def application_openFile_(self, sender, filename):
                        return handle_mac_file_open(self, sender, filename)
                
                early_delegate = EarlyAppDelegate.alloc().init()
                # Сохраняем в глобальную переменную, чтобы Python-делегат не съел GC (garbage collector)
                early_delegate_keep_alive = early_delegate
                app.setDelegate_(early_delegate)
                print("[System] EarlyAppDelegate registered successfully for cold startup.")

                import webview.platforms.cocoa

                # ПРАВИЛЬНЫЙ PyObjC-патчинг через регистрацию в рантайме Objective-C.
                for delegate_name in ['AppDelegate', 'ApplicationDelegate', 'BrowserDelegate']:
                    if hasattr(webview.platforms.cocoa, delegate_name):
                        cls = getattr(webview.platforms.cocoa, delegate_name)
                        
                        sel = objc.selector(
                            handle_mac_file_open,
                            selector=b'application:openFile:',
                            signature=b'Z@:@@'
                        )
                        
                        try:
                            # classAddMethods гарантирует, что macOS увидит этот метод в работающем приложении
                            objc.classAddMethods(cls, [sel])
                            print(f"[System] macOS {delegate_name}.application_openFile_ registered via classAddMethods.")
                        except Exception as e:
                            setattr(cls, 'application_openFile_', sel)
                            print(f"[System] macOS {delegate_name}.application_openFile_ fallback setattr: {e}")

                print("[System] macOS application:openFile: injected successfully.")

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

        # Единая логика для перехвата открытия файла в macOS.
        # Метод принимает self в качестве первого аргумента, так как он связывается как метод экземпляра.
        def handle_mac_file_open(self, sender, filename):
            try:
                import os
                import urllib.parse
                import urllib.request
                import json as _json
                
                clean_path = filename
                if clean_path.startswith("file://"):
                    clean_path = clean_path.replace("file://", "", 1)
                clean_path = urllib.parse.unquote(clean_path)
                clean_path = os.path.abspath(clean_path)
                
                if not (clean_path.endswith(".doe") or clean_path.endswith(".db.doe")) or not os.path.exists(clean_path):
                    return False
                    
                vault_dir = os.path.dirname(clean_path)
                
                import webview
                if webview.windows:
                    # 1. Мы находимся в первом (активном) процессе.
                    # Выполняем переключение базы данных без блокирующих диалогов.
                    print(f"[System] 🚀 Hot-switch triggered in the running instance. Vault: {vault_dir}")
                    import threading
                    def perform_hot_switch():
                        try:
                            from src.db.database import switch_vault
                            import asyncio
                            asyncio.run(switch_vault(vault_dir))
                            api = WindowAPI()
                            api.open_main_window()
                        except Exception as e:
                            print(f"[System] Hot switch failed: {e}")
                    
                    threading.Thread(target=perform_hot_switch, daemon=True).start()
                    return True
                else:
                    # 2. Мы находимся в процессе-дублере, либо это первый запуск (холодный старт).
                    server_running_elsewhere = False
                    try:
                        # Проверяем доступность порта 8000
                        req = urllib.request.urlopen(f"http://127.0.0.1:{PORT}/", timeout=0.3)
                        server_running_elsewhere = True
                    except Exception:
                        pass
                        
                    if server_running_elsewhere:
                        # Если первый процесс активен, отправляем ему команду переключения и завершаем себя.
                        # Это предотвращает появление дублирующей иконки в macOS Dock.
                        print(f"[System] Existing instance detected. Forwarding path to: {vault_dir}")
                        try:
                            req = urllib.request.Request(
                                f"http://127.0.0.1:{PORT}/api/v1/system/vault/switch",
                                data=_json.dumps({"new_path": vault_dir, "trigger_ui": True}).encode('utf-8'),
                                headers={'Content-Type': 'application/json'}
                            )
                            urllib.request.urlopen(req, timeout=2.0)
                        except Exception as e:
                            print(f"[System] Failed to forward switch command: {e}")
                        
                        # Откладываем завершение процесса на 100мс, чтобы AppKit успел вернуть True в ОС
                        import threading
                        threading.Timer(0.1, lambda: os._exit(0)).start()
                        return True
                    else:
                        # Холодный запуск: сохраняем путь как активный для инициализации БД
                        from src.core.config import set_active_vault
                        set_active_vault(vault_dir)
                        print(f"[System] 🚀 Cold launch. Active vault set to: {vault_dir}")
                        return True
            except Exception as e:
                print(f"[System] Error in openFile: {e}")
                return True

        # БЕЗОПАСНЫЙ И ПРЯМОЙ MONKEY-PATCHING ЧЕРЕЗ КЛАССЫ РАНТАЙМА Objective-C:
        for delegate_name in ['AppDelegate', 'ApplicationDelegate', 'BrowserDelegate']:
            if hasattr(webview.platforms.cocoa, delegate_name):
                cls = getattr(webview.platforms.cocoa, delegate_name)
                
                sel = objc.selector(
                    handle_mac_file_open,
                    selector=b'application:openFile:',
                    signature=b'Z@:@@'
                )
                
                try:
                    # classAddMethods принудительно регистрирует метод в таблице виртуальных методов Cocoa
                    objc.classAddMethods(cls, [sel])
                    print(f"[System] macOS {delegate_name}.application_openFile_ registered via classAddMethods.")
                except Exception as e:
                    setattr(cls, 'application_openFile_', sel)
                    print(f"[System] macOS {delegate_name}.application_openFile_ fallback setattr: {e}")

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

# --- ЗАМЕНИТЕ КЛАСС WindowAPI в wrapper.py на этот ---
class WindowAPI:
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
        # Снимок всех окон ДО создания нового — гарантированно не содержит новое окно.
        # Это надёжнее, чем webview.active_window(), который при открытии файла из Finder
        # (когда приложение не в фокусе) может вернуть None или не то окно, оставив диалог висеть.
        old_windows = list(webview.windows)
        webview.create_window(
            title='Doe — Aesthetic Kanban',
            url=URL,
            width=1200,
            height=800,
            min_size=(800, 600),
            resizable=True,
            background_color=bg_color,
            text_select=True,
            hidden=True,
            js_api=WindowAPI()
        )
        # Уничтожаем все ранее открытые окна (диалоговое окно выбора хранилища и т.д.)
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
        start_url = URL if is_configured else f"{URL}?mode=vault"
        start_w = 1200 if is_configured else 760
        start_h = 800 if is_configured else 680
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
        
        try:
            print("[WebView] Starting GUI engine...")
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
