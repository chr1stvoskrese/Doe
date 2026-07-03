# src/core/biometric.py
"""
Touch ID для разблокировки хранилища (только macOS).

Модель безопасности:
- ПАРОЛЬ по-прежнему нигде не хранится.
- В системном Keychain хранится КЛЮЧ ШИФРОВАНИЯ хранилища, защищённый
  Secure Enclave с политикой kSecAccessControlBiometryCurrentSet:
  ключ выдаётся ТОЛЬКО после успешного сканирования отпечатка,
  зарегистрированного на момент включения функции. Если набор отпечатков
  в системе меняется — запись автоматически инвалидируется, вход остаётся
  доступен по паролю.
- Функция строго опциональна и включается пользователем в настройках.

Зависимости: pyobjc-core + pyobjc-framework-Security (уже приходят с pywebview
на macOS). LAContext берём напрямую из системного фреймворка через loadBundle,
отдельный пакет LocalAuthentication не нужен.
"""

import sys
import hashlib

SERVICE_NAME = "app.doe.vault-key"
# Старый dev-фолбэк (запись login keychain) — оставлен только для удаления:
# чтение таких записей неподписанным процессом вызывает назойливый системный
# диалог "wants to use your confidential information" при каждом сканировании.
SERVICE_NAME_LEGACY = "app.doe.vault-key.legacy"

# LAPolicy (LocalAuthentication.h)
_LA_POLICY_BIOMETRICS = 1  # LAPolicyDeviceOwnerAuthenticationWithBiometrics

# errSecMissingEntitlement: биометрический ACL доступен только подписанным .app
_ERR_MISSING_ENTITLEMENT = -34018
_ERR_ITEM_NOT_FOUND = -25300


def _vault_account(vault_path: str) -> str:
    """Стабильный идентификатор записи Keychain для данного хранилища."""
    import os
    norm = os.path.normpath(str(vault_path))
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()[:32]


def _fallback_key_file(vault_path: str):
    """
    Файл dev-фолбэка (неподписанная сборка): ключ лежит в Application Support
    с правами 0600, выдача гейтится Touch ID-диалогом через LAContext.
    В отличие от legacy-записи login keychain НЕ вызывает системный диалог
    "wants to use your confidential information" при каждом чтении.
    Подписанная сборка этот файл не использует (Secure Enclave ACL).
    """
    from pathlib import Path
    return Path.home() / "Library" / "Application Support" / "Doe" / "touchid" / f"{_vault_account(vault_path)}.key"


def _load_la_context_class():
    """LAContext без пакета pyobjc-framework-LocalAuthentication."""
    import objc
    try:
        return objc.lookUpClass("LAContext")
    except Exception:
        pass
    objc.loadBundle(
        "LocalAuthentication",
        globals(),
        bundle_path="/System/Library/Frameworks/LocalAuthentication.framework",
    )
    import objc as _objc
    return _objc.lookUpClass("LAContext")


_metadata_registered = False

def _register_la_metadata():
    """
    Метаданные для evaluatePolicy:localizedReason:reply: (метод принимает
    ObjC-блок). Без пакета pyobjc-framework-LocalAuthentication PyObjC не знает
    сигнатуру блока — регистрируем её вручную, чтобы передавать Python-колбэк.
    """
    global _metadata_registered
    if _metadata_registered:
        return
    import objc
    objc.registerMetaDataForSelector(
        b"LAContext",
        b"evaluatePolicy:localizedReason:reply:",
        dict(arguments={
            4: dict(type=b"@?", callable=dict(
                retval=dict(type=b"v"),
                arguments={
                    0: dict(type=b"^v"),  # сам блок
                    1: dict(type=b"Z"),   # BOOL success
                    2: dict(type=b"@"),   # NSError*
                },
            ))
        }),
    )
    _metadata_registered = True


def _evaluate_biometrics(prompt: str) -> tuple[bool, str]:
    """
    Системный диалог Touch ID через LAContext. Блокирует до ответа.
    Возвращает (успех, код): 'ok' | 'fallback' (нажата «Use Password…») |
    'cancel' (отмена) | 'failed' (отпечаток не совпал / блокировка).
    """
    if sys.platform != "darwin":
        return False, "failed"
    try:
        import threading
        _register_la_metadata()
        LAContext = _load_la_context_class()
        ctx = LAContext.alloc().init()
        res = ctx.canEvaluatePolicy_error_(_LA_POLICY_BIOMETRICS, None)
        ok = res[0] if isinstance(res, tuple) else res
        if not ok:
            return False, "failed"

        done = threading.Event()
        outcome = {"ok": False, "code": None}

        def _reply(success, error):
            outcome["ok"] = bool(success)
            try:
                outcome["code"] = int(error.code()) if (not success and error is not None) else None
            except Exception:
                outcome["code"] = None
            done.set()

        ctx.evaluatePolicy_localizedReason_reply_(_LA_POLICY_BIOMETRICS, prompt, _reply)
        done.wait(180)

        if outcome["ok"]:
            return True, "ok"
        # LAError: -2 userCancel, -3 userFallback («Use Password…»),
        # -4 systemCancel, -9 appCancel
        code = outcome["code"]
        if code == -3:
            return False, "fallback"
        if code in (-2, -4, -9):
            return False, "cancel"
        return False, "failed"
    except Exception as e:
        print(f"[Biometric] evaluate failed: {e}")
        return False, "failed"


