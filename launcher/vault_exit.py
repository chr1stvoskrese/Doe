"""Шифрование защищённого хранилища перед выходом."""
from launcher.bridge import DATA_LOOP


# ============================================================
#  🔐 Шифрование защищённого хранилища перед выходом из процесса
# ============================================================
_vault_exit_lock_done = False

def _lock_vault_before_exit():
    """
    Штатное завершение приложения: закрываем БД и шифруем защищённое хранилище.

    Делаем это через эндпоинт /vault/lock, но БЕЗ сети — вызываем его на том же
    asyncio-цикле (DATA_LOOP), где живёт БД, чтобы корректно закрыть SQLite
    (WAL checkpoint) перед шифрованием. Вызов идемпотентен (страхуемся флагом)
    и безопасен: если пароль не установлен или ключа сессии нет — no-op.

    При аварийном завершении (kill -9, краш) этот код не выполняется —
    шифрование не происходит (осознанное поведение: данные не теряются,
    а пароль при следующем входе всё равно будет запрошен).
    """
    global _vault_exit_lock_done
    if _vault_exit_lock_done:
        return
    _vault_exit_lock_done = True
    try:
        from src.core.config import get_active_vault
        from src.core import vault_crypto
        vault = get_active_vault()
        if not vault or not vault_crypto.is_protected(vault):
            return
        if vault_crypto.get_session_key(vault) is None:
            return

        print("[Security] 🔒 Locking protected vault before exit...")
        resp = DATA_LOOP.request(
            "POST", "/api/v1/system/vault/lock",
            {"content-type": "application/json"}, b"{}",
        )
        print(f"[Security] ✅ Vault locked on exit (status {resp.status_code})")
    except Exception as e:
        # Не блокируем выход: в худшем случае файлы останутся расшифрованными,
        # но пароль при следующем входе будет запрошен в любом случае.
        print(f"[Security] ⚠️ Lock on exit failed: {e}")


