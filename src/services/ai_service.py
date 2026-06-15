import os
import sys
import platform
import json
from pathlib import Path
from typing import List, Dict, Any

def is_apple_silicon() -> bool:
    # Разрешаем запуск на любой macOS (на Intel будет работать на CPU, на M-чипах на GPU)
    return sys.platform == 'darwin'

APP_GLOBAL_DIR = Path.home() / ".doe_app"
MODELS_DIR = APP_GLOBAL_DIR / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

AVAILABLE_MODELS = {
    "Saiga/Mistral 7b": {
        "repo": "IlyaGusev/saiga_mistral_7b_gguf",
        "file": "model-q4_K.gguf"  # Реальное имя файла на HF
    }
}

_llm = None
_current_model_path = None

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

import urllib.request
import urllib.error

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
    global ai_download_state
    
    if not is_apple_silicon():
        ai_download_state[model_name] = {"progress": 0, "status": "error", "error": "Requires macOS"}
        return

    model_info = AVAILABLE_MODELS.get(model_name)
    if not model_info:
        ai_download_state[model_name] = {"progress": 0, "status": "error", "error": "Model not found"}
        return

    file_path = MODELS_DIR / model_info["file"]
    
    # 🛡 Защита от битых файлов: если файл поврежден (весит мало), удаляем его и качаем заново
    if file_path.exists():
        if file_path.stat().st_size > 1024 * 1024 * 100: # Минимально 100 MB
            ai_download_state[model_name] = {"progress": 100, "status": "completed", "error": None}
            return
        else:
            try:
                file_path.unlink()
            except Exception:
                pass

    url = f"https://huggingface.co/{model_info['repo']}/resolve/main/{model_info['file']}"
    
    # Инициализируем начальные значения до начала загрузки для предотвращения UnboundLocalError
    ai_download_state[model_name] = {
        "progress": 0, 
        "status": "downloading", 
        "error": None,
        "cancel_requested": False,
        "downloaded_bytes": 0,
        "total_bytes": 0
    }
    
    print(f"[AI Download] Starting native download for {model_name} from {url}")

    temp_file_path = file_path.with_suffix(".download")
    
    # Принудительно очищаем старый временный файл перед новой попыткой
    if temp_file_path.exists():
        try:
            temp_file_path.unlink()
        except Exception:
            pass

    try:
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)'}
        )
        
        with urllib.request.urlopen(req, timeout=15) as response:
            total_size = int(response.info().get('Content-Length', 0))
            chunk_size = 1024 * 1024  # 1 MB
            downloaded = 0
            
            with open(temp_file_path, "wb") as f:
                while True:
                    # 🛑 Проверка флага отмены скачивания
                    if ai_download_state[model_name].get("cancel_requested"):
                        response.close()
                        f.close()
                        if temp_file_path.exists():
                            temp_file_path.unlink()
                        ai_download_state[model_name] = {"progress": 0, "status": "cancelled", "error": None}
                        print(f"[AI Download] Download cancelled for {model_name}")
                        return

                    chunk = response.read(chunk_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    
                    if total_size > 0:
                        percent = int((downloaded / total_size) * 100)
                        # Обновляем только изменяемые метрики, чтобы не затереть флаг отмены cancel_requested
                        ai_download_state[model_name]["progress"] = percent
                        ai_download_state[model_name]["downloaded_bytes"] = downloaded
                        ai_download_state[model_name]["total_bytes"] = total_size
            
            if temp_file_path.exists():
                temp_file_path.rename(file_path)
                
            ai_download_state[model_name] = {"progress": 100, "status": "completed", "error": None}
            print(f"[AI Download] {model_name} downloaded successfully to {file_path}")
            
    except Exception as e:
        print(f"[AI Download] ❌ Error downloading {model_name}: {e}")
        if temp_file_path.exists():
            try:
                temp_file_path.unlink()
            except Exception:
                pass
        
        # Переводим ошибку на понятный язык для фронтенда
        err_msg = str(e)
        if "timed out" in err_msg.lower() or "connection" in err_msg.lower():
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
    if not is_apple_silicon():
        raise ValueError("Requires Apple Silicon.")

    if _llm is not None and _current_model_path == model_path:
        return _llm

    from llama_cpp import Llama
    _llm = Llama(
        model_path=model_path,
        n_gpu_layers=-1, # Полный оффлоуд на Apple Metal
        n_ctx=4096,      # Контекст 4K
        verbose=False
    )
    _current_model_path = model_path
    return _llm

# Находим импорты из config вверху файла и добавляем get_ui_settings:
from src.core.config import get_active_vault, get_ui_settings  # <--- Добавили get_ui_settings

# --- СТРОГИЕ ЛОКАЛИЗОВАННЫЕ СИСТЕМНЫЕ ИНСТРУКЦИИ ---

SYSTEM_PROMPT_RU = """Ты — Dr. Doe, профессиональный психолог, наставник и эксперт по продуктивности с 30-летним стажем. 
Твоя цель — помочь пользователю настроиться на день. Веди диалог эмпатично, кратко, задавай не более одного вопроса за раз. 

У ТЕБЯ ЕСТЬ ПОЛНЫЙ ДОСТУП К ДОСКЕ ПОЛЬЗОВАТЕЛЯ!
Текущая структура доски (Вкладки -> Колонки -> Задачи с их ID):
{board_state}

Ты можешь выполнять действия с доской! Для этого выведи в любом месте ответа JSON блок строго в тегах <call>...</call>.
Примеры действий:
1. Создать задачу: <call>{{"action": "create_task", "params": {{"title": "Название", "column_id": ID}}}}</call>
2. Удалить задачу: <call>{{"action": "delete_task", "params": {{"task_id": ID}}}}</call>
3. Переместить задачу: <call>{{"action": "move_task", "params": {{"task_id": ID, "target_column_id": ID}}}}</call>
4. Создать колонку: <call>{{"action": "create_column", "params": {{"title": "Название", "workspace_id": ID}}}}</call>
5. Удалить колонку: <call>{{"action": "delete_column", "params": {{"column_id": ID}}}}</call>
6. Создать вкладку: <call>{{"action": "create_workspace", "params": {{"name": "Название"}}}}</call>
7. Сменить тему: <call>{{"action": "set_theme", "params": {{"theme": "dark"}}}}</call> (или "light")
8. Вкл/выкл расширения: <call>{{"action": "toggle_extension", "params": {{"ext_name": "calendar", "state": false}}}}</call> (ext_name: search, calendar, reminders, graph, tabs, deadlines, export, priority, ai)
9. Пересчитать приоритеты задач по контексту: <call>{{"action": "prioritize_all", "params": {{"context": "Устал, хочу легкие задачи"}}}}</call>

Ты можешь генерировать НЕСКОЛЬКО тегов <call> подряд, если нужно сделать несколько действий.
Все задачи на доске представлены в виде Markdown-ссылок: [Название](doe://task/ID).
Если упоминаешь задачу в тексте, ВСЕГДА используй этот формат. НИКОГДА не пиши "Задача ID: 1", пиши строго кликабельную ссылку!

ЖЕСТКИЕ ПРАВИЛА:
1. ОТВЕЧАЙ СТРОГО НА РУССКОМ ЯЗЫКЕ.
2. НИКОГДА НЕ ПИШИ ЗА ПОЛЬЗОВАТЕЛЯ.
3. ИСПОЛЬЗУЙ ТОЛЬКО ТЕ ЗАДАЧИ, КОТОРЫЕ РЕАЛЬНО ПРИСУТСТВУЮТ НА ДОСКЕ (ОПИСАНЫ В КОНТЕКСТЕ ВЫШЕ). НИКОГДА НЕ ВЫДУМЫВАЙ СВОИ ЗАДАЧИ И СВОИ ССЫЛКИ. ЕСЛИ СОВПАДЕНИЙ НЕТ — ЧЕСТНО ОТВЕТЬ, ЧТО ТАКИХ ЗАДАЧ НЕ НАЙДЕНО.
4. КОГДА ВЫВОДИШЬ СПИСОК ЗАДАЧ, ОБЯЗАТЕЛЬНО ФОРМАТИРУЙ ЕГО КАК НУМЕРОВАННЫЙ (1., 2.) ИЛИ МАРКИРОВАННЫЙ (-) СПИСОК MARKDOWN С НОВОЙ СТРОКИ.

ДОЛГОСРОЧНАЯ ПАМЯТЬ:
{memory}
"""

SYSTEM_PROMPT_EN = """You are Dr. Doe, a professional psychologist and productivity expert.
Keep the dialogue empathetic, concise, and ask no more than one deep question at a time.

YOU HAVE FULL ACCESS TO THE USER'S BOARD!
Current board structure (Tabs -> Columns -> Tasks with IDs):
{board_state}

You can perform actions on the board! To do so, output a JSON block anywhere in your response, strictly inside <call>...</call> tags.
Action examples:
1. Create task: <call>{{"action": "create_task", "params": {{"title": "Name", "column_id": ID}}}}</call>
2. Delete task: <call>{{"action": "delete_task", "params": {{"task_id": ID}}}}</call>
3. Move task: <call>{{"action": "move_task", "params": {{"task_id": ID, "target_column_id": ID}}}}</call>
4. Create column: <call>{{"action": "create_column", "params": {{"title": "Name", "workspace_id": ID}}}}</call>
5. Delete column: <call>{{"action": "delete_column", "params": {{"column_id": ID}}}}</call>
6. Create tab: <call>{{"action": "create_workspace", "params": {{"name": "Name"}}}}</call>
7. Change theme: <call>{{"action": "set_theme", "params": {{"theme": "dark"}}}}</call> (or "light")
8. Toggle extensions: <call>{{"action": "toggle_extension", "params": {{"ext_name": "calendar", "state": false}}}}</call> (ext_name: search, calendar, reminders, graph, tabs, deadlines, export, priority, ai)
9. Reprioritize all tasks based on context: <call>{{"action": "prioritize_all", "params": {{"context": "I am tired, give me easy tasks"}}}}</call>

You can generate MULTIPLE <call> tags to perform several actions.
All tasks on the board are presented as Markdown links: [Name](doe://task/ID).
If you mention a task, ALWAYS use this format. NEVER write "Task ID: 1", strictly write a clickable link!

STRICT RULES:
1. Converse STRICTLY IN ENGLISH.
2. NEVER WRITE ON BEHALF OF THE USER.
3. USE ONLY THE TASKS THAT ACTUALLY EXIST ON THE BOARD (PROVIDED IN THE CONTEXT ABOVE). NEVER HALLUCINATE OR INVENT NON-EXISTENT TASKS OR LINKS. IF THERE ARE NO MATCHING TASKS, EXPLICITLY SAY SO.
4. WHEN LISTING TASKS, ALWAYS FORMAT THEM AS A NUMBERED (1., 2.) OR BULLETED (-) MARKDOWN LIST ON NEW LINES.

LONG-TERM MEMORY:
{memory}
"""


def chat_with_ai(model_path: str, messages: list[dict[str, str]], vault_path: str, board_state: str) -> str:
    llm = get_llm(model_path)
    
    memory = load_user_memory(vault_path)
    
    # Считываем текущий язык интерфейса приложения
    settings = get_ui_settings()
    lang = settings.get("language", "ru")
    
    # Выбираем соответствующую строгую системную инструкцию
    if lang == "en":
        sys_content = SYSTEM_PROMPT_EN.format(memory=memory, board_state=board_state)
    else:
        sys_content = SYSTEM_PROMPT_RU.format(memory=memory, board_state=board_state)
        
    # --- РУЧНОЙ ШАБЛОН ДЛЯ SAIGA/MISTRAL ---
    # Мы собираем промпт вручную, используя родные токены разметки Saiga: <s>system, <s>user, <s>bot
    raw_prompt = f"<s>system\n{sys_content}</s>\n"
    for msg in messages:
        role = msg["role"]
        content = msg["content"]
        if role == "user":
            raw_prompt += f"<s>user\n{content}</s>\n"
        elif role in ("assistant", "bot"):
            raw_prompt += f"<s>bot\n{content}</s>\n"
            
    # Добавляем финальный токен бота, давая модели команду "отвечай отсюда"
    raw_prompt += "<s>bot\n"
    # ----------------------------------------

    # Используем базовый метод create_completion вместо create_chat_completion
    response = llm.create_completion(
        prompt=raw_prompt,
        max_tokens=500,
        temperature=0.3,
        stop=["</s>", "<s>", "<|im_end|>"] # Гарантирует остановку генерации при попытке выйти за рамки своей роли
    )
    
    return response["choices"][0]["text"].strip()

def extract_memory(model_path: str, chat_history: str, vault_path: str):
    """Фоновая функция: LLM анализирует диалог и дописывает факты о пользователе в профиль."""
    llm = get_llm(model_path)
    old_memory = load_user_memory(vault_path)
    
    prompt = f"""Ниже представлен диалог психолога с пользователем.
Текущие факты о пользователе: {old_memory}
Выдели 1-2 новых важных психологических факта о пользователе из этого диалога (цели, страхи, паттерны) и обнови профиль.
Напиши ТОЛЬКО обновленный профиль (максимум 5-7 предложений).
Диалог:
{chat_history}
"""
    response = llm.create_chat_completion(
        messages=[{"role": "user", "content": prompt}],
        max_tokens=300,
        temperature=0.3,
    )
    new_memory = response["choices"][0]["message"]["content"].strip()
    save_user_memory(vault_path, new_memory)

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
    response = llm.create_chat_completion(
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
