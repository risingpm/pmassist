"""add workspace memory table

Revision ID: f1c5a2a6cf2a
Revises: e7c3a79666c4
Create Date: 2025-12-11 12:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from backend.models import Vector

# revision identifiers, used by Alembic.
revision = "f1c5a2a6cf2a"
down_revision = "e7c3a79666c4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workspace_memories",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("source", sa.String(), nullable=False, server_default="manual"),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("tags", sa.ARRAY(sa.String()), server_default="{}", nullable=False),
        sa.Column("importance", sa.Float(), nullable=True),
        sa.Column("pinned", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("embedding", Vector(), nullable=True),
    )
    op.create_index("ix_workspace_memories_workspace", "workspace_memories", ["workspace_id", "pinned"])


def downgrade() -> None:
    op.drop_index("ix_workspace_memories_workspace", table_name="workspace_memories")
    op.drop_table("workspace_memories")
