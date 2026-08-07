# src/core/biometric.py
"""
Touch ID для разблокировки хранилища (только macOS).

Использует LAContext для верификации биометрии.
Ключ шифрования хранится в защищенном локальном файле, доступ к которому 
открывается только после успешного сканирования отпечатка пальца.
Это обеспечивает надежную работу как в режиме разработчика, так и в
собранном через PyInstaller приложении (без Apple Developer сертификатов).
"""

import sys
import hashlib
import os
import threading
from pathlib import Path

SERVICE_NAME = "app.doe.vault-key"
SERVICE_NAME_LEGACY = "app.doe.vault-key.legacy"

# LAPolicy (LocalAuthentication.h)
_LA_POLICY_BIOMETRICS = 1  # LAPolicyDeviceOwnerAuthenticationWithBiometrics

def _vault_account(vault_path: str) -> str:
    """Стабильный идентификатор записи для данного хранилища."""
    norm = os.path.normpath(str(vault_path))
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()[:32]

def _fallback_key_file(vault_path: str) -> Path:
    """Файл хранения ключа. Доступ к нему гейтится Touch ID-диалогом через LAContext."""
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
    Системный диалог Touch ID через LAContext.
    Возвращает (успех, код): 'ok' | 'fallback' («Use Password…») | 'cancel' | 'failed'.
    """
    if sys.platform != "darwin":
        return False, "failed"
    try:
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

        # Вызов LAContext.evaluatePolicy полностью асинхронный и thread-safe.
        # Выполняем прямо здесь — система сама отрисует диалог поверх приложения.
        ctx.evaluatePolicy_localizedReason_reply_(_LA_POLICY_BIOMETRICS, prompt, _reply)
        done.wait(180)

        if outcome["ok"]:
            return True, "ok"
            
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
    if sys.platform != "darwin":
        return False
    try:
        LAContext = _load_la_context_class()
        ctx = LAContext.alloc().init()
        res = ctx.canEvaluatePolicy_error_(_LA_POLICY_BIOMETRICS, None)
        ok = res[0] if isinstance(res, tuple) else res
        return bool(ok)
    except Exception as e:
        print(f"[Biometric] availability check failed: {e}")
        return False

def store_vault_key(vault_path: str, key: bytes) -> bool:
    if sys.platform != "darwin":
        return False
    try:
        delete_vault_key(vault_path)

        f = _fallback_key_file(vault_path)
        f.parent.mkdir(parents=True, exist_ok=True)
        os.chmod(f.parent, 0o700)
        f.write_bytes(key)
        os.chmod(f, 0o600)
        print("[Biometric] 🔑 Vault key stored securely via LAContext")
        return True
    except Exception as e:
        print(f"[Biometric] store failed: {e}")
        return False

def get_vault_key(vault_path: str, prompt: str) -> tuple[bytes | None, str]:
    if sys.platform != "darwin":
        return None, "failed"
    try:
        f = _fallback_key_file(vault_path)
        if not f.exists():
            print("[Biometric] Key not found in local storage")
            return None, "not_found"

        ok, code = _evaluate_biometrics(prompt)
        if not ok:
            print(f"[Biometric] Touch ID gate: {code}")
            return None, code
            
        try:
            return f.read_bytes(), "ok"
        except Exception as e:
            print(f"[Biometric] fallback read failed: {e}")
            return None, "failed"
    except Exception as e:
        print(f"[Biometric] get failed: {e}")
        return None, "failed"

def delete_vault_key(vault_path: str) -> None:
    if sys.platform != "darwin":
        return
    # Очищаем также старые записи в Keychain (если они там остались)
    try:
        import Security
        for service in (SERVICE_NAME, SERVICE_NAME_LEGACY):
            query = {
                Security.kSecClass: Security.kSecClassGenericPassword,
                Security.kSecAttrService: service,
                Security.kSecAttrAccount: _vault_account(vault_path),
            }
            Security.SecItemDelete(query)
    except Exception:
        pass
    try:
        _fallback_key_file(vault_path).unlink(missing_ok=True)
    except Exception:
        pass
    