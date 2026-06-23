"""add fts5 search index

Revision ID: c2d3e4f5g6h7
Revises: b1c2d3e4f5g6
Create Date: 2026-05-10 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'c2d3e4f5g6h7'
down_revision: Union[str, None] = 'b1c2d3e4f5g6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # 1. Создаем виртуальную FTS5 таблицу для быстрого поиска (unicode61 для поддержки русского)
    op.execute("""
        CREATE VIRTUAL TABLE tasks_fts USING fts5(
            title, 
            description, 
            content='tasks', 
            content_rowid='id', 
            tokenize='unicode61'
        );
    """)

    # 2. Наполняем индекс уже существующими данными (если они есть)
    op.execute("""
        INSERT INTO tasks_fts(rowid, title, description)
        SELECT id, title, description FROM tasks;
    """)

    # 3. Триггеры для АВТОМАТИЧЕСКОЙ фоновой синхронизации без участия Python
    op.execute("""
        CREATE TRIGGER tasks_ai AFTER INSERT ON tasks BEGIN
            INSERT INTO tasks_fts(rowid, title, description) 
            VALUES (new.id, new.title, new.description);
        END;
    """)
    op.execute("""
        CREATE TRIGGER tasks_ad AFTER DELETE ON tasks BEGIN
            INSERT INTO tasks_fts(tasks_fts, rowid, title, description) 
            VALUES('delete', old.id, old.title, old.description);
        END;
    """)
    op.execute("""
        CREATE TRIGGER tasks_au AFTER UPDATE ON tasks BEGIN
            INSERT INTO tasks_fts(tasks_fts, rowid, title, description) 
            VALUES('delete', old.id, old.title, old.description);
            INSERT INTO tasks_fts(rowid, title, description) 
            VALUES (new.id, new.title, new.description);
        END;
    """)

def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS tasks_au;")
    op.execute("DROP TRIGGER IF EXISTS tasks_ad;")
    op.execute("DROP TRIGGER IF EXISTS tasks_ai;")
    op.execute("DROP TABLE IF EXISTS tasks_fts;")
