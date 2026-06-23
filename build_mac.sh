#!/bin/bash

# Активируем виртуальное окружение
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/venv/bin/activate" ]; then
    source "$SCRIPT_DIR/venv/bin/activate"
    echo "🐍 venv activated: $VIRTUAL_ENV" >> "$LOG_FILE"
else
    echo "❌ venv not found at $SCRIPT_DIR/venv/bin/activate" >> "$LOG_FILE"
    exit 1
fi

LOG_FILE="build_mac.log"
> "$LOG_FILE" # Очищаем лог при старте

TOTAL_STEPS=11
CURRENT_STEP=0

# Функция эстетичного прогресс-бара
update_progress() {
    CURRENT_STEP=$((CURRENT_STEP + 1))
    local msg="$1"
    local width=30
    local filled=$(( width * CURRENT_STEP / TOTAL_STEPS ))
    local empty=$(( width - filled ))
    local pct=$(( 100 * CURRENT_STEP / TOTAL_STEPS ))
    
    # Кроссплатформенная генерация заполненного и пустого бара (работает в дефолтном macOS Bash)
    local bar_filled=""
    for ((i=0; i<filled; i++)); do bar_filled="${bar_filled}█"; done
    local bar_empty=""
    for ((i=0; i<empty; i++)); do bar_empty="${bar_empty}░"; done
    
    # \r возвращает каретку, \033[2K очищает строку
    printf "\r\033[2K[\033[32m%s\033[0m%s] %3d%% | %s" "$bar_filled" "$bar_empty" "$pct" "$msg"
}

echo "🚀 Начинаем сборку Doe.app (логи сохраняются в $LOG_FILE)"

# Гигиена сборки: сбрасываем кеш бинарников PyInstaller
# (~/Library/Application Support/pyinstaller/bincache*), чтобы при смене
# версий зависимостей в venv не подтянулись устаревшие .dylib/.so.
# Сам по себе краш ИИ-ассистента был вызван битым сторонним квантом модели,
# а не кешем — это лишь страховка от рассинхрона окружений.
PYINSTALLER_CACHE="$HOME/Library/Application Support/pyinstaller"
if [ -d "$PYINSTALLER_CACHE" ]; then
    rm -rf "$PYINSTALLER_CACHE"
    echo "🧹 PyInstaller cache cleared." >> "$LOG_FILE"
fi

update_progress "Очистка старых билдов..."
rm -rf build dist Doe.spec doe_source.zip >> "$LOG_FILE" 2>&1

