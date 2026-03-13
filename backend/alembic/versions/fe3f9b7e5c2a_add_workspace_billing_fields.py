"""add workspace billing fields

Revision ID: fe3f9b7e5c2a
Revises: d5c3d9c9f8a1
Create Date: 2025-02-15 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "fe3f9b7e5c2a"
down_revision = "d5c3d9c9f8a1"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "workspaces",
        sa.Column("billing_plan", sa.String(), nullable=False, server_default="trial"),
    )
    op.add_column(
        "workspaces",
        sa.Column("billing_status", sa.String(), nullable=False, server_default="inactive"),
    )
    op.add_column(
        "workspaces",
        sa.Column("stripe_customer_id", sa.String(), nullable=True),
    )
    op.add_column(
        "workspaces",
        sa.Column("stripe_subscription_id", sa.String(), nullable=True),
    )


def downgrade():
    op.drop_column("workspaces", "stripe_subscription_id")
    op.drop_column("workspaces", "stripe_customer_id")
    op.drop_column("workspaces", "billing_status")
    op.drop_column("workspaces", "billing_plan")
