"""
Бизнес-логика для работы с задачами.
"""

import re
import os
import shutil
from pathlib import Path
from urllib.parse import unquote
from src.core.config import get_active_vault, get_attachments_dir, get_ui_settings

from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import set_committed_value

from src.db.models import TaskModel, ColumnModel, TimerSessionModel, ColumnMode
from src.schemas.task import TaskCreate, TaskUpdate, TimerSessionResponse


async def cleanup_orphaned_attachments(db: AsyncSession):
    """
    Сканирует все задачи. Находит все ссылки на вложения. 
    Удаляет файлы из папки attachments, на которые больше нет ссылок.
    """
    # 🔥 SENIOR FIX: ЗАЩИТА ОТ УДАЛЕНИЯ ФАЙЛОВ ДРУГИХ ХРАНИЛИЩ
    # Если юзер использует общую глобальную папку для всех хранилищ, 
    # мы НЕ МОЖЕМ безопасно чистить мусор, так как текущая БД ничего не знает 
    # о файлах, привязанных к другим БД.
    settings = get_ui_settings()
    if settings.get("global_attachments_path"):
        print("[Garbage Collector] Skipped: Global attachments path is active. Safety lock engaged.")
        return

    result = await db.execute(select(TaskModel.description).where(TaskModel.description.isnot(None)))
    descriptions = result.scalars().all()
    
    used_files = set()
    # Регулярка захватывает все пути "doe/имяфайла.ext" из Markdown ссылок
    pattern = re.compile(r'\]\((doe/[^\)]+)\)')
    
    for desc in descriptions:
        matches = pattern.findall(desc)
        for match in matches:
            used_files.add(unquote(match))
        
    att_dir = get_attachments_dir()
    
    if not att_dir.exists():
        return
        
    for file_path in att_dir.iterdir():
        if file_path.is_file():
            rel_path = f"doe/{file_path.name}"
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
    if task_in.position is not None:
        position = task_in.position
    else:
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
        position=position,
    )
    
    if task_in.parent_ids:
        parents_res = await db.execute(select(TaskModel).where(TaskModel.id.in_(task_in.parent_ids)))
        db_task.parents = parents_res.scalars().all()
        for p in db_task.parents:
            p.updated_at = datetime.utcnow()

    db.add(db_task)
    await db.commit()
    await db.refresh(db_task)

    result = await db.execute(select(ColumnModel).where(ColumnModel.id == task_in.column_id))
    column = result.scalar_one()

    if column.mode == ColumnMode.TRACK_TIME:
        new_session = TimerSessionModel(
            task_id=db_task.id,
            start_time=datetime.utcnow(),
            is_active=True,
        )
        db.add(new_session)
        await db.commit()

    if column.mode == ColumnMode.COMPLETION:
        db_task.completed_at = datetime.utcnow()
        await db.commit()

    await db.refresh(db_task, attribute_names=['timer_sessions', 'parents'])
    _calculate_task_time(db_task)

    # 🔁 Автоматизация: сортировка колонки после создания карточки
    try:
        from src.services.automation_service import trigger_sort_for_column
        await trigger_sort_for_column(db, task_in.column_id)
    except Exception as e:
        print(f"[Automation] Hook error in create_task: {e}")

    return db_task

async def get_task_context(db: AsyncSession, task_id: int) -> dict:
    query = (
        select(TaskModel.id, TaskModel.column_id, ColumnModel.workspace_id)
        .join(ColumnModel, TaskModel.column_id == ColumnModel.id)
        .where(TaskModel.id == task_id)
    )
    res = await db.execute(query)
    row = res.first()
    if not row:
        raise ValueError("Task not found")
    return {"task_id": row[0], "column_id": row[1], "workspace_id": row[2]}

