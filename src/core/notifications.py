# src/core/notifications.py
"""
Общая логика фонового воркера напоминаний.

Используется из двух точек входа (один и тот же flow, без копипасты):
- notify_worker.py  — отдельный консольный бинарник в бандле (frozen),
- wrapper.py --worker — dev-режим (python wrapper.py --worker ...).

Flow: дождаться due_time → проверить, что напоминание ещё активно →
проверить vault и наличие задачи в SQLite-индексе → потребить напоминание
(удалить из конфига) → показать системное уведомление. Клик по уведомлению
пишет файловый сигнал pending_highlight (запущенный инстанс подхватывает его
поллингом /system/pending-highlights) и активирует приложение средствами ОС.

Только stdlib — модуль должен импортироваться и в frozen-окружении, и в dev.
"""

import json
import os
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

CONFIG_FILE = Path.home() / ".doe_config.json"
APP_BUNDLE_ID = "com.aesthetic.doe"


# ---------------------------------------------------------------------------
# Конфиг (~/.doe_config.json) — прямой доступ, без src.core.config
# (воркер обязан работать даже когда основное приложение закрыто)
# ---------------------------------------------------------------------------

def _read_config() -> dict:
    try:
        if CONFIG_FILE.exists():
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def _write_config(data: dict) -> None:
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def get_reminder(reminder_id: str) -> dict | None:
    for r in _read_config().get("active_reminders", []):
        if r.get("reminder_id") == reminder_id:
            return r
    return None


def drop_reminder(reminder_id: str) -> None:
    data = _read_config()
    rems = data.get("active_reminders", [])
    new_rems = [r for r in rems if r.get("reminder_id") != reminder_id]
    if len(new_rems) != len(rems):
        data["active_reminders"] = new_rems
        _write_config(data)


def write_pending_highlight(task_id, vault_path) -> None:
    data = _read_config()
    if data:
        try:
            data["pending_highlight"] = {"task_id": task_id, "vault_path": vault_path}
            _write_config(data)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Проверки перед показом
# ---------------------------------------------------------------------------

def wait_until_due(due_time_iso: str) -> None:
    try:
        due_time = datetime.fromisoformat(due_time_iso.replace("Z", ""))
    except Exception:
        return
    while datetime.now(timezone.utc).replace(tzinfo=None) < due_time:
        time.sleep(1)


def vault_db_files(vault_path: str) -> list:
    """Файлы БД хранилища (без бэкапов и мусора Finder)."""
    if not vault_path or not os.path.exists(vault_path):
        return []
    return [
        f for f in Path(vault_path).glob("*.db.doe")
        if not f.name.endswith(".backup.db.doe") and not f.name.startswith("._")
    ]


def task_exists(vault_path: str, task_id) -> bool:
    """Fail-open: при любой ошибке считаем, что задача есть (покажем уведомление)."""
    try:
        db_file = max(vault_db_files(vault_path), key=lambda p: p.stat().st_mtime)
        conn = sqlite3.connect(f"file:{db_file}?mode=ro", uri=True, timeout=5.0)
        try:
            row = conn.execute("SELECT id FROM tasks WHERE id = ?", (task_id,)).fetchone()
        finally:
            conn.close()
        return row is not None
    except Exception:
        return True


# ---------------------------------------------------------------------------
# Активация приложения по клику
# ---------------------------------------------------------------------------

def _bundle_path() -> Path:
    # Doe.app/Contents/MacOS/<exe> -> Doe.app
    return Path(sys.executable).parent.parent.parent


def activate_macos_app() -> None:
    app_path = _bundle_path()
    if app_path.name.endswith(".app"):
        subprocess.Popen(["open", "-a", str(app_path)])
    else:
        # dev-режим: пересоздаём команду запуска wrapper.py
        script = os.path.abspath(sys.argv[0])
        subprocess.Popen([sys.executable, script])


def launch_windows_app(exe_path: str) -> None:
    if exe_path and os.path.exists(exe_path):
        subprocess.Popen([exe_path])
    else:
        subprocess.Popen(["Doe.exe"], shell=True)


