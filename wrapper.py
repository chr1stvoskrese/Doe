import sys
import os

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

# ОПРЕДЕЛЯЕМ ПАПКУ С ЛОГАМИ (base_dir нужен только тут)
if getattr(sys, 'frozen', False):
    base_dir = os.path.dirname(sys.executable)
else:
    base_dir = os.path.dirname(os.path.abspath(__file__))

log_file_path = os.path.join(base_dir, "Doe_Log.txt")

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

print("[System] Loading FastAPI core...")
from main import app
from src.core.config import get_ui_settings

PORT = 8000
URL = f"http://127.0.0.1:{PORT}/app"

print("[Settings] Reading configuration...")
settings = get_ui_settings()
theme = settings.get("theme", "light")
bg_color = '#161815' if theme == 'dark' else '#F4F3EF'

class WindowAPI:
    def reveal_window(self):
        print("[WebView] Signal received from JS: Interface is ready, showing window.")
        if not webview.windows:
            return
        
        window = webview.windows[0]
        
        if sys.platform == 'win32':
            import ctypes
            import winreg
            
            hwnd = ctypes.windll.user32.FindWindowW(None, "Doe")
            
            if hwnd:
                try:
                    icon_path = os.path.join(bundle_dir, "favicon.ico")
                    if os.path.exists(icon_path):
                        IMAGE_ICON = 1
                        LR_LOADFROMFILE = 0x00000010
                        WM_SETICON = 0x0080
                        hicon = ctypes.windll.user32.LoadImageW(0, icon_path, IMAGE_ICON, 0, 0, LR_LOADFROMFILE)
                        if hicon:
                            ctypes.windll.user32.SendMessageW(hwnd, WM_SETICON, 0, hicon)
                            ctypes.windll.user32.SendMessageW(hwnd, WM_SETICON, 1, hicon)
                            print("[WebView] Custom icon applied via WinAPI.")
                except Exception as e:
                    print(f"[WebView] Error applying window icon: {e}")

                try:
                    registry = winreg.ConnectRegistry(None, winreg.HKEY_CURRENT_USER)
                    key = winreg.OpenKey(registry, r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize")
                    val_theme, _ = winreg.QueryValueEx(key, "AppsUseLightTheme")
                    
                    if val_theme == 0:
                        val = ctypes.c_int(1)
                        ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, 20, ctypes.byref(val), ctypes.sizeof(val))
                        ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, 19, ctypes.byref(val), ctypes.sizeof(val))
                except Exception as e:
                    print(f"[WebView] Error applying Windows dark title bar theme: {e}")
                    
                try:
                    user32 = ctypes.windll.user32
                    GWL_EXSTYLE = -20
                    WS_EX_LAYERED = 0x00080000
                    LWA_ALPHA = 2
                    
                    if ctypes.sizeof(ctypes.c_void_p) == 8:
                        GetWindowLong = user32.GetWindowLongPtrW
                        SetWindowLong = user32.SetWindowLongPtrW
                    else:
                        GetWindowLong = user32.GetWindowLongW
                        SetWindowLong = user32.SetWindowLongW

                    style = GetWindowLong(hwnd, GWL_EXSTYLE)
                    SetWindowLong(hwnd, GWL_EXSTYLE, style | WS_EX_LAYERED)
                    
                    window.show()
                    time.sleep(0.2)
                    user32.SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA)
                    SetWindowLong(hwnd, GWL_EXSTYLE, style)
                    print("[WebView] Window successfully shown (transparency hack applied).")
                except Exception as e:
                    print(f"[WebView] Transparency hack error: {e}")
                    try:
                        window.show()
                    except:
                        pass
            else:
                try:
                    window.show()
                except:
                    pass

        elif sys.platform == 'darwin':
            try:
                window.show()
                print("[WebView] Window successfully shown (macOS).")
            except Exception as e:
                print(f"[WebView] macOS show error: {e}")

        else:
            try:
                window.show()
            except:
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
        webview.create_window(
            title='Doe',
            url=URL,
            width=1200,
            height=800,
            min_size=(800, 500),
            background_color=bg_color,
            text_select=False,
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
                server_thread.join(timeout=1.0)
            print("[System] Server stopped. Exiting.")
            os._exit(0)
            
    except Exception as e:
        print("[Main] FATAL ERROR IN MAIN BLOCK:")
        traceback.print_exc()
        sys.exit(1)
