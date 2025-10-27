"""Add project links table

Revision ID: 6c9d8f3b7e2a
Revises: 4f8a0f9f0c2b
Create Date: 2025-03-06 16:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "6c9d8f3b7e2a"
down_revision = "4f8a0f9f0c2b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if inspector.has_table("project_links"):
        return

    op.create_table(
        "project_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", sa.Text(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("tags", postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_index("ix_project_links_project_id", "project_links", ["project_id"])
    op.create_index("ix_project_links_workspace_id", "project_links", ["workspace_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if inspector.has_table("project_links"):
        op.drop_index("ix_project_links_workspace_id", table_name="project_links")
        op.drop_index("ix_project_links_project_id", table_name="project_links")
        op.drop_table("project_links")
