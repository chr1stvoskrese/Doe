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

@asynccontextmanager
async def lifespan(app: FastAPI):
    vault_path = await init_dev_database()
    print(f"✅ База данных инициализирована в: {vault_path}")
    
    yield
    
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

app.include_router(columns.router, prefix="/api/v1")
app.include_router(tasks.router, prefix="/api/v1")
app.include_router(system.router, prefix="/api/v1")
app.include_router(workspaces.router, prefix="/api/v1")

if getattr(sys, 'frozen', False):
    base_dir = Path(sys._MEIPASS)
else:
    base_dir = Path(__file__).parent

frontend_path = base_dir / "frontend"
app.mount("/static", StaticFiles(directory=frontend_path), name="static")

@app.get("/app", response_class=HTMLResponse)
async def serve_index():
    settings = get_ui_settings()
    theme = settings.get("theme", "light")
    lang = settings.get("language", "ru")
    index_file = frontend_path / "index.html"
    with open(index_file, "r", encoding="utf-8") as f:
        html_content = f.read()
    inject_script = f"""
    <script>
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
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
