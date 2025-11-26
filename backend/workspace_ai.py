from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend import models, schemas
from backend.ai_providers import get_openai_client
from backend.dashboard_service import collect_dashboard_metrics
from backend.database import get_db
from backend.knowledge_base_service import build_entry_content, get_relevant_entries
from backend.rbac import ensure_membership

router = APIRouter(prefix="/workspace-ai", tags=["workspace-ai"])


def _jsonable(model) -> dict:
    return json.loads(model.model_dump_json())


def _context_from_entries(entries: List[models.KnowledgeBaseEntry]) -> list[schemas.KnowledgeBaseContextItem]:
    items: list[schemas.KnowledgeBaseContextItem] = []
    for entry in entries:
        snippet = build_entry_content(entry, clip=240) or (entry.content or "")[:240]
        snippet = (snippet or "").strip()
        items.append(
            schemas.KnowledgeBaseContextItem(
                id=entry.id,
                title=entry.title,
                type=entry.type,  # type: ignore[arg-type]
                snippet=snippet,
            )
        )
    return items


def _insight_to_schema(record: models.WorkspaceInsight) -> schemas.WorkspaceInsightResponse:
    metrics_payload = record.metrics or {}
    try:
        metrics_model = schemas.DashboardOverviewResponse(**metrics_payload)
    except Exception:
        # fallback to sane defaults if schema mismatch
        metrics_model = schemas.DashboardOverviewResponse(
            prds=[],
            roadmap=schemas.DashboardRoadmapSummary(current_phase=None, completion_percent=0.0, total_tasks=0, done_tasks=0),
            tasks=schemas.DashboardTaskSummary(total=0, todo=0, in_progress=0, done=0),
            sprint=schemas.DashboardSprintSummary(
                velocity=0.0, completed_last_7_days=0, velocity_trend=[], updated_at=datetime.now(timezone.utc)
            ),
            updated_at=datetime.now(timezone.utc),
        )
    rec_payload = record.recommendations or []
    recommendations: list[schemas.WorkspaceRecommendation] = []
    for item in rec_payload:
        if not isinstance(item, dict):
            continue
        recommendations.append(
            schemas.WorkspaceRecommendation(
                title=str(item.get("title") or "Recommendation"),
                description=str(item.get("description") or item.get("detail") or ""),
                severity=item.get("severity"),
                related_entry_id=item.get("related_entry_id"),
                related_entry_title=item.get("related_entry_title"),
            )
        )
    ctx_payload = record.context_entries or []
    context_entries: list[schemas.KnowledgeBaseContextItem] = []
    for ctx in ctx_payload:
        try:
            context_entries.append(schemas.KnowledgeBaseContextItem(**ctx))
        except Exception:
            continue

    return schemas.WorkspaceInsightResponse(
        id=record.id,
        workspace_id=record.workspace_id,
        summary=record.summary,
        recommendations=recommendations,
        confidence=record.confidence,
        metrics=metrics_model,
        context_entries=context_entries,
        generated_at=record.generated_at,
    )


