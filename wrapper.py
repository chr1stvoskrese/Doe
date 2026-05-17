import sys
import subprocess
import os
import time

# ==========================================
# 🔔 SENIOR HACK: ФОНОВЫЙ УВЕДОМИТЕЛЬ (ОБРАБОТКА --notify)
# ==========================================
# ВАЖНО: Этот блок ДОЛЖЕН БЫТЬ ДО инициализации AppKit и setActivationPolicy.
# Иначе macOS будет думать, что запускается полноценное GUI-приложение, 
# и начнет прыгать пустой иконкой в Dock.
if len(sys.argv) >= 5 and sys.argv[1] == "--notify":
    try:
        delay = int(sys.argv[2])
        title = sys.argv[3].replace('"', '\\"')
        message = sys.argv[4].replace('"', '\\"')
        
        time.sleep(delay)
        
        if sys.platform == 'darwin':
            try:
                # Используем нативный API macOS. 
                # Так как мы не вызываем setActivationPolicy_(0), в Dock ничего не появится.
                # А иконка уведомления в собранном приложении автоматически подтянется из Doe.app
                import AppKit
                notification = AppKit.NSUserNotification.alloc().init()
                notification.setTitle_(title)
                notification.setInformativeText_(message)
                
                center = AppKit.NSUserNotificationCenter.defaultUserNotificationCenter()
                center.deliverNotification_(notification)
                
                # 🔥 КРИТИЧЕСКИЙ ФИКС: Даем демону уведомлений macOS время забрать пуш,
                # прежде чем наш фоновый процесс закроется.
                time.sleep(2)
            except Exception as e:
                # Фолбэк на случай проблем с AppKit
                import subprocess
                subprocess.run(['osascript', '-e', f'display notification "{message}" with title "{title}"'])
        elif sys.platform == 'win32':
            ps_script = f"""
            Add-Type -AssemblyName System.Windows.Forms;
            $notify = New-Object System.Windows.Forms.NotifyIcon;
            $notify.Icon = [System.Drawing.SystemIcons]::Information;
            $notify.BalloonTipTitle = '{title}';
            $notify.BalloonTipText = '{message}';
            $notify.Visible = $True;
            $notify.ShowBalloonTip(10000);
            Start-Sleep -Seconds 10;
            """
            os.system(f'powershell -WindowStyle Hidden -Command "{ps_script}"')
    except Exception as e:
        pass
    os._exit(0) # Жестко убиваем фоновый процесс, чтобы он не грузил дальше FastAPI
# ==========================================

# ==========================================
# 🍎 МГНОВЕННЫЙ ФИКС ИКОНКИ ДЛЯ MACOS (SENIOR UI/UX HACK)
# ==========================================
# Определяем пути сразу, чтобы найти картинку до загрузки остальных модулей
if getattr(sys, 'frozen', False):
    bundle_dir = sys._MEIPASS
else:
    bundle_dir = os.path.dirname(os.path.abspath(__file__))

if sys.platform == 'darwin':
    try:
        import AppKit
        app = AppKit.NSApplication.sharedApplication()
        
        # NSApplicationActivationPolicyRegular = 0
        # Это нужно и в разработке, и в билде, чтобы приложение появилось в Dock
        app.setActivationPolicy_(0)
        
        # 🚀 SENIOR FIX: Мы убрали вмешательство в NSUserDefaults для скроллбаров.
        # Ошибка была в том, что передача "WhenScrolling" наоборот ВКЛЮЧАЛА
        # маковский overlay-режим. Теперь всё безупречно рендерится через чистый CSS.
        
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

# ОПРЕДЕЛЯЕМ ПАПКУ С ЛОГАМИ
from pathlib import Path
if getattr(sys, 'frozen', False):
    base_dir = Path(sys.executable).parent
else:
    base_dir = Path(__file__).resolve().parent

log_file_path = str(base_dir / "Doe_Log.txt")

class LoggerWriter:
    def __init__(self, filename, original_stream, is_main=False):
        self.file = open(filename, 'a', encoding='utf-8')
        self.terminal = original_stream
        if is_main:
            self.file.write(f"\n{'='*50}\n")
            self.file.write(f"🚀 DOE APP Started: {datetime.now()}\n")
            self.file.write(f"{'='*50}\n")
            self.file.flush()

    def write(self, message):
        self.file.write(message)
        self.file.flush()
        if self.terminal:
            try:
                self.terminal.write(message)
                self.terminal.flush()
            except Exception:
                pass

    def flush(self):
        self.file.flush()
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
        return getattr(self.file, name)

if sys.platform == 'win32':
    sys.stdout = LoggerWriter(log_file_path, sys.__stdout__, is_main=True)
    sys.stderr = LoggerWriter(log_file_path, sys.__stderr__, is_main=False)
    
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
        """Порождает новое окно приложения и убивает старое диалоговое"""
        current_window = webview.active_window() or (webview.windows[0] if webview.windows else None)
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
        if current_window:
            current_window.destroy()

    def open_vault_window(self):
        """Порождает маленькое окно выбора хранилища и убивает основное"""
        current_window = webview.active_window() or (webview.windows[0] if webview.windows else None)
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
        if current_window:
            current_window.destroy()

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
    
    # ФИКС ИКОНКИ ДЛЯ WINDOWS
    if sys.platform == 'win32':
        import ctypes
        try:
            app_id = 'doe.aesthetic.kanban.app.1'
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(app_id)
            print("[System] AppUserModelID set successfully.")
        except Exception as e:
            print(f"[System] Failed to set AppUserModelID: {e}")

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
