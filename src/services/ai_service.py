import os
import re
import sys
import platform
import json
from pathlib import Path
from typing import List, Dict, Any

def is_apple_silicon() -> bool:
    # Apple Silicon = macOS на архитектуре arm64. Только на нём доступен
    # Metal-оффлоуд в llama-cpp-python. Intel Mac не поддерживается.
    return sys.platform == 'darwin' and platform.machine() == 'arm64'

APP_GLOBAL_DIR = Path.home() / ".doe_app"
MODELS_DIR = APP_GLOBAL_DIR / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

# Каталог моделей Gemma 4 (Google, 2026).
# Метаданные используются для: фильтрации по tier железа, отображения размера
# в UI, и формирования пути к файлу на HuggingFace.
#
# min_tier: минимальный tier железа (light < standard < pro), при котором
#           модель предлагается к скачиванию в настройках.
# size_gb:  реальный размер GGUF-файла (для отображения в UI).
AVAILABLE_MODELS = {
    "Gemma 4 E2B": {
        "family": "Gemma 4",
        "repo": "google/gemma-4-E2B-it-qat-q4_0-gguf",
        "file": "gemma-4-E2B_q4_0-it.gguf",
        "params": "2.3B",
        "min_tier": "light",
        "size_gb": 3.12,
    },
    "Gemma 4 E4B": {
        "family": "Gemma 4",
        "repo": "google/gemma-4-E4B-it-qat-q4_0-gguf",
        "file": "gemma-4-E4B_q4_0-it.gguf",
        "params": "4.5B",
        "min_tier": "light",
        "size_gb": 4.80,
    },
    "Gemma 4 12B": {
        "family": "Gemma 4",
        "repo": "google/gemma-4-12b-it-qat-q4_0-gguf",
        "file": "gemma-4-12b-it-qat-q4_0.gguf",
        "params": "12B",
        "min_tier": "standard",
        "size_gb": 6.50,
    },
    "Gemma 4 26B (A4B MoE)": {
        "family": "Gemma 4",
        "repo": "google/gemma-4-26b-a4b-it-qat-q4_0-gguf",
        "file": "gemma-4-26B_q4_0-it.gguf",
        "params": "26B (A4B)",
        "min_tier": "pro",
        "size_gb": 13.45,
    },
}

import threading
import atexit
from contextlib import contextmanager

# Блокировка для атомарных операций с памятью (read-modify-write)
_memory_lock = threading.Lock()


@contextmanager
def metal_autorelease_pool():
    """Очистка Metal-памяти в фоновых потоках macOS (Защита от SIGSEGV)."""
    pool = None
    if sys.platform == 'darwin':
        try:
            from Foundation import NSAutoreleasePool
            pool = NSAutoreleasePool.alloc().init()
        except ImportError:
            pass
    try:
        yield
    finally:
        if pool is not None:
            del pool

_llm = None
_current_model_path = None
_llm_lock = threading.Lock()

def safe_chat_completion(llm_instance, **kwargs):
    """Безопасный вызов инференса с локом и агрессивной очисткой памяти GPU."""
    with _llm_lock, metal_autorelease_pool():
        return llm_instance.create_chat_completion(**kwargs)

def _cleanup_llm():
    """Освобождает ресурсы модели при штатном закрытии процесса."""
    global _llm
    if _llm is not None:
        try:
            _llm.close()
        except Exception:
            pass
        _llm = None

atexit.register(_cleanup_llm)

def get_memory_file(vault_path: str) -> Path:
    return Path(vault_path) / "doe" / "user_ai_profile.txt"

def load_user_memory(vault_path: str) -> str:
    mem_file = get_memory_file(vault_path)
    if mem_file.exists():
        try:
            return mem_file.read_text(encoding="utf-8")
        except Exception:
            pass
    return "О пользователе пока мало информации."

def save_user_memory(vault_path: str, memory: str):
    mem_file = get_memory_file(vault_path)
    mem_file.parent.mkdir(parents=True, exist_ok=True)
    mem_file.write_text(memory, encoding="utf-8")

def _migrate_memory(mem: str, today: str) -> str:
    """Добавляет [YYYY-MM-DD] к фактам без временных меток."""
    if not mem or not mem.strip():
        return mem
    lines = []
    for line in mem.strip().split('\n'):
        line = line.strip()
        if not line:
            continue
        if line.startswith('- [20'):  # уже с датой
            lines.append(line)
        elif line.startswith('- '):
            # Добавляем сегодняшнюю дату
            text = line[2:].strip()
            lines.append(f'- [{today}] {text}')
        else:
            lines.append(f'- [{today}] {line}')
    return '\n'.join(lines)

def _strip_timestamp(line: str) -> str:
    """Убирает [YYYY-MM-DD] и ведущий дефис из факта для сравнения."""
    import re
    s = line.strip()
    # Сначала убираем timestamp с датой: "- [YYYY-MM-DD] "
    s = re.sub(r'^-\s*\[\d{4}-\d{2}-\d{2}\]\s*', '', s)
    # Затем убираем оставшийся дефис/маркер списка если есть
    s = re.sub(r'^-\s*', '', s)
    return s.strip()

def atomic_append_memory(vault_path: str, new_facts: str) -> None:
    """Атомарно добавляет факты в память с дедупликацией по тексту (без дат)."""
    from datetime import date
    today = date.today().isoformat()
    with _memory_lock:
        mem = load_user_memory(vault_path)
        if mem.strip() in ("О пользователе пока мало информации.", "Not much information about the user yet."):
            mem = ""
        # Мигрируем старые факты без дат
        mem = _migrate_memory(mem, today)
        mem = mem.strip()
        # Собираем тексты существующих фактов (без дат) для дедупликации
        existing_texts = set()
        for l in mem.split('\n'):
            t = _strip_timestamp(l).lower()
            if t:
                existing_texts.add(t)
        for line in new_facts.split('\n'):
            line = line.strip()
            if not line:
                continue
            fact_text = _strip_timestamp(line)
            if not fact_text:
                continue
            if fact_text.lower() not in existing_texts:
                # Добавляем дату если нет
                if not line.startswith('- [20'):
                    line = f'- [{today}] {fact_text}'
                mem = (mem + '\n' + line) if mem else line
                existing_texts.add(fact_text.lower())
        save_user_memory(vault_path, mem.strip())

