"""
Модели SQLAlchemy для таблиц базы данных.
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, Boolean, Enum
from sqlalchemy.orm import relationship, declarative_base
import enum

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, Boolean, Enum, JSON

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
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    workspace = relationship("WorkspaceModel", back_populates="columns")
    tasks = relationship("TaskModel", back_populates="column", cascade="all, delete-orphan", order_by="TaskModel.position")

class TaskModel(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    attachments_order = Column(JSON, default=list)
    column_id = Column(Integer, ForeignKey("columns.id"), nullable=False)
    parent_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    position = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    is_visible_on_board = Column(Boolean, default=False)

    column = relationship("ColumnModel", back_populates="tasks")
    parent = relationship("TaskModel", remote_side=[id], back_populates="subtasks")
    subtasks = relationship("TaskModel", back_populates="parent", cascade="all, delete-orphan")
    timer_sessions = relationship("TimerSessionModel", back_populates="task", cascade="all, delete-orphan")


class TimerSessionModel(Base):
    __tablename__ = "timer_sessions"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)

    task = relationship("TaskModel", back_populates="timer_sessions")

