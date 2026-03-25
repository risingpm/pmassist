from __future__ import annotations

from typing import Tuple
from uuid import UUID

from sqlalchemy.orm import Session

from backend import models


DEFAULT_PRD_AGENT = {
    "name": "PRD Agent",
    "description": "Drafts and refines PRDs using workspace knowledge and best practices.",
    "purpose": "Help product managers generate clear, structured PRDs quickly.",
    "instructions": (
        "You are a senior product manager assistant who drafts product requirements documents (PRDs). "
        "Ask focused clarifying questions only when essential information is missing. "
        "When enough context exists, generate a complete PRD in clean Markdown with clear sections, "
        "using concise, actionable language."
    ),
    "tone": "clear, concise, pragmatic",
    "tools": {},
    "capabilities": [],
    "context_config": {
        "prd_settings": {
            "greeting_enabled": True,
            "ask_followup_enabled": True,
            "intake_questions": (
                "Happy to help. Before I draft the PRD, can you share a bit more?\n"
                "- What problem are we solving?\n"
                "- Who is the target user?\n"
                "- What outcome or success metric matters most?\n"
                "If you want me to draft right away, just say “generate PRD.”"
            ),
            "sections": [
                "Objective",
                "Scope",
                "Success Metrics",
                "Engineering Requirements",
                "Future Work",
            ],
            "require_markdown": True,
            "require_headers": True,
            "require_bullets": True,
            "require_citations": True,
            "allow_best_effort": True,
            "include_workspace_knowledge": True,
            "include_notes": True,
            "include_project_fields": True,
            "include_templates": True,
            "include_prior_prds": True,
            "include_website": True,
            "min_signal_length": 60,
            "min_signal_score": 2,
        }
    },
    "modules": [],
}

DEFAULT_ROADMAP_AGENT = {
    "name": "Roadmap Agent",
    "description": "Builds strategic roadmaps using workspace context and PM best practices.",
    "purpose": "Guide product managers to create actionable, phased roadmaps.",
    "instructions": (
        "You are a senior product strategy assistant. Ask structured PM questions to clarify vision, "
        "person hints, outcomes, constraints, and risks. Once there is enough context, present a phased roadmap "
        "that is specific, actionable, and aligned to business goals."
    ),
    "tone": "strategic, helpful, decisive",
    "tools": {},
    "capabilities": [],
    "context_config": {},
    "modules": [],
}


def _create_default_agent(
    db: Session,
    *,
    workspace_id: UUID,
    created_by: UUID | None,
    defaults: dict,
) -> models.AIAgent:
    agent = models.AIAgent(
        workspace_id=workspace_id,
        created_by=created_by,
        name=defaults["name"],
        description=defaults.get("description"),
        purpose=defaults.get("purpose"),
        instructions=defaults["instructions"],
        tone=defaults.get("tone"),
        tools=defaults.get("tools", {}),
        capabilities=defaults.get("capabilities", []),
        context_config=defaults.get("context_config", {}),
        modules=defaults.get("modules", []),
        model_name="gpt-4.1-mini",
        temperature=0.3,
    )
    db.add(agent)
    db.flush()
    return agent


def ensure_default_workspace_agents(
    db: Session, workspace: models.Workspace
) -> Tuple[models.AIAgent, models.AIAgent]:
    prd_agent = None
    roadmap_agent = None

    if workspace.prd_agent_id:
        prd_agent = (
            db.query(models.AIAgent)
            .filter(models.AIAgent.id == workspace.prd_agent_id)
            .first()
        )

    if workspace.roadmap_agent_id:
        roadmap_agent = (
            db.query(models.AIAgent)
            .filter(models.AIAgent.id == workspace.roadmap_agent_id)
            .first()
        )

    updated = False
    if prd_agent is None:
        prd_agent = _create_default_agent(
            db,
            workspace_id=workspace.id,
            created_by=workspace.owner_id,
            defaults=DEFAULT_PRD_AGENT,
        )
        workspace.prd_agent_id = prd_agent.id
        updated = True

    if roadmap_agent is None:
        roadmap_agent = _create_default_agent(
            db,
            workspace_id=workspace.id,
            created_by=workspace.owner_id,
            defaults=DEFAULT_ROADMAP_AGENT,
        )
        workspace.roadmap_agent_id = roadmap_agent.id
        updated = True

    if updated:
        db.add(workspace)
        db.commit()
        db.refresh(workspace)

    return prd_agent, roadmap_agent


def get_default_prd_agent(db: Session, workspace_id: UUID) -> models.AIAgent | None:
    workspace = (
        db.query(models.Workspace)
        .filter(models.Workspace.id == workspace_id)
        .first()
    )
    if not workspace:
        return None
    prd_agent, _ = ensure_default_workspace_agents(db, workspace)
    return prd_agent


def get_default_roadmap_agent(db: Session, workspace_id: UUID) -> models.AIAgent | None:
    workspace = (
        db.query(models.Workspace)
        .filter(models.Workspace.id == workspace_id)
        .first()
    )
    if not workspace:
        return None
    _, roadmap_agent = ensure_default_workspace_agents(db, workspace)
    return roadmap_agent
