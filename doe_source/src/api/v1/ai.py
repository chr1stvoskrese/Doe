import asyncio
import json
import re
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from pydantic import BaseModel
from typing import List, Optional

from src.db.database import get_session
from src.db.models import TaskModel, WorkspaceModel, ColumnModel, ColumnMode
from src.core.config import get_active_vault, get_ui_settings, set_ui_settings
from src.schemas.workspace import WorkspaceCreate
from src.services.workspace_service import create_workspace
from src.schemas.task import TaskCreate
from src.services.task_service import create_task, delete_task, move_task as move_task_srv
from src.services.ai_service import (
    is_apple_silicon, chat_with_ai, 
    extract_memory, calculate_priorities, AVAILABLE_MODELS, MODELS_DIR
)

router = APIRouter(prefix="/ai", tags=["ai"])

@router.get("/status")
async def get_ai_status():
    """Проверка оборудования и наличия скачанных моделей."""
    from src.services.hardware import get_hardware_profile, tier_allows

    hw = get_hardware_profile()
    if not is_apple_silicon():
        return {
            "supported": False,
            "reason": "Requires Apple Silicon (M1+)",
            "hardware": hw,
        }

    tier = hw["tier"]

    # Фильтруем каталог по tier железа: модель видна в настройках, только если
    # машина ей соответствует (light < standard < pro).
    available = []
    for name, info in AVAILABLE_MODELS.items():
        if tier_allows(tier, info.get("min_tier", "light")):
            available.append(name)

    downloaded = []
    for name, info in AVAILABLE_MODELS.items():
        if (MODELS_DIR / info["file"]).exists():
            downloaded.append(name)

    return {
        "supported": True,
        "available_models": available,
        "downloaded_models": downloaded,
        "hardware": hw,
        # Метаданные для UI: размер, tier, семейство каждой модели.
        "models_info": {name: {
            "family": info["family"],
            "params": info["params"],
            "min_tier": info["min_tier"],
            "size_gb": info["size_gb"],
            "downloaded": (MODELS_DIR / info["file"]).exists(),
        } for name, info in AVAILABLE_MODELS.items() if tier_allows(tier, info.get("min_tier", "light"))},
    }

class DownloadReq(BaseModel):
    model_name: str

@router.post("/download")
async def download_ai_model(req: DownloadReq):
    from src.services.ai_service import download_model_with_progress
    import threading
    
    # Запускаем в фоновом Python-потоке. 
    # Он работает тихо, в рамках нашего процесса, не открывая иконки в Dock.
    threading.Thread(target=download_model_with_progress, args=(req.model_name,), daemon=True).start()
    return {"success": True, "status": "started"}

@router.get("/download-progress")
async def get_ai_download_progress(model_name: str):
    from src.services.ai_service import get_download_progress
    return get_download_progress(model_name)

@router.post("/cancel")
async def cancel_ai_download(req: DownloadReq):
    from src.services.ai_service import cancel_download
    cancel_download(req.model_name)
    return {"success": True}

@router.delete("/delete")
async def delete_ai_model(req: DownloadReq):
    from src.services.ai_service import delete_model
    success = delete_model(req.model_name)
    if not success:
        raise HTTPException(status_code=500, detail="Не удалось удалить файл модели")
    return {"success": True}


# ═══════════════════════════════════════════════════════════════
# УМНЫЙ ПОИСК ПО ДОСКЕ (серверные хелперы для search_board / get_task_details)
# ═══════════════════════════════════════════════════════════════

