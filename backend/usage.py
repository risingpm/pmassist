from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import Workspace, WorkspaceUsageStats, User
from backend.rbac import ensure_membership

router = APIRouter(prefix="/usage", tags=["usage"])

UTC = timezone.utc

WINDOW_METADATA = {
    "daily": {
        "label": "Daily focus",
        "reset": "Resets every midnight • UTC",
        "coverage": "Quick chats & idea refinements",
    },
    "weekly": {
        "label": "Weekly sprint",
        "reset": "Resets every Monday • 12:00 AM UTC",
        "coverage": "Chats, PRD drafts, roadmap runs",
    },
    "monthly": {
        "label": "Monthly runway",
        "reset": "Renews the first of each month",
        "coverage": "Workspace limit across all agents",
    },
}

DEFAULT_BREAKDOWN_ROWS = [
    {"feature": "AI Chat", "requests": 142, "credits": 71, "last_used": "Dec 5, 2025", "type": "chat"},
    {"feature": "PRD Generator", "requests": 12, "credits": 36, "last_used": "Dec 4, 2025", "type": "generation"},
    {"feature": "Roadmap Generator", "requests": 8, "credits": 24, "last_used": "Dec 4, 2025", "type": "generation"},
    {"feature": "Custom Agents", "requests": 3, "credits": 12, "last_used": "Dec 5, 2025", "type": "tasks"},
    {"feature": "Research Tasks", "requests": 6, "credits": 18, "last_used": "Dec 3, 2025", "type": "tasks"},
]

DEFAULT_HISTORY_ROWS = [
    {
        "id": "history-week",
        "period": "Dec 1 – Dec 7",
        "usage": "520 credits",
        "change": "+30% vs last week",
        "change_tone": "up",
        "insight": "You created 3 PRDs and 5 roadmaps",
    },
    {
        "id": "history-prev",
        "period": "Nov 24 – Nov 30",
        "usage": "400 credits",
        "change": "+12% vs avg",
        "change_tone": "neutral",
        "insight": "2 PRDs • 12 chats • 2 custom agent runs",
    },
    {
        "id": "history-month",
        "period": "November total",
        "usage": "1,800 credits",
        "change": "High ROI Sprint",
        "change_tone": "badge",
        "insight": "30% more activity than October",
    },
]

DEFAULT_MEMBER_SHARE = [
    {"name": "Karan", "percent": 42, "avatar_color": "bg-indigo-500"},
    {"name": "Aisha", "percent": 38, "avatar_color": "bg-emerald-500"},
    {"name": "Raj", "percent": 20, "avatar_color": "bg-amber-500"},
]

DEFAULT_HIGHLIGHTS = [
    {"label": "PRDs drafted", "value": "4"},
    {"label": "Roadmaps refined", "value": "3"},
    {"label": "Custom automations", "value": "2"},
]

MOTIVATION_MESSAGES = [
    {"id": "empty", "title": "Plenty of runway", "subtitle": "Start a new brainstorm or spin up a custom agent.", "tone": "positive"},
    {"id": "out", "title": "You’ve maxed your creativity! 🔋", "subtitle": "Add credits or upgrade to refill instantly.", "tone": "critical"},
]

PLAN_COMPARISONS = [
    {"id": "starter", "name": "Starter", "limit": "1,000 / month", "credits": "100 bonus", "price": "$10", "highlight": False},
    {"id": "pro", "name": "Pro", "limit": "5,000 / month", "credits": "500 bonus", "price": "$25", "highlight": True},
    {"id": "enterprise", "name": "Enterprise", "limit": "Unlimited", "credits": "Custom", "price": "Let’s talk", "highlight": False},
]

CREDIT_PACKAGES = {
    "starter-100": {"id": "starter-100", "label": "100 credits", "credits": 100, "price": 5, "bonus": "+10% bonus"},
    "growth-500": {"id": "growth-500", "label": "500 credits", "credits": 500, "price": 20, "bonus": "Most popular"},
    "scale-1000": {"id": "scale-1000", "label": "1000 credits", "credits": 1000, "price": 35, "bonus": "Best value"},
}

ALERT_MESSAGES = [
    {"id": "80", "message": "Heads up 👋 You’ve used 80% of your weekly limit.", "tone": "warning"},
    {"id": "100", "message": "Limit reached. Add credits or wait until reset.", "tone": "critical"},
]


def _now() -> datetime:
    return datetime.now(tz=UTC)


def _resolve_workspace(db: Session, workspace_id: UUID | None) -> Workspace:
    if workspace_id:
        workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
        if not workspace:
            raise HTTPException(status_code=404, detail="Workspace not found")
        return workspace

    workspace = db.query(Workspace).order_by(Workspace.created_at.asc()).first()
    if workspace:
        return workspace

    owner = db.query(User).order_by(User.created_at.asc()).first()
    if not owner:
        owner = User(email="usage-demo@pmassist.local")
        db.add(owner)
        db.flush()
    workspace = Workspace(name="Usage Demo Workspace", owner_id=owner.id)
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    return workspace