def _generate_and_store_insight(db: Session, workspace_id: UUID, user_id: UUID) -> models.WorkspaceInsight:
    metrics = collect_dashboard_metrics(db, workspace_id)
    kb_entries = get_relevant_entries(db, workspace_id, "workspace roadmap health", top_n=4)
    context_items = _context_from_entries(kb_entries)

    prd_lines = "\n".join(
        f"- {item.title} (status: {item.status}, updated {item.updated_at.strftime('%Y-%m-%d')})"
        for item in metrics["prds"]
    ) or "No active PRDs tracked."
    tasks = metrics["tasks"]
    roadmap = metrics["roadmap"]
    sprint = metrics["sprint"]
    context_block = (
        "\n".join(f"{item.title} [{item.type}]: {item.snippet}" for item in context_items) or "No knowledge base entries supplied."
    )

    prompt = (
        "Act as an embedded AI product coach. Study the workspace metrics and knowledge context, then respond in strict JSON:\n"
        '{"summary":"...", "recommendations":[{"title":"","description":"","severity":"info|opportunity|warning|risk","related_entry_title":""}], "confidence":0.0}. '
        "Prioritize actionable, specific insights with references to context when possible.\n"
        f"Active PRDs:\n{prd_lines}\n\n"
        f"Roadmap: phase={roadmap.current_phase}, completion={roadmap.completion_percent}%, done={roadmap.done_tasks}/{roadmap.total_tasks}.\n"
        f"Tasks: total={tasks.total}, todo={tasks.todo}, in_progress={tasks.in_progress}, done={tasks.done}.\n"
        f"Sprint velocity={sprint.velocity} tasks/day, completed last 7 days={sprint.completed_last_7_days}, trend={sprint.velocity_trend}.\n"
        f"Knowledge context:\n{context_block}\n"
    )

    summary = "Roadmap execution looks steady, keep prioritizing highest-impact work."
    recs: list[dict] = [
        {
            "title": "Review in-progress tasks",
            "description": "Clarify owners for work that has been in progress for more than a week.",
            "severity": "info",
        }
    ]
    confidence = 0.55

    try:
        client = get_openai_client(db, workspace_id)
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.2,
            messages=[
                {"role": "system", "content": "You are an AI workspace coach. Respond only with valid JSON."},
                {"role": "user", "content": prompt},
            ],
        )
        content = completion.choices[0].message.content or ""
        data = json.loads(content)
        summary = data.get("summary") or summary
        raw_recs = data.get("recommendations") or []
        if isinstance(raw_recs, list):
            recs = []
            for item in raw_recs:
                if isinstance(item, dict):
                    recs.append(
                        {
                            "title": item.get("title") or "Recommendation",
                            "description": item.get("description") or item.get("detail") or "",
                            "severity": item.get("severity"),
                            "related_entry_id": item.get("related_entry_id"),
                            "related_entry_title": item.get("related_entry_title"),
                        }
                    )
        confidence = float(data.get("confidence") or confidence)
    except Exception:
        pass

    overview = schemas.DashboardOverviewResponse(**metrics)
    metrics_payload = _jsonable(overview)
    context_payload = [json.loads(item.model_dump_json()) for item in context_items]

    record = models.WorkspaceInsight(
        workspace_id=workspace_id,
        summary=str(summary),
        recommendations=recs,
        metrics=metrics_payload,
        context_entries=context_payload,
        confidence=confidence,
        generated_by=user_id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.get("/insights", response_model=schemas.WorkspaceInsightResponse)
def get_workspace_insight(workspace_id: UUID, user_id: UUID, force_refresh: bool = False, db: Session = Depends(get_db)):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")

    if not force_refresh:
        insight = (
            db.query(models.WorkspaceInsight)
            .filter(models.WorkspaceInsight.workspace_id == workspace_id)
            .order_by(models.WorkspaceInsight.generated_at.desc())
            .first()
        )
        if insight:
            return _insight_to_schema(insight)

    record = _generate_and_store_insight(db, workspace_id, user_id)
    return _insight_to_schema(record)


@router.post("/insights/regenerate", response_model=schemas.WorkspaceInsightResponse)
def regenerate_workspace_insight(payload: schemas.WorkspaceInsightRegenerateRequest, db: Session = Depends(get_db)):
    ensure_membership(db, payload.workspace_id, payload.user_id, required_role="editor")
    record = _generate_and_store_insight(db, payload.workspace_id, payload.user_id)
    return _insight_to_schema(record)


def _serialize_chat_messages(raw_messages: list[dict]) -> list[schemas.WorkspaceChatMessage]:
    serialized: list[schemas.WorkspaceChatMessage] = []
    for item in raw_messages:
        try:
            created = item.get("created_at")
            created_dt = (
                datetime.fromisoformat(created)
                if isinstance(created, str)
                else created
                if isinstance(created, datetime)
                else datetime.now(timezone.utc)
            )
            serialized.append(
                schemas.WorkspaceChatMessage(
                    role=item.get("role") if item.get("role") in {"user", "assistant"} else "assistant",
                    content=str(item.get("content") or ""),
                    created_at=created_dt,
                )
            )
        except Exception:
            continue
    return serialized


def _chat_response(session: models.WorkspaceAIChat, context_entries: list[schemas.KnowledgeBaseContextItem]) -> schemas.WorkspaceChatTurnResponse:
    if not context_entries and session.context_entries:
        context_entries = []
        for ctx in session.context_entries:
            try:
                context_entries.append(schemas.KnowledgeBaseContextItem(**ctx))
            except Exception:
                continue

    messages = _serialize_chat_messages(session.messages or [])
    last_answer = ""
    for msg in reversed(messages):
        if msg.role == "assistant":
            last_answer = msg.content
            break

    return schemas.WorkspaceChatTurnResponse(
        session_id=session.id,
        answer=last_answer,
        messages=messages,
        context_entries=context_entries,
        updated_at=session.last_message_at or session.created_at,
    )


@router.post("/ask", response_model=schemas.WorkspaceChatTurnResponse)
def ask_workspace(payload: schemas.WorkspaceChatTurnRequest, db: Session = Depends(get_db)):
    ensure_membership(db, payload.workspace_id, payload.user_id, required_role="viewer")

    session: models.WorkspaceAIChat | None = None
    if payload.session_id:
        session = (
            db.query(models.WorkspaceAIChat)
            .filter(
                models.WorkspaceAIChat.id == payload.session_id,
                models.WorkspaceAIChat.workspace_id == payload.workspace_id,
            )
            .first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="Chat session not found.")
    else:
        session = models.WorkspaceAIChat(
            workspace_id=payload.workspace_id,
            user_id=payload.user_id,
            title=(payload.question[:120] if payload.question else "Workspace chat"),
            messages=[],
        )
        db.add(session)
        db.flush()

    messages = list(session.messages or [])
    now = datetime.now(timezone.utc)
    messages.append({"role": "user", "content": payload.question, "created_at": now.isoformat()})

    kb_entries = get_relevant_entries(db, payload.workspace_id, payload.question or "workspace summary", top_n=5)
    context_items = _context_from_entries(kb_entries)
    context_text = "\n".join(f"{item.title} [{item.type}]: {item.snippet}" for item in context_items) or "No direct references."
    metrics = collect_dashboard_metrics(db, payload.workspace_id)
    sprint = metrics["sprint"]
    metrics_text = (
        f"Tasks: total={metrics['tasks'].total}, todo={metrics['tasks'].todo}, in_progress={metrics['tasks'].in_progress}, done={metrics['tasks'].done}. "
        f"Roadmap completion={metrics['roadmap'].completion_percent}%. Sprint velocity={sprint.velocity} completing {sprint.completed_last_7_days} tasks last week."
    )

    conversation = [{"role": msg["role"], "content": msg["content"]} for msg in messages]
    prompt_boost = (
        f"You are the Ask My Workspace assistant. Answer clearly with actionable details using only workspace context.\n"
        f"Workspace metrics summary: {metrics_text}\n"
        f"Knowledge references:\n{context_text}\n"
        f"User question: {payload.question}"
    )

    answer = "I'm still syncing with your workspace, try asking again in a moment."
    try:
        client = get_openai_client(db, payload.workspace_id)
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.2,
            messages=[{"role": "system", "content": "You answer questions about this workspace succinctly and with context."}] + conversation[:-1] + [{"role": "user", "content": prompt_boost}],
        )
        answer = completion.choices[0].message.content or answer
    except Exception:
        pass

    messages.append({"role": "assistant", "content": answer, "created_at": datetime.now(timezone.utc).isoformat()})
    session.messages = messages
    session.context_entries = [json.loads(item.model_dump_json()) for item in context_items]
    session.last_message_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(session)

    return _chat_response(session, context_items)