# ---------------------------------------------------------------------------
# macOS: NSUserNotification
# ---------------------------------------------------------------------------

def notify_macos(title: str, message: str, on_click) -> None:
    import objc
    from Foundation import (
        NSObject,
        NSRunLoop,
        NSDate,
        NSTimer,
        NSBundle,
        NSUserNotification,
        NSUserNotificationCenter,
        NSUserNotificationDefaultSoundName,
    )

    # Динамический swizzling для обхода ограничения unbundled-процессов
    # в dev-режиме (заставляем bundleIdentifier возвращать наш ID).
    if NSBundle.mainBundle().bundleIdentifier() is None:
        objc.classAddMethods(NSBundle, [
            objc.selector(lambda self: APP_BUNDLE_ID, selector=b"bundleIdentifier", signature=b"@@:")
        ])

    state = {"keep_running": True}

    class NotificationDelegate(NSObject):
        def userNotificationCenter_didActivateNotification_(self, center, notification):
            try:
                on_click()
            finally:
                state["keep_running"] = False

        def userNotificationCenter_shouldPresentNotification_(self, center, notification):
            return True

        def userNotificationCenter_didDismissNotification_(self, center, notification):
            state["keep_running"] = False

        def timeout_(self, timer):
            state["keep_running"] = False

    notification = NSUserNotification.alloc().init()
    notification.setTitle_(title)
    notification.setInformativeText_(message)
    notification.setSoundName_(NSUserNotificationDefaultSoundName)

    delegate = NotificationDelegate.alloc().init()
    globals()["_doe_notify_delegate_retained"] = delegate

    center = NSUserNotificationCenter.defaultUserNotificationCenter()
    center.setDelegate_(delegate)
    center.deliverNotification_(notification)

    NSTimer.scheduledTimerWithTimeInterval_target_selector_userInfo_repeats_(
        60.0, delegate, "timeout:", None, False
    )

    run_loop = NSRunLoop.currentRunLoop()
    while state["keep_running"]:
        run_loop.runUntilDate_(NSDate.dateWithTimeIntervalSinceNow_(0.5))


# ---------------------------------------------------------------------------
# Windows: tray balloon (+ PowerShell-фолбэк при сбое WinAPI)
# ---------------------------------------------------------------------------

def _windows_icon_path() -> str:
    bundle_dir = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(bundle_dir, "favicon.ico")


def _windows_exe_path() -> str:
    if getattr(sys, "frozen", False):
        return sys.executable
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "Doe.exe")


def _windows_powershell_fallback(title, message, task_id, vault_path, icon_path, exe_path) -> None:
    """Бронежилет на случай сбоев WinAPI: уведомление через System.Windows.Forms."""
    import base64
    safe = lambda v: str(v).replace("'", "''")
    icon_ps = (
        f"$notify.Icon = New-Object System.Drawing.Icon('{safe(icon_path)}');"
        if os.path.exists(icon_path)
        else "$notify.Icon = [System.Drawing.SystemIcons]::Information;"
    )
    ps_script = f"""
    Add-Type -AssemblyName System.Windows.Forms;
    $notify = New-Object System.Windows.Forms.NotifyIcon;
    {icon_ps}
    $notify.BalloonTipTitle = '{safe(title)}';
    $notify.BalloonTipText = '{safe(message)}';
    $notify.Visible = $True;
    $action = {{
        $configPath = Join-Path $env:USERPROFILE ".doe_config.json"
        if (Test-Path $configPath) {{
            $json = Get-Content -Path $configPath -Raw | ConvertFrom-Json
            $ph = @{{ task_id = {int(task_id)}; vault_path = '{safe(vault_path)}' }}
            $json.pending_highlight = $ph
            [System.IO.File]::WriteAllText($configPath, ($json | ConvertTo-Json -Depth 10))
        }}
        if (Test-Path '{safe(exe_path)}') {{ Start-Process '{safe(exe_path)}' }} else {{ Start-Process "Doe.exe" -ErrorAction SilentlyContinue }}
        $notify.Visible = $False;
        [System.Windows.Forms.Application]::ExitThread();
    }}
    $notify.add_BalloonTipClicked($action);
    $notify.add_BalloonTipClosed({{ $notify.Visible = $False; [System.Windows.Forms.Application]::ExitThread(); }});
    $notify.ShowBalloonTip(10000);
    [System.Windows.Forms.Application]::Run();
    """
    encoded = base64.b64encode(ps_script.encode("utf-16le")).decode("utf-8")
    subprocess.Popen(
        ["powershell", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass",
         "-EncodedCommand", encoded],
        creationflags=0x08000000,
    )


