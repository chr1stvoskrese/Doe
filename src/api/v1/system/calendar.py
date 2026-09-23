from fastapi import APIRouter, Depends
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.database import get_session
from src.db.models import TaskModel, ColumnModel

router = APIRouter(tags=["calendar"])


@router.get("/calendar")
async def get_calendar_events(db: AsyncSession = Depends(get_session)):
    """Возвращает все задачи с сессиями учета времени для календаря."""
    from src.db.models import TaskModel, ColumnModel
    from sqlalchemy import or_
    from datetime import datetime
    
    stmt = select(TaskModel).options(
        selectinload(TaskModel.timer_sessions),
        selectinload(TaskModel.column)
    ).where(
        TaskModel.timer_sessions.any()
    )
    
    res = await db.execute(stmt)
    tasks = res.scalars().unique().all()
    
    events = []
    now = datetime.utcnow()

    for t in tasks:
        # 1. Добавляем блоки таймера (Toggl Track style)
        for s in t.timer_sessions:
            start_time = s.start_time
            end_time = s.end_time if s.end_time else now
            duration = int((end_time - start_time).total_seconds())
            
            events.append({
                "event_id": f"session_{s.id}",
                "id": t.id,
                "title": t.title,
                "due_date": start_time.isoformat() + 'Z',
                "completed": t.completed_at is not None,
                "column_id": t.column_id,
                "workspace_id": t.column.workspace_id if t.column else None,
                "duration": duration,
                "is_active": s.is_active
            })
            
    return events
