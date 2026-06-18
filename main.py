from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from src.core.config import get_ui_settings
from pathlib import Path
import uvicorn
import sys
from src.api.v1 import columns, tasks, system
from src.db.database import init_dev_database, close_database
from src.api.v1 import columns, tasks, system, workspaces 
from src.db.database import init_dev_database, close_database
from fastapi import Response

from src.core.config import get_active_vault, get_attachments_dir
from src.core.watcher import vault_observer # <-- ИМПОРТ




@asynccontextmanager
async def lifespan(app: FastAPI):
    vault_path = await init_dev_database()
    print(f"✅ База данных инициализирована в: {vault_path}")
    
    yield
    
    vault_observer.stop() # <-- ГЛУШИМ WATCHER
    await close_database()
    print("🛑 Сервер останавливается...")

app = FastAPI(title="Doe API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/doe/{file_path:path}")
async def serve_attachment(file_path: str):
    """
    Раздает файлы из папки doe (локальной или глобальной).
    Это необходимо, чтобы Markdown мог рендерить теги <img> с относительными путями.
    Папка называется "doe", потому что концептуально файлы принадлежат приложению Doe.
    """
    attachments_dir = get_attachments_dir()
    full_path = attachments_dir / file_path
    
    if full_path.exists() and full_path.is_file():
        return FileResponse(full_path)
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

app.include_router(columns.router, prefix="/api/v1")
app.include_router(tasks.router, prefix="/api/v1")
app.include_router(system.router, prefix="/api/v1")
app.include_router(workspaces.router, prefix="/api/v1")
app.include_router(ai.router, prefix="/api/v1") # <--- ПОДКЛЮЧЕНИЕ

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
    theme = settings.get("theme", "light")
    lang = settings.get("language", "ru")
    
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

if __name__ == "__main__":
    # reload=False — без дочернего процесса atexit-очистка LLM (Metal)
    # отрабатывает корректно, без SIGBUS от ggml_metal_device_free.
    try:
        uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
    except KeyboardInterrupt:
        pass
    print("\n👋 Завершение работы.")
