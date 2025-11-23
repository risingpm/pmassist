"""add kb entry embedding column

Revision ID: 34f7ce3a07b1
Revises: f8e8de4c0bc7
Create Date: 2025-02-14 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

from backend.models import Vector

# revision identifiers, used by Alembic.
revision = "34f7ce3a07b1"
down_revision = "f8e8de4c0bc7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("kb_entries")}

    if "embedding" not in columns:
        op.add_column("kb_entries", sa.Column("embedding", Vector()))

    if "tags" in columns:
        bind.execute(
            text(
                "UPDATE kb_entries "
                "SET tags = ARRAY("
                "    SELECT lower(tag_value) FROM unnest(tags) AS tag_value"
                ") "
                "WHERE tags IS NOT NULL"
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("kb_entries")}
    if "embedding" in columns:
        op.drop_column("kb_entries", "embedding")
