"""Платформенные хелперы: haptic, геометрия окон, DPI, ресайз."""
import sys

import webview

from launcher.vault_exit import _lock_vault_before_exit


_mac_actuator = None
_mt_lib = None

def _trigger_macos_hardware_haptic():
    """Прямое обращение к физическому актуатору трекпада macOS через приватный фреймворк"""
    global _mac_actuator, _mt_lib
    import ctypes
    import os
    
    try:
        framework_path = '/System/Library/PrivateFrameworks/MultitouchSupport.framework/MultitouchSupport'
        if not os.path.exists(framework_path):
            return False
            
        if _mt_lib is None:
            # Загружаем системную библиотеку поддержки мультитача и Taptic Engine
            _mt_lib = ctypes.CDLL(framework_path)
            _mt_lib.MTDeviceCreateDefault.restype = ctypes.c_void_p
            _mt_lib.MTActuatorCreateFromDevice.argtypes = [ctypes.c_void_p]
            _mt_lib.MTActuatorCreateFromDevice.restype = ctypes.c_void_p
            _mt_lib.MTActuatorPlayTap.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int]
            _mt_lib.MTActuatorPlayTap.restype = ctypes.c_int

        if _mac_actuator is None:
            # Получаем указатель на встроенное устройство ввода
            device = _mt_lib.MTDeviceCreateDefault()
            if device:
                # Создаем интерфейс управления актуатором
                _mac_actuator = _mt_lib.MTActuatorCreateFromDevice(device)

        if _mac_actuator:
            # Параметры: actuator, pattern, intensity
            # pattern=1 (Alignment/Snap - четкий щелчок стыковки)
            # intensity=3 (сочная средняя физическая отдача)
            _mt_lib.MTActuatorPlayTap(_mac_actuator, 1, 3)
            return True
    except Exception as e:
        print(f"[Haptic] macOS Hardware Taptic Engine trigger failed: {e}")
    return False



MAIN_WINDOW_TITLE = 'Doe (demo)'

def _dump_geometry_diagnostics():
    """Однократный дамп DPI-состояния и карты мониторов в лог (Windows)."""
    if sys.platform != 'win32':
        return
    try:
        import ctypes
        from ctypes import wintypes
        user32 = ctypes.windll.user32
        aware = bool(user32.IsProcessDPIAware())

        monitors = []

        class MONITORINFO(ctypes.Structure):
            _fields_ = [("cbSize", wintypes.DWORD), ("rcMonitor", wintypes.RECT),
                        ("rcWork", wintypes.RECT), ("dwFlags", wintypes.DWORD)]

        # Правильные типы для callback (BOOL, HMONITOR, HDC, LPRECT, LPARAM)
        MonitorEnumProc = ctypes.WINFUNCTYPE(
            wintypes.BOOL, ctypes.c_void_p, ctypes.c_void_p,
            ctypes.POINTER(wintypes.RECT), wintypes.LPARAM)

        # Явно указываем типы аргументов, чтобы избежать OverflowError на 64-битных системах
        user32.GetMonitorInfoW.argtypes = [ctypes.c_void_p, ctypes.POINTER(MONITORINFO)]

        def _cb(hmon, hdc, lprc, lparam):
            mi = MONITORINFO()
            mi.cbSize = ctypes.sizeof(MONITORINFO)
            
            # Явный каст hmon в c_void_p защищает от сбоев
            hmon_ptr = ctypes.c_void_p(hmon)
            
            if user32.GetMonitorInfoW(hmon_ptr, ctypes.byref(mi)):
                dpi_x = wintypes.UINT()
                dpi_y = wintypes.UINT()
                scale = None
                try:
                    ctypes.windll.shcore.GetDpiForMonitor.argtypes = [
                        ctypes.c_void_p, ctypes.c_uint, 
                        ctypes.POINTER(wintypes.UINT), ctypes.POINTER(wintypes.UINT)
                    ]
                    ctypes.windll.shcore.GetDpiForMonitor(
                        hmon_ptr, 0, ctypes.byref(dpi_x), ctypes.byref(dpi_y))
                    scale = round(dpi_x.value / 96.0, 2)
                except Exception:
                    pass
                r = mi.rcMonitor
                w_area = mi.rcWork
                monitors.append(
                    f"({r.left},{r.top})-({r.right},{r.bottom}) "
                    f"work={w_area.right - w_area.left}x{w_area.bottom - w_area.top} "
                    f"scale={scale}")
            return 1

        user32.EnumDisplayMonitors(None, None, MonitorEnumProc(_cb), 0)
        print(f"[Geometry] engine v3 | DPI-aware process: {aware}")
        for i, m in enumerate(monitors, 1):
            print(f"[Geometry] monitor {i}: {m}")
    except Exception as e:
        print(f"[Geometry] diagnostics failed: {e}")


