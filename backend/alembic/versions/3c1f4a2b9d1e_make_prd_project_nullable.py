"""Make PRD project_id nullable.

Revision ID: 3c1f4a2b9d1e
Revises: 72b43249cd1b, aa1f4e0d3c2b
Create Date: 2025-02-20 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "3c1f4a2b9d1e"
down_revision = ("72b43249cd1b", "aa1f4e0d3c2b")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("prds_project_id_fkey", "prds", type_="foreignkey")
    op.alter_column(
        "prds",
        "project_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
    )
    op.create_foreign_key(
        "prds_project_id_fkey",
        "prds",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("prds_project_id_fkey", "prds", type_="foreignkey")
    op.alter_column(
        "prds",
        "project_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )
    op.create_foreign_key(
        "prds_project_id_fkey",
        "prds",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="CASCADE",
    )
