"""Add default agent ids to workspaces.

Revision ID: 1b8c5c2e8d12
Revises: 7a2d9c5d1df4
Create Date: 2026-01-28 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "1b8c5c2e8d12"
down_revision = "7a2d9c5d1df4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "workspaces",
        sa.Column("prd_agent_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "workspaces",
        sa.Column("roadmap_agent_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_workspaces_prd_agent_id",
        "workspaces",
        "ai_agents",
        ["prd_agent_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_workspaces_roadmap_agent_id",
        "workspaces",
        "ai_agents",
        ["roadmap_agent_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_workspaces_prd_agent_id", "workspaces", type_="foreignkey")
    op.drop_constraint("fk_workspaces_roadmap_agent_id", "workspaces", type_="foreignkey")
    op.drop_column("workspaces", "prd_agent_id")
    op.drop_column("workspaces", "roadmap_agent_id")