def atomic_forget_fact(vault_path: str, fact: str, model_path: str) -> None:
    """Атомарно удаляет факт из памяти (LLM для семантического matching'а).
    Вся операция под _memory_lock — защита от гонки с extract_memory."""
    from datetime import date
    today = date.today().isoformat()
    with _memory_lock:
        old_mem = load_user_memory(vault_path)
        if old_mem.strip() in ("О пользователе пока мало информации.", "Not much information about the user yet."):
            return  # нечего забывать
        old_mem = _migrate_memory(old_mem, today)

        prompt = (
            f"CURRENT MEMORY (today: {today}):\n{old_mem}\n\n"
            f"TASK:\nUser wants to forget this fact: «{fact}».\n"
            f"Rewrite the memory, REMOVING anything related to this fact. "
            f"Keep all other facts intact (with their original dates).\n"
            f"Return ONLY the updated memory text, no greetings."
        )
        llm = get_llm(model_path)
        response = safe_chat_completion(
            llm,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=300,
            temperature=0.1,
        )
        new_mem = response["choices"][0]["message"]["content"].strip()
        save_user_memory(vault_path, new_mem)


# Глобальный стейт загрузки моделей: {"Model-Name": {"progress": 15, "status": "downloading", "error": None, "cancel_requested": False}}
ai_download_state = {}

def get_download_progress(model_name: str) -> dict:
    return ai_download_state.get(model_name, {"progress": 0, "status": "idle", "error": None})

def cancel_download(model_name: str):
    global ai_download_state
    if model_name in ai_download_state:
        ai_download_state[model_name]["cancel_requested"] = True
        ai_download_state[model_name]["status"] = "cancelling"

def download_model_with_progress(model_name: str):
    """Скачивает GGUF через huggingface_hub: с resume, retry и корректным прогрессом."""
    global ai_download_state

    if not is_apple_silicon():
        ai_download_state[model_name] = {"progress": 0, "status": "error", "error": "Требуется Apple Silicon (M1+)"}
        return

    model_info = AVAILABLE_MODELS.get(model_name)
    if not model_info:
        ai_download_state[model_name] = {"progress": 0, "status": "error", "error": "Модель не найдена"}
        return

    file_path = MODELS_DIR / model_info["file"]

    # 🛡 Защита от битых файлов: если уже скачан и весит достаточно — готово
    if file_path.exists() and file_path.stat().st_size > 1024 * 1024 * 100:
        ai_download_state[model_name] = {"progress": 100, "status": "completed", "error": None}
        return

    repo = model_info["repo"]
    filename = model_info["file"]
    url = f"https://huggingface.co/{repo}/resolve/main/{filename}"

    ai_download_state[model_name] = {
        "progress": 0, "status": "downloading", "error": None,
        "cancel_requested": False, "downloaded_bytes": 0, "total_bytes": 0
    }

    temp_file_path = file_path.with_suffix(".download")

    # Очищаем старый временный файл перед новой попыткой
    if temp_file_path.exists():
        try:
            temp_file_path.unlink()
        except Exception:
            pass

    print(f"[AI Download] Starting streaming download: {repo}/{filename}")

    import requests

    max_retries = 3
    last_exc = None

    for attempt in range(1, max_retries + 1):
        # Resume: если частично скачанный temp-файл есть, продолжаем с позиции
        resume_pos = temp_file_path.stat().st_size if temp_file_path.exists() else 0
        headers = {"User-Agent": "Doe/1.0"}
        if resume_pos > 0:
            headers["Range"] = f"bytes={resume_pos}-"

        try:
            with requests.get(url, headers=headers, stream=True, timeout=30) as response:
                if response.status_code not in (200, 206):
                    raise RuntimeError(f"HTTP {response.status_code}")

                # Полный размер: из заголовка. При 206 (Range) Content-Length — это
                # размер остатка, поэтому прибавляем resume_pos.
                content_length = int(response.headers.get("Content-Length", 0))
                total_bytes = resume_pos + content_length if response.status_code == 206 else content_length
                ai_download_state[model_name]["total_bytes"] = total_bytes

                mode = "ab" if response.status_code == 206 and resume_pos > 0 else "wb"
                downloaded = resume_pos

                with open(temp_file_path, mode) as f:
                    for chunk in response.iter_content(chunk_size=1024 * 1024):  # 1 MB
                        # Проверка флага отмены
                        if ai_download_state[model_name].get("cancel_requested"):
                            f.flush()
                            ai_download_state[model_name] = {"progress": 0, "status": "cancelled", "error": None}
                            print(f"[AI Download] Cancelled: {model_name}")
                            return

                        if chunk:
                            f.write(chunk)
                            downloaded += len(chunk)
                            ai_download_state[model_name]["downloaded_bytes"] = downloaded
                            if total_bytes > 0:
                                ai_download_state[model_name]["progress"] = min(99, int(downloaded / total_bytes * 100))

            # Загрузка завершена успешно — переименовываем temp в финальный файл
            if temp_file_path.exists() and temp_file_path.stat().st_size > 1024 * 1024 * 100:
                temp_file_path.replace(file_path)
                ai_download_state[model_name] = {"progress": 100, "status": "completed", "error": None}
                print(f"[AI Download] {model_name} saved to {file_path}")
                return
            else:
                raise RuntimeError("Файл не был сохранён или слишком мал")

        except Exception as e:
            last_exc = e
            err_lower = str(e).lower()
            # Отмена — штатный исход, не ретраим
            if "cancel" in err_lower or ai_download_state[model_name].get("cancel_requested"):
                ai_download_state[model_name] = {"progress": 0, "status": "cancelled", "error": None}
                print(f"[AI Download] Cancelled: {model_name}")
                return
            # Сетевые ошибки — ретраим, частичный файл сохранится для resume
            is_network = any(k in err_lower for k in ("timeout", "timed out", "connection", "reset", "chunked", "incomplete"))
            if is_network and attempt < max_retries:
                print(f"[AI Download] Attempt {attempt} failed ({e}), retrying with resume...")
                continue
            break

    # Все попытки исчерпаны
    err_msg = str(last_exc) if last_exc else "Неизвестная ошибка"
    if any(k in err_msg.lower() for k in ("timeout", "timed out", "connection")):
        err_msg = "Превышено время ожидания или пропал интернет"
    ai_download_state[model_name] = {"progress": 0, "status": "error", "error": err_msg}


