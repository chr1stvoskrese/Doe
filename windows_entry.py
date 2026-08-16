"""Windows-first launcher for Doe.

Loads pywebview before wrapper.py so Windows startup behavior can be fixed
without modifying the large cross-platform wrapper module.
"""

from __future__ import annotations

import os
import runpy
import sys
from typing import Any


def _patch_pywebview_for_windows() -> None:
    if sys.platform != "win32":
        return

    import webview

    original_create_window = webview.create_window

    def create_window(*args: Any, **kwargs: Any):
        # Doe's wrapper historically starts its first window hidden and expects
        # a JS bridge callback to reveal it. That callback is not guaranteed to
        # happen before/after WebView2 startup on Windows, so make the native
        # window visible from the start.
        if kwargs.get("hidden") is True:
            kwargs["hidden"] = False

        window = original_create_window(*args, **kwargs)

        try:
            def on_loaded(*_event_args: Any) -> None:
                try:
                    window.show()
                    window.restore()
                    print("[WindowsEntry] Initial window shown after WebView load.", flush=True)
                except Exception as exc:
                    print(f"[WindowsEntry] Failed to show window: {exc!r}", flush=True)

            window.events.loaded += on_loaded
        except Exception as exc:
            print(f"[WindowsEntry] Failed to attach loaded handler: {exc!r}", flush=True)

        return window

    webview.create_window = create_window
    print("[WindowsEntry] pywebview patched before Doe startup.", flush=True)


if __name__ == "__main__":
    _patch_pywebview_for_windows()
    runpy.run_path(
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "wrapper.py"),
        run_name="__main__",
    )