async def _search_board(db, query: str, lang: str = "ru") -> str:
    """Ищет задачи по названию, описанию и подзадачам. Возвращает форматированный текст."""
    from sqlalchemy.orm import selectinload
    
    # Поиск по заголовкам задач (ILIKE для case-insensitive)
    search_term = f"%{query}%"
    tasks_res = await db.execute(
        select(TaskModel)
        .options(selectinload(TaskModel.subtasks))
        .where(
            or_(
                TaskModel.title.ilike(search_term),
                TaskModel.description.ilike(search_term),
            )
        )
        .order_by(TaskModel.priority.desc().nullslast())
        .limit(15)
    )
    tasks = tasks_res.scalars().all()
    
    # Также ищем по заголовкам подзадач (задач, у которых есть родители)
    subtask_parent_ids = set()
    subtask_res = await db.execute(
        select(TaskModel)
        .where(TaskModel.title.ilike(search_term), TaskModel.parents.any())
    )
    for sub in subtask_res.scalars().all():
        for p in sub.parents:
            subtask_parent_ids.add(p.id)
    
    # Догружаем родителей подзадач, совпавших по названию
    extra_tasks = []
    if subtask_parent_ids:
        # Не дублируем уже найденные
        existing_ids = {t.id for t in tasks}
        for pid in subtask_parent_ids:
            if pid not in existing_ids:
                existing_ids.add(pid)
                extra_res = await db.execute(
                    select(TaskModel)
                    .options(selectinload(TaskModel.subtasks))
                    .where(TaskModel.id == pid)
                )
                t = extra_res.scalar_one_or_none()
                if t:
                    extra_tasks.append(t)
    
    all_tasks = list(tasks) + extra_tasks
    
    if not all_tasks:
        return "Поиск не дал результатов." if lang == "ru" else "No search results found."
    
    result_lines = []
    if lang == "ru":
        result_lines.append(f"=== РЕЗУЛЬТАТЫ ПОИСКА ПО ЗАПРОСУ «{query}» ===")
    else:
        result_lines.append(f"=== SEARCH RESULTS FOR «{query}» ===")
    
    for t in all_tasks:
        # Находим колонку и вкладку задачи
        col_res = await db.execute(select(ColumnModel).where(ColumnModel.id == t.column_id))
        col = col_res.scalar_one_or_none()
        col_title = col.title if col else "?"
        
        ws_title = "?"
        if col:
            ws_res = await db.execute(select(WorkspaceModel).where(WorkspaceModel.id == col.workspace_id))
            ws = ws_res.scalar_one_or_none()
            ws_title = ws.name if ws else "?"
        
        if lang == "ru":
            result_lines.append(f"\n[B] {t.title}[/B]")
            result_lines.append(f"  ID: {t.id} | Вкладка: {ws_title} | Колонка: {col_title}")
            if t.priority:
                result_lines.append(f"  Приоритет: {t.priority:.0f}%")
            if t.due_date:
                result_lines.append(f"  Дедлайн: {t.due_date.strftime('%Y-%m-%d')}")
        else:
            result_lines.append(f"\n[B] {t.title}[/B]")
            result_lines.append(f"  ID: {t.id} | Tab: {ws_title} | Column: {col_title}")
            if t.priority:
                result_lines.append(f"  Priority: {t.priority:.0f}%")
            if t.due_date:
                result_lines.append(f"  Deadline: {t.due_date.strftime('%Y-%m-%d')}")
        
        # Полное описание
        if t.description:
            clean_desc = re.sub(r'!?\[([^\]]*)\]\(doe/[^)]+\)[\s!]*', '', t.description)
            clean_desc = re.sub(r'[#*`>]', '', clean_desc)
            clean_desc = re.sub(r'\s+', ' ', clean_desc).strip()
            if lang == "ru":
                result_lines.append(f"  Описание: {clean_desc}")
            else:
                result_lines.append(f"  Description: {clean_desc}")
        
        # Подзадачи
        if t.subtasks:
            subs = [f"[{s.title}](doe://task/{s.id})" for s in sorted(t.subtasks, key=lambda s: s.position)]
            label = "Подзадачи:" if lang == "ru" else "Subtasks:"
            result_lines.append(f"  {label} {', '.join(subs)}")
    
    return "\n".join(result_lines)


async def _get_task_details(db, task_id: int, lang: str = "ru") -> str:
    """Получает полную информацию о задаче. Возвращает форматированный текст."""
    from sqlalchemy.orm import selectinload
    
    res = await db.execute(
        select(TaskModel)
        .options(selectinload(TaskModel.subtasks))
        .where(TaskModel.id == task_id)
    )
    t = res.scalar_one_or_none()
    
    if not t:
        return f"Задача с ID {task_id} не найдена." if lang == "ru" else f"Task with ID {task_id} not found."
    
    # Находим колонку и вкладку
    col_res = await db.execute(select(ColumnModel).where(ColumnModel.id == t.column_id))
    col = col_res.scalar_one_or_none()
    col_title = col.title if col else "?"
    
    ws_title = "?"
    if col:
        ws_res = await db.execute(select(WorkspaceModel).where(WorkspaceModel.id == col.workspace_id))
        ws = ws_res.scalar_one_or_none()
        ws_title = ws.name if ws else "?"
    
    result_lines = []
    if lang == "ru":
        result_lines.append(f"=== ПОЛНАЯ ИНФОРМАЦИЯ О ЗАДАЧЕ #{t.id} ===")
        result_lines.append(f"Название: {t.title}")
        result_lines.append(f"Вкладка: {ws_title} | Колонка: {col_title}")
        if t.priority:
            result_lines.append(f"Приоритет: {t.priority:.0f}%")
        if t.due_date:
            result_lines.append(f"Дедлайн: {t.due_date.strftime('%Y-%m-%d')}")
        if t.completed_at:
            result_lines.append(f"Завершена: {t.completed_at.strftime('%Y-%m-%d %H:%M')}")
    else:
        result_lines.append(f"=== FULL DETAILS FOR TASK #{t.id} ===")
        result_lines.append(f"Title: {t.title}")
        result_lines.append(f"Tab: {ws_title} | Column: {col_title}")
        if t.priority:
            result_lines.append(f"Priority: {t.priority:.0f}%")
        if t.due_date:
            result_lines.append(f"Deadline: {t.due_date.strftime('%Y-%m-%d')}")
        if t.completed_at:
            result_lines.append(f"Completed: {t.completed_at.strftime('%Y-%m-%d %H:%M')}")
    
    # Полное описание
    if t.description:
        clean_desc = re.sub(r'!?\[([^\]]*)\]\(doe/[^)]+\)[\s!]*', '', t.description)
        clean_desc = re.sub(r'[#*`>]', '', clean_desc)
        clean_desc = re.sub(r'\s+', ' ', clean_desc).strip()
        label = "Описание:" if lang == "ru" else "Description:"
        result_lines.append(f"{label} {clean_desc}")
    else:
        label = "(нет описания)" if lang == "ru" else "(no description)"
        result_lines.append(label)
    
    # Подзадачи
    if t.subtasks:
        subs = [f"[{s.title}](doe://task/{s.id})" for s in sorted(t.subtasks, key=lambda s: s.position)]
        label = "Подзадачи:" if lang == "ru" else "Subtasks:"
        result_lines.append(f"{label} {', '.join(subs)}")
    
    # Родительские задачи
    parents_res = await db.execute(
        select(TaskModel).where(TaskModel.subtasks.any(TaskModel.id == t.id))
    )
    parents = parents_res.scalars().all()
    if parents:
        p_list = [f"[{p.title}](doe://task/{p.id})" for p in parents]
        label = "Родительские задачи:" if lang == "ru" else "Parent tasks:"
        result_lines.append(f"{label} {', '.join(p_list)}")
    
    return "\n".join(result_lines)

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatReq(BaseModel):
    model_name: str
    messages: List[ChatMessage]

