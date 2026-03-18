from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy.orm import Session

from backend import models

UTC = timezone.utc
DEFAULT_TRIAL_TOKENS = 100_000
DEFAULT_PRO_TOKENS = 1_000_000
DEFAULT_TEAM_TOKENS = 2_000_000


def _now() -> datetime:
    return datetime.now(tz=UTC)


def _plan_allowance(plan: str | None) -> int:
    normalized = (plan or "trial").lower()
    if normalized == "team":
        return DEFAULT_TEAM_TOKENS
    if normalized == "pro":
        return DEFAULT_PRO_TOKENS
    return DEFAULT_TRIAL_TOKENS


def _resolve_effective_user_id(db: Session, workspace: models.Workspace, user_id: UUID | None) -> UUID | None:
    if user_id:
        return user_id
    if workspace.owner_id:
        return workspace.owner_id
    membership = (
        db.query(models.WorkspaceMember)
        .filter(models.WorkspaceMember.workspace_id == workspace.id)
        .order_by(models.WorkspaceMember.joined_at.asc())
        .first()
    )
    return membership.user_id if membership else None


def _parse_usage_counts(usage: Any) -> tuple[int, int, int]:
    if usage is None:
        return 0, 0, 0
    if isinstance(usage, dict):
        prompt = int(usage.get("prompt_tokens") or 0)
        completion = int(usage.get("completion_tokens") or 0)
        total = int(usage.get("total_tokens") or 0)
    else:
        prompt = int(getattr(usage, "prompt_tokens", 0) or 0)
        completion = int(getattr(usage, "completion_tokens", 0) or 0)
        total = int(getattr(usage, "total_tokens", 0) or 0)
    if total <= 0:
        total = max(0, prompt + completion)
    return prompt, completion, total


def ensure_workspace_token_account(db: Session, workspace_id: UUID) -> models.WorkspaceTokenAccount:
    workspace = db.query(models.Workspace).filter(models.Workspace.id == workspace_id).first()
    if not workspace:
        raise ValueError("Workspace not found")

    account = (
        db.query(models.WorkspaceTokenAccount)
        .filter(models.WorkspaceTokenAccount.workspace_id == workspace_id)
        .with_for_update()
        .first()
    )
    target_allowance = _plan_allowance(workspace.billing_plan)
    now = _now()

    if account is None:
        account = models.WorkspaceTokenAccount(
            workspace_id=workspace_id,
            allocated_tokens=target_allowance,
            consumed_tokens=0,
            remaining_tokens=target_allowance,
            last_refilled_at=now,
        )
        db.add(account)
        db.flush()
        return account

    # Keep allowance in sync when plan changes.
    if account.allocated_tokens != target_allowance:
        delta = target_allowance - account.allocated_tokens
        account.allocated_tokens = target_allowance
        account.remaining_tokens = max(0, account.remaining_tokens + delta)
        if delta > 0:
            account.last_refilled_at = now
        db.add(account)
        db.flush()
    return account


def ensure_user_token_account(
    db: Session,
    workspace_id: UUID,
    *,
    user_id: UUID | None,
) -> models.UserTokenAccount | None:
    workspace = db.query(models.Workspace).filter(models.Workspace.id == workspace_id).first()
    if not workspace:
        raise ValueError("Workspace not found")
    effective_user_id = _resolve_effective_user_id(db, workspace, user_id)
    if not effective_user_id:
        return None

    workspace_account = ensure_workspace_token_account(db, workspace_id)
    account = (
        db.query(models.UserTokenAccount)
        .filter(
            models.UserTokenAccount.workspace_id == workspace_id,
            models.UserTokenAccount.user_id == effective_user_id,
        )
        .with_for_update()
        .first()
    )
    if account is None:
        account = models.UserTokenAccount(
            workspace_id=workspace_id,
            user_id=effective_user_id,
            allocated_tokens=workspace_account.allocated_tokens,
            consumed_tokens=0,
            remaining_tokens=workspace_account.remaining_tokens,
        )
        db.add(account)
        db.flush()
        return account

    if account.allocated_tokens != workspace_account.allocated_tokens:
        account.allocated_tokens = workspace_account.allocated_tokens
        account.remaining_tokens = min(account.remaining_tokens, workspace_account.remaining_tokens)
        db.add(account)
        db.flush()
    return account


def top_up_tokens(
    db: Session,
    *,
    workspace_id: UUID,
    user_id: UUID | None,
    tokens_to_add: int,
    reason: str = "manual_topup",
) -> dict[str, int]:
    add_count = max(0, int(tokens_to_add))
    if add_count <= 0:
        return {"workspace_remaining": 0, "user_remaining": 0}

    workspace_account = ensure_workspace_token_account(db, workspace_id)
    user_account = ensure_user_token_account(db, workspace_id, user_id=user_id)

    workspace_account.allocated_tokens += add_count
    workspace_account.remaining_tokens += add_count
    workspace_account.last_refilled_at = _now()
    db.add(workspace_account)

    if user_account:
        user_account.allocated_tokens += add_count
        user_account.remaining_tokens += add_count
        db.add(user_account)

    event = models.TokenUsageEvent(
        id=uuid4(),
        workspace_id=workspace_id,
        user_id=user_account.user_id if user_account else None,
        feature="billing.topup",
        provider="internal",
        model=None,
        prompt_tokens=0,
        completion_tokens=0,
        total_tokens=0,
        deducted_tokens=0,
        cost_units=0,
        request_id=None,
        event_metadata={"reason": reason, "tokens_added": add_count},
    )
    db.add(event)
    db.commit()
    return {
        "workspace_remaining": workspace_account.remaining_tokens,
        "user_remaining": user_account.remaining_tokens if user_account else workspace_account.remaining_tokens,
    }


def record_openai_usage(
    db: Session,
    *,
    workspace_id: UUID,
    user_id: UUID | None,
    feature: str,
    model: str | None,
    usage: Any,
    request_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> models.TokenUsageEvent:
    prompt_tokens, completion_tokens, total_tokens = _parse_usage_counts(usage)
    cost_units = max(0, (total_tokens + 999) // 1000)

    workspace_account = ensure_workspace_token_account(db, workspace_id)
    user_account = ensure_user_token_account(db, workspace_id, user_id=user_id)
    effective_user_id = user_account.user_id if user_account else None

    # Never go negative; when exhausted we still track actual model usage in total_tokens,
    # but deducted_tokens reflects what could be applied to account balance.
    deductible = min(max(0, total_tokens), max(0, workspace_account.remaining_tokens))
    workspace_account.consumed_tokens += deductible
    workspace_account.remaining_tokens = max(0, workspace_account.remaining_tokens - deductible)
    db.add(workspace_account)

    if user_account:
        user_deductible = min(deductible, max(0, user_account.remaining_tokens))
        user_account.consumed_tokens += user_deductible
        user_account.remaining_tokens = max(0, user_account.remaining_tokens - user_deductible)
        db.add(user_account)

    event = models.TokenUsageEvent(
        id=uuid4(),
        workspace_id=workspace_id,
        user_id=effective_user_id,
        feature=feature,
        provider="openai",
        model=model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        deducted_tokens=deductible,
        cost_units=cost_units,
        request_id=request_id,
        event_metadata=metadata or {},
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event
