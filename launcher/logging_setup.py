"""Перехват stdout/stderr в файл лога + глобальный обработчик исключений."""
import sys
import traceback
import time
from datetime import datetime
import os
from pathlib import Path
import json

# Единый дескриптор лога на оба потока (stdout/stderr)
_global_log_file = None
_global_log_path = None


def install_logging():
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
                        return vp / f"{vp.name}.log.doe.txt"
        except Exception:
            pass
        return Path.home() / ".log.doe.txt"

    def _ensure_log_file():
        global _global_log_file, _global_log_path
        new_path = get_dynamic_log_path()
    
        # Если путь изменился ИЛИ файл почему-то потерялся (None) — открываем заново
        if new_path != _global_log_path or _global_log_file is None:
            if _global_log_file:
                try:
                    _global_log_file.write(f"\n[System] 🔄 Redirecting logs to new vault: {new_path}\n")
                    _global_log_file.flush()
                    _global_log_file.close()
                except Exception:
                    pass
        
            _global_log_path = new_path
            try:
                # buffering=1 гарантирует, что каждая новая строка (\n) сразу прописывается на диск
                _global_log_file = open(_global_log_path, 'a', encoding='utf-8', buffering=1)
                _global_log_file.write(f"\n{'='*50}\n🚀 DOE APP Session Started: {datetime.now()}\n📁 Log Location: {_global_log_path}\n{'='*50}\n")
            except Exception:
                _global_log_file = None

    class LoggerWriter:
        def __init__(self, original_stream):
            self.terminal = original_stream
            self.last_check_time = 0
            _ensure_log_file()

        def write(self, message):
            now = time.time()
            # Проверяем, не сменилась ли папка, но не чаще раза в 2 секунды (экономим ресурсы)
            if now - self.last_check_time > 2.0:
                _ensure_log_file()
                self.last_check_time = now
            
            global _global_log_file
            if _global_log_file:
                try:
                    _global_log_file.write(message)
                    # Принудительный flush каждой посылки гарантирует, 
                    # что мы увидим ошибку даже при мгновенном краше приложения.
                    _global_log_file.flush()
                except Exception:
                    pass
        
            if self.terminal:
                try:
                    self.terminal.write(message)
                    self.terminal.flush()
                except Exception:
                    pass

        def flush(self):
            global _global_log_file
            if _global_log_file:
                try:
                    _global_log_file.flush()
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
            raise AttributeError(f"LoggerWriter has no attribute '{name}'")

    # Глобальный перехват вывода для ВСЕХ ОС (включая macOS)
    sys.stdout = LoggerWriter(sys.__stdout__)
    sys.stderr = LoggerWriter(sys.__stderr__)

    import atexit
    atexit.register(lambda: (sys.stdout.flush(), sys.stderr.flush()))

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

