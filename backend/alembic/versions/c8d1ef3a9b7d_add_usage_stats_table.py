"""add usage stats table

Revision ID: c8d1ef3a9b7d
Revises: fe3f9b7e5c2a
Create Date: 2025-02-15 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "c8d1ef3a9b7d"
down_revision = "fe3f9b7e5c2a"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "workspace_usage_stats",
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("daily_used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("daily_limit", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("weekly_used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("weekly_limit", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("monthly_used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("monthly_limit", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_reset_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_reset_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("plan_tier", sa.String(), nullable=False, server_default="Starter"),
        sa.Column("plan_recommendation", sa.String(), nullable=True),
        sa.Column("personal_usage_percent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "breakdown_rows",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "history_rows",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "member_shares",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "highlights",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("timezone('utc', now())"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("timezone('utc', now())"),
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("workspace_id"),
    )


def downgrade():
    op.drop_table("workspace_usage_stats")
