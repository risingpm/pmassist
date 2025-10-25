"""Create users table

Revision ID: 5b57d4d1f7f3
Revises: beb8f1ef1d0c
Create Date: 2025-03-01 12:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "5b57d4d1f7f3"
down_revision = "beb8f1ef1d0c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')

    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("users"):
        op.create_table(
            "users",
            sa.Column(
                "id",
                postgresql.UUID(as_uuid=True),
                primary_key=True,
                nullable=False,
                server_default=sa.text("gen_random_uuid()"),
            ),
            sa.Column("email", sa.Text(), nullable=True, unique=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("users"):
        column_names = {column["name"] for column in inspector.get_columns("users")}
        expected = {"id", "email", "created_at"}
        if column_names.issubset(expected):
            op.drop_table("users")
