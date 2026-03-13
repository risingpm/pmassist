"""add mcp connections

Revision ID: 7a2d9c5d1df4
Revises: 0d0c0e8b1d19
Create Date: 2025-02-20 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "7a2d9c5d1df4"
down_revision = "0d0c0e8b1d19"
branch_labels = None
depends_on = None


def _has_column(inspector, table_name: str, column_name: str) -> bool:
    if not inspector.has_table(table_name):
        return False
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if not inspector.has_table("workspace_mcp_connections"):
        op.create_table(
            "workspace_mcp_connections",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "workspace_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("endpoint_url", sa.String(), nullable=False),
            sa.Column("tool_name", sa.String(), nullable=False),
            sa.Column("prompt_field", sa.String(), nullable=False, server_default=sa.text("'prompt'")),
            sa.Column("context_field", sa.String(), nullable=True),
            sa.Column(
                "default_arguments",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column("auth_token_encrypted", sa.String(), nullable=True),
            sa.Column(
                "created_by",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column(
                "updated_by",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        )
        op.create_index(
            "ix_workspace_mcp_connections_workspace",
            "workspace_mcp_connections",
            ["workspace_id"],
        )

    if not _has_column(inspector, "ai_agents", "mcp_connection_ids"):
        op.add_column(
            "ai_agents",
            sa.Column(
                "mcp_connection_ids",
                postgresql.ARRAY(postgresql.UUID(as_uuid=True)),
                nullable=False,
                server_default=sa.text("'{}'::uuid[]"),
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("workspace_mcp_connections"):
        op.drop_index("ix_workspace_mcp_connections_workspace", table_name="workspace_mcp_connections")
        op.drop_table("workspace_mcp_connections")
    if inspector.has_table("ai_agents") and _has_column(inspector, "ai_agents", "mcp_connection_ids"):
        op.drop_column("ai_agents", "mcp_connection_ids")
