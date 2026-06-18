"""many to many tasks

Revision ID: f9x1y2z3w4v5
Revises: d3e4f5g6h7i8
Create Date: 2026-05-18 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'f9x1y2z3w4v5'
down_revision: Union[str, None] = 'd3e4f5g6h7i8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # 1. Создаем таблицу связей
    op.create_table(
        'task_relations',
        sa.Column('parent_id', sa.Integer(), nullable=False),
        sa.Column('child_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['child_id'], ['tasks.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['parent_id'], ['tasks.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('parent_id', 'child_id')
    )

    # 2. Переносим существующие связи из tasks.parent_id в task_relations
    op.execute("""
        INSERT INTO task_relations (parent_id, child_id)
        SELECT parent_id, id FROM tasks WHERE parent_id IS NOT NULL;
    """)

    # 3. Удаляем колонку parent_id из tasks (используем batch_alter_table для SQLite)
    with op.batch_alter_table('tasks', schema=None) as batch_op:
        # SQLite не хранит имена внешних ключей по умолчанию.
        # Alembic сам пересоздаст таблицу без ключа при удалении колонки.
        batch_op.drop_column('parent_id')

def downgrade() -> None:
    # Возврат обратно
    with op.batch_alter_table('tasks', schema=None) as batch_op:
        # В batch mode можно объявить ForeignKey прямо внутри Column для SQLite
        batch_op.add_column(sa.Column('parent_id', sa.Integer(), sa.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=True))

    # Возвращаем по одному родителю (берем первого попавшегося, так как старая схема не поддерживает много)
    op.execute("""
        UPDATE tasks 
        SET parent_id = (SELECT parent_id FROM task_relations WHERE child_id = tasks.id LIMIT 1)
    """)

    op.drop_table('task_relations')
