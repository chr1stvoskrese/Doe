# notify_worker.py
import sys
import os
import time
import json
import urllib.request
import sqlite3
import subprocess
from datetime import datetime
from pathlib import Path

def get_reminder_info(reminder_id):
    config_file = Path.home() / ".doe_config.json"
    if config_file.exists():
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                config_data = json.load(f)
            for r in config_data.get("active_reminders", []):
                if r.get("reminder_id") == reminder_id:
                    return r
        except Exception:
            pass
    return None

def remove_reminder_from_config(reminder_id):
    config_file = Path.home() / ".doe_config.json"
    if config_file.exists():
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                config_data = json.load(f)
            rems = config_data.get("active_reminders", [])
            new_rems = [r for r in rems if r.get("reminder_id") != reminder_id]
            if len(new_rems) != len(rems):
                config_data["active_reminders"] = new_rems
                with open(config_file, 'w', encoding='utf-8') as f:
                    json.dump(config_data, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

def set_pending_highlight(task_id, vault_path):
    config_file = Path.home() / ".doe_config.json"
    if config_file.exists():
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                config_data = json.load(f)
            config_data["pending_highlight"] = {"task_id": task_id, "vault_path": vault_path}
            with open(config_file, 'w', encoding='utf-8') as f:
                json.dump(config_data, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

def main():
    if len(sys.argv) < 7:
        sys.exit(1)

    due_time_iso = sys.argv[1]
    title = sys.argv[2]
    message = sys.argv[3]
    task_id = sys.argv[4]
    reminder_id = sys.argv[6]

    due_time = datetime.fromisoformat(due_time_iso.replace("Z", ""))
    while datetime.utcnow() < due_time:
        time.sleep(1)

    rem_info = get_reminder_info(reminder_id)
    if not rem_info:
        os._exit(0)
        
    vault_path = rem_info.get("vault_path")

    if vault_path and os.path.exists(vault_path):
        db_files = [f for f in Path(vault_path).glob("*.db.doe") if not f.name.endswith(".backup.db.doe") and not f.name.startswith("._")]
        if not db_files:
            remove_reminder_from_config(reminder_id)
            os._exit(0)
            
        db_file = max(db_files, key=lambda p: p.stat().st_mtime)
        try:
            uri = f"file:{db_file}?mode=ro"
            conn = sqlite3.connect(uri, uri=True, timeout=5.0)
            c = conn.cursor()
            c.execute("SELECT id FROM tasks WHERE id = ?", (task_id,))
            row = c.fetchone()
            conn.close()
            if not row:
                remove_reminder_from_config(reminder_id)
                os._exit(0)
        except Exception:
            pass
    else:
        os._exit(0)

    remove_reminder_from_config(reminder_id)

    payload = json.dumps({"task_id": int(task_id), "vault_path": vault_path}).encode('utf-8')

    def send_highlight_request():
        try:
            req = urllib.request.Request(
                "http://127.0.0.1:8000/api/v1/system/highlight-task",
                data=payload,
                headers={'Content-Type': 'application/json'}
            )
            urllib.request.urlopen(req, timeout=1.0)
            return True
        except Exception:
            return False

    if sys.platform == 'darwin':
        import objc
        from Foundation import (
            NSObject, 
            NSRunLoop, 
            NSDate, 
            NSTimer, 
            NSBundle, 
            NSUserNotification, 
            NSUserNotificationCenter, 
            NSUserNotificationDefaultSoundName
        )
        
        # 🌟 Динамический swizzling для обхода ограничения unbundled-процессов в dev-режиме.
        # Если bundleIdentifier равен None, мы заставляем его возвращать Bundle ID нашего приложения.
        if NSBundle.mainBundle().bundleIdentifier() is None:
            objc.classAddMethods(NSBundle, [
                objc.selector(lambda self: "com.aesthetic.doe", selector=b"bundleIdentifier", signature=b"@@:")
            ])
        
        global_state = {"keep_running": True}

        class NotificationDelegate(NSObject):
            def userNotificationCenter_didActivateNotification_(self, center, notification):
                set_pending_highlight(int(task_id), vault_path)
                server_is_alive = send_highlight_request()
                app_path = Path(sys.executable).parent.parent.parent
                
                if app_path.name.endswith('.app'):
                    if server_is_alive:
                        subprocess.Popen(['open', '-a', str(app_path)])
                    else:
                        subprocess.Popen(['open', '-n', '-a', str(app_path)])
                global_state["keep_running"] = False
                
            def userNotificationCenter_shouldPresentNotification_(self, center, notification):
                return True

            def userNotificationCenter_didDismissNotification_(self, center, notification):
                global_state["keep_running"] = False

            def timeout_(self, timer):
                global_state["keep_running"] = False

        notification = NSUserNotification.alloc().init()
        notification.setTitle_(title)
        notification.setInformativeText_(message)
        notification.setSoundName_(NSUserNotificationDefaultSoundName)
        
        delegate = NotificationDelegate.alloc().init()
        globals()['_mac_delegate_retained'] = delegate
        
        center = NSUserNotificationCenter.defaultUserNotificationCenter()
        center.setDelegate_(delegate)
        center.deliverNotification_(notification)
        
        NSTimer.scheduledTimerWithTimeInterval_target_selector_userInfo_repeats_(
            60.0, delegate, "timeout:", None, False
        )
        
        run_loop = NSRunLoop.currentRunLoop()
        while global_state["keep_running"]:
            run_loop.runUntilDate_(NSDate.dateWithTimeIntervalSinceNow_(0.5))
            
        os._exit(0)

    elif sys.platform == 'win32':
        import ctypes
        from ctypes import wintypes
        import winreg

        bundle_dir = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
        icon_path = os.path.join(bundle_dir, "favicon.ico")
        
        if getattr(sys, 'frozen', False):
            exe_dir = os.path.dirname(sys.executable)
        else:
            exe_dir = os.path.dirname(os.path.abspath(__file__))
            
        doe_exe_path = os.path.join(exe_dir, "Doe.exe")

        # -------------------------------------------------------------
        # МАГИЯ РЕЕСТРА: Чистый заголовок "Doe" вместо имени файла
        # -------------------------------------------------------------
        aumid = 'doe.aesthetic.kanban.app.1'
        try:
            key_path = rf"Software\Classes\AppUserModelId\{aumid}"
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path) as key:
                winreg.SetValueEx(key, "DisplayName", 0, winreg.REG_SZ, "Doe")
                if os.path.exists(icon_path):
                    winreg.SetValueEx(key, "IconUri", 0, winreg.REG_SZ, icon_path)
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(aumid)
        except Exception:
            pass
        # -------------------------------------------------------------

        WM_USER = 0x0400
        WM_DESTROY = 0x0002
        NIM_ADD = 0x00000000
        NIM_DELETE = 0x00000002
        NIF_MESSAGE = 0x00000001
        NIF_ICON = 0x00000002
        NIF_TIP = 0x00000004
        NIF_INFO = 0x00000010
        NIIF_INFO = 0x00000001
        NIN_BALLOONTIMEOUT = WM_USER + 4
        NIN_BALLOONUSERCLICK = WM_USER + 5
        WM_TRAYMSG = WM_USER + 20

        HANDLE = ctypes.c_void_p

        class NOTIFYICONDATAW(ctypes.Structure):
            _fields_ = [
                ("cbSize", wintypes.DWORD),
                ("hWnd", wintypes.HWND),
                ("uID", wintypes.UINT),
                ("uFlags", wintypes.UINT),
                ("uCallbackMessage", wintypes.UINT),
                ("hIcon", HANDLE),
                ("szTip", wintypes.WCHAR * 128),
                ("dwState", wintypes.DWORD),
                ("dwStateMask", wintypes.DWORD),
                ("szInfo", wintypes.WCHAR * 256),
                ("uTimeout", wintypes.UINT),
                ("szInfoTitle", wintypes.WCHAR * 64),
                ("dwInfoFlags", wintypes.DWORD),
                ("guidItem", ctypes.c_byte * 16),
                ("hBalloonIcon", HANDLE),
            ]

        WNDPROC = ctypes.WINFUNCTYPE(ctypes.c_int, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM)

        class WNDCLASSW(ctypes.Structure):
            _fields_ = [
                ("style", wintypes.UINT),
                ("lpfnWndProc", WNDPROC),
                ("cbClsExtra", ctypes.c_int),
                ("cbWndExtra", ctypes.c_int),
                ("hInstance", wintypes.HINSTANCE),
                ("hIcon", HANDLE),
                ("hCursor", HANDLE),
                ("hbrBackground", HANDLE),
                ("lpszMenuName", wintypes.LPCWSTR),
                ("lpszClassName", wintypes.LPCWSTR),
            ]

        def remove_tray_icon(hwnd):
            nid = NOTIFYICONDATAW()
            nid.cbSize = ctypes.sizeof(NOTIFYICONDATAW)
            nid.hWnd = hwnd
            nid.uID = 1
            ctypes.windll.shell32.Shell_NotifyIconW(NIM_DELETE, ctypes.byref(nid))

        def on_click_action():
            set_pending_highlight(int(task_id), vault_path)
            server_is_alive = send_highlight_request()
            if not server_is_alive:
                if os.path.exists(doe_exe_path):
                    subprocess.Popen([doe_exe_path])
                else:
                    subprocess.Popen(["Doe.exe"], shell=True)

        def wnd_proc(hwnd, msg, wparam, lparam):
            if msg == WM_TRAYMSG:
                if lparam == NIN_BALLOONUSERCLICK:
                    on_click_action()
                    remove_tray_icon(hwnd)
                    ctypes.windll.user32.PostQuitMessage(0)
                elif lparam in (NIN_BALLOONTIMEOUT, NIN_BALLOONTIMEOUT + 1):
                    remove_tray_icon(hwnd)
                    ctypes.windll.user32.PostQuitMessage(0)
            elif msg == WM_DESTROY:
                ctypes.windll.user32.PostQuitMessage(0)
            return ctypes.windll.user32.DefWindowProcW(hwnd, msg, wparam, lparam)

        wc = WNDCLASSW()
        wc.lpfnWndProc = WNDPROC(wnd_proc)
        wc.lpszClassName = "DoeNotificationWindowClass"
        wc.hInstance = ctypes.windll.kernel32.GetModuleHandleW(None)
        
        _global_wndproc_ref = wc.lpfnWndProc
        
        class_atom = ctypes.windll.user32.RegisterClassW(ctypes.byref(wc))
        
        # 🚀 ИСПРАВЛЕНО: Строки обёрнуты в c_wchar_p
        hwnd = ctypes.windll.user32.CreateWindowExW(
            0, ctypes.c_wchar_p(wc.lpszClassName), ctypes.c_wchar_p("DoeNotificationWindow"),
            0, 0, 0, 0, 0,
            0, 0, wc.hInstance, 0
        )

        if not hwnd:
            # FATAL FALLBACK (Бронежилет на случай сбоев WinAPI)
            import base64
            safe_title = title.replace("'", "''").replace("\n", "`n")
            safe_message = message.replace("'", "''").replace("\n", "`n")
            # 🔐 Экранируем и пути тоже: если папка установки/хранилища содержит
            # апостроф, неэкранированное значение разорвало бы строку PowerShell.
            safe_icon_path = str(icon_path).replace("'", "''")
            safe_doe_exe_path = str(doe_exe_path).replace("'", "''")
            icon_ps = f"$notify.Icon = New-Object System.Drawing.Icon('{safe_icon_path}');" if os.path.exists(icon_path) else "$notify.Icon = [System.Drawing.SystemIcons]::Information;"
            ps_payload = payload.decode('utf-8').replace("'", "''")
            ps_script = f'''
            Add-Type -AssemblyName System.Windows.Forms;
            $notify = New-Object System.Windows.Forms.NotifyIcon;
            {icon_ps}
            $notify.BalloonTipTitle = '{safe_title}';
            $notify.BalloonTipText = '{safe_message}';
            $notify.Visible = $True;
            $action = {{
                $configPath = Join-Path $env:USERPROFILE ".doe_config.json"
                if (Test-Path $configPath) {{
                    $json = Get-Content -Path $configPath -Raw | ConvertFrom-Json
                    $ph = @{{ task_id = {int(task_id)}; vault_path = '{vault_path.replace("'", "''")}' }}
                    $json.pending_highlight = $ph
                    [System.IO.File]::WriteAllText($configPath, ($json | ConvertTo-Json -Depth 10))
                }}
                try {{ Invoke-WebRequest -Uri 'http://127.0.0.1:8000/api/v1/system/highlight-task' -Method POST -Body '{ps_payload}' -ContentType 'application/json' -UseBasicParsing | Out-Null }} catch {{ 
                    if (Test-Path '{safe_doe_exe_path}') {{ Start-Process '{safe_doe_exe_path}' }} else {{ Start-Process "Doe.exe" -ErrorAction SilentlyContinue }}
                }}
                $notify.Visible = $False;
                [System.Windows.Forms.Application]::ExitThread();
            }}
            $notify.add_BalloonTipClicked($action);
            $notify.add_BalloonTipClosed({{ $notify.Visible = $False; [System.Windows.Forms.Application]::ExitThread(); }});
            $notify.ShowBalloonTip(10000);
            [System.Windows.Forms.Application]::Run();
            '''
            encoded_script = base64.b64encode(ps_script.encode('utf-16le')).decode('utf-8')
            subprocess.Popen(["powershell", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded_script], creationflags=0x08000000)
            os._exit(0)

        hIcon = 0
        if os.path.exists(icon_path):
            hIcon = ctypes.windll.user32.LoadImageW(0, ctypes.c_wchar_p(icon_path), 1, 0, 0, 0x0010 | 0x8000)
        if not hIcon:
            hIcon = ctypes.windll.user32.LoadIconW(0, 32512)

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
            
        os._exit(0)

    elif sys.platform.startswith('linux'):
        # Linux (Fedora/Ubuntu) через libnotify
        # Подготовим вызов для клика
        action_cmd = ""
        if getattr(sys, 'frozen', False):
            exe_path = sys.executable
            action_cmd = f"\"{exe_path}\""
        else:
            action_cmd = f"python3 wrapper.py"

        # notify-send в свежих версиях GNOME поддерживает --action, но чтобы 
        # не зависеть от версии libnotify, мы кидаем обычное уведомление.
        # Если нужно обязательно отловить клик, лучше использовать pydbus,
        # но для минимизации зависимостей мы просто покажем всплывашку:
        try:
            icon_path = os.path.join(getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__))), "doe.png")
            cmd = ["notify-send", "-a", "Doe", "-i", icon_path if os.path.exists(icon_path) else "dialog-information", title, message]
            subprocess.run(cmd, check=False)
        except Exception:
            pass

        # Очищаем память
        os._exit(0)

if __name__ == "__main__":
    main()
