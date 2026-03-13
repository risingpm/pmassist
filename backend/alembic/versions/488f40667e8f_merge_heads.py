"""merge heads

Revision ID: 488f40667e8f
Revises: 1b8c5c2e8d12, b9f2a1c4d7e8
Create Date: 2026-01-29 10:59:27.546356

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '488f40667e8f'
down_revision = ('1b8c5c2e8d12', 'b9f2a1c4d7e8')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
