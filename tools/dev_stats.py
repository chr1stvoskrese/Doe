#!/usr/bin/env python3
# ============================================================
#  📊 dev_stats.py — сколько времени заняла разработка Doe
#
#  Показывает: дату первого и последнего коммита, время между
#  ними (потрачено на разработку) и общее число коммитов.
#
#  Использование:  python dev_stats.py  (из корня репозитория)
# ============================================================
import subprocess
import sys
from datetime import datetime, timezone

PINE = "\033[38;5;65m"
BOLD = "\033[1m"
DIM = "\033[2m"
NC = "\033[0m"


def git(*args) -> str:
    try:
        return subprocess.check_output(
            ["git", *args], text=True, stderr=subprocess.DEVNULL
        ).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("❌ Это не git-репозиторий (или git не установлен).")
        sys.exit(1)


def ru_plural(n: int, one: str, few: str, many: str) -> str:
    if n % 10 == 1 and n % 100 != 11:
        return one
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return few
    return many


# Что считаем кодом: собственные исходники проекта.
# Вендорные бандлы (*.min.js / *.min.css) не считаются — это чужой код.
CODE_EXTS = {".py", ".js", ".css", ".html", ".sh", ".ini", ".mako", ".command"}


def count_code_lines() -> int:
    total = 0
    for path in git("ls-files").splitlines():
        low = path.lower()
        if low.endswith((".min.js", ".min.css")):
            continue
        if not any(low.endswith(ext) for ext in CODE_EXTS):
            continue
        try:
            with open(path, "rb") as f:
                total += sum(1 for _ in f)
        except OSError:
            continue
    return total


def main():
    # Unix-таймстампы первого и последнего коммита (по авторскому времени)
    first_ts = int(git("log", "--reverse", "--format=%at").splitlines()[0])
    last_ts = int(git("log", "-1", "--format=%at"))
    total = int(git("rev-list", "--count", "HEAD"))
    code_lines = count_code_lines()

    first = datetime.fromtimestamp(first_ts, tz=timezone.utc).astimezone()
    last = datetime.fromtimestamp(last_ts, tz=timezone.utc).astimezone()

    # Календарная разбивка: годы и месяцы считаются честно (по датам,
    # а не «30 дней = месяц»), остаток — в днях/часах/минутах.
    def add_months(dt: datetime, n: int) -> datetime:
        y, m = divmod(dt.month - 1 + n, 12)
        year, month = dt.year + y, m + 1
        # 31 января + 1 месяц → 28/29 февраля
        day = min(dt.day, [31, 29 if (year % 4 == 0 and year % 100 != 0) or year % 400 == 0 else 28,
                           31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
        return dt.replace(year=year, month=month, day=day)

    months_total = 0
    while add_months(first, months_total + 1) <= last:
        months_total += 1
    years, months = divmod(months_total, 12)

    rest = last - add_months(first, months_total)
    days = rest.days
    hours, rem = divmod(rest.seconds, 3600)
    minutes = rem // 60

    parts = []
    if years:
        parts.append(f"{years} {ru_plural(years, 'год', 'года', 'лет')}")
    if months:
        parts.append(f"{months} {ru_plural(months, 'месяц', 'месяца', 'месяцев')}")
    if days:
        parts.append(f"{days} {ru_plural(days, 'день', 'дня', 'дней')}")
    if hours:
        parts.append(f"{hours} {ru_plural(hours, 'час', 'часа', 'часов')}")
    if minutes or not parts:
        parts.append(f"{minutes} {ru_plural(minutes, 'минута', 'минуты', 'минут')}")
    span = " ".join(parts)

    fmt = "%d.%m.%Y %H:%M"
    print()
    print(f"   {PINE}{BOLD}Doe — статистика разработки{NC}")
    print(f"   {DIM}{'─' * 42}{NC}")
    print(f"   Первый коммит:   {first.strftime(fmt)}")
    print(f"   Последний коммит: {last.strftime(fmt)}")
    print(f"   {DIM}{'─' * 42}{NC}")
    print(f"   ⏱  Времени на разработку:  {BOLD}{span}{NC}")
    print(f"   🔨 Всего коммитов:         {BOLD}{total}{NC}")
    print(f"   📝 Строк кода:             {BOLD}{code_lines:,}{NC} {DIM}(без вендорных библиотек){NC}".replace(",", " "))
    print()


if __name__ == "__main__":
    main()
