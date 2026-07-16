"""Проверка пунктуации и контекстных ошибок через локальную LLM.

Работает с Ollama (https://ollama.com) на этой же машине.
По умолчанию используется модель gemma4:

    ollama pull gemma4
"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.request

DEFAULT_MODEL = "gemma4"
DEFAULT_BASE_URL = "http://localhost:11434"

SYSTEM_PROMPT = """\
Ты — профессиональный корректор русского языка.
Исправь в тексте пользователя ТОЛЬКО орфографию и пунктуацию:
- орфографические ошибки и опечатки;
- запятые, тире, двоеточия и прочие знаки препинания по правилам русского языка;
- кавычки: внешние — «ёлочки», вложенные — „лапки“.

Строгие правила:
- НЕ меняй смысл, стиль, порядок слов и формулировки.
- НЕ добавляй и не удаляй предложения.
- Полностью сохраняй Markdown-разметку: заголовки, списки, ссылки,
  `инлайн-код` и код-блоки не изменяй вообще.
- В ответе верни ТОЛЬКО исправленный текст, без пояснений и комментариев.
"""

# Ollama работает локально — прокси из окружения обходим.
_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


class OllamaError(RuntimeError):
    pass


def correct_text(
    text: str,
    model: str = DEFAULT_MODEL,
    base_url: str = DEFAULT_BASE_URL,
    timeout: float = 600.0,
) -> str:
    """Отправляет текст в Ollama и возвращает исправленную версию."""
    payload = {
        "model": model,
        "stream": False,
        "options": {"temperature": 0.1},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
    }
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}/api/chat",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with _opener.open(request, timeout=timeout) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise OllamaError(
            f"Ollama вернула ошибку {exc.code}: {detail}\n"
            f"Убедитесь, что модель скачана: ollama pull {model}"
        ) from exc
    except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
        raise OllamaError(
            f"Не удалось подключиться к Ollama ({base_url}): {exc}\n"
            "Убедитесь, что Ollama запущена: ollama serve"
        ) from exc

    content = (data.get("message") or {}).get("content", "")
    return _strip_wrapping(content)


def _strip_wrapping(text: str) -> str:
    """Убирает обёртку, которую модель иногда добавляет вокруг ответа."""
    text = text.strip()
    # Ответ целиком завёрнут в ```...``` — снимаем обёртку.
    match = re.fullmatch(r"```[a-zA-Z]*\n(.*)\n```", text, re.DOTALL)
    if match:
        text = match.group(1)
    return text
