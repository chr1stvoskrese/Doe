@echo off
echo Cleaning up old Doe processes...
taskkill /F /IM Doe.exe /T >nul 2>&1
timeout /T 1 /NOBREAK >nul

echo Cleaning up old build artifacts...
rmdir /S /Q build dist >nul 2>&1
del /Q Doe.spec >nul 2>&1
del /Q doe_source.zip >nul 2>&1

echo ==============================================
echo Bundling pristine Source Code...
echo ==============================================
echo import zipfile, os > make_source_zip.py
echo ignore_dirs = {'.git', 'venv', '__pycache__', 'build', 'dist', '.idea', '.vscode'} >> make_source_zip.py
echo ignore_exts = {'.pyc', '.db', '.sqlite3', '.doe', '.DS_Store', '.log'} >> make_source_zip.py
echo with zipfile.ZipFile('doe_source.zip', 'w', zipfile.ZIP_DEFLATED) as zf: >> make_source_zip.py
echo     for root, dirs, files in os.walk('.'): >> make_source_zip.py
echo         dirs[:] = [d for d in dirs if d not in ignore_dirs] >> make_source_zip.py
echo         for file in files: >> make_source_zip.py
echo             if any(file.endswith(ext) for ext in ignore_exts) or file in ['doe_source.zip', 'make_source_zip.py']: continue >> make_source_zip.py
echo             path = os.path.join(root, file) >> make_source_zip.py
echo             zf.write(path, path) >> make_source_zip.py
python make_source_zip.py
del make_source_zip.py

echo ==============================================
echo Generating Version Info for pristine Windows Notifications...
echo ==============================================

:: Корректная генерация чистого ASCII-файла version.txt
echo import base64; open('version.txt', 'wb').write(base64.b64decode(b'VlNWZXJzaW9uSW5mbygKICBmZmk9Rml4ZWRGaWxlSW5mbygKICAgIGZpbGV2ZXJzPSgxLCAwLCAwLCAwKSwKICAgIHByb2R2ZXJzPSgxLCAwLCAwLCAwKSwKICAgIG1hc2s9MHgzZiwKICAgIGZsYWdzPTB4MCwKICAgIE9TPTB4NDAwMDQsCiAgICBmaWxlVHlwZT0weDEsCiAgICBzdWJ0eXBlPTB4MCwKICAgIGRhdGU9KDAsIDApCiAgICApLAogIGtpZHM9WwogICAgU3RyaW5nRmlsZUluZm8oWwogICAgICBTdHJpbmdUYWJsZSgKICAgICAgICAnMDQwOTA0QjAnLAogICAgICAgIFtTdHJpbmdTdHJ1Y3QoJ0ZpbGVEZXNjcmlwdGlvbicsICdEb2UnKSwKICAgICAgICBTdHJpbmdTdHJ1Y3QoJ09yaWdpbmFsRmlsZW5hbWUnLCAnRG9lLmV4ZScpXQogICAgICApCiAgICBdKSwgCiAgICBWYXJGaWxlSW5mbyhbVmFyU3RydWN0KCdUcmFuc2xhdGlvbicsIFsxMDMzLCAxMjAwXSldKQogIF0KKQ==')) > make_version.py

python make_version.py
del make_version.py

echo ==============================================
echo Building main Doe app (Zero-Lag Worker included)...
echo ==============================================
pyinstaller --noconfirm ^
    --windowed ^
    --name "Doe" ^
    --icon="favicon.ico" ^
    --version-file="version.txt" ^
    --add-data "favicon.ico;." ^
    --add-data "doe.png;." ^
    --add-data "doe_source.zip;." ^
    --add-data "frontend;frontend" ^
    --add-data "src;src" ^
    --add-data "alembic.ini;." ^
    --add-data "alembic;alembic" ^
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
    --hidden-import "watchdog" ^
    --hidden-import "websockets" ^
    wrapper.py

del /Q version.txt >nul 2>&1

if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to build Doe app!
    pause
    exit /b %ERRORLEVEL%
)

echo Build completed successfully!
pause
