#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Сборщик контекста для LLM (Doe Project) — v2

Что нового по сравнению с первой версией:
  • Учёт бюджета токенов: при заданном лимите выбираются только самые
    важные файлы — по релевантности задаче + роли файла в проекте.
  • Подсчёт токенов через tiktoken (если установлен) c эвристическим
    фолбэком, который не требует сети.
  • Два режима вывода: `patch` (правки БЫЛО / СТАЛО для ручного «найди-и-замени»
    в редакторе — по умолчанию) и `agent` (прямое редактирование файлов Claude Code).
  • Автогенерация фактического дерева проекта (а не только заявленного).
  • Отчёт: какие файлы вошли, какие опущены и сколько это токенов.
  • Нормальный CLI (argparse) + интерактивный фолбэк.

Запуск:
  python collect_context.py                       # интерактивно, режим patch, без лимита
  python collect_context.py -l 60000              # лимит 60k токенов, правки БЫЛО/СТАЛО
  python collect_context.py -l 40000 --mode agent # под агент Claude Code
  python collect_context.py --task "..." -l 30000 --out ctx.txt
"""

from __future__ import annotations

import argparse
import fnmatch
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path

# ── опциональный буфер обмена ──────────────────────────────────────────────
try:
    import pyperclip
    _HAS_CLIPBOARD = True
except Exception:
    _HAS_CLIPBOARD = False


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║ КОНФИГУРАЦИЯ                                                                ║
# ╚══════════════════════════════════════════════════════════════════════════╝

IGNORE_DIRS = {
    "venv", ".venv", "env", ".git", "__pycache__", "node_modules",
    ".idea", ".vscode", "build", "dist", "__MACOSX", ".pytest_cache",
    ".mypy_cache", ".ruff_cache", "site-packages", ".next", "coverage",
}

IGNORE_EXTS = {
    ".db", ".sqlite", ".sqlite3", ".pyc", ".pyo", ".so", ".dylib", ".dll",
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".svg", ".pdf",
    ".zip", ".tar", ".gz", ".bz2", ".7z", ".bmp", ".woff", ".woff2",
    ".ttf", ".otf", ".eot", ".mp4", ".mov", ".mp3", ".wav",
}

IGNORE_FILES = {".DS_Store", "package-lock.json", "yarn.lock", "poetry.lock"}

# Файлы крупнее этого размера не включаем целиком (вероятно данные/генерёжка).
MAX_FILE_BYTES = 200_000

# Приоритет файла по его роли в проекте (glob → вес). Берётся ПЕРВОЕ
# совпадение сверху вниз, поэтому более частные правила идут раньше.
# __init__.py специально вынесены вверх, чтобы не «всплывать» по правилам пакетов.
PRIORITY_RULES: list[tuple[str, int]] = [
    ("*/__init__.py",       12),
    ("__init__.py",         12),
    ("main.py",            100),
    ("frontend/app.js",     92),
    ("src/services/*.py",   88),
    ("src/api/v1/*.py",     82),
    ("src/db/models.py",    82),
    ("src/db/database.py",  76),
    ("src/schemas/*.py",    70),
    ("frontend/index.html", 66),
    ("src/core/*.py",       48),
    ("frontend/styles.css", 46),
    ("pyproject.toml",      34),
    ("requirements.txt",    34),
    ("*.md",                28),
    ("*",                   50),   # значение по умолчанию
]

DEFAULT_PROJECT_BRIEF = """\
# Роль и проект
Ты — Senior Full-Stack инженер (Frontend + Backend) и UI/UX дизайнер уровня
Apple / Windows. Делаешь аккуратные десктопные приложения без визуальных
артефактов, чисто и строго по существующим паттернам кода.

Проект: Doe — локальное десктопное канбан-приложение для macOS с хранением
данных в выбранной пользователем папке (как Obsidian).
Стек: FastAPI + SQLAlchemy + SQLite (бэкенд), чистый HTML / CSS / JS (фронтенд).

