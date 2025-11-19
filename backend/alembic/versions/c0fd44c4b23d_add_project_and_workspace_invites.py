"""Add project members and workspace invitations

Revision ID: c0fd44c4b23d
Revises: 7f3c8a2e9bb1
Create Date: 2025-03-09 00:00:00

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "c0fd44c4b23d"
down_revision = "7f3c8a2e9bb1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if not inspector.has_table("workspace_invitations"):
        op.create_table(
            "workspace_invitations",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
            sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
            sa.Column("email", sa.Text(), nullable=False),
            sa.Column("role", sa.Text(), nullable=False, server_default="viewer"),
            sa.Column("token", sa.Text(), nullable=False, unique=True),
            sa.Column("invited_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_workspace_invitations_workspace_email", "workspace_invitations", ["workspace_id", "email"], unique=True)
    else:
        existing_indexes = {idx["name"] for idx in inspector.get_indexes("workspace_invitations")}
        if "ix_workspace_invitations_workspace_email" not in existing_indexes:
            op.create_index("ix_workspace_invitations_workspace_email", "workspace_invitations", ["workspace_id", "email"], unique=True)

    if not inspector.has_table("project_members"):
        op.create_table(
            "project_members",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
            sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("role", sa.Text(), nullable=False, server_default="viewer"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_project_members_project_user", "project_members", ["project_id", "user_id"], unique=True)
    else:
        existing_indexes = {idx["name"] for idx in inspector.get_indexes("project_members")}
        if "ix_project_members_project_user" not in existing_indexes:
            op.create_index("ix_project_members_project_user", "project_members", ["project_id", "user_id"], unique=True)

    if "workspace_members" in inspector.get_table_names():
        op.execute("UPDATE workspace_members SET role = 'admin' WHERE role = 'owner'")
        op.alter_column("workspace_members", "role", server_default="admin")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if "workspace_members" in inspector.get_table_names():
        op.alter_column("workspace_members", "role", server_default="owner")

    if inspector.has_table("project_members"):
        op.drop_index("ix_project_members_project_user", table_name="project_members")
        op.drop_table("project_members")

    if inspector.has_table("workspace_invitations"):
        op.drop_index("ix_workspace_invitations_workspace_email", table_name="workspace_invitations")
        op.drop_table("workspace_invitations")
