"""
Бизнес-логика автоматизаций + фоновый планировщик.

Поддерживаемые типы:
  - recurring_card: создание карточек по расписанию
  - sort_column:    сортировка карточек в колонке при добавлении/создании
  - clear_column:   удаление старых карточек из колонки по расписанию
"""
import threading
from datetime import datetime, timedelta, time
from typing import Optional, List

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy import select, update, delete as sql_delete, func

from src.db.models import AutomationModel, TaskModel
from src.schemas.automation import AutomationCreate, AutomationUpdate

# ── Глобальный scheduler ──
_scheduler_thread: Optional[threading.Thread] = None
_scheduler_stop = threading.Event()


# ── CRUD ──

async def list_automations(db: AsyncSession) -> list[AutomationModel]:
    result = await db.execute(select(AutomationModel).order_by(AutomationModel.created_at))
    return result.scalars().all()


async def get_automation(db: AsyncSession, auto_id: int) -> Optional[AutomationModel]:
    result = await db.execute(select(AutomationModel).where(AutomationModel.id == auto_id))
    return result.scalar_one_or_none()


async def create_automation(db: AsyncSession, data: AutomationCreate) -> AutomationModel:
    cfg = data.config
    next_run = _compute_next_run_from_config(data.type, cfg)
    
    auto = AutomationModel(
        type=data.type,
        name=data.name,
        enabled=data.enabled,
        config=cfg,
        next_run_at=next_run,
    )
    db.add(auto)
    await db.commit()
    await db.refresh(auto)
    
    # ⚡ Применяем сразу при создании (если уместно)
    if auto.enabled and auto.type == 'sort_column':
        try:
            await _execute_sort_column(db, auto)
        except Exception as e:
            print(f"[Automation] Initial run failed: {e}")
            
    return auto


async def update_automation(db: AsyncSession, auto_id: int, data: AutomationUpdate) -> Optional[AutomationModel]:
    auto = await get_automation(db, auto_id)
    if not auto:
        return None

    update_dict = data.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        if key == 'config' and value is not None:
            # При изменении конфига пересчитываем next_run_at
            try:
                auto.next_run_at = _compute_next_run_from_config(
                    data.type or auto.type, value
                )
            except Exception:
                pass
        setattr(auto, key, value)

    auto.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(auto)
    
    # ⚡ Применяем сразу при обновлении (если уместно)
    if auto.enabled and auto.type == 'sort_column':
        try:
            await _execute_sort_column(db, auto)
        except Exception as e:
            print(f"[Automation] Update run failed: {e}")
            
    return auto


async def delete_automation(db: AsyncSession, auto_id: int) -> bool:
    auto = await get_automation(db, auto_id)
    if not auto:
        return False
    await db.delete(auto)
    await db.commit()
    return True


async def run_automation_now(db: AsyncSession, auto_id: int) -> Optional[int]:
    """Ручной запуск — выполняет автоматизацию и возвращает task_id (или число удалённых)."""
    auto = await get_automation(db, auto_id)
    if not auto:
        return None

    return await _execute_automation(db, auto)


# ── Публичный хук: вызывается при создании / перемещении задачи ──

async def trigger_sort_for_column(db: AsyncSession, column_id: int) -> None:
    """
    Вызывается извне (после create_task / move_task) для запуска
    событийных автоматизаций (sort_column и мгновенный clear_column).
    """
    result = await db.execute(
        select(AutomationModel).where(
            AutomationModel.enabled == True,
            AutomationModel.type.in_(['sort_column', 'clear_column']),
            func.json_extract(AutomationModel.config, '$.column_id') == column_id
        )
    )
    automations = result.scalars().all()
    for auto in automations:
        try:
            if auto.type == 'sort_column':
                await _execute_sort_column(db, auto)
            elif auto.type == 'clear_column' and auto.config.get('max_age_minutes') == 0:
                await _execute_clear_column(db, auto)
        except Exception as e:
            print(f"[Automation] Hook failed for '{auto.name}': {e}")


# ── Выполнение (диспетчер) ──

