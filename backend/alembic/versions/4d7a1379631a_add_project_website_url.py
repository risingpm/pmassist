"""add_project_website_url

Revision ID: 4d7a1379631a
Revises: b42f3f61e7c0
Create Date: 2025-12-05 18:38:39.886977

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '4d7a1379631a'
down_revision = 'b42f3f61e7c0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('website_url', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('projects', 'website_url')
