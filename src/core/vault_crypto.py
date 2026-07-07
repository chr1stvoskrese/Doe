# src/core/vault_crypto.py
"""
Защита хранилища паролем.

Принципы:
- Сам пароль НИГДЕ не хранится. В метафайле хранилища лежит только
  соль + scrypt-хэш для ПРОВЕРКИ пароля (сравнение хэшей).
- Ключ шифрования (AES-256) выводится из пароля через scrypt с отдельной солью
  и живёт ТОЛЬКО в оперативной памяти на время открытой сессии хранилища.
- При выходе из хранилища (переход на экран выбора / штатное закрытие приложения)
  всё содержимое папки хранилища шифруется пофайлово (AES-256-GCM).
- При входе — пароль проверяется по хэшу, файлы расшифровываются.
- При аварийном завершении шифрование не выполняется (файлы остаются как есть),
  но пароль при следующем входе всё равно требуется, пока установлена защита.

Формат зашифрованного файла (<имя>.doelock):
  MAGIC (6 байт) | nonce_prefix (8 байт) | чанки...
  Чанк: длина ciphertext (4 байта BE) | ciphertext (AES-GCM, тег включён)
  Nonce чанка = nonce_prefix + счётчик (4 байта BE).
  AAD чанка = struct(">QB", индекс, флаг_последнего) — защита от перестановки
  и усечения чанков.
"""

import os
import json
import hmac
import struct
import secrets
import threading
from pathlib import Path

from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

META_FILENAME = ".doe.vault"
ENC_SUFFIX = ".doelock"
MAGIC = b"DOEV1\x00"   # v1 (legacy): имя контейнера = <оригинал>.doelock
MAGIC2 = b"DOEV2\x00"  # v2: имя контейнера случайное, оригинальный путь зашифрован внутри
CHUNK_SIZE = 4 * 1024 * 1024  # 4 MiB
GCM_TAG_SIZE = 16
NONCE_PREFIX_SIZE = 8

# Спец-индекс nonce для заголовка с путём (не пересекается с индексами данных 0..N)
PATH_CHUNK_INDEX = 0xFFFFFFFF
PATH_AAD = b"DOEPATH"

# scrypt: ~32 МБ памяти, доли секунды на современном железе
_SCRYPT_N = 2 ** 15
_SCRYPT_R = 8
_SCRYPT_P = 1
_KEY_LEN = 32

# Файлы, которые никогда не шифруем:
#  - метафайл защиты (нужен для проверки пароля)
#  - уже зашифрованные файлы
#  - активный лог приложения (держится открытым процессом до самого выхода)
#  - мусор Finder
_SKIP_NAMES = {META_FILENAME, ".DS_Store"}
_SKIP_SUFFIXES = (ENC_SUFFIX, ".log.doe.txt")


# ============================================================
#  Прогресс операций (для progress bar'ов на фронтенде)
# ============================================================
# Пишется из рабочего потока, читается из event loop'а — простые атомарные
# присваивания под GIL, отдельная блокировка чтению не нужна.
_progress = {"active": False, "op": None, "done": 0, "total": 0, "path": None}

# Защита от параллельного шифрования/расшифровки одного и того же хранилища
# (например, повторный клик по кнопке закрытия во время идущего lock'а).
_op_lock = threading.Lock()


def get_progress() -> dict:
    return dict(_progress)


def _progress_start(op: str, total: int, path: str) -> None:
    _progress.update({"active": True, "op": op, "done": 0, "total": total, "path": path})


def _progress_step() -> None:
    _progress["done"] = _progress["done"] + 1


def _progress_finish() -> None:
    _progress.update({"active": False, "op": None, "done": 0, "total": 0, "path": None})


def report_progress(op: str, done: int, total: int, path: str = None) -> None:
    """
    Публикация прогресса произвольной стадийной операции (например,
    открытие хранилища: миграции → инициализация → наполнение).
    done >= total означает завершение.
    """
    if done >= total:
        # Завершаем только "свою" операцию, чтобы не сбить чужой прогресс
        if _progress.get("op") in (op, None):
            _progress_finish()
    else:
        _progress.update({"active": True, "op": op, "done": done, "total": total, "path": path})