def is_available() -> bool:
    """Есть ли на устройстве настроенная биометрия (Touch ID)."""
    if sys.platform != "darwin":
        return False
    try:
        LAContext = _load_la_context_class()
        ctx = LAContext.alloc().init()
        # PyObjC с метаданными фреймворка возвращает (bool, error),
        # без них (loadBundle) — просто bool. Поддерживаем обе формы.
        res = ctx.canEvaluatePolicy_error_(_LA_POLICY_BIOMETRICS, None)
        ok = res[0] if isinstance(res, tuple) else res
        return bool(ok)
    except Exception as e:
        print(f"[Biometric] availability check failed: {e}")
        return False


def store_vault_key(vault_path: str, key: bytes) -> bool:
    """
    Кладёт ключ шифрования в Keychain под защитой биометрии.
    Перезаписывает существующую запись (delete + add).
    """
    if sys.platform != "darwin":
        return False
    try:
        import Security
        from Foundation import NSData

        delete_vault_key(vault_path)

        result = Security.SecAccessControlCreateWithFlags(
            None,
            Security.kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            Security.kSecAccessControlBiometryCurrentSet,
            None,
        )
        # pyobjc может вернуть (ref, error) или просто ref
        access = result[0] if isinstance(result, tuple) else result
        if access is None:
            print("[Biometric] SecAccessControlCreateWithFlags failed")
            return False

        data = NSData.dataWithBytes_length_(key, len(key))
        attrs = {
            Security.kSecClass: Security.kSecClassGenericPassword,
            Security.kSecAttrService: SERVICE_NAME,
            Security.kSecAttrAccount: _vault_account(vault_path),
            Security.kSecValueData: data,
            Security.kSecAttrAccessControl: access,
        }
        status = Security.SecItemAdd(attrs, None)
        if isinstance(status, tuple):
            status = status[0]
        if status == 0:
            print("[Biometric] 🔑 Vault key stored in Keychain (Secure Enclave ACL)")
            return True

        if status == _ERR_MISSING_ENTITLEMENT:
            # Неподписанная сборка (dev-запуск из терминала): биометрический ACL
            # недоступен. Фолбэк — файл 0600 в Application Support; Touch ID-диалог
            # перед выдачей ключа выполняет само приложение (LAContext).
            # Файл (а не login keychain) — чтобы macOS не показывал диалог
            # "wants to use your confidential information" при каждом скане.
            import os as _os
            f = _fallback_key_file(vault_path)
            f.parent.mkdir(parents=True, exist_ok=True)
            _os.chmod(f.parent, 0o700)
            f.write_bytes(key)
            _os.chmod(f, 0o600)
            print("[Biometric] 🔑 Vault key stored in app-gated file (dev fallback)")
            return True

        print(f"[Biometric] SecItemAdd failed: {status}")
        return False
    except Exception as e:
        print(f"[Biometric] store failed: {e}")
        return False


def get_vault_key(vault_path: str, prompt: str) -> tuple[bytes | None, str]:
    """
    Достаёт ключ из Keychain. БЛОКИРУЕТ поток до ответа системы:
    macOS сам показывает диалог Touch ID (текст prompt).
    Возвращает (ключ, код): код — 'ok' | 'fallback' («Use Password…») |
    'cancel' | 'failed' | 'not_found'.
    """
    if sys.platform != "darwin":
        return None, "failed"
    try:
        import Security

        account = _vault_account(vault_path)

        # 1. Запись с биометрическим ACL (подписанная сборка):
        #    системный Touch ID-диалог показывает сам Keychain.
        query = {
            Security.kSecClass: Security.kSecClassGenericPassword,
            Security.kSecAttrService: SERVICE_NAME,
            Security.kSecAttrAccount: account,
            Security.kSecReturnData: True,
            Security.kSecUseOperationPrompt: prompt,
        }
        status, data = Security.SecItemCopyMatching(query, None)
        if status == 0 and data is not None:
            return bytes(data), "ok"
        if status == -128:  # errSecUserCanceled
            return None, "cancel"

        # 2. Файл dev-фолбэка: сначала подтверждаем отпечаток сами (LAContext),
        #    только затем читаем ключ. Без обращения к login keychain —
        #    значит без системного диалога "wants to use your confidential
        #    information" при каждом сканировании.
        f = _fallback_key_file(vault_path)
        if f.exists():
            ok, code = _evaluate_biometrics(prompt)
            if not ok:
                print(f"[Biometric] Touch ID gate: {code}")
                return None, code
            try:
                return f.read_bytes(), "ok"
            except Exception as e:
                print(f"[Biometric] fallback read failed: {e}")
                return None, "failed"

        print(f"[Biometric] SecItemCopyMatching status: {status}, no fallback file")
        return None, "not_found"
    except Exception as e:
        print(f"[Biometric] get failed: {e}")
        return None, "failed"


def delete_vault_key(vault_path: str) -> None:
    if sys.platform != "darwin":
        return
    try:
        import Security

        # Удаление записей keychain НЕ вызывает диалогов доступа.
        # SERVICE_NAME_LEGACY чистим для миграции со старого dev-фолбэка.
        for service in (SERVICE_NAME, SERVICE_NAME_LEGACY):
            query = {
                Security.kSecClass: Security.kSecClassGenericPassword,
                Security.kSecAttrService: service,
                Security.kSecAttrAccount: _vault_account(vault_path),
            }
            Security.SecItemDelete(query)
    except Exception as e:
        print(f"[Biometric] delete failed: {e}")
    try:
        _fallback_key_file(vault_path).unlink(missing_ok=True)
    except Exception:
        pass
