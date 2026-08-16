from pathlib import Path

# Windows borderless-window compatibility shim.
# The full application remains in wrapper_original.py; we patch the Win32
# hit-testing handler in memory before executing it, so the normal
# `python wrapper.py` entrypoint stays intact while the existing app logic
# remains untouched.

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
                                    # Keep the top strip as a native caption area.
                                    # This restores Windows drag/snap while the
                                    # rest of the borderless client stays interactive.
                                    if 0 <= local_y < 42:
                                        return HTCAPTION
                                return HTCLIENT
                            return call_wnd_proc(old_proc, h, msg, wp, lp)
'''


def _run_original():
    source = _ORIGINAL.read_text(encoding='utf-8')
    if 'WM_NCHITTEST = 0x0084' not in source and _SOURCE_OLD in source:
        source = source.replace(_SOURCE_OLD, _SOURCE_NEW, 1)
    code = compile(source, str(_ORIGINAL), 'exec')
    globals()['__file__'] = str(_ORIGINAL)
    exec(code, globals(), globals())


if __name__ == '__main__':
    _run_original()
