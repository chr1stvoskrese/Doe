"""Маскировка фрагментов Markdown, которые нельзя трогать при проверке.

Код-блоки, инлайн-код, URL и HTML-теги заменяются на плейсхолдеры,
чтобы орфографическая проверка и расстановка кавычек их не ломали.
Текст ссылок ([вот такой](url)) при этом остаётся видимым для проверки —
маскируется только часть с адресом.
"""

from __future__ import annotations

import re

# Порядок важен: сначала многострочные код-блоки, потом всё остальное.
_MASK_PATTERNS = [
    re.compile(r"```.*?(?:```|\Z)", re.DOTALL),  # ```код```
    re.compile(r"`[^`\n]+`"),                    # `инлайн-код`
    re.compile(r"(?<=\])\([^)\n]*\)"),           # (url) после ] — адрес ссылки
    re.compile(r"https?://\S+"),                 # голые URL
    re.compile(r"<[^<>\n]+>"),                   # HTML-теги и автоссылки
]

_PLACEHOLDER = "\x00{}\x00"
_PLACEHOLDER_RE = re.compile(r"\x00(\d+)\x00")


def mask(text: str) -> tuple[str, list[str]]:
    """Заменяет защищаемые фрагменты плейсхолдерами.

    Возвращает (текст с плейсхолдерами, список исходных фрагментов).
    """
    saved: list[str] = []

    def _replace(match: re.Match) -> str:
        saved.append(match.group(0))
        return _PLACEHOLDER.format(len(saved) - 1)

    for pattern in _MASK_PATTERNS:
        text = pattern.sub(_replace, text)
    return text, saved


def unmask(text: str, saved: list[str]) -> str:
    """Возвращает замаскированные фрагменты на место."""
    return _PLACEHOLDER_RE.sub(lambda m: saved[int(m.group(1))], text)
