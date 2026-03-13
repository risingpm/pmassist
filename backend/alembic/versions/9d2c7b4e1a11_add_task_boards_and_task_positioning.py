"""add task boards and task positioning

Revision ID: 9d2c7b4e1a11
Revises: 1b8c5c2e8d12, b42f3f61e7c0, b9f2a1c4d7e8, c0fd44c4b23d, c8d1ef3a9b7d, f1c5a2a6cf2a
Create Date: 2026-02-27 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "9d2c7b4e1a11"
down_revision = (
    "1b8c5c2e8d12",
    "b42f3f61e7c0",
    "b9f2a1c4d7e8",
    "c0fd44c4b23d",
    "c8d1ef3a9b7d",
    "f1c5a2a6cf2a",
)
branch_labels = None
depends_on = None


def _has_column(inspector, table_name: str, column_name: str) -> bool:
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("task_boards"):
        op.create_table(
            "task_boards",
            sa.Column(
                "id",
                postgresql.UUID(as_uuid=True),
                primary_key=True,
                nullable=False,
                server_default=sa.text("gen_random_uuid()"),
            ),
            sa.Column(
                "workspace_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "project_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("projects.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("title", sa.Text(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column(
                "created_by",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                onupdate=sa.func.now(),
                nullable=False,
            ),
        )

    if inspector.has_table("tasks"):
        if not _has_column(inspector, "tasks", "task_board_id"):
            op.add_column(
                "tasks",
                sa.Column(
                    "task_board_id",
                    postgresql.UUID(as_uuid=True),
                    sa.ForeignKey("task_boards.id", ondelete="SET NULL"),
                    nullable=True,
                ),
            )
        if not _has_column(inspector, "tasks", "position"):
            op.add_column(
                "tasks",
                sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
            )

    existing_indexes = {idx["name"] for idx in inspector.get_indexes("task_boards")} if inspector.has_table("task_boards") else set()
    if "ix_task_boards_workspace_updated" not in existing_indexes:
        op.create_index(
            "ix_task_boards_workspace_updated",
            "task_boards",
            ["workspace_id", "updated_at"],
            unique=False,
        )

    task_indexes = {idx["name"] for idx in inspector.get_indexes("tasks")} if inspector.has_table("tasks") else set()
    if "ix_tasks_board_status_position" not in task_indexes:
        op.create_index(
            "ix_tasks_board_status_position",
            "tasks",
            ["task_board_id", "status", "position"],
            unique=False,
        )
    if "ix_tasks_workspace_project_status_created" not in task_indexes:
        op.create_index(
            "ix_tasks_workspace_project_status_created",
            "tasks",
            ["workspace_id", "project_id", "status", "created_at"],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("tasks"):
        task_indexes = {idx["name"] for idx in inspector.get_indexes("tasks")}
        if "ix_tasks_workspace_project_status_created" in task_indexes:
            op.drop_index("ix_tasks_workspace_project_status_created", table_name="tasks")
        if "ix_tasks_board_status_position" in task_indexes:
            op.drop_index("ix_tasks_board_status_position", table_name="tasks")

        columns = {col["name"] for col in inspector.get_columns("tasks")}
        if "position" in columns:
            op.drop_column("tasks", "position")
        if "task_board_id" in columns:
            op.drop_column("tasks", "task_board_id")

    if inspector.has_table("task_boards"):
        board_indexes = {idx["name"] for idx in inspector.get_indexes("task_boards")}
        if "ix_task_boards_workspace_updated" in board_indexes:
            op.drop_index("ix_task_boards_workspace_updated", table_name="task_boards")
        op.drop_table("task_boards")
