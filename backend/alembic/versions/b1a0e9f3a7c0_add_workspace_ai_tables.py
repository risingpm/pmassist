"""add workspace ai tables

Revision ID: b1a0e9f3a7c0
Revises: a0f1f4d58d5a
Create Date: 2025-02-17 12:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "b1a0e9f3a7c0"
down_revision = "a0f1f4d58d5a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if not inspector.has_table("workspace_insights"):
        op.create_table(
            "workspace_insights",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column(
                "workspace_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("summary", sa.Text(), nullable=False),
            sa.Column("recommendations", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.Column("metrics", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column("context_entries", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("confidence", sa.Float(), nullable=True),
            sa.Column("generated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        )
        op.create_index(
            "ix_workspace_insights_workspace_generated",
            "workspace_insights",
            ["workspace_id", "generated_at"],
        )

    if not inspector.has_table("workspace_ai_chats"):
        op.create_table(
            "workspace_ai_chats",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column(
                "workspace_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "user_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("title", sa.String(length=255), nullable=True),
            sa.Column("messages", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.Column("context_entries", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        )
        op.create_index(
            "ix_workspace_ai_chats_workspace",
            "workspace_ai_chats",
            ["workspace_id", "last_message_at"],
        )


def downgrade() -> None:
    op.drop_index("ix_workspace_ai_chats_workspace", table_name="workspace_ai_chats")
    op.drop_table("workspace_ai_chats")
    op.drop_index("ix_workspace_insights_workspace_generated", table_name="workspace_insights")
    op.drop_table("workspace_insights")
