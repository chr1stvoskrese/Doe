"""macOS-специфика: AppKit-патчи, DnD-перехват, AppleEvent 'odoc', terminate-перехваты."""
import os
import sys
import threading
import traceback

from launcher.bridge import DATA_LOOP
from launcher.vault_exit import _lock_vault_before_exit

_doe_take_dropped_files = None
_doe_reregister_apple_event = None


def init_macos_early():
    """Ранняя инициализация macOS (до создания окон). Вызывается из wrapper."""
    global _doe_take_dropped_files, _doe_reregister_apple_event
    try:
        try:
            import AppKit
            import objc
            import urllib.parse
        
            app = AppKit.NSApplication.sharedApplication()
            app.setActivationPolicy_(0)

            import webview.platforms.cocoa

            # ============================================================
            # 📎 Перехват нативных путей файлов при Drag & Drop.
            #
            # DOM-событие drop в WKWebView не отдаёт JS настоящие пути файлов
            # (только имя и размер). Из-за этого раньше файл приходилось гнать
            # через HTTP-загрузку, что для больших файлов (200 ГБ+) означало
            # медленную двойную запись на диск. Здесь мы подменяем
            # performDragOperation: у WKWebView-подкласса pywebview: до передачи
            # события в WebKit читаем пути из NSPasteboard и складываем их в
            # реестр. JS сразу после drop забирает их через
            # pywebview.api.get_dropped_files() и прикрепляет файлы по нативному
            # пути (мгновенный APFS-клон, как Cmd+C/Cmd+V в Finder).
            # Само DOM-событие продолжает работать как раньше (вызываем super).
            # ============================================================
            try:
                import threading as _dd_threading
                import time as _dd_time

                _doe_drop_registry = {"ts": 0.0, "files": []}
                _doe_drop_lock = _dd_threading.Lock()

                def _doe_store_dropped_paths(paths):
                    files = []
                    for p in paths:
                        try:
                            files.append({
                                "path": p,
                                "name": os.path.basename(p),
                                "size": os.path.getsize(p) if os.path.isfile(p) else -1,
                                "is_dir": os.path.isdir(p),
                            })
                        except Exception:
                            pass
                    with _doe_drop_lock:
                        _doe_drop_registry["ts"] = _dd_time.time()
                        _doe_drop_registry["files"] = files
                    if files:
                        print(f"[DnD] 📎 Captured {len(files)} native path(s) from drop")

                def _doe_take_dropped_files(max_age=15.0):
                    """Отдаёт и очищает пути последнего drop (не старше max_age сек)."""
                    with _doe_drop_lock:
                        ts = _doe_drop_registry["ts"]
                        files = _doe_drop_registry["files"]
                        _doe_drop_registry["files"] = []
                        _doe_drop_registry["ts"] = 0.0
                    if not files or (_dd_time.time() - ts) > max_age:
                        return []
                    return files

                _WebKitHost = webview.platforms.cocoa.BrowserView.WebKitHost

                def _doe_performDragOperation_(self, sender):
                    try:
                        pboard = sender.draggingPasteboard()
                        ns_urls = pboard.readObjectsForClasses_options_(
                            [AppKit.NSURL],
                            {AppKit.NSPasteboardURLReadingFileURLsOnlyKey: True},
                        )
                        paths = []
                        for u in (ns_urls or []):
                            try:
                                p = u.path()
                                if p:
                                    paths.append(str(p))
                            except Exception:
                                pass
                        if paths:
                            _doe_store_dropped_paths(paths)
                    except Exception as e:
                        print(f"[DnD] ⚠️ Failed to read drop pasteboard: {e}")
                    # Обязательно отдаём событие WebKit — DOM-drop работает как раньше.
                    try:
                        return objc.super(_WebKitHost, self).performDragOperation_(sender)
                    except Exception as e:
                        print(f"[DnD] ⚠️ super performDragOperation failed: {e}")
                        return False

                _doe_drag_selector = objc.selector(
                    _doe_performDragOperation_,
                    selector=b'performDragOperation:',
                    signature=b'Z@:@',  # BOOL (self, _cmd, id) — 'Z' как в остальных патчах файла
                )
                objc.classAddMethods(_WebKitHost, [_doe_drag_selector])
                print("[DnD] ✅ Native drop path capture installed on WKWebView.")
            except Exception as e:
                # Некритично: без перехвата DnD откатится на потоковую загрузку.
                print(f"[DnD] ⚠️ Could not install drop path capture: {e}")
                def _doe_take_dropped_files(max_age=15.0):
                    return []

            # Единая логика обработки пути к файлу хранилища.
            # Выделена в отдельную функцию, чтобы её могли вызвать оба селектора macOS:
            # deprecated application:openFile: (старые системы) и
            # современный application:openURLs: (macOS 10.13+, в т.ч. Tahoe).
            def _doe_handle_vault_path(raw_path):
                try:
                    import os
                    import urllib.parse
                    import urllib.request
                    import json as _json
                    import traceback
                
                    clean_path = str(raw_path)  # NSString → Python str (важно для новых pyobjc)
                    if clean_path.startswith("file://"):
                        clean_path = clean_path.replace("file://", "", 1)
                    clean_path = urllib.parse.unquote(clean_path)
                    clean_path = os.path.abspath(clean_path)
                
                    print(f"[System] 📂 macOS openFile event: {clean_path}")
                
                    if not os.path.exists(clean_path):
                        print(f"[System] ⚠️ File does not exist: {clean_path}")
                        return False
                    if not (clean_path.endswith(".doe") or clean_path.endswith(".db.doe")):
                        print(f"[System] ⚠️ File extension not recognized: {clean_path}")
                        return False
                    
                    vault_dir = os.path.dirname(clean_path)
                
                    # 🔒 Без сетевого сервера: AppleEvent приходит В уже запущенный
                    # инстанс (LaunchServices маршрутизирует 'odoc'/openURLs сюда).
                    # Наличие окон == мы работающий инстанс с UI.
                    import webview
                    if webview.windows:
                        # Переключаем vault ПРЯМО в процессе через in-process ASGI
                        # (эндпоинт /vault/switch сам обновит БД, историю и окна).
                        print(f"[System] 🚀 Forwarding vault switch in-process: {vault_dir}")

                        import threading
                        def _fire_switch():
                            try:
                                DATA_LOOP.request(
                                    'POST', '/api/v1/system/vault/switch',
                                    {'content-type': 'application/json'},
                                    _json.dumps({"new_path": vault_dir, "trigger_ui": True}).encode('utf-8'),
                                )
                            except Exception as e:
                                print(f"[System] In-process vault switch failed: {e}")
                                traceback.print_exc()
                        # В фон, чтобы не блокировать AppKit-поток (никаких beach-ball).
                        threading.Thread(target=_fire_switch, daemon=True).start()
                        return True
                    else:
                        # Окон ещё нет — холодный запуск. Просто запоминаем путь,
                        # чтобы init_dev_database() инициализировал нужную БД.
                        from src.core.config import set_active_vault
                        set_active_vault(vault_dir)
                        print(f"[System] 🆕 Cold launch with vault: {vault_dir}")
                        return True
                except Exception as e:
                    print(f"[System] Error in _doe_handle_vault_path: {e}")
                    import traceback
                    traceback.print_exc()
                    return True

            # Deprecated селектор application:openFile: для совместимости со старыми macOS.
            def handle_mac_file_open(self, sender, filename):
                try:
                    return _doe_handle_vault_path(filename)
                except Exception as e:
                    print(f"[System] Error in handle_mac_file_open: {e}")
                    return True

            # Современный селектор application:openURLs: для macOS 10.13+.
            # На свежих системах (включая Tahoe / macOS 26) AppKit отдаёт события
            # открытия файлов именно сюда, а deprecated openFile: может не вызываться.
            def handle_mac_open_urls(self, sender, urls):
                try:
                    for url in urls:
                        # NSURL → строковый путь без префикса file://
                        path = str(url.path()) if hasattr(url, 'path') else str(url)
                        _doe_handle_vault_path(path)
                except Exception as e:
                    print(f"[System] Error in handle_mac_open_urls: {e}")
                    import traceback
                    traceback.print_exc()

            # ОСНОВНОЙ МЕХАНИЗМ: регистрируем handler напрямую на Apple Event 'odoc'.
            # Это работает ВНЕ зависимости от внутренностей pywebview: событие
            # перехватывается ДО того, как AppKit передаст его делегату или
            # NSDocumentController (который и показывает "could not be opened").
            try:
                from Foundation import NSAppleEventManager, NSObject, NSURL
            
                def _fourcc(s):
                    return (ord(s[0]) << 24) | (ord(s[1]) << 16) | (ord(s[2]) << 8) | ord(s[3])
            
                kCoreEventClass = _fourcc('aevt')   # 1701867620
                kAEOpenDocuments = _fourcc('odoc')  # 1868853091
                keyDirectObject = _fourcc('----')   # 757935405
                typeFileURL     = _fourcc('furl')   # 0x6675726C
            
                class DoeOpenDocHandler(NSObject):
                    def handleOpenDoc_withReplyEvent_(self, event, replyEvent):
                        # Этот print должен появляться в логе ПРИ КАЖДОМ клике по .db.doe.
                        # Если его нет — handler не вызывается (т.е. AppKit его не нашёл).
                        print(f"[System] 🎯 AppleEvent 'odoc' INVOKED")
                        try:
                            direct_param = event.paramDescriptorForKeyword_(keyDirectObject)
                            if direct_param is None:
                                print("[System] AppleEvent: no direct object")
                                return
                            count = direct_param.numberOfItems()
                            print(f"[System] AppleEvent: {count} file(s) in event")
                            for i in range(1, count + 1):
                                item = direct_param.descriptorAtIndex_(i)
                                path = None
                            
                                # ПРАВИЛЬНЫЙ способ: через NSURL.URLWithDataRepresentation
                                # (typeFileURL хранит URL в специальном бинарном формате, а не plain text)
                                try:
                                    coerced = item.coerceToDescriptorType_(typeFileURL)
                                    if coerced is not None:
                                        data = coerced.data()
                                        if data is not None:
                                            url = NSURL.URLWithDataRepresentation_relativeToURL_(data, None)
                                            if url is not None:
                                                url_path = url.path()
                                                if url_path is not None:
                                                    path = str(url_path)
                                except Exception as e:
                                    print(f"[System] NSURL coerce failed: {e}")
                            
                                # Fallback: попробовать stringValue (для legacy alias-дескрипторов)
                                if not path:
                                    try:
                                        sv = item.stringValue()
                                        if sv:
                                            path = str(sv)
                                    except Exception:
                                        pass
                            
                                if path:
                                    print(f"[System] AppleEvent extracted path: {path}")
                                    _doe_handle_vault_path(path)
                                else:
                                    print(f"[System] AppleEvent: could NOT extract path from item {i}")
                        except Exception as e:
                            print(f"[System] AppleEvent handler error: {e}")
                            import traceback
                            traceback.print_exc()
                
                    # КРИТИЧНО: явно задаём Objective-C сигнатуру метода.
                    # Без неё pyobjc угадывает и часто ошибается, из-за чего AppleEventManager
                    # регистрирует метод "успешно", но никогда его не вызывает.
                    # 'v@:@@' = void return, self, _cmd, NSAppleEventDescriptor*, NSAppleEventDescriptor*
                    handleOpenDoc_withReplyEvent_ = objc.selector(
                        handleOpenDoc_withReplyEvent_,
                        signature=b'v@:@@'
                    )
            
                # ВАЖНО: handler нужно сохранить в модульной переменной, иначе сборщик мусора
                # уничтожит Objective-C объект и AppKit упадёт при попытке вызвать метод.
                _doe_open_doc_handler = DoeOpenDocHandler.alloc().init()
                globals()['_doe_open_doc_handler'] = _doe_open_doc_handler
            
                def _register_apple_event_handler():
                    """Регистрирует наш handler на 'odoc'. Вынесено в функцию, чтобы можно было
                    перевызвать после старта pywebview — на случай если AppKit/pywebview
                    переинициализирует AppleEventManager при создании NSApp delegate."""
                    NSAppleEventManager.sharedAppleEventManager().setEventHandler_andSelector_forEventClass_andEventID_(
                        _doe_open_doc_handler,
                        b'handleOpenDoc:withReplyEvent:',
                        kCoreEventClass,
                        kAEOpenDocuments,
                    )
            
                _register_apple_event_handler()
                print("[System] macOS: AppleEvent 'odoc' handler registered (primary mechanism).")
            
                # Сохраняем функцию для повторной регистрации через 1 секунду после старта окна.
                # Это страховка: если pywebview/AppKit при инициализации NSApp перезатирают
                # наш handler своим дефолтным (который кидает alert), мы возвращаем своё право.
                _doe_reregister_apple_event = _register_apple_event_handler
            
                # Дополнительная страховка: переопределяем applicationShouldTerminateAfterLastWindowClosed:
                # на NO. По умолчанию AppKit убивает процесс при закрытии последнего окна — это ломает
                # сценарии, когда мы destroy() одно окно и create_window() сразу после: AppKit успевает
                # терминировать процесс ДО создания нового окна. У нас приложение по архитектуре
                # многооконное (Vault Selector ↔ Kanban), поэтому такое поведение нежелательно.
                try:
                    def _should_terminate_after_last_closed(self, sender):
                        return False
                
                    sel_no_terminate = objc.selector(
                        _should_terminate_after_last_closed,
                        selector=b'applicationShouldTerminateAfterLastWindowClosed:',
                        signature=b'Z@:@'
                    )
                
                    # Применяем ко всем найденным AppDelegate-классам (top-level и вложенным)
                    applied_to = []
                    for delegate_name in ['AppDelegate', 'ApplicationDelegate', 'BrowserDelegate']:
                        if hasattr(webview.platforms.cocoa, delegate_name):
                            cls = getattr(webview.platforms.cocoa, delegate_name)
                            try:
                                objc.classAddMethods(cls, [sel_no_terminate])
                                applied_to.append(delegate_name)
                            except Exception:
                                setattr(cls, 'applicationShouldTerminateAfterLastWindowClosed_', sel_no_terminate)
                                applied_to.append(f"{delegate_name}(setattr)")
                
                    if hasattr(webview.platforms.cocoa, 'BrowserView'):
                        bv = webview.platforms.cocoa.BrowserView
                        for nested_name in ['AppDelegate', 'ApplicationDelegate']:
                            if hasattr(bv, nested_name):
                                cls = getattr(bv, nested_name)
                                try:
                                    objc.classAddMethods(cls, [sel_no_terminate])
                                    applied_to.append(f"BrowserView.{nested_name}")
                                except Exception:
                                    setattr(cls, 'applicationShouldTerminateAfterLastWindowClosed_', sel_no_terminate)
                                    applied_to.append(f"BrowserView.{nested_name}(setattr)")
                
                    print(f"[System] applicationShouldTerminateAfterLastWindowClosed → NO registered on: {applied_to}")
                except Exception as e:
                    print(f"[System] terminate-after-last-window override failed (non-fatal): {e}")

                # КРИТИЧНО: переопределяем applicationShouldTerminate: .
                # На macOS Ctrl+C в терминале перехватывается Mach-уровнем PyObjC
                # (installMachInterrupt, который pywebview вызывает в cocoa.py), а НЕ
                # Python'овским signal.signal(). Mach-хендлер зовёт
                # NSApp().terminate_(None) → applicationShouldTerminate: → exit() →
                # C++ __cxa_finalize_ranges → ggml_metal_device_free →
                # GGML_ASSERT([rsets->data count] == 0) → abort (SIGABRT).
                # Стоковый AppDelegate pywebview возвращает YES без очистки Metal.
                # Перехватываем: чистим LLM и выходим через os._exit(0), минуя
                # C++-деструкторы (поэтому ggml_metal_device_free не зовётся вообще).
                try:
                    def _should_terminate(self, sender):
                        # 🔐 Cmd+Q / Quit из меню: выход делегируем ФРОНТЕНДУ —
                        # window.appExit() покажет оверлей шифрования с прогресс-баром
                        # (вместо молчаливого замирания окна) и сам завершит процесс
                        # через force_close. Возвращаем NSTerminateCancel, чтобы AppKit
                        # не убил приложение до окончания шифрования.
                        # ВАЖНО: evaluate_js нельзя звать с главного потока AppKit
                        # (дедлок ожидания результата) — уводим в фоновый поток.
                        import threading as _threading

                        def _delegate_exit_to_js():
                            try:
                                import webview as _wv
                                for w in list(_wv.windows):
                                    try:
                                        res = w.evaluate_js('window.appExit ? (window.appExit(), true) : false')
                                        if res:
                                            print("[System] 🔐 Quit delegated to JS (progress overlay)")
                                            return
                                    except Exception:
                                        continue
                            except Exception:
                                pass
                            # Фолбэк: JS недоступен (окно мертво) — старый путь:
                            # блокирующее шифрование и жёсткий выход.
                            try:
                                _lock_vault_before_exit()
                            except Exception:
                                pass
                            try:
                                DATA_LOOP.shutdown()
                            except Exception:
                                pass
                            import time as _time
                            _time.sleep(0.15)
                            try:
                                sys.stdout.flush(); sys.stderr.flush()
                            except Exception:
                                pass
                            import os as _os
                            _os._exit(0)

                        _threading.Thread(target=_delegate_exit_to_js, daemon=True).start()
                        return 0  # NSTerminateCancel — завершимся сами после шифрования

                    # Возвращаемый тип NSApplicationTerminateReply в разных версиях
                    # macOS/PyObjC кодируется по-разному: I (unsigned int), q (NSInteger),
                    # Q (NSUInteger). Рантайм отвергает несовпадающую сигнатуру
                    # ("I@:@ != q@:@"), поэтому перебираем совместимые варианты.
                    def _apply_terminate_override(cls, label, applied):
                        for sig in (b'I@:@', b'q@:@', b'Q@:@'):
                            sel = objc.selector(
                                _should_terminate,
                                selector=b'applicationShouldTerminate:',
                                signature=sig
                            )
                            try:
                                objc.classAddMethods(cls, [sel])
                                applied.append(f"{label}[{sig.decode()}]")
                                return True
                            except Exception:
                                pass
                            try:
                                setattr(cls, 'applicationShouldTerminate_', sel)
                                applied.append(f"{label}(setattr[{sig.decode()}])")
                                return True
                            except Exception:
                                continue
                        print(f"[System] ⚠️ Could not override applicationShouldTerminate on {label}")
                        return False

                    applied_term = []
                    for delegate_name in ['AppDelegate', 'ApplicationDelegate', 'BrowserDelegate']:
                        if hasattr(webview.platforms.cocoa, delegate_name):
                            _apply_terminate_override(getattr(webview.platforms.cocoa, delegate_name), delegate_name, applied_term)

                    if hasattr(webview.platforms.cocoa, 'BrowserView'):
                        bv = webview.platforms.cocoa.BrowserView
                        for nested_name in ['AppDelegate', 'ApplicationDelegate']:
                            if hasattr(bv, nested_name):
                                _apply_terminate_override(getattr(bv, nested_name), f"BrowserView.{nested_name}", applied_term)

                    print(f"[System] applicationShouldTerminate: → Metal cleanup + os._exit registered on: {applied_term}")
                except Exception as e:
                    print(f"[System] applicationShouldTerminate override failed (non-fatal): {e}")
            
            except Exception as e:
                print(f"[System] AppleEvent registration failed: {e}")
                import traceback
                traceback.print_exc()
        
            # ДОПОЛНИТЕЛЬНЫЙ СЛОЙ (legacy): пытаемся также пропатчить AppDelegate pywebview.
            # В pywebview 4.4.1 AppDelegate — ВЛОЖЕННЫЙ класс внутри BrowserView,
            # поэтому помимо top-level имён ищем его и там. Если не нашли — не страшно,
            # основной механизм через AppleEventManager уже работает.
            delegate_candidates = []
            for delegate_name in ['AppDelegate', 'ApplicationDelegate', 'BrowserDelegate']:
                if hasattr(webview.platforms.cocoa, delegate_name):
                    delegate_candidates.append((delegate_name, getattr(webview.platforms.cocoa, delegate_name)))
            # pywebview 4.4.1: AppDelegate внутри BrowserView
            if hasattr(webview.platforms.cocoa, 'BrowserView'):
                bv = webview.platforms.cocoa.BrowserView
                for nested_name in ['AppDelegate', 'ApplicationDelegate']:
                    if hasattr(bv, nested_name):
                        delegate_candidates.append((f'BrowserView.{nested_name}', getattr(bv, nested_name)))
        
            for delegate_name, cls in delegate_candidates:
                try:
                    sel_file = objc.selector(
                        handle_mac_file_open,
                        selector=b'application:openFile:',
                        signature=b'Z@:@@'
                    )
                    sel_urls = objc.selector(
                        handle_mac_open_urls,
                        selector=b'application:openURLs:',
                        signature=b'v@:@@'
                    )
                    try:
                        objc.classAddMethods(cls, [sel_file, sel_urls])
                        print(f"[System] macOS {delegate_name}: openFile + openURLs registered via classAddMethods.")
                    except Exception as e:
                        setattr(cls, 'application_openFile_', sel_file)
                        setattr(cls, 'application_openURLs_', sel_urls)
                        print(f"[System] macOS {delegate_name}: fallback setattr ({e}).")
                except Exception as e:
                    print(f"[System] Delegate patching failed for {delegate_name}: {e}")
        
            if not delegate_candidates:
                print("[System] No AppDelegate classes found in pywebview (using AppleEvent fallback only).")

            # МЕНЯЕМ ИКОНКУ КОДОМ ТОЛЬКО В РЕЖИМЕ РАЗРАБОТКИ
            # В собранном .app это не нужно и вызывает "прыжок" размера
            if not getattr(sys, 'frozen', False):
                if getattr(sys, 'frozen', False):
                    current_bundle_dir = sys._MEIPASS
                else:
                    current_bundle_dir = os.path.dirname(os.path.abspath(__file__))
            
                icon_p = os.path.join(current_bundle_dir, "doe.png")

                if os.path.exists(icon_p):
                    original_image = AppKit.NSImage.alloc().initWithContentsOfFile_(icon_p)
                    if original_image:
                        target_size = AppKit.NSMakeSize(512, 512)
                        padding_factor = 0.82 
                        new_size = AppKit.NSMakeSize(target_size.width * padding_factor, target_size.height * padding_factor)
                    
                        canvas = AppKit.NSImage.alloc().initWithSize_(target_size)
                        canvas.lockFocus()
                        rect = AppKit.NSMakeRect(
                            (target_size.width - new_size.width) / 2,
                            (target_size.height - new_size.height) / 2,
                            new_size.width,
                            new_size.height
                        )
                        original_image.drawInRect_(rect)
                        canvas.unlockFocus()
                        app.setApplicationIconImage_(canvas)

            app.activateIgnoringOtherApps_(True)
            print("[System] macOS App Policy initialized.")
        except Exception as e:
            print(f"[System] macOS Early Fix failed: {e}")

            # МЕНЯЕМ ИКОНКУ КОДОМ ТОЛЬКО В РЕЖИМЕ РАЗРАБОТКИ
            # В собранном .app это не нужно и вызывает "прыжок" размера
            if not getattr(sys, 'frozen', False):
                if getattr(sys, 'frozen', False):
                    current_bundle_dir = sys._MEIPASS
                else:
                    current_bundle_dir = os.path.dirname(os.path.abspath(__file__))
            
                icon_p = os.path.join(current_bundle_dir, "doe.png")

                if os.path.exists(icon_p):
                    original_image = AppKit.NSImage.alloc().initWithContentsOfFile_(icon_p)
                    if original_image:
                        target_size = AppKit.NSMakeSize(512, 512)
                        padding_factor = 0.82 
                        new_size = AppKit.NSMakeSize(target_size.width * padding_factor, target_size.height * padding_factor)
                    
                        canvas = AppKit.NSImage.alloc().initWithSize_(target_size)
                        canvas.lockFocus()
                        rect = AppKit.NSMakeRect(
                            (target_size.width - new_size.width) / 2,
                            (target_size.height - new_size.height) / 2,
                            new_size.width,
                            new_size.height
                        )
                        original_image.drawInRect_(rect)
                        canvas.unlockFocus()
                        app.setApplicationIconImage_(canvas)

            app.activateIgnoringOtherApps_(True)
            print("[System] macOS App Policy initialized.")
    except Exception as e:
        print(f"[System] macOS Early Fix failed: {e}")
