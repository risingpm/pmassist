"""Add target personas to projects

Revision ID: ccc7eb0f9c2b
Revises: bbb9e3c1f4ce
Create Date: 2025-03-05 12:30:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "ccc7eb0f9c2b"
down_revision = "bbb9e3c1f4ce"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("target_personas", postgresql.ARRAY(sa.String()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("projects", "target_personas")
