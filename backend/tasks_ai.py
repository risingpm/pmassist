from __future__ import annotations

import json
from uuid import UUID
import re

from fastapi import APIRouter, Depends, HTTPException
from openai import OpenAI
from sqlalchemy.orm import Session

from backend import models, schemas
from backend.database import get_db
from backend.knowledge_base_service import get_relevant_entries, build_entry_content
from backend.rbac import ensure_membership
from backend.workspaces import get_project_in_workspace

router = APIRouter(prefix="/ai", tags=["ai"])

openai_kwargs = {}
from dotenv import load_dotenv  # type: ignore
import os

load_dotenv()

api_key = os.getenv("OPENAI_API_KEY")
if api_key:
    openai_kwargs["api_key"] = api_key
openai_org = os.getenv("OPENAI_ORG")
if openai_org:
    openai_kwargs["organization"] = openai_org

client = OpenAI(**openai_kwargs)


def _serialize_context(entries: list[models.KnowledgeBaseEntry]) -> list[schemas.KnowledgeBaseContextItem]:
    serialized: list[schemas.KnowledgeBaseContextItem] = []
    for entry in entries:
        snippet = build_entry_content(entry, clip=800) or entry.content or ""
        serialized.append(
            schemas.KnowledgeBaseContextItem(
                id=entry.id,
                title=entry.title,
                type=entry.type,
                snippet=snippet,
            )
        )
    return serialized


def _extract_json_payload(raw: str) -> list[dict]:
    """Best-effort parser to handle assistants that wrap JSON in prose or fences."""
    if not raw:
        return []
    candidates: list[str] = []
    trimmed = raw.strip()
    if trimmed:
        candidates.append(trimmed)
    fence = re.search(r"```(?:json)?\s*(.*?)```", raw, re.DOTALL | re.IGNORECASE)
    if fence:
        snippet = fence.group(1).strip()
        if snippet:
            candidates.append(snippet)

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            tasks = parsed.get("tasks")
            if isinstance(tasks, list):
                return tasks
        if isinstance(parsed, list):
            return parsed
    raise ValueError("Assistant did not return valid JSON.")


@router.post("/generate-tasks", response_model=schemas.TaskGenerationResponse)
def generate_tasks(payload: schemas.TaskGenerationRequest, db: Session = Depends(get_db)):
    ensure_membership(db, payload.workspace_id, payload.user_id, required_role="editor")
    project = get_project_in_workspace(db, str(payload.project_id), payload.workspace_id)

    source_text = ""
    if payload.prd_id:
        prd = (
            db.query(models.PRD)
            .filter(models.PRD.id == payload.prd_id, models.PRD.project_id == payload.project_id)
            .first()
        )
        if not prd:
            raise HTTPException(status_code=404, detail="PRD not found for this project.")
        source_text = prd.content or prd.description or ""
    elif payload.roadmap_id:
        roadmap = (
            db.query(models.Roadmap)
            .filter(models.Roadmap.id == payload.roadmap_id, models.Roadmap.project_id == payload.project_id)
            .first()
        )
        if not roadmap:
            raise HTTPException(status_code=404, detail="Roadmap not found for this project.")
        source_text = roadmap.content or ""
    else:
        source_text = payload.instructions or ""

    kb_entries = get_relevant_entries(db, payload.workspace_id, source_text or project.description or "", top_n=4)
    context_items = _serialize_context(kb_entries)
    context_block = "\n\n".join(f"{item.title} ({item.type})\n{item.snippet}" for item in context_items) or "No context provided."

    prompt = f"""
You are an expert technical program manager. Given the project details and source document below, produce a JSON array of task breakdowns.
Each task must contain: title, description, priority (low|medium|high|critical), effort (small|medium|large), and status (todo|in_progress|done).
Focus on actionable engineering work and respect dependencies if mentioned. Do not include prose outside JSON.

Project: {project.title}
Goals: {project.goals}
Source document:
{source_text}

Relevant knowledge base context:
{context_block}
"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.2,
            messages=[
                {"role": "system", "content": "You output JSON only."},
                {"role": "user", "content": prompt},
            ],
        )
        raw = response.choices[0].message.content or ""
        parsed = _extract_json_payload(raw)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to generate tasks: {exc}") from exc

    items: list[schemas.TaskGenerationItem] = []
    for entry in parsed:
        if not isinstance(entry, dict):
            continue
        title = str(entry.get("title") or "").strip()
        description = str(entry.get("description") or "").strip()
        if not title:
            continue
        priority = str(entry.get("priority") or "medium").lower()
        effort = entry.get("effort")
        status_value = str(entry.get("status") or "todo").lower().replace("-", "_")
        if priority not in {"low", "medium", "high", "critical"}:
            priority = "medium"
        if status_value not in {"todo", "in_progress", "done"}:
            status_value = "todo"
        items.append(
            schemas.TaskGenerationItem(
                title=title,
                description=description or "Draft task generated from source documents.",
                priority=priority,  # type: ignore[arg-type]
                effort=str(effort) if effort else None,
                status=status_value,  # type: ignore[arg-type]
            )
        )

    return schemas.TaskGenerationResponse(tasks=items, context_entries=context_items)
