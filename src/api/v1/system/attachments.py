from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, Request
from pathlib import Path
from urllib.parse import unquote
from datetime import datetime
import os
import re
import shutil
import subprocess
import sys
import webbrowser
import urllib.parse

import anyio
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.database import get_session
from src.services.task_service import cleanup_orphaned_attachments
from src.core.config import get_attachments_dir, get_active_vault
from src.core import attach_jobs
from src.schemas.system import (
    AttachLocalReq, ImportFileReq, OpenFileReq, ValidateAttachmentsReq,
    OpenLinkReq, RevealFolderReq, DeleteFileReq,
)

router = APIRouter(tags=["attachments"])


# ============================================================
# 📎 Вложения: загрузка и прикрепление файлов любого размера.
#
# Три пути попадания файла в хранилище:
#   1. /attach-local  — есть нативный путь (диалог «+» или DnD в
#      десктоп-приложении). Файл копируется в фоновом потоке; на macOS
#      в пределах тома APFS — мгновенный CoW-клон, как Cmd+C/Cmd+V в
#      Finder. Прогресс опрашивается через /attach-progress.
#   2. /upload-stream — нативного пути нет (DnD на Windows, браузер).
#      Тело запроса пишется потоково сразу в файл назначения: одна
#      запись на диск, постоянная память, любой размер.
#   3. /upload        — легаси-multipart (вставка из буфера обмена,
#      старые вызовы). Оставлен для мелких файлов.
# ============================================================


def _safe_attachment_name(raw_name: str) -> str:
    """Отсекает пути и запрещённые символы, оставляя только имя файла."""
    name = Path(str(raw_name).replace("\\", "/")).name.strip()
    name = name.replace("\x00", "")
    if not name or name in (".", ".."):
        name = f"file_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    return name


def _is_within_dir(base: Path, target: Path) -> bool:
    """True, если target (после resolve) лежит внутри base. Защита от
    path traversal (../) при склейке пользовательского имени с папкой."""
    try:
        base_r = base.resolve()
        target_r = target.resolve()
        return target_r == base_r or base_r in target_r.parents
    except Exception:
        return False


# 🔐 Расширения, которые ОС может автоматически ИСПОЛНИТЬ при «открытии».
# Ссылка/вложение из недоверенного хранилища (импорт, общий vault, ответ ИИ)
# не должна одним кликом запускать код. Документы (pdf, docx, изображения…)
# по-прежнему открываются штатно.
_DANGEROUS_EXEC_EXTS = {
    # macOS
    ".app", ".command", ".tool", ".terminal", ".scpt", ".scptd",
    ".applescript", ".workflow", ".action", ".appref-ms",
    ".pkg", ".mpkg", ".webloc", ".mobileconfig",
    # Windows
    ".exe", ".bat", ".cmd", ".com", ".msi", ".msp", ".scr", ".pif",
    ".ps1", ".psm1", ".vbs", ".vbe", ".wsf", ".wsh", ".hta", ".cpl",
    ".jse", ".lnk", ".reg", ".inf", ".gadget", ".msc",
    ".settingcontent-ms", ".url", ".scf", ".xll", ".ws", ".job",
    ".chm", ".hlp", ".ps1xml", ".vbscript",
    ".msh", ".msh1", ".msh2", ".mshxml", ".msh1xml", ".msh2xml",
    # cross-platform / *nix
    ".sh", ".bash", ".zsh", ".run", ".desktop", ".jar", ".apk",
    ".appimage",
}


def _is_dangerous_executable(path: Path) -> bool:
    """True, если путь указывает на исполняемый/скриптовый тип, автозапуск
    которого через `open`/`startfile`/`xdg-open` эквивалентен выполнению кода."""
    try:
        # ОС (особенно Windows) отбрасывает завершающие точки и пробелы в имени,
        # поэтому "evil.exe." или "evil.exe " исполнились бы как .exe, обойдя
        # проверку суффикса. Нормализуем имя перед извлечением расширения.
        name = path.name.rstrip(" .\t\r\n")
        suffix = ("." + name.rsplit(".", 1)[1].lower()) if "." in name else ""
        return suffix in _DANGEROUS_EXEC_EXTS
    except Exception:
        # Не смогли определить тип — безопаснее отказать в открытии.
        return True


