import multiprocessing
import threading
import time
import urllib.request
import webview
import uvicorn
import sys

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

def run_server():
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")

if __name__ == '__main__':
    multiprocessing.freeze_support()

    settings = get_ui_settings()
    theme = settings.get("theme", "light")
    bg_color = '#161815' if theme == 'dark' else '#F4F3EF'

    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    timeout = 5.0
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{PORT}/")
            break
        except Exception:
            time.sleep(0.05)

    # 🚀 СОЗДАЕМ ОКНО НЕВИДИМЫМ (hidden=True) И ПРОКИДЫВАЕМ API
    webview.create_window(
        title='Doe',
        url=URL,
        width=1200,
        height=800,
        min_size=(800, 500),
        background_color=bg_color,
        text_select=False,
        hidden=True,            # Окно скрыто при старте!
        js_api=WindowAPI()      # Прокидываем Python-класс в Javascript
    )
    
    webview.start(gui='cocoa', debug=False)