async def _execute_automation(db: AsyncSession, auto: AutomationModel) -> Optional[int]:
    """Диспетчер: выбирает нужный исполнитель по типу автоматизации."""
    if auto.type == 'recurring_card':
        return await _execute_recurring_card(db, auto)
    elif auto.type == 'sort_column':
        return await _execute_sort_column(db, auto)
    elif auto.type == 'clear_column':
        return await _execute_clear_column(db, auto)
    else:
        print(f"[Automation] Unknown type: {auto.type}")
        return None


# ── Исполнитель: recurring_card ──

async def _execute_recurring_card(db: AsyncSession, auto: AutomationModel) -> Optional[int]:
    """Создаёт карточку согласно конфигурации автоматизации."""
    from src.services.task_service import create_task
    from src.schemas.task import TaskCreate

    cfg = auto.config
    title = _expand_template(cfg.get('title_template', ''))
    desc = _expand_template(cfg.get('description_template', ''))
    column_id = cfg.get('column_id')

    if not column_id:
        return None

    from src.db.models import ColumnModel
    col_check = await db.execute(select(ColumnModel.id).where(ColumnModel.id == column_id))
    if not col_check.scalar_one_or_none():
        print(f"[Automation] Skipped creation for '{auto.name}': Column #{column_id} not found.")
        return None

    task_in = TaskCreate(title=title, column_id=column_id)
    
    # БЕЗОПАСНОСТЬ: Изолируем падение при попытке создать задачу в несуществующей/удаленной колонке
    try:
        task = await create_task(db, task_in)
        
        if desc.strip():
            try:
                await _update_task_description(db, task.id, desc)
            except Exception as e:
                print(f"[Automation] Failed to set description for task #{task.id}: {e}")
        task_id_result = task.id
    except Exception as e:
        print(f"[Automation] Skipped creation for '{auto.name}' (Target column missing or invalid): {e}")
        task_id_result = None

    # Продвигаем таймер планировщика вперед ДАЖЕ если произошла ошибка, чтобы избежать вечного цикла сбоев
    auto.last_run_at = datetime.utcnow()
    if 'schedule' in cfg:
        from src.schemas.automation import ScheduleConfig
        try:
            sched = ScheduleConfig(**cfg['schedule'])
            auto.next_run_at = _compute_next_run(sched, from_time=auto.last_run_at)
        except Exception:
            auto.next_run_at = None
    await db.commit()

    return task_id_result


# ── Исполнитель: sort_column ──

_SORT_FIELD_MAP = {
    'position': TaskModel.position,
    'title': TaskModel.title,
    'created_at': TaskModel.created_at,
    'priority': TaskModel.priority,
    'due_date': TaskModel.due_date,
}

async def _execute_sort_column(db: AsyncSession, auto: AutomationModel) -> Optional[int]:
    """Сортирует все карточки в указанной колонке. Пропускает если порядок уже верный."""
    cfg = auto.config
    column_id = cfg.get('column_id')
    if not column_id:
        return None

    sort_by = cfg.get('sort_by', 'position')
    sort_order = cfg.get('sort_order', 'asc')

    field = _SORT_FIELD_MAP.get(sort_by, TaskModel.position)
    
    # 1. Основное правило сортировки
    if sort_order == 'desc':
        if sort_by in ('priority', 'due_date'):
            primary_order = field.desc().nullslast()
        else:
            primary_order = field.desc()
    else:
        if sort_by in ('priority', 'due_date'):
            primary_order = field.asc().nullslast()
        else:
            primary_order = field.asc()

    # 2. Получаем задачи. ДОБАВЛЯЕМ ВТОРИЧНУЮ СОРТИРОВКУ ПО ПОЗИЦИИ.
    # Если приоритеты или дедлайны равны (или оба NULL), автоматизация сохранит 
    # тот порядок (position), который пользователь задал вручную через Drag & Drop.
    result = await db.execute(
        select(TaskModel)
        .where(
            TaskModel.column_id == column_id,
            ~TaskModel.parents.any()
        )
        .order_by(primary_order, TaskModel.position.asc())
    )
    tasks = result.scalars().all()

    # Проверяем: может, позиции уже совпадают с нужным порядком?
    needs_sort = False
    for i, task in enumerate(tasks):
        expected_pos = float(i)
        if task.position is None or abs(task.position - expected_pos) > 0.001:
            needs_sort = True
            break

    if not needs_sort:
        auto.last_run_at = datetime.utcnow()
        await db.commit()
        return 0  # уже отсортировано, ничего не делали

    # Переназначаем позиции: 0.0, 1.0, 2.0 ...
    for i, task in enumerate(tasks):
        task.position = float(i)
        task.updated_at = datetime.utcnow()

    auto.last_run_at = datetime.utcnow()
    await db.commit()
    
    if tasks:
        print(f"[Automation] Sorted {len(tasks)} tasks in column #{column_id} by {sort_by} ({sort_order})")
    
    return len(tasks)


