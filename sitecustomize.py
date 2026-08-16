"""Windows startup compatibility for Doe.

On Windows, make Doe's pywebview startup window visible without relying on
frontend bridge initialization. The frontend reveal_window() path remains a
harmless fallback.
"""

import sys

if sys.platform == "win32":
    try:
        import webview

        _original_create_window = webview.create_window

        def _doe_create_window(*args, **kwargs):
            if kwargs.get("hidden", False) is True:
                kwargs["hidden"] = False

            window = _original_create_window(*args, **kwargs)

            # Belt-and-suspenders startup path: once Chromium reports that the
            # page is loaded, explicitly show and restore the native window.
            # This avoids depending on JS -> pywebview bridge readiness merely
            # to make the first window visible.
            try:
                def _show_after_load(*_event_args):
                    try:
                        window.show()
                        window.restore()
                        print("[Windows] Initial pywebview window shown after load.", flush=True)
                    except Exception as _show_e:
                        print(f"[Windows] Failed to show initial window: {_show_e}", flush=True)

                window.events.loaded += _show_after_load
            except Exception as _event_e:
                print(f"[Windows] Could not attach startup show handler: {_event_e}", flush=True)

            return window

        webview.create_window = _doe_create_window
    except Exception as _e:
        print(f"[Windows] pywebview startup compatibility unavailable: {_e}", flush=True)
