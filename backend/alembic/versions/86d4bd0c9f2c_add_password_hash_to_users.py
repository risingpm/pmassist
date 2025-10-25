"""Add password_hash to users

Revision ID: 86d4bd0c9f2c
Revises: 2f3b1d9f27d3
Create Date: 2025-03-02 00:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
import os
import base64
import hashlib

# revision identifiers, used by Alembic.
revision = "86d4bd0c9f2c"
down_revision = "2f3b1d9f27d3"
branch_labels = None
depends_on = None


def _placeholder_hash() -> str:
    salt = os.urandom(16)
    placeholder_password = os.urandom(16)
    derived = hashlib.pbkdf2_hmac("sha256", placeholder_password, salt, 100_000)
    return base64.b64encode(salt + derived).decode()


def upgrade() -> None:
    op.add_column("users", sa.Column("password_hash", sa.Text(), nullable=True))

    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("users"):
        placeholder = _placeholder_hash()
        bind.execute(
            sa.text("UPDATE users SET password_hash = :hash WHERE password_hash IS NULL"),
            {"hash": placeholder},
        )

    op.alter_column("users", "password_hash", nullable=False)


def downgrade() -> None:
    inspector = inspect(op.get_bind())
    if inspector.has_table("users"):
        columns = {col["name"] for col in inspector.get_columns("users")}
        if "password_hash" in columns:
            op.drop_column("users", "password_hash")
