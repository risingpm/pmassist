"""Add workspaces and memberships, workspace scoping columns

Revision ID: 9f6f1ac8f9b1
Revises: 86d4bd0c9f2c
Create Date: 2025-03-05 00:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = "9f6f1ac8f9b1"
down_revision = "86d4bd0c9f2c"
branch_labels = None
depends_on = None


ROLE_CHECK = sa.CheckConstraint("role IN ('owner','admin','member')", name="workspace_members_role_check")


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if not inspector.has_table("workspaces"):
        op.create_table(
            "workspaces",
            sa.Column(
                "id",
                postgresql.UUID(as_uuid=True),
                primary_key=True,
                nullable=False,
                server_default=sa.text("gen_random_uuid()"),
            ),
            sa.Column("name", sa.Text(), nullable=False),
            sa.Column(
                "owner_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    if not inspector.has_table("workspace_members"):
        op.create_table(
            "workspace_members",
            sa.Column(
                "id",
                postgresql.UUID(as_uuid=True),
                primary_key=True,
                nullable=False,
                server_default=sa.text("gen_random_uuid()"),
            ),
            sa.Column(
                "workspace_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "user_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("role", sa.Text(), nullable=False, server_default="owner"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            ROLE_CHECK,
        )

    existing_project_cols = {c["name"] for c in inspector.get_columns("projects")}
    if "workspace_id" not in existing_project_cols:
        op.add_column(
            "projects",
            sa.Column(
                "workspace_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
                nullable=True,
            ),
        )

    existing_prd_cols = {c["name"] for c in inspector.get_columns("prds")}
    if "workspace_id" not in existing_prd_cols:
        op.add_column(
            "prds",
            sa.Column(
                "workspace_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
                nullable=True,
            ),
        )

    existing_doc_cols = {c["name"] for c in inspector.get_columns("documents")}
    if "workspace_id" not in existing_doc_cols:
        op.add_column(
            "documents",
            sa.Column(
                "workspace_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
                nullable=True,
            ),
        )

    existing_roadmap_cols = {c["name"] for c in inspector.get_columns("roadmaps")}
    if "workspace_id" not in existing_roadmap_cols:
        op.add_column(
            "roadmaps",
            sa.Column(
                "workspace_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
                nullable=True,
            ),
        )

    # ----- Backfill -----------------------------------------------------
    user_row = bind.execute(sa.text("SELECT id FROM users LIMIT 1")).fetchone()
    if user_row:
        owner_id = user_row[0]
        workspace_row = bind.execute(
            sa.text(
                "INSERT INTO workspaces (name, owner_id) VALUES (:name, :owner_id) RETURNING id, name"
            ),
            {"name": "Sample Workspace", "owner_id": owner_id},
        ).fetchone()

        bind.execute(
            sa.text(
                "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (:ws, :user, 'owner')"
            ),
            {"ws": workspace_row[0], "user": owner_id},
        )

        for table in ("projects", "prds", "documents", "roadmaps"):
            bind.execute(
                sa.text(
                    f"UPDATE {table} SET workspace_id = :ws WHERE workspace_id IS NULL"
                ),
                {"ws": workspace_row[0]},
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if "roadmaps" in inspector.get_table_names():
        cols = {c["name"] for c in inspector.get_columns("roadmaps")}
        if "workspace_id" in cols:
            op.drop_column("roadmaps", "workspace_id")

    if "documents" in inspector.get_table_names():
        cols = {c["name"] for c in inspector.get_columns("documents")}
        if "workspace_id" in cols:
            op.drop_column("documents", "workspace_id")

    if "prds" in inspector.get_table_names():
        cols = {c["name"] for c in inspector.get_columns("prds")}
        if "workspace_id" in cols:
            op.drop_column("prds", "workspace_id")

    if "projects" in inspector.get_table_names():
        cols = {c["name"] for c in inspector.get_columns("projects")}
        if "workspace_id" in cols:
            op.drop_column("projects", "workspace_id")

    if inspector.has_table("workspace_members"):
        op.drop_table("workspace_members")
    if inspector.has_table("workspaces"):
        op.drop_table("workspaces")