def _unique_attachment_path(name: str) -> Path:
    """Свободный путь в папке вложений (добавляет _1, _2… при коллизии)."""
    attachments_dir = get_attachments_dir()
    attachments_dir.mkdir(parents=True, exist_ok=True)
    name = _safe_attachment_name(name)
    file_path = attachments_dir / name
    counter = 1
    # Учитываем и защищённые имена: файл параллельного задания мог ещё
    # не появиться на диске (или существовать как .doepart).
    busy = attach_jobs.protected_names()
    while (file_path.exists()
           or file_path.name in busy
           or (file_path.parent / (file_path.name + attach_jobs.PARTIAL_SUFFIX)).exists()):
        file_path = attachments_dir / f"{Path(name).stem}_{counter}{Path(name).suffix}"
        counter += 1
    return file_path


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    file_path = _unique_attachment_path(file.filename or "file")
    attach_jobs.protect_name(file_path.name)
    try:
        # Копирование в отдельном потоке: даже большой файл не заблокирует
        # event loop и интерфейс приложения.
        def _write():
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer, length=1024 * 1024)

        await anyio.to_thread.run_sync(_write)
    except Exception:
        attach_jobs.unprotect_name(file_path.name)
        try:
            if file_path.exists():
                file_path.unlink()
        except Exception:
            pass
        raise

    attach_jobs.finish_protection(file_path.name)
    return {"path": f"doe/{file_path.name}", "name": file_path.name}


@router.put("/upload-stream")
async def upload_stream(request: Request, name: str):
    """Потоковая загрузка: тело запроса (сырые байты файла) пишется сразу
    в файл назначения. Ни временных файлов, ни двойной записи на диск —
    работает с файлами любого размера при постоянном расходе памяти."""
    file_path = _unique_attachment_path(name)
    tmp_path = file_path.with_name(file_path.name + attach_jobs.PARTIAL_SUFFIX)
    attach_jobs.protect_name(file_path.name)
    attach_jobs.protect_name(tmp_path.name)

    # Буферизуем мелкие чанки HTTP-потока в крупные блоки, чтобы не дёргать
    # диск и пул потоков на каждые 64 КБ.
    FLUSH_SIZE = 8 * 1024 * 1024
    buffer = bytearray()
    try:
        with await anyio.to_thread.run_sync(lambda: open(tmp_path, "wb")) as fout:
            async for chunk in request.stream():
                if not chunk:
                    continue
                buffer.extend(chunk)
                if len(buffer) >= FLUSH_SIZE:
                    data = bytes(buffer)
                    buffer.clear()
                    await anyio.to_thread.run_sync(fout.write, data)
            if buffer:
                await anyio.to_thread.run_sync(fout.write, bytes(buffer))
        await anyio.to_thread.run_sync(lambda: os.replace(tmp_path, file_path))
    except Exception as e:
        # Клиент оборвал соединение или ошибка записи — подчищаем «полуфайл».
        attach_jobs.unprotect_name(file_path.name)
        attach_jobs.unprotect_name(tmp_path.name)
        try:
            if tmp_path.exists():
                tmp_path.unlink()
        except Exception:
            pass
        print(f"[Attach] ❌ Stream upload failed for {name}: {e}")
        raise HTTPException(status_code=500, detail="Upload failed")

    attach_jobs.finish_protection(file_path.name)
    attach_jobs.unprotect_name(tmp_path.name)
    return {"path": f"doe/{file_path.name}", "name": file_path.name}


# ============================================================
# 📄 PDF.js — движок кастомного PDF-ридера (тот же, что в Obsidian).
#
# Библиотека не лежит в репозитории (~1.4 МБ), а скачивается ОДИН раз
# при первом просмотре PDF и кэшируется в ~/.doe/vendor. Дальше всё
# работает полностью офлайн. Если сети нет — фронтенд откатывается
# на нативный просмотрщик WebView.
# ============================================================

