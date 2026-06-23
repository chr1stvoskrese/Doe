"""add priority_data to tasks

Revision ID: p2q3r4s5t6u7
Revises: p1r2i3o4r5i6
Create Date: 2026-06-11 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'p2q3r4s5t6u7'
down_revision: Union[str, None] = 'p1r2i3o4r5i6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    with op.batch_alter_table('tasks', schema=None) as batch_op:
        batch_op.add_column(sa.Column('priority_data', sa.JSON(), nullable=True))

def downgrade() -> None:
    with op.batch_alter_table('tasks', schema=None) as batch_op:
        batch_op.drop_column('priority_data')