Заявленная архитектура (ориентир; может слегка расходиться с фактом):
Doe/
├── main.py                 # Точка входа: Uvicorn в потоке, init БД, статика, pywebview (в планах)
├── frontend/
│   ├── index.html          # Шапка, контейнер доски, модалки (тема, язык, о программе)
│   ├── styles.css          # Палитра, тёмная/светлая тема, колонки, карточки, меню, анимации
│   └── app.js              # API-клиент, рендер доски, Drag&Drop, меню, модалки, таймеры
├── src/
│   ├── api/v1/             # FastAPI-роутеры: columns.py, tasks.py
│   ├── core/config.py      # Настройки (задел на будущее)
│   ├── db/                 # database.py (async-сессии, engine по пути к vault), models.py
│   └── services/           # column_service.py, task_service.py — бизнес-логика
├── pyproject.toml / requirements.txt
└── alembic/                # Миграции (если используются)
"""

# Режим PATCH (по умолчанию): ответ — набор правок «найди-и-замени», которые
# человек применяет вручную через поиск в редакторе. Поэтому блок БЫЛО обязан
# быть ДОСЛОВНОЙ и УНИКАЛЬНОЙ копией существующего кода — иначе поиск не сработает.
PATCH_INSTRUCTIONS = """\
Отвечай ТОЛЬКО набором правок «найди-и-замени». Я применяю их вручную: копирую
блок БЫЛО, ищу его в редакторе (Cmd/Ctrl+F), удаляю и вставляю блок СТАЛО.

Формат каждой правки строго такой:

### Правка N — <путь/к/файлу>
БЫЛО:
```
<точный фрагмент из файла>
```
СТАЛО:
```
<полная замена этого фрагмента>
```

Жёсткие правила (нарушение = правка не применится):
- БЫЛО — это СИМВОЛ-В-СИМВОЛ копия из присланного файла: те же отступы (табы/пробелы),
  кавычки, регистр, пустые строки. Ничего не переформатируй и не «причёсывай».
- БЫЛО должно быть УНИКАЛЬНЫМ в файле, чтобы поиск нашёл ровно одно место. Если строка
  повторяется — добавь 1–3 соседние строки-якоря сверху/снизу, пока фрагмент не станет уникальным.
- БЫЛО — минимальный непрерывный кусок: только изменяемые строки плюс минимум якорей.
- СТАЛО — это ПОЛНЫЙ готовый текст замены всего блока БЫЛО, который можно вставить как есть.
- НИКОГДА не используй «...», «// без изменений» и прочие заглушки внутри БЫЛО/СТАЛО —
  они ломают поиск и вставку. Нужно пропустить неизменную середину — сделай ДВЕ отдельные правки.
- Одна логическая правка = одна пара БЫЛО/СТАЛО. Не склеивай разнесённые по файлу куски в одну пару.
- ВСТАВКА нового кода (удалять нечего): возьми в БЫЛО существующую строку-якорь, а в СТАЛО — ту же
  строку плюс новый код рядом. Так это остаётся одной операцией «найди-и-замени».
