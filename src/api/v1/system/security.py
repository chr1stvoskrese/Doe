from fastapi import APIRouter, HTTPException, status
from pathlib import Path
from typing import Optional

import anyio

from src.core.config import get_active_vault, get_ui_settings
from src.db.database import lock_active_vault
from src.core import vault_crypto, fs_store
from src.schemas.system import (
    VaultUnlockRequest, VaultPasswordSetRequest, VaultPasswordRemoveRequest,
    VaultPathRequest, TouchIdToggleRequest,
)

router = APIRouter(tags=["security"])


@router.get("/vault/security/status")
async def vault_security_status(path: Optional[str] = None):
    """Статус защиты: для активного хранилища или по явному пути."""
    from src.core import biometric
    target = path or get_active_vault()
    if not target or not Path(target).exists():
        return {"protected": False, "unlocked": False, "path": target}
    protected = vault_crypto.is_protected(target)
    touchid_available = biometric.is_available()
    return {
        "protected": protected,
        "unlocked": protected and vault_crypto.get_session_key(target) is not None,
        "path": target,
        "global_attachments": bool(get_ui_settings().get("global_attachments_path")),
        "touchid_available": touchid_available,
        "touchid_enabled": protected and touchid_available and vault_crypto.is_touchid_enabled(target),
    }


@router.get("/vault/security/progress")
async def vault_security_progress():
    """
    Текущий прогресс шифрования/расшифровки для progress bar'ов.
    Операции выполняются в отдельном потоке, поэтому этот эндпоинт
    отвечает мгновенно даже во время длительного lock/unlock.
    """
    return vault_crypto.get_progress()


@router.post("/vault/unlock")
async def unlock_vault_endpoint(req: VaultUnlockRequest):
    """
    Вход в защищённое хранилище: сравнение ХЭША пароля, расшифровка файлов,
    сохранение ключа сессии (только в памяти). Сам пароль никуда не пишется.
    """
    vault_dir = Path(req.path)
    if not vault_dir.exists() or not vault_dir.is_dir():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="INVALID_VAULT")
    if not vault_crypto.is_protected(req.path):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="NOT_PROTECTED")

    if not vault_crypto.verify_password(req.path, req.password):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="WRONG_PASSWORD")

    key = vault_crypto.derive_encryption_key(req.path, req.password)
    if key is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="KEY_DERIVATION_FAILED")

    result = {"decrypted": 0, "errors": []}
    if vault_crypto.has_locked_files(req.path):
        result = await anyio.to_thread.run_sync(vault_crypto.unlock_vault, req.path, key)
        # Если не расшифровался НИ ОДИН файл при их наличии — что-то не так, ключ не сохраняем
        if result["decrypted"] == 0 and result["errors"]:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="DECRYPT_FAILED")
        # Файл БД обязан восстановиться — иначе открывать хранилище нельзя.
        # (Имена контейнеров случайные, поэтому проверяем результат, а не имя.)
        has_db_now = any(
            f.is_file() and f.name.endswith(".db.doe") and "backup" not in f.name and not f.name.startswith("._")
            for f in vault_dir.iterdir()
        )
        if not has_db_now:
            has_db_now = fs_store.has_board_marker(str(vault_dir))

        if not has_db_now:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="DECRYPT_FAILED")

    vault_crypto.set_session_key(req.path, key)
    return {"success": True, **result}


@router.post("/vault/unlock-biometric")
async def unlock_vault_biometric_endpoint(req: VaultPathRequest):
    """
    Вход по Touch ID (macOS): ключ шифрования достаётся из Keychain,
    macOS сам показывает системный диалог сканирования отпечатка.
    Пароль в этом процессе не участвует и по-прежнему нигде не хранится.
    """
    from src.core import biometric

    target = req.path
    if not target:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="NO_PATH")
    vault_dir = Path(target)
    if not vault_dir.exists() or not vault_dir.is_dir():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="INVALID_VAULT")
    if not vault_crypto.is_protected(target) or not vault_crypto.is_touchid_enabled(target):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="TOUCHID_NOT_ENABLED")
    if not biometric.is_available():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="BIOMETRIC_UNAVAILABLE")

    lang = get_ui_settings().get("language", "ru")
    prompt = ("разблокировать хранилище «%s»" if lang == "ru" else "unlock vault “%s”") % vault_dir.name

    # Блокирующий системный диалог Touch ID — уводим в поток
    key, code = await anyio.to_thread.run_sync(biometric.get_vault_key, target, prompt)
    if key is None:
        # Разные исходы — разная реакция фронтенда:
        # USE_PASSWORD — пользователь выбрал ввод пароля (не ошибка),
        # CANCELED — отменил (не ошибка), BIOMETRIC_FAILED — отпечаток не подтверждён.
        detail = {"fallback": "USE_PASSWORD", "cancel": "CANCELED"}.get(code, "BIOMETRIC_FAILED")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)

    # Ключ мог устареть (пароль сменили без обновления Keychain) — сверяем key_check
    if not vault_crypto.verify_key(target, key):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="KEY_STALE")

    result = {"decrypted": 0, "errors": []}
    if vault_crypto.has_locked_files(target):
        result = await anyio.to_thread.run_sync(vault_crypto.unlock_vault, target, key)
        if result["decrypted"] == 0 and result["errors"]:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="DECRYPT_FAILED")
        has_db_now = any(
            f.is_file() and f.name.endswith(".db.doe") and "backup" not in f.name and not f.name.startswith("._")
            for f in vault_dir.iterdir()
        )
        if not has_db_now:
            has_db_now = fs_store.has_board_marker(str(vault_dir))

        if not has_db_now:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="DECRYPT_FAILED")

    vault_crypto.set_session_key(target, key)
    return {"success": True, **result}


