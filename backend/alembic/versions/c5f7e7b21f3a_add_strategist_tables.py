"""add strategist tables

Revision ID: c5f7e7b21f3a
Revises: b1a0e9f3a7c0
Create Date: 2025-11-26 18:20:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = "c5f7e7b21f3a"
down_revision = "b1a0e9f3a7c0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if not inspector.has_table("strategic_pillars"):
        op.create_table(
            "strategic_pillars",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("progress_percent", sa.Float(), nullable=False, server_default="0"),
            sa.Column("related_prds", postgresql.JSONB(astext_type=sa.Text()), nullable=True, server_default=sa.text("'[]'::jsonb")),
            sa.Column("related_roadmaps", postgresql.JSONB(astext_type=sa.Text()), nullable=True, server_default=sa.text("'[]'::jsonb")),
            sa.Column("related_tasks", postgresql.JSONB(astext_type=sa.Text()), nullable=True, server_default=sa.text("'[]'::jsonb")),
            sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        )
        op.create_index("ix_strategic_pillars_workspace", "strategic_pillars", ["workspace_id", "generated_at"])

    if not inspector.has_table("strategic_insights"):
        op.create_table(
            "strategic_insights",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("severity", sa.String(length=32), nullable=True),
            sa.Column("source_type", sa.String(length=32), nullable=True),
            sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("suggested_action", sa.Text(), nullable=True),
            sa.Column("impact_score", sa.Float(), nullable=True),
            sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        )
        op.create_index("ix_strategic_insights_workspace", "strategic_insights", ["workspace_id", "generated_at"])

    if not inspector.has_table("strategic_snapshots"):
        op.create_table(
            "strategic_snapshots",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, unique=True),
            sa.Column("summary", sa.Text(), nullable=True),
            sa.Column("focus_areas", postgresql.ARRAY(sa.String()), nullable=True),
            sa.Column("forecast", sa.Text(), nullable=True),
            sa.Column("health_score", sa.Float(), nullable=True),
            sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        )

def downgrade() -> None:
    op.drop_table("strategic_snapshots")
    op.drop_index("ix_strategic_insights_workspace", table_name="strategic_insights")
    op.drop_table("strategic_insights")
    op.drop_index("ix_strategic_pillars_workspace", table_name="strategic_pillars")
    op.drop_table("strategic_pillars")
