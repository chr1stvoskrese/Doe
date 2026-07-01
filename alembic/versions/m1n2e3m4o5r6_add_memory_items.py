"""add memory_items (spaced repetition)

Revision ID: m1n2e3m4o5r6
Revises: w3x4y5z6a7b8
Create Date: 2026-06-28 19:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'm1n2e3m4o5r6'
down_revision: Union[str, None] = 'w3x4y5z6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'memory_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('task_id', sa.Integer(), nullable=False),
        sa.Column('fragment_text', sa.String(), nullable=True),
        sa.Column('enabled', sa.Boolean(), nullable=True),
        sa.Column('state', sa.String(), nullable=True),
        sa.Column('step_index', sa.Integer(), nullable=True),
        sa.Column('ease_factor', sa.Float(), nullable=True),
        sa.Column('interval_days', sa.Float(), nullable=True),
        sa.Column('repetitions', sa.Integer(), nullable=True),
        sa.Column('lapses', sa.Integer(), nullable=True),
        sa.Column('due_at', sa.DateTime(), nullable=True),
        sa.Column('last_reviewed_at', sa.DateTime(), nullable=True),
        sa.Column('last_grade', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_memory_items_id', 'memory_items', ['id'], unique=False)
    op.create_index('ix_memory_items_task_id', 'memory_items', ['task_id'], unique=False)
    op.create_index('ix_memory_items_due_at', 'memory_items', ['due_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_memory_items_due_at', table_name='memory_items')
    op.drop_index('ix_memory_items_task_id', table_name='memory_items')
    op.drop_index('ix_memory_items_id', table_name='memory_items')
    op.drop_table('memory_items')
