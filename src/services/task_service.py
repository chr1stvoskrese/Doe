"""
Бизнес-логика для работы с задачами.
"""

import re
import os
import shutil
from pathlib import Path
from urllib.parse import unquote
from src.core.config import get_active_vault

from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import set_committed_value # <--- ДОБАВИТЬ ЭТО

from src.db.models import TaskModel, ColumnModel, TimerSessionModel, ColumnMode
from src.schemas.task import TaskCreate, TaskUpdate, TimerSessionResponse


# --- ДОБАВЬТЕ ФУНКЦИЮ СБОРЩИКА МУСОРА ГДЕ-ТО В ФАЙЛЕ ---
async def cleanup_orphaned_attachments(db: AsyncSession):
    """
    Сканирует все задачи. Находит все ссылки на вложения. 
    Удаляет файлы из папки attachments, на которые больше нет ссылок.
    """
    result = await db.execute(select(TaskModel.description).where(TaskModel.description.isnot(None)))
    descriptions = result.scalars().all()
    
    used_files = set()
    # Регулярка захватывает все пути "attachments/имяфайла.ext" из Markdown ссылок
    pattern = re.compile(r'\]\((attachments/[^\)]+)\)')
    
    for desc in descriptions:
        matches = pattern.findall(desc)
        for match in matches:
            used_files.add(unquote(match))
        
    vault_path = Path(get_active_vault())
    att_dir = vault_path / "attachments"
    
    if not att_dir.exists():
        return
        
    for file_path in att_dir.iterdir():
        if file_path.is_file():
            rel_path = f"attachments/{file_path.name}"
            # Если файла нет в текстах описаний — уничтожаем
            if rel_path not in used_files:
                try:
                    os.remove(file_path)
                    print(f"[Garbage Collector] Deleted orphan: {file_path.name}")
                except Exception:
                    pass

def _calculate_task_time(task: TaskModel) -> None:
    """Вспомогательная функция для подсчета времени."""
    total_seconds = sum(
        (s.end_time - s.start_time).total_seconds() 
        for s in task.timer_sessions if s.end_time is not None
    )

    current_active = next((s for s in task.timer_sessions if s.is_active), None)
    
    if current_active:
        # БОЛЬШЕ НИКАКИХ СДВИГОВ И ЛИМИТОВ. Отдаем реальную дату запуска текущей сессии
        task.active_timer = TimerSessionResponse(
            id=current_active.id,
            start_time=current_active.start_time,
            is_active=True
        )
    else:
        task.active_timer = None

    task.total_time_spent = int(total_seconds)

async def create_task(db: AsyncSession, task_in: TaskCreate) -> TaskModel:
    result = await db.execute(
        select(TaskModel)
        .where(TaskModel.column_id == task_in.column_id)
        .order_by(TaskModel.position.desc())
        .limit(1)
    )
    last_task = result.scalar()
    position = (last_task.position + 1.0) if last_task else 1.0

    db_task = TaskModel(
        title=task_in.title,
        column_id=task_in.column_id,
        parent_id=task_in.parent_id,
        position=position,
    )
    db.add(db_task)
    
    # --- НОВОЕ: Обновляем дату родителя при создании подзадачи ---
    if task_in.parent_id:
        parent_res = await db.execute(select(TaskModel).where(TaskModel.id == task_in.parent_id))
        parent_task = parent_res.scalar_one_or_none()
        if parent_task:
            parent_task.updated_at = datetime.utcnow()
    # -----------------------------------------------------------

    await db.commit()
    await db.refresh(db_task)

    # Получаем данные колонки, чтобы проверить её режим
    result = await db.execute(select(ColumnModel).where(ColumnModel.id == task_in.column_id))
    column = result.scalar_one()

    # 1. Если создаем в режиме таймера — запускаем таймер
    if column.mode == ColumnMode.TRACK_TIME:
        new_session = TimerSessionModel(
            task_id=db_task.id,
            start_time=datetime.utcnow(),
            is_active=True,
        )
        db.add(new_session)
        await db.commit()

    # 2. ИСПРАВЛЕНИЕ: Если создаем в режиме завершения — помечаем как выполненную
    if column.mode == ColumnMode.COMPLETION:
        db_task.completed_at = datetime.utcnow()
        await db.commit()

    await db.refresh(db_task, attribute_names=['timer_sessions'])
    _calculate_task_time(db_task)
    return db_task