# ── Исполнитель: clear_column ──

async def _execute_clear_column(db: AsyncSession, auto: AutomationModel) -> Optional[int]:
    """Удаляет карточки из колонки, которые старше max_age_minutes."""
    cfg = auto.config
    column_id = cfg.get('column_id')
    if not column_id:
        return None

    max_age_minutes = cfg.get('max_age_minutes', 1440)  # default 24h
    cutoff = datetime.utcnow() - timedelta(minutes=max_age_minutes)

    # Находим старые задачи
    result = await db.execute(
        select(TaskModel.id).where(
            TaskModel.column_id == column_id,
            TaskModel.created_at <= cutoff,
            ~TaskModel.parents.any()
        )
    )
    old_ids = [row[0] for row in result.all()]

    if not old_ids:
        auto.last_run_at = datetime.utcnow()
        if 'schedule' in cfg:
            auto.next_run_at = _compute_next_run_from_config(auto.type, cfg, from_time=auto.last_run_at)
        await db.commit()
        return 0

    # Удаляем через сервис (чтобы сработали каскады, напоминания и т.д.)
    from src.services.task_service import delete_task
    deleted_count = 0
    failed_count = 0
    for tid in old_ids:
        try:
            await delete_task(db, tid)
            deleted_count += 1
        except Exception as e:
            failed_count += 1
            print(f"[Automation] Failed to delete task #{tid} during clear: {e}")

    # Продвигаем таймер только если ВСЕ задачи были успешно удалены.
    # Если были ошибки — мы обновляем last_run_at, но НЕ пересчитываем next_run_at, 
    # чтобы планировщик повторил попытку на следующем тике (через 30 секунд).
    auto.last_run_at = datetime.utcnow()
    if failed_count == 0 and 'schedule' in cfg:
        auto.next_run_at = _compute_next_run_from_config(auto.type, cfg, from_time=auto.last_run_at)
    elif failed_count > 0:
        print(f"[Automation] Clear column suspended. {failed_count} tasks failed. Will retry.")
        
    await db.commit()

    if deleted_count > 0:
        print(f"[Automation] Cleared {deleted_count} old tasks from column #{column_id} (>{max_age_minutes} min)")

    return deleted_count


# ── Вспомогательные ──

async def _update_task_description(db: AsyncSession, task_id: int, description: str):
    from src.db.models import TaskModel
    await db.execute(
        update(TaskModel).where(TaskModel.id == task_id).values(description=description, updated_at=datetime.utcnow())
    )
    await db.commit()


def _compute_next_run_from_config(auto_type: str, cfg: dict, from_time: datetime = None) -> Optional[datetime]:
    """Вычисляет next_run_at в зависимости от типа автоматизации."""
    if auto_type == 'sort_column':
        # sort_column срабатывает по событиям, не по расписанию
        return None
    if auto_type == 'clear_column' and cfg.get('max_age_minutes') == 0:
        # Мгновенная очистка тоже срабатывает только по событиям
        return None
    if 'schedule' in cfg:
        from src.schemas.automation import ScheduleConfig
        try:
            sched = ScheduleConfig(**cfg['schedule'])
            return _compute_next_run(sched, from_time=from_time)
        except Exception:
            return None
    return None