for temp_file in MODELS_DIR.glob("*.download"):
    try:
        temp_file.unlink()
        print(f"[AI] Cleared orphaned download file: {temp_file.name}")
    except Exception:
        pass

def delete_model(model_name: str) -> bool:
    global _llm, _current_model_path
    model_info = AVAILABLE_MODELS.get(model_name)
    if not model_info:
        return False
        
    file_path = MODELS_DIR / model_info["file"]
    if file_path.exists():
        try:
            # Если удаляемая модель сейчас загружена в оперативную/видеопамять — выгружаем её
            if _current_model_path == str(file_path):
                _llm = None
                _current_model_path = None
                
            file_path.unlink()
            return True
        except Exception as e:
            print(f"[AI] Error deleting model: {e}")
            return False
    return True

def get_llm(model_path: str):
    global _llm, _current_model_path
    import traceback
    import sys
    import os
    
    if not is_apple_silicon():
        raise ValueError("Requires Apple Silicon.")

    # ПРОВЕРКА ФАЙЛА МОДЕЛИ
    if not os.path.exists(model_path):
        print(f"[AI] ERROR: Model file not found at {model_path}")
        raise FileNotFoundError(f"Файл модели не найден: {model_path}")
    
    file_size = os.path.getsize(model_path)
    if file_size < 100 * 1024 * 1024: # Меньше 100 МБ
        raise ValueError("Файл модели поврежден (слишком маленький размер). Удалите модель в настройках и скачайте заново.")

    with _llm_lock:
        if _llm is not None and _current_model_path == model_path:
            return _llm

        print(f"[AI] Loading model into memory: {model_path} (Size: {file_size / (1024**3):.2f} GB)")
        
        # --- ФИКС ДЛЯ PYINSTALLER (MAC OS METAL) ---
        if getattr(sys, 'frozen', False):
            base_dir = sys._MEIPASS
            # Ищем, куда PyInstaller положил шейдеры (структура меняется в разных версиях библиотеки)
            metal_paths = [
                os.path.join(base_dir, "llama_cpp", "lib"),
                os.path.join(base_dir, "llama_cpp"),
                base_dir
            ]
            for p in metal_paths:
                if os.path.exists(os.path.join(p, "ggml-metal.metal")) or os.path.exists(os.path.join(p, "default.metallib")):
                    os.environ["GGML_METAL_PATH_RESOURCES"] = p
                    print(f"[AI] Metal resources path explicitly set to: {p}")
                    break
        # -------------------------------------------

        try:
            from llama_cpp import Llama
            _llm = Llama(
                model_path=model_path,
                n_gpu_layers=-1,   
                n_ctx=16384,        
                flash_attn=True,   # <--- КРИТИЧЕСКИЙ ФИКС ДЛЯ GEMMA 4 (Убирает паддинг V-кэша)
                verbose=False
            )
            _current_model_path = model_path
            print("[AI] Model loaded into Metal Unified Memory successfully.")
            return _llm
        except Exception as e:
            print(f"[AI] FATAL ERROR loading model into memory: {e}")
            traceback.print_exc()
            raise

# Находим импорты из config вверху файла и добавляем get_ui_settings:
from src.core.config import get_active_vault, get_ui_settings  # <--- Добавили get_ui_settings

# Максимальное число токенов в ответе психолога. Раньше было 500 — ответы
# обрезались на середине мысли. 1024 достаточно для развёрнутого, но не
# разрастающегося диалога.
MAX_CHAT_TOKENS = 2048

# --- СИСТЕМНЫЕ ИНСТРУКЦИИ (семейство-агностик, упор на function-calling) ---
# Убраны инструкции про <call>-теги как основной путь — теперь модель использует
# нативные tool_calls. Краткое упоминание оставлено как фолбэк для моделей,
# которые не умеют function-calling.

# --- СИСТЕМНЫЕ ИНСТРУКЦИИ (семейство-агностик, упор на function-calling) ---

