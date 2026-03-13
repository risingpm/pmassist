"""Add PRD chat messages table.

Revision ID: 4b8f1f2a6c2a
Revises: 3c1f4a2b9d1e
Create Date: 2025-02-20 12:10:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "4b8f1f2a6c2a"
down_revision = "3c1f4a2b9d1e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "prd_chat_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("prd_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["prd_id"], ["prds.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_prd_chat_messages_prd_id", "prd_chat_messages", ["prd_id"])
    op.create_index("ix_prd_chat_messages_workspace_id", "prd_chat_messages", ["workspace_id"])


def downgrade() -> None:
    op.drop_index("ix_prd_chat_messages_workspace_id", table_name="prd_chat_messages")
    op.drop_index("ix_prd_chat_messages_prd_id", table_name="prd_chat_messages")
    op.drop_table("prd_chat_messages")
