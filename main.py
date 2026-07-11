from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from src.core.config import get_ui_settings
from pathlib import Path
import sys
from src.api.v1 import columns, tasks, system, workspaces 
from src.db.database import init_dev_database, close_database
from fastapi import Response

from src.core.config import get_active_vault, get_attachments_dir
from src.core.watcher import vault_observer # <-- ИМПОРТ




# 🔒 БЕЗ СЕТЕВОГО СЕРВЕРА: приложение больше не поднимает uvicorn/сокет.
# FastAPI-`app` используется как in-process ASGI-библиотека — фронтенд вызывает
# эндпоинты через мост `window.pywebview.api.api_request` (см. wrapper.py).
# Поэтому lifespan заменён на явные startup()/shutdown(), которые дёргает
# DataLoopThread из wrapper.py на своём asyncio-цикле. Так же убраны CORS
# (нет origin'ов вообще) и uvicorn.

async def startup():
    """Инициализация хранилища. Вызывается как фоновая задача на loop'е
    DataLoopThread, чтобы окно появлялось мгновенно и показывало прогресс,
    а фронтенд ждал /system/startup-status."""
    from src.core.config import get_active_vault
    from src.db.database import startup_state
    try:
        vault_path = get_active_vault()

        # 🔐 init_dev_database возвращает None, если хранилище защищено
        # паролем (ждём разблокировки), невалидно или отсутствует.
        initialized = None
        if vault_path and Path(vault_path).exists():
            initialized = await init_dev_database()

        if initialized is not None:
            print(f"✅ База данных инициализирована в: {vault_path}")
            from src.db.database import get_session_factory
            from src.core.config import get_ui_settings
            exts = get_ui_settings().get("extensions", {})
            if exts.get("automations", True):
                from src.services.automation_service import start_scheduler
                start_scheduler(get_session_factory())
            startup_state["state"] = "ready"
        else:
            print("⚠️ Хранилище не выбрано, защищено паролем или удалено. Ждем действий пользователя.")
            startup_state["state"] = "no_vault"
    except Exception as e:
        print(f"❌ Ошибка инициализации хранилища: {e}")
        import traceback
        traceback.print_exc()
        startup_state["state"] = "error"


async def shutdown():
    """Штатное завершение: гасим scheduler/watcher, закрываем БД и шифруем
    защищённое хранилище (ключ сессии ещё в памяти)."""
    from src.core.config import get_active_vault
    from src.services.automation_service import stop_scheduler
    stop_scheduler()
    vault_observer.stop()  # <-- ГЛУШИМ WATCHER
    await close_database()
    try:
        from src.db.database import lock_vault_files
        await lock_vault_files(get_active_vault())
    except Exception as e:
        print(f"[Security] Lock on shutdown failed: {e}")
    print("🛑 Приложение завершает работу...")


app = FastAPI(title="Doe API", version="0.1.0")

@app.get("/doe/{file_path:path}")
async def serve_attachment(file_path: str):
    """
    Раздает файлы из папки doe (локальной или глобальной).
    Это необходимо, чтобы Markdown мог рендерить теги <img> с относительными путями.
    Папка называется "doe", потому что концептуально файлы принадлежат приложению Doe.
    """
    attachments_dir = get_attachments_dir()
    full_path = attachments_dir / file_path

    # 🔐 Защита от path traversal: раздаём только файлы ВНУТРИ папки вложений,
    # иначе ссылка вида /doe/../../secret позволила бы прочитать любой файл.
    try:
        base_r = attachments_dir.resolve()
        target_r = full_path.resolve()
        if not (target_r == base_r or base_r in target_r.parents):
            return Response(status_code=403)
    except Exception:
        return Response(status_code=403)

    if full_path.exists() and full_path.is_file():
        return FileResponse(full_path)
    return Response(status_code=404)

@app.get("/localfile/{file_path:path}")
async def serve_local_file(file_path: str):
    """
    Раздаёт локальные файлы по абсолютному пути — для рендера изображений,
    прикреплённых ссылкой на оригинал без копирования (Option/Ctrl + DnD,
    как в Obsidian). Ссылки в Markdown пишутся обычным синтаксисом
    [имя](/абсолютный/путь) без file:///.
    """
    import re as _re
    fp = file_path
    # POSIX-путь теряет ведущий слэш в сегменте маршрута — возвращаем его.
    # Windows-пути (C:/...) остаются как есть.
    if not _re.match(r"^[A-Za-z]:[\\/]", fp) and not fp.startswith("/"):
        fp = "/" + fp
    p = Path(fp)
    # 🔐 Этот эндпоинт раздаёт файл по абсолютному пути через мост, что раньше
    # было примитивом чтения ЛЮБОГО файла ОС. Он нужен только для рендера
    # медиа, прикреплённых ссылкой на оригинал (изображения/видео/аудио/pdf),
    # поэтому ограничиваем набор расширений — остальное недоступно.
    _MEDIA_EXTS = {
        ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".ico",
        ".avif", ".apng", ".tif", ".tiff", ".heic", ".heif",
        ".mp4", ".webm", ".ogg", ".ogv", ".mov", ".m4v", ".mkv",
        ".mp3", ".wav", ".m4a", ".aac", ".flac", ".opus",
        ".pdf",
    }
    if p.suffix.lower() not in _MEDIA_EXTS:
        return Response(status_code=403)
    if p.is_absolute() and p.exists() and p.is_file():
        return FileResponse(p)
    return Response(status_code=404)

