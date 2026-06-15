import asyncio
import json
import re
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
    if not is_apple_silicon():
        return {"supported": False, "reason": "Requires Apple Silicon (M1+)"}
    
    downloaded = []
    for name, info in AVAILABLE_MODELS.items():
        if (MODELS_DIR / info["file"]).exists():
            downloaded.append(name)
            
        return {
            "supported": True,
            "available_models": list(AVAILABLE_MODELS.keys()),
            "downloaded_models": downloaded
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

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatReq(BaseModel):
    model_name: str
    messages: List[ChatMessage]

@router.post("/chat")
async def ai_chat(req: ChatReq, db: AsyncSession = Depends(get_session)):
    model_info = AVAILABLE_MODELS.get(req.model_name)
    model_path = str(MODELS_DIR / model_info["file"])
    
    msgs = [{"role": m.role, "content": m.content} for m in req.messages]
    vault = get_active_vault()
    
    # СБОР КОНТЕКСТА ДОСКИ ДЛЯ ИИ
    active_ws_id = get_ui_settings().get("active_workspace_id")
    ws_res = await db.execute(select(WorkspaceModel).order_by(WorkspaceModel.position))
    workspaces = ws_res.scalars().all()
    
    board_state = ""
    for w in workspaces:
        # Даем ИИ понять, на какую вкладку сейчас смотрит пользователь
        is_active_mark = " (АКТИВНАЯ ВКЛАДКА СЕЙЧАС)" if w.id == active_ws_id else ""
        board_state += f"Вкладка ID:{w.id} '{w.name}'{is_active_mark}\n"
        
        cols_res = await db.execute(select(ColumnModel).where(ColumnModel.workspace_id == w.id).order_by(ColumnModel.position))
        # Считываем текущий язык интерфейса приложения для локализации маркеров
        settings = get_ui_settings()
        lang = settings.get("language", "ru")

        for c in cols_res.scalars().all():
            board_state += f"  Колонка ID:{c.id} '{c.title}'\n"
            
            # 🔥 Исключаем подзадачи (чек-листы), чтобы ИИ не считал их отдельными карточками,
            # если только они не вынесены на доску принудительно (через "глазик").
            tasks_res = await db.execute(
                select(TaskModel)
                .where(
                    TaskModel.column_id == c.id,
                    or_(~TaskModel.parents.any(), TaskModel.is_visible_on_board == True)
                )
                .order_by(TaskModel.position)
            )
            tasks = tasks_res.scalars().all()
            
            for t in tasks:
                # Проверяем, содержит ли задача ссылки в описании
                has_links = False
                if t.description:
                    desc_lower = t.description.lower()
                    has_links = "http://" in desc_lower or "https://" in desc_lower or "](doe/" in desc_lower or "](http" in desc_lower

                if lang == "en":
                    link_indicator = " (CONTAINS WEBLINKS IN DESCRIPTION)" if has_links else ""
                else:
                    link_indicator = " (СОДЕРЖИТ ВЕБ-ССЫЛКИ В ОПИСАНИИ)" if has_links else ""

                # Показываем ИИ правильный формат Markdown-ссылки со служебным маркером
                board_state += f"    [{t.title}](doe://task/{t.id}){link_indicator}\n"
            
            if not tasks:
                board_state += f"    (пусто)\n"

    try:
        reply = await asyncio.to_thread(chat_with_ai, model_path, msgs, vault, board_state)
        
        # ПАРСИНГ КОМАНД (БЕЗ АВТОВЫПОЛНЕНИЯ)
        proposed_actions = []
        
        calls = re.findall(r'<call>(.*?)</call>', reply, re.DOTALL)
        for call_str in calls:
            try:
                cmd = json.loads(call_str)
                if cmd.get("action") and cmd.get("params") is not None:
                    proposed_actions.append(cmd)
            except Exception as ex:
                print(f"[AI] Failed to parse tool call: {ex}")
        
        # Убираем JSON команды из финального текста для пользователя
        reply_clean = re.sub(r'<call>.*?</call>', '', reply, flags=re.DOTALL).strip()
        
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
                
                link_text = title if title else f"Задача #{real_id}"
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
                    return f"[{title}](doe://task/{db_tasks_map[clean_title]})"
                    
                for db_title, real_id in db_tasks_map.items():
                    db_title_clean = re.sub(r'^(?:\d+[\.)]\s*|[-•*]\s*)', '', db_title).strip()
                    if len(clean_title) > 3 and (db_title_clean in clean_title or clean_title in db_title_clean):
                        return f"[{title}](doe://task/{real_id})"
                        
                return match.group(0)
                
            reply_clean = re.sub(r'\[(.*?)\]\(doe://task/(\d+)\)', replace_markdown, reply_clean)
            
        except Exception as repair_err:
            print(f"[AI] Global Link repair failed: {repair_err}")
        # -------------------------------------------------------------------
        
        return {
            "reply": reply_clean, 
            "proposed_actions": proposed_actions,
            "actions_executed": False,
            "settings_changed": False
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class AiActionReq(BaseModel):
    action: str
    params: dict

class AiExecuteReq(BaseModel):
    actions: List[AiActionReq]
    model_name: Optional[str] = None

@router.post("/execute")
async def execute_ai_actions(req: AiExecuteReq, db: AsyncSession = Depends(get_session)):
    actions_executed = False
    settings_changed = False
    
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
                new_col = ColumnModel(title=params.get("title", "Новая колонка"), mode=ColumnMode.DEFAULT, position=99.0, workspace_id=params.get("workspace_id"))
                db.add(new_col)
                await db.commit()
                actions_executed = True
            elif action == "delete_column":
                res = await db.execute(select(ColumnModel).where(ColumnModel.id == params.get("column_id")))
                col = res.scalar_one_or_none()
                if col:
                    await db.delete(col)
                    await db.commit()
                    actions_executed = True
            elif action == "create_task":
                await create_task(db, TaskCreate(title=params.get("title", "Новая задача"), column_id=int(params.get("column_id"))))
                actions_executed = True
            elif action == "delete_task":
                await delete_task(db, int(params.get("task_id")))
                actions_executed = True
            elif action == "move_task":
                await move_task_srv(db, int(params.get("task_id")), int(params.get("target_column_id")))
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
                    except Exception: pass
                await db.commit()
                actions_executed = True
        except Exception as ex:
            print(f"[AI] Tool execution failed for action {action}: {ex}")
    
    return {
        "success": True, 
        "actions_executed": actions_executed,
        "settings_changed": settings_changed
    }

class PrioritizeReq(BaseModel):
    model_name: str
    daily_context: str
    chat_history: str # Для обновления памяти в фоне
    only_visible: bool

@router.post("/prioritize")
async def auto_prioritize(req: PrioritizeReq, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_session)):
    model_info = AVAILABLE_MODELS.get(req.model_name)
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