update_progress "Упаковка исходного кода (для экспорта)..."
cat << 'EOF' > make_source_zip.py
import zipfile, os
ignore_dirs = {'.git', 'venv', '__pycache__', 'build', 'dist', '.idea', '.vscode', 'Doe.app'}
ignore_exts = {'.pyc', '.db', '.sqlite3', '.doe', '.DS_Store', '.log'}
with zipfile.ZipFile('doe_source.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in ignore_dirs]
        for file in files:
            if any(file.endswith(ext) for ext in ignore_exts) or file in ['doe_source.zip', 'make_source_zip.py']: continue
            path = os.path.join(root, file)
            zf.write(path, path)
EOF
python3 make_source_zip.py >> "$LOG_FILE" 2>&1
rm make_source_zip.py

# ==========================================
# МАГИЯ MACOS: Генерируем ПРАВИЛЬНЫЙ .icns с отступами 0.82
# ==========================================
if [ -f "doe.png" ]; then
    update_progress "Генерация иконок sips..."
    mkdir -p Doe.iconset

    make_icon() {
        local size=$1
        local name=$2
        local content_size=$(python3 -c "print(int($size * 0.82))")
        sips -z $content_size $content_size doe.png --out "Doe.iconset/tmp.png" >> "$LOG_FILE" 2>&1
        sips -p $size $size "Doe.iconset/tmp.png" --out "Doe.iconset/$name.png" >> "$LOG_FILE" 2>&1
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

    rm "Doe.iconset/tmp.png" >> "$LOG_FILE" 2>&1
    
    update_progress "Компиляция файла doe.icns..."
    iconutil -c icns Doe.iconset -o doe.icns >> "$LOG_FILE" 2>&1
    rm -R Doe.iconset >> "$LOG_FILE" 2>&1
else
    update_progress "Пропуск генерации иконок..."
    CURRENT_STEP=$((CURRENT_STEP + 1)) # Компенсируем второй шаг
fi

update_progress "Сборка тихого воркера уведомлений..."
pyinstaller --noconfirm \
    --console \
    --onefile \
    --name "notify_worker" \
    notify_worker.py >> "$LOG_FILE" 2>&1

update_progress "Сборка через PyInstaller (это может занять время)..."
pyinstaller --noconfirm \
    --clean \
    --windowed \
    --argv-emulation \
    --name "Doe" \
    --icon="doe.icns" \
    --osx-bundle-identifier "com.aesthetic.doe" \
    --add-data "favicon.ico:." \
    --add-data "doe.png:." \
    --add-data "ai-logo.png:." \
    --add-data "doe_source.zip:." \
    --add-data "frontend:frontend" \
    --add-data "src:src" \
    --add-data "alembic.ini:." \
    --add-data "alembic:alembic" \
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
    --hidden-import "watchdog" \
    --hidden-import "websockets" \
    --hidden-import "requests" \
    --hidden-import "jinja2" \
    --hidden-import "numpy" \
    --collect-all "llama_cpp" \
    --collect-all "numpy" \
    wrapper.py >> "$LOG_FILE" 2>&1

update_progress "Регистрация UTI в Info.plist..."
cat << 'EOF' > patch_plist.py
import plistlib
import sys

plist_path = 'dist/Doe.app/Contents/Info.plist'

try:
    with open(plist_path, 'rb') as f:
        pl = plistlib.load(f)
        
    pl['UTExportedTypeDeclarations'] = [{
        'UTTypeIdentifier': 'com.aesthetic.doe.vault',
        'UTTypeDescription': 'Doe Vault Database',
        'UTTypeIconFile': 'doe.icns',
        'UTTypeConformsTo': ['public.data', 'public.content'],
        'UTTypeTagSpecification': {
            'public.filename-extension': ['db.doe', 'doe']
        }
    }]

    pl['CFBundleDocumentTypes'] = [{
        'CFBundleTypeName': 'Doe Vault',
        'CFBundleTypeRole': 'Viewer',
        'CFBundleTypeIconFile': 'doe.icns',
        'LSHandlerRank': 'Owner',
        'LSItemContentTypes': ['com.aesthetic.doe.vault'],
        'CFBundleTypeExtensions': ['db.doe', 'doe'],
        'LSTypeIsPackage': False,
        'NSDocumentClass': '',
    }]

    # Основная мета-информация
    pl['CFBundleName'] = 'Doe (demo)'
    pl['CFBundleDisplayName'] = 'Doe (demo)'
    pl['CFBundleIdentifier'] = 'com.aesthetic.doe'
    pl['CFBundleShortVersionString'] = '1.0.0'
    pl['CFBundleVersion'] = '1.0.0'
    pl['CFBundleGetInfoString'] = '1.0.0, © 2026 Doe Kanban Sanctuary'
    pl['NSHumanReadableCopyright'] = '© 2026 Doe Kanban Sanctuary. All rights reserved.'
    
    # Системные флаги
    pl['NSSupportsAutomaticTermination'] = False
    pl['NSSupportsSuddenTermination'] = False

    with open(plist_path, 'wb') as f:
        plistlib.dump(pl, f)
        
except Exception as e:
    print(f"ERROR updating Info.plist: {e}")
    sys.exit(1)
EOF

python3 patch_plist.py >> "$LOG_FILE" 2>&1
rm patch_plist.py

update_progress "Копирование ресурсов и Touch..."
cp doe.icns "dist/Doe.app/Contents/Resources/doe.icns" >> "$LOG_FILE" 2>&1

# Вот то самое действие:
# Копируем "тихий" бинарник из его временной папки прямиком внутрь Doe.app
cp "dist/notify_worker" "dist/Doe.app/Contents/MacOS/notify_worker" >> "$LOG_FILE" 2>&1
chmod +x "dist/Doe.app/Contents/MacOS/notify_worker" >> "$LOG_FILE" 2>&1

# (Опционально) Удаляем папку notify_worker снаружи, чтобы она не мозолила глаза в папке dist
rm -f "dist/notify_worker" >> "$LOG_FILE" 2>&1

touch dist/Doe.app >> "$LOG_FILE" 2>&1

update_progress "Локальная подпись (codesign)..."
codesign --force --deep --sign - dist/Doe.app >> "$LOG_FILE" 2>&1

update_progress "Снятие атрибута карантина..."
xattr -cr dist/Doe.app >> "$LOG_FILE" 2>&1

update_progress "Установка в /Applications (замена)..."
if [ -d "/Applications/Doe.app" ]; then
    rm -rf "/Applications/Doe.app" >> "$LOG_FILE" 2>&1
fi
cp -R dist/Doe.app /Applications/ >> "$LOG_FILE" 2>&1

update_progress "Сброс кэшей (LaunchServices, Finder)..."
# Регистрируем обе копии — в dist и в /Applications
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f -r -v -app dist/Doe.app >> "$LOG_FILE" 2>&1
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f -r -v -app /Applications/Doe.app >> "$LOG_FILE" 2>&1
killall Finder 2>/dev/null || true >> "$LOG_FILE" 2>&1

update_progress "Финализация!"
echo "" # Перевод строки после прогресс-бара
echo ""
echo "✅ Приложение успешно собрано."
echo "📂 Открываем Finder..."
open -R dist/Doe.app
