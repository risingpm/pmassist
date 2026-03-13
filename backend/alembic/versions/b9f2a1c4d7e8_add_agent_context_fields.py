"""Add agent context fields.

Revision ID: b9f2a1c4d7e8
Revises: 6f2a1d4c8b7e
Create Date: 2026-01-26 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "b9f2a1c4d7e8"
down_revision = "6f2a1d4c8b7e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ai_agents", sa.Column("capabilities", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("ai_agents", sa.Column("context_config", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("ai_agents", sa.Column("context_tag", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("ai_agents", "context_tag")
    op.drop_column("ai_agents", "context_config")
    op.drop_column("ai_agents", "capabilities")
