#!/bin/bash

echo "Начинаем сборку Doe.app..."

rm -rf build dist Doe.spec

# ==========================================
# МАГИЯ MACOS: Генерируем ПРАВИЛЬНЫЙ .icns с отступами 0.82
# ==========================================
if [ -f "doe.png" ]; then
    echo "Генерация doe.icns с идеальными отступами..."
    mkdir -p Doe.iconset

    make_icon() {
        local size=$1
        local name=$2
        # Вычисляем размер картинки внутри (82% от холста)
        # Округляем до целого числа
        local content_size=$(python3 -c "print(int($size * 0.82))")
        
        # 1. Ресайзим исходный png до 82% от целевого размера
        sips -z $content_size $content_size doe.png --out "Doe.iconset/tmp.png" > /dev/null
        # 2. Помещаем его в центр прозрачного холста полного размера ($size)
        sips -p $size $size "Doe.iconset/tmp.png" --out "Doe.iconset/$name.png" > /dev/null
    }

    make_icon 16    icon_16x16
    make_icon 32    icon_16x16@2x
    make_icon 32    icon_32x32
    make_icon 64    icon_32x32@2x
    make_icon 128   icon_128x128
    make_icon 256   icon_128x128@2x
    make_icon 256   icon_256x256
    make_icon 512   icon_256x256@2x
    make_icon 512   icon_512x512
    make_icon 1024  icon_512x512@2x

    rm "Doe.iconset/tmp.png"
    iconutil -c icns Doe.iconset -o doe.icns
    rm -R Doe.iconset
fi

pyinstaller --noconfirm \
    --windowed \
    --name "Doe" \
    --icon="doe.icns" \
    --osx-bundle-identifier "com.aesthetic.doe" \
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

echo "Выполняем локальную подпись..."
codesign --force --deep --sign - dist/Doe.app

echo "Снимаем атрибут карантина..."
xattr -cr dist/Doe.app

# Сброс кэша LaunchServices, чтобы macOS увидела новую иконку немедленно
/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -f dist/Doe.app

echo "Сборка завершена!"