SYSTEM_PROMPT_RU = """Ты — ИИ-ассистент, воплощающий образ профессионального психолога с двадцатилетним стажем. Ты ведёшь приём как опытный специалист: спокойно, вдумчиво, с глубоким пониманием человеческой природы. Твой тон — ровный, уверенный, располагающий к доверию.

Твоя задача — помочь пользователю разобраться в его состоянии, мыслях и задачах. Ты внимательно слушаешь, задаёшь уточняющие вопросы, помогаешь структурировать хаос.

ТВОЙ ПРОФЕССИОНАЛЬНЫЙ БЭКГРАУНД (применяй естественно, не афишируй):
- Клиническая психология, когнитивно-поведенческая терапия, психология отношений.
- Понимание нейробиологии стресса, привычек и мотивации.
- Широкий кругозор в точных науках, медицине, философии.

ПРАВИЛО ЧЕСТНОСТИ:
Если ты не знаешь ответа — скажи об этом прямо, без попыток заполнить паузу выдумкой.

ТЕКУЩЕЕ ВРЕМЯ И СТАТУС:
- Сейчас: {current_time}
- Включенные расширения приложения: {active_extensions}

У ТЕБЯ ЕСТЬ ПОЛНЫЙ ДОСТУП КО ВСЕМ ВКЛАДКАМ ДОСКИ!
Ты видишь ВСЕ вкладки, а не только активную. Активная помечена (АКТИВНАЯ ВКЛАДКА СЕЙЧАС).
Текущая структура доски (Вкладки -> Колонки -> Задачи с их ID и описанием):
{board_state}

Все задачи на доске представлены в виде Markdown-ссылок: [Название](doe://task/ID).

УМНЫЙ ПОИСК (как в IDE):
- `search_board` — ищет по ВСЕМ задачам (названия, описания, подзадачи). Возвращает полные описания совпадений. Используй когда нужно найти информацию, которой нет в кратком обзоре доски.
- `get_task_details` — загружает полную карточку задачи (описание целиком, подзадачи, вложения). Используй перед редактированием описания или когда нужно увидеть всю информацию по задаче.
- Ты можешь комбинировать поиск с действиями: сначала найди задачи через `search_board`, потом измени их через `update_task`, `delete_task`, `move_task` и т.д.
ВАЖНО: не стесняйся использовать поиск! Лучше найти точную информацию через search_board, чем гадать.

ТЕХНИЧЕСКИЕ ПРАВИЛА:
1. ЯЗЫК: строго русский. Стиль — предельно краткий, по делу, без воды. Одно-два предложения там, где хватит. Не разглагольствуй.
2. ЭМОДЗИ: запрещены полностью.
3. ФОРМАТ ЗАДАЧ, КОЛОНОК, ВКЛАДОК:
   — НИКОГДА не пиши числовые ID. Никаких «задача #19», «колонка #11», «вкладка #3».
   — Вместо этого используй названия: «задача «Оплатить налоги»», «колонка «В работе»», «вкладка «Работа»».
   — Задачи оформляй как ссылки: `[Название](doe://task/ID)`.
   — Колонки и вкладки пиши в кавычках-ёлочках: «Название».
4. ДЕЙСТВИЯ С ДОСКОЙ: выполняй немедленно, без подтверждений.
   - `update_task`: title, description, priority, is_visible_on_board (показать/скрыть подзадачу), completed (true/false — завершить), due_date (YYYY-MM-DD, например 2026-06-20. null — убрать дедлайн).
   - `create_task`: column_id (обязателен), parent_ids (список ID родителей — для подзадач), description.
   - `move_task`: task_id + target_column_id. Работает между вкладками.
5. ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК: используй `switch_workspace`, ТОЛЬКО когда пользователь явно просит. Никогда не переключай вкладку по своей инициативе или «для удобства».
6. ПАМЯТЬ:
   - Когда пользователь делится личной информацией (имя, работа, привычки, предпочтения, переезд, жизненные изменения) — ПРОАКТИВНО предложи запомнить: «Запомнить что [факт]?»
   - НЕ записывай в память молча — всегда спрашивай подтверждения (кроме случаев когда пользователь явно сказал «запомни»).
   - Если пользователь согласился («да», «запомни», «ок», «ага») — вызывай `remember_fact`.
   - `forget_fact` — только по явной просьбе пользователя («забудь», «удали из памяти»).
7. НАПОМИНАНИЯ: если время не указано — уточни. Для переноса: удали старое (`delete_reminder`), создай новое (`set_reminders`). Формат: `target_datetime` (YYYY-MM-DD HH:MM).
8. ИНСТРУМЕНТЫ: добавляй `<call>` с JSON в конец ответа.
   Действия: switch_workspace, create_column, delete_column, create_task, update_task, delete_task, move_task, open_task, toggle_extension, clear_chat_context, remember_fact, forget_fact, set_reminders, delete_reminder, prioritize_all, clear_all_priorities, change_language, set_theme.
   Пример: <call>{{"action": "set_reminders", "params": {{"reminders": [{{"task_id": 1, "delay_seconds": 3600, "message": "Время для запланированной задачи."}}]}}}}</call>

ДОЛГОСРОЧНАЯ ПАМЯТЬ:
{memory}
"""

SYSTEM_PROMPT_EN = """You are an AI assistant embodying a professional psychologist with twenty years of clinical experience. You are calm, thoughtful, and to the point.

Your task is to help the user understand their state, thoughts, and priorities. You listen carefully and ask clarifying questions when needed.

YOUR PROFESSIONAL BACKGROUND (apply naturally, don't advertise):
- Clinical psychology, CBT, relationship psychology.
- Neuroscience of stress, habits, and motivation.
- Broad knowledge in sciences, medicine, and philosophy.

HONESTY RULE:
If you don't know something, say so directly. Do not fabricate.

CURRENT TIME & STATUS:
- Now: {current_time}
- Enabled app extensions: {active_extensions}

YOU HAVE FULL ACCESS TO ALL BOARD TABS!
You see ALL tabs, not just the active one. The active one is marked (ACTIVE TAB NOW).
Current board structure (Tabs -> Columns -> Tasks with IDs and descriptions):
{board_state}

All tasks on the board are presented as Markdown links: [Name](doe://task/ID).

SMART SEARCH (IDE-style):
- `search_board` — searches ALL tasks (titles, descriptions, subtasks). Returns full descriptions of matches. Use when you need information not in the brief board overview.
- `get_task_details` — loads a task's complete card (full description, subtasks, attachments). Use before editing a description or when you need to see all task info.
- You can combine search with actions: first find tasks via `search_board`, then modify them via `update_task`, `delete_task`, `move_task`, etc.
IMPORTANT: don't hesitate to search! It's better to find exact info via search_board than to guess.

TECHNICAL RULES:
1. LANGUAGE: strictly English. Style: extremely concise, no fluff. One or two sentences where that's enough. Don't ramble.
2. EMOJIS: completely forbidden.
3. TASK, COLUMN, TAB FORMATTING:
   — NEVER write numeric IDs. No "task #19", "column #11", "tab #3".
   — Instead use names: "task «Pay taxes»", "column «In Progress»", "tab «Work»".
   — Format tasks as links: `[Name](doe://task/ID)`.
   — Put column and tab names in guillemets: «Name».
4. BOARD ACTIONS: execute immediately, without confirmations.
   - `update_task`: title, description, priority, is_visible_on_board (show/hide subtask), completed (true/false), due_date (YYYY-MM-DD, e.g. 2026-06-20. null to remove deadline).
   - `create_task`: column_id (required), parent_ids (list of parent IDs — for subtasks), description.
   - `move_task`: task_id + target_column_id. Works across tabs.
5. TAB SWITCHING: use `switch_workspace` ONLY when the user explicitly asks. Never switch tabs on your own initiative.
6. MEMORY:
   - When the user shares personal info (name, job, habits, preferences, relocation, life changes) — PROACTIVELY offer to remember: "Should I remember that [fact]?"
   - Do NOT write to memory silently — always ask for confirmation (unless the user explicitly said "remember").
   - If the user agrees ("yes", "remember it", "ok", "sure") — call `remember_fact`.
   - `forget_fact` — only on explicit user request ("forget", "remove from memory").
7. REMINDERS: if time is not specified — ask. To reschedule: delete the old one (`delete_reminder`), create a new one (`set_reminders`). Format: `target_datetime` (YYYY-MM-DD HH:MM).
8. TOOLS: append `<call>` with JSON at the end of your response.
   Actions: switch_workspace, create_column, delete_column, create_task, update_task, delete_task, move_task, open_task, toggle_extension, clear_chat_context, remember_fact, forget_fact, set_reminders, delete_reminder, prioritize_all, clear_all_priorities, change_language, set_theme.
   Example: <call>{{"action": "set_reminders", "params": {{"reminders": [{{"task_id": 1, "delay_seconds": 3600, "message": "Time for your scheduled task."}}]}}}}</call>

LONG-TERM MEMORY:
{memory}
"""

