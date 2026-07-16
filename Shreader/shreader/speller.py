"""Алгоритмическая проверка орфографии русского языка.

Использует словарь pyspellchecker: находит незнакомые слова и предлагает
варианты исправления. Это быстрый первый уровень; контекстные ошибки
и пунктуацию проверяет LLM (см. llm.py).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from spellchecker import SpellChecker

# Русские слова, включая дефисные (что-нибудь, из-за).
_WORD_RE = re.compile(r"[А-ЯЁа-яё]+(?:-[А-ЯЁа-яё]+)*")


@dataclass
class SpellingIssue:
    word: str
    start: int  # смещение в исходном тексте
    end: int
    suggestions: list[str] = field(default_factory=list)


class RussianSpeller:
    def __init__(self) -> None:
        self._checker = SpellChecker(language="ru")

    def check(self, text: str, max_suggestions: int = 5) -> list[SpellingIssue]:
        """Возвращает список незнакомых слов с позициями и подсказками."""
        issues: list[SpellingIssue] = []
        seen_unknown: dict[str, list[str]] = {}

        for match in _WORD_RE.finditer(text):
            word = match.group(0)
            if len(word) < 2:
                continue
            if word.isupper():  # аббревиатуры вроде МГУ, РФ
                continue

            lower = word.lower()
            if lower in seen_unknown:
                suggestions = seen_unknown[lower]
            else:
                if not self._checker.unknown([lower]):
                    continue
                candidates = self._checker.candidates(lower) or set()
                suggestions = sorted(
                    c for c in candidates if c != lower
                )[:max_suggestions]
                seen_unknown[lower] = suggestions

            issues.append(
                SpellingIssue(
                    word=word,
                    start=match.start(),
                    end=match.end(),
                    suggestions=suggestions,
                )
            )
        return issues
