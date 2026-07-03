#!/bin/bash
# ============================================================
#  Сборка красивого распространяемого DMG для сайта
#
#  Что делает:
#   1. Ad-hoc подписывает Doe.app (бесплатно, обязательно для Apple Silicon)
#   2. Собирает содержимое: Doe.app, ярлык Applications, установщик
#      «Установить Doe.command», ПЕРВЫЙ_ЗАПУСК.txt
#   3. Оформляет окно: фоновая картинка, расстановка иконок, размер окна
#   4. Ставит иконку Doe и на том, и на сам .dmg файл
#
#  Использование:  ./make_dmg.sh [путь к Doe.app] [версия]
#  По умолчанию: dist/Doe.app, версия 1.0
#  Требования: запуск на macOS; для расстановки иконок скрипту нужен
#  доступ к управлению Finder (macOS спросит один раз).
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
APP="${1:-$ROOT/dist/Doe.app}"
VERSION="${2:-1.0}"
VOL_NAME="Doe"
DMG_FINAL="$ROOT/Doe-${VERSION}.dmg"
DMG_TMP="$ROOT/.doe-tmp.dmg"
STAGE="$(mktemp -d)/DoeDMG"
ASSETS="$ROOT/dmg-assets"

[ -d "$APP" ] || { echo "❌ Не найден $APP — сначала: python build.py"; exit 1; }
[ -f "$ASSETS/background.png" ] || { echo "❌ Нет $ASSETS/background.png"; exit 1; }
[ -f "$ROOT/doe.icns" ] || { echo "❌ Нет $ROOT/doe.icns"; exit 1; }

echo "🔏 Ad-hoc подпись приложения..."
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP" && echo "   подпись валидна"

echo "📦 Подготовка содержимого..."
mkdir -p "$STAGE/.background"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
cp "$ASSETS/background.png" "$STAGE/.background/background.png"
cp "$ROOT/doe.icns" "$STAGE/.VolumeIcon.icns"

cp "$ASSETS/Установить Doe.command" "$STAGE/Установить Doe.command"
chmod +x "$STAGE/Установить Doe.command"

cat > "$STAGE/ПЕРВЫЙ_ЗАПУСК.txt" <<'EOF'
Doe — первый запуск
====================

БЫСТРЫЙ СПОСОБ (рекомендуется)
  Двойной клик по «Установить Doe» в этом окне.
  Установщик сам скопирует приложение, снимет карантин и запустит.

  Если macOS заблокирует сам установщик:
  правый клик по нему → «Открыть» → «Открыть».

РУЧНОЙ СПОСОБ
  1. Перетащите Doe.app в папку Applications (ярлык рядом).
  2. Снимите карантин одной командой в Терминале:

         xattr -cr /Applications/Doe.app

     Либо без терминала: запустите Doe → в предупреждении нажмите
     «Done» → Системные настройки → Конфиденциальность и
     безопасность → внизу «Открыть всё равно» (Open Anyway).

ПОЧЕМУ ТАК
  Doe не нотаризован в Apple: у проекта нет платной лицензии
  разработчика ($99/год) — приложение бесплатное, локальное
  и без слежки. macOS помечает такие приложения карантином,
  который снимается один раз любым способом выше.
EOF

echo "💿 Создание временного образа (read-write)..."
rm -f "$DMG_TMP" "$DMG_FINAL"
hdiutil create -volname "$VOL_NAME" -srcfolder "$STAGE" -ov -format UDRW "$DMG_TMP" >/dev/null

echo "🎨 Оформление окна Finder..."
MOUNT_DIR="/Volumes/$VOL_NAME"
# на случай, если том с таким именем уже примонтирован
hdiutil detach "$MOUNT_DIR" >/dev/null 2>&1 || true
hdiutil attach "$DMG_TMP" -readwrite -noverify -noautoopen >/dev/null
sleep 1

# Иконка тома (флаг custom icon)
if command -v SetFile >/dev/null 2>&1; then
    SetFile -a C "$MOUNT_DIR"
else
    echo "   ⚠️ SetFile не найден (xcode-select --install) — иконка тома пропущена"
fi

osascript <<OSA
tell application "Finder"
    tell disk "$VOL_NAME"
        open
        set current view of container window to icon view
        set toolbar visible of container window to false
        set statusbar visible of container window to false
        set the bounds of container window to {200, 120, 860, 580}
        set vo to the icon view options of container window
        set arrangement of vo to not arranged
        set icon size of vo to 100
        set text size of vo to 12
        set background picture of vo to file ".background:background.png"
        set position of item "Doe.app" of container window to {165, 185}
        set position of item "Applications" of container window to {495, 185}
        set position of item "Установить Doe.command" of container window to {150, 352}
        set position of item "ПЕРВЫЙ_ЗАПУСК.txt" of container window to {585, 352}
        close
        open
        update without registering applications
        delay 2
        close
    end tell
end tell
OSA

sync
hdiutil detach "$MOUNT_DIR" >/dev/null

echo "🗜  Сжатие в финальный образ..."
hdiutil convert "$DMG_TMP" -format UDZO -imagekey zlib-level=9 -o "$DMG_FINAL" >/dev/null
rm -f "$DMG_TMP"
rm -rf "$STAGE"

echo "🖼  Иконка на сам .dmg файл..."
osascript <<OSA >/dev/null
use framework "AppKit"
set img to (current application's NSImage's alloc()'s initWithContentsOfFile:"$ROOT/doe.icns")
(current application's NSWorkspace's sharedWorkspace()'s setIcon:img forFile:"$DMG_FINAL" options:0)
OSA

echo ""
echo "✅ Готово: $DMG_FINAL"
echo "   Внутри: Doe.app, ярлык Applications, «Установить Doe», ПЕРВЫЙ_ЗАПУСК.txt"
echo "   Это файл для выкладывания на сайт."
