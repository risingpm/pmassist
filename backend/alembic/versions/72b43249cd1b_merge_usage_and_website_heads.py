"""merge usage and website heads

Revision ID: 72b43249cd1b
Revises: 4d7a1379631a, c8d1ef3a9b7d
Create Date: 2025-12-10 12:41:46.476407

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '72b43249cd1b'
down_revision = ('4d7a1379631a', 'c8d1ef3a9b7d')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
