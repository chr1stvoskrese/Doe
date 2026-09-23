from fastapi import APIRouter, Depends

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload

from src.db.database import get_session
from src.db.models import TaskModel
from src.core.config import get_ui_settings
from src.schemas.system import TopTask, StatDay, StatisticsResponse

router = APIRouter(tags=["stats"])


@router.get("/statistics", response_model=StatisticsResponse)
async def get_statistics(offset_weeks: int = 0, db: AsyncSession = Depends(get_session)):
    """Агрегация глубокой статистики с поддержкой путешествия в прошлое (сдвиг по неделям)."""
    from datetime import datetime, timedelta
    
    # 1. Определяем границы текущей запрашиваемой "недели" (строго с ПН по ВС)
    now = datetime.utcnow()
    # Находим понедельник текущей недели
    current_monday = now - timedelta(days=now.weekday())
    current_monday = current_monday.replace(hour=0, minute=0, second=0, microsecond=0)
    
    start_date = current_monday - timedelta(weeks=offset_weeks)
    end_date = start_date + timedelta(days=6, hours=23, minutes=59, seconds=59)
    
    # Границы ПРЕДЫДУЩЕЙ недели (для расчета трендов)
    prev_start_date = start_date - timedelta(days=7)
    prev_end_date = start_date - timedelta(seconds=1)
    
    # 2. ОПТИМИЗАЦИЯ: Достаем только задачи, которые имеют таймеры или завершены, 
    # чтобы не тянуть из БД 10 000 висяков.
    stmt = select(TaskModel).options(
        selectinload(TaskModel.timer_sessions),
        selectinload(TaskModel.parents) # Нужно для проверки is_board_card
    ).where(
        or_(
            TaskModel.completed_at.isnot(None),
            TaskModel.timer_sessions.any()
        )
    )
    res = await db.execute(stmt)
    tasks = res.scalars().unique().all()
    
    # --- Сбор данных за ТЕКУЩУЮ выборку ---
    cur_done = 0
    cur_time = 0
    top_tasks_dict = {}
    
    # Подготавливаем массив дней для графика (всегда 7 дней, начиная с понедельника)
    chart_data = {}
    for i in range(7):
        dt = start_date + timedelta(days=i)
        chart_data[dt.strftime("%Y-%m-%d")] = {"day_name": dt.weekday(), "tasks_done": 0, "time_spent": 0, "tasks": {}}

    # --- Сбор данных за ПРОШЛУЮ выборку (тренд) ---
    prev_done = 0
    prev_time = 0

    for t in tasks:
        # Карточка считается самостоятельной на доске, если у нее нет родителей ИЛИ она вынесена (включен глазик)
        is_board_card = not t.parents or t.is_visible_on_board

        # Завершенные (считаем только карточки, вынесенные на доску, чтобы подзадачи не ломали статистику)
        if t.completed_at and is_board_card:
            if start_date <= t.completed_at <= end_date:
                cur_done += 1
                date_key = t.completed_at.strftime("%Y-%m-%d")
                if date_key in chart_data:
                    chart_data[date_key]["tasks_done"] += 1
            elif prev_start_date <= t.completed_at <= prev_end_date:
                prev_done += 1

        # 🔥 НОВАЯ ЛОГИКА ВРЕМЕНИ: Размазываем длинные сессии по дням
        task_time_cur = 0
        for s in t.timer_sessions:
            st = s.start_time
            en = s.end_time or now
            
            # 1. Считаем пересечение с ТЕКУЩЕЙ неделей (cur_time)
            # Пересечение двух отрезков: [max(start1, start2), min(end1, end2)]
            overlap_cur_start = max(st, start_date)
            overlap_cur_end = min(en, end_date)
            
            if overlap_cur_end > overlap_cur_start:
                dur_cur = int((overlap_cur_end - overlap_cur_start).total_seconds())
                task_time_cur += dur_cur
                cur_time += dur_cur
                
                # Размазываем это время по конкретным дням графика
                # Идем по всем 7 дням недели и смотрим пересечение сессии с КАЖДЫМИ СУТКАМИ
                for i in range(7):
                    day_start = start_date + timedelta(days=i)
                    day_end = day_start + timedelta(days=1)
                    
                    overlap_day_start = max(st, day_start)
                    overlap_day_end = min(en, day_end)
                    
                    if overlap_day_end > overlap_day_start:
                        day_dur = int((overlap_day_end - overlap_day_start).total_seconds())
                        date_key = day_start.strftime("%Y-%m-%d")
                        
                        if date_key in chart_data:
                            chart_data[date_key]["time_spent"] += day_dur
                            if t.id not in chart_data[date_key]["tasks"]:
                                chart_data[date_key]["tasks"][t.id] = {"id": t.id, "title": t.title, "time_spent": 0}
                            chart_data[date_key]["tasks"][t.id]["time_spent"] += day_dur

            # 2. Считаем пересечение с ПРОШЛОЙ неделей (prev_time для тренда)
            overlap_prev_start = max(st, prev_start_date)
            overlap_prev_end = min(en, prev_end_date)
            
            if overlap_prev_end > overlap_prev_start:
                dur_prev = int((overlap_prev_end - overlap_prev_start).total_seconds())
                prev_time += dur_prev
                
        if task_time_cur > 0:
            top_tasks_dict[t.id] = {"id": t.id, "title": t.title, "time_spent": task_time_cur}

    # --- Подготовка ответов ---
    # Топ задачи
    sorted_top = sorted(top_tasks_dict.values(), key=lambda x: x["time_spent"], reverse=True)
    top_tasks = []
    for tt in sorted_top:
        pct = (tt["time_spent"] / cur_time * 100) if cur_time > 0 else 0
        top_tasks.append(TopTask(id=tt["id"], title=tt["title"], time_spent=tt["time_spent"], percentage=round(pct, 1)))

    # Тренды (защита от деления на ноль)
    trend_time_pct = ((cur_time - prev_time) / prev_time * 100) if prev_time > 0 else (100.0 if cur_time > 0 else 0.0)
    trend_done_pct = ((cur_done - prev_done) / prev_done * 100) if prev_done > 0 else (100.0 if cur_done > 0 else 0.0)

    # Ищем лучший день (по времени)
    best_day_idx = None
    max_day_time = -1
    for k, v in chart_data.items():
        if v["time_spent"] > max_day_time and v["time_spent"] > 0:
            max_day_time = v["time_spent"]
            best_day_idx = v["day_name"]

    # Красивый лейбл даты с учетом локали
    lang = get_ui_settings().get("language", "ru")
    if lang == "ru":
        months = ["", "июня", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"]
        # Фикс: "января" вместо опечатки
        months[1] = "января" 
        label = f"{start_date.day} {months[start_date.month]} – {end_date.day} {months[end_date.month]}"
    else:
        months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        label = f"{months[start_date.month]} {start_date.day} – {months[end_date.month]} {end_date.day}"

    chart_array = []
    for k, v in chart_data.items():
        day_tasks = []
        for tk, tv in v["tasks"].items():
            pct = (tv["time_spent"] / v["time_spent"] * 100) if v["time_spent"] > 0 else 0
            day_tasks.append(TopTask(id=tv["id"], title=tv["title"], time_spent=tv["time_spent"], percentage=round(pct, 1)))
        
        # Сортируем задачи дня по убыванию времени
        day_tasks = sorted(day_tasks, key=lambda x: x.time_spent, reverse=True)
        chart_array.append(StatDay(date=k, day_name=v["day_name"], tasks_done=v["tasks_done"], time_spent=v["time_spent"], tasks=day_tasks))

    return StatisticsResponse(
        date_range_label=label,
        total_done=cur_done,
        total_time=cur_time,
        trend_done_pct=round(trend_done_pct, 1), # Теперь показывает реальную динамику по задачам
        trend_time_pct=round(trend_time_pct, 1),
        best_day=best_day_idx,
        chart_data=chart_array,
        top_tasks=top_tasks
    )
