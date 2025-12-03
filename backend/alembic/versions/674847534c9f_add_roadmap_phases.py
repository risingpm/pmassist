"""add roadmap phases

Revision ID: 674847534c9f
Revises: e7c3a79666c4
Create Date: 2025-12-02 17:09:00.026255

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '674847534c9f'
down_revision = 'e7c3a79666c4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "roadmap_phases",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(), nullable=False, server_default="planned"),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index("ix_roadmap_phases_project", "roadmap_phases", ["project_id", "order_index"])
    op.create_index("ix_roadmap_phases_workspace", "roadmap_phases", ["workspace_id"])

    op.create_table(
        "roadmap_milestones",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("phase_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("roadmap_phases.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="planned"),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ai_summary", sa.Text(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index("ix_roadmap_milestones_phase", "roadmap_milestones", ["phase_id", "order_index"])
    op.create_index("ix_roadmap_milestones_project", "roadmap_milestones", ["project_id"])

    op.create_table(
        "roadmap_milestone_tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("milestone_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("roadmap_milestones.id", ondelete="CASCADE"), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("linked_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("linked_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_roadmap_milestone_tasks_milestone", "roadmap_milestone_tasks", ["milestone_id"])
    op.create_index("ix_roadmap_milestone_tasks_task", "roadmap_milestone_tasks", ["task_id"])
    op.create_unique_constraint(
        "uq_milestone_task_pair", "roadmap_milestone_tasks", ["milestone_id", "task_id"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_milestone_task_pair", "roadmap_milestone_tasks", type_="unique")
    op.drop_index("ix_roadmap_milestone_tasks_task", table_name="roadmap_milestone_tasks")
    op.drop_index("ix_roadmap_milestone_tasks_milestone", table_name="roadmap_milestone_tasks")
    op.drop_table("roadmap_milestone_tasks")

    op.drop_index("ix_roadmap_milestones_project", table_name="roadmap_milestones")
    op.drop_index("ix_roadmap_milestones_phase", table_name="roadmap_milestones")
    op.drop_table("roadmap_milestones")

    op.drop_index("ix_roadmap_phases_workspace", table_name="roadmap_phases")
    op.drop_index("ix_roadmap_phases_project", table_name="roadmap_phases")
    op.drop_table("roadmap_phases")
