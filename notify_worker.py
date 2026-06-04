# notify_worker.py
import sys
import os
import time
import json
import urllib.request
import sqlite3
import threading
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
        db_files = [f for f in Path(vault_path).glob("*.db.doe") if not f.name.endswith(".backup.db.doe")]
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
        # Папка хранилища не существует (например, извлечен внешний накопитель или перенесена папка)
        # Завершаем процесс воркера БЕЗ удаления из конфига.
        # Напоминание будет перезапущено, когда хранилище снова станет доступно.
        print(f"[Worker] Vault path {vault_path} not found. Exiting silently without removing config.")
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
        import AppKit
        from Foundation import NSObject, NSRunLoop, NSDate
        
        # Переменная для контроля жизненного цикла процесса
        global_state = {"keep_running": True}

        class NotificationDelegate(NSObject):
            def userNotificationCenter_didActivateNotification_(self, center, notification):
                print("[Worker] Notification clicked!")
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
                print("[Worker] Notification dismissed.")
                global_state["keep_running"] = False

            def timeout_(self, timer):
                print("[Worker] Timeout reached.")
                global_state["keep_running"] = False

        # Создание уведомления
        notification = AppKit.NSUserNotification.alloc().init()
        notification.setTitle_(title)
        notification.setInformativeText_(message)
        notification.setSoundName_(AppKit.NSUserNotificationDefaultSoundName)
        
        delegate = NotificationDelegate.alloc().init()
        globals()['_mac_delegate_retained'] = delegate
        
        center = AppKit.NSUserNotificationCenter.defaultUserNotificationCenter()
        center.setDelegate_(delegate)
        center.deliverNotification_(notification)
        
        # Таймер безопасности на 60 секунд
        AppKit.NSTimer.scheduledTimerWithTimeInterval_target_selector_userInfo_repeats_(
            60.0, delegate, "timeout:", None, False
        )
        
        print("[Worker] Listening to events via NSRunLoop...")
        # Запуск легковесного цикла ожидания ввода-вывода вместо графического NSApp
        run_loop = NSRunLoop.currentRunLoop()
        while global_state["keep_running"]:
            run_loop.runUntilDate_(NSDate.dateWithTimeIntervalSinceNow_(0.5))
            
        print("[Worker] Exiting process.")
        os._exit(0)
    
    elif sys.platform == 'win32':
        safe_title = title.replace("'", "''")
        safe_message = message.replace("'", "''")
        bundle_dir = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
        icon_path = os.path.join(bundle_dir, "favicon.ico")
        icon_ps = f"$notify.Icon = New-Object System.Drawing.Icon('{icon_path}');" if os.path.exists(icon_path) else "$notify.Icon = [System.Drawing.SystemIcons]::Information;"
        
        ps_payload = payload.decode('utf-8').replace("'", "''")
        
        ps_script = f"""
        Add-Type -AssemblyName System.Windows.Forms;
        $notify = New-Object System.Windows.Forms.NotifyIcon;
        {icon_ps}
        $notify.BalloonTipTitle = 'Doe';
        $notify.BalloonTipText = '{safe_title}`n{safe_message}';
        $notify.Visible = $True;
        
        $action = {{
            $configPath = Join-Path $env:USERPROFILE ".doe_config.json"
            if (Test-Path $configPath) {{
                $json = Get-Content $configPath -Raw | ConvertFrom-Json
                $ph = @{{ task_id = {task_id}; vault_path = '{vault_path.replace("'", "''")}' }}
                if ($null -eq $json.pending_highlight) {{
                    $json | Add-Member -NotePropertyName pending_highlight -NotePropertyValue $ph
                }} else {{
                    $json.pending_highlight = $ph
                }}
                $json | ConvertTo-Json -Depth 10 | Set-Content $configPath -Encoding UTF8
            }}
            try {{
                Invoke-WebRequest -Uri 'http://127.0.0.1:8000/api/v1/system/highlight-task' -Method POST -Body '{ps_payload}' -ContentType 'application/json' -UseBasicParsing | Out-Null
            }} catch {{ 
                Start-Process "Doe.exe" -ErrorAction SilentlyContinue
            }}
            $notify.Visible = $False;
            [System.Windows.Forms.Application]::ExitThread();
        }}
        $notify.add_BalloonTipClicked($action);
        $notify.add_BalloonTipClosed({{ $notify.Visible = $False; [System.Windows.Forms.Application]::ExitThread(); }});
        $notify.ShowBalloonTip(10000);
        [System.Windows.Forms.Application]::Run();
        """
        os.system(f'powershell -WindowStyle Hidden -Command "{ps_script}"')

if __name__ == "__main__":
    main()
