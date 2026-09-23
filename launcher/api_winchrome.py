"""Нативное управление окном (Windows move/resize/maximize, macOS drag/traffic/fullscreen/haptic)."""
import os
import subprocess
import sys
import threading
import time
import traceback

import webview

from launcher import MAIN_WINDOW_TITLE
from launcher.bridge import DATA_LOOP, bg_color, runtime_index_url
from launcher.platform import (
    _win32_hwnd_for,
    get_safe_geometry,
    bind_resize_event,
    bind_geometry_enforcement,
    _win32_monitor_dpi_scale,
    _trigger_macos_hardware_haptic,
)
from launcher.vault_exit import _lock_vault_before_exit


class _WinChromeMixin:
    def minimize_window(self):
        """Сворачивает окно в Dock (желтая кнопка)"""
        import sys
        if sys.platform == 'darwin':
            from PyObjCTools import AppHelper
            def _minimize():
                try:
                    import AppKit
                    app = AppKit.NSApplication.sharedApplication()
                    win = app.keyWindow() or app.mainWindow()
                    if win:
                        win.miniaturize_(None)
                except Exception as e:
                    print(f"[Minimize] Cocoa error: {e}")
            AppHelper.callAfter(_minimize)
        else:
            if webview.windows:
                webview.windows[-1].minimize()

    def _win_hwnd(self):
        """100% надёжное получение HWND текущего окна из внутренностей WinForms."""
        import sys
        if sys.platform != 'win32' or not webview.windows:
            return None
        win = webview.windows[-1]
        hwnd = None
        try:
            from webview.platforms.winforms import BrowserView
            bv = BrowserView.instances.get(win.uid)
            if bv is not None:
                hwnd = int(bv.Handle.ToInt64())
        except Exception:
            pass
        if not hwnd:
            hwnd = _win32_hwnd_for(win)
        # Страховка: поднимаемся до top-level окна (GA_ROOT = 2). Нативные
        # WM_NCLBUTTONDOWN (drag/resize/Aero Snap) работают только с ним.
        if hwnd:
            try:
                import ctypes
                root = ctypes.windll.user32.GetAncestor(hwnd, 2)
                if root:
                    hwnd = root
            except Exception:
                pass
        return hwnd

    def start_window_drag(self):
        """Бесшовное нативное перетаскивание заголовочной рамки."""
        import sys
        if sys.platform != 'win32':
            return False
        import ctypes
        
        hwnd = self._win_hwnd()
        if not hwnd:
            return False
            
        self._win_maximized = False
        
        # 1. КРИТИЧНО: Принудительно отбираем захват мыши у Chromium
        ctypes.windll.user32.ReleaseCapture()
        
        # 2. Получаем координаты курсора для ядра Windows
        class POINT(ctypes.Structure):
            _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]
        pt = POINT()
        ctypes.windll.user32.GetCursorPos(ctypes.byref(pt))
        lparam = ((pt.y & 0xFFFF) << 16) | (pt.x & 0xFFFF)
        
        # 3. Начинаем нативный Drag, вызывающий Aero Snap (HTCAPTION = 2)
        WM_NCLBUTTONDOWN = 0x00A1
        ctypes.windll.user32.PostMessageW(hwnd, WM_NCLBUTTONDOWN, 2, lparam)
        return True

    def start_window_resize(self, ht):
        """Плавный нативный ресайз за любые края окна."""
        import sys
        if sys.platform != 'win32':
            return False
        import ctypes
        
        hwnd = self._win_hwnd()
        if not hwnd:
            return False
            
        self._win_maximized = False
        
        # 1. КРИТИЧНО: Принудительно отбираем захват мыши у Chromium
        ctypes.windll.user32.ReleaseCapture()
        
        # 2. Получаем координаты курсора для ядра Windows
        class POINT(ctypes.Structure):
            _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]
        pt = POINT()
        ctypes.windll.user32.GetCursorPos(ctypes.byref(pt))
        lparam = ((pt.y & 0xFFFF) << 16) | (pt.x & 0xFFFF)
        
        # 3. Начинаем нативный ресайз ядром DWM (без подергиваний)
        WM_NCLBUTTONDOWN = 0x00A1
        ctypes.windll.user32.PostMessageW(hwnd, WM_NCLBUTTONDOWN, int(ht), lparam)
        return True

    def _win_rect(self, hwnd):
        import ctypes
        from ctypes import wintypes
        user32 = ctypes.windll.user32
        user32.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
        r = wintypes.RECT()
        user32.GetWindowRect(hwnd, ctypes.byref(r))
        return r.left, r.top, r.right, r.bottom

    def _cursor(self):
        import ctypes
        from ctypes import wintypes
        user32 = ctypes.windll.user32
        user32.GetCursorPos.argtypes = [ctypes.POINTER(wintypes.POINT)]
        p = wintypes.POINT()
        user32.GetCursorPos(ctypes.byref(p))
        return p.x, p.y

    def _set_bounds(self, hwnd, x, y, w, h):
        import ctypes
        from ctypes import wintypes
        user32 = ctypes.windll.user32
        user32.SetWindowPos.argtypes = [wintypes.HWND, wintypes.HWND,
                                        ctypes.c_int, ctypes.c_int,
                                        ctypes.c_int, ctypes.c_int, ctypes.c_uint]
        SWP_NOZORDER, SWP_NOACTIVATE = 0x0004, 0x0010
        user32.SetWindowPos(hwnd, 0, int(x), int(y), int(w), int(h),
                            SWP_NOZORDER | SWP_NOACTIVATE)

    def _start_interactive_loop(self, kind):
        """Запускает фоновый поток-таймер, который ~60 раз в секунду вызывает
        update_win_move/update_win_resize, пока номер поколения не сменится.
        Жизненно важно для безрамочного окна: когда курсор покидает клиентскую
        область (выходит за край окна при перетаскивании), события mousemove из
        WebView прекращаются. Опрос GetCursorPos ведёт себя независимо от этого,
        поэтому движение/ресайз не "залипают" на границе окна."""
        gen = self._interactive_gen
        import threading

        def _loop():
            while getattr(self, '_interactive_gen', -1) == gen:
                try:
                    if kind == 'move':
                        self.update_win_move()
                    else:
                        self.update_win_resize()
                except Exception:
                    pass
                time.sleep(1.0 / 60.0)

        t = threading.Thread(target=_loop, daemon=True)
        t.start()

    def begin_win_move(self):
        import sys
        if sys.platform != 'win32':
            return False
        hwnd = self._win_hwnd()
        if not hwnd:
            return False
        l, t, r, b = self._win_rect(hwnd)
        cx, cy = self._cursor()
        self._winmv = {'hwnd': hwnd, 'x': l, 'y': t, 'cx': cx, 'cy': cy}
        self._win_maximized = False
        # Поднимаем поколение -> останавливаем возможный прошлый цикл и
        # стартуем новый, привязанный к этому перетаскиванию.
        self._interactive_gen = getattr(self, '_interactive_gen', 0) + 1
        self._start_interactive_loop('move')
        return True

    def update_win_move(self):
        import sys, ctypes
        if sys.platform != 'win32':
            return False
        mv = getattr(self, '_winmv', None)
        if not mv:
            return False
        cx, cy = self._cursor()
        nx = mv['x'] + (cx - mv['cx'])
        ny = mv['y'] + (cy - mv['cy'])

        SWP_NOSIZE = 0x0001
        SWP_NOZORDER = 0x0004
        SWP_NOACTIVATE = 0x0010
        ctypes.windll.user32.SetWindowPos(mv['hwnd'], 0, int(nx), int(ny), 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE)
        return True

    def end_win_move(self):
        # Смена поколения останавливает фоновый цикл опроса.
        self._interactive_gen = getattr(self, '_interactive_gen', 0) + 1
        self._winmv = None
        return True

    def begin_win_resize(self, edges):
        import sys
        if sys.platform != 'win32':
            return False
        hwnd = self._win_hwnd()
        if not hwnd:
            return False
        l, t, r, b = self._win_rect(hwnd)
        cx, cy = self._cursor()
        self._winrz = {'hwnd': hwnd, 'l': l, 't': t, 'r': r, 'b': b,
                       'cx': cx, 'cy': cy, 'edges': str(edges)}
        self._win_maximized = False
        self._interactive_gen = getattr(self, '_interactive_gen', 0) + 1
        self._start_interactive_loop('resize')
        return True

    def update_win_resize(self):
        import sys
        if sys.platform != 'win32':
            return False
        rz = getattr(self, '_winrz', None)
        if not rz:
            return False
        cx, cy = self._cursor()
        dx, dy = cx - rz['cx'], cy - rz['cy']
        l, t, r, b = rz['l'], rz['t'], rz['r'], rz['b']
        e = rz['edges']
        if 'l' in e: l = rz['l'] + dx
        if 'r' in e: r = rz['r'] + dx
        if 't' in e: t = rz['t'] + dy
        if 'b' in e: b = rz['b'] + dy
        MINW, MINH = 800, 600
        if r - l < MINW:
            if 'l' in e: l = r - MINW
            else: r = l + MINW
        if b - t < MINH:
            if 't' in e: t = b - MINH
            else: b = t + MINH
        self._set_bounds(rz['hwnd'], l, t, r - l, b - t)
        return True

    def end_win_resize(self):
        self._interactive_gen = getattr(self, '_interactive_gen', 0) + 1
        self._winrz = None
        return True

    def toggle_maximize_window(self):
        """Разворот/восстановление. Разворачиваем в рабочую область монитора,
           чтобы безрамочное окно НЕ перекрывало панель задач."""
        import sys
        if sys.platform != 'win32':
            return False
        import ctypes
        from ctypes import wintypes
        hwnd = self._win_hwnd()
        if not hwnd:
            return False
        user32 = ctypes.windll.user32
        SWP_FRAMECHANGED = 0x0020

        if getattr(self, '_win_maximized', False):
            r = getattr(self, '_win_restore_rect', None)
            if r:
                user32.SetWindowPos(hwnd, 0, r[0], r[1], r[2], r[3], SWP_FRAMECHANGED)
            self._win_maximized = False
        else:
            rect = wintypes.RECT()
            user32.GetWindowRect(hwnd, ctypes.byref(rect))
            self._win_restore_rect = (rect.left, rect.top,
                                        rect.right - rect.left, rect.bottom - rect.top)
            MONITOR_DEFAULTTONEAREST = 2
            hmon = user32.MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST)

            class MONITORINFO(ctypes.Structure):
                _fields_ = [("cbSize", wintypes.DWORD),
                            ("rcMonitor", wintypes.RECT),
                            ("rcWork", wintypes.RECT),
                            ("dwFlags", wintypes.DWORD)]
            user32.GetMonitorInfoW.argtypes = [ctypes.c_void_p, ctypes.POINTER(MONITORINFO)]
            mi = MONITORINFO()
            mi.cbSize = ctypes.sizeof(MONITORINFO)
            user32.GetMonitorInfoW(ctypes.c_void_p(hmon), ctypes.byref(mi))
            w = mi.rcWork
            user32.SetWindowPos(hwnd, 0, w.left, w.top,
                                w.right - w.left, w.bottom - w.top, SWP_FRAMECHANGED)
            self._win_maximized = True
        return True

    def begin_window_drag(self):
        """Старт ручного перетаскивания. Всю работу с окном выполняем СТРОГО
           на главном потоке — иначе AppKit вешает приложение намертво."""
        import sys
        if sys.platform != 'darwin':
            return False
        from PyObjCTools import AppHelper

        def _begin():
            try:
                import AppKit
                app = AppKit.NSApplication.sharedApplication()
                win = app.keyWindow() or app.mainWindow()
                if win is None:
                    return

                # 🍏 НАТИВНОЕ перетаскивание: performWindowDragWithEvent_ отдаёт
                # жест системе, поэтому работают все штатные механики macOS —
                # визуальные "прилипания" к краям/углам, подсказки Window Tiling
                # (macOS 15+), корректные Spaces. Требуется живое мышиное событие
                # текущего жеста — успеваем его поймать, т.к. JS шлёт вызов
                # прямо из mousedown.
                ev = app.currentEvent()
                try:
                    ev_type = int(ev.type()) if ev is not None else -1
                except Exception:
                    ev_type = -1
                # 1 = NSEventTypeLeftMouseDown, 6 = NSEventTypeLeftMouseDragged
                if ev is not None and ev_type in (1, 6) and hasattr(win, 'performWindowDragWithEvent_'):
                    self._drag_native = True
                    self._drag_win = None  # ручной цикл не нужен
                    win.performWindowDragWithEvent_(ev)
                    return

                # Фолбэк: ручное перетаскивание (если событие не поймали)
                self._drag_native = False
                frame = win.frame()
                mouse = AppKit.NSEvent.mouseLocation()  # экранные коорд., origin снизу-слева
                self._drag_win = win
                self._drag_off_x = mouse.x - frame.origin.x
                self._drag_off_y = mouse.y - frame.origin.y
            except Exception as e:
                print(f"[Drag] begin error: {e}")

        AppHelper.callAfter(_begin)   # выполнится на главном потоке
        return True

    def drag_window(self):
        """Двигаем окно к текущей позиции мыши на главном потоке.
           Координаты целиком в системе Cocoa — без переворотов оси Y."""
        import sys
        if sys.platform != 'darwin':
            return False
        from PyObjCTools import AppHelper

        def _move():
            win = getattr(self, '_drag_win', None)
            if win is None:
                return
            try:
                import AppKit
                mouse = AppKit.NSEvent.mouseLocation()
                new_x = mouse.x - self._drag_off_x
                new_y = mouse.y - self._drag_off_y
                win.setFrameOrigin_(AppKit.NSMakePoint(new_x, new_y))
            except Exception as e:
                print(f"[Drag] move error: {e}")

        AppHelper.callAfter(_move)
        return True

    def end_window_drag(self):
        """Конец перетаскивания."""
        self._drag_win = None
        self._drag_native = False
        return True

    def set_traffic_lights(self, visible):
        """macOS: показать/скрыть «светофор» (кнопки закрытия/сворачивания/зума).
        Используется полноэкранными режимами приложения (например, Space —
        бесконечный холст), чтобы не отвлекать кнопками окна. На других ОС —
        no-op."""
        import sys
        if sys.platform != 'darwin':
            return True
        try:
            from PyObjCTools import AppHelper
        except Exception:
            return False

        def _apply():
            try:
                import AppKit
                app = AppKit.NSApplication.sharedApplication()
                win = app.keyWindow() or app.mainWindow()
                if win is None:
                    for w in (app.windows() or []):
                        if w.isVisible():
                            win = w
                            break
                if win is None:
                    return
                hidden = not bool(visible)
                # 0 = close, 1 = miniaturize, 2 = zoom
                for idx in (0, 1, 2):
                    try:
                        btn = win.standardWindowButton_(idx)
                        if btn is not None:
                            btn.setHidden_(hidden)
                    except Exception:
                        pass
            except Exception as e:
                print(f"[TrafficLights] error: {e}")

        AppHelper.callAfter(_apply)
        return True

    def zoom_window(self):
        """macOS: нативный zoom окна (двойной клик по заголовку, как у любого окна)."""
        import sys
        if sys.platform != 'darwin':
            return False
        from PyObjCTools import AppHelper

        def _zoom():
            try:
                import AppKit
                app = AppKit.NSApplication.sharedApplication()
                win = app.keyWindow() or app.mainWindow()
                if win is not None and (win.styleMask() & 8):  # NSWindowStyleMaskResizable
                    win.performZoom_(None)
            except Exception as e:
                print(f"[Zoom] error: {e}")

        AppHelper.callAfter(_zoom)
        return True

    def toggle_fullscreen(self):
        """Переключает нативный полноэкранный режим на macOS (зеленая кнопка)"""
        import sys
        if sys.platform == 'darwin':
            from PyObjCTools import AppHelper
            def _toggle():
                try:
                    import AppKit
                    app = AppKit.NSApplication.sharedApplication()
                    win = app.keyWindow() or app.mainWindow()
                    if win:
                        # Разрешаем окну переходить в нативный полноэкранный режим
                        # NSWindowCollectionBehaviorFullScreenPrimary = 128 (1 << 7)
                        behavior = win.collectionBehavior()
                        if not (behavior & 128):
                            win.setCollectionBehavior_(behavior | 128)
                        
                        # Вызываем нативный переход в полноэкранный режим
                        win.toggleFullScreen_(None)
                except Exception as e:
                    print(f"[Fullscreen] Cocoa error: {e}")
            AppHelper.callAfter(_toggle)
        else:
            if webview.windows:
                webview.windows[-1].toggle_fullscreen()

    def trigger_haptic(self):
        """Генерирует тактильный отклик на трекпадах macOS"""
        import sys
        if sys.platform == 'darwin':
            # На Apple Silicon (M1/M2/M3) приватный фреймворк MultitouchSupport возвращает True, 
            # но аппаратно глушится песочницей macOS, из-за чего старый код пропускал фолбэк.
            # Мы убираем хак и используем 100% надежный официальный API AppKit.
            try:
                import AppKit
                performer = AppKit.NSHapticFeedbackManager.defaultPerformer()
                if performer:
                    # pattern: 1 = NSHapticFeedbackPatternAlignment (Четкий физический щелчок стыковки)
                    # performanceTime: 1 = NSHapticFeedbackPerformanceTimeNow 
                    # ВАЖНО: Флаг "1" заставляет Taptic Engine сработать мгновенно, даже если 
                    # WebView "съел" нативный фокус мыши в момент кастомного Drag & Drop.
                    performer.performFeedbackPattern_performanceTime_(1, 1)
            except Exception as e:
                print(f"[Haptic] Error: {e}")
        return True

