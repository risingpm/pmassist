"""add onboarding profile to workspaces

Revision ID: aa1f4e0d3c2b
Revises: fe3f9b7e5c2a
Create Date: 2025-03-10 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "aa1f4e0d3c2b"
down_revision = "fe3f9b7e5c2a"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "workspaces",
        sa.Column("onboarding_profile", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
    )


def downgrade():
    op.drop_column("workspaces", "onboarding_profile")
