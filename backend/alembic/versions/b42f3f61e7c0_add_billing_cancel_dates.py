"""add billing cancel timestamps

Revision ID: b42f3f61e7c0
Revises: fe3f9b7e5c2a
Create Date: 2025-02-15 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "b42f3f61e7c0"
down_revision = "fe3f9b7e5c2a"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("workspaces", sa.Column("billing_cancel_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("workspaces", sa.Column("billing_canceled_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("workspaces", "billing_canceled_at")
    op.drop_column("workspaces", "billing_cancel_at")