@app.get("/vendor/pdfjs/{file_name}")
async def serve_pdfjs(file_name: str):
    """Раздаёт локально закэшированный PDF.js (см. /system/ensure-pdfjs)."""
    from src.api.v1.system import get_pdfjs_dir, PDFJS_FILES
    if file_name not in PDFJS_FILES:
        return Response(status_code=404)
    p = get_pdfjs_dir() / file_name
    if p.exists() and p.is_file():
        return FileResponse(p, media_type="application/javascript")
    return Response(status_code=404)

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    favicon_path = base_dir / "favicon.ico"
    if favicon_path.exists():
        return FileResponse(favicon_path)
    
    alt_favicon_path = frontend_path / "favicon.ico"
    if alt_favicon_path.exists():
        return FileResponse(alt_favicon_path)
    
    return Response(status_code=204)

@app.get("/doe.png", include_in_schema=False)
async def get_logo():
    logo_path = base_dir / "doe.png"
    if logo_path.exists():
        return FileResponse(logo_path)
    return Response(status_code=404)

@app.get("/ai-logo.png", include_in_schema=False)
async def get_ai_logo():
    logo_path = base_dir / "ai-logo.png"
    if logo_path.exists():
        return FileResponse(logo_path)
    return Response(status_code=404)

from src.api.v1 import ai
from src.api.v1 import automations
from src.api.v1 import memory

app.include_router(columns.router, prefix="/api/v1")
app.include_router(tasks.router, prefix="/api/v1")
app.include_router(system.router, prefix="/api/v1")
app.include_router(workspaces.router, prefix="/api/v1")
app.include_router(ai.router, prefix="/api/v1") # <--- ПОДКЛЮЧЕНИЕ
app.include_router(automations.router, prefix="/api/v1")
app.include_router(memory.router, prefix="/api/v1")

if getattr(sys, 'frozen', False):
    base_dir = Path(sys._MEIPASS)
else:
    base_dir = Path(__file__).parent

frontend_path = base_dir / "frontend"
app.mount("/static", StaticFiles(directory=frontend_path), name="static")

# PERF: читаем index.html с диска один раз и держим в памяти.
# Раньше каждый показ окна (старт, смена vault, reload) ходил на диск.
_index_html_cache = {"mtime": None, "content": None}

def _get_index_html() -> str:
    index_file = frontend_path / "index.html"
    mtime = index_file.stat().st_mtime
    if _index_html_cache["mtime"] != mtime:
        with open(index_file, "r", encoding="utf-8") as f:
            _index_html_cache["content"] = f.read()
        _index_html_cache["mtime"] = mtime
    return _index_html_cache["content"]

@app.get("/app", response_class=HTMLResponse)
async def serve_index():
    settings = get_ui_settings()
    # 🔐 theme/lang подставляются в инлайновый <script>/<style> ниже. Значения
    # приходят из ~/.doe_config.json; произвольная строка (напр. содержащая
    # "</script>…") означала бы внедрение кода в привилегированный WebView.
    # Поэтому жёстко приводим к известному набору токенов (whitelist).
    theme = settings.get("theme", "light")
    if theme not in ("light", "dark"):
        theme = "light"
    lang = settings.get("language", "ru")
    if lang not in ("ru", "en"):
        lang = "ru"

    # Тот самый цвет из wrapper.py и CSS
    bg_color = '#161815' if theme == 'dark' else '#F4F3EF'
    
    html_content = _get_index_html()

    # Мы добавляем стиль фона ПРЯМО В HEAD. 
    # Это гарантирует, что даже если CSS еще не загружен, 
    # весь вьюпорт уже будет нужного цвета.
    inject_script = f"""
    <style id="doe-bg-lock">
        html, body {{ background-color: {bg_color} !important; }}
    </style>
    <script>
        // Senior UX: Снимаем жесткий лок фона сразу после загрузки DOM
        window.addEventListener('DOMContentLoaded', () => {{
            setTimeout(() => document.getElementById('doe-bg-lock')?.remove(), 50);
        }});
        
        if ('{theme}' === 'dark') {{
            document.documentElement.setAttribute('data-theme', 'dark');
        }}
        localStorage.setItem('doe-theme', '{theme}');
        localStorage.setItem('doe-lang', '{lang}');
    </script>
    </head>
    """
    html_content = html_content.replace("</head>", inject_script)
    return HTMLResponse(content=html_content)

@app.get("/")
async def root():
    return {"message": "Doe Kanban API is running"}
