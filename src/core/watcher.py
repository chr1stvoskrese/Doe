import asyncio
import os
import time
from pathlib import Path

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from src.core import fs_store


# 🔒 Без сетевого сервера: раньше об изменениях БД фронт узнавал по WebSocket
# (/system/ws). Теперь Python пушит событие напрямую в окно через evaluate_js.
# Хук регистрирует wrapper.py (push_db_updated). Здесь — только точка входа.
_push_hook = None


def set_push_hook(fn):
    """Регистрирует колбэк, который доставляет событие `db_updated` во фронт
    (в wrapper.py — evaluate_js('window.__doeOnDbUpdated && ...'))."""
    global _push_hook
    _push_hook = fn


def notify_db_updated():
    """Сообщает фронту, что БД изменилась извне (замена WebSocket-broadcast)."""
    hook = _push_hook
    if hook is None:
        return
    try:
        hook()
    except Exception:
        pass


class BoardChangeHandler(FileSystemEventHandler):
    """
    Следит за хранилищем (рекурсивно):
      - изменения .md / .doe.json / папок (правки из Obsidian, iCloud Sync)
        → reconcile файлового хранилища → уведомление фронтенда;
      - изменения файла индекса .db.doe (iCloud) → уведомление фронтенда
        (прежнее поведение).
    Собственные записи приложения подавляются через fs_store.is_self_event.
    """

    RESYNC_QUIET_PERIOD = 1.2  # секунд тишины после последнего события

    def __init__(self, loop, vault_path: str):
        self.loop = loop
        self.vault = Path(vault_path)
        self.last_db_trigger = 0.0
        self._resync_handle = None
        self._resync_running = False
        self._resync_requested = False

    # --- Классификация событий -----------------------------------------
    def on_any_event(self, event):
        try:
            paths = [event.src_path]
            dest = getattr(event, "dest_path", None)
            if dest:
                paths.append(dest)
            for raw in paths:
                if not raw:
                    continue
                name = os.path.basename(raw)
                if not event.is_directory and name.endswith(".db.doe"):
                    self._db_touched()
                    continue
                if self._is_board_path(raw, name, event.is_directory):
                    if fs_store.is_self_event(raw):
                        continue
                    self._schedule_resync()
        except Exception:
            pass

    def _is_board_path(self, raw: str, name: str, is_dir: bool) -> bool:
        if name.startswith("._"):
            return False
        if name.endswith((".doelock", ".doetmp", ".tmp", ".icloud")):
            return False
        try:
            rel = Path(raw).relative_to(self.vault)
        except ValueError:
            return False
        parts = rel.parts
        if not parts:
            return False
        # Корневые исключения: вложения (doe/), скрытые и служебные папки
        if parts[0] == "doe" or parts[0].startswith(".") or parts[0].startswith("_"):
            return False
        # Скрытые папки глубже (например, .trash Obsidian)
        for part in parts[:-1]:
            if part.startswith("."):
                return False
        if is_dir:
            return True
        if name == fs_store.FOLDER_META_NAME:
            return True
        return name.lower().endswith(".md")

    # --- Изменение файла индекса (iCloud) --------------------------------
    def _db_touched(self):
        now = time.time()
        if now - self.last_db_trigger > 1.5:
            self.last_db_trigger = now
            if self.loop and self.loop.is_running():
                self.loop.call_soon_threadsafe(notify_db_updated)

    # --- Отложенная пересинхронизация (debounce) --------------------------
    def _schedule_resync(self):
        if self.loop and self.loop.is_running():
            self.loop.call_soon_threadsafe(self._arm_timer)

    def _arm_timer(self):
        if self._resync_handle is not None:
            self._resync_handle.cancel()
        self._resync_handle = self.loop.call_later(
            self.RESYNC_QUIET_PERIOD,
            lambda: asyncio.ensure_future(self._resync()),
        )

    async def _resync(self):
        if self._resync_running:
            # Уже идёт — попросим повторить после завершения
            self._resync_requested = True
            return
        self._resync_running = True
        try:
            while True:
                self._resync_requested = False
                try:
                    changed = await fs_store.resync()
                    if changed:
                        notify_db_updated()
                        print("[Sync] External changes imported from vault files")
                except Exception as e:
                    print(f"[Sync] External resync failed: {e}")
                if not self._resync_requested:
                    break
        finally:
            self._resync_running = False


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
        handler = BoardChangeHandler(self.loop, vault_path)
        # Рекурсивно: правки .md в подпапках (Obsidian) тоже должны подхватываться
        self.observer.schedule(handler, vault_path, recursive=True)
        self.observer.start()
        print(f"[Sync] Watcher activated for vault: {vault_path}")

    def stop(self):
        if self.observer:
            self.observer.stop()
            self.observer.join()
            self.observer = None

vault_observer = VaultObserver()
