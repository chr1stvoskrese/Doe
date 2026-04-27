#!/bin/bash

echo "🚀 Начинаем сборку Doe.app..."

# Удаляем старые сборки
rm -rf build dist Doe.spec

# Запускаем упаковщик с полным набором зависимостей
pyinstaller --noconfirm \
    --windowed \
    --name "Doe" \
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

echo "🍏 Выполняем локальную подпись (Ad-Hoc)..."
codesign --force --deep --sign - dist/Doe.app

echo "🛡 Снимаем атрибут карантина macOS..."
xattr -cr dist/Doe.app

echo "✅ Сборка завершена!"
