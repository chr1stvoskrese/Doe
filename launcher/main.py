"""Точка запуска GUI: сигналы, окно, цикл webview."""
import multiprocessing
import os
import signal
import sys
import threading
import time
import traceback

import webview

from launcher import MAIN_WINDOW_TITLE
from launcher.api import WindowAPI
from launcher.bridge import DATA_LOOP, push_db_updated, runtime_index_url, bg_color
from launcher.platform import (
    get_safe_geometry,
    bind_resize_event,
    bind_geometry_enforcement,
    _win32_monitor_dpi_scale,
    _dump_geometry_diagnostics,
)
from launcher.vault_exit import _lock_vault_before_exit


def main():
        multiprocessing.freeze_support()
        print("[System] Starting main thread...")
    
        # --- Восстановление напоминаний при старте ---
        try:
            from src.core.config import restore_all_reminders
            restore_all_reminders()
            print("[System] Active reminders verified and restored.")
        except Exception as e:
            print(f"[System] Failed to restore active reminders: {e}")
    
        # Регистрируем себя в sys.modules под именем 'wrapper' даже когда запущены как __main__.
        # Это нужно, чтобы src/api/v1/system.py мог найти WindowAPI через sys.modules['wrapper'].
        sys.modules['wrapper'] = sys.modules['__main__']
    
        # ПЕРЕХВАТ ДВОЙНОГО КЛИКА ПО ФАЙЛУ .db.doe ИЗ ОС
        if len(sys.argv) == 2 and not sys.argv[1].startswith("--"):
            file_arg = sys.argv[1]
            if file_arg.endswith(".db.doe") and os.path.exists(file_arg):
                vault_dir = os.path.dirname(os.path.abspath(file_arg))

                # 🔒 Без сетевого сервера передать vault другому процессу по HTTP
                # больше нельзя. На macOS запущенный инстанс ловит файл через
                # AppleEvent (_doe_handle_vault_path). В остальных случаях просто
                # запоминаем vault и запускаемся штатно с нужной БД.
                from src.core.config import set_active_vault
                set_active_vault(vault_dir)
                print(f"[System] 🚀 Launched from file association. Active vault set to: {vault_dir}")

        # ФИКС ИКОНКИ И РЕЕСТРА ДЛЯ WINDOWS
        if sys.platform == 'win32':
            import ctypes
            try:
                app_id = 'doe.aesthetic.kanban.app.1'
                ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(app_id)
                print("[System] AppUserModelID set successfully.")
            except Exception as e:
                print(f"[System] Failed to set AppUserModelID: {e}")
            
            # ТИХАЯ РЕГИСТРАЦИЯ РАСШИРЕНИЯ В РЕЕСТРЕ WINDOWS (если запущено как .exe)
            try:
                if getattr(sys, 'frozen', False):
                    import winreg
                    exe_path = os.path.abspath(sys.argv[0])
                
                    # Привязываем расширение. ВАЖНО: Windows (как и macOS) определяет расширение
                    # только по последней точке, поэтому регистрируем .doe, а не .db.doe —
                    # иначе ассоциация и иконка не подхватываются вообще.
                    winreg.SetValue(winreg.HKEY_CURRENT_USER, r"Software\Classes\.doe", winreg.REG_SZ, "Doe.Vault")
                    # Указываем команду на открытие
                    winreg.SetValue(winreg.HKEY_CURRENT_USER, r"Software\Classes\Doe.Vault\shell\open\command", winreg.REG_SZ, f'"{exe_path}" "%1"')
                    # Ставим иконку от нашего же экзешника
                    winreg.SetValue(winreg.HKEY_CURRENT_USER, r"Software\Classes\Doe.Vault\DefaultIcon", winreg.REG_SZ, f'"{exe_path}",0')
                
                    # Мгновенно уведомляем систему об изменении иконок (очистка кэша Explorer)
                    import ctypes
                    from ctypes import wintypes
                    SHCNE_ASSOCCHANGED = 0x08000000
                    SHCNF_IDLIST = 0x0000
                    ctypes.windll.shell32.SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, None, None)
            except Exception as e:
                print(f"[System] Failed to register file association in Windows Registry: {e}")

        import signal
        import threading

        def force_quit():
            print("\n[System] 🛑 Завершение работы по CTRL+C...")
            # При жестком выходе не пытаемся выгружать LLM вручную,
            # так как это провоцирует SIGABRT/SIGBUS.
            # os._exit(0) ниже гарантирует, что деструкторы не будут вызваны,
            # а ОС сама безопасно очистит память.

            try:
                DATA_LOOP.shutdown()
            except Exception:
                pass

            time.sleep(0.2)
            try:
                sys.stdout.flush(); sys.stderr.flush()
            except Exception:
                pass
            # os._exit(0) пропускает ВСЕ деструкторы (Python atexit + C++ __cxa_finalize),
            # поэтому ggml_metal_device_free не вызывается вообще → нет SIGBUS.
            os._exit(0)

        def sigint_handler(signum, frame):
            force_quit()

        signal.signal(signal.SIGINT, sigint_handler)
        signal.signal(signal.SIGTERM, sigint_handler)

        # --- macOS/Unix: надёжный перехват Ctrl+C ---
        # На macOS главный поток уходит в нативный цикл Cocoa внутри webview.start(),
        # из-за чего питоновский SIGINT-обработчик откладывается до ближайшего UI-события,
        # и приложение «зависает» при Ctrl+C.
        # Решение — self-pipe через signal.set_wakeup_fd: низкоуровневый C-обработчик
        # CPython асинхронно (прямо в момент доставки сигнала, прерывая нативный код
        # Cocoa) записывает номер сигнала в pipe. Отдельный поток читает байт из pipe
        # и сразу делает os._exit(0). Это не зависит ни от состояния главного потока,
        # ни от того, кто и когда успеет выполнить питоновский обработчик.
        if sys.platform != 'win32':
            try:
                _sig_r, _sig_w = os.pipe()
                os.set_blocking(_sig_w, False)
                signal.set_wakeup_fd(_sig_w)

                # Должен быть установлен НЕ-дефолтный обработчик, иначе C-уровневый
                # хендлер CPython не запишет номер сигнала в wakeup-fd.
                def _noop_signal(signum, frame):
                    pass
                signal.signal(signal.SIGINT, _noop_signal)
                signal.signal(signal.SIGTERM, _noop_signal)

                def _signal_reader():
                    try:
                        os.read(_sig_r, 1)
                    except Exception:
                        return
                    # Жёсткий выход, как и в force_quit: os._exit обходит C++/atexit
                    # деструкторы (ggml_metal_device_free) → исключаем SIGBUS.
                    print("\n[System] 🛑 Завершение работы по CTRL+C...")
                    try:
                        sys.stdout.flush(); sys.stderr.flush()
                    except Exception:
                        pass
                    os._exit(0)

                threading.Thread(
                    target=_signal_reader, daemon=True, name="sigint-reader"
                ).start()
            except Exception as _sig_e:
                # Если механизм недоступен — остаёмся на штатном signal.signal-обработчике.
                print(f"[System] Signal watcher unavailable, fallback to default handler: {_sig_e}")


        # Обёртка: используется ПОСЛЕ webview.start(), т.к. pywebview перетирает хендлеры.
        def _wrapped_sigint(signum, frame):
            # Выходим максимально жёстко. Не пытаемся чистить LLM, 
            # так как ручная очистка в обработчике вызывает краш-диалог на macOS.
            # os._exit(0) обходит C++ atexit-деструкторы.
            print("\n[System] 🛑 Завершение работы по CTRL+C...")
            import os as _os
            _os._exit(0)

        if sys.platform == 'win32':
            import ctypes
            from ctypes import wintypes
        
            HandlerRoutine = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.DWORD)
        
            def console_ctrl_handler(ctrl_type):
                if ctrl_type in (0, 2):
                    force_quit()
                return True
            
            _ctrl_handler = HandlerRoutine(console_ctrl_handler)
            ctypes.windll.kernel32.SetConsoleCtrlHandler(_ctrl_handler, True)

        try:
            # 🔒 Вместо uvicorn-сервера — единый asyncio-цикл с in-process ASGI.
            # Инициализация БД идёт в фоне (см. DataLoop._run → _app_startup),
            # окно появляется мгновенно, фронт ждёт /system/startup-status.
            DATA_LOOP.start()
            print("[Main] ✅ In-process data loop started (no network server).")

            # Push-уведомления о внешних изменениях БД (замена WebSocket).
            try:
                from src.core import watcher as _watcher
                _watcher.set_push_hook(push_db_updated)
            except Exception as _wh_e:
                print(f"[Main] Failed to register db-update push hook: {_wh_e}")

            print("[WebView] Creating invisible browser window...")
            _dump_geometry_diagnostics()
        
            # Проверяем, есть ли у нас уже активное хранилище И СУЩЕСТВУЕТ ЛИ ОНО
            from src.core.config import _load_config
            config_data = _load_config()
            active_vault = config_data.get("active_vault")
            is_configured = bool(active_vault and os.path.exists(active_vault))

            # 🔐 Защищённое хранилище при старте всегда заблокировано (ключ сессии
            # живёт только в памяти процесса), поэтому пользователь увидит экран
            # выбора хранилищ. Открываем компактное НЕресайзабельное окно селектора,
            # а не большое окно доски.
            if is_configured:
                try:
                    from src.core import vault_crypto
                    if vault_crypto.is_protected(active_vault):
                        is_configured = False
                        print("[System] 🔐 Active vault is protected — starting with Vault Selector window.")
                except Exception as _vc_e:
                    print(f"[System] Vault protection check failed (non-fatal): {_vc_e}")

            # Задаем параметры в зависимости от того, первый ли это запуск
            if is_configured:
                t_w, t_h, t_x, t_y = get_safe_geometry()
            else:
                t_w, t_h, t_x, t_y = 760, 680, None, None

            start_url = runtime_index_url('board' if is_configured else 'vault')
            start_w = t_w
            start_h = t_h
            if sys.platform == 'win32' and is_configured and t_x is not None:
                _scale = _win32_monitor_dpi_scale(t_x, t_y, t_w, t_h)
                start_w = max(800, round(t_w / _scale))
                start_h = max(600, round(t_h / _scale))
            min_w = 800 if is_configured else 760
            min_h = 600 if is_configured else 680
            is_resizable = is_configured

            window = webview.create_window(
                title=MAIN_WINDOW_TITLE if is_configured else 'Doe — Select Vault',
                url=start_url,
                width=start_w,           
                height=start_h,          
                x=t_x,
                y=t_y,
                min_size=(min_w, min_h), 
                resizable=is_resizable,
                frameless=(sys.platform in ('darwin', 'win32')),
                easy_drag=False,     
                background_color=bg_color, 
                text_select=True,
                hidden=(not sys.platform.startswith('linux')),            
                js_api=WindowAPI()      
            )
            bind_resize_event(window)
            if sys.platform == 'win32' and is_configured and t_x is not None:
                bind_geometry_enforcement(window, (t_x, t_y, t_w, t_h))
        
            try:
                print("[WebView] Starting GUI engine...")
            
                # Перерегистрируем Apple Event handler через 1 секунду после старта GUI,
                # чтобы перекрыть любые попытки AppKit/pywebview восстановить дефолтный
                # handler 'odoc' (который показывает alert "could not be opened").
                if sys.platform == 'darwin':
                    import threading
                    def _reregister_safely():
                        try:
                            from launcher import macos as _macos_mod
                            reg = getattr(_macos_mod, '_doe_reregister_apple_event', None)
                            if reg:
                                reg()
                                print("[System] macOS: AppleEvent handler re-registered after webview start.")
                        except Exception as e:
                            print(f"[System] Re-registration failed: {e}")
                    threading.Timer(1.0, _reregister_safely).start()
                    # И ещё раз через 3 секунды — на случай отложенной инициализации делегата
                    threading.Timer(3.0, _reregister_safely).start()
            
                # КЛЮЧЕВОЙ ФИКС ЗАВИСАНИЯ НА CTRL+C (macOS):
                # pywebview внутри webview.start() зовёт PyObjCTools.AppHelper.installMachInterrupt(),
                # который ставит Mach-обработчик SIGINT = AppHelper.machInterrupt. Тот на Ctrl+C
                # вызывает NSApp().terminate_(), запускающий штатное завершение Cocoa через exit():
                # выгружаются C++/Metal-деструкторы LLM (ggml_metal_device_free) → SIGBUS/зависание.
                # Этот Mach-обработчик перебивает ЛЮБОЙ питоновский signal.signal/set_wakeup_fd.
                #
                # installMachInterrupt() берёт функцию machInterrupt из глобалей модуля AppHelper
                # В МОМЕНТ ВЫЗОВА. Поэтому подменяем её ДО webview.start() — pywebview сам
                # корректно (на главном потоке, через свой Mach-порт) зарегистрирует нашу версию,
                # которая делает мгновенный os._exit(0) в обход NSApp.terminate_().
                if sys.platform == 'darwin':
                    try:
                        from PyObjCTools import AppHelper as _AppHelper

                        def _fast_mach_quit(signum):
                            try:
                                sys.stdout.write("\n[System] 🛑 Завершение работы по CTRL+C...\n")
                                sys.stdout.flush()
                            except Exception:
                                pass
                            _lock_vault_before_exit() # 🔐 шифруем защищённое хранилище
                            # os._exit обходит atexit/C++ __cxa_finalize → нет ggml_metal_device_free → нет SIGBUS.
                            os._exit(0)

                        _AppHelper.machInterrupt = _fast_mach_quit
                        print("[System] macOS: Mach SIGINT handler patched for instant quit.")
                    except Exception as _mach_e:
                        print(f"[System] macOS: failed to patch Mach interrupt: {_mach_e}")

                webview.start(debug=False)
            except KeyboardInterrupt:
                pass
            except Exception as e:
                print("[Main] WebView crashed:")
                traceback.print_exc()
            finally:
                print("[System] Window closed. Shutting down.")
                _lock_vault_before_exit() # 🔐 шифруем защищённое хранилище (идемпотентно)
                try:
                    DATA_LOOP.shutdown()
                except Exception:
                    pass
                print("[System] Data loop stopped. Exiting.")
                try:
                    sys.stdout.flush(); sys.stderr.flush()  # PERF: добиваем буфер лога (os._exit обходит atexit)
                except Exception:
                    pass
                os._exit(0)
            
        except Exception as e:
            print("[Main] FATAL ERROR IN MAIN BLOCK:")
            traceback.print_exc()
            sys.exit(1)
