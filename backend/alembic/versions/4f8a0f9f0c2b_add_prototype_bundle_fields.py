"""Add prototype bundle fields

Revision ID: 4f8a0f9f0c2b
Revises: 1c5c1dc1d6a3
Create Date: 2025-03-06 14:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "4f8a0f9f0c2b"
down_revision = "1c5c1dc1d6a3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    columns = {col["name"] for col in inspector.get_columns("prototypes")}
    if "bundle_path" not in columns:
        op.add_column("prototypes", sa.Column("bundle_path", sa.Text(), nullable=True))
    if "bundle_url" not in columns:
        op.add_column("prototypes", sa.Column("bundle_url", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    columns = {col["name"] for col in inspector.get_columns("prototypes")}
    if "bundle_url" in columns:
        op.drop_column("prototypes", "bundle_url")
    if "bundle_path" in columns:
        op.drop_column("prototypes", "bundle_path")