# ============================================================
#  Ключи сессии (только в памяти процесса)
# ============================================================
_session_keys: dict[str, bytes] = {}


def _norm(vault_path: str) -> str:
    return os.path.normpath(str(vault_path))


def set_session_key(vault_path: str, key: bytes) -> None:
    _session_keys[_norm(vault_path)] = key


def get_session_key(vault_path: str) -> bytes | None:
    return _session_keys.get(_norm(vault_path))


def clear_session_key(vault_path: str = None) -> None:
    """Сброс ключа: конкретного хранилища или всех сразу."""
    if vault_path is None:
        _session_keys.clear()
    else:
        _session_keys.pop(_norm(vault_path), None)


# ============================================================
#  Метаданные защиты (.doe.vault)
# ============================================================
def _meta_path(vault_path: str) -> Path:
    return Path(vault_path) / META_FILENAME


def is_protected(vault_path: str) -> bool:
    """Установлен ли пароль на хранилище."""
    try:
        p = _meta_path(vault_path)
        if not p.exists():
            return False
        meta = json.loads(p.read_text(encoding="utf-8"))
        return bool(meta.get("verify_hash"))
    except Exception:
        return False


def _derive(password: str, salt: bytes) -> bytes:
    # NFC-нормализация: один и тот же пароль, набранный на разных раскладках/
    # устройствах, может приходить в разной Unicode-форме (например, «ё» как
    # одна кодовая точка или как «е» + комбинирующая точка). Без нормализации
    # такой пароль дал бы другой хэш — и пользователь не смог бы войти.
    import unicodedata
    password = unicodedata.normalize("NFC", password)
    kdf = Scrypt(salt=salt, length=_KEY_LEN, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P)
    return kdf.derive(password.encode("utf-8"))


def set_password(vault_path: str, password: str) -> bytes:
    """
    Устанавливает (или заменяет) пароль хранилища.
    Пишет в метафайл ТОЛЬКО соли и хэши для проверки. Возвращает ключ шифрования.
    key_check = SHA-256(ключа) — позволяет проверить ключ, полученный из
    Keychain (Touch ID), не раскрывая сам ключ. Флаг touchid переносится
    из старого метафайла (смена пароля не выключает Touch ID; свежий ключ
    в Keychain перезаписывает вызывающая сторона).
    """
    import hashlib
    old_meta = _load_meta(vault_path) or {}

    verify_salt = secrets.token_bytes(16)
    kdf_salt = secrets.token_bytes(16)
    verify_hash = _derive(password, verify_salt)
    key = _derive(password, kdf_salt)

    meta = {
        "version": 1,
        "kdf": "scrypt",
        "kdf_params": {"n": _SCRYPT_N, "r": _SCRYPT_R, "p": _SCRYPT_P},
        "verify_salt": verify_salt.hex(),
        "verify_hash": verify_hash.hex(),
        "kdf_salt": kdf_salt.hex(),
        "key_check": hashlib.sha256(key).hexdigest(),
        "touchid": bool(old_meta.get("touchid", False)),
    }
    tmp = _meta_path(vault_path).with_suffix(".tmp")
    tmp.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    os.replace(tmp, _meta_path(vault_path))

    # Скрываем метафайл на Windows (на macOS/Linux точка в имени уже скрывает)
    if os.name == "nt":
        try:
            import ctypes
            ctypes.windll.kernel32.SetFileAttributesW(str(_meta_path(vault_path)), 0x02)
        except Exception:
            pass

    set_session_key(vault_path, key)
    return key


def remove_protection(vault_path: str) -> None:
    """Удаляет метафайл защиты (файлы должны быть уже расшифрованы)."""
    try:
        _meta_path(vault_path).unlink(missing_ok=True)
    except Exception:
        pass
    clear_session_key(vault_path)


def _load_meta(vault_path: str) -> dict | None:
    try:
        return json.loads(_meta_path(vault_path).read_text(encoding="utf-8"))
    except Exception:
        return None


