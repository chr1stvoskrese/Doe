@echo off
echo [*] Cleaning up old Doe processes...
taskkill /F /IM Doe.exe /T >nul 2>&1

echo [>] Starting Doe.exe RELEASE build process...

rmdir /S /Q build dist
del /Q Doe.spec

:: Добавлен флаг --windowed для создания настоящего GUI-приложения без черного терминала
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

echo [V] Build completed!
pause