PDFJS_VERSION = "3.11.174"
PDFJS_FILES = ("pdf.min.js", "pdf.worker.min.js")
PDFJS_CDNS = (
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/{v}/{f}",
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@{v}/build/{f}",
    "https://unpkg.com/pdfjs-dist@{v}/build/{f}",
)


def get_pdfjs_dir() -> Path:
    return Path.home() / ".doe" / "vendor" / f"pdfjs-{PDFJS_VERSION}"


def _pdfjs_ready() -> bool:
    d = get_pdfjs_dir()
    # Минимальные размеры — защита от кэширования HTML-страницы ошибки
    return all((d / f).exists() and (d / f).stat().st_size > 100_000 for f in PDFJS_FILES)


def _download_pdfjs() -> bool:
    import urllib.request
    d = get_pdfjs_dir()
    d.mkdir(parents=True, exist_ok=True)
    for f in PDFJS_FILES:
        target = d / f
        if target.exists() and target.stat().st_size > 100_000:
            continue
        ok = False
        for cdn in PDFJS_CDNS:
            url = cdn.format(v=PDFJS_VERSION, f=f)
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Doe-App"})
                with urllib.request.urlopen(req, timeout=30) as resp:
                    data = resp.read()
                # Защита от закэшированной HTML-страницы ошибки вместо JS
                if len(data) < 100_000 or data.lstrip()[:1] == b"<":
                    continue
                tmp = target.with_suffix(".part")
                tmp.write_bytes(data)
                tmp.replace(target)
                ok = True
                print(f"[PDF.js] ✅ Downloaded {f} ({len(data)} bytes) from {url.split('/')[2]}")
                break
            except Exception as e:
                print(f"[PDF.js] ⚠️ {url.split('/')[2]} failed: {e}")
        if not ok:
            return False
    return True


@router.get("/pdfjs-status")
async def pdfjs_status():
    return {"ready": _pdfjs_ready(), "version": PDFJS_VERSION}


@router.post("/ensure-pdfjs")
async def ensure_pdfjs():
    """Скачивает PDF.js в локальный кэш (однократно). Блокирующая загрузка
    выполняется в пуле потоков — event loop свободен."""
    if _pdfjs_ready():
        return {"ready": True, "version": PDFJS_VERSION}
    ok = await anyio.to_thread.run_sync(_download_pdfjs)
    return {"ready": bool(ok), "version": PDFJS_VERSION}


@router.post("/attach-local")
async def attach_local_file(req: AttachLocalReq):
    """Прикрепляет файл по нативному пути: копирование идёт в фоне,
    ответ возвращается мгновенно. Прогресс — GET /attach-progress/{job_id}."""
    src_path = Path(req.absolute_path)
    if not src_path.exists() or not src_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    dst_path = _unique_attachment_path(src_path.name)
    job = attach_jobs.start_copy_job(src_path, dst_path)
    return job


@router.get("/attach-progress/{job_id}")
async def attach_progress(job_id: str):
    job = attach_jobs.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/import-file")
async def import_file(req: ImportFileReq):
    """Легаси-эндпоинт: отвечает после завершения копирования.

    Раньше shutil.copy2 выполнялся прямо в event loop и замораживал всё
    приложение на время копирования. Теперь копирование идёт через фоновое
    задание (с мгновенным CoW-клоном на macOS), а здесь мы лишь ждём его,
    не блокируя остальные запросы. Новый код фронтенда использует
    /attach-local + /attach-progress и показывает прогресс.
    """
    src_path = Path(req.absolute_path)
    if not src_path.exists() or not src_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    dst_path = _unique_attachment_path(src_path.name)
    job = attach_jobs.start_copy_job(src_path, dst_path)

    while True:
        state = attach_jobs.get_job(job["job_id"])
        if state is None or state["status"] == "error":
            detail = (state or {}).get("error") or "Copy failed"
            raise HTTPException(status_code=500, detail=detail)
        if state["status"] == "done":
            return {"path": state["path"], "name": state["name"]}
        await anyio.sleep(0.2)