async def update_task(db: AsyncSession, task_id: int, task_in: TaskUpdate) -> TaskModel:
    result = await db.execute(
        select(TaskModel)
        .options(selectinload(TaskModel.timer_sessions), selectinload(TaskModel.parents))
        .where(TaskModel.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise ValueError("Задача не найдена")

    update_data = task_in.dict(exclude_unset=True)

    # ОБНОВЛЕНИЕ ГРАФОВЫХ СВЯЗЕЙ С ПРОВЕРКОЙ НА ЦИКЛЫ
    if "parent_ids" in update_data:
        new_parent_ids = update_data.pop("parent_ids")
        if new_parent_ids is not None:
            if task_id in new_parent_ids:
                raise ValueError("Задача не может быть подзадачей самой себя")
            
            child_ids = await _get_all_child_ids(db, task_id)
            for pid in new_parent_ids:
                if pid in child_ids:
                    raise ValueError("Обнаружена циклическая зависимость")
                    
            parents_res = await db.execute(select(TaskModel).where(TaskModel.id.in_(new_parent_ids)))
            task.parents = parents_res.scalars().all()
            for p in task.parents:
                p.updated_at = datetime.utcnow()

    # 🚀 Срезаем таймзону, чтобы SQLite не падал с 500 ошибкой
    if "due_date" in update_data and update_data["due_date"] is not None:
        update_data["due_date"] = update_data["due_date"].replace(tzinfo=None)

    col_res = await db.execute(select(ColumnModel).where(ColumnModel.id == task.column_id))
    col = col_res.scalar_one()

    is_visible = update_data.get("is_visible_on_board", task.is_visible_on_board)
    is_active_on_board = not task.parents or is_visible

    if is_active_on_board:
        if col.mode == ColumnMode.COMPLETION:
            if "completed_at" in update_data and update_data["completed_at"] is None:
                update_data.pop("completed_at")
            if task.completed_at is None and "completed_at" not in update_data:
                update_data["completed_at"] = datetime.utcnow()
        else:
            if "completed_at" in update_data and update_data["completed_at"] is not None:
                update_data.pop("completed_at")
            if task.completed_at is not None and "completed_at" not in update_data:
                update_data["completed_at"] = None

    for field, value in update_data.items():
        setattr(task, field, value)

    await db.commit()
    await db.refresh(task)
    _calculate_task_time(task)

    # 🔁 Автоматизация: сортировка колонки при изменении карточки
    try:
        from src.services.automation_service import trigger_sort_for_column
        await trigger_sort_for_column(db, task.column_id)
    except Exception as e:
        print(f"[Automation] Hook error in update_task: {e}")

    return task

async def _get_all_child_ids(db: AsyncSession, task_id: int, visited: set = None) -> list[int]:
    """Безопасный DFS обход графа для поиска всех потомков."""
    if visited is None:
        visited = set()
    if task_id in visited:
        return []
    visited.add(task_id)
    
    res = await db.execute(
        select(TaskModel).options(selectinload(TaskModel.subtasks)).where(TaskModel.id == task_id)
    )
    task = res.scalar_one_or_none()
    if task:
        for sub in task.subtasks:
            await _get_all_child_ids(db, sub.id, visited)
            
    return list(visited)

async def get_task_paths(db: AsyncSession, task_id: int) -> list[list[dict]]:
    """Строит все пути от корней до данной задачи (для хлебных крошек)."""
    paths = []
    
    async def dfs(current_id, current_path):
        res = await db.execute(
            select(TaskModel).options(selectinload(TaskModel.parents)).where(TaskModel.id == current_id)
        )
        task = res.scalar_one_or_none()
        if not task:
            return
            
        node = {"id": task.id, "title": task.title}
        new_path = [node] + current_path
        
        if not task.parents:
            paths.append(new_path)
        else:
            for p in task.parents:
                # Защита от бесконечного цикла
                if p.id not in [n["id"] for n in current_path]:
                    await dfs(p.id, new_path)
                    
    await dfs(task_id, [])
    return paths

async def delete_task(db: AsyncSession, task_id: int) -> list[int]:
    result = await db.execute(
        select(TaskModel)
        .options(selectinload(TaskModel.parents))
        .where(TaskModel.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise ValueError("Задача не найдена")

    # Собираем все ID (самой задачи и всех её потомков) ДО удаления
    deleted_ids = await _get_all_child_ids(db, task_id)

    from src.core.config import remove_reminders_for_task, get_active_vault

    # Каскад в БД автоматически уничтожит все подзадачи
    await db.delete(task)
    
    # Обновляем даты всех родителей при удалении подзадачи
    for p in task.parents:
        p.updated_at = datetime.utcnow()

    await db.commit()
    
    # Убиваем системные напоминания для удаляемых задач
    for d_id in deleted_ids:
        remove_reminders_for_task(d_id)
    
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
            selectinload(TaskModel.timer_sessions),
            selectinload(TaskModel.parents)
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
            .where(TaskModel.parents.any(id=parent_id))
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

    # 🔁 Автоматизация: сортировка колонок после ручного переупорядочивания
    try:
        from src.services.automation_service import trigger_sort_for_column
        affected_columns = set(t.column_id for t in tasks)
        for col_id in affected_columns:
            await trigger_sort_for_column(db, col_id)
    except Exception as e:
        print(f"[Automation] Hook error in reorder_tasks: {e}")

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
            selectinload(TaskModel.subtasks).selectinload(TaskModel.timer_sessions),
            selectinload(TaskModel.subtasks).selectinload(TaskModel.parents), # <--- ЗАГРУЖАЕМ РОДИТЕЛЕЙ ПОДЗАДАЧ
            selectinload(TaskModel.timer_sessions),
            selectinload(TaskModel.column),
            selectinload(TaskModel.parents) # Нужно для Pydantic parent_ids
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

async def export_task_to_markdown(
    db: AsyncSession, 
    task_id: int, 
    export_base_path: str, 
    include_attachments: bool = True
) -> dict:
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
        exported_description = task.description.replace("(doe/", "(attachments/")
        md_content += exported_description + "\n\n"

    # Добавляем подзадачи как Markdown чек-лист
    if task.subtasks:
        md_content += "## Чек-лист\n"
        sorted_subs = sorted(task.subtasks, key=lambda s: s.position)
        for sub in sorted_subs:
            checked = "x" if sub.completed_at else " "
            md_content += f"- [{checked}] {sub.title}\n"
        md_content += "\n"

    # 4. Копирование вложений
    if task.description:
        att_dir = get_attachments_dir()
        pattern = re.compile(r'\]\((doe/[^\)]+)\)')
        matches = pattern.findall(task.description)
        
        if matches and include_attachments:
            attachments_export_dir.mkdir(exist_ok=True)
            for match in matches:
                decoded_path = unquote(match)
                filename = decoded_path.replace("doe/", "", 1)
                src_file = att_dir / filename
                
                if src_file.exists() and src_file.is_file():
                    dst_file = attachments_export_dir / filename
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

    MAX_SECONDS = 31536000000  # 1000 лет в секундах
    now = datetime.utcnow()

    if total_seconds >= MAX_SECONDS:
        total_seconds = MAX_SECONDS
        # Если превышен предел, принудительно останавливаем активные таймеры
        for s in task.timer_sessions:
            if s.is_active:
                s.is_active = False
                s.end_time = now

    # Считаем текущее время (как оно есть сейчас)
    current_total = 0
    for s in task.timer_sessions:
        end = s.end_time if s.end_time else now
        current_total += int((end - s.start_time).total_seconds())

    delta = total_seconds - current_total

    if delta == 0:
        pass # Ничего не меняем
    elif not task.timer_sessions:
        # Сессий еще не было вообще. Создаем прошедшую сессию.
        if total_seconds > 0:
            baseline_session = TimerSessionModel(
                task_id=task.id,
                start_time=now - timedelta(seconds=total_seconds),
                end_time=now,
                is_active=False
            )
            db.add(baseline_session)
            task.timer_sessions.append(baseline_session)
    elif delta > 0:
        # Увеличили время. Добавляем его к ПОСЛЕДНЕЙ сессии (сдвигаем старт назад)
        latest_session = max(task.timer_sessions, key=lambda s: s.start_time)
        latest_session.start_time -= timedelta(seconds=delta)
    else:
        # Уменьшили время. Отрезаем от последних сессий (от новых к старым)
        remaining_to_remove = abs(delta)
        sorted_sessions = sorted(task.timer_sessions, key=lambda s: s.start_time, reverse=True)
        
        for s in sorted_sessions:
            if remaining_to_remove <= 0:
                break
                
            end = s.end_time if s.end_time else now
            duration = int((end - s.start_time).total_seconds())
            
            if duration > remaining_to_remove:
                # Просто сдвигаем старт этой сессии вперед (укорачиваем)
                s.start_time += timedelta(seconds=remaining_to_remove)
                remaining_to_remove = 0
            else:
                # Нужно отнять больше, чем длилась сессия
                remaining_to_remove -= duration
                if s.is_active:
                    # Активную сессию нельзя удалять, иначе таймер на доске отвалится.
                    # Просто обнуляем её (начинается "сейчас")
                    s.start_time = now
                else:
                    # Полностью удаляем старую сессию (и она пропадет из календаря)
                    await db.delete(s)
                    task.timer_sessions.remove(s)

    await db.commit()
    await db.refresh(task)
    
    _calculate_task_time(task)
    return task
