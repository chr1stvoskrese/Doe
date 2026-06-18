"""add width to columns

Revision ID: w3x4y5z6a7b8
Revises: i2j3k4l5m6n7
Create Date: 2026-06-18 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'w3x4y5z6a7b8'
down_revision: Union[str, None] = 'i2j3k4l5m6n7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    with op.batch_alter_table('columns', schema=None) as batch_op:
        batch_op.add_column(sa.Column('width', sa.Float(), nullable=True))

def downgrade() -> None:
    with op.batch_alter_table('columns', schema=None) as batch_op:
        batch_op.drop_column('width')