# ── Шаблоны ──

_WEEKDAY_NAMES = {
    'ru': ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'],
    'en': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
}

_MONTH_NAMES = {
    'ru': ['', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
           'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
    'en': ['', 'January', 'February', 'March', 'April', 'May', 'June',
           'July', 'August', 'September', 'October', 'November', 'December'],
}


def _get_template_lang() -> str:
    """Возвращает язык UI для шаблонов: 'ru' или 'en'."""
    try:
        from src.core.config import get_ui_settings
        return get_ui_settings().get('language', 'ru')
    except Exception:
        return 'ru'


def _expand_template(template: str, dt: Optional[datetime] = None) -> str:
    """Подставляет переменные {date}, {time}, {weekday}, и т.д."""
    from datetime import timezone
    if dt is None:
        dt = datetime.utcnow()
        
    # КОНВЕРТАЦИЯ: Переводим время базы (UTC) в локальное время пользователя для красивых заголовков
    local_tz = datetime.now().astimezone().tzinfo
    dt_local = dt.replace(tzinfo=timezone.utc).astimezone(local_tz)

    lang = _get_template_lang()

    result = template
    result = result.replace('{date}', dt_local.strftime('%d.%m.%Y'))
    result = result.replace('{time}', dt_local.strftime('%H:%M'))
    result = result.replace('{weekday}', _weekday_name(dt_local.weekday(), lang))
    result = result.replace('{week_number}', str(dt_local.isocalendar()[1]))
    result = result.replace('{month_name}', _month_name(dt_local.month, lang))

    # {date:format} — кастомный формат (поддерживает и strftime-коды %d.%m.%Y, и упрощённые dd.MM.yyyy)
    import re
    for m in re.finditer(r'\{date:([^}]+)\}', result):
        fmt = m.group(1)
        # Конвертируем упрощённый формат в strftime-коды
        fmt = fmt.replace('dd', '%d').replace('MM', '%m').replace('yyyy', '%Y')
        fmt = fmt.replace('yy', '%y').replace('HH', '%H').replace('mm', '%M').replace('ss', '%S')
        result = result.replace(m.group(0), dt_local.strftime(fmt))

    return result


def _weekday_name(wd: int, lang: str = 'ru') -> str:
    names = _WEEKDAY_NAMES.get(lang, _WEEKDAY_NAMES['ru'])
    return names[wd % 7]


def _month_name(m: int, lang: str = 'ru') -> str:
    names = _MONTH_NAMES.get(lang, _MONTH_NAMES['ru'])
    return names[m] if 1 <= m <= 12 else ''


# ── Планировщик ──

def _compute_next_run(schedule, from_time: Optional[datetime] = None) -> Optional[datetime]:
    """Вычисляет следующий момент запуска по расписанию."""
    from datetime import timezone
    if from_time is None:
        from_time = datetime.utcnow()

    # КОНВЕРТАЦИЯ: Все математические расчёты дней/часов производим строго в локальном времени
    local_tz = datetime.now().astimezone().tzinfo
    from_time_local = from_time.replace(tzinfo=timezone.utc).astimezone(local_tz)

    s_type = schedule.type
    try:
        h, mi = map(int, schedule.time.split(':'))
    except (ValueError, AttributeError):
        h, mi = 9, 0

    target_time = time(hour=h, minute=mi)
    next_run_local = None

    if s_type == 'hourly':
        next_run_local = from_time_local.replace(minute=mi, second=0, microsecond=0)
        if next_run_local <= from_time_local:
            next_run_local += timedelta(hours=1)

    elif s_type == 'daily':
        # ФИКС: Явно делаем скомбинированную дату aware, добавляя локальный часовой пояс
        next_run_local = datetime.combine(from_time_local.date(), target_time).replace(tzinfo=local_tz)
        if next_run_local <= from_time_local:
            next_run_local += timedelta(days=1)
    elif s_type == 'weekdays':
        # ФИКС: Задаем локальный часовой пояс
        next_run_local = datetime.combine(from_time_local.date(), target_time).replace(tzinfo=local_tz)
        if next_run_local <= from_time_local:
            next_run_local += timedelta(days=1)
        while next_run_local.weekday() >= 5:
            next_run_local += timedelta(days=1)
    elif s_type == 'weekly':
        days = sorted(schedule.days or [0])
        if not days:
            days = [0]
        # ФИКС: Задаем локальный часовой пояс
        next_run_local = datetime.combine(from_time_local.date(), target_time).replace(tzinfo=local_tz)
        if next_run_local <= from_time_local:
            next_run_local += timedelta(days=1)
        for _ in range(8):
            if next_run_local.weekday() in days:
                break
            next_run_local += timedelta(days=1)
    elif s_type == 'monthly':
        dom = schedule.day_of_month or 1
        dom = min(max(dom, 1), 28)
        y, mo = from_time_local.year, from_time_local.month
        # ФИКС: Задаем локальный часовой пояс
        next_run_local = datetime(y, mo, dom, h, mi).replace(tzinfo=local_tz)
        while next_run_local <= from_time_local:
            mo += 1
            if mo > 12:
                mo = 1
                y += 1
            try:
                # ФИКС: Задаем локальный часовой пояс
                next_run_local = datetime(y, mo, dom, h, mi).replace(tzinfo=local_tz)
            except ValueError:
                import calendar
                last_day = calendar.monthrange(y, mo)[1]
                dom_clamped = min(dom, last_day)
                # ФИКС: Задаем локальный часовой пояс
                next_run_local = datetime(y, mo, dom_clamped, h, mi).replace(tzinfo=local_tz)

    if next_run_local:
        # ВОЗВРАТ К БАЗЕ: Переводим рассчитанное локальное время обратно в наивный UTC для базы
        return next_run_local.replace(tzinfo=local_tz).astimezone(timezone.utc).replace(tzinfo=None)
    
    return None


def _scheduler_loop():
    """Фоновый цикл планировщика."""
    import asyncio
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    while not _scheduler_stop.is_set():
        try:
            loop.run_until_complete(_scheduler_tick())
        except Exception as e:
            print(f"[Automation] Scheduler tick error: {e}")
        _scheduler_stop.wait(30)  # Проверяем каждые 30 секунд

    loop.close()


async def _scheduler_tick():
    """Одна итерация: проверяем все enabled-автоматизации кроме sort_column."""
    from src.db.database import get_session_factory
    try:
        factory = get_session_factory()
    except RuntimeError:
        return  # БД ещё не инициализирована

    now = datetime.utcnow()
    async with factory() as db:
        result = await db.execute(
            select(AutomationModel).where(
                AutomationModel.enabled == True,
                AutomationModel.next_run_at != None,
                AutomationModel.next_run_at <= now,
            )
        )
        due = result.scalars().all()

        for auto in due:
            try:
                await _execute_automation(db, auto)
                print(f"[Automation] Executed '{auto.name}' (id={auto.id})")
            except Exception as e:
                print(f"[Automation] Failed to execute '{auto.name}' (id={auto.id}): {e}")


def start_scheduler(session_factory: async_sessionmaker):
    """Запускает фоновый поток-демон планировщика."""
    global _scheduler_thread, _scheduler_stop

    if _scheduler_thread is not None and _scheduler_thread.is_alive():
        return  # Уже запущен

    _scheduler_stop.clear()
    _scheduler_thread = threading.Thread(target=_scheduler_loop, daemon=True, name="automation-scheduler")
    _scheduler_thread.start()
    print("[Automation] Scheduler started")


def stop_scheduler():
    """Останавливает планировщик."""
    global _scheduler_stop, _scheduler_thread
    _scheduler_stop.set()
    if _scheduler_thread and _scheduler_thread.is_alive():
        _scheduler_thread.join(timeout=2)
    print("[Automation] Scheduler stopped")