@router.post("/vault/security/touchid")
async def toggle_touchid_endpoint(req: TouchIdToggleRequest):
    """
    Включение/выключение Touch ID для АКТИВНОГО (открытого) хранилища.
    При включении текущий ключ сессии сохраняется в Keychain под защитой
    биометрии (Secure Enclave, политика BiometryCurrentSet).
    """
    from src.core import biometric

    vault_path = get_active_vault()
    if not vault_path or not Path(vault_path).exists():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="NO_ACTIVE_VAULT")
    if not vault_crypto.is_protected(vault_path):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="NOT_PROTECTED")

    if req.enabled:
        if not biometric.is_available():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="BIOMETRIC_UNAVAILABLE")
        key = vault_crypto.get_session_key(vault_path)
        if key is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="VAULT_LOCKED")
        ok = await anyio.to_thread.run_sync(biometric.store_vault_key, vault_path, key)
        if not ok:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="KEYCHAIN_FAILED")
        vault_crypto.set_touchid_enabled(vault_path, True, key)
    else:
        await anyio.to_thread.run_sync(biometric.delete_vault_key, vault_path)
        vault_crypto.set_touchid_enabled(vault_path, False)

    return {"success": True, "touchid_enabled": req.enabled}


@router.post("/vault/lock")
async def lock_vault_endpoint():
    """
    Выход из активного хранилища: закрытие БД, шифрование всех файлов,
    сброс ключа сессии. Вызывается при выходе на экран выбора хранилищ
    и при штатном закрытии приложения.
    """
    result = await lock_active_vault()
    return {"success": True, **result}


@router.post("/vault/security/set")
async def set_vault_password_endpoint(req: VaultPasswordSetRequest):
    """Установка или смена пароля активного хранилища."""
    vault_path = get_active_vault()
    if not vault_path or not Path(vault_path).exists():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="NO_ACTIVE_VAULT")

    if len(req.password or "") < 4:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PASSWORD_TOO_SHORT")

    # 🛡 ЗАЩИТА ОТ ПОТЕРИ ДАННЫХ: если в хранилище остались нерасшифрованные
    # контейнеры (например, после сбоя), смена пароля перезапишет kdf_salt —
    # и старый ключ станет НЕВЫВОДИМЫМ, эти файлы будут потеряны навсегда.
    # Сначала нужно расшифровать всё (обычный вход по паролю).
    if vault_crypto.is_protected(vault_path) and vault_crypto.has_locked_files(vault_path):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="LEFTOVER_LOCKED_FILES")

    # Смена пароля: сначала сравниваем хэш старого
    if vault_crypto.is_protected(vault_path):
        if not req.old_password or not vault_crypto.verify_password(vault_path, req.old_password):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="WRONG_PASSWORD")

    new_key = await anyio.to_thread.run_sync(vault_crypto.set_password, vault_path, req.password)

    # Если для хранилища включён Touch ID — кладём в Keychain СВЕЖИЙ ключ,
    # иначе после смены пароля отпечаток перестал бы подходить (key_check).
    if vault_crypto.is_touchid_enabled(vault_path):
        from src.core import biometric
        if biometric.is_available():
            ok = await anyio.to_thread.run_sync(biometric.store_vault_key, vault_path, new_key)
            if not ok:
                vault_crypto.set_touchid_enabled(vault_path, False)
        else:
            vault_crypto.set_touchid_enabled(vault_path, False)

    return {"success": True, "protected": True}


@router.post("/vault/security/remove")
async def remove_vault_password_endpoint(req: VaultPasswordRemoveRequest):
    """Снятие защиты с активного хранилища (требует текущий пароль)."""
    vault_path = get_active_vault()
    if not vault_path or not Path(vault_path).exists():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="NO_ACTIVE_VAULT")
    if not vault_crypto.is_protected(vault_path):
        return {"success": True, "protected": False}

    if not vault_crypto.verify_password(vault_path, req.password):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="WRONG_PASSWORD")

    # На всякий случай: если где-то остались зашифрованные файлы — расшифровываем
    if vault_crypto.has_locked_files(vault_path):
        key = vault_crypto.derive_encryption_key(vault_path, req.password)
        if key:
            await anyio.to_thread.run_sync(vault_crypto.unlock_vault, vault_path, key)

    # 🛡 ЗАЩИТА ОТ ПОТЕРИ ДАННЫХ: метафайл содержит kdf_salt — единственный
    # способ вывести ключ из пароля. Если какие-то контейнеры так и не
    # расшифровались, удалять метафайл НЕЛЬЗЯ — они станут нечитаемыми навсегда.
    if vault_crypto.has_locked_files(vault_path):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="LEFTOVER_LOCKED_FILES")

    # Подчищаем ключ из Keychain (если Touch ID был включён)
    try:
        from src.core import biometric
        await anyio.to_thread.run_sync(biometric.delete_vault_key, vault_path)
    except Exception:
        pass

    vault_crypto.remove_protection(vault_path)
    return {"success": True, "protected": False}
