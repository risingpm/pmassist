"""Convert roadmap content to text and add conversation table

Revision ID: beb8f1ef1d0c
Revises: 8c0aa0f2d2b7
Create Date: 2025-02-14 19:37:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "beb8f1ef1d0c"
down_revision = "8c0aa0f2d2b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # alter roadmaps content to text and add updated_at
    op.alter_column(
        "roadmaps",
        "content",
        type_=sa.Text(),
        postgresql_using="content::text",
    )
    op.add_column(
        "roadmaps",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.execute("DROP TABLE IF EXISTS roadmap_conversations CASCADE")
    op.create_table(
        "roadmap_conversations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("message_role", sa.String(), nullable=False),
        sa.Column("message_content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("roadmap_conversations")
    op.drop_column("roadmaps", "updated_at")
    op.alter_column(
        "roadmaps",
        "content",
        type_=postgresql.JSONB(),
        postgresql_using="content::jsonb",
    )
