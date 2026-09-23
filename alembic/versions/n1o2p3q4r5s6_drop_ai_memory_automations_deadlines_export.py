"""drop removed features: memory_items, automations, tasks.due_date

Revision ID: n1o2p3q4r5s6
Revises: m1n2e3m4o5r6
Create Date: 2026-09-23 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'n1o2p3q4r5s6'
down_revision: Union[str, None] = 'm1n2e3m4o5r6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # memory_items (spaced repetition / «Запоминание»)
    op.drop_index('ix_memory_items_due_at', table_name='memory_items')
    op.drop_index('ix_memory_items_task_id', table_name='memory_items')
    op.drop_index('ix_memory_items_id', table_name='memory_items')
    op.drop_table('memory_items')
    # automations
    op.drop_table('automations')
    # tasks.due_date (дедлайны) — через batch для SQLite
    with op.batch_alter_table('tasks', schema=None) as batch_op:
        batch_op.drop_column('due_date')


def downgrade() -> None:
    with op.batch_alter_table('tasks', schema=None) as batch_op:
        batch_op.add_column(sa.Column('due_date', sa.DateTime(), nullable=True))
    op.create_table('automations',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('type', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('enabled', sa.Boolean(), server_default='1', nullable=False),
        sa.Column('config', sa.JSON(), nullable=False),
        sa.Column('last_run_at', sa.DateTime(), nullable=True),
        sa.Column('next_run_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('(datetime(\'now\'))'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('(datetime(\'now\'))'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
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