async def update_task(db: AsyncSession, task_id: int, task_in: TaskUpdate) -> TaskModel:
    result = await db.execute(
        select(TaskModel)
        .options(selectinload(TaskModel.timer_sessions))
        .where(TaskModel.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise ValueError("Задача не найдена")

    update_data = task_in.dict(exclude_unset=True)
    
    # Загружаем колонку, чтобы знать ее режим
    col_res = await db.execute(select(ColumnModel).where(ColumnModel.id == task.column_id))
    col = col_res.scalar_one()

    # ОПРЕДЕЛЯЕМ, является ли задача активной на доске 
    # (корневая задача ИЛИ подзадача с включенным глазиком)
    is_visible = update_data.get("is_visible_on_board", task.is_visible_on_board)
    is_active_on_board = task.parent_id is None or is_visible

    # ПРАВИЛО 1: Строгая синхронизация статуса завершенности с режимом колонки
    # Применяется ТОЛЬКО если карточка "на доске"
    if is_active_on_board:
        if col.mode == ColumnMode.COMPLETION:
            # Блокируем попытку снять галочку
            if "completed_at" in update_data and update_data["completed_at"] is None:
                update_data.pop("completed_at")
            # Ставим галочку, если её нет
            if task.completed_at is None and "completed_at" not in update_data:
                update_data["completed_at"] = datetime.utcnow()
        else:
            # Если колонка обычная (Не результирующая)
            # Блокируем попытку поставить галочку (защита API)
            if "completed_at" in update_data and update_data["completed_at"] is not None:
                update_data.pop("completed_at")
            # СНИМАЕМ галочку, если она стояла (например, юзер поставил её, пока глазик был выключен)
            if task.completed_at is not None and "completed_at" not in update_data:
                update_data["completed_at"] = None

    for field, value in update_data.items():
        setattr(task, field, value)

    await db.commit()
    await db.refresh(task)
    _calculate_task_time(task)
    
    return task

async def _get_all_child_ids(db: AsyncSession, task_id: int) -> list[int]:
    """Рекурсивно собирает ID всех дочерних задач любой вложенности."""
    ids = [task_id]
    res = await db.execute(select(TaskModel.id).where(TaskModel.parent_id == task_id))
    child_ids = res.scalars().all()
    for cid in child_ids:
        ids.extend(await _get_all_child_ids(db, cid))
    return ids

async def delete_task(db: AsyncSession, task_id: int) -> list[int]:
    result = await db.execute(select(TaskModel).where(TaskModel.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise ValueError("Задача не найдена")

    parent_id = task.parent_id

    # Собираем все ID (самой задачи и всех её потомков) ДО удаления
    deleted_ids = await _get_all_child_ids(db, task_id)

    # Каскад в БД автоматически уничтожит все подзадачи
    await db.delete(task)
    
    # Обновляем дату родителя при удалении подзадачи
    if parent_id:
        parent_res = await db.execute(select(TaskModel).where(TaskModel.id == parent_id))
        parent_task = parent_res.scalar_one_or_none()
        if parent_task:
            parent_task.updated_at = datetime.utcnow()

    await db.commit()
    
    # 🧹 Вызываем сборщик мусора. Он автоматически удалит с диска все файлы,
    # которые были привязаны к удаленной карточке и ВСЕМ её подзадачам,
    # так как их описания были уничтожены в БД.
    await cleanup_orphaned_attachments(db)
    
    return deleted_ids

async def move_task(db: AsyncSession, task_id: int, target_column_id: int) -> TaskModel:
    result = await db.execute(
        select(TaskModel)
        .options(
            selectinload(TaskModel.column),
            selectinload(TaskModel.timer_sessions)
        )
        .where(TaskModel.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise ValueError("Задача не найдена")

    source_column = task.column
    if source_column.id == target_column_id:
        _calculate_task_time(task)
        return task

    result = await db.execute(select(ColumnModel).where(ColumnModel.id == target_column_id))
    target_column = result.scalar_one_or_none()
    if not target_column:
        raise ValueError("Целевая колонка не найдена")

    task.column_id = target_column_id

    # 1. Обработка родителя: Уходим из режима таймера - СТАВИМ НА ПАУЗУ
    if source_column.mode == ColumnMode.TRACK_TIME:
        for session in task.timer_sessions:
            if session.is_active:
                session.is_active = False
                session.end_time = datetime.utcnow()

    # 2. Обработка родителя: Завершение задачи
    if target_column.mode == ColumnMode.COMPLETION:
        if task.completed_at is None:
            task.completed_at = datetime.utcnow()
    else:
        task.completed_at = None

    # 3. Обработка родителя: Заходим в колонку таймера - создаем НОВУЮ СЕССИЮ
    if target_column.mode == ColumnMode.TRACK_TIME:
        new_session = TimerSessionModel(
            task_id=task.id,
            start_time=datetime.utcnow(),
            is_active=True,
        )
        db.add(new_session)
        task.timer_sessions.append(new_session)

    # 4. РЕКУРСИЯ: Обновляем колонку и таймеры у подзадач (если они не на доске)
    async def update_children_column(parent_id, new_col_id, target_mode, source_mode):
        res = await db.execute(
            select(TaskModel)
            .options(selectinload(TaskModel.timer_sessions))
            .where(TaskModel.parent_id == parent_id)
        )
        subs = res.scalars().all()
        for s in subs:
            # 🔥 ВАЖНО: Если подзадача вынесена на доску (глазик), она живет своей жизнью. 
            # Не перетаскиваем её вслед за родителем!
            if s.is_visible_on_board:
                continue
                
            s.column_id = new_col_id
            
            # Таймеры для подзадач
            if source_mode == ColumnMode.TRACK_TIME:
                for session in s.timer_sessions:
                    if session.is_active:
                        session.is_active = False
                        session.end_time = datetime.utcnow()
                        
            # ❌ БЛОК АВТОЗАВЕРШЕНИЯ УДАЛЕН. ПОДЗАДАЧИ СОХРАНЯЮТ СВОЙ СТАТУС.
                
            # Таймеры (новые сессии) для подзадач
            if target_mode == ColumnMode.TRACK_TIME:
                new_session = TimerSessionModel(
                    task_id=s.id,
                    start_time=datetime.utcnow(),
                    is_active=True,
                )
                db.add(new_session)
                s.timer_sessions.append(new_session)

            await update_children_column(s.id, new_col_id, target_mode, source_mode)

    # Запускаем рекурсию
    await update_children_column(task.id, target_column_id, target_column.mode, source_column.mode)

    await db.commit()
    await db.refresh(task)
    
    _calculate_task_time(task)
    return task

async def reorder_tasks(db: AsyncSession, ordered_ids: list[int]) -> None:
    result = await db.execute(select(TaskModel).where(TaskModel.id.in_(ordered_ids)))
    tasks = result.scalars().all()
    
    task_map = {task.id: task for task in tasks}
    
    for index, task_id in enumerate(ordered_ids):
        if task_id in task_map:
            task_map[task_id].position = float(index)
            
    await db.commit()

async def clear_task_timer(db: AsyncSession, task_id: int) -> TaskModel:
    result = await db.execute(
        select(TaskModel)
        .options(
            selectinload(TaskModel.column),
            selectinload(TaskModel.timer_sessions)
        )
        .where(TaskModel.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise ValueError("Задача не найдена")

    # Удаляем все сессии таймера для этой задачи
    for session in task.timer_sessions:
        await db.delete(session)
    
    # Очищаем локальный массив
    task.timer_sessions = []

    # Если задача прямо сейчас находится в колонке "Учёт времени", начинаем таймер с нуля
    if task.column.mode == ColumnMode.TRACK_TIME:
        new_session = TimerSessionModel(
            task_id=task.id,
            start_time=datetime.utcnow(),
            is_active=True,
        )
        db.add(new_session)
        task.timer_sessions.append(new_session)

    await db.commit()
    await db.refresh(task)
    
    _calculate_task_time(task)
    return task

async def get_task_with_details(db: AsyncSession, task_id: int) -> TaskModel:
    result = await db.execute(
        select(TaskModel)
        .options(
            # Загружаем задачу, её подзадачи и их таймеры (1 уровень вложенности)
            selectinload(TaskModel.subtasks).selectinload(TaskModel.timer_sessions),
            selectinload(TaskModel.timer_sessions),
            selectinload(TaskModel.column)
        )
        .where(TaskModel.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise ValueError("Задача не найдена")
    
    _calculate_task_time(task)
    
    # Чтобы Pydantic не упал при попытке прочитать subtasks у подзадач,
    # мы принудительно прописываем им пустой список, минуя механизмы lazy-load.
    for sub in task.subtasks:
        _calculate_task_time(sub)
        # set_committed_value — это "безопасная" запись данных в объект ORM
        set_committed_value(sub, 'subtasks', [])
        
    return task

async def export_task_to_markdown(db: AsyncSession, task_id: int, export_base_path: str) -> dict:
    """
    Экспортирует карточку и её вложения в формат Obsidian.
    Создает папку с названием карточки, внутри Markdown-файл и папку attachments.
    Включает подзадачи в виде чек-листа.
    """
    result = await db.execute(
        select(TaskModel)
        .options(selectinload(TaskModel.subtasks))
        .where(TaskModel.id == task_id)
    )
    task = result.scalar_one_or_none()
    
    if not task:
        raise ValueError("Задача не найдена")

    # 1. Очищаем название для использования как имя папки и файла (кроссплатформенно)
    safe_title = re.sub(r'[\\/*?:"<>|]', "", task.title).strip()
    if not safe_title:
        safe_title = f"Card_{task.id}"

    # 2. Формируем пути
    export_dir = Path(export_base_path) / safe_title
    export_dir.mkdir(parents=True, exist_ok=True)
    
    md_file_path = export_dir / f"{safe_title}.md"
    attachments_export_dir = export_dir / "attachments"

    # 3. Подготавливаем содержимое Markdown (в стиле Obsidian)
    md_content = f"# {task.title}\n\n"
    
    if task.description:
        md_content += task.description + "\n\n"

    # Добавляем подзадачи как Markdown чек-лист
    if task.subtasks:
        md_content += "## Чек-лист\n"
        sorted_subs = sorted(task.subtasks, key=lambda s: s.position)
        for sub in sorted_subs:
            checked = "x" if sub.completed_at else " "
            md_content += f"- [{checked}] {sub.title}\n"
        md_content += "\n"

    # 4. Ищем вложения в описании, чтобы их скопировать
    if task.description:
        vault_path = Path(get_active_vault())
        pattern = re.compile(r'\]\((attachments/[^\)]+)\)')
        matches = pattern.findall(task.description)
        
        if matches:
            attachments_export_dir.mkdir(exist_ok=True)
            for match in matches:
                decoded_path = unquote(match) # e.g. "attachments/file.png"
                src_file = vault_path / decoded_path
                
                if src_file.exists() and src_file.is_file():
                    dst_file = export_dir / decoded_path
                    try:
                        shutil.copy2(src_file, dst_file)
                    except Exception as e:
                        print(f"[Export] Failed to copy {src_file.name}: {e}")

    # 5. Записываем Markdown файл
    with open(md_file_path, "w", encoding="utf-8") as f:
        f.write(md_content)

    return {"success": True, "path": str(export_dir)}

async def set_task_time(db: AsyncSession, task_id: int, total_seconds: int) -> TaskModel:
    result = await db.execute(
        select(TaskModel)
        .options(
            selectinload(TaskModel.timer_sessions),
            selectinload(TaskModel.column)
        )
        .where(TaskModel.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise ValueError("Задача не найдена")

    # Проверяем, запущен ли таймер прямо сейчас
    was_active = any(s.is_active for s in task.timer_sessions)

    # Удаляем ВСЕ предыдущие сессии времени (сбрасываем историю, задаем новый старт)
    for session in task.timer_sessions:
        await db.delete(session)
    task.timer_sessions = []

    now = datetime.utcnow()

    MAX_SECONDS = 31536000000  # 1000 лет в секундах

    # Если введенное значение превышает 1000 лет, фиксируем его и ПРИНУДИТЕЛЬНО ставим на паузу
    if total_seconds >= MAX_SECONDS:
        total_seconds = MAX_SECONDS
        was_active = False

    if total_seconds > 0:
        # Чанки больше не нужны, так как 1000 лет безопасно помещается в SQLite
        baseline_session = TimerSessionModel(
            task_id=task.id,
            start_time=now - timedelta(seconds=total_seconds),
            end_time=now,
            is_active=False
        )
        db.add(baseline_session)
        task.timer_sessions.append(baseline_session)

    # Если таймер тикал до редактирования и мы не перешли лимит — запускаем его заново
    if was_active:
        new_active = TimerSessionModel(
            task_id=task.id,
            start_time=now,
            is_active=True
        )
        db.add(new_active)
        task.timer_sessions.append(new_active)

    await db.commit()
    await db.refresh(task)
    
    _calculate_task_time(task)
    return task
