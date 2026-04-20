"""
Точка входа FastAPI приложения.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
import uvicorn

from src.api.v1 import columns, tasks
from src.db.database import init_dev_database


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Жизненный цикл приложения (заменяет устаревшие on_event)."""
    # Логика при запуске (startup)
    vault_path = await init_dev_database()
    print(f"✅ База данных инициализирована в: {vault_path}")
    
    yield  # В этот момент FastAPI сервер работает и принимает запросы
    
    # Логика при выключении сервера (shutdown)
    # Например, здесь можно закрывать соединения с базой (пока оставим пустым)
    print("🛑 Сервер останавливается...")


# Передаем lifespan при инициализации FastAPI
app = FastAPI(title="Doe API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключаем роутеры API
app.include_router(columns.router, prefix="/api/v1")
app.include_router(tasks.router, prefix="/api/v1")

# Раздаём статические файлы (CSS, JS) из папки frontend
frontend_path = Path(__file__).parent / "frontend"
app.mount("/static", StaticFiles(directory=frontend_path), name="static")


@app.get("/app")
async def serve_index():
    """Отдаёт главную страницу приложения."""
    return FileResponse(frontend_path / "index.html")


@app.get("/")
async def root():
    return {"message": "Doe Kanban API is running"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)