def _ensure_usage_stats(db: Session, workspace: Workspace) -> WorkspaceUsageStats:
    stats = (
        db.query(WorkspaceUsageStats)
        .filter(WorkspaceUsageStats.workspace_id == workspace.id)
        .first()
    )
    if stats:
        return stats

    stats = WorkspaceUsageStats(
        workspace_id=workspace.id,
        daily_used=18,
        daily_limit=25,
        weekly_used=420,
        weekly_limit=500,
        monthly_used=1200,
        monthly_limit=2000,
        last_reset_at=_now() - timedelta(days=2),
        next_reset_at=_now() + timedelta(days=5),
        plan_tier="Starter",
        plan_recommendation="Based on the last 7 days, Pro plan fits you best.",
        personal_usage_percent=42,
        breakdown_rows=DEFAULT_BREAKDOWN_ROWS,
        history_rows=DEFAULT_HISTORY_ROWS,
        member_shares=DEFAULT_MEMBER_SHARE,
        highlights=DEFAULT_HIGHLIGHTS,
    )
    db.add(stats)
    db.commit()
    db.refresh(stats)
    return stats


def _build_alerts(usage_percent: int) -> list[dict[str, str]]:
    if usage_percent < 80:
        return []
    alerts: list[dict[str, str]] = []
    for alert in ALERT_MESSAGES:
        if usage_percent >= int(alert["id"]):
            alerts.append(alert)
    return alerts


def _serialize_dashboard(stats: WorkspaceUsageStats) -> dict:
    remaining = max(0, stats.weekly_limit - stats.weekly_used)
    usage_percent = min(100, round((stats.weekly_used / stats.weekly_limit) * 100)) if stats.weekly_limit else 0
    windows = []
    for key in ("daily", "weekly", "monthly"):
        meta = WINDOW_METADATA[key]
        used_value = getattr(stats, f"{key}_used")
        limit_value = getattr(stats, f"{key}_limit")
        windows.append(
            {
                "id": key,
                "label": meta["label"],
                "used": used_value,
                "total": limit_value,
                "reset": meta["reset"],
                "coverage": meta["coverage"],
            },
        )

    alerts = _build_alerts(usage_percent)
    return {
        "summary": {
            "plan_tier": stats.plan_tier,
            "weekly_limit": stats.weekly_limit,
            "weekly_used": stats.weekly_used,
            "credits_remaining": remaining,
            "last_reset": stats.last_reset_at.isoformat() if stats.last_reset_at else None,
            "window_label": "Weekly",
            "reset_label": "Resets every Monday 12 AM UTC",
            "recommendation_copy": stats.plan_recommendation or "Based on the last 7 days, Pro plan fits you best.",
            "personal_usage_percent": stats.personal_usage_percent,
        },
        "windows": windows,
        "motivation_messages": MOTIVATION_MESSAGES,
        "breakdown": stats.breakdown_rows or [],
        "history": stats.history_rows or [],
        "workspace_members": stats.member_shares or [],
        "personal_highlights": stats.highlights or [],
        "plan_comparisons": PLAN_COMPARISONS,
        "credit_packages": list(CREDIT_PACKAGES.values()),
        "alert_cards": alerts,
        "toast_alerts": alerts,
    }


@router.get("/dashboard")
def get_usage_dashboard(
    workspace_id: UUID | None = None,
    user_id: UUID | None = None,
    db: Session = Depends(get_db),
):
    workspace = _resolve_workspace(db, workspace_id)
    if user_id:
        ensure_membership(db, workspace.id, user_id, required_role="viewer")
    stats = _ensure_usage_stats(db, workspace)
    return _serialize_dashboard(stats)

class CreditPurchaseRequest(BaseModel):
    workspace_id: UUID | None = None
    user_id: UUID | None = None
    package_id: str


@router.post("/credits")
def purchase_credits(payload: CreditPurchaseRequest, db: Session = Depends(get_db)):
    workspace = _resolve_workspace(db, payload.workspace_id)
    if payload.user_id:
        ensure_membership(db, workspace.id, payload.user_id, required_role="viewer")
    stats = _ensure_usage_stats(db, workspace)
    package = CREDIT_PACKAGES.get(payload.package_id)
    if not package:
        raise HTTPException(status_code=400, detail="Unknown credit package.")
    stats.weekly_used = max(0, stats.weekly_used - package["credits"])
    stats.daily_used = max(0, stats.daily_used - max(1, package["credits"] // 10))
    stats.monthly_used = max(0, stats.monthly_used - package["credits"])
    stats.updated_at = _now()
    db.add(stats)
    db.commit()
    db.refresh(stats)
    response = _serialize_dashboard(stats)
    response["purchase_message"] = f"{package['credits']} credits added instantly."
    return response