- Правки иди по файлам и сверху вниз внутри файла.
- Не трогай несвязанный код; сохраняй существующий стиль, нейминг и отступы.
- Если каких-то файлов не хватает (см. список опущенных) — попроси их прислать, не выдумывай содержимое.
- В конце — короткий список: какие файлы и зачем менялись."""

# Режим AGENT: для Claude Code / агента, который сам редактирует файлы.
AGENT_INSTRUCTIONS = """\
- Вноси изменения напрямую в файлы своими инструментами (Edit / Write), НЕ печатай диффы как текст.
- Если для задачи нужен файл, которого нет в контексте (см. список опущенных), прочитай его с диска сам — не выдумывай содержимое.
- Строго следуй существующему стилю кода, неймингу и архитектуре проекта.
- Меняй минимально необходимое; не переписывай рабочие модули без причины.
- После правок проверь себя: запусти/собери проект или линтер, если это уместно.
- Если задача допускает несколько трактовок — кратко уточни ДО того, как менять много кода.
- В конце дай короткое резюме: какие файлы и почему изменены."""

STOPWORDS = {
    "это", "для", "как", "что", "при", "или", "был", "была", "было", "быть",
    "нужно", "сделать", "также", "если", "когда", "чтобы", "стало", "надо",
    "the", "and", "for", "with", "this", "that", "from", "into", "should",
}


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║ ПОДСЧЁТ ТОКЕНОВ                                                             ║
# ╚══════════════════════════════════════════════════════════════════════════╝

def make_token_counter():
    """Возвращает функцию подсчёта токенов с атрибутом .kind (описание метода).

    tiktoken (cl100k_base) — разумное приближение для бюджетирования.
    Если он недоступен — эвристика ~3.6 символа/токен (плотный код).
    Точные токенайзеры Anthropic офлайн недоступны, поэтому это ОЦЕНКА.
    """
    try:
        import tiktoken
        enc = tiktoken.get_encoding("cl100k_base")

        def _count(text: str) -> int:
            return len(enc.encode(text, disallowed_special=()))

        _count.kind = "tiktoken / cl100k_base (приближение)"
        return _count
    except Exception:
        def _count(text: str) -> int:
            return max(1, round(len(text) / 3.6))

        _count.kind = "эвристика (символы / 3.6)"
        return _count


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║ СБОР И ОЦЕНКА ФАЙЛОВ                                                        ║
# ╚══════════════════════════════════════════════════════════════════════════╝

@dataclass
class FileEntry:
    path: str            # относительный путь со слэшами
    content: str
    tokens: int
    score: float
    mtime: float
    included: bool = False


def role_weight(rel_path: str) -> int:
    for pattern, weight in PRIORITY_RULES:
        if fnmatch.fnmatch(rel_path, pattern):
            return weight
    return 50


def extract_keywords(task: str) -> list[str]:
    """Достаёт значимые слова из задачи (RU + EN) для матчинга с файлами."""
    words = re.findall(r"[A-Za-zА-Яа-яёЁ_][\w-]{2,}", task.lower())
    return [w for w in dict.fromkeys(words) if w not in STOPWORDS]


def relevance_boost(rel_path: str, content: str, keywords: list[str]) -> float:
    """Чем больше ключевых слов задачи встречается в файле — тем он важнее.
    Совпадение в ИМЕНИ/ПУТИ файла весит сильно больше, чем в теле."""
    if not keywords:
        return 0.0
    path_l = rel_path.lower()
    body_l = content.lower()
    score = 0.0
    for kw in keywords:
        if kw in path_l:
            score += 10
        body_hits = body_l.count(kw)
        if body_hits:
            score += min(body_hits, 8)
    return score


def recency_boost(mtime: float, now: float) -> float:
    age_days = (now - mtime) / 86400
    if age_days < 1:
        return 12
    if age_days < 7:
        return 6
    if age_days < 30:
        return 2
    return 0


def file_block(path: str, content: str) -> str:
    """Финальный блок файла в промпте — именно по нему считаем токены,
    чтобы бюджет учитывал накладные расходы на маркеры START/END."""
    return f"--- START OF FILE {path} ---\n{content}\n--- END OF FILE {path} ---"


def discover(root: Path, counter, keywords: list[str], now: float) -> list[FileEntry]:
    entries: list[FileEntry] = []
    script_name = Path(__file__).name
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in IGNORE_DIRS]
        for fn in filenames:
            if fn in IGNORE_FILES or fn == script_name:
                continue
            if any(fn.endswith(ext) for ext in IGNORE_EXTS):
                continue
            full = Path(dirpath) / fn
            rel = full.relative_to(root).as_posix()
            try:
                st = full.stat()
                if st.st_size > MAX_FILE_BYTES:
                    continue
                content = full.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue  # бинарь / нечитаемое — пропускаем
            score = (
                role_weight(rel)
                + relevance_boost(rel, content, keywords) * 3.0
                + recency_boost(st.st_mtime, now)
            )
            block_tokens = counter(file_block(rel, content)) + 2  # +2 на «\n\n»-склейку
            entries.append(FileEntry(rel, content, block_tokens, score, st.st_mtime))
    return entries


def select(entries: list[FileEntry], budget):
    """Жадно отбираем файлы по убыванию важности, пока влезаем в бюджет.

    budget=None → берём всё. Иначе суммируем токены, пока не превысим лимит.
    Жадность по score предсказуема; один очень большой важный файл может
    «съесть» бюджет — это сознательный компромисс ради простоты.
    """
    ranked = sorted(entries, key=lambda e: (e.score, -e.tokens), reverse=True)
    used = 0
    for e in ranked:
        if budget is None or used + e.tokens <= budget:
            e.included = True
            used += e.tokens
    included = sorted([e for e in ranked if e.included], key=lambda e: e.path)
    omitted = sorted([e for e in ranked if not e.included], key=lambda e: e.path)
    return included, omitted, used


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║ РЕНДЕР ПРОМПТА                                                              ║
# ╚══════════════════════════════════════════════════════════════════════════╝

def build_tree(entries: list[FileEntry], root: Path) -> str:
    """Строит фактическое дерево из путей всех найденных файлов."""
    tree: dict = {}
    for e in entries:
        node = tree
        for part in e.path.split("/"):
            node = node.setdefault(part, {})
    lines = [(root.name or ".") + "/"]

    def walk(node: dict, prefix: str = ""):
        items = sorted(node.items(), key=lambda kv: (not kv[1], kv[0]))  # папки первыми
        for i, (name, child) in enumerate(items):
            last = i == len(items) - 1
            lines.append(prefix + ("└── " if last else "├── ") + name + ("/" if child else ""))
            if child:
                walk(child, prefix + ("    " if last else "│   "))

    walk(tree)
    return "\n".join(lines)


def render_files(included: list[FileEntry]) -> str:
    return "\n\n".join(file_block(e.path, e.content) for e in included)


def assemble(mode: str, brief: str, tree: str, files_text: str,
             omitted: list[FileEntry], task: str) -> str:
    omitted_note = ""
    if omitted:
        names = ", ".join(e.path for e in omitted)
        omitted_note = (
            "\n\n> Опущено из-за лимита токенов "
            f"(прочитай эти файлы с диска сам, если понадобятся): {names}"
        )
    if mode == "agent":
        instructions = AGENT_INSTRUCTIONS
        task_header = "ЗАДАЧА"
    else:  # patch — правки «найди-и-замени» по умолчанию
        instructions = PATCH_INSTRUCTIONS
        task_header = "ЗАДАЧА (ответ — правками БЫЛО / СТАЛО)"

    return (
        f"{brief}\n\n"
        f"# Фактическая структура проекта\n{tree}\n\n"
        f"# Файлы проекта\n{files_text}{omitted_note}\n\n"
        f"# {task_header}\n{task}\n\n"
        f"# Как работать\n{instructions}\n"
    )


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║ CLI / ВВОД                                                                 ║
# ╚══════════════════════════════════════════════════════════════════════════╝

def read_multiline(prompt_text: str) -> str:
    print(prompt_text)
    print("(введите 'END' на новой строке для завершения)")
    lines: list[str] = []
    while True:
        try:
            line = input()
        except EOFError:
            break
        if line.strip() == "END":
            break
        lines.append(line)
    return "\n".join(lines)


def human(n: int) -> str:
    return f"{n:,}".replace(",", " ")


def parse_args():
    p = argparse.ArgumentParser(description="Сборщик контекста проекта для LLM / Claude Code.")
    p.add_argument("--root", default=".", help="Корень проекта (по умолчанию текущая папка).")
    p.add_argument("--mode", choices=("patch", "agent"), default="patch",
                   help="patch = правки БЫЛО/СТАЛО для ручного 'найди-и-замени' (по умолчанию); "
                        "agent = прямое редактирование файлов (Claude Code).")
    p.add_argument("-l", "--limit", type=int, default=None,
                   help="Лимит токенов на весь промпт. 0 или отсутствие = без лимита.")
    p.add_argument("--task", default=None, help="Текст задачи (иначе спросит интерактивно).")
    p.add_argument("--brief-file", default=None, help="Путь к файлу с кастомной 'шапкой'.")
    p.add_argument("--out", default=None, help="Сохранить результат в файл.")
    p.add_argument("--no-clipboard", action="store_true", help="Не копировать в буфер обмена.")
    return p.parse_args()


def main():
    args = parse_args()
    root = Path(args.root).resolve()
    counter = make_token_counter()
    now = time.time()

    brief = DEFAULT_PROJECT_BRIEF
    if args.brief_file:
        brief = Path(args.brief_file).read_text(encoding="utf-8")

    task = args.task or read_multiline(
        "\nЧто нужно сделать? Опиши конкретно: что / где / как и что нельзя ломать:"
    )
    keywords = extract_keywords(task)

    limit = args.limit if (args.limit and args.limit > 0) else None
    if limit is None and args.limit is None and sys.stdin.isatty() and not args.task:
        raw = input("\nЛимит токенов на весь промпт (Enter = без лимита): ").strip()
        limit = int(raw) if raw.isdigit() and int(raw) > 0 else None

    print(f"\nТокенайзер: {counter.kind}")
    print(f"Сканирую: {root}")

    entries = discover(root, counter, keywords, now)
    if not entries:
        print("Не найдено ни одного текстового файла.")
        return

    tree = build_tree(entries, root)

    # Бюджет на файлы = лимит − (бриф + дерево + инструкции + задача) − запас.
    budget = None
    if limit:
        fixed_tokens = counter(assemble(args.mode, brief, tree, "", [], task))
        budget = limit - fixed_tokens - 128
        if budget <= 0:
            print(f"⚠️  Лимит {human(limit)} меньше базовой части промпта "
                  f"(~{human(fixed_tokens)}). Файлы не поместятся.")
            budget = 0

    included, omitted, used = select(entries, budget)
    final_text = assemble(args.mode, brief, tree, render_files(included), omitted, task)
    total = counter(final_text)

    # ── отчёт ──
    print("\n" + "=" * 64)
    print(f"Режим: {args.mode}   |   Лимит: {human(limit) if limit else '∞'}")
    print(f"Включено файлов: {len(included)} / {len(entries)}   "
          f"(~{human(used)} токенов на файлы)")
    print(f"Итог промпта: ~{human(total)} токенов" + (f" из {human(limit)}" if limit else ""))
    print("-" * 64)
    for e in included:
        print(f"  ✓ {e.path}  (~{human(e.tokens)} ток., score {e.score:.0f})")
    for e in omitted:
        print(f"  ✗ {e.path}  (~{human(e.tokens)} ток., score {e.score:.0f}) — опущен")
    print("=" * 64)

    # ── вывод ──
    copied = False
    if not args.no_clipboard and _HAS_CLIPBOARD:
        try:
            pyperclip.copy(final_text)
            print("✅ Скопировано в буфер обмена — вставляй в Claude Code / чат.")
            copied = True
        except Exception as e:
            print("Не удалось скопировать в буфер:", e)
    if args.out or not copied:
        out = Path(args.out) if args.out else Path("llm_context_output.txt")
        out.write_text(final_text, encoding="utf-8")
        print(f"📝 Сохранено в файл: {out}")


if __name__ == "__main__":
    main()