@router.post("/chat")
async def ai_chat(req: ChatReq, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_session)):
    model_info = AVAILABLE_MODELS.get(req.model_name)
    if not model_info:
        raise HTTPException(status_code=404, detail=f"Модель '{req.model_name}' не найдена в каталоге")
    model_path = str(MODELS_DIR / model_info["file"])
    
    msgs = [{"role": m.role, "content": m.content} for m in req.messages]
    vault = get_active_vault()
    
    # СБОР КОНТЕКСТА ДОСКИ ДЛЯ ИИ
    active_ws_id = get_ui_settings().get("active_workspace_id")
    settings = get_ui_settings()
    lang = settings.get("language", "ru")
    
    ws_res = await db.execute(select(WorkspaceModel).order_by(WorkspaceModel.position))
    workspaces = ws_res.scalars().all()
    
    board_state = ""
    
    # --- ДОБАВЛЯЕМ АКТИВНЫЕ НАПОМИНАНИЯ В КОНТЕКСТ ---
    from src.core.config import get_active_reminders
    from datetime import datetime, timezone
    
    reminders = get_active_reminders()
    if reminders:
        board_state += "=== ACTIVE REMINDERS ===\n" if lang == "en" else "=== АКТИВНЫЕ НАПОМИНАНИЯ ===\n"
        for r in reminders:
            # Конвертируем UTC время из конфига в ЛОКАЛЬНОЕ время для ИИ
            try:
                # Читаем UTC-строку и переводим в локальный часовой пояс пользователя
                utc_dt = datetime.fromisoformat(r['due_time'].replace("Z", "")).replace(tzinfo=timezone.utc)
                local_dt = utc_dt.astimezone()
                local_time_str = local_dt.strftime("%Y-%m-%d %H:%M")
            except Exception:
                local_time_str = r['due_time']  # Фолбэк, если что-то пошло не так

            if lang == "en":
                board_state += f"- Reminder ID: {r['reminder_id']} | Task ID: {r['task_id']} | Due: {local_time_str} | Message: {r['message']}\n"
            else:
                board_state += f"- Напоминание ID: {r['reminder_id']} | Задача ID: {r['task_id']} | Время: {local_time_str} | Сообщение: {r['message']}\n"
        board_state += "==========================\n\n"
    # ---------------------------------------------------

    for w in workspaces:
        # Labels for current language
        if lang == "en":
            active_mark = " (ACTIVE TAB NOW)" if w.id == active_ws_id else ""
            board_state += f"Tab ID:{w.id} '{w.name}'{active_mark}\n"
        else:
            active_mark = " (АКТИВНАЯ ВКЛАДКА СЕЙЧАС)" if w.id == active_ws_id else ""
            board_state += f"Вкладка ID:{w.id} '{w.name}'{active_mark}\n"
        
        cols_res = await db.execute(select(ColumnModel).where(ColumnModel.workspace_id == w.id).order_by(ColumnModel.position))

        for c in cols_res.scalars().all():
            if lang == "en":
                board_state += f"  Column ID:{c.id} '{c.title}'\n"
            else:
                board_state += f"  Колонка ID:{c.id} '{c.title}'\n"
            
            # 🔥 Загружаем задачи ВМЕСТЕ с подзадачами, чтобы ИИ мог их видеть и редактировать
            from sqlalchemy.orm import selectinload
            tasks_res = await db.execute(
                select(TaskModel)
                .options(selectinload(TaskModel.subtasks))
                .where(
                    TaskModel.column_id == c.id,
                    or_(~TaskModel.parents.any(), TaskModel.is_visible_on_board == True)
                )
                .order_by(TaskModel.position)
            )
            tasks = tasks_res.scalars().all()
            
            for t in tasks:
                has_links = False
                if t.description:
                    desc_lower = t.description.lower()
                    has_links = "http://" in desc_lower or "https://" in desc_lower or "](doe/" in desc_lower or "](http" in desc_lower

                if lang == "en":
                    link_indicator = " (CONTAINS WEBLINKS IN DESCRIPTION)" if has_links else ""
                else:
                    link_indicator = " (СОДЕРЖИТ ВЕБ-ССЫЛКИ В ОПИСАНИИ)" if has_links else ""
                
                # Добавляем описание задачи (до 500 символов), чтобы ИИ мог точечно редактировать
                desc_snippet = ""
                if t.description:
                    # Чистим только вложения и изображения (НЕ трогаем ссылки на задачи)
                    clean_desc = re.sub(r'!?\[([^\]]*)\]\(doe/[^)]+\)[\s!]*', '', t.description)  # вложения
                    clean_desc = re.sub(r'[#*`>]', '', clean_desc)  # markdown-символы
                    clean_desc = re.sub(r'\s+', ' ', clean_desc).strip()
                    trunc = len(clean_desc) > 500
                    desc_snippet = f" | Описание: {clean_desc[:500]}{'…' if trunc else ''}"
                    if trunc:
                        desc_snippet += f" (всего {len(clean_desc)} зн.)"

                # Добавляем дедлайн в контекст, если есть
                due_info = ""
                if t.due_date:
                    if lang == "en":
                        due_info = f" | Deadline: {t.due_date.strftime('%Y-%m-%d')}"
                    else:
                        due_info = f" | Дедлайн: {t.due_date.strftime('%Y-%m-%d')}"

                board_state += f"    [{t.title}](doe://task/{t.id}){desc_snippet}{due_info}{link_indicator}\n"
                # Добавляем информацию о подзадачах в контекст
                if t.subtasks:
                    for sub in sorted(t.subtasks, key=lambda s: s.position):
                        board_state += f"      - Подзадача [{sub.title}](doe://task/{sub.id})\n"
            
            if not tasks:
                board_state += f"    ()\n" if lang == "en" else f"    (пусто)\n"

    try:
        # chat_with_ai теперь возвращает dict с reply и proposed_actions
        # (нативный tool-calling + фолбэк на <call> внутри функции).
        result = await asyncio.to_thread(chat_with_ai, model_path, msgs, vault, board_state)
        reply_clean = result["reply"]
        proposed_actions = result["proposed_actions"]
        
        # ═══════════════════════════════════════════════════════════
        # ЦИКЛ УМНОГО ПОИСКА: если ИИ запросил search_board или get_task_details,
        # выполняем поиск на сервере, скармливаем результат обратно ИИ,
        # чтобы он мог уточнить ответ. Максимум 3 итерации.
        # ═══════════════════════════════════════════════════════════
        MAX_SEARCH_ITERATIONS = 3
        all_search_results = []  # накапливаем для финального контекста
        
        for search_iter in range(MAX_SEARCH_ITERATIONS):
            # Отделяем поисковые действия от обычных
            search_actions = []
            other_actions = []
            for a in proposed_actions:
                if a.get("action") in ("search_board", "get_task_details"):
                    search_actions.append(a)
                else:
                    other_actions.append(a)
            
            if not search_actions:
                # Нет поисковых запросов — выходим из цикла
                proposed_actions = other_actions
                break
            
            # Выполняем поисковые действия
            search_results_text = ""
            for sa in search_actions:
                action_name = sa["action"]
                params = sa.get("params", {})
                
                try:
                    if action_name == "search_board":
                        query = params.get("query", "")
                        if query:
                            result_text = await _search_board(db, query, lang)
                            search_results_text += result_text + "\n\n"
                            all_search_results.append({"action": "search_board", "query": query, "found": True})
                        else:
                            search_results_text += "(search_board: пустой запрос)\n"
                    elif action_name == "get_task_details":
                        task_id = int(params.get("task_id", 0))
                        if task_id > 0:
                            result_text = await _get_task_details(db, task_id, lang)
                            search_results_text += result_text + "\n\n"
                            all_search_results.append({"action": "get_task_details", "task_id": task_id, "found": True})
                        else:
                            search_results_text += "(get_task_details: не указан task_id)\n"
                except Exception as search_ex:
                    print(f"[AI] Search action {action_name} failed: {search_ex}")
                    search_results_text += f"(Ошибка поиска: {search_ex})\n"
            
            if not search_results_text.strip():
                proposed_actions = other_actions
                break
            
            print(f"[AI] Search iteration {search_iter + 1}: feeding results back to LLM...")
            
            # Формируем системное сообщение с результатами поиска
            if lang == "ru":
                tool_msg = f"[РЕЗУЛЬТАТЫ ПОИСКА]\n{search_results_text}\nИспользуй эти данные для ответа пользователю."
            else:
                tool_msg = f"[SEARCH RESULTS]\n{search_results_text}\nUse this data in your response to the user."
            
            # Добавляем результаты поиска как новое сообщение и вызываем ИИ снова
            msgs_with_search = list(msgs) + [{"role": "user", "content": tool_msg}]
            
            try:
                result = await asyncio.to_thread(chat_with_ai, model_path, msgs_with_search, vault, board_state)
                reply_clean = result["reply"]
                proposed_actions = result["proposed_actions"]
            except Exception as loop_ex:
                print(f"[AI] Search loop iteration failed: {loop_ex}")
                proposed_actions = other_actions
                break
        # ═══════════════════════════════════════════════════════════
        
        # --- СИСТЕМА ГЛОБАЛЬНОГО РЕМОНТА ССЫЛОК (ALL WORKSPACES SUPPORT) ---
        # Мы сканируем всю базу данных на наличие задач во всех вкладках.
        # Если ИИ упомянул задачу с неактивного таба, мы найдем её реальный ID и сформируем верную ссылку.
        try:
            tasks_stmt = select(TaskModel.id, TaskModel.title)
            tasks_res = await db.execute(tasks_stmt)
            all_db_tasks = tasks_res.fetchall()
            
            # Карта всех существующих задач: {название: id}
            db_tasks_map = {r[1].strip().lower().replace(" г.", "").strip(): r[0] for r in all_db_tasks}
            
            # 1. Исправляем сырые текстовые упоминания: "Задача ID:21 'Почитать книгу'" -> "[Почитать книгу](doe://task/22)"
            def replace_raw(match):
                old_id = match.group(1)
                title = match.group(2)
                
                real_id = old_id
                if title:
                    title_clean = title.strip().lower().replace(" г.", "").strip()
                    if title_clean in db_tasks_map:
                        real_id = db_tasks_map[title_clean]
                    else:
                        for db_title, rid in db_tasks_map.items():
                            if len(title_clean) > 3 and (db_title in title_clean or title_clean in db_title):
                                real_id = rid
                                break
                
                link_text = title if title else (f"Task #{real_id}" if lang == "en" else f"Задача #{real_id}")
                return f"[{link_text}](doe://task/{real_id})"
                
            reply_clean = re.sub(
                r'(?:Задача|Task|Карточка|Карточку)\s*(?:ID:?|#)?\s*(\d+)(?:\s*[\'\"«](.*?)[\'\"»])?', 
                replace_raw, 
                reply_clean, 
                flags=re.IGNORECASE
            )
            
            # 2. Исправляем сформированные ИИ Markdown-ссылки с неверными ID
            def replace_markdown(match):
                title = match.group(1)
                old_id = match.group(2)
                
                clean_title = title.strip().lower().replace(" г.", "").strip()
                clean_title = re.sub(r'^(?:\d+[\.)]\s*|[-•*]\s*)', '', clean_title).strip() # Срезаем маркеры списков
                
                if clean_title in db_tasks_map:
                    real_id = db_tasks_map[clean_title]
                    return f"[{title}](doe://task/{real_id})"
                    
                for db_title, real_id in db_tasks_map.items():
                    db_title_clean = re.sub(r'^(?:\d+[\.)]\s*|[-•*]\s*)', '', db_title).strip()
                    if len(clean_title) > 3 and (db_title_clean in clean_title or clean_title in db_title_clean):
                        return f"[{title}](doe://task/{real_id})"
                        
                return match.group(0)
                
            reply_clean = re.sub(r'\[(.*?)\]\(doe://task/(\d+)\)', replace_markdown, reply_clean)
            
            # 3. Исправляем "осиротевшие" кавычки и скобки: "[Помыть раму]" или "Помыть раму" -> [Помыть раму](doe://task/X)
            def replace_orphans(match):
                full_match = match.group(0)
                title = match.group(1) or match.group(2)
                if not title:
                    return full_match
                    
                # Очищаем от мусора, если ИИ написал "[Название]" (кавычки, а внутри скобки)
                clean_title = title.strip('[]"«»\' ').lower().replace(" г.", "").strip()
                clean_title = re.sub(r'^(?:\d+[\.)]\s*|[-•*]\s*)', '', clean_title).strip()
                
                if clean_title in db_tasks_map:
                    return f"[{title.strip('[]')}](doe://task/{db_tasks_map[clean_title]})"
                    
                for db_title, real_id in db_tasks_map.items():
                    db_title_clean = re.sub(r'^(?:\d+[\.)]\s*|[-•*]\s*)', '', db_title).strip()
                    if len(clean_title) > 2 and db_title_clean == clean_title:
                        return f"[{title.strip('[]')}](doe://task/{real_id})"
                        
                return full_match

            # Ищем текст в квадратных скобках (если после них нет круглой скобки) ИЛИ текст в кавычках (ограничение до 100 символов, чтобы не захватывать абзацы)
            reply_clean = re.sub(r'\[([^\]\n]{2,100})\](?!\()|["«]([^"»\n]{2,100})["»]', replace_orphans, reply_clean)
            
        except Exception as repair_err:
            print(f"[AI] Global Link repair failed: {repair_err}")
        # -------------------------------------------------------------------

        # Фоновое обновление долгосрочной памяти
        chat_history_str = "\n".join(
            f"{'User' if m['role'] == 'user' else 'Assistant'}: {m['content']}"
            for m in msgs
        )
        background_tasks.add_task(extract_memory, model_path, chat_history_str, vault)

        return {
            "reply": reply_clean, 
            "proposed_actions": proposed_actions,
            "actions_executed": False,
            "settings_changed": False
        }
    except Exception as e:
        import traceback
        print(f"\n[AI API] Critical Error during /ai/chat request:")
        traceback.print_exc()
        print("\n")
        raise HTTPException(status_code=500, detail=str(e))

