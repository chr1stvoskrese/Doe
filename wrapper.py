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
            # ... (твой код иконки остается без изменений) ...

            try:
                # Глубокая интеграция цвета заголовка в Windows 10/11
                # Убираем "белую полосу" путем покраски TitleBar в цвет фона приложения
                hwnd = ctypes.windll.user32.FindWindowW(None, "Doe")
                if hwnd:
                    hex_color = bg_color.lstrip('#')
                    # Конвертируем HEX в COLORREF (BGR)
                    r, g, b = tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
                    colorref = (b << 16) | (g << 8) | r
                    
                    # DWMWA_CAPTION_COLOR = 35 (Windows 11)
                    ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, 35, ctypes.byref(ctypes.c_int(colorref)), 4)
                    # DWMWA_TEXT_COLOR = 36 (цвет текста заголовка — делаем его таким же, чтобы скрыть)
                    ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, 36, ctypes.byref(ctypes.c_int(colorref)), 4)
            except Exception as e:
                print(f"[WebView] Windows Color Sync failed: {e}")

            # ... (твой transparency hack остается) ...

        elif sys.platform == 'darwin':
            try:
                import AppKit
                import objc
                ns_window = window.native
                
                # 1. Скрываем стандартный заголовок и расширяем вью на все окно
                # NSWindowStyleMaskFullSizeContentView = 1 << 15
                # NSWindowStyleMaskTitled = 1 << 0
                # ... и остальные стандартные маски
                mask = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3) | (1 << 15)
                ns_window.setStyleMask_(mask)

                # 2. Делаем заголовок прозрачным и скрываем текст
                ns_window.setTitlebarAppearsTransparent_(True)
                ns_window.setTitleVisibility_(1) # NSWindowTitleHidden

                # 3. Убираем ту самую линию-разделитель (Hairline)
                if hasattr(ns_window, 'setTitlebarSeparatorStyle_'):
                    ns_window.setTitlebarSeparatorStyle_(0) # NSTitlebarSeparatorStyleNone

                # 4. ФИКС ПОЛОСКИ: Убираем Toolbar, если он вдруг создался
                ns_window.setToolbar_(None)

                # 5. СИНХРОНИЗАЦИЯ ЦВЕТОВ (чтобы не было моргания)
                hex_color = bg_color.lstrip('#')
                r, g, b = tuple(int(hex_color[i:i+2], 16) / 255.0 for i in (0, 2, 4))
                native_bg_color = AppKit.NSColor.colorWithCalibratedRed_green_blue_alpha_(r, g, b, 1.0)
                
                ns_window.setBackgroundColor_(native_bg_color)
                ns_window.setHasShadow_(True)

                # 6. ХАК ДЛЯ WKWEBVIEW: Заставляем его игнорировать безопасные зоны
                # Достаем WKWebView из недр NSWindow
                # Обычно иерархия: NSWindow -> NSThemeFrame -> NSView -> WKWebView
                def fix_webview_frame(view):
                    for subview in view.subviews():
                        if "WKWebView" in str(type(subview)):
                            # Растягиваем WebView на весь размер окна, игнорируя Titlebar
                            subview.setFrame_(ns_window.contentView().bounds())
                            subview.setAutoresizingMask_(18) # 2 | 16 (Width + Height)
                        fix_webview_frame(subview)
                
                fix_webview_frame(ns_window.contentView())

                # 7. Делаем окно перетаскиваемым за любую точку (как Obsidian)
                ns_window.setMovableByWindowBackground_(True)

                window.show()
                print(f"[WebView] macOS Deep Aesthetic Fix Applied.")
            except Exception as e:
                print(f"[WebView] macOS Aesthetic Fix failed: {e}")
                window.show()

        elif sys.platform == 'win32':
            # Для Windows — убираем стандартную рамку через DWM
            import ctypes
            hwnd = ctypes.windll.user32.FindWindowW(None, "Doe")
            if hwnd:
                # Убираем системное меню и полоску заголовка, оставляя функционал окна
                style = ctypes.windll.user32.GetWindowLongW(hwnd, -16) # GWL_STYLE
                # WS_CAPTION = 0x00C00000
                ctypes.windll.user32.SetWindowLongW(hwnd, -16, style & ~0x00C00000)
                
                # Принудительно красим фон под WebView
                hex_color = bg_color.lstrip('#')
                r, g, b = tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
                colorref = (b << 16) | (g << 8) | r
                ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, 35, ctypes.byref(ctypes.c_int(colorref)), 4)
            window.show()

    def choose_directory(self):
        """Вызывает нативный диалог выбора папки (macOS/Windows)"""
        if not webview.windows:
            return None
            
        window = webview.windows[0]
        # Вызываем нативный диалог (он автоматически привяжется к нашему окну)
        result = window.create_file_dialog(
            dialog_type=webview.FOLDER_DIALOG,
            allow_multiple=False
        )
        
        # result - это кортеж выбранных путей или None, если нажали "Отмена"
        if result and len(result) > 0:
            return result[0]
        return None

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
            title='', # Пустой заголовок
            url=URL,
            width=1200,
            height=800,
            min_size=(800, 500),
            background_color=bg_color, # Это важно для устранения полоски при ресайзе
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
