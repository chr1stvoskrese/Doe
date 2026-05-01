import sys
import os
import traceback
import time
from datetime import datetime

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


if sys.platform == 'darwin':
    multiprocessing.set_start_method('fork')

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
                    
                    user32.SetLayeredWindowAttributes(hwnd, 0, 0, LWA_ALPHA)
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
    
    # Делаем переменную глобальной до старта, чтобы перехватчик мог до неё дотянуться
    server_thread = None

    # ==========================================
    # 🔥 ФИКС: ОБРАБОТКА CTRL+C В ТЕРМИНАЛЕ
    # ==========================================
    import signal
    import threading
    
    def force_quit():
        print("\n[System] 🛑 Завершение работы по CTRL+C...")
        
        # 1. Сначала мягко уничтожаем окно WebView (чтобы предотвратить Error 1411 в Chromium)
        if webview.windows:
            try:
                webview.windows[0].destroy()
            except Exception:
                pass

        # 2. Останавливаем сервер FastAPI
        global server_thread
        if server_thread is not None:
            try:
                server_thread.stop()
                server_thread.join(timeout=0.5)
            except Exception:
                pass
                
        # 3. Даем ОС 0.2 секунды на очистку хэндлов C++ перед жестким выходом
        time.sleep(0.2)
        os._exit(0)

    # 1. Перехват для macOS / Linux
    def sigint_handler(signum, frame):
        if webview.windows:
            try:
                webview.windows[0].destroy()
            except Exception:
                pass
        threading.Timer(0.5, force_quit).start()

    signal.signal(signal.SIGINT, sigint_handler)
    signal.signal(signal.SIGTERM, sigint_handler)

    # 2. Перехват для Windows (пробиваем зависание через WinAPI)
    if sys.platform == 'win32':
        import ctypes
        from ctypes import wintypes
        
        HandlerRoutine = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.DWORD)
        
        def console_ctrl_handler(ctrl_type):
            # 0 = CTRL_C_EVENT, 2 = CTRL_CLOSE_EVENT
            if ctrl_type in (0, 2):
                force_quit()
            return True
            
        _ctrl_handler = HandlerRoutine(console_ctrl_handler)
        ctypes.windll.kernel32.SetConsoleCtrlHandler(_ctrl_handler, True)
    # ==========================================

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
