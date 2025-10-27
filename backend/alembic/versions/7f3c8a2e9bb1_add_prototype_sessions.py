"""Add prototype sessions and messages

Revision ID: 7f3c8a2e9bb1
Revises: 6c9d8f3b7e2a
Create Date: 2025-03-06 17:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "7f3c8a2e9bb1"
down_revision = "6c9d8f3b7e2a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if not inspector.has_table("prototype_sessions"):
        op.create_table(
            "prototype_sessions",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
            sa.Column("project_id", sa.Text(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
            sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True),
            sa.Column("title", sa.Text(), nullable=True),
            sa.Column("latest_spec", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("latest_bundle_path", sa.Text(), nullable=True),
            sa.Column("latest_bundle_url", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        )
        op.create_index("ix_prototype_sessions_project_id", "prototype_sessions", ["project_id"])
        op.create_index("ix_prototype_sessions_workspace_id", "prototype_sessions", ["workspace_id"])

    if not inspector.has_table("prototype_messages"):
        op.create_table(
            "prototype_messages",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
            sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("prototype_sessions.id", ondelete="CASCADE"), nullable=False),
            sa.Column("role", sa.Text(), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_prototype_messages_session_id", "prototype_messages", ["session_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if inspector.has_table("prototype_messages"):
        op.drop_index("ix_prototype_messages_session_id", table_name="prototype_messages")
        op.drop_table("prototype_messages")

    if inspector.has_table("prototype_sessions"):
        op.drop_index("ix_prototype_sessions_workspace_id", table_name="prototype_sessions")
        op.drop_index("ix_prototype_sessions_project_id", table_name="prototype_sessions")
        op.drop_table("prototype_sessions")
