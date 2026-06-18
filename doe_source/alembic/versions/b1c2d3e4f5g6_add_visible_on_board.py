"""add is_visible_on_board to tasks

Revision ID: b1c2d3e4f5g6
Revises: e6a0c04ed118
Create Date: 2026-05-08 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# Текущий ID этой миграции (любая уникальная строка)
revision: str = 'b1c2d3e4f5g6'
# ID ПРЕДЫДУЩЕЙ миграции (чтобы Alembic знал порядок)
down_revision: Union[str, None] = 'e6a0c04ed118'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Используем batch_alter_table — это золотой стандарт для безопасного изменения таблиц в SQLite
    with op.batch_alter_table('tasks', schema=None) as batch_op:
        # Добавляем колонку. 
        # server_default='0' ГАРАНТИРУЕТ, что у всех существующих 1000 карточек 
        # это поле автоматически заполнится нулем (False), и база не упадет.
        batch_op.add_column(sa.Column('is_visible_on_board', sa.Boolean(), server_default='0', nullable=False))


def downgrade() -> None:
    # На случай, если потребуется откатить версию базы данных назад
    with op.batch_alter_table('tasks', schema=None) as batch_op:
        batch_op.drop_column('is_visible_on_board')
