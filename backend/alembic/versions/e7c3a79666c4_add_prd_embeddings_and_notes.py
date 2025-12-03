"""add prd embeddings and decision notes

Revision ID: e7c3a79666c4
Revises: d2f98a7a1c1b
Create Date: 2025-12-11 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from backend.models import Vector

# revision identifiers, used by Alembic.
revision = "e7c3a79666c4"
down_revision = "d2f98a7a1c1b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {col["name"] for col in inspector.get_columns("prds")}

    if "created_by" not in columns:
        op.add_column("prds", sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True))
        op.create_foreign_key(
            "fk_prds_created_by_users",
            "prds",
            "users",
            ["created_by"],
            ["id"],
            ondelete="SET NULL",
        )

    if "prd_decision_notes" not in inspector.get_table_names():
        op.create_table(
            "prd_decision_notes",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("prd_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("prds.id", ondelete="CASCADE"), nullable=False),
            sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
            sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False),
            sa.Column("decision", sa.Text(), nullable=False),
            sa.Column("rationale", sa.Text(), nullable=True),
            sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_foreign_key(
            "fk_prd_decisions_author",
            "prd_decision_notes",
            "users",
            ["created_by"],
            ["id"],
            ondelete="SET NULL",
        )
        op.create_index(
            "ix_prd_decision_notes_project",
            "prd_decision_notes",
            ["project_id", "version"],
        )

    if "prd_embeddings" not in inspector.get_table_names():
        op.create_table(
            "prd_embeddings",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("prd_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("prds.id", ondelete="CASCADE"), nullable=False),
            sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
            sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False),
            sa.Column("chunk_index", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("chunk_type", sa.String(), nullable=False, server_default="body"),
            sa.Column("chunk", sa.Text(), nullable=False),
            sa.Column("decision_note_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("prd_decision_notes.id", ondelete="CASCADE"), nullable=True),
            sa.Column("embedding", Vector()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index(
            "ix_prd_embeddings_project",
            "prd_embeddings",
            ["project_id", "version", "chunk_type"],
        )
        op.create_index(
            "ix_prd_embeddings_workspace",
            "prd_embeddings",
            ["workspace_id"],
        )


def downgrade() -> None:
    op.drop_index("ix_prd_embeddings_workspace", table_name="prd_embeddings")
    op.drop_index("ix_prd_embeddings_project", table_name="prd_embeddings")
    op.drop_table("prd_embeddings")

    op.drop_index("ix_prd_decision_notes_project", table_name="prd_decision_notes")
    op.drop_constraint("fk_prd_decisions_author", "prd_decision_notes", type_="foreignkey")
    op.drop_table("prd_decision_notes")

    op.drop_constraint("fk_prds_created_by_users", "prds", type_="foreignkey")
    op.drop_column("prds", "created_by")
