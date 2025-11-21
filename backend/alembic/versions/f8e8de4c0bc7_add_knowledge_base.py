"""add knowledge base

Revision ID: f8e8de4c0bc7
Revises: c0fd44c4b23d
Create Date: 2025-11-19 17:08:13.348442

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import inspect, text

import uuid


# revision identifiers, used by Alembic.
revision = 'f8e8de4c0bc7'
down_revision = 'c0fd44c4b23d'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())

    if "knowledge_bases" not in tables:
        op.create_table(
            "knowledge_bases",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
            sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.Text(), nullable=False, server_default="Workspace Knowledge Base"),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    if "kb_entries" not in tables:
        op.create_table(
            "kb_entries",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
            sa.Column("kb_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("knowledge_bases.id", ondelete="CASCADE"), nullable=False),
            sa.Column("type", sa.Text(), nullable=False, server_default="document"),
            sa.Column("title", sa.Text(), nullable=False),
            sa.Column("content", sa.Text(), nullable=True),
            sa.Column("file_path", sa.Text(), nullable=True),
            sa.Column("source_url", sa.Text(), nullable=True),
            sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
            sa.Column("tags", postgresql.ARRAY(sa.Text()), server_default="{}", nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        )

    document_columns = {col["name"] for col in inspector.get_columns("documents")}
    if "kb_entry_id" not in document_columns:
        op.add_column("documents", sa.Column("kb_entry_id", postgresql.UUID(as_uuid=True), nullable=True))
        op.create_foreign_key(
            "fk_documents_kb_entry",
            "documents",
            "kb_entries",
            ["kb_entry_id"],
            ["id"],
            ondelete="CASCADE",
        )

    op.alter_column("documents", "project_id", existing_type=postgresql.UUID(as_uuid=True), nullable=True)

    # Ensure workspace_id populated on documents
    if "documents" in tables:
        bind.execute(
            text(
                "UPDATE documents SET workspace_id = p.workspace_id FROM projects p "
                "WHERE documents.project_id = p.id AND documents.workspace_id IS NULL"
            )
        )

    existing_kbs = {
        workspace_id: kb_id
        for kb_id, workspace_id in bind.execute(text("SELECT id, workspace_id FROM knowledge_bases")).fetchall()
    }

    workspaces = bind.execute(text("SELECT id FROM workspaces")).fetchall()
    kb_map: dict[uuid.UUID, uuid.UUID] = {}
    for (workspace_id,) in workspaces:
        kb_id = existing_kbs.get(workspace_id)
        if not kb_id:
            kb_id = uuid.uuid4()
            bind.execute(
                text(
                    "INSERT INTO knowledge_bases (id, workspace_id, name, description, created_at) "
                    "VALUES (:id, :workspace_id, :name, NULL, now())"
                ),
                {"id": kb_id, "workspace_id": workspace_id, "name": "Workspace Knowledge Base"},
            )
        kb_map[workspace_id] = kb_id

    if kb_map:
        rows = bind.execute(
            text(
                "SELECT workspace_id, project_id, filename FROM documents "
                "WHERE workspace_id IS NOT NULL AND kb_entry_id IS NULL "
                "GROUP BY workspace_id, project_id, filename"
            )
        ).fetchall()
        for workspace_id, project_id, filename in rows:
            kb_id = kb_map.get(workspace_id)
            if not kb_id:
                continue
            entry_id = uuid.uuid4()
            bind.execute(
                text(
                    "INSERT INTO kb_entries (id, kb_id, type, title, content, file_path, source_url, created_by, project_id, tags, created_at, updated_at)"
                    " VALUES (:id, :kb_id, 'document', :title, NULL, NULL, NULL, NULL, :project_id, '{}', now(), now())"
                ),
                {"id": entry_id, "kb_id": kb_id, "title": filename or "Document", "project_id": project_id},
            )
            bind.execute(
                text(
                    "UPDATE documents SET kb_entry_id = :entry_id WHERE workspace_id = :workspace_id "
                    "AND filename = :filename AND ((project_id IS NULL AND :project_id IS NULL) OR project_id = :project_id)"
                ),
                {"entry_id": entry_id, "workspace_id": workspace_id, "filename": filename, "project_id": project_id},
            )


def downgrade() -> None:
    op.drop_constraint("fk_documents_kb_entry", "documents", type_="foreignkey")
    op.drop_column("documents", "kb_entry_id")
    op.alter_column("documents", "project_id", existing_type=postgresql.UUID(as_uuid=True), nullable=False)
    op.drop_table("kb_entries")
    op.drop_table("knowledge_bases")
