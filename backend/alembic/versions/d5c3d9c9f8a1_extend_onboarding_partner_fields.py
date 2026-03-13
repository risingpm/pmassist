"""extend onboarding partner fields

Revision ID: d5c3d9c9f8a1
Revises: b4f324e8345d
Create Date: 2025-01-07 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "d5c3d9c9f8a1"
down_revision = "b4f324e8345d"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("workspaces", sa.Column("ai_partner_name", sa.String(), nullable=True))
    op.add_column(
        "workspaces",
        sa.Column(
            "ai_partner_focus",
            postgresql.ARRAY(sa.String()),
            server_default=sa.text("ARRAY[]::varchar[]"),
            nullable=False,
        ),
    )
    op.add_column(
        "workspaces",
        sa.Column("onboarding_steps_state", postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
    )


def downgrade():
    op.drop_column("workspaces", "onboarding_steps_state")
    op.drop_column("workspaces", "ai_partner_focus")
    op.drop_column("workspaces", "ai_partner_name")
