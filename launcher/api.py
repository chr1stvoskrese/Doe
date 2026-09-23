"""JS-мост окна: WindowAPI (вызовы фронта через window.pywebview.api)."""
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


if getattr(sys, 'frozen', False):
    bundle_dir = sys._MEIPASS
else:
    bundle_dir = os.path.dirname(os.path.abspath(__file__))


# --- ЗАМЕНИТЕ КЛАСС WindowAPI в wrapper.py на этот ---
class WindowAPI:
    # ------------------------------------------------------------------
    # 🌉 Мост данных: замена HTTP-сервера. Фронтенд шлёт сюда все запросы,
    # которые раньше уходили в fetch('/api/v1/...'). Метод прогоняет их через
    # in-process ASGI-приложение (без сети) и возвращает ответ фронту.
    # ------------------------------------------------------------------
    def api_request(self, method, path, headers=None, body_b64=None):
        """Единая точка входа фронта к бэкенду вместо HTTP.
        method — 'GET'/'POST'/... ; path — '/api/v1/...'(+query);
        headers — dict; body_b64 — base64 тела запроса или None.
        Возвращает {status, headers, body_b64} (тело всегда base64,
        чтобы одинаково обслуживать текст и бинарь)."""
        import base64 as _b64
        import json as _json
        # PERF: фронтенд поллит API ежесекундно, а stdout пишется в лог-файл
        # в папке vault с flush на каждую строку. Поэтому пер-запросный лог
        # моста включается только явно: DOE_DEBUG=1 (ошибки логируются всегда).
        _dbg = os.environ.get("DOE_DEBUG")
        if _dbg:
            print(f"[Bridge] → {method} {path}", flush=True)
        try:
            body = _b64.b64decode(body_b64) if body_b64 else b""
            hdrs = {str(k): str(v) for k, v in (headers or {}).items()}
            resp = DATA_LOOP.request(method, path, hdrs, body)
            content = resp.content or b""
            if _dbg:
                print(f"[Bridge] ← {method} {path} -> {resp.status_code} ({len(content)}b)", flush=True)
            return {
                "status": resp.status_code,
                "headers": {k: v for k, v in resp.headers.items()},
                "body_b64": _b64.b64encode(content).decode("ascii"),
            }
        except Exception as e:
            import traceback
            print(f"[Bridge] ✗ {method} {path} FAILED: {e}", flush=True)
            traceback.print_exc()
            payload = _json.dumps({"detail": str(e)}).encode("utf-8")
            return {
                "status": 500,
                "headers": {"content-type": "application/json"},
                "body_b64": _b64.b64encode(payload).decode("ascii"),
            }

    def get_asset_roots(self):
        """Абсолютные корни для резолвинга вложений в file://-URL:
        attachments_dir — папка вложений (было /doe/...),
        vault_dir — активное хранилище. Фронт кэширует и обновляет при смене
        vault. Используется в resolveMarkdownAssetSrc (app.js)."""
        try:
            from src.core.config import get_attachments_dir, get_active_vault
            attach = get_attachments_dir()
            vault = get_active_vault()
            return {
                "attachments_dir": str(attach) if attach else "",
                "vault_dir": str(vault) if vault else "",
            }
        except Exception as e:
            print(f"[Bridge] get_asset_roots failed: {e}")
            return {"attachments_dir": "", "vault_dir": ""}

    def get_pdfjs_dir(self):
        """Абсолютный путь к локально закэшированному PDF.js (file://-загрузка
        воркера/скрипта). Файлы кладёт эндпоинт /system/ensure-pdfjs."""
        try:
            from src.api.v1.system import get_pdfjs_dir as _gp
            return str(_gp())
        except Exception as e:
            print(f"[Bridge] get_pdfjs_dir failed: {e}")
            return ""

    def force_close(self):
        """Вызывается из JS для завершения работы приложения."""
        import os
        import sys
        import threading
        import time
            
        # 🐛 ФИКС ЗАВИСАНИЯ (Beachball of Death на macOS):
        # Если вызвать os._exit(0) прямо здесь, IPC-мост pywebview зависнет, 
        # ожидая возврата функции, и не отдаст команду обратно в JS.
        # Запускаем "убийцу" в отдельном потоке с микро-задержкой.
        def _kill_process():
            time.sleep(0.05) # Ждём 50мс, пока return True долетит до браузера
            _lock_vault_before_exit() # 🔐 шифруем защищённое хранилище
            try:
                sys.stdout.flush()
                sys.stderr.flush()
            except Exception:
                pass
            os._exit(0)

        threading.Thread(target=_kill_process, daemon=True).start()
        
        return True # Освобождаем мост!

    def close_window(self):
        """Закрывает окно (красная кнопка) — просто выходим."""
        import sys
        if sys.platform == 'darwin':
            # ── Сохраняем геометрию окна ПЕРЕД os._exit ──
            # events.closing не сработает: os._exit убивает процесс мгновенно,
            # в обход Cocoa windowShouldClose_. А отложенный таймер
            # bind_resize_event (1 с) мог ещё не отработать, если пользователь
            # изменил размер окна и сразу закрыл приложение.
            try:
                win = webview.windows[-1] if webview.windows else None
                if win:
                    w, h = win.width, win.height
                    try:
                        x, y = win.x, win.y
                    except Exception:
                        x, y = None, None
                    # Не сохраняем геометрию окна выбора хранилищ
                    if not (w <= 760 and h <= 680):
                        from src.core.config import set_vault_geometry, get_active_vault
                        vault = get_active_vault()
                        if vault:
                            set_vault_geometry(vault, int(w), int(h),
                                              int(x) if x is not None else None,
                                              int(y) if y is not None else None)
            except Exception:
                pass

            import os as _os
            import threading
            import time
            
            # Также используем отложенное закрытие, чтобы избежать дедлока UI потока
            def _kill_process():
                time.sleep(0.05)
                _lock_vault_before_exit() # 🔐 шифруем защищённое хранилище
                try:
                    sys.stdout.flush()
                    sys.stderr.flush()
                except: pass
                _os._exit(0)
                
            threading.Thread(target=_kill_process, daemon=True).start()
            return True
        else:
            if webview.windows:
                import threading
                try:
                    import ctypes
                    hwnd = self._win_hwnd()
                    if hwnd:
                        # Нативное асинхронное закрытие средствами Windows.
                        # PostMessageW не блокирует поток, мост pywebview спокойно 
                        # возвращает ответ в JS, а ОС сама закрывает окно.
                        WM_CLOSE = 0x0010
                        ctypes.windll.user32.PostMessageW(hwnd, WM_CLOSE, 0, 0)
                        return
                except Exception as e:
                    print(f"[Close] WinAPI error: {e}")
                
                # ФОЛБЭК: Если WinAPI недоступен, откладываем destroy на 0.15с.
                # Этого времени достаточно, чтобы pywebview завершил JS-транзакцию
                # и избежал KeyError: 'child_...'
                win = webview.windows[-1]
                threading.Timer(0.15, win.destroy).start()
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

    def choose_file(self):
        """Вызывает нативный диалог выбора файла (macOS/Windows)"""
        if not webview.windows:
            return None
            
        window = webview.windows[0]
        result = window.create_file_dialog(
            dialog_type=webview.OPEN_DIALOG,
            allow_multiple=False
        )
        
        if result and len(result) > 0:
            return result[0]
        return None

    def choose_files(self):
        """Нативный диалог выбора НЕСКОЛЬКИХ файлов. Возвращает список путей.

        Пути отдаются фронтенду, который прикрепляет файлы через
        /system/attach-local: копирование в фоне с прогрессом, на macOS —
        мгновенный APFS-клон. Так вложения любого размера (200 ГБ+)
        прикрепляются без загрузки по HTTP и без подвисаний."""
        if not webview.windows:
            return []

        window = webview.windows[0]
        result = window.create_file_dialog(
            dialog_type=webview.OPEN_DIALOG,
            allow_multiple=True
        )

        if result:
            return list(result)
        return []

    def get_dropped_files(self):
        """Пути файлов из последнего Drag & Drop (только macOS).

        WKWebView не отдаёт JS настоящие пути при drop; их перехватывает
        патч performDragOperation: (см. верх файла) и складывает в реестр.
        Возвращает [{path, name, size, is_dir}] и очищает реестр."""
        taker = globals().get('_doe_take_dropped_files')
        if taker is None:
            return []
        try:
            return taker()
        except Exception as e:
            print(f"[DnD] ⚠️ get_dropped_files failed: {e}")
            return []

    def choose_directory(self):
        """Вызывает нативный диалог выбора папки (macOS/Windows)"""
        if not webview.windows:
            return None
            
        window = webview.windows[0]
        result = window.create_file_dialog(
            dialog_type=webview.FOLDER_DIALOG,
            allow_multiple=False
        )
        
        if result and len(result) > 0:
            return result[0]
        return None
    
    # 🔐 Исполняемые/скриптовые расширения, автозапуск которых через
    # open/startfile/xdg-open эквивалентен выполнению кода. Не открываем их
    # одним кликом из (потенциально недоверенной) ссылки в заметке.
    _DANGEROUS_EXEC_EXTS = {
        ".app", ".command", ".tool", ".terminal", ".scpt", ".scptd",
        ".applescript", ".workflow", ".action", ".appref-ms",
        ".pkg", ".mpkg", ".webloc", ".mobileconfig",
        ".exe", ".bat", ".cmd", ".com", ".msi", ".msp", ".scr", ".pif",
        ".ps1", ".psm1", ".vbs", ".vbe", ".wsf", ".wsh", ".hta", ".cpl",
        ".jse", ".lnk", ".reg", ".inf", ".gadget", ".msc",
        ".settingcontent-ms", ".url", ".scf", ".xll", ".ws", ".job",
        ".chm", ".hlp", ".ps1xml", ".vbscript",
        ".msh", ".msh1", ".msh2", ".mshxml", ".msh1xml", ".msh2xml",
        ".sh", ".bash", ".zsh", ".run", ".desktop", ".jar", ".apk",
        ".appimage",
    }

    def open_local_path(self, path):
        """Открывает файл или папку в стандартном приложении ОС"""
        print(f"[System] Attempting to open path: {path}")
        try:
            clean_path = path.replace('file://', '')
            import urllib.parse
            clean_path = urllib.parse.unquote(clean_path)

            # 🔐 Не запускаем исполняемые типы одним кликом. ОС (особенно Windows)
            # отбрасывает завершающие точки/пробелы в имени, поэтому "evil.exe."
            # обошёл бы splitext — нормализуем имя перед извлечением расширения.
            _norm_name = os.path.basename(clean_path).rstrip(" .\t\r\n")
            _ext = ("." + _norm_name.rsplit(".", 1)[1].lower()) if "." in _norm_name else ""
            if _ext in self._DANGEROUS_EXEC_EXTS:
                print(f"[System] Refused to launch executable: {clean_path}")
                return False

            if sys.platform == 'darwin':
                subprocess.call(['open', clean_path])
            elif sys.platform == 'win32':
                os.startfile(clean_path)
            elif sys.platform.startswith('linux'):
                subprocess.call(['xdg-open', clean_path])
            return True
        except Exception as e:
            print(f"[System] Failed to open path: {e}")
            return False

    def reveal_local_path(self, path):
        """Открывает родительскую папку и выделяет в ней целевой файл/папку"""
        print(f"[System] Revealing path: {path}")
        try:
            clean_path = path.replace('file://', '')
            import urllib.parse
            clean_path = urllib.parse.unquote(clean_path)
            
            if sys.platform == 'darwin':
                # Флаг -R (Reveal) открывает Finder и выделяет элемент
                subprocess.call(['open', '-R', clean_path])
            elif sys.platform == 'win32':
                # Флаг /select открывает Проводник и выделяет элемент
                subprocess.call(['explorer', f'/select,{clean_path}'])
            elif sys.platform.startswith('linux'):
                # В Linux нет стандартизированного флага для выделения файла.
                # Безопасный фолбэк: просто открываем родительскую директорию.
                parent_dir = os.path.dirname(clean_path)
                subprocess.call(['xdg-open', parent_dir])
            return True
        except Exception as e:
            print(f"[System] Failed to reveal path: {e}")
            return False

    def reveal_window(self):
        print("[WebView] Signal received from JS: Interface is ready, showing window.")
        if not webview.windows:
            return
        
        # Берем последнее созданное окно
        window = webview.windows[-1]
        
        # 1. Показываем окно
        window.show()
        
        # 2. Вытягиваем окно на передний план
        import sys
        if sys.platform == 'darwin':
            try:
                import AppKit
                from Foundation import NSOperationQueue, NSNotificationCenter, NSObject
                
                # Создаем системный слушатель, который будет переключать заголовок
                if 'TitleToggleObserver' not in globals():
                    class TitleToggleObserver(NSObject):
                        def windowWillEnterFullScreen_(self, notification):
                            win = notification.object()
                            if hasattr(win, 'setTitleVisibility_'):
                                win.setTitleVisibility_(0) # 0 = Показывать на серой рамке
                                
                        def windowWillExitFullScreen_(self, notification):
                            win = notification.object()
                            if hasattr(win, 'setTitleVisibility_'):
                                win.setTitleVisibility_(1) # 1 = Прятать в оконном режиме
                                
                    globals()['TitleToggleObserver'] = TitleToggleObserver
                    globals()['_title_observer_instance'] = TitleToggleObserver.alloc().init()
                    
                    nc = NSNotificationCenter.defaultCenter()
                    nc.addObserver_selector_name_object_(
                        globals()['_title_observer_instance'],
                        b'windowWillEnterFullScreen:',
                        AppKit.NSWindowWillEnterFullScreenNotification,
                        None
                    )
                    nc.addObserver_selector_name_object_(
                        globals()['_title_observer_instance'],
                        b'windowWillExitFullScreen:',
                        AppKit.NSWindowWillExitFullScreenNotification,
                        None
                    )

                def _activate():
                    try:
                        AppKit.NSApp.activateIgnoringOtherApps_(True)
                        # Прячем заголовок при старте (т.к. стартуем в оконном режиме)
                        for win in AppKit.NSApp.windows():
                            if hasattr(win, 'setTitleVisibility_'):
                                if not (win.styleMask() & 16384): # 16384 = NSWindowStyleMaskFullScreen
                                    win.setTitleVisibility_(1)
                    except Exception:
                        pass
                        
                NSOperationQueue.mainQueue().addOperationWithBlock_(_activate)
            except Exception as e:
                print(f"[System] macOS UI Sync failed: {e}")
                
        elif sys.platform == 'win32':
            import ctypes
            from ctypes import wintypes
            try:
                # 🪟 ФИКС: раньше HWND искался по заголовку окна (FindWindowW),
                # а тип окна определялся по 'Select Vault' в title. При смене
                # хранилища окно перенавигируется и title меняется асинхронно —
                # гонка приводила к тому, что главное окно оставалось без
                # WS_THICKFRAME (нет нативного ресайза и Aero Snap).
                # Теперь: HWND берём напрямую из WinForms, тип окна — по URL.
                hwnd = self._win_hwnd() or ctypes.windll.user32.FindWindowW(None, window.title)
                if hwnd:
                    icon_path = os.path.join(bundle_dir, "favicon.ico")
                    if os.path.exists(icon_path):
                        hicon = ctypes.windll.user32.LoadImageW(0, icon_path, 1, 32, 32, 0x00000010)
                        ctypes.windll.user32.SendMessageW(hwnd, 0x0080, 0, hicon)
                        ctypes.windll.user32.SendMessageW(hwnd, 0x0080, 1, hicon)

                    # Разделяем логику: окно выбора хранилищ не должно менять размеры.
                    # Определяем по URL (надёжно), title — фолбэк на случай ошибки.
                    try:
                        _cur_url = window.get_current_url() or ''
                        is_resizable = 'mode=vault' not in _cur_url
                    except Exception:
                        is_resizable = "Select Vault" not in window.title

                    if is_resizable:
                        # 🌟 СТИЛИ ДЛЯ ГЛАВНОГО ОКНА (Разрешен ресайз + Aero Snap + Фикс полосы) 🌟
                        GWL_STYLE = -16
                        WS_CAPTION = 0x00C00000     
                        WS_THICKFRAME = 0x00040000  
                        WS_MINIMIZEBOX = 0x00020000
                        WS_MAXIMIZEBOX = 0x00010000
                        WS_SYSMENU = 0x00080000     
                        
                        style = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_STYLE)
                        new_style = (style & ~WS_CAPTION) | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU
                        ctypes.windll.user32.SetWindowLongW(hwnd, GWL_STYLE, new_style)

                        # WndProc Hook для удаления белой полосы (растягивает контент на 100% окна)
                        if ctypes.sizeof(ctypes.c_void_p) == 8:
                            GetWindowLongPtr = ctypes.windll.user32.GetWindowLongPtrW
                            GetWindowLongPtr.argtypes = [wintypes.HWND, ctypes.c_int]
                            GetWindowLongPtr.restype = ctypes.c_void_p

                            SetWindowLongPtr = ctypes.windll.user32.SetWindowLongPtrW
                            SetWindowLongPtr.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_void_p]
                            SetWindowLongPtr.restype = ctypes.c_void_p
                        else:
                            GetWindowLongPtr = ctypes.windll.user32.GetWindowLongW
                            GetWindowLongPtr.argtypes = [wintypes.HWND, ctypes.c_int]
                            GetWindowLongPtr.restype = ctypes.c_void_p

                            SetWindowLongPtr = ctypes.windll.user32.SetWindowLongW
                            SetWindowLongPtr.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_void_p]
                            SetWindowLongPtr.restype = ctypes.c_void_p

                        GWLP_WNDPROC = -4
                        WM_NCCALCSIZE = 0x0083

                        old_proc = GetWindowLongPtr(hwnd, GWLP_WNDPROC)

                        call_wnd_proc = ctypes.windll.user32.CallWindowProcW
                        call_wnd_proc.argtypes = [ctypes.c_void_p, wintypes.HWND, ctypes.c_uint, ctypes.c_void_p, ctypes.c_void_p]
                        call_wnd_proc.restype = ctypes.c_void_p

                        def custom_wndproc(h, msg, wp, lp):
                            if msg == WM_NCCALCSIZE and wp:
                                return 0
                            return call_wnd_proc(old_proc, h, msg, wp, lp)

                        WNDPROC_TYPE = ctypes.WINFUNCTYPE(ctypes.c_void_p, wintypes.HWND, ctypes.c_uint, ctypes.c_void_p, ctypes.c_void_p)
                        new_proc = WNDPROC_TYPE(custom_wndproc)

                        self._wndproc_keepalive = new_proc
                        SetWindowLongPtr(hwnd, GWLP_WNDPROC, ctypes.cast(new_proc, ctypes.c_void_p))
                        
                        ctypes.windll.user32.SetWindowPos(hwnd, 0, 0, 0, 0, 0, 0x0027) # SWP_FRAMECHANGED | NOMOVE | NOSIZE
                    else:
                        # 🔒 СТИЛИ ДЛЯ ОКНА ВЫБОРА ХРАНИЛИЩ (Ресайз заблокирован, Aero Snap выключен) 🔒
                        GWL_STYLE = -16
                        WS_CAPTION = 0x00C00000     
                        WS_THICKFRAME = 0x00040000  
                        WS_MAXIMIZEBOX = 0x00010000 
                        
                        style = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_STYLE)
                        # Полностью убираем рамку изменения размеров (WS_THICKFRAME) и кнопку развертывания (WS_MAXIMIZEBOX)
                        new_style = style & ~WS_CAPTION & ~WS_THICKFRAME & ~WS_MAXIMIZEBOX
                        ctypes.windll.user32.SetWindowLongW(hwnd, GWL_STYLE, new_style)
                        
                        ctypes.windll.user32.SetWindowPos(hwnd, 0, 0, 0, 0, 0, 0x0027) # SWP_FRAMECHANGED

                    # --- ОБЩИЕ СТИЛИ ДЛЯ ОБОИХ ОКОН (Визуальное оформление) ---
                    # Убираем стандартную рамку Windows 11
                    ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, 34, ctypes.byref(ctypes.c_uint(0xFFFFFFFE)), 4)
                    
                    # Тень вокруг окна
                    class MARGINS(ctypes.Structure):
                        _fields_ = [("cxLeftWidth", ctypes.c_int),
                                    ("cxRightWidth", ctypes.c_int),
                                    ("cyTopHeight", ctypes.c_int),
                                    ("cyBottomHeight", ctypes.c_int)]
                    margins = MARGINS(0, 0, 1, 0)
                    ctypes.windll.dwmapi.DwmExtendFrameIntoClientArea(hwnd, ctypes.byref(margins))
                    
                    # Темный режим нативной подложки
                    is_dark = 1 if bg_color == '#161815' else 0
                    ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, 20, ctypes.byref(ctypes.c_int(is_dark)), 4)

                    # Скругление углов Windows 11
                    DWMWA_WINDOW_CORNER_PREFERENCE = 33
                    DWMWCP_ROUND = 2
                    ctypes.windll.dwmapi.DwmSetWindowAttribute(
                        hwnd, DWMWA_WINDOW_CORNER_PREFERENCE,
                        ctypes.byref(ctypes.c_int(DWMWCP_ROUND)), 4
                    )
            except Exception as e:
                print(f"[WebView] Windows UI Sync failed: {e}")

    def open_main_window(self):
        """Показывает окно доски. 🔧 Чтобы НЕ рвать мост pywebview (он роутит
        ответы api_request через окно 'master'), ПЕРЕИСПОЛЬЗУЕМ существующее
        окно — навигируем его на доску (load_url) вместо create+destroy.
        Раньше данные доски шли по HTTP и уничтожение master было безвредным;
        теперь ВСЁ идёт через мост, поэтому убийство master вешает доску.
        Новое окно создаём только если окон нет вообще (холодный путь)."""
        import threading as _thr
        print(f"[Window] open_main_window() called (thread={_thr.current_thread().name})", flush=True)

        windows = list(webview.windows)
        t_w, t_h, t_x, t_y = get_safe_geometry()
        _board_url = runtime_index_url('board')

        if windows:
            win = windows[0]
            print(f"[Window] reusing existing window → navigating to board (no destroy)", flush=True)

            def _navigate_and_apply_chrome():
                try:
                    win.load_url(_board_url)
                except Exception as e:
                    print(f"[Window] load_url failed: {e}", flush=True)

                def _apply_board_chrome():
                    # Окно селектора было маленьким/нересайзабельным — возвращаем
                    # размеры доски и нативную возможность ресайза/разворота.
                    try:
                        win.set_title(MAIN_WINDOW_TITLE)
                    except Exception:
                        pass
                    try:
                        win.resize(max(800, t_w), max(600, t_h))
                    except Exception:
                        pass
                    try:
                        if sys.platform == 'darwin':
                            import AppKit
                            for w in AppKit.NSApp.windows():
                                if w.canBecomeKeyWindow():
                                    w.setStyleMask_(w.styleMask() | 8 | 4)  # Resizable|Miniaturizable
                                    zb = w.standardWindowButton_(2)
                                    if zb is not None:
                                        zb.setEnabled_(True)
                                    mb = w.standardWindowButton_(1)
                                    if mb is not None:
                                        mb.setEnabled_(True)
                        elif sys.platform == 'win32':
                            import ctypes
                            try:
                                from webview.platforms.winforms import BrowserView
                                from System.Drawing import Size
                                bv = BrowserView.instances.get(win.uid)
                                if bv:
                                    bv.MinimumSize = Size(800, 600)
                                    bv.MaximumSize = Size(0, 0)
                            except Exception:
                                pass
                            hwnd = ctypes.windll.user32.FindWindowW(None, MAIN_WINDOW_TITLE) \
                                or ctypes.windll.user32.FindWindowW(None, 'Doe — Select Vault')
                            if hwnd:
                                style = ctypes.windll.user32.GetWindowLongW(hwnd, -16)
                                ctypes.windll.user32.SetWindowLongW(hwnd, -16, style | 0x00040000 | 0x00010000 | 0x00020000)
                                ctypes.windll.user32.SetWindowPos(hwnd, 0, 0, 0, 0, 0, 0x27)
                    except Exception as e:
                        print(f"[Window] chrome restore failed: {e}", flush=True)
                    try:
                        win.show()
                        win.restore()
                    except Exception:
                        pass
                    try:
                        bind_resize_event(win)
                    except Exception:
                        pass
                    print("[Window] board ready in reused window.", flush=True)

                if sys.platform == 'darwin':
                    try:
                        from Foundation import NSOperationQueue
                        NSOperationQueue.mainQueue().addOperationWithBlock_(_apply_board_chrome)
                    except Exception:
                        _apply_board_chrome()
                else:
                    _apply_board_chrome()

            # Даем 100мс на то, чтобы функция вернулась в JS, и Promise разрешился.
            # Если сделать load_url мгновенно, старая JS-среда уничтожится,
            # и pywebview выбросит TypeError: "window.pywebview._returnValuesCallbacks... is not a function"
            import threading
            threading.Timer(0.1, _navigate_and_apply_chrome).start()
            return

        # --- Холодный путь: окон нет вообще — создаём окно доски ---
        c_w, c_h = t_w, t_h
        if sys.platform == 'win32' and t_x is not None:
            _scale = _win32_monitor_dpi_scale(t_x, t_y, t_w, t_h)
            c_w, c_h = max(800, round(t_w / _scale)), max(600, round(t_h / _scale))
        print(f"[Window] no existing window — creating board window…", flush=True)
        new_win = webview.create_window(
            title=MAIN_WINDOW_TITLE,
            url=_board_url,
            width=c_w,
            height=c_h,
            x=t_x,
            y=t_y,
            min_size=(800, 600),
            resizable=True,
            frameless=(sys.platform in ('darwin', 'win32')),
            easy_drag=False,
            background_color=bg_color,
            text_select=True,
            hidden=(not sys.platform.startswith('linux')),
            js_api=WindowAPI()
        )
        try:
            bind_resize_event(new_win)
            if sys.platform == 'win32' and t_x is not None:
                bind_geometry_enforcement(new_win, (t_x, t_y, t_w, t_h))
        except Exception:
            pass

    def open_vault_window(self):
        """Показывает окно выбора хранилища. 🔧 Как и open_main_window,
        переиспользуем существующее окно (навигация на vault-режим) вместо
        create+destroy, чтобы не рвать мост pywebview ('master')."""
        import threading as _thr
        print(f"[Window] open_vault_window() called (thread={_thr.current_thread().name})", flush=True)
        windows = list(webview.windows)
        _vault_url = runtime_index_url('vault')

        if windows:
            win = windows[0]
            print(f"[Window] reusing existing window → navigating to vault selector (no destroy)", flush=True)

            def _navigate_and_apply_chrome():
                try:
                    win.load_url(_vault_url)
                except Exception as e:
                    print(f"[Window] load_url failed: {e}", flush=True)

                def _apply_vault_chrome():
                    try:
                        win.set_title('Doe — Select Vault')
                    except Exception:
                        pass
                    try:
                        win.resize(760, 680)
                    except Exception:
                        pass
                    try:
                        win.show()
                        win.restore()
                    except Exception:
                        pass

                if sys.platform == 'darwin':
                    try:
                        from Foundation import NSOperationQueue
                        NSOperationQueue.mainQueue().addOperationWithBlock_(_apply_vault_chrome)
                    except Exception:
                        _apply_vault_chrome()
                else:
                    _apply_vault_chrome()

            import threading
            threading.Timer(0.1, _navigate_and_apply_chrome).start()
            return

        # --- Холодный путь: окон нет — создаём окно селектора ---
        webview.create_window(
            title='Doe — Select Vault',
            url=_vault_url,
            width=760,
            height=680,
            min_size=(760, 680),
            resizable=False,
            frameless=(sys.platform in ('darwin', 'win32')),
            easy_drag=False,
            background_color=bg_color,
            text_select=True,
            hidden=(not sys.platform.startswith('linux')),
            js_api=WindowAPI()
        )