def verify_password(vault_path: str, password: str) -> bool:
    """Сравнение ХЭШЕЙ (константное время). Пароль не хранится и не сохраняется."""
    meta = _load_meta(vault_path)
    if not meta:
        return False
    try:
        salt = bytes.fromhex(meta["verify_salt"])
        expected = bytes.fromhex(meta["verify_hash"])
        actual = _derive(password, salt)
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False


def derive_encryption_key(vault_path: str, password: str) -> bytes | None:
    """Выводит ключ шифрования из пароля. Вызывать ТОЛЬКО после verify_password."""
    meta = _load_meta(vault_path)
    if not meta:
        return None
    try:
        return _derive(password, bytes.fromhex(meta["kdf_salt"]))
    except Exception:
        return None


def verify_key(vault_path: str, key: bytes) -> bool:
    """
    Проверяет, что ключ (например, из Keychain / Touch ID) действительно
    принадлежит этому хранилищу — по key_check (SHA-256 ключа) из метафайла.
    """
    import hashlib
    meta = _load_meta(vault_path)
    if not meta or not meta.get("key_check"):
        return False
    return hmac.compare_digest(hashlib.sha256(key).hexdigest(), meta["key_check"])


def _update_meta(vault_path: str, **fields) -> bool:
    """Точечное обновление полей метафайла (атомарно)."""
    meta = _load_meta(vault_path)
    if not meta:
        return False
    meta.update(fields)
    tmp = _meta_path(vault_path).with_suffix(".tmp")
    tmp.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    os.replace(tmp, _meta_path(vault_path))
    return True


def is_touchid_enabled(vault_path: str) -> bool:
    meta = _load_meta(vault_path)
    return bool(meta and meta.get("touchid"))


def set_touchid_enabled(vault_path: str, enabled: bool, key: bytes = None) -> bool:
    """
    Включает/выключает флаг Touch ID в метафайле. При включении гарантирует
    наличие key_check (для старых метафайлов, созданных до этой функции).
    """
    import hashlib
    fields = {"touchid": bool(enabled)}
    if enabled and key is not None:
        fields["key_check"] = hashlib.sha256(key).hexdigest()
    return _update_meta(vault_path, **fields)


