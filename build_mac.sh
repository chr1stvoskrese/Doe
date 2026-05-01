#!/bin/bash

echo "Начинаем сборку Doe.app..."

rm -rf build dist Doe.spec

# ==========================================
# МАГИЯ MACOS: Генерируем .icns из doe.png
# ==========================================
if [ -f "doe.png" ]; then
    echo "Генерация doe.icns из doe.png..."
    mkdir -p Doe.iconset
    sips -z 16 16     doe.png --out Doe.iconset/icon_16x16.png
    sips -z 32 32     doe.png --out Doe.iconset/icon_16x16@2x.png
    sips -z 32 32     doe.png --out Doe.iconset/icon_32x32.png
    sips -z 64 64     doe.png --out Doe.iconset/icon_32x32@2x.png
    sips -z 128 128   doe.png --out Doe.iconset/icon_128x128.png
    sips -z 256 256   doe.png --out Doe.iconset/icon_128x128@2x.png
    sips -z 256 256   doe.png --out Doe.iconset/icon_256x256.png
    sips -z 512 512   doe.png --out Doe.iconset/icon_256x256@2x.png
    sips -z 512 512   doe.png --out Doe.iconset/icon_512x512.png
    sips -z 1024 1024 doe.png --out Doe.iconset/icon_512x512@2x.png
    iconutil -c icns Doe.iconset -o doe.icns
    rm -R Doe.iconset
fi
# ==========================================

pyinstaller --noconfirm \
    --windowed \
    --name "Doe" \
    --icon="doe.icns" \
    --add-data "favicon.ico:." \
    --add-data "doe.png:." \
    --add-data "frontend:frontend" \
    --add-data "src:src" \
    --hidden-import "src.api.v1.columns" \
    --hidden-import "src.api.v1.tasks" \
    --hidden-import "src.api.v1.system" \
    --hidden-import "src.api.v1.workspaces" \
    --hidden-import "webview.platforms.cocoa" \
    --hidden-import "uvicorn.logging" \
    --hidden-import "uvicorn.loops" \
    --hidden-import "uvicorn.loops.auto" \
    --hidden-import "uvicorn.protocols" \
    --hidden-import "uvicorn.protocols.http" \
    --hidden-import "uvicorn.protocols.http.auto" \
    --hidden-import "uvicorn.protocols.websockets" \
    --hidden-import "uvicorn.protocols.websockets.auto" \
    --hidden-import "uvicorn.lifespan" \
    --hidden-import "uvicorn.lifespan.on" \
    --hidden-import "uvicorn.lifespan.off" \
    --hidden-import "aiosqlite" \
    wrapper.py

echo "Выполняем локальную подпись (Ad-Hoc)..."
codesign --force --deep --sign - dist/Doe.app

echo "Снимаем атрибут карантина macOS..."
xattr -cr dist/Doe.app

echo "Сборка завершена!"
