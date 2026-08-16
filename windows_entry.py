"""Windows-first launcher for Doe.

Loads pywebview before wrapper.py so Windows startup behavior can be fixed
without modifying the large cross-platform wrapper module.
"""

from __future__ import annotations

import os
import runpy
import sys
import threading
from typing import Any


def _normalize_file_url(url: Any) -> Any:
    """Work around pywebview WinForms treating file:// query strings as paths.

    Doe already embeds the launch mode in the generated runtime HTML, so the
    `?mode=vault` query is redundant for local file URLs and breaks Windows:
    WinForms/Chromium can encode the `?` as `%3F`, producing ERR_FILE_NOT_FOUND.
    """
    if not isinstance(url, str):
        return url
    if url.startswith("file://"):
        if "%3Fmode=vault" in url:
            url = url.replace("%3Fmode=vault", "")
        if "?mode=vault" in url:
            url = url.replace("?mode=vault", "")
    return url


def _patch_pywebview_for_windows() -> None:
    if sys.platform != "win32":
        return

    import webview

    original_create_window = webview.create_window
    original_load_url = getattr(webview.Window, "load_url", None)

    def create_window(*args: Any, **kwargs: Any):
        if "url" in kwargs:
            kwargs["url"] = _normalize_file_url(kwargs["url"])
        elif len(args) >= 2:
            args = list(args)
            args[1] = _normalize_file_url(args[1])
            args = tuple(args)

        if kwargs.get("hidden") is True:
            kwargs["hidden"] = False

        window = original_create_window(*args, **kwargs)

        if original_load_url is not None:
            def _load_url(url: Any) -> Any:
                return original_load_url(window, _normalize_file_url(url))

            window.load_url = _load_url

        try:
            def _diagnose_and_show() -> None:
                try:
                    print("[WindowsEntry] loaded callback fired.", flush=True)
                    window.show()
                    window.restore()
                    print("[WindowsEntry] Initial window shown after WebView load.", flush=True)
                except Exception as exc:
                    print(f"[WindowsEntry] Failed to show window: {exc!r}", flush=True)
                    return

                def _inspect_page() -> None:
                    try:
                        js = """
                        (() => ({
                            url: location.href,
                            title: document.title,
                            readyState: document.readyState,
                            bodyText: (document.body && document.body.innerText || '').slice(0, 500),
                            bodyChildren: document.body ? document.body.children.length : -1,
                            htmlClass: document.documentElement.className || '',
                            launchMode: window.__doeLaunchMode || null,
                            pywebview: !!window.pywebview
                        }))()
                        """
                        result = window.evaluate_js(js)
                        print(f"[WindowsEntry] Page diagnostics: {result!r}", flush=True)
                    except Exception as exc:
                        print(f"[WindowsEntry] Page diagnostics failed: {exc!r}", flush=True)

                threading.Timer(1.0, _inspect_page).start()

            window.events.loaded += _diagnose_and_show
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