class AiActionReq(BaseModel):
    action: str
    params: dict

class AiExecuteReq(BaseModel):
    actions: List[AiActionReq]
    model_name: Optional[str] = None

@router.post("/execute")
async def execute_ai_actions(req: AiExecuteReq, db: AsyncSession = Depends(get_session)):
    # actions_executed = True только если хотя бы одно действие реально изменило
    # состояние (раньше флаг поднимался до вызова БД, а упавший int(None) глушался —
    # фронтенд всегда думал, что всё прошло успешно). failed_actions — список того,
    # что не сработало и почему, чтобы показать пользователю осмысленную ошибку.
    actions_executed = False
    settings_changed = False
    failed_actions = []
    search_outputs = []  # результаты search_board / get_task_details
    open_task_id = None
    clear_chat = False

    def _require(params, key, cast=str):
        """Достаёт обязательный параметр и приводит его к нужному типу.
        Возвращает (value, error). При отсутствии/невалидности error непустой."""
        raw = params.get(key)
        if raw is None or raw == "":
            return None, f"параметр «{key}» отсутствует"
        try:
            return cast(raw), None
        except (TypeError, ValueError):
            return None, f"параметр «{key}» имеет неверный тип ({raw!r})"

    model_path = None
    if req.model_name and req.model_name in AVAILABLE_MODELS:
        model_path = str(MODELS_DIR / AVAILABLE_MODELS[req.model_name]["file"])

    for cmd in req.actions:
        action = cmd.action
        params = cmd.params
        try:
            if action == "create_workspace":
                await create_workspace(db, WorkspaceCreate(name=params.get("name", "Новая вкладка")))
                actions_executed = True
            elif action == "create_column":
                ws_id, err = _require(params, "workspace_id", int)
                if err:
                    failed_actions.append({"action": action, "reason": err})
                else:
                    new_col = ColumnModel(
                        title=params.get("title", "Новая колонка"),
                        mode=ColumnMode.DEFAULT, position=99.0, workspace_id=ws_id
                    )
                    db.add(new_col)
                    await db.commit()
                    actions_executed = True
            elif action == "delete_column":
                col_id, err = _require(params, "column_id", int)
                if err:
                    failed_actions.append({"action": action, "reason": err})
                else:
                    res = await db.execute(select(ColumnModel).where(ColumnModel.id == col_id))
                    col = res.scalar_one_or_none()
                    if col:
                        await db.delete(col)
                        await db.commit()
                        actions_executed = True
                    else:
                        failed_actions.append({"action": action, "reason": f"колонка {col_id} не найдена"})
            elif action == "create_task":
                col_id, err = _require(params, "column_id", int)
                if err:
                    failed_actions.append({"action": action, "reason": err})
                else:
                    title = params.get("title") or "Новая задача"
                    desc = params.get("description")
                    parent_ids = params.get("parent_ids", [])
                    new_task = await create_task(db, TaskCreate(
                        title=title, column_id=col_id,
                        parent_ids=parent_ids if isinstance(parent_ids, list) else [parent_ids] if isinstance(parent_ids, int) else []
                    ))
                    if desc:
                        new_task.description = desc
                        await db.commit()
                    actions_executed = True
            elif action == "delete_task":
                task_id, err = _require(params, "task_id", int)
                if err:
                    failed_actions.append({"action": action, "reason": err})
                else:
                    await delete_task(db, task_id)
                    actions_executed = True
            elif action == "move_task":
                task_id, err1 = _require(params, "task_id", int)
                target_col, err2 = _require(params, "target_column_id", int)
                if err1 or err2:
                    failed_actions.append({"action": action, "reason": err1 or err2})
                else:
                    await move_task_srv(db, task_id, target_col)
                    actions_executed = True
            elif action == "set_theme":
                set_ui_settings(theme=params.get("theme", "light"))
                settings_changed = True
                actions_executed = True
            elif action == "toggle_extension":
                exts = get_ui_settings().get("extensions", {})
                exts[params.get("ext_name")] = params.get("state", True)
                set_ui_settings(extensions=exts)
                settings_changed = True
                actions_executed = True
            elif action == "change_language":
                set_ui_settings(language=params.get("language", "ru"))
                settings_changed = True
                actions_executed = True
            elif action == "switch_workspace":
                ws_id, err = _require(params, "workspace_id", int)
                if err:
                    failed_actions.append({"action": action, "reason": err})
                else:
                    set_ui_settings(active_workspace_id=ws_id)
                    settings_changed = True
                    actions_executed = True
            elif action == "open_task":
                t_id, err = _require(params, "task_id", int)
                if err:
                    failed_actions.append({"action": action, "reason": err})
                else:
                    open_task_id = t_id
                    actions_executed = True
            elif action == "clear_chat_context":
                clear_chat = True
                actions_executed = True
            elif action == "delete_reminder":
                rem_id, err = _require(params, "reminder_id", str)
                if err:
                    failed_actions.append({"action": action, "reason": err})
                else:
                    from src.core.config import remove_active_reminder
                    remove_active_reminder(rem_id)
                    actions_executed = True
            elif action == "set_reminders":
                rems = params.get("reminders", [])
                if not isinstance(rems, list) or not rems:
                    failed_actions.append({"action": action, "reason": "Список напоминаний пуст или неверный формат"})
                else:
                    from src.core.config import spawn_notification_worker, add_active_reminder, get_active_vault
                    import uuid
                    from datetime import datetime, timedelta
                    
                    for r_data in rems:
                        t_id = r_data.get("task_id")
                        delay = r_data.get("delay_seconds")
                        target_dt_str = r_data.get("target_datetime")
                        msg = r_data.get("message")
                        
                        if not t_id or not msg:
                            failed_actions.append({"action": action, "reason": "В одном из напоминаний отсутствуют обязательные поля"})
                            continue
                            
                        from datetime import datetime, timedelta
                        now_local = datetime.now()
                        now_utc = datetime.utcnow()
                        final_delay = 0

                        # Python сам считает разницу во времени
                        if target_dt_str:
                            try:
                                # Нормализуем строку от LLM (убираем 'T', отсекаем секунды/Z)
                                # "2026-05-18T18:44:00Z" -> "2026-05-18 18:44"
                                clean_dt_str = target_dt_str.replace('T', ' ')[:16]
                                target_dt = datetime.strptime(clean_dt_str, "%Y-%m-%d %H:%M")
                                
                                # Срезаем секунды у локального времени, чтобы разница была ровно в минутах (без погрешностей в 59 сек)
                                diff_seconds = (target_dt - now_local.replace(second=0, microsecond=0)).total_seconds()
                                
                                # Если ИИ промахнулся в прошлое (до 10 минут) из-за долгих раздумий
                                # прощаем и ставим срабатывание на "прямо сейчас"
                                if -600 <= diff_seconds <= 0:
                                    final_delay = 2
                                else:
                                    final_delay = int(diff_seconds)
                                
                                # Чтобы итоговое время UTC тоже было с нулями секунд
                                now_utc = now_utc.replace(second=0, microsecond=0)
                            except Exception as e:
                                print(f"[AI] Ошибка парсинга времени от LLM: '{target_dt_str}'. Ошибка: {e}")

                        # Если даты не было или не распарсилась, берем delay_seconds
                        if final_delay <= 0 and delay is not None:
                            try:
                                final_delay = int(delay)
                            except ValueError:
                                final_delay = 0

                        if final_delay <= 0:
                            failed_actions.append({"action": action, "reason": f"Не удалось определить корректное время в будущем (ИИ передал: {target_dt_str or delay})"})
                            continue
                            
                        # Получаем заголовок задачи
                        res = await db.execute(select(TaskModel.title).where(TaskModel.id == int(t_id)))
                        t_title = res.scalar_one_or_none() or "Doe Task"
                        
                        due_time = now_utc + timedelta(seconds=final_delay)
                        due_time_iso = due_time.isoformat() + "Z"
                        vault_path = get_active_vault()
                        reminder_id = str(uuid.uuid4())
                        
                        pid = spawn_notification_worker(
                            task_id=int(t_id), task_title=t_title, message=msg,
                            due_time_iso=due_time_iso, vault_path=vault_path, reminder_id=reminder_id
                        )
                        add_active_reminder(int(t_id), t_title, msg, due_time_iso, pid, vault_path, reminder_id)
                        
                    actions_executed = True
            elif action == "update_task":
                t_id, err = _require(params, "task_id", int)
                if err:
                    failed_actions.append({"action": action, "reason": err})
                else:
                    res = await db.execute(select(TaskModel).where(TaskModel.id == t_id))
                    task = res.scalar_one_or_none()
                    if task:
                        if "title" in params: task.title = params["title"]
                        if "description" in params: task.description = params["description"]
                        if "priority" in params:
                            val = params["priority"]
                            if val is None or str(val).lower() == "null" or str(val).strip() == "":
                                task.priority = None
                                task.priority_data = None
                            else:
                                try:
                                    task.priority = float(val)
                                    if not task.priority_data:
                                        task.priority_data = {"manual": True}
                                except: pass
                        if "is_visible_on_board" in params:
                            task.is_visible_on_board = bool(params["is_visible_on_board"])
                        if "completed" in params:
                            # completed: true → ставит completed_at, false → снимает
                            task.completed_at = datetime.utcnow() if params["completed"] else None
                        if "due_date" in params:
                            val = params["due_date"]
                            if val is None or str(val).strip() == "" or str(val).lower() == "null":
                                task.due_date = None  # снять дедлайн
                            else:
                                try:
                                    task.due_date = datetime.fromisoformat(str(val).replace("Z", ""))
                                except: pass
                        await db.commit()
                        actions_executed = True
                    else:
                        failed_actions.append({"action": action, "reason": f"задача {t_id} не найдена"})
            elif action == "remember_fact":
                fact, err = _require(params, "fact", str)
                if err:
                    failed_actions.append({"action": action, "reason": err})
                else:
                    from datetime import date
                    from src.core.config import get_active_vault
                    from src.services.ai_service import atomic_append_memory
                    today = date.today().isoformat()
                    # В отдельном потоке, чтобы не блокировать event loop если
                    # extract_memory держит _memory_lock
                    await asyncio.to_thread(atomic_append_memory, get_active_vault(), f"- [{today}] {fact}")
                    actions_executed = True
            elif action == "forget_fact":
                fact, err = _require(params, "fact", str)
                if err:
                    failed_actions.append({"action": action, "reason": err})
                else:
                    if model_path:
                        from src.core.config import get_active_vault
                        from src.services.ai_service import atomic_forget_fact
                        await asyncio.to_thread(atomic_forget_fact, get_active_vault(), fact, model_path)
                        actions_executed = True
                    else:
                        failed_actions.append({"action": action, "reason": "model not loaded"})
            elif action == "prioritize_all":
                context = params.get("context", "Обнови приоритеты")
                stmt = select(TaskModel).where(TaskModel.completed_at.is_(None))
                res = await db.execute(stmt)
                tasks = res.scalars().all()
                task_dicts = [{"id": t.id, "title": t.title, "description": t.description} for t in tasks]

                chunk_size = 10
                chunks = [task_dicts[i:i + chunk_size] for i in range(0, len(task_dicts), chunk_size)]
                for chunk in chunks:
                    try:
                        if model_path:
                            ai_res = await asyncio.to_thread(calculate_priorities, model_path, context, chunk)
                            for ai_task in ai_res.get("tasks", []):
                                t_id = ai_task.get("task_id")
                                db_task = next((t for t in tasks if t.id == t_id), None)
                                if db_task:
                                    c = ai_task.get("c", 5) / 10.0
                                    d = ai_task.get("d", 5) / 10.0
                                    a = ai_task.get("a", 5) / 10.0
                                    b = ai_task.get("b", 5) / 10.0
                                    e = ai_task.get("e", 5) / 10.0
                                    f = ai_task.get("f", 0)
                                    p = ai_task.get("p", 0) / 10.0
                                    s = ai_task.get("s", 0) / 10.0
                                    h = ai_task.get("h", 0) / 10.0

                                    d_eff = d * 0.85
                                    c_eff = pow(c, 0.85)
                                    value = (c_eff * d_eff) * (1 + 0.35 * f) + 0.15 * p * d_eff
                                    relief = (a * (0.10 + c_eff * (0.45 * d_eff + 0.50))) + 0.40 * s
                                    friction = b * (0.62 + 0.42 * e)
                                    base_score = 100 * (value + relief) / (1 + friction)
                                    score = base_score * (1 - 0.75 * h)

                                    db_task.priority = min(100.0, max(0.0, score))
                                    db_task.priority_data = {
                                        "c": c*10, "d": d*10, "a": a*10, "b": b*10, "e": e*10,
                                        "f": f, "p": p*10, "s": s*10, "h": h*10, "manual": False
                                    }
                    except Exception as chunk_ex:
                        print(f"[AI] prioritize chunk failed: {chunk_ex}")
                await db.commit()
                actions_executed = True
            elif action == "search_board":
                query = params.get("query", "")
                if not query:
                    failed_actions.append({"action": action, "reason": "пустой поисковый запрос"})
                else:
                    settings = get_ui_settings()
                    lang = settings.get("language", "ru")
                    search_result = await _search_board(db, query, lang)
                    search_outputs.append({"type": "search_board", "query": query, "result": search_result})
                    actions_executed = True
            elif action == "get_task_details":
                task_id, err = _require(params, "task_id", int)
                if err:
                    failed_actions.append({"action": action, "reason": err})
                else:
                    settings = get_ui_settings()
                    lang = settings.get("language", "ru")
                    detail_result = await _get_task_details(db, task_id, lang)
                    search_outputs.append({"type": "get_task_details", "task_id": task_id, "result": detail_result})
                    actions_executed = True
            elif action == "clear_all_priorities":
                stmt = select(TaskModel).where(TaskModel.priority.isnot(None))
                res = await db.execute(stmt)
                tasks = res.scalars().all()
                for t in tasks:
                    t.priority = None
                    t.priority_data = None
                await db.commit()
                actions_executed = True
            else:
                failed_actions.append({"action": action, "reason": "неизвестное действие"})
        except Exception as ex:
            print(f"[AI] Tool execution failed for action {action}: {ex}")
            failed_actions.append({"action": action, "reason": str(ex)})

    # success = True, если хотя бы одно действие выполнилось, либо запрос
    # был пустым. Если все действия упали — success = False, чтобы фронтенд
    # показал ошибку вместо «всё хорошо». Раньше всегда возвращалось True.
    success = actions_executed or len(req.actions) == 0
    return {
        "success": success,
        "actions_executed": actions_executed,
        "settings_changed": settings_changed,
        "failed_actions": failed_actions,
        "search_outputs": search_outputs,
        "open_task_id": open_task_id,
        "clear_chat": clear_chat
    }