# ============================================================
#  Пофайловое шифрование (AES-256-GCM, чанками)
# ============================================================
def _fsync_dir(dir_path: Path) -> None:
    """
    fsync каталога после os.replace: гарантирует, что переименование контейнера
    долетело до диска ДО удаления оригинала. Защита от реордеринга метаданных
    ФС при внезапном отключении питания. На Windows не поддерживается — no-op.
    """
    try:
        fd = os.open(str(dir_path), os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    except Exception:
        pass


def _chunk_nonce(prefix: bytes, index: int) -> bytes:
    return prefix + struct.pack(">I", index)


def _chunk_aad(index: int, is_last: bool) -> bytes:
    return struct.pack(">QB", index, 1 if is_last else 0)


def encrypt_file(src: Path, key: bytes, root: Path) -> Path:
    """
    Шифрует файл в контейнер со СЛУЧАЙНЫМ именем в корне хранилища (формат v2).
    Оригинальный относительный путь шифруется и хранится внутри контейнера,
    поэтому снаружи не видно ни имён файлов, ни структуры папок.
    Атомарно: запись во временный файл + os.replace, оригинал удаляется
    только после успешной записи.
    """
    aes = AESGCM(key)
    nonce_prefix = secrets.token_bytes(NONCE_PREFIX_SIZE)

    # Зашифрованный заголовок с оригинальным путём (аутентифицирован AAD)
    rel = src.relative_to(root).as_posix().encode("utf-8")
    path_ct = aes.encrypt(_chunk_nonce(nonce_prefix, PATH_CHUNK_INDEX), rel, PATH_AAD)

    # Случайное имя контейнера в корне хранилища
    while True:
        dst = root / (secrets.token_hex(12) + ENC_SUFFIX)
        if not dst.exists():
            break
    tmp = Path(str(dst) + ".tmp")

    try:
        with open(src, "rb") as fin, open(tmp, "wb") as fout:
            fout.write(MAGIC2)
            fout.write(nonce_prefix)
            fout.write(struct.pack(">I", len(path_ct)))
            fout.write(path_ct)
            index = 0
            chunk = fin.read(CHUNK_SIZE)
            while True:
                next_chunk = fin.read(CHUNK_SIZE)
                is_last = len(next_chunk) == 0
                ct = aes.encrypt(_chunk_nonce(nonce_prefix, index), chunk, _chunk_aad(index, is_last))
                fout.write(struct.pack(">I", len(ct)))
                fout.write(ct)
                if is_last:
                    break
                chunk = next_chunk
                index += 1
            fout.flush()
            os.fsync(fout.fileno())
        os.replace(tmp, dst)
        # Фиксируем rename на диске ПРЕЖДЕ, чем удалить оригинал
        _fsync_dir(dst.parent)
    except Exception:
        try:
            tmp.unlink(missing_ok=True)
        except Exception:
            pass
        raise
    # Оригинал удаляем только после успешной записи шифрованной копии
    src.unlink()
    return dst


def decrypt_file(src: Path, key: bytes, root: Path) -> Path:
    """
    Расшифровывает контейнер обратно в оригинальный файл.
    v2: оригинальный путь читается из зашифрованного заголовка,
        структура папок восстанавливается автоматически.
    v1 (legacy): имя восстанавливается отрезанием суффикса .doelock.
    """
    if not src.name.endswith(ENC_SUFFIX):
        raise ValueError(f"Not an encrypted file: {src}")
    aes = AESGCM(key)

    try:
        with open(src, "rb") as fin:
            magic = fin.read(len(MAGIC))
            if magic == MAGIC2:
                nonce_prefix = fin.read(NONCE_PREFIX_SIZE)
                (path_len,) = struct.unpack(">I", fin.read(4))
                if path_len > 65536:
                    raise ValueError(f"Bad path header: {src.name}")
                path_ct = fin.read(path_len)
                rel_bytes = aes.decrypt(_chunk_nonce(nonce_prefix, PATH_CHUNK_INDEX), path_ct, PATH_AAD)
                rel_path = Path(rel_bytes.decode("utf-8"))
                # 🛡 Защита от path traversal: путь обязан быть относительным и без ".."
                if rel_path.is_absolute() or ".." in rel_path.parts:
                    raise ValueError(f"Unsafe path in container: {src.name}")
                dst = root / rel_path
                dst.parent.mkdir(parents=True, exist_ok=True)
            elif magic == MAGIC:
                nonce_prefix = fin.read(NONCE_PREFIX_SIZE)
                dst = Path(str(src)[: -len(ENC_SUFFIX)])
            else:
                raise ValueError(f"Bad file format: {src.name}")

            tmp = Path(str(dst) + ".tmp")
            return _decrypt_body(fin, aes, nonce_prefix, src, dst, tmp)
    except Exception:
        raise


def _decrypt_body(fin, aes, nonce_prefix, src: Path, dst: Path, tmp: Path) -> Path:
    """Общий цикл расшифровки чанков данных (для v1 и v2)."""
    try:
        with open(tmp, "wb") as fout:
            index = 0
            while True:
                header = fin.read(4)
                if len(header) == 0:
                    # Файл закончился без last-флага — усечение
                    raise ValueError(f"Truncated encrypted file: {src.name}")
                (ct_len,) = struct.unpack(">I", header)
                ct = fin.read(ct_len)
                if len(ct) != ct_len:
                    raise ValueError(f"Truncated encrypted file: {src.name}")
                # Пробуем сперва как "последний" чанк, затем как промежуточный:
                # корректность гарантирует AAD (подделка/перестановка невозможны).
                pt = None
                is_last = False
                for last_flag in (True, False):
                    try:
                        pt = aes.decrypt(_chunk_nonce(nonce_prefix, index), ct, _chunk_aad(index, last_flag))
                        is_last = last_flag
                        break
                    except Exception:
                        continue
                if pt is None:
                    raise ValueError(f"Decryption failed (wrong key or corrupted): {src.name}")
                fout.write(pt)
                if is_last:
                    # Убеждаемся, что после последнего чанка нет "хвоста"
                    if fin.read(1) != b"":
                        raise ValueError(f"Trailing data in encrypted file: {src.name}")
                    break
                index += 1
            fout.flush()
            os.fsync(fout.fileno())
        os.replace(tmp, dst)
        # Фиксируем rename на диске ПРЕЖДЕ, чем удалить контейнер
        _fsync_dir(dst.parent)
    except Exception:
        try:
            tmp.unlink(missing_ok=True)
        except Exception:
            pass
        raise
    src.unlink()
    return dst


def _should_skip(p: Path) -> bool:
    if p.name in _SKIP_NAMES:
        return True
    if any(p.name.endswith(sfx) for sfx in _SKIP_SUFFIXES):
        return True
    if p.name.endswith(".tmp"):
        return True
    return False


def has_locked_files(vault_path: str) -> bool:
    try:
        for p in Path(vault_path).rglob("*" + ENC_SUFFIX):
            if p.is_file():
                return True
    except Exception:
        pass
    return False


def lock_vault(vault_path: str, key: bytes) -> dict:
    """
    Шифрует ВСЁ содержимое папки хранилища (рекурсивно), кроме служебных файлов.
    Возвращает {"encrypted": N, "errors": [имена]}.
    Прогресс доступен через get_progress(). Параллельные вызовы сериализуются.
    """
    with _op_lock:
        root = Path(vault_path)
        encrypted, errors = 0, []
        if not root.exists():
            return {"encrypted": 0, "errors": []}

        # Сначала собираем список — чтобы знать total для прогресса
        targets = [
            p for p in sorted(root.rglob("*"))
            if p.is_file() and not p.is_symlink() and not _should_skip(p)
        ]
        _progress_start("lock", len(targets), str(root))
        try:
            for p in targets:
                try:
                    encrypt_file(p, key, root)
                    encrypted += 1
                except Exception as e:
                    print(f"[VaultCrypto] ❌ Failed to encrypt {p.name}: {e}")
                    errors.append(p.name)
                finally:
                    _progress_step()
        finally:
            _progress_finish()

        # 🕵️ Скрываем структуру папок: контейнеры лежат плоско в корне,
        # опустевшие подпапки удаляем (их имена тоже не должны ничего выдавать).
        # rmdir() удаляет ТОЛЬКО пустые папки. Если внутри остался системный
        # мусор (например, .DS_Store), аккуратно удаляем его перед сносом папки.
        try:
            for d in sorted((p for p in root.rglob("*") if p.is_dir()),
                            key=lambda p: len(p.parts), reverse=True):
                
                # Зачищаем невидимый мусор ОС, мешающий удалению папки
                for trash in (".DS_Store", "desktop.ini", "Thumbs.db"):
                    trash_path = d / trash
                    if trash_path.exists():
                        try:
                            trash_path.unlink()
                        except OSError:
                            pass
                
                try:
                    d.rmdir()
                except OSError:
                    pass
        except Exception:
            pass

        print(f"[VaultCrypto] 🔒 Vault locked: {encrypted} file(s) encrypted, {len(errors)} error(s)")
        return {"encrypted": encrypted, "errors": errors}


def unlock_vault(vault_path: str, key: bytes) -> dict:
    """
    Расшифровывает все *.doelock в папке хранилища.
    Прогресс доступен через get_progress(). Параллельные вызовы сериализуются.
    """
    with _op_lock:
        root = Path(vault_path)
        decrypted, errors = 0, []

        targets = [p for p in sorted(root.rglob("*" + ENC_SUFFIX)) if p.is_file()]
        _progress_start("unlock", len(targets), str(root))
        try:
            for p in targets:
                try:
                    decrypt_file(p, key, root)
                    decrypted += 1
                except Exception as e:
                    print(f"[VaultCrypto] ❌ Failed to decrypt {p.name}: {e}")
                    errors.append(p.name)
                finally:
                    _progress_step()
        finally:
            _progress_finish()
        print(f"[VaultCrypto] 🔓 Vault unlocked: {decrypted} file(s) decrypted, {len(errors)} error(s)")
        return {"decrypted": decrypted, "errors": errors}
