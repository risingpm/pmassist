"""add project references to strategy tables

Revision ID: d2f98a7a1c1b
Revises: c5f7e7b21f3a
Create Date: 2025-11-26 19:05:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "d2f98a7a1c1b"
down_revision = "c5f7e7b21f3a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if "strategic_pillars" in inspector.get_table_names():
        op.add_column(
            "strategic_pillars",
            sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=True),
        )
        op.create_index("ix_strategic_pillars_project", "strategic_pillars", ["project_id", "generated_at"])

    if "strategic_insights" in inspector.get_table_names():
        op.add_column(
            "strategic_insights",
            sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=True),
        )
        op.create_index("ix_strategic_insights_project", "strategic_insights", ["project_id", "generated_at"])

    if "strategic_snapshots" in inspector.get_table_names():
        constraints = inspector.get_unique_constraints("strategic_snapshots")
        for constraint in constraints:
            if constraint.get("column_names") == ["workspace_id"]:
                op.drop_constraint(constraint["name"], "strategic_snapshots", type_="unique")
        op.add_column(
            "strategic_snapshots",
            sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=True),
        )
        op.create_unique_constraint("uq_strategic_snapshots_project", "strategic_snapshots", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_strategic_snapshots_workspace", table_name="strategic_snapshots")
    op.drop_constraint("uq_strategic_snapshots_project", "strategic_snapshots", type_="unique")
    op.drop_column("strategic_snapshots", "project_id")

    op.drop_index("ix_strategic_insights_project", table_name="strategic_insights")
    op.drop_column("strategic_insights", "project_id")

    op.drop_index("ix_strategic_pillars_project", table_name="strategic_pillars")
    op.drop_column("strategic_pillars", "project_id")