def notify_win32(title: str, message: str, on_click) -> None:
    import ctypes
    from ctypes import wintypes
    import winreg

    icon_path = _windows_icon_path()

    # Чистый заголовок "Doe" вместо имени файла + иконка в реестре.
    try:
        aumid = "doe.aesthetic.kanban.app.1"
        key_path = rf"Software\Classes\AppUserModelId\{aumid}"
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path) as key:
            winreg.SetValueEx(key, "DisplayName", 0, winreg.REG_SZ, "Doe")
            if os.path.exists(icon_path):
                winreg.SetValueEx(key, "IconUri", 0, winreg.REG_SZ, icon_path)
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(aumid)
    except Exception:
        pass

    WM_USER, WM_DESTROY = 0x0400, 0x0002
    NIM_ADD, NIM_DELETE = 0x00000000, 0x00000002
    NIF_MESSAGE, NIF_ICON, NIF_TIP, NIF_INFO = 0x0001, 0x0002, 0x0004, 0x0010
    NIIF_INFO = 0x00000001
    NIN_BALLOONTIMEOUT, NIN_BALLOONUSERCLICK = WM_USER + 4, WM_USER + 5
    WM_TRAYMSG = WM_USER + 20

    HICON = ctypes.c_void_p

    class NOTIFYICONDATAW(ctypes.Structure):
        _fields_ = [("cbSize", wintypes.DWORD), ("hWnd", wintypes.HWND), ("uID", wintypes.UINT),
                    ("uFlags", wintypes.UINT), ("uCallbackMessage", wintypes.UINT), ("hIcon", HICON),
                    ("szTip", wintypes.WCHAR * 128), ("dwState", wintypes.DWORD), ("dwStateMask", wintypes.DWORD),
                    ("szInfo", wintypes.WCHAR * 256), ("uTimeout", wintypes.UINT), ("szInfoTitle", wintypes.WCHAR * 64),
                    ("dwInfoFlags", wintypes.DWORD), ("guidItem", ctypes.c_byte * 16), ("hBalloonIcon", HICON)]

    WNDPROC = ctypes.WINFUNCTYPE(ctypes.c_int, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM)

    class WNDCLASSW(ctypes.Structure):
        _fields_ = [("style", wintypes.UINT), ("lpfnWndProc", WNDPROC), ("cbClsExtra", ctypes.c_int),
                    ("cbWndExtra", ctypes.c_int), ("hInstance", ctypes.c_void_p), ("hIcon", HICON),
                    ("hCursor", ctypes.c_void_p), ("hbrBackground", ctypes.c_void_p), ("lpszMenuName", wintypes.LPCWSTR),
                    ("lpszClassName", wintypes.LPCWSTR)]

    def wnd_proc(hwnd, msg, wparam, lparam):
        if msg == WM_TRAYMSG:
            if lparam == NIN_BALLOONUSERCLICK:
                on_click()
                nid = NOTIFYICONDATAW(); nid.cbSize = ctypes.sizeof(NOTIFYICONDATAW); nid.hWnd = hwnd; nid.uID = 1
                ctypes.windll.shell32.Shell_NotifyIconW(NIM_DELETE, ctypes.byref(nid))
                ctypes.windll.user32.PostQuitMessage(0)
            elif lparam in (NIN_BALLOONTIMEOUT, NIN_BALLOONTIMEOUT + 1):
                nid = NOTIFYICONDATAW(); nid.cbSize = ctypes.sizeof(NOTIFYICONDATAW); nid.hWnd = hwnd; nid.uID = 1
                ctypes.windll.shell32.Shell_NotifyIconW(NIM_DELETE, ctypes.byref(nid))
                ctypes.windll.user32.PostQuitMessage(0)
        elif msg == WM_DESTROY:
            ctypes.windll.user32.PostQuitMessage(0)
        return ctypes.windll.user32.DefWindowProcW(hwnd, msg, wparam, lparam)

    wc = WNDCLASSW()
    wc.lpfnWndProc = WNDPROC(wnd_proc)
    wc.lpszClassName = "DoeNotificationWindowClass"
    wc.hInstance = None

    globals()["_doe_notify_wndproc_retained"] = wc.lpfnWndProc
    ctypes.windll.user32.RegisterClassW(ctypes.byref(wc))

    hwnd = ctypes.windll.user32.CreateWindowExW(0, ctypes.c_wchar_p(wc.lpszClassName),
                                                ctypes.c_wchar_p("DoeNotificationWindow"),
                                                0, 0, 0, 0, 0, 0, 0, 0, 0)
    if not hwnd:
        raise RuntimeError("CreateWindowExW failed")

    hIcon = ctypes.windll.user32.LoadImageW(0, ctypes.c_wchar_p(icon_path), 1, 0, 0, 0x0010 | 0x8000) \
        if os.path.exists(icon_path) else ctypes.windll.user32.LoadIconW(0, 32512)

    nid = NOTIFYICONDATAW()
    nid.cbSize = ctypes.sizeof(NOTIFYICONDATAW)
    nid.hWnd = hwnd
    nid.uID = 1
    nid.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP | NIF_INFO
    nid.uCallbackMessage = WM_TRAYMSG
    nid.hIcon = hIcon
    nid.szTip = "Doe"[:127]
    nid.szInfo = message[:255]
    nid.szInfoTitle = title[:63]
    nid.dwInfoFlags = NIIF_INFO

    ctypes.windll.shell32.Shell_NotifyIconW(NIM_ADD, ctypes.byref(nid))

    msg = wintypes.MSG()
    while ctypes.windll.user32.GetMessageW(ctypes.byref(msg), 0, 0, 0) > 0:
        ctypes.windll.user32.TranslateMessage(ctypes.byref(msg))
        ctypes.windll.user32.DispatchMessageW(ctypes.byref(msg))


