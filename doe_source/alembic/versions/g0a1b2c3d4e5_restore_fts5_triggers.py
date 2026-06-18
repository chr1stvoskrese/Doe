"""restore fts5 triggers after task_relations migration

Revision ID: g0a1b2c3d4e5
Revises: f9x1y2z3w4v5
Create Date: 2026-05-17 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'g0a1b2c3d4e5'
down_revision: Union[str, None] = 'f9x1y2z3w4v5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Триггеры FTS5 были снесены при batch_alter_table в миграции f9x1y2z3w4v5:
    # SQLite пересоздаёт таблицу tasks при drop_column и теряет все её триггеры.
    # Восстанавливаем FTS5-индекс с нуля и заново вешаем триггеры.
    
    # 1. Удаляем триггеры, если случайно остались (DROP IF EXISTS безопасен)
    op.execute("DROP TRIGGER IF EXISTS tasks_au;")
    op.execute("DROP TRIGGER IF EXISTS tasks_ad;")
    op.execute("DROP TRIGGER IF EXISTS tasks_ai;")
    
    # 2. Пересоздаём виртуальную FTS5-таблицу (на случай если она стала inconsistent)
    op.execute("DROP TABLE IF EXISTS tasks_fts;")
    op.execute("""
        CREATE VIRTUAL TABLE tasks_fts USING fts5(
            title, 
            description, 
            content='tasks', 
            content_rowid='id', 
            tokenize='unicode61'
        );
    """)
    
    # 3. Перезаполняем индекс актуальными данными из tasks
    op.execute("""
        INSERT INTO tasks_fts(rowid, title, description)
        SELECT id, title, description FROM tasks;
    """)
    
    # 4. Заново вешаем триггеры синхронизации
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
