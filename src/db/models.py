"""
Модели SQLAlchemy для таблиц базы данных.
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, Boolean, Enum
from sqlalchemy.orm import relationship, declarative_base
from sqlalchemy.orm.attributes import instance_state
import enum

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, Boolean, Enum, JSON
from sqlalchemy import Table # Добавить в импорты наверху файла, если нет

Base = declarative_base()


class ColumnMode(str, enum.Enum):
    DEFAULT = "default"
    TRACK_TIME = "track_time"
    COMPLETION = "completion"

class WorkspaceModel(Base):
    __tablename__ = "workspaces"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    position = Column(Float, default=0.0) # <--- ДОБАВЛЕНО ПОЛЕ
    created_at = Column(DateTime, default=datetime.utcnow)

    columns = relationship("ColumnModel", back_populates="workspace", cascade="all, delete-orphan", order_by="ColumnModel.position")

class ColumnModel(Base):
    __tablename__ = "columns"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    mode = Column(Enum(ColumnMode), default=ColumnMode.DEFAULT)
    position = Column(Float, default=0.0)
    collapsed = Column(Boolean, default=False)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False) # СВЯЗЬ С ВКЛАДКОЙ
    width = Column(Float, nullable=True)  # null = дефолтная ширина (320px)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    workspace = relationship("WorkspaceModel", back_populates="columns")
    tasks = relationship("TaskModel", back_populates="column", cascade="all, delete-orphan", order_by="TaskModel.position")

# Ассоциативная таблица для реализации графа (Many-to-Many)
task_relations = Table(
    'task_relations',
    Base.metadata,
    Column('parent_id', Integer, ForeignKey('tasks.id', ondelete="CASCADE"), primary_key=True),
    Column('child_id', Integer, ForeignKey('tasks.id', ondelete="CASCADE"), primary_key=True)
)

class TaskModel(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    attachments_order = Column(JSON, default=list)
    column_id = Column(Integer, ForeignKey("columns.id"), nullable=False)
    # parent_id удален
    position = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    due_date = Column(DateTime, nullable=True) # <--- СРОК ВЫПОЛНЕНИЯ
    priority = Column(Float, nullable=True) # <--- ПРИОРИТЕТНОСТЬ
    priority_data = Column(JSON, nullable=True) # <--- ДАННЫЕ ПОЛЗУНКОВ
    
    is_visible_on_board = Column(Boolean, default=False)
    folded_headings = Column(JSON, default=list)

    column = relationship("ColumnModel", back_populates="tasks")
    
    # Новые графовые связи
    parents = relationship(
        "TaskModel", 
        secondary=task_relations, 
        primaryjoin=id==task_relations.c.child_id, 
        secondaryjoin=id==task_relations.c.parent_id, 
        back_populates="subtasks"
    )
    subtasks = relationship(
        "TaskModel", 
        secondary=task_relations, 
        primaryjoin=id==task_relations.c.parent_id, 
        secondaryjoin=id==task_relations.c.child_id, 
        back_populates="parents"
    )
    
    timer_sessions = relationship("TimerSessionModel", back_populates="task", cascade="all, delete-orphan")

    @property
    def first_start(self):
        if 'timer_sessions' in instance_state(self).dict and self.timer_sessions:
            return min(s.start_time for s in self.timer_sessions)
        return None

    @property
    def last_end(self):
        if 'timer_sessions' in instance_state(self).dict and self.timer_sessions:
            ended = [s.end_time for s in self.timer_sessions if s.end_time]
            if ended:
                return max(ended)
        return None

    @property
    def parent_ids(self):
        # Безопасно отдаем список ID, только если связи parents были загружены из БД.
        # Это защищает от крашей (MissingGreenlet) при асинхронных запросах.
        if 'parents' in instance_state(self).dict:
            return [p.id for p in self.parents]
        return []


class TimerSessionModel(Base):
    __tablename__ = "timer_sessions"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)

    task = relationship("TaskModel", back_populates="timer_sessions")


class AutomationModel(Base):
    __tablename__ = "automations"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String, nullable=False)          # 'recurring_card'
    name = Column(String, nullable=False)           # Human-readable name
    enabled = Column(Boolean, default=True)
    config = Column(JSON, nullable=False)            # Type-specific params
    last_run_at = Column(DateTime, nullable=True)
    next_run_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

