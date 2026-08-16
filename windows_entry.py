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
                    return

                # Capture what actually loaded. This tells us whether the native
                # window is blank, the runtime HTML is wrong, or the frontend JS
                # crashed before rendering the vault screen.
                try:
                    import time
                    def inspect_page() -> None:
                        try:
                            result = window.evaluate_js(
                                "JSON.stringify({"
                                "readyState:document.readyState,"
                                "title:document.title,"
                                "url:location.href,"
                                "bodyLen:document.body?document.body.innerText.length:-1,"
                                "bodyStart:document.body?document.body.innerText.slice(0,300):''"
                                "})"
                            )
                            print(f"[WindowsEntry] Page diagnostics: {result!r}", flush=True)
                        except Exception as exc:
                            print(f"[WindowsEntry] Page diagnostics failed: {exc!r}", flush=True)

                    import threading
                    threading.Timer(1.0, inspect_page).start()
                except Exception as exc:
                    print(f"[WindowsEntry] Could not schedule page diagnostics: {exc!r}", flush=True)

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
