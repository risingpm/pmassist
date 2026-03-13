"""add ai agents tables

Revision ID: 0d0c0e8b1d19
Revises: 5314d6831b36
Create Date: 2025-12-11 07:30:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

from backend.models import Vector

# revision identifiers, used by Alembic.
revision = "0d0c0e8b1d19"
down_revision = "5314d6831b36"
branch_labels = None
depends_on = None


def _has_index(inspector, table_name: str, index_name: str) -> bool:
    if not inspector.has_table(table_name):
        return False
    return any(idx["name"] == index_name for idx in inspector.get_indexes(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if not inspector.has_table("ai_agents"):
        op.create_table(
            "ai_agents",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
            sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("purpose", sa.Text(), nullable=True),
            sa.Column("tone", sa.String(), nullable=True),
            sa.Column("avatar_url", sa.String(), nullable=True),
            sa.Column("accent_color", sa.String(), nullable=True),
            sa.Column("model_name", sa.String(), nullable=False, server_default="gpt-4o-mini"),
            sa.Column("temperature", sa.Float(), nullable=False, server_default="0.3"),
            sa.Column("max_tokens", sa.Integer(), nullable=True),
            sa.Column("instructions", sa.Text(), nullable=False),
            sa.Column("tools", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("modules", sa.ARRAY(sa.String()), nullable=False, server_default="{}"),
            sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("shared_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("cloned_from_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ai_agents.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        )
    if not _has_index(inspector, "ai_agents", "ix_ai_agents_workspace"):
        op.create_index("ix_ai_agents_workspace", "ai_agents", ["workspace_id", "is_public"])

    if not inspector.has_table("project_agents"):
        op.create_table(
            "project_agents",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
            sa.Column("agent_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ai_agents.id", ondelete="CASCADE"), nullable=False),
            sa.Column("assigned_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
    if not _has_index(inspector, "project_agents", "ix_project_agents_project"):
        op.create_index("ix_project_agents_project", "project_agents", ["project_id"])

    if not inspector.has_table("ai_agent_runs"):
        op.create_table(
            "ai_agent_runs",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("agent_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ai_agents.id", ondelete="CASCADE"), nullable=False),
            sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
            sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("prompt", sa.Text(), nullable=False),
            sa.Column("response", sa.Text(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="completed"),
            sa.Column("tool_invocations", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("context_entries", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
    if not _has_index(inspector, "ai_agent_runs", "ix_ai_agent_runs_agent"):
        op.create_index("ix_ai_agent_runs_agent", "ai_agent_runs", ["agent_id"])


def downgrade() -> None:
    op.drop_index("ix_ai_agent_runs_agent", table_name="ai_agent_runs")
    op.drop_table("ai_agent_runs")
    op.drop_index("ix_project_agents_project", table_name="project_agents")
    op.drop_table("project_agents")
    op.drop_index("ix_ai_agents_workspace", table_name="ai_agents")
    op.drop_table("ai_agents")
