#!/bin/bash
# ============================================================
#  🦌 Установщик Doe
#  Копирует приложение в Applications, снимает карантин
#  Gatekeeper и запускает — одним двойным кликом.
# ============================================================

# ---------- палитра ----------
PINE='\033[38;5;65m'      # фирменный зелёный
DIM='\033[2m'
BOLD='\033[1m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
NC='\033[0m'

hide_cursor() { printf '\033[?25l'; }
show_cursor() { printf '\033[?25h'; }
trap 'show_cursor; echo' EXIT

clear
hide_cursor
printf "\n"
printf "${PINE}${BOLD}   ██████╗  ██████╗ ███████╗${NC}\n"
printf "${PINE}${BOLD}   ██╔══██╗██╔═══██╗██╔════╝${NC}\n"
printf "${PINE}${BOLD}   ██║  ██║██║   ██║█████╗  ${NC}\n"
printf "${PINE}${BOLD}   ██║  ██║██║   ██║██╔══╝  ${NC}\n"
printf "${PINE}${BOLD}   ██████╔╝╚██████╔╝███████╗${NC}\n"
printf "${PINE}${BOLD}   ╚═════╝  ╚═════╝ ╚══════╝${NC}\n"
printf "\n"
printf "   ${DIM}Aesthetic. Local-first. Kanban sanctuary.${NC}\n"
printf "   ${DIM}────────────────────────────────────────${NC}\n\n"

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_SRC="$SELF_DIR/Doe.app"

if [ ! -d "$APP_SRC" ]; then
    printf "   ${RED}✗ Doe.app не найден рядом с установщиком.${NC}\n"
    printf "   ${DIM}Запускайте установщик из открытого образа Doe.${NC}\n\n"
    read -n 1 -s -r -p "   Нажмите любую клавишу, чтобы закрыть…"
    exit 1
fi

# ---------- куда ставим ----------
DEST="/Applications"
if [ ! -w "$DEST" ]; then
    DEST="$HOME/Applications"
    mkdir -p "$DEST"
    printf "   ${YELLOW}ℹ Нет прав на /Applications — ставлю в ~/Applications${NC}\n\n"
fi
APP_DST="$DEST/Doe.app"

# ---------- рисовалка прогресса ----------
BAR_W=34
draw_bar() {  # $1 = проценты, $2 = подпись
    local pct=$1; [ "$pct" -gt 100 ] && pct=100
    local filled=$(( pct * BAR_W / 100 ))
    local bar=""
    for ((i=0; i<BAR_W; i++)); do
        if [ $i -lt $filled ]; then bar+="█"; else bar+="░"; fi
    done
    printf "\r   ${PINE}%s${NC} ${BOLD}%3d%%${NC}  ${DIM}%s${NC}\033[K" "$bar" "$pct" "$2"
}

step_done() { printf "\r   ${GREEN}✓${NC} %s\033[K\n" "$1"; }

# ---------- 1. закрываем работающий Doe и убираем старую версию ----------
if pgrep -x "Doe" >/dev/null 2>&1; then
    draw_bar 0 "закрываю запущенный Doe…"
    osascript -e 'tell application "Doe" to quit' >/dev/null 2>&1
    sleep 1
    pkill -x "Doe" 2>/dev/null
    sleep 0.5
fi
if [ -d "$APP_DST" ]; then
    draw_bar 0 "удаляю предыдущую версию…"
    rm -rf "$APP_DST"
fi
step_done "Подготовка завершена"

# ---------- 2. копирование с прогрессом ----------
TOTAL_KB=$(du -sk "$APP_SRC" 2>/dev/null | awk '{print $1}')
[ -z "$TOTAL_KB" ] || [ "$TOTAL_KB" -eq 0 ] && TOTAL_KB=1

ditto "$APP_SRC" "$APP_DST" &
COPY_PID=$!
while kill -0 $COPY_PID 2>/dev/null; do
    CUR_KB=$(du -sk "$APP_DST" 2>/dev/null | awk '{print $1}')
    [ -z "$CUR_KB" ] && CUR_KB=0
    draw_bar $(( CUR_KB * 100 / TOTAL_KB )) "копирую в ${DEST}…"
    sleep 0.12
done
wait $COPY_PID
COPY_RC=$?
if [ $COPY_RC -ne 0 ]; then
    printf "\n   ${RED}✗ Не удалось скопировать приложение (код $COPY_RC).${NC}\n\n"
    read -n 1 -s -r -p "   Нажмите любую клавишу, чтобы закрыть…"
    exit 1
fi
draw_bar 100 "копирование завершено"
sleep 0.2
step_done "Doe скопирован в ${DEST}"

# ---------- 3. карантин ----------
draw_bar 100 "снимаю карантин Gatekeeper…"
xattr -cr "$APP_DST" 2>/dev/null
step_done "Карантин снят — macOS больше не будет ругаться"

# ---------- 4. запуск ----------
printf "\n   ${GREEN}${BOLD}Готово!${NC} Запускаю Doe…\n\n"
open "$APP_DST"
sleep 1

# Пробуем аккуратно закрыть окно Терминала с установщиком
osascript <<'OSA' >/dev/null 2>&1 &
delay 0.5
tell application "Terminal"
    close (every window whose name contains "Установить") saving no
end tell
OSA

exit 0
