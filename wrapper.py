from pathlib import Path

# Windows compatibility layer for the borderless pywebview window.
# The application source stays in wrapper_original.py; wrapper.py remains the
# normal entrypoint while applying the small Windows input fixes before exec.

_ORIGINAL = Path(__file__).with_name('wrapper_original.py')

_SOURCE_OLD = '''                        def custom_wndproc(h, msg, wp, lp):
                            if msg == WM_NCCALCSIZE and wp:
                                return 0
                            return call_wnd_proc(old_proc, h, msg, wp, lp)
'''

_SOURCE_NEW = '''                        WM_NCHITTEST = 0x0084
                        HTCAPTION = 2
                        HTCLIENT = 1

                        def custom_wndproc(h, msg, wp, lp):
                            if msg == WM_NCCALCSIZE and wp:
                                return 0
                            if msg == WM_NCHITTEST:
                                y_screen = ctypes.c_short((lp >> 16) & 0xFFFF).value
                                rect = wintypes.RECT()
                                if ctypes.windll.user32.GetWindowRect(h, ctypes.byref(rect)):
                                    local_y = y_screen - rect.top
                                    if 0 <= local_y < 42:
                                        return HTCAPTION
                                return HTCLIENT
                            return call_wnd_proc(old_proc, h, msg, wp, lp)
'''

# Keep the Windows constants local to the complete reveal path, because the
# selector and board branches share the style-refresh code below them.
_STYLE_MARKER_OLD = '''                    if is_resizable:\n'''
_STYLE_MARKER_NEW = '''                    WS_MINIMIZEBOX = 0x00020000\n                    WS_MAXIMIZEBOX = 0x00010000\n                    WS_SYSMENU = 0x00080000\n\n                    if is_resizable:\n'''

# ctypes argtypes for GetCursorPos are process-global in ctypes. Another
# helper (_cursor) configures it for wintypes.POINT; start_window_drag/resize
# use a local POINT class. Set the prototype immediately before each call.
_CURSOR_OLD = '''        pt = POINT()\n        ctypes.windll.user32.GetCursorPos(ctypes.byref(pt))\n'''
_CURSOR_NEW = '''        pt = POINT()\n        ctypes.windll.user32.GetCursorPos.argtypes = [ctypes.POINTER(POINT)]\n        ctypes.windll.user32.GetCursorPos.restype = ctypes.c_bool\n        ctypes.windll.user32.GetCursorPos(ctypes.byref(pt))\n'''

_AUTO_STOP_OLD = '''    def update_win_move(self):
        import sys, ctypes
        if sys.platform != 'win32':
            return False
        mv = getattr(self, '_winmv', None)
'''

_AUTO_STOP_NEW = '''    def update_win_move(self):
        import sys, ctypes
        if sys.platform != 'win32':
            return False
        # The pointer can leave the WebView2 child window while dragging.
        # Stop from the native mouse state instead of relying on JS pointerup.
        if not (ctypes.windll.user32.GetAsyncKeyState(0x01) & 0x8000):
            self.end_win_move()
            return False
        mv = getattr(self, '_winmv', None)
'''

_RUNTIME_HEAD_OLD = '''    html = html.replace('</head>', inject, 1)
'''

