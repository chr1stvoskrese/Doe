"""Windows startup compatibility for Doe.

Python imports sitecustomize automatically during normal interpreter startup.
Doe historically creates its first pywebview window hidden and relies on a
frontend callback to call WindowAPI.reveal_window(). If the frontend bridge is
not ready yet, the native window can remain invisible even though WebView2 has
already loaded the page. On Windows we let pywebview show the initial window
normally and keep the explicit reveal_window() path as a harmless fallback.
"""

import sys

if sys.platform == "win32":
    try:
        import webview

        _original_create_window = webview.create_window

        def _doe_create_window(*args, **kwargs):
            # Only override the accidental hidden startup state. Callers that
            # explicitly pass hidden=False remain unchanged; explicit hidden
            # windows are not part of Doe's notification-worker path.
            if kwargs.get("hidden", False) is True:
                kwargs["hidden"] = False
            return _original_create_window(*args, **kwargs)

        webview.create_window = _doe_create_window
        print("[Windows] pywebview startup compatibility: forcing initial windows visible.")
    except Exception as _e:
        # Never prevent Python/Doe from starting if pywebview is not installed
        # yet or changes its import surface in a future release.
        print(f"[Windows] pywebview startup compatibility unavailable: {_e}")