class PrioritizeReq(BaseModel):
    model_name: str
    daily_context: str
    chat_history: str # Для обновления памяти в фоне
    only_visible: bool

@router.post("/prioritize")
async def auto_prioritize(req: PrioritizeReq, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_session)):
    model_info = AVAILABLE_MODELS.get(req.model_name)
    if not model_info:
        raise HTTPException(status_code=404, detail=f"Модель '{req.model_name}' не найдена в каталоге")
    model_path = str(MODELS_DIR / model_info["file"])
    vault = get_active_vault()
    
    # Запускаем обновление памяти в фоне
    background_tasks.add_task(extract_memory, model_path, req.chat_history, vault)
    
    # Собираем задачи
    stmt = select(TaskModel).where(TaskModel.completed_at.is_(None))
    if req.only_visible:
        stmt = stmt.where(TaskModel.is_visible_on_board == True)
        
    res = await db.execute(stmt)
    tasks = res.scalars().all()
    
    if not tasks:
        return {"success": True, "updated": 0}
        
    # Бьем задачи на чанки по 10 штук, чтобы не перегружать контекст LLM
    task_dicts = [{"id": t.id, "title": t.title, "description": t.description} for t in tasks]
    chunk_size = 10
    chunks = [task_dicts[i:i + chunk_size] for i in range(0, len(task_dicts), chunk_size)]
    
    updated_count = 0
    for chunk in chunks:
        try:
            ai_res = await asyncio.to_thread(calculate_priorities, model_path, req.daily_context, chunk)
            
            for ai_task in ai_res.get("tasks", []):
                t_id = ai_task.get("task_id")
                db_task = next((t for t in tasks if t.id == t_id), None)
                if db_task:
                    # Расчет итогового процента (по формуле Doe из JS)
                    c = ai_task.get("c", 5) / 10.0
                    d = ai_task.get("d", 5) / 10.0
                    a = ai_task.get("a", 5) / 10.0
                    b = ai_task.get("b", 5) / 10.0
                    e = ai_task.get("e", 5) / 10.0
                    f = ai_task.get("f", 0)
                    p = ai_task.get("p", 0) / 10.0
                    s = ai_task.get("s", 0) / 10.0
                    h = ai_task.get("h", 0) / 10.0

                    d_eff = d * 0.85
                    c_eff = pow(c, 0.85)
                    value = (c_eff * d_eff) * (1 + 0.35 * f) + 0.15 * p * d_eff
                    relief = (a * (0.10 + c_eff * (0.45 * d_eff + 0.50))) + 0.40 * s
                    friction = b * (0.62 + 0.42 * e)
                    base_score = 100 * (value + relief) / (1 + friction)
                    score = base_score * (1 - 0.75 * h)
                    
                    db_task.priority = min(100.0, max(0.0, score))
                    db_task.priority_data = {
                        "c": c*10, "d": d*10, "a": a*10, "b": b*10, "e": e*10,
                        "f": f, "p": p*10, "s": s*10, "h": h*10, "manual": False
                    }
                    updated_count += 1
        except Exception as ex:
            print(f"[AI] Chunk failed: {ex}")
            
    await db.commit()
    return {"success": True, "updated": updated_count}
