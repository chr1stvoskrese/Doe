"""Типографские кавычки для русского текста.

Прямые кавычки (") и «умные» английские (“ ”) заменяются на «ёлочки»,
вложенные кавычки — на „лапки“. Фрагменты Markdown (код, URL)
предварительно маскируются в вызывающем коде.
"""

from __future__ import annotations

OPEN, CLOSE = "«", "»"
INNER_OPEN, INNER_CLOSE = "„", "“"

# Символы, которые считаем "кавычкой, требующей нормализации".
_OPENING_HINTS = set(" \t\n([{-—–«„")
_STRAIGHT = {'"', "“", "”", "„", "«", "»"}


def fix_quotes(text: str) -> str:
    """Расставляет «ёлочки» и вложенные „лапки“ по всему тексту."""
    result: list[str] = []
    depth = 0

    for i, ch in enumerate(text):
        if ch == "«":
            depth += 1
            result.append(OPEN if depth == 1 else INNER_OPEN)
            continue
        if ch == "»":
            depth = max(0, depth - 1)
            result.append(INNER_CLOSE if depth >= 1 else CLOSE)
            continue
        if ch not in _STRAIGHT:
            result.append(ch)
            continue

        # Прямая или "умная" кавычка: решаем, открывающая она или закрывающая.
        prev = text[i - 1] if i > 0 else ""
        is_opening = i == 0 or prev in _OPENING_HINTS
        if ch in ("“", "„"):
            is_opening = True
        elif ch == "”":
            is_opening = False

        if is_opening and depth < 2:
            depth += 1
            result.append(OPEN if depth == 1 else INNER_OPEN)
        elif depth > 0:
            depth -= 1
            result.append(INNER_CLOSE if depth >= 1 else CLOSE)
        else:
            # Закрывающая без открывающей — оставляем «ёлочку»-закрывашку.
            result.append(CLOSE)

    return "".join(result)
