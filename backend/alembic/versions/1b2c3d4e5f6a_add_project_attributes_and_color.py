"""Add project attributes and color.

Revision ID: 1b2c3d4e5f6a
Revises: 4b8f1f2a6c2a
Create Date: 2025-03-01 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "1b2c3d4e5f6a"
down_revision = "4b8f1f2a6c2a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("color", sa.String(), nullable=True))
    op.add_column("projects", sa.Column("attributes", postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "attributes")
    op.drop_column("projects", "color")
