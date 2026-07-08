# ============================================================
# 📎 Фоновые операции с вложениями.
#
# Зачем отдельный модуль:
#   1. Копирование больших файлов (200 ГБ+) нельзя делать в event loop —
#      приложение зависнет. Здесь копирование идёт в отдельном потоке,
#      а API лишь опрашивает прогресс.
#   2. На macOS (APFS) используется системный clonefile() — тот же
#      механизм, что и у Finder при Cmd+C/Cmd+V: копия создаётся
#      мгновенно (copy-on-write), без реального переноса данных.
#   3. Сборщик мусора вложений (cleanup_orphaned_attachments) не должен
#      удалять файлы, которые прямо сейчас копируются/загружаются или
#      только что появились и ещё не сохранены в описании задачи.
#      Для этого ведётся реестр «защищённых» имён.
# ============================================================

import os
import sys
import shutil
import threading
import time
import uuid
from pathlib import Path

# Размер блока при обычном копировании. 32 МБ — близко к скорости диска,
# при этом прогресс обновляется достаточно часто даже на быстрых NVMe.
COPY_CHUNK_SIZE = 32 * 1024 * 1024

# Сколько секунд после завершения операции имя файла остаётся защищённым
# от сборщика мусора. Ссылка на файл появляется в описании задачи только
# после сохранения, поэтому даём щедрый запас.
PROTECT_GRACE_SECONDS = 30 * 60

# Расширение временного файла незавершённого копирования.
PARTIAL_SUFFIX = ".doepart"

_jobs: dict[str, dict] = {}
_protected: dict[str, float] = {}  # имя файла -> unix-время окончания защиты (inf = активно)
_lock = threading.Lock()


# ------------------------------------------------------------
# Защита имён от сборщика мусора
# ------------------------------------------------------------

def protect_name(name: str) -> None:
    """Защищает имя файла в папке вложений на время активной операции."""
    with _lock:
        _protected[name] = float("inf")


def finish_protection(name: str) -> None:
    """Операция завершена: защита сохраняется ещё PROTECT_GRACE_SECONDS."""
    with _lock:
        _protected[name] = time.time() + PROTECT_GRACE_SECONDS


def unprotect_name(name: str) -> None:
    with _lock:
        _protected.pop(name, None)


def protected_names() -> set:
    """Актуальный набор защищённых имён (просроченные записи удаляются)."""
    now = time.time()
    with _lock:
        expired = [n for n, exp in _protected.items() if exp < now]
        for n in expired:
            _protected.pop(n, None)
        return set(_protected.keys())


def is_stale_partial(path: Path) -> bool:
    """True, если это брошенный .doepart (например, после падения приложения)."""
    if not path.name.endswith(PARTIAL_SUFFIX):
        return False
    return path.name not in protected_names()


# ------------------------------------------------------------
# Мгновенное клонирование (macOS / APFS)
# ------------------------------------------------------------

def try_clonefile(src: Path, dst: Path) -> bool:
    """clonefile() — CoW-клон как в Finder. Работает только на macOS в
    пределах одного тома APFS; в остальных случаях возвращает False и
    вызывающий код переходит на обычное копирование."""
    if sys.platform != "darwin":
        return False
    try:
        import ctypes

        libc = ctypes.CDLL("/usr/lib/libSystem.B.dylib", use_errno=True)
        res = libc.clonefile(
            os.fsencode(str(src)), os.fsencode(str(dst)), ctypes.c_int(0)
        )
        if res == 0:
            return True
        return False
    except Exception:
        return False


# ------------------------------------------------------------
# Фоновые задания копирования
# ------------------------------------------------------------

def _set_job(job_id: str, **fields) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if job is not None:
            job.update(fields)


def get_job(job_id: str) -> dict | None:
    with _lock:
        job = _jobs.get(job_id)
        return dict(job) if job else None


def _prune_old_jobs() -> None:
    """Удаляет из памяти записи о заданиях, завершившихся давно."""
    now = time.time()
    with _lock:
        dead = [
            jid for jid, j in _jobs.items()
            if j["status"] in ("done", "error") and now - j.get("finished_at", now) > 3600
        ]
        for jid in dead:
            _jobs.pop(jid, None)


def _copy_worker(job_id: str, src: Path, dst: Path) -> None:
    tmp = dst.with_name(dst.name + PARTIAL_SUFFIX)
    try:
        total = src.stat().st_size

        # 1) Быстрый путь: мгновенный CoW-клон (macOS, тот же том APFS).
        if try_clonefile(src, dst):
            _set_job(job_id, done=total, total=total, status="done",
                     finished_at=time.time())
            finish_protection(dst.name)
            unprotect_name(tmp.name)
            print(f"[Attach] ⚡ Cloned instantly (APFS CoW): {dst.name}")
            return

        # 2) Обычное копирование крупными блоками с прогрессом.
        #    Пишем во временный .doepart и переименовываем в конце,
        #    чтобы в папке вложений никогда не лежал «полуфайл» под
        #    финальным именем.
        done = 0
        with open(src, "rb") as fin, open(tmp, "wb") as fout:
            while True:
                chunk = fin.read(COPY_CHUNK_SIZE)
                if not chunk:
                    break
                fout.write(chunk)
                done += len(chunk)
                _set_job(job_id, done=done)

        try:
            shutil.copystat(src, tmp)
        except Exception:
            pass  # метаданные не критичны

        os.replace(tmp, dst)
        _set_job(job_id, done=total, total=total, status="done",
                 finished_at=time.time())
        finish_protection(dst.name)
        unprotect_name(tmp.name)
        print(f"[Attach] ✅ Copied: {dst.name} ({total} bytes)")
    except Exception as e:
        _set_job(job_id, status="error", error=str(e), finished_at=time.time())
        unprotect_name(dst.name)
        unprotect_name(tmp.name)
        try:
            if tmp.exists():
                tmp.unlink()
        except Exception:
            pass
        print(f"[Attach] ❌ Copy failed for {src} -> {dst}: {e}")
    finally:
        _prune_old_jobs()


def start_copy_job(src: Path, dst: Path) -> dict:
    """Запускает фоновое копирование src -> dst. Возвращает снимок задания.

    Имя dst должно быть уже уникальным (выбирается вызывающим кодом).
    Файлы dst и dst.doepart сразу защищаются от сборщика мусора.
    """
    job_id = uuid.uuid4().hex
    total = src.stat().st_size
    job = {
        "job_id": job_id,
        "status": "running",
        "done": 0,
        "total": total,
        "name": dst.name,
        "path": f"doe/{dst.name}",
        "error": None,
    }
    with _lock:
        _jobs[job_id] = job

    protect_name(dst.name)
    protect_name(dst.name + PARTIAL_SUFFIX)

    t = threading.Thread(
        target=_copy_worker, args=(job_id, src, dst),
        name=f"attach-copy-{job_id[:8]}", daemon=True,
    )
    t.start()
    return dict(job)
