"""add tenant ai credentials table

Revision ID: 9b7b8c00604c
Revises: 8f6b6dcbf2a1
Create Date: 2025-02-14 19:02:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "9b7b8c00604c"
down_revision = "8f6b6dcbf2a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("tenant_ai_credentials"):
        op.create_table(
            "tenant_ai_credentials",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("provider", sa.String(), nullable=False, server_default="openai"),
            sa.Column("api_key_encrypted", sa.Text(), nullable=False),
            sa.Column("organization", sa.String(), nullable=True),
            sa.Column("project", sa.String(), nullable=True),
            sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )
    existing_constraints = {constraint["name"] for constraint in inspector.get_unique_constraints("tenant_ai_credentials")}
    if "uq_tenant_ai_credentials_provider" not in existing_constraints:
        op.create_unique_constraint("uq_tenant_ai_credentials_provider", "tenant_ai_credentials", ["provider"])


def downgrade() -> None:
    op.drop_constraint("uq_tenant_ai_credentials_provider", "tenant_ai_credentials", type_="unique")
    op.drop_table("tenant_ai_credentials")
