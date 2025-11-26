from __future__ import annotations

import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend import models, schemas
from backend.ai_providers import get_openai_client
from backend.database import get_db
from backend.dashboard_service import collect_dashboard_metrics
from backend.knowledge_base_service import get_relevant_entries, build_entry_content
from backend.rbac import ensure_membership

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _coerce_status(value: str | None) -> str:
    if not value:
        return "draft"
    normalized = value.lower()
    if normalized in {"draft", "active", "shipped"}:
        return normalized
    return "active"


@router.get("/overview", response_model=schemas.DashboardOverviewResponse)
def get_dashboard_overview(workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    metrics = collect_dashboard_metrics(db, workspace_id)
    return schemas.DashboardOverviewResponse(**metrics)


def _coach_prompt(metrics: dict[str, Any], kb_entries: list[models.KnowledgeBaseEntry]) -> str:
    prd_lines = "\n".join(
        f"- {item.title} (status: {item.status}, updated {item.updated_at.strftime('%Y-%m-%d')})"
        for item in metrics["prds"]
    ) or "No active PRDs."

    context_snippets = []
    for entry in kb_entries:
        snippet = build_entry_content(entry, clip=200) or entry.content or ""
        context_snippets.append(f"{entry.title} [{entry.type}]: {snippet}")
    context_block = "\n".join(context_snippets) or "No additional knowledge-base context."

    roadmap = metrics["roadmap"]
    tasks = metrics["tasks"]
    sprint = metrics["sprint"]

    return (
        "You are an AI product operations coach. Analyze the workspace metrics and provide one paragraph summary "
        "plus 3 concise recommendations in JSON format like "
        '{"message": "...", "suggestions": ["..."], "confidence": 0.0}. '
        "Current workspace data:\n"
        f"Active PRDs:\n{prd_lines}\n\n"
        f"Roadmap: current phase={roadmap.current_phase}, completion={roadmap.completion_percent}% "
        f"(done {roadmap.done_tasks}/{roadmap.total_tasks}).\n"
        f"Tasks: total={tasks.total}, todo={tasks.todo}, in_progress={tasks.in_progress}, done={tasks.done}.\n"
        f"Sprint: velocity={sprint.velocity} tasks/day, completed last 7 days={sprint.completed_last_7_days}, "
        f"trend={sprint.velocity_trend}.\n"
        f"Context:\n{context_block}"
    )


@router.post("/coach", response_model=schemas.DashboardCoachResponse)
def get_dashboard_coach(payload: schemas.DashboardCoachRequest, db: Session = Depends(get_db)):
    ensure_membership(db, payload.workspace_id, payload.user_id, required_role="viewer")
    metrics = collect_dashboard_metrics(db, payload.workspace_id)
    kb_entries = get_relevant_entries(db, payload.workspace_id, "roadmap status", top_n=3)
    prompt = _coach_prompt(metrics, kb_entries)

    try:
        client = get_openai_client(db, payload.workspace_id)
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.2,
            messages=[
                {"role": "system", "content": "Respond with JSON."},
                {"role": "user", "content": prompt},
            ],
        )
        content = completion.choices[0].message.content or ""
        data = json.loads(content)
        message = data.get("message") or "Unable to generate insight."
        suggestions = data.get("suggestions") or []
        if not isinstance(suggestions, list):
            suggestions = [str(suggestions)]
        confidence = float(data.get("confidence") or 0.65)
    except Exception:
        message = "Roadmap execution looks steady, but continue monitoring sprint completion risk."
        suggestions = [
            "Review tasks that are still in progress to unblock dependencies.",
            "Confirm roadmap phase goals with the team.",
            "Capture learnings in the latest PRDs to keep context fresh.",
        ]
        confidence = 0.5

    return schemas.DashboardCoachResponse(
        message=message,
        suggestions=[str(item) for item in suggestions if str(item).strip()],
        confidence=confidence,
    )