# ---------------------------------------------------------------------------
# Linux: libnotify
# ---------------------------------------------------------------------------

def notify_linux(title: str, message: str) -> None:
    try:
        icon_path = os.path.join(
            getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__))), "doe.png")
        cmd = ["notify-send", "-a", "Doe", "-i",
               icon_path if os.path.exists(icon_path) else "dialog-information",
               title, message]
        subprocess.run(cmd, check=False)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Главный flow
# ---------------------------------------------------------------------------

def run_notification(due_time_iso: str, title: str, message: str,
                     task_id, reminder_id: str, vault_path: str | None = None) -> None:
    """Ждёт due_time и показывает уведомление. Не возвращается (os._exit)."""
    wait_until_due(due_time_iso)

    if vault_path is None:
        rec = get_reminder(reminder_id)
        if rec is None:
            os._exit(0)
        vault_path = rec.get("vault_path")

    # Напоминание уже снято (или чужое) — молча уходим.
    if get_reminder(reminder_id) is None:
        os._exit(0)

    # Vault удалён/пуст или задача уже удалена — потребляем и уходим.
    if not vault_db_files(vault_path) or not task_exists(vault_path, task_id):
        drop_reminder(reminder_id)
        os._exit(0)

    drop_reminder(reminder_id)

    def on_click():
        write_pending_highlight(task_id, vault_path)
        if sys.platform == "darwin":
            activate_macos_app()
        elif sys.platform == "win32":
            launch_windows_app(_windows_exe_path())

    if sys.platform == "darwin":
        notify_macos(title, message, on_click)
    elif sys.platform == "win32":
        try:
            notify_win32(title, message, on_click)
        except Exception:
            _windows_powershell_fallback(title, message, task_id, vault_path,
                                         _windows_icon_path(), _windows_exe_path())
    elif sys.platform.startswith("linux"):
        notify_linux(title, message)

    os._exit(0)
