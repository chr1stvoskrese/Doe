@echo off
echo 🚀 Начинаем сборку Doe.exe...

rmdir /S /Q build dist
del /Q Doe.spec

pyinstaller --noconfirm ^
    --windowed ^
    --name "Doe" ^
    --add-data "frontend;frontend" ^
    --add-data "src;src" ^
    --hidden-import "src.api.v1.columns" ^
    --hidden-import "src.api.v1.tasks" ^
    --hidden-import "src.api.v1.system" ^
    --hidden-import "src.api.v1.workspaces" ^
    --hidden-import "uvicorn.logging" ^
    --hidden-import "uvicorn.loops" ^
    --hidden-import "uvicorn.loops.auto" ^
    --hidden-import "uvicorn.protocols" ^
    --hidden-import "uvicorn.protocols.http" ^
    --hidden-import "uvicorn.protocols.http.auto" ^
    --hidden-import "uvicorn.protocols.websockets" ^
    --hidden-import "uvicorn.protocols.websockets.auto" ^
    --hidden-import "uvicorn.lifespan" ^
    --hidden-import "uvicorn.lifespan.on" ^
    --hidden-import "uvicorn.lifespan.off" ^
    --hidden-import "aiosqlite" ^
    wrapper.py

echo ✅ Сборка завершена! Ищи Doe.exe в папке dist\Doe
pause
