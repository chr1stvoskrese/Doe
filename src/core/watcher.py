import asyncio
import time
from fastapi import WebSocket
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                pass

ws_manager = ConnectionManager()

class DBChangeHandler(FileSystemEventHandler):
    def __init__(self, loop):
        self.loop = loop
        self.last_trigger = 0

    def on_modified(self, event):
        # Нас интересует только изменение нашего файла базы данных
        if event.is_directory or not event.src_path.endswith('.db.doe'):
            return
        
        # Debounce (защита от множественных системных эвентов ОС при одном изменении)
        now = time.time()
        if now - self.last_trigger > 1.5:
            self.last_trigger = now
            if self.loop and self.loop.is_running():
                asyncio.run_coroutine_threadsafe(ws_manager.broadcast("db_updated"), self.loop)

class VaultObserver:
    def __init__(self):
        self.observer = None
        self.loop = None

    def start(self, vault_path: str):
        self.stop()
        try:
            self.loop = asyncio.get_running_loop()
        except RuntimeError:
            return

        self.observer = Observer()
        handler = DBChangeHandler(self.loop)
        # Слушаем папку текущего хранилища без рекурсии
        self.observer.schedule(handler, vault_path, recursive=False)
        self.observer.start()
        print(f"[Sync] Watcher activated for vault: {vault_path}")

    def stop(self):
        if self.observer:
            self.observer.stop()
            self.observer.join()
            self.observer = None

vault_observer = VaultObserver()
