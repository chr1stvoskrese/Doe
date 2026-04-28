import multiprocessing
import threading
import time
import urllib.request
import webview
import uvicorn
import sys
import os

# Фикс для корректной работы multiprocessing в скомпилированном .app
if sys.platform == 'darwin':
    multiprocessing.set_start_method('fork')

from main import app
from src.core.config import get_ui_settings

PORT = 8000
URL = f"http://127.0.0.1:{PORT}/app"

# 🚀 СОЗДАЕМ МОСТ МЕЖДУ JS И PYTHON
class WindowAPI:
    def reveal_window(self):
        # Как только JS скажет "я готов", мы показываем окно
        if webview.windows:
            webview.windows[0].show()

# Создаем класс-обертку для Uvicorn
class APIServerThread(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        config = uvicorn.Config(app, host="127.0.0.1", port=PORT, log_level="warning")
        self.server = uvicorn.Server(config)

    def run(self):
        self.server.run()

    def stop(self):
        self.server.should_exit = True

if __name__ == '__main__':
    multiprocessing.freeze_support()

    settings = get_ui_settings()
    theme = settings.get("theme", "light")
    bg_color = '#161815' if theme == 'dark' else '#F4F3EF'

    # Запускаем наш контролируемый сервер
    server_thread = APIServerThread()
    server_thread.start()

    timeout = 5.0
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{PORT}/")
            break
        except Exception:
            time.sleep(0.05)

    # 🚀 СОЗДАЕМ ОКНО НЕВИДИМЫМ
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
    
    # Запускаем GUI. Код заблокируется на этой строке, пока окно открыто.
    # Мы убрали gui='cocoa', чтобы pywebview сам выбрал лучший движок (Edge на Win, Cocoa на Mac)
    webview.start(debug=False)
    
    # === СЮДА ПРОГРАММА ДОЙДЕТ ТОЛЬКО ПОСЛЕ ЗАКРЫТИЯ ОКНА НА КРЕСТИК ===
    print("🛑 Окно закрыто. Завершаем работу сервера...")
    
    # Мягко просим FastAPI и базу данных завершить работу
    server_thread.stop()
    server_thread.join(timeout=1.0)
    
    # Теперь, когда окно чисто удалено из памяти ОС, жестко гасим фоновые процессы Python
    os._exit(0)
