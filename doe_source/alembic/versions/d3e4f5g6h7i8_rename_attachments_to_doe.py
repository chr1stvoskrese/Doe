"""rename attachments folder to doe in markdown links

Revision ID: d3e4f5g6h7i8
Revises: c2d3e4f5g6h7
Create Date: 2026-05-15 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
import os
import shutil
from pathlib import Path

revision: str = 'd3e4f5g6h7i8'
down_revision: Union[str, None] = 'c2d3e4f5g6h7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Заменяем все ссылки (attachments/ → (doe/ в описаниях задач.
    # Используем строгий шаблон с открывающей скобкой, чтобы случайно не задеть
    # слово "attachments" внутри обычного текста описаний.
    op.execute("""
        UPDATE tasks 
        SET description = REPLACE(description, '(attachments/', '(doe/')
        WHERE description LIKE '%(attachments/%';
    """)
    
    # 2. Чиним attachments_order (JSON-массив путей).
    # Простой REPLACE по подстроке "attachments/" безопасен, потому что в этом 
    # JSON хранятся только пути вида "attachments/file.png" — других вхождений нет.
    op.execute("""
        UPDATE tasks 
        SET attachments_order = REPLACE(attachments_order, 'attachments/', 'doe/')
        WHERE attachments_order LIKE '%attachments/%';
    """)
    
    # 3. Физически переименовываем папку attachments → doe в текущем хранилище.
    # Путь к БД лежит в connection.engine.url
    try:
        conn = op.get_bind()
        db_url = str(conn.engine.url)
        # Извлекаем путь к файлу board.db из строки вида "sqlite:///C:/path/board.db"
        db_path = db_url.replace("sqlite:///", "").replace("sqlite+aiosqlite:///", "")
        vault_dir = Path(db_path).parent
        
        old_dir = vault_dir / "attachments"
        new_dir = vault_dir / "doe"
        
        if old_dir.exists() and old_dir.is_dir() and not new_dir.exists():
            shutil.move(str(old_dir), str(new_dir))
            print(f"[Migration] Renamed {old_dir} -> {new_dir}")
    except Exception as e:
        print(f"[Migration] Could not rename physical folder: {e}")


def downgrade() -> None:
    # Откат обратно к attachments/
    op.execute("""
        UPDATE tasks 
        SET description = REPLACE(description, '(doe/', '(attachments/')
        WHERE description LIKE '%(doe/%';
    """)
    op.execute("""
        UPDATE tasks 
        SET attachments_order = REPLACE(attachments_order, 'doe/', 'attachments/')
        WHERE attachments_order LIKE '%doe/%';
    """)
    
    try:
        conn = op.get_bind()
        db_url = str(conn.engine.url)
        db_path = db_url.replace("sqlite:///", "").replace("sqlite+aiosqlite:///", "")
        vault_dir = Path(db_path).parent
        
        new_dir = vault_dir / "doe"
        old_dir = vault_dir / "attachments"
        
        if new_dir.exists() and new_dir.is_dir() and not old_dir.exists():
            shutil.move(str(new_dir), str(old_dir))
    except Exception as e:
        print(f"[Migration] Downgrade folder rename failed: {e}")