_RUNTIME_HEAD_NEW = """    html = html.replace('</head>', inject, 1)

    # Windows borderless windows receive mouse input in the WebView2 child HWND,
    # not the top-level WinForms HWND. Start the existing native polling move
    # loop from the WebView itself. Interactive controls in the header are
    # deliberately excluded so close/minimize buttons keep working normally.
    if sys.platform == 'win32':
        _win_drag_bridge = r'''<script>
(function () {
    if (window.__doeWinDragInstalled) return;
    window.__doeWinDragInstalled = true;

    var dragging = false;
    var installed = false;

    function api() {
        return window.pywebview && window.pywebview.api;
    }

    function isInteractive(target) {
        return !!(target && target.closest && target.closest(
            'button, a, input, textarea, select, [role=\\\"button\\\"], [data-no-window-drag], .window-control'
        ));
    }

    function startDrag(event) {
        if (event.button !== 0 || event.clientY < 0 || event.clientY > 64) return;
        if (isInteractive(event.target)) return;
        var bridge = api();
        if (!bridge || typeof bridge.begin_win_move !== 'function') return;

        dragging = true;
        event.preventDefault();
        event.stopPropagation();
        try { bridge.begin_win_move(); } catch (_) {}
    }

    function stopDrag() {
        if (!dragging) return;
        dragging = false;
        var bridge = api();
        if (bridge && typeof bridge.end_win_move === 'function') {
            try { bridge.end_win_move(); } catch (_) {}
        }
    }

    function resizeEdges(event) {
        if (event.button !== 0) return null;
        if (window.__doeLaunchMode !== 'board') return null;
        var x = event.clientX, y = event.clientY;
        var w = window.innerWidth, h = window.innerHeight;
        var edge = '';
        var g = 10;
        if (x <= g) edge += 'l';
        else if (x >= w - g) edge += 'r';
        if (y <= g) edge += 't';
        else if (y >= h - g) edge += 'b';
        return edge || null;
    }

    function beginResize(event) {
        var edge = resizeEdges(event);
        if (!edge) return;
        if (isInteractive(event.target)) return;
        var bridge = api();
        if (!bridge || typeof bridge.begin_win_resize !== 'function') return;
        event.preventDefault();
        event.stopPropagation();
        try { bridge.begin_win_resize(edge); } catch (_) {}
    }

    function stopResize() {
        var bridge = api();
        if (bridge && typeof bridge.end_win_resize === 'function') {
            try { bridge.end_win_resize(); } catch (_) {}
        }
    }

    function install() {
        if (installed) return;
        if (!api()) return;
        installed = true;
        document.addEventListener('pointerdown', beginResize, true);
        document.addEventListener('pointerdown', startDrag, true);
        document.addEventListener('pointerup', stopDrag, true);
        document.addEventListener('pointerup', stopResize, true);
        document.addEventListener('pointercancel', stopDrag, true);
        document.addEventListener('pointercancel', stopResize, true);
        window.addEventListener('blur', stopDrag, true);
        window.addEventListener('blur', stopResize, true);
    }

    install();
    window.addEventListener('pywebviewready', install, { once: true });
})();
</script>'''
        html = html.replace('</head>', _win_drag_bridge + '</head>', 1)
"""


def _run_original():
    source = _ORIGINAL.read_text(encoding='utf-8')

    if 'WM_NCHITTEST = 0x0084' not in source and _SOURCE_OLD in source:
        source = source.replace(_SOURCE_OLD, _SOURCE_NEW, 1)

    if '_STYLE_MARKER_OLD in source' and _STYLE_MARKER_OLD in source:
        source = source.replace(_STYLE_MARKER_OLD, _STYLE_MARKER_NEW, 1)

    if 'GetCursorPos.argtypes = [ctypes.POINTER(POINT)]' not in source and _CURSOR_OLD in source:
        source = source.replace(_CURSOR_OLD, _CURSOR_NEW, 2)

    if 'The pointer can leave the WebView2 child window' not in source and _AUTO_STOP_OLD in source:
        source = source.replace(_AUTO_STOP_OLD, _AUTO_STOP_NEW, 1)

    if 'window.__doeWinDragInstalled' not in source and _RUNTIME_HEAD_OLD in source:
        source = source.replace(_RUNTIME_HEAD_OLD, _RUNTIME_HEAD_NEW, 1)

    code = compile(source, str(_ORIGINAL), 'exec')
    globals()['__file__'] = str(_ORIGINAL)
    exec(code, globals(), globals())


if __name__ == '__main__':
    _run_original()
