"""Doe — точка входа десктоп-приложения (PyInstaller entry point).

- Режим `--worker`: тихий фоновый воркер напоминаний (без UI).
- Иначе: ранняя инициализация платформы, логирование и запуск GUI
  (вся логика — в пакете `launcher/`).

Модуль также доступен как `sys.modules['wrapper']`: через него
бэкенд (`src/api/v1/system/vault.py`) находит `WindowAPI` и
`runtime_index_url`. Реэкспорты ниже обязательны.
"""
import sys

if sys.platform.startswith('linux'):
    import os
    os.environ['WEBKIT_DISABLE_COMPOSITING_MODE'] = '1'

# DPI FIX (Windows, 4K/мульти-мониторы): объявляем Per-Monitor V2 awareness
# ДО создания первого окна. Без этого при запуске `python wrapper.py` Windows
# виртуализирует координаты со скейлингом, и сохранённая геометрия означает
# разные физические размеры в разных запусках ("ерунда с размерами").
if sys.platform == 'win32':
    import ctypes
    try:
        # Per-Monitor V2 (Windows 10 1703+): у каждого монитора свой DPI
        ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
    except Exception:
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(2)  # Per-Monitor (8.1+)
        except Exception:
            try:
                ctypes.windll.user32.SetProcessDPIAware()  # System-aware (легаси)
            except Exception:
                pass

# =========================================================================
# 1. ФОНОВЫЙ РЕЖИМ (WORKER) - Срабатывает мгновенно, без загрузки UI.
# Вся логика — в src/core/notifications.py (общая с notify_worker.py).
# =========================================================================
if len(sys.argv) >= 8 and sys.argv[1] == "--worker":
    if sys.platform == 'darwin':
        try:
            import AppKit
            _wapp = AppKit.NSApplication.sharedApplication()
            _wapp.setActivationPolicy_(AppKit.NSApplicationActivationPolicyProhibited)
            _wapp.setActivationPolicy_(AppKit.NSApplicationActivationPolicyAccessory)
        except Exception:
            pass

    from src.core.notifications import run_notification
    run_notification(
        due_time_iso=sys.argv[2],
        title=sys.argv[3],
        message=sys.argv[4],
        task_id=sys.argv[5],
        reminder_id=sys.argv[7],
        vault_path=sys.argv[6],
    )

# =========================================================================
# 2. ОСНОВНОЕ ПРИЛОЖЕНИЕ (GUI)
# =========================================================================

# ПРОГРЕВ ТЯЖЕЛЫХ С-БИБЛИОТЕК В ГЛАВНОМ ПОТОКЕ (Защита от крашей PyInstaller)
try:
    import numpy
except ImportError:
    pass

if sys.platform == 'darwin':
    from launcher import macos
    macos.init_macos_early()

from launcher.logging_setup import install_logging
install_logging()

# Реэкспорты для sys.modules['wrapper'] (см. src/api/v1/system/vault.py).
from launcher import MAIN_WINDOW_TITLE
from launcher.api import WindowAPI
from launcher.bridge import DATA_LOOP, runtime_index_url, push_db_updated

if __name__ == '__main__':
    from launcher.main import main
    main()
