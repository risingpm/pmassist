"""Add created_at to projects.

Revision ID: 6f2a1d4c8b7e
Revises: 1b2c3d4e5f6a
Create Date: 2025-03-01 12:30:00.000000
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "6f2a1d4c8b7e"
down_revision = "1b2c3d4e5f6a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("projects", "created_at")