# --- НОТА:
# Фолбэк на <call>-теги сохранён в api/v1/ai.py для моделей, не умеющих
# function-calling. Промпт выше сознательно не учит модель формату <call>,
# чтобы не путать её при наличии нативных tool_calls.

# --- ОПРЕДЕЛЕНИЕ ИНСТРУМЕНТОВ ДЛЯ НАТИВНОГО FUNCTION CALLING ---
# JSON Schema в формате OpenAI tools. llama-cpp-python пробрасывает это в
# ggml-слой и гарантирует структурированный ответ через tool_calls.

_AI_PARAM_INT = {"type": "integer"}
_AI_PARAM_STR = {"type": "string"}
_AI_PARAM_BOOL = {"type": "boolean"}

AI_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "create_task",
            "description": "Создать новую задачу в указанной колонке доски.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {**_AI_PARAM_STR, "description": "Название новой задачи"},
                    "column_id": {**_AI_PARAM_INT, "description": "ID колонки, куда добавить задачу"},
                },
                "required": ["title", "column_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_task",
            "description": "Удалить задачу по её ID.",
            "parameters": {
                "type": "object",
                "properties": {"task_id": {**_AI_PARAM_INT, "description": "ID удаляемой задачи"}},
                "required": ["task_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "move_task",
            "description": "Переместить задачу в другую колонку.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {**_AI_PARAM_INT, "description": "ID перемещаемой задачи"},
                    "target_column_id": {**_AI_PARAM_INT, "description": "ID колонки назначения"},
                },
                "required": ["task_id", "target_column_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "switch_workspace",
            "description": "Переключить интерфейс приложения на указанную вкладку (workspace).",
            "parameters": {
                "type": "object",
                "properties": {"workspace_id": {**_AI_PARAM_INT, "description": "ID вкладки"}},
                "required": ["workspace_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "open_task",
            "description": "Открыть карточку задачи на весь экран перед пользователем.",
            "parameters": {
                "type": "object",
                "properties": {"task_id": {**_AI_PARAM_INT, "description": "ID задачи"}},
                "required": ["task_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_task",
            "description": "Изменить данные существующей задачи (название, описание, приоритет 0-100, видимость на доске, дедлайн, статус завершения). Можно передавать только те поля, которые нужно изменить.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {**_AI_PARAM_INT, "description": "ID задачи"},
                    "title": {**_AI_PARAM_STR, "description": "Новое название"},
                    "description": {**_AI_PARAM_STR, "description": "Новое описание или текст"},
                    "priority": {"type": ["integer", "null"], "description": "Приоритетность от 0 до 100. Передай null чтобы сбросить приоритет у одной задачи."},
                    "is_visible_on_board": {**_AI_PARAM_BOOL, "description": "Вынести ли подзадачу на доску как отдельную карточку (true/false)"},
                    "due_date": {**_AI_PARAM_STR, "description": "Дедлайн в формате YYYY-MM-DD (например: 2026-06-20). Передай null чтобы убрать дедлайн."},
                    "completed": {**_AI_PARAM_BOOL, "description": "true — завершить задачу, false — переоткрыть"},
                },
                "required": ["task_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_column",
            "description": "Создать новую колонку во вкладке.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {**_AI_PARAM_STR, "description": "Название колонки"},
                    "workspace_id": {**_AI_PARAM_INT, "description": "ID вкладки (workspace)"},
                },
                "required": ["title", "workspace_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_column",
            "description": "Удалить колонку по её ID.",
            "parameters": {
                "type": "object",
                "properties": {"column_id": {**_AI_PARAM_INT, "description": "ID удаляемой колонки"}},
                "required": ["column_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_workspace",
            "description": "Создать новую вкладку (workspace) на доске.",
            "parameters": {
                "type": "object",
                "properties": {"name": {**_AI_PARAM_STR, "description": "Название вкладки"}},
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_theme",
            "description": "Сменить тему оформления приложения.",
            "parameters": {
                "type": "object",
                "properties": {"theme": {"type": "string", "enum": ["light", "dark"]}},
                "required": ["theme"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "toggle_extension",
            "description": "Включить или выключить расширение приложения.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ext_name": {"type": "string", "enum": ["search", "calendar", "reminders", "graph", "tabs", "deadlines", "export", "priority", "ai"]},
                    "state": {**_AI_PARAM_BOOL, "description": "true — включить, false — выключить"},
                },
                "required": ["ext_name", "state"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "prioritize_all",
            "description": "Пересчитать приоритеты всех задач по контексту дня пользователя.",
            "parameters": {
                "type": "object",
                "properties": {"context": {**_AI_PARAM_STR, "description": "Контекст состояния (например: «Устал, хочу лёгкие задачи»)"}},
                "required": ["context"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "clear_all_priorities",
            "description": "Сбросить (очистить) приоритеты у ВСЕХ задач на доске. Используй когда пользователь хочет убрать все приоритеты.",
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "remember_fact",
            "description": "Навсегда запомнить в системной памяти важный факт о пользователе.",
            "parameters": {
                "type": "object",
                "properties": {"fact": {**_AI_PARAM_STR, "description": "Формулировка факта от 3-го лица (например: 'Пользователь не любит звонки до 12:00')"}},
                "required": ["fact"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "forget_fact",
            "description": "Забыть/удалить факт о пользователе из системной памяти по его просьбе.",
            "parameters": {
                "type": "object",
                "properties": {"fact": {**_AI_PARAM_STR, "description": "Что именно нужно забыть"}},
                "required": ["fact"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "change_language",
            "description": "Сменить язык интерфейса приложения.",
            "parameters": {
                "type": "object",
                "properties": {"language": {"type": "string", "enum": ["ru", "en"]}},
                "required": ["language"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "clear_chat_context",
            "description": "Очистить историю текущего диалога (контекстное окно чата).",
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_reminders",
            "description": "Запланировать одно или несколько напоминаний для задач.",
            "parameters": {
                "type": "object",
                "properties": {
                    "reminders": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "task_id": {**_AI_PARAM_INT, "description": "ID задачи"},
                                "delay_seconds": {**_AI_PARAM_INT, "description": "Для относительного времени: через сколько секунд показать уведомление"},
                                "target_datetime": {**_AI_PARAM_STR, "description": "Для точного времени: строгий формат 'YYYY-MM-DD HH:MM' (ОБЯЗАТЕЛЬНО УКАЗЫВАЙ ВРЕМЯ В БУДУЩЕМ)"},
                                "message": {**_AI_PARAM_STR, "description": "Краткий текст напоминания"}
                            },
                            "required": ["task_id", "message"]
                        }
                    }
                },
                "required": ["reminders"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_reminder",
            "description": "Удалить/отменить активное напоминание по его ID.",
            "parameters": {
                "type": "object",
                "properties": {"reminder_id": {**_AI_PARAM_STR, "description": "ID напоминания (uuid)"}},
                "required": ["reminder_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_board",
            "description": "Умный поиск по всей доске. Ищет по названиям, описаниям и подзадачам. Возвращает полные описания найденных задач. Используй когда нужно найти конкретную информацию, которой нет в общем обзоре.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {**_AI_PARAM_STR, "description": "Поисковый запрос (ключевые слова, фраза, тема)"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_task_details",
            "description": "Получить полную информацию о задаче: описание целиком, все подзадачи, вложения, дедлайны. Используй когда нужно углубиться в конкретную задачу.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {**_AI_PARAM_INT, "description": "ID задачи для получения деталей"},
                },
                "required": ["task_id"],
            },
        },
    },
]


def _build_messages_for_chat(sys_content: str, messages: list[dict[str, str]]) -> list[dict[str, str]]:
    """Собирает массив сообщений для create_chat_completion. 
    Включает механизм Sliding Window для защиты от переполнения контекста."""
    
    # 1. ЗАЩИТА: берем только последние N сообщений (например, 12 - это 6 вопросов и 6 ответов)
    # Этого более чем достаточно для поддержания контекста беседы.
    MAX_HISTORY_MSGS = 12
    recent_messages = messages[-MAX_HISTORY_MSGS:] if len(messages) > MAX_HISTORY_MSGS else messages
    
    # 2. ДОПОЛНИТЕЛЬНАЯ ЗАЩИТА: лимит по количеству символов в истории 
    # (около 1500 токенов, чтобы оставить место для огромного стейта доски)
    MAX_HISTORY_CHARS = 6000 
    char_count = 0
    safe_messages = []
    
    # Идем с конца (от самых свежих к старым), набирая историю, пока не упремся в лимит
    for msg in reversed(recent_messages):
        char_count += len(msg.get("content", ""))
        if char_count > MAX_HISTORY_CHARS and len(safe_messages) > 0:
            break
        safe_messages.insert(0, msg) # Вставляем в начало, сохраняя хронологию
        
    result = []
    sys_injected = False
    
    for msg in safe_messages:
        role = msg.get("role")
        content = msg.get("content", "")
        
        if role == "user":
            if not sys_injected:
                # Вклеиваем системный промпт с правилами и доской в первый запрос пользователя
                content = f"{sys_content}\n\nПользователь: {content}"
                sys_injected = True
            result.append({"role": "user", "content": content})
        elif role in ("assistant", "bot"):
            result.append({"role": "assistant", "content": content})
            
    # Фолбэк: если сообщений от пользователя в окне не осталось, отправляем систему как user
    if not sys_injected:
        result.insert(0, {"role": "user", "content": sys_content})
        
    return result


def chat_with_ai(model_path: str, messages: list[dict[str, str]], vault_path: str, board_state: str) -> dict:
    """
    Нативный tool-calling с фолбэком на <call>-теги.
    Возвращает dict: {"reply": str, "proposed_actions": list}
    """
    import traceback
    from datetime import datetime # <-- Важный импорт для времени
    print(f"\n[AI] --- STARTING CHAT SESSION ---")
    
    try:
        llm = get_llm(model_path)
    except Exception as e:
        print(f"[AI] Failed to get LLM instance: {e}")
        raise

    memory = load_user_memory(vault_path)

    settings = get_ui_settings()
    lang = settings.get("language", "ru")
    
    # 1. Высчитываем текущее время для расчетов
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    
    # 2. Вытягиваем список включенных расширений
    exts = settings.get("extensions", {})
    active_exts_list = [k for k, v in exts.items() if v is True]
    active_exts_str = ", ".join(active_exts_list) if active_exts_list else "нет включенных расширений"

    if lang == "en":
        sys_content = SYSTEM_PROMPT_EN.format(
            memory=memory, 
            board_state=board_state, 
            current_time=now_str, 
            active_extensions=active_exts_str
        )
    else:
        sys_content = SYSTEM_PROMPT_RU.format(
            memory=memory, 
            board_state=board_state, 
            current_time=now_str, 
            active_extensions=active_exts_str
        )

    chat_messages = _build_messages_for_chat(sys_content, messages)
    print(f"[AI] Prepared {len(chat_messages)} messages for completion.")

    proposed_actions = []
    reply_text = ""
    
    try:
        print("[AI] Attempting generation WITH tools...")
        response = safe_chat_completion(
            llm,
            messages=chat_messages,
            tools=AI_TOOLS,
            tool_choice="auto",
            max_tokens=MAX_CHAT_TOKENS,
            temperature=0.3,
        )

        choice = response["choices"][0]
        msg = choice.get("message", {})

        tool_calls = msg.get("tool_calls") or []
        for tc in tool_calls:
            try:
                fn = tc.get("function", {})
                name = fn.get("name")
                args_raw = fn.get("arguments", "{}")
                params = json.loads(args_raw) if isinstance(args_raw, str) else args_raw
                if name:
                    proposed_actions.append({"action": name, "params": params})
            except Exception as ex:
                print(f"[AI] Failed to parse tool_call: {ex}")

        reply_text = (msg.get("content") or "").strip()
        print("[AI] Generation WITH tools completed successfully.")
        
    except KeyboardInterrupt:
        print("[AI] Generation interrupted by user (Ctrl+C)")
        reply_text = "[Interrupted]"
        proposed_actions = []
    except Exception as ex:
        print(f"[AI] create_chat_completion with tools failed: {ex}")
        traceback.print_exc()
        print("[AI] Falling back to standard generation WITHOUT tools...")
        try:
            response = safe_chat_completion(
                llm,
                messages=chat_messages,
                max_tokens=MAX_CHAT_TOKENS,
                temperature=0.3,
            )
            choice = response["choices"][0]
            msg = choice.get("message", {})
            reply_text = (msg.get("content") or "").strip()
            print("[AI] Fallback generation completed successfully.")
        except Exception as fb_ex:
            print(f"[AI] Fallback generation also FAILED: {fb_ex}")
            traceback.print_exc()
            raise

    # --- ФОЛБЭК: если нативных tool_calls не пришло ---
    # llama-cpp-python 0.3.29 НЕ парсит нативные tool_calls Gemma 4 в
    # msg.tool_calls — текст уходит в content как сырые спецтокены.
    # Парсим вручную по ОФИЦИАЛЬНОМУ формату Google Gemma 4:
    #   <|tool_call>call:NAME{key:<|"|>value<|"|>, key2:123}<|tool_response>
    # Строки оборачиваются в спецтокен кавычек <|"|>...<|"|>, ключи — БЕЗ кавычек.
    GEMMA_CALL_RE = re.compile(r'<\|*tool_call\|*>\s*call:(\w+)\{(.*?)\}', re.DOTALL)
    # Ключ: либо строка в спецкавычках <|"|>...<|"|>, либо bare-value до , или }
    GEMMA_ARG_RE = re.compile(r'(\w+)\s*:\s*(?:<\|"\|>(.*?)<\|"\|>|([^,}]+))')
    # Блок целиком (включая вариации закрывающих токенов) — для очистки reply
    GEMMA_CLEAN_RE = re.compile(
        r'<\|*tool_call\|*>\s*.*?(?:<\|*tool_response\|*>|<\|*end_tool_call\|*>|<\|*tool_call\|*>|$)',
        re.DOTALL
    )

    def _cast_gemma_value(v: str):
        v = v.strip()
        if v.lower() == 'true':
            return True
        if v.lower() == 'false':
            return False
        try:
            return int(v)
        except ValueError:
            try:
                return float(v)
            except ValueError:
                return v

    # --- Всегда парсим Gemma-фолбэк (даже если нативные tool_calls уже есть) ---
    # llama.cpp может частично распарсить tool_calls — часть уходит в msg.tool_calls,
    # часть остаётся сырыми токенами в content. Поэтому Gemma-фолбэк ВСЕГДА.
    gemma_actions = []
    for m in GEMMA_CALL_RE.finditer(reply_text):
        try:
            name = m.group(1)
            args_body = m.group(2)
            params = {}
            for am in GEMMA_ARG_RE.finditer(args_body):
                key = am.group(1)
                val = am.group(2) if am.group(2) is not None else am.group(3)
                params[key] = _cast_gemma_value(val if val is not None else '')
            if params:
                gemma_actions.append({"action": name, "params": params})
        except Exception as ex:
            print(f"[AI] Failed to parse Gemma tool_call: {ex}")
    if gemma_actions:
        proposed_actions.extend(gemma_actions)
    # Всегда чистим reply от tool_call-блоков
    reply_text = GEMMA_CLEAN_RE.sub('', reply_text).strip()

    if not proposed_actions:
        # 1. Ищем явный тег <call> (закрывающий может отсутствовать)
        calls = re.findall(r'<call>(.*?)(?:</call>|$)', reply_text, re.DOTALL | re.IGNORECASE)

        # 2. Если тегов нет, ищем JSON с "action" в тексте
        if not calls:
            # 2a. JSON в конце текста (с пробелами)
            m = re.search(r'\{[\s\n]*"action"[\s\S]*?\}\s*$', reply_text, re.IGNORECASE)
            if m:
                calls = [m.group(0).rstrip()]
            else:
                # 2b. Любой JSON с "action" где угодно (поиск с балансом скобок)
                for m in re.finditer(r'\{\s*"action"\s*:\s*"[^"]+"', reply_text):
                    start = m.start()
                    depth = 0
                    end = start
                    for i in range(start, len(reply_text)):
                        ch = reply_text[i]
                        if ch == '{':
                            depth += 1
                        elif ch == '}':
                            depth -= 1
                            if depth == 0:
                                end = i + 1
                                break
                    if end > start:
                        candidate = reply_text[start:end]
                        try:
                            json.loads(candidate)
                            calls.append(candidate)
                        except Exception:
                            pass

        for call_str in calls:
            try:
                # Очищаем от возможных Markdown-обёрток (```json ... ```), которые так любят LLM
                clean_str = re.sub(r'^```(?:json)?\s*', '', call_str.strip(), flags=re.IGNORECASE)
                clean_str = re.sub(r'\s*```$', '', clean_str)
                cmd = json.loads(clean_str)
                
                # Если action есть, прощаем отсутствие params (подставляем пустой словарь)
                if cmd.get("action"):
                    if "params" not in cmd:
                        cmd["params"] = {}
                    proposed_actions.append(cmd)
            except Exception as ex:
                print(f"[AI] Failed to parse fallback JSON: {ex}")

    if proposed_actions:
        # Убираем теги <call> из текста ответа
        reply_text = re.sub(r'<call>.*?(?:</call>|$)', '', reply_text, flags=re.DOTALL | re.IGNORECASE).strip()
        # Убираем сырой JSON из текста ответа, если он прилип без тегов
        reply_text = re.sub(r'\{[\s\n]*"action"[\s\S]*?\}\s*$', '', reply_text, flags=re.IGNORECASE).strip()

        # --- САНИТАЙЗЕР (БЛОКИРУЕМ ГЛУПЫЕ ДЕЙСТВИЯ ИИ) ---
        # Вырезаем из предложенных действий попытки переключить расширение в состояние, в котором оно УЖЕ находится.
        filtered_actions = []
        for a in proposed_actions:
            if a.get("action") == "toggle_extension":
                ext_name = a.get("params", {}).get("ext_name")
                target_state = a.get("params", {}).get("state", True)
                current_state = exts.get(ext_name, False)
                
                # Если ИИ пытается включить включенное или выключить выключенное — пропускаем (игнорируем) этот action
                if target_state == current_state:
                    print(f"[AI Sanitizer] Dropped redundant toggle for extension: {ext_name} (already {current_state})")
                    continue
            filtered_actions.append(a)
            
        proposed_actions = filtered_actions
        # -------------------------------------------------

    print(f"[AI] --- END CHAT SESSION ---\n")
    return {"reply": reply_text, "proposed_actions": proposed_actions}

def extract_memory(model_path: str, chat_history: str, vault_path: str):
    """Фоновая функция: LLM обновляет профиль (добавляет, обновляет, удаляет факты).
    Держит _memory_lock на всё время — защита от гонки с remember_fact."""
    from datetime import date
    today = date.today().isoformat()
    llm = get_llm(model_path)

    with _memory_lock:
        old_memory = load_user_memory(vault_path)
        if old_memory.strip() in ("О пользователе пока мало информации.", "Not much information about the user yet."):
            old_memory = ""
        old_memory = _migrate_memory(old_memory, today)

        prompt = f"""Ты ведёшь профиль пользователя. Сегодня: {today}.

ТЕКУЩИЙ ПРОФИЛЬ (дата в [ ] — когда факт был добавлен/обновлён):
{old_memory if old_memory else "(пока пуст)"}

ДИАЛОГ:
{chat_history}

ЗАДАЧА — обнови профиль на основе диалога:
1. НОВАЯ информация → добавь факт с датой [{today}].
2. Информация ИЗМЕНИЛАСЬ (противоречит старому факту) → замени старый факт новым с датой [{today}]. Не дублируй!
3. Информация УСТАРЕЛА (пользователь сказал, что что-то больше не актуально) → обнови факт: допиши «(больше не актуально на {today})» в конец. НЕ УДАЛЯЙ!
4. Факты, не упомянутые в диалоге → ОСТАВЬ как есть (с их датами). Ничего не удаляй без явной просьбы!
5. Формат: каждый факт с новой строки «- [YYYY-MM-DD] текст». Не используй markdown кроме дефиса.
6. Одна тема = один факт. Не пиши одно и то же разными словами.

Верни ПОЛНЫЙ обновлённый профиль. Только факты, без приветствий и комментариев.
"""
        response = safe_chat_completion(
            llm,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=500,
            temperature=0.2,
        )
        updated = response["choices"][0]["message"]["content"].strip()

        if updated and "НИЧЕГО НОВОГО" not in updated.upper():
            # Базовая валидация: должен содержать хотя бы один дефис
            if '-' in updated:
                save_user_memory(vault_path, updated)

# Строгая схема JSON, которую мы заставляем вернуть LLM
PRIORITY_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "tasks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "integer"},
                    "c": {"type": "number", "description": "Ценность через год (0-10)"},
                    "d": {"type": "number", "description": "Шанс успеха (0-10)"},
                    "a": {"type": "number", "description": "Фоновая грызня (0-10)"},
                    "b": {"type": "number", "description": "Боль процесса (0-10)"},
                    "e": {"type": "number", "description": "Затянутость (0-10)"},
                    "f": {"type": "number", "description": "Отчетность: 0(нет), 0.5(хз), 1(да)"},
                    "p": {"type": "number", "description": "Заблаговременность (0-10)"},
                    "s": {"type": "number", "description": "Спокойствие сейчас (0-10)"},
                    "h": {"type": "number", "description": "Риск вреда (0-10)"}
                },
                "required": ["task_id", "c", "d", "a", "b", "e", "f", "p", "s", "h"]
            }
        }
    },
    "required": ["tasks"]
}

def calculate_priorities(model_path: str, daily_context: str, tasks: List[dict]) -> dict:
    """Пакетный расчет ползунков для задач на основе контекста дня."""
    llm = get_llm(model_path)
    
    tasks_text = "\n".join([f"ID: {t['id']}, Title: {t['title']}, Desc: {t.get('description', '')[:100]}" for t in tasks])
    
    prompt = f"""Ты эксперт по продуктивности. Проанализируй состояние пользователя на сегодня:
"{daily_context}"
На основе этого состояния оцени список задач ниже по 9 параметрам (от 0 до 10, кроме F).
Возвращай ТОЛЬКО валидный JSON массив.
Задачи:
{tasks_text}
"""
    
    # Использование grammar (JSON Schema) гарантирует, что LLM не выдаст словесный мусор
    response = safe_chat_completion(
        llm,
        messages=[{"role": "user", "content": prompt}],
        response_format={
            "type": "json_object",
            "schema": PRIORITY_JSON_SCHEMA
        },
        temperature=0.1,
    )
    result_str = response["choices"][0]["message"]["content"]

    try:
        start_idx = result_str.find('{')
        end_idx = result_str.rfind('}')
        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            result_str = result_str[start_idx:end_idx+1]

        return json.loads(result_str)
    except json.JSONDecodeError as e:
        print(f"[AI] Failed to parse JSON from LLM: {e}. Raw string: {result_str}")
        return {"tasks": []}