@router.post("/open-file")
async def open_file_endpoint(req: OpenFileReq):
    # Очищаем префикс приложения и убираем ведущие слэши, чтобы Path / filename работал корректно
    filename = req.path.replace("doe/", "", 1).lstrip("/")
    att_dir = get_attachments_dir()
    abs_path = att_dir / filename

    # 🔐 Защита от path traversal: открываем только файлы ВНУТРИ папки вложений.
    if not _is_within_dir(att_dir, abs_path):
        raise HTTPException(status_code=403, detail="Access denied")

    if not abs_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    # 🔐 Не запускаем исполняемые типы одним кликом (см. _is_dangerous_executable).
    if _is_dangerous_executable(abs_path):
        raise HTTPException(status_code=403, detail="Executable files are not opened for safety")

    try:
        if sys.platform == 'darwin':
            # На macOS команда 'open' запускает файл в приложении по умолчанию для данного типа
            subprocess.call(['open', str(abs_path)])
        elif sys.platform == 'win32':
            # На Windows 'os.startfile' аналогичен двойному клику в Проводнике
            os.startfile(str(abs_path))
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/validate-attachments")
async def validate_attachments(req: ValidateAttachmentsReq):
    att_dir = get_attachments_dir()
    result = {}
    
    for p in req.paths:
        try:
            decoded_path = unquote(p)
            filename = decoded_path.replace("doe/", "", 1)
            abs_path = att_dir / filename
            
            if abs_path.exists() and abs_path.is_file():
                result[p] = {"exists": True, "real_name": abs_path.name}
            else:
                result[p] = {"exists": False, "real_name": filename}
        except Exception:
            result[p] = {"exists": False, "real_name": "Unknown"}
            
    return result


# ==============================================================
# НОВЫЙ ЭНДПОИНТ: БЕЗОПАСНОЕ ОТКРЫТИЕ ВНЕШНИХ ССЫЛОК И ПУТЕЙ
# ==============================================================


@router.post("/open-link")
async def open_link_endpoint(req: OpenLinkReq):
    target = req.url
    try:
        # Если ссылка указывает на внутреннее вложение нашего сервера (например, http://127.0.0.1:8000/doe/file.pdf),
        # перенаправляем ее на открытие локального файла в нативной системной читалке
        if "/doe/" in target:
            filename = unquote(target.split("/doe/")[-1].lstrip("/"))
            att_dir = get_attachments_dir()
            abs_path = att_dir / filename
            # 🔐 Защита от path traversal для внутренних вложений
            if not _is_within_dir(att_dir, abs_path):
                raise HTTPException(status_code=403, detail="Access denied")
            if _is_dangerous_executable(abs_path):
                raise HTTPException(status_code=403, detail="Executable files are not opened for safety")
            if abs_path.exists() and abs_path.is_file():
                if sys.platform == 'darwin':
                    subprocess.call(['open', str(abs_path)])
                elif sys.platform == 'win32':
                    os.startfile(str(abs_path))
                return {"success": True}

        # 1. Если это внешняя веб-ссылка или IP -> открываем в браузере
        if target.startswith(("http://", "https://")):
            webbrowser.open(target)
            return {"success": True}

        # 2. Обработка локальных путей
        clean_path = target
        
        # Убираем file:// если есть
        if clean_path.startswith("file://"):
            clean_path = clean_path.replace("file://", "", 1)
            # Фикс для Windows (убираем лишний слэш перед диском, например /C:/)
            if sys.platform == 'win32' and clean_path.startswith('/'):
                clean_path = clean_path[1:]
        
        # Декодируем URL-символы (%20 и прочее) в нормальные строки
        clean_path = urllib.parse.unquote(clean_path)

        # --- МАГИЯ ТИЛЬДЫ (Senior Developer Trick) ---
        # os.path.expanduser автоматически заменит ~ на домашнюю папку текущего пользователя
        # Она работает кроссплатформенно.
        if clean_path.startswith("~"):
            clean_path = os.path.expanduser(clean_path)
        # ----------------------------------------------

        p = Path(clean_path)

        if p.is_absolute():
            final_path = p
        else:
            # ОТНОСИТЕЛЬНЫЙ путь: раньше он резолвился от рабочей папки процесса
            # (папки приложения) и почти никогда не находил файл. Логичные базы
            # для пользователя: папка хранилища → папка вложений → CWD (фолбэк).
            candidates = []
            active_vault = get_active_vault()
            if active_vault:
                candidates.append(Path(active_vault) / clean_path)
            try:
                candidates.append(get_attachments_dir() / clean_path)
            except Exception:
                pass
            candidates.append(p.absolute())

            final_path = next((c for c in candidates if c.exists()), None)
            if final_path is None:
                print(f"[System] Relative path not found in vault/attachments/cwd: {clean_path}")
                return {"success": False, "error": "File not found"}
            final_path = final_path.resolve()

        print(f"[System] Attempting to open path: {final_path}")

        # Единая проверка существования (раньше macOS молча "открывал" несуществующий путь)
        if not final_path.exists():
            print(f"[System] Path does not exist: {final_path}")
            return {"success": False, "error": "File not found"}

        # 🔐 Ссылка из заметки не должна одним кликом запускать приложение/скрипт.
        if _is_dangerous_executable(final_path):
            print(f"[System] Refused to launch executable via link: {final_path}")
            return {"success": False, "error": "Executable files are not opened for safety"}

        if sys.platform == 'darwin':
            # macOS: команда open идеально справляется и с файлами, и с папками
            subprocess.call(['open', str(final_path)])
        elif sys.platform == 'win32':
            # Windows: os.startfile — это аналог двойного клика в проводнике
            os.startfile(str(final_path))
        elif sys.platform.startswith('linux'):
            # Linux: стандартный системный хэндлер
            subprocess.call(['xdg-open', str(final_path)])

        return {"success": True}
        
    except Exception as e:
        print(f"[System] Failed to open external link {target}: {e}")
        return {"success": False, "error": str(e)}


