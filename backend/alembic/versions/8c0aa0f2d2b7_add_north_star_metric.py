"""Add north_star_metric to projects

Revision ID: 8c0aa0f2d2b7
Revises: 0d48ac0cef64
Create Date: 2025-02-14 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "8c0aa0f2d2b7"
down_revision = "0d48ac0cef64"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("north_star_metric", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "north_star_metric")
