"""add token accounting tables

Revision ID: c3f9e1a4b7d2
Revises: a7e3c2d1f9ab
Create Date: 2026-03-17 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "c3f9e1a4b7d2"
down_revision = "a7e3c2d1f9ab"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workspace_token_accounts",
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("allocated_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("consumed_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("remaining_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_refilled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("workspace_id"),
    )

    op.create_table(
        "user_token_accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("allocated_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("consumed_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("remaining_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", "user_id", name="uq_user_token_accounts_workspace_user"),
    )
    op.create_index("ix_user_token_accounts_workspace", "user_token_accounts", ["workspace_id"])
    op.create_index("ix_user_token_accounts_user", "user_token_accounts", ["user_id"])

    op.create_table(
        "token_usage_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("feature", sa.String(), nullable=False),
        sa.Column("provider", sa.String(), nullable=False, server_default="openai"),
        sa.Column("model", sa.String(), nullable=True),
        sa.Column("prompt_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completion_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("deducted_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cost_units", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("request_id", sa.String(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_token_usage_events_workspace", "token_usage_events", ["workspace_id", "created_at"])
    op.create_index("ix_token_usage_events_user", "token_usage_events", ["user_id", "created_at"])
    op.create_index("ix_token_usage_events_feature", "token_usage_events", ["feature", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_token_usage_events_feature", table_name="token_usage_events")
    op.drop_index("ix_token_usage_events_user", table_name="token_usage_events")
    op.drop_index("ix_token_usage_events_workspace", table_name="token_usage_events")
    op.drop_table("token_usage_events")

    op.drop_index("ix_user_token_accounts_user", table_name="user_token_accounts")
    op.drop_index("ix_user_token_accounts_workspace", table_name="user_token_accounts")
    op.drop_table("user_token_accounts")

    op.drop_table("workspace_token_accounts")