@router.post("/reveal-folder")
async def reveal_folder_endpoint(req: RevealFolderReq):
    target = req.path
    try:
        clean_path = target.replace("file://", "", 1)
        if sys.platform == 'win32' and clean_path.startswith('/'):
            clean_path = clean_path[1:]
            
        clean_path = urllib.parse.unquote(clean_path)
        if clean_path.startswith("~"):
            clean_path = os.path.expanduser(clean_path)
            
        final_path = Path(clean_path).absolute()

        if sys.platform == 'darwin':
            subprocess.call(['open', '-R', str(final_path)])
        elif sys.platform == 'win32':
            subprocess.call(['explorer', f'/select,{str(final_path)}'])
        elif sys.platform.startswith('linux'):
            # В Linux открываем родительскую папку
            subprocess.call(['xdg-open', str(final_path.parent)])
            
        return {"success": True}
    except Exception as e:
        print(f"[System] Failed to reveal folder {target}: {e}")
        return {"success": False, "error": str(e)}


@router.post("/cleanup-attachments")
async def cleanup_attachments_endpoint(db: AsyncSession = Depends(get_session)):
    """
    Фоновый эндпоинт для сборки мусора (Garbage Collector).
    Вызывается фронтендом при закрытии карточки и при запуске приложения.
    """
    await cleanup_orphaned_attachments(db)
    return {"success": True}


@router.post("/delete-file")
async def delete_file_endpoint(req: DeleteFileReq):
    """
    Мгновенное физическое удаление файла с диска.
    Используется только при явном нажатии на 'Удалить' во вложениях.
    """
    att_dir = get_attachments_dir()
    clean_rel_path = unquote(req.path)
    filename = clean_rel_path.replace("doe/", "", 1)
    
    # Защита от выхода за пределы папки (path traversal).
    # Используем _is_within_dir (resolve + вложенность) вместо строкового
    # startswith: последний обходится «соседним» каталогом-префиксом
    # (…/attachments_evil startswith …/attachments).
    abs_path = (att_dir / filename).resolve()

    if not _is_within_dir(att_dir, abs_path):
        raise HTTPException(status_code=403, detail="Access denied")

    try:
        if abs_path.exists() and abs_path.is_file():
            os.remove(abs_path)
            print(f"[System] File physically deleted: {abs_path.name}")
            return {"success": True}
        else:
            # Если файла уже нет, считаем задачу выполненной
            return {"success": True, "info": "File already gone"}
    except Exception as e:
        print(f"[System] Failed to delete file {abs_path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
