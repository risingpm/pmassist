"""Add prototypes table

Revision ID: 1c5c1dc1d6a3
Revises: d2a32e6dcd44
Create Date: 2025-03-06 12:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "1c5c1dc1d6a3"
down_revision = "d2a32e6dcd44"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if inspector.has_table("prototypes"):
        return

    op.create_table(
        "prototypes",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("roadmap_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("roadmaps.id", ondelete="SET NULL"), nullable=True),
        sa.Column("roadmap_version", sa.Integer(), nullable=True),
        sa.Column("phase", sa.Text(), nullable=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("spec", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("html_preview", sa.Text(), nullable=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    op.create_index("ix_prototypes_project_id", "prototypes", ["project_id"])
    op.create_index("ix_prototypes_workspace_id", "prototypes", ["workspace_id"])
    op.create_index("ix_prototypes_created_at", "prototypes", ["created_at"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if inspector.has_table("prototypes"):
        op.drop_index("ix_prototypes_created_at", table_name="prototypes")
        op.drop_index("ix_prototypes_workspace_id", table_name="prototypes")
        op.drop_index("ix_prototypes_project_id", table_name="prototypes")
        op.drop_table("prototypes")
