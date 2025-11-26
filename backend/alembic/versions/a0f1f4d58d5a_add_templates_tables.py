"""add templates tables

Revision ID: a0f1f4d58d5a
Revises: 9b7b8c00604c
Create Date: 2025-02-14 20:10:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import uuid
from datetime import datetime


# revision identifiers, used by Alembic.
revision = "a0f1f4d58d5a"
down_revision = "9b7b8c00604c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    created_templates = False
    if not inspector.has_table("templates"):
        op.create_table(
            "templates",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("category", sa.String(length=120), nullable=True),
            sa.Column("visibility", sa.String(length=32), nullable=False, server_default="private"),
            sa.Column("tags", postgresql.ARRAY(sa.String()), nullable=False, server_default="{}"),
            sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("is_recommended", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("recommended_reason", sa.Text(), nullable=True),
            sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        )
        op.create_index("ix_templates_workspace_visibility", "templates", ["workspace_id", "visibility"])
        created_templates = True

    if not inspector.has_table("template_versions"):
        op.create_table(
            "template_versions",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("template_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("templates.id", ondelete="CASCADE"), nullable=False),
            sa.Column("version_number", sa.Integer(), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("content_format", sa.String(length=32), nullable=False, server_default="markdown"),
            sa.Column("content_metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        )
        op.create_index("ix_template_versions_template_id", "template_versions", ["template_id", "version_number"], unique=True)

    if created_templates:
        seed_templates = [
            {
                "title": "AI Product PRD v1",
                "category": "PRD",
                "description": "Structured PRD template with objectives, KPIs, and implementation notes.",
                "tags": ["prd", "ai", "launch"],
                "content": """# Objective\n- ...\n\n## Scope\n- In Scope\n- Out of Scope\n\n## Success Metrics\n- Metric\n\n## Engineering Requirements\n- Requirement\n\n## Rollout Plan\n- Phase\n""",
            },
            {
                "title": "Three-Horizon Roadmap",
                "category": "Roadmap",
                "description": "Roadmap structure split across Horizon 1/2/3 with KPIs.",
                "tags": ["roadmap", "strategy"],
                "content": """# Horizon 1 (Now)\n- Goals\n- Initiatives\n\n# Horizon 2 (Next)\n- Goals\n- Initiatives\n\n# Horizon 3 (Later)\n- Goals\n- Experiments\n""",
            },
        ]
        for template in seed_templates:
            tmpl_id = uuid.uuid4()
            conn.execute(
                sa.text(
                    "INSERT INTO templates (id, workspace_id, title, description, category, visibility, tags, version, is_recommended, created_at, updated_at) "
                    "VALUES (:id, NULL, :title, :description, :category, 'system', :tags, 1, true, :created_at, :created_at)"
                ),
                {
                    "id": str(tmpl_id),
                    "title": template["title"],
                    "description": template["description"],
                    "category": template["category"],
                    "tags": template["tags"],
                    "created_at": datetime.utcnow(),
                },
            )
            conn.execute(
                sa.text(
                    "INSERT INTO template_versions (id, template_id, version_number, content, content_format, created_at) "
                    "VALUES (:vid, :tid, 1, :content, 'markdown', :created_at)"
                ),
                {
                    "vid": str(uuid.uuid4()),
                    "tid": str(tmpl_id),
                    "content": template["content"],
                    "created_at": datetime.utcnow(),
                },
            )


def downgrade() -> None:
    op.drop_index("ix_template_versions_template_id", table_name="template_versions")
    op.drop_table("template_versions")
    op.drop_index("ix_templates_workspace_visibility", table_name="templates")
    op.drop_table("templates")