def _win32_monitor_dpi_scale(x, y, w, h):
    """DPI-масштаб монитора, на котором окажется центр окна (1.0 = 100%)."""
    try:
        import ctypes
        from ctypes import wintypes
        class POINT(ctypes.Structure):
            _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]
        pt = POINT(int(x + w // 2), int(y + h // 2))
        hmon = ctypes.windll.user32.MonitorFromPoint(pt, 2)  # MONITOR_DEFAULTTONEAREST
        dpi_x = ctypes.c_uint(96)
        dpi_y = ctypes.c_uint(96)
        # MDT_EFFECTIVE_DPI = 0
        ctypes.windll.shcore.GetDpiForMonitor.argtypes = [
            ctypes.c_void_p, ctypes.c_uint, 
            ctypes.POINTER(ctypes.c_uint), ctypes.POINTER(ctypes.c_uint)
        ]
        if ctypes.windll.shcore.GetDpiForMonitor(ctypes.c_void_p(hmon), 0, ctypes.byref(dpi_x), ctypes.byref(dpi_y)) == 0:
            return max(0.5, dpi_x.value / 96.0)
    except Exception:
        pass
    return 1.0

def _win32_hwnd_for(win):
    """HWND конкретного окна pywebview: сначала точно по uid через внутренности
    winforms-бэкенда (надёжно при пересоздании окон с одинаковым заголовком),
    затем фолбэк по заголовку."""
    try:
        from webview.platforms.winforms import BrowserView
        bv = BrowserView.instances.get(win.uid)
        if bv is not None:
            return int(bv.Handle.ToInt64())
    except Exception:
        pass
    try:
        import ctypes
        hwnd = ctypes.windll.user32.FindWindowW(None, MAIN_WINDOW_TITLE)
        return hwnd or None
    except Exception:
        return None

def _win32_get_rect(hwnd):
    import ctypes
    from ctypes import wintypes
    rect = wintypes.RECT()
    if not ctypes.windll.user32.GetWindowRect(hwnd, ctypes.byref(rect)):
        return None
    return (rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top)

def _win32_workarea_for_hwnd(hwnd):
    import ctypes
    from ctypes import wintypes
    class MONITORINFO(ctypes.Structure):
        _fields_ = [("cbSize", wintypes.DWORD), ("rcMonitor", wintypes.RECT),
                    ("rcWork", wintypes.RECT), ("dwFlags", wintypes.DWORD)]
    user32 = ctypes.windll.user32
    user32.GetMonitorInfoW.argtypes = [ctypes.c_void_p, ctypes.POINTER(MONITORINFO)]
    hmon = user32.MonitorFromWindow(hwnd, 2)
    mi = MONITORINFO()
    mi.cbSize = ctypes.sizeof(MONITORINFO)
    if not user32.GetMonitorInfoW(ctypes.c_void_p(hmon), ctypes.byref(mi)):
        return None
    w = mi.rcWork
    return (w.left, w.top, w.right - w.left, w.bottom - w.top)

def bind_geometry_enforcement(win, target_rect):
    """pywebview/WinForms (AutoScaleMode.Dpi) умножает размер окна на DPI-масштаб
    при создании — на 4K со 150% окно «распухает» с каждым циклом запуска.
    После показа окна принудительно выставляем ТОЧНЫЙ физический прямоугольник
    через SetWindowPos — тот же API, которым пользуется toggle_maximize_window."""
    if sys.platform != 'win32' or not target_rect:
        return
    x, y, w, h = (int(v) for v in target_rect)

    # Одноразовость: enforcement нужен только против DPI-«распухания» при
    # СОЗДАНИИ окна. Событие 'loaded' стреляет и при смене хранилища
    # (load_url) — без этого флага окно возвращалось бы к геометрии
    # предыдущего хранилища.
    _state = {'done': False}

    def _matches(cur):
        return cur and all(abs(a - b) <= 2 for a, b in zip(cur, (x, y, w, h)))

    def _enforce(*args):
        import threading
        if _state['done']:
            return
        _state['done'] = True
        def _loop(attempt=0):
            try:
                import ctypes
                # 🪟 НЕ ВОЮЕМ С ПОЛЬЗОВАТЕЛЕМ: если зажата левая кнопка мыши,
                # вероятно идёт перетаскивание или ресайз окна. SetWindowPos в
                # этот момент "дёргает" окно по экрану. Пропускаем попытку.
                if ctypes.windll.user32.GetAsyncKeyState(0x01) & 0x8000:
                    if attempt < 14:
                        threading.Timer(0.2, _loop, args=(attempt + 1,)).start()
                    return
                hwnd = _win32_hwnd_for(win)
                if hwnd:
                    cur = _win32_get_rect(hwnd)
                    if _matches(cur):
                        if attempt > 0:
                            print(f"[Geometry] enforced OK after {attempt} attempts: {cur}")
                        return
                    SWP_NOZORDER = 0x0004
                    SWP_NOACTIVATE = 0x0010
                    ctypes.windll.user32.SetWindowPos(
                        hwnd, 0, x, y, w, h, SWP_NOZORDER | SWP_NOACTIVATE)
                    after = _win32_get_rect(hwnd)
                    if attempt == 0:
                        print(f"[Geometry] target={(x, y, w, h)} was={cur} now={after}")
                    if _matches(after):
                        return
            except Exception as e:
                print(f"[Geometry] enforce error: {e}")
            # WinForms/WebView2 могут перетирать размер на поздних стадиях
            # инициализации — повторяем, пока не победим (до ~3 секунд)
            if attempt < 14:
                threading.Timer(0.2, _loop, args=(attempt + 1,)).start()
            else:
                print("[Geometry] enforce gave up after 14 attempts")
        _loop()

    for ev_name in ('shown', 'loaded'):
        try:
            ev = getattr(win.events, ev_name)
            ev += _enforce
        except Exception:
            pass



def get_safe_geometry():
    """Возвращает (width, height, x, y) с валидацией под текущие мониторы (Windows).
    Гарантирует: окно не шире/выше рабочей области своего монитора и целиком
    внутри неё. Если сохранённой позиции нет или монитор отключили —
    центрирует на подходящем мониторе. На macOS позицию не трогаем (x=y=None)."""
    try:
        from src.core.config import get_vault_geometry_full, get_active_vault
        g = get_vault_geometry_full(get_active_vault())
        w, h = int(g["width"]), int(g["height"])
        x, y = g.get("x"), g.get("y")
    except Exception:
        w, h, x, y = 1200, 800, None, None

    if sys.platform != 'win32':
        return w, h, None, None

    try:
        import ctypes
        from ctypes import wintypes

        class POINT(ctypes.Structure):
            _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]

        class MONITORINFO(ctypes.Structure):
            _fields_ = [
                ("cbSize", wintypes.DWORD),
                ("rcMonitor", wintypes.RECT),
                ("rcWork", wintypes.RECT),
                ("dwFlags", wintypes.DWORD),
            ]

        user32 = ctypes.windll.user32
        MONITOR_DEFAULTTOPRIMARY = 1
        MONITOR_DEFAULTTONEAREST = 2

        if x is not None and y is not None:
            pt = POINT(int(x + w // 2), int(y + h // 2))
            hmon = user32.MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST)
        else:
            hmon = user32.MonitorFromPoint(POINT(0, 0), MONITOR_DEFAULTTOPRIMARY)

        user32.GetMonitorInfoW.argtypes = [ctypes.c_void_p, ctypes.POINTER(MONITORINFO)]
        mi = MONITORINFO()
        mi.cbSize = ctypes.sizeof(MONITORINFO)
        if not user32.GetMonitorInfoW(ctypes.c_void_p(hmon), ctypes.byref(mi)):
            return w, h, None, None

        work_left = mi.rcWork.left
        work_top = mi.rcWork.top
        work_w = mi.rcWork.right - mi.rcWork.left
        work_h = mi.rcWork.bottom - mi.rcWork.top

        # САМОЛЕЧЕНИЕ: размер ~во всю рабочую область — артефакт старого бага
        # (сохранённый maximize): честный размер такого масштаба сейв-гард
        # в конфиг не пишет. Сбрасываем на дефолт, окно центрируем.
        if w >= work_w - 16 and h >= work_h - 16:
            print(f"[Geometry] stale fullscreen-size {w}x{h} in config -> reset to default")
            w = min(1440, max(800, work_w - 320))
            h = min(960, max(600, work_h - 240))
            x, y = None, None

        # Размер не больше рабочей области ОДНОГО монитора
        w = max(800, min(w, work_w))
        h = max(600, min(h, work_h))

        if x is None or y is None:
            x = work_left + (work_w - w) // 2
            y = work_top + (work_h - h) // 2
        else:
            # Окно целиком внутри рабочей области своего монитора
            x = max(work_left, min(int(x), work_left + work_w - w))
            y = max(work_top, min(int(y), work_top + work_h - h))

        return int(w), int(h), int(x), int(y)
    except Exception:
        return w, h, None, None


_resize_timer = None
def bind_resize_event(win):
    """Дебаунс-сохранение геометрии окна (размер + позиция) через 1с после остановки мыши.
    Развёрнутое (maximized) окно не сохраняется: иначе на 4K в конфиг попадает 3840x2160,
    и следующий запуск создаёт гигантское обычное окно, расползающееся на два монитора."""
    state = {"maximized": False}

    def _do_save():
        try:
            if state["maximized"]:
                return
            if sys.platform == 'win32':
                import ctypes
                hwnd = _win32_hwnd_for(win)
                if not hwnd:
                    return
                # Настоящий maximize (Win+Up и т.п.) не сохраняем
                if ctypes.windll.user32.IsZoomed(hwnd):
                    return
                rect = _win32_get_rect(hwnd)
                if not rect:
                    return
                x, y, w, h = rect
                # РУЧНОЙ maximize (toggle_maximize_window растягивает окно SetWindowPos'ом
                # до рабочей области — IsZoomed его не видит): окно, покрывающее
                # ~всю рабочую область своего монитора, не считаем "размером пользователя"
                work = _win32_workarea_for_hwnd(hwnd)
                if work and w >= work[2] - 8 and h >= work[3] - 8:
                    return
            else:
                w, h = win.width, win.height
                try:
                    x, y = win.x, win.y
                except Exception:
                    x, y = None, None
            # Защита: не сохраняем размеры маленького окна выбора хранилищ
            if w <= 760 and h <= 680:
                return
            from src.core.config import set_vault_geometry, get_active_vault
            vault = get_active_vault()
            if vault:
                set_vault_geometry(vault, w, h, x, y)
                print(f"[Geometry] saved {w}x{h} @ ({x},{y}) for vault: {vault}")
        except Exception:
            pass

    def _schedule(*args):
        global _resize_timer
        if _resize_timer:
            _resize_timer.cancel()
        import threading
        _resize_timer = threading.Timer(1.0, _do_save)
        _resize_timer.start()

    win.events.resized += _schedule
    try:
        win.events.moved += _schedule
    except Exception:
        pass
    try:
        win.events.maximized += (lambda *a: state.update(maximized=True))
        win.events.restored += (lambda *a: state.update(maximized=False))
    except Exception:
        pass
    try:
        def _on_closing():
            _do_save()
            if getattr(win, '_is_shutting_down', False):
                return True
            
            win._is_shutting_down = True
            try:
                win.evaluate_js('if(window.appExit) { window.appExit(); } else { window.pywebview.api.force_close(); }')
            except Exception:
                _lock_vault_before_exit() # 🔐 шифруем защищённое хранилище
                import os
                os._exit(0)
            return False

        win.events.closing += _on_closing
    except Exception:
        pass


