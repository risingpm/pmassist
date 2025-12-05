"""add workspace onboarding acknowledgement

Revision ID: b4f324e8345d
Revises: 7a2d9c5d1df4
Create Date: 2024-07-08 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "b4f324e8345d"
down_revision = "7a2d9c5d1df4"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "workspaces",
        sa.Column("onboarding_acknowledged", sa.Boolean(), server_default="false", nullable=False),
    )


def downgrade():
    op.drop_column("workspaces", "onboarding_acknowledged")
