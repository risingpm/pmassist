from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from html import unescape
from typing import Any
from urllib.parse import parse_qs, quote_plus, unquote, urlparse
from uuid import UUID, uuid4

import requests

import anyio
from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from backend import models, schemas
from backend.ai_providers import get_openai_client, decrypt_secret, resolve_openai_chat_model
from backend.database import get_db
from backend.knowledge_base_service import ensure_workspace_kb, get_relevant_entries, update_entry_embedding
from backend.prd_service import search_prd_embeddings, build_prd_context_items
from backend.rbac import ensure_membership, ensure_project_access
from backend.workspace_memory import remember_workspace_event
from backend.ai_guardrails import bundle_context_entries
from backend.agent_defaults import ensure_default_workspace_agents

try:
    from mcp.client.session_group import ClientSessionGroup, StreamableHttpParameters
except Exception:  # pragma: no cover - optional dependency
    ClientSessionGroup = None
    StreamableHttpParameters = None

GLOBAL_WORKSPACE_ID = UUID("00000000-0000-0000-0000-000000000000")
DEFAULT_TEMPLATE_TIMESTAMP = datetime(2024, 1, 1, tzinfo=timezone.utc)
logger = logging.getLogger(__name__)
_WEB_BROWSER_AGENT = "pm-assist-agent-browser/1.0"
_WEB_SEARCH_ENDPOINT = "https://r.jina.ai/https://duckduckgo.com/html/"
_WEB_PROXY_PREFIX = "https://r.jina.ai/"
_WEB_RESULT_PATTERN = re.compile(r"\[(?P<label>[^\]]+)\]\((?P<url>https://duckduckgo\.com/l/\?[^)]+)\)")
_PROMPT_URL_PATTERN = re.compile(r"https?://[^\s)>\]]+")
_MAX_WEB_RESULTS = 3
_MAX_WEB_TEXT = 700

DEFAULT_AGENT_TEMPLATE_DATA: list[dict] = [
    {
        "id": UUID("11111111-1111-1111-1111-111111111111"),
        "workspace_id": GLOBAL_WORKSPACE_ID,
        "created_by": None,
        "created_at": DEFAULT_TEMPLATE_TIMESTAMP,
        "updated_at": DEFAULT_TEMPLATE_TIMESTAMP,
        "shared_at": DEFAULT_TEMPLATE_TIMESTAMP,
        "cloned_from_id": None,
        "name": "Product Strategy Co-Pilot",
        "description": "Keeps PRDs, decisions, and roadmap steps aligned while flagging scope risk.",
        "purpose": "Coach product teams through planning and refinement with context from PRDs and roadmap milestones.",
        "instructions": (
            "You are a pragmatic staff PM. Study the provided context, surface the biggest unknowns, and propose next steps. "
            "Summaries should be structured as Highlights, Risks, and Actions."
        ),
        "tone": "confident and collaborative",
        "model_name": "gpt-4.1-mini",
        "temperature": 0.3,
        "max_tokens": 900,
        "modules": ["prd", "roadmap", "knowledge"],
        "tools": {"canSummarize": True, "canSuggestNextSteps": True},
        "avatar_url": None,
        "accent_color": "#2563eb",
        "is_public": True,
    },
    {
        "id": UUID("22222222-2222-2222-2222-222222222222"),
        "workspace_id": GLOBAL_WORKSPACE_ID,
        "created_by": None,
        "created_at": DEFAULT_TEMPLATE_TIMESTAMP,
        "updated_at": DEFAULT_TEMPLATE_TIMESTAMP,
        "shared_at": DEFAULT_TEMPLATE_TIMESTAMP,
        "cloned_from_id": None,
        "name": "Voice of Customer Analyst",
        "description": "Synthesizes research notes and customer feedback into actionable themes.",
        "purpose": "Help PMs keep a living view of customer pains, desired outcomes, and feature impact.",
        "instructions": (
            "Aggregate the most recent insights, cluster them by theme, and tag each with urgency. "
            "Offer a crisp insight deck-style response with bullets for Signals, Opportunities, and Calls to action."
        ),
        "tone": "insightful and empathetic",
        "model_name": "gpt-4.1-mini",
        "temperature": 0.4,
        "max_tokens": 800,
        "modules": ["knowledge"],
        "tools": {"canCluster": True, "canTagSentiment": True},
        "avatar_url": None,
        "accent_color": "#f97316",
        "is_public": True,
    },
    {
        "id": UUID("33333333-3333-3333-3333-333333333333"),
        "workspace_id": GLOBAL_WORKSPACE_ID,
        "created_by": None,
        "created_at": DEFAULT_TEMPLATE_TIMESTAMP,
        "updated_at": DEFAULT_TEMPLATE_TIMESTAMP,
        "shared_at": DEFAULT_TEMPLATE_TIMESTAMP,
        "cloned_from_id": None,
        "name": "Execution Health Reviewer",
        "description": "Monitors sprints, blockers, and roadmap drift with recommendations for course correction.",
        "purpose": "Give PMs a weekly health pulse covering progress vs. plan, blockers, and priority swaps.",
        "instructions": (
            "Compare planned milestones to linked tasks. Highlight schedule risk, owners who need support, and next check-ins. "
            "Close with a short motivating note for the team."
        ),
        "tone": "direct but encouraging",
        "model_name": "gpt-4.1-mini",
        "temperature": 0.25,
        "max_tokens": 700,
        "modules": ["roadmap", "tasks"],
        "tools": {"canComputeProgress": True, "canSuggestEscalations": True},
        "avatar_url": None,
        "accent_color": "#16a34a",
        "is_public": True,
    },
    {
        "id": UUID("44444444-4444-4444-4444-444444444444"),
        "workspace_id": GLOBAL_WORKSPACE_ID,
        "created_by": None,
        "created_at": DEFAULT_TEMPLATE_TIMESTAMP,
        "updated_at": DEFAULT_TEMPLATE_TIMESTAMP,
        "shared_at": DEFAULT_TEMPLATE_TIMESTAMP,
        "cloned_from_id": None,
        "name": "Competitor Intelligence Analyst",
        "description": "Monitors competitor signals and maps them to your roadmap, PRDs, and decisions with next steps.",
        "purpose": "Track competitor launches, pricing changes, and messaging shifts; translate them into actionable insights for our roadmap and PRDs.",
        "instructions": (
            "You are a senior PM focused on competitive strategy. Study the provided competitor signals, PRDs, roadmap phases, and decision notes. "
            "Always respond using the sections Signals, Implications, Recommended Moves, and Open Questions. Cite source markers like [C1] for each fact, "
            "note recency, and flag risk level. When relevant, call out the exact roadmap phase or PRD section impacted and propose concrete owner + due date suggestions."
        ),
        "tone": "analytical and concise",
        "model_name": "gpt-4.1-mini",
        "temperature": 0.25,
        "max_tokens": 1000,
        "modules": ["knowledge", "prd", "roadmap", "tasks"],
        "tools": {
            "canSummarize": True,
            "canSuggestNextSteps": True,
            "canCreateDecisionNote": True,
            "canDraftTask": True,
            "__template_key": "competitor_intel",
        },
        "avatar_url": None,
        "accent_color": "#0ea5e9",
        "is_public": True,
    },
]

DEFAULT_AGENT_TEMPLATE_SCHEMAS = [schemas.WorkspaceAgentTemplate(**data) for data in DEFAULT_AGENT_TEMPLATE_DATA]
DEFAULT_AGENT_TEMPLATE_LOOKUP = {template.id: template for template in DEFAULT_AGENT_TEMPLATE_SCHEMAS}


def _clean_markdown_text(raw: str | None) -> str:
    if not raw:
        return ""
    text = raw.replace("**", "").replace("__", "").replace("`", "")
    text = re.sub(r"\s+", " ", text)
    return unescape(text).strip()


def _decode_duckduckgo_redirect(url: str) -> str:
    if not url:
        return url
    parsed = urlparse(url)
    if "duckduckgo.com" not in parsed.netloc:
        return url
    params = parse_qs(parsed.query or "")
    target = params.get("uddg")
    if target and target[0]:
        return unquote(target[0])
    return url


def _parse_duckduckgo_markdown(payload: str, limit: int) -> list[dict[str, str]]:
    if not payload:
        return []
    sections = [section.strip() for section in payload.split("\n\n") if section.strip()]
    results: list[dict[str, str]] = []
    seen: set[str] = set()
    for section in sections:
        matches = list(_WEB_RESULT_PATTERN.finditer(section))
        if not matches:
            continue
        title_match = matches[0]
        title = _clean_markdown_text(title_match.group("label"))
        resolved_url = _decode_duckduckgo_redirect(title_match.group("url"))
        if not title or not resolved_url or resolved_url in seen:
            continue
        snippet = ""
        for match in reversed(matches[1:]):
            label = match.group("label")
            if label.startswith("!"):
                continue
            candidate = _clean_markdown_text(label)
            if not candidate or candidate.lower().startswith("www."):
                continue
            snippet = candidate
            break
        results.append({"title": title, "url": resolved_url, "snippet": snippet})
        seen.add(resolved_url)
        if len(results) >= limit:
            break
    return results


def _truncate_text(text: str, limit: int = _MAX_WEB_TEXT) -> str:
    normalized = re.sub(r"\s+", " ", text or "").strip()
    if len(normalized) <= limit:
        return normalized
    trimmed = normalized[:limit].rsplit(" ", 1)[0]
    trimmed = trimmed or normalized[:limit]
    return trimmed.rstrip() + "…"


def _extract_prompt_urls(prompt: str, max_urls: int = 2) -> list[str]:
    if not prompt:
        return []
    urls: list[str] = []
    for match in _PROMPT_URL_PATTERN.findall(prompt):
        cleaned = match.rstrip(").,")
        if cleaned in urls:
            continue
        urls.append(cleaned)
        if len(urls) >= max_urls:
            break
    return urls


def _fetch_web_page_text(url: str, max_chars: int = _MAX_WEB_TEXT) -> str | None:
    if not url:
        return None
    target = url.strip()
    if not target:
        return None
    if not target.startswith(("http://", "https://")):
        target = f"https://{target}"
    proxied = f"{_WEB_PROXY_PREFIX}{target}"
    try:
        response = requests.get(
            proxied,
            timeout=10,
            headers={"User-Agent": _WEB_BROWSER_AGENT},
        )
        response.raise_for_status()
    except requests.RequestException as exc:  # pragma: no cover - network errors
        logger.warning("Web fetch failed for %s: %s", url, exc)
        return None
    text = response.text or ""
    if "Markdown Content:" in text:
        text = text.split("Markdown Content:", 1)[-1]
    text = text.strip()
    if not text:
        return None
    return _truncate_text(text, max_chars)


def _search_duckduckgo(query: str, max_results: int) -> list[dict[str, str]]:
    question = (query or "").strip()
    if not question:
        return []
    encoded = quote_plus(question)
    search_url = f"{_WEB_SEARCH_ENDPOINT}?q={encoded}"
    try:
        response = requests.get(
            search_url,
            timeout=10,
            headers={"User-Agent": _WEB_BROWSER_AGENT},
        )
        response.raise_for_status()
    except requests.RequestException as exc:  # pragma: no cover - network errors
        logger.warning("Web search failed for '%s': %s", question[:80], exc)
        return []
    return _parse_duckduckgo_markdown(response.text, max_results)


def _build_web_browse_context(
    prompt: str,
    max_entries: int = _MAX_WEB_RESULTS,
) -> tuple[str, list[schemas.KnowledgeBaseContextItem]]:
    lines: list[str] = []
    items: list[schemas.KnowledgeBaseContextItem] = []
    seen_urls: set[str] = set()
    marker_index = 1

    def add_entry(title: str, snippet: str, source_url: str) -> None:
        nonlocal marker_index
        if marker_index > max_entries:
            return
        cleaned_snippet = _truncate_text(snippet)
        if not cleaned_snippet:
            return
        marker = f"Web {marker_index}"
        lines.append(f"[{marker}] {title} — {cleaned_snippet} (Source: {source_url})")
        items.append(
            schemas.KnowledgeBaseContextItem(
                id=uuid4(),
                title=title,
                type="research",
                snippet=f"{cleaned_snippet} (Source: {source_url})",
                marker=marker,
            )
        )
        marker_index += 1

    for url in _extract_prompt_urls(prompt):
        if marker_index > max_entries:
            break
        if url in seen_urls:
            continue
        snippet = _fetch_web_page_text(url)
        if not snippet:
            continue
        add_entry(url, snippet, url)
        seen_urls.add(url)

    if marker_index > max_entries:
        return "\n".join(lines), items

    for result in _search_duckduckgo(prompt, max_results=max_entries * 2 or 1):
        if marker_index > max_entries:
            break
        target_url = result.get("url")
        if not target_url or target_url in seen_urls:
            continue
        snippet = _fetch_web_page_text(target_url) or result.get("snippet") or ""
        if not snippet:
            continue
        add_entry(result.get("title") or target_url, snippet, target_url)
        seen_urls.add(target_url)

    return "\n".join(lines), items


def _normalize_content_block(block: Any) -> dict[str, Any]:
    if hasattr(block, "model_dump"):
        try:
            return block.model_dump()
        except Exception:  # pragma: no cover - best effort
            return {}
    if isinstance(block, dict):
        return block
    return {}


def _render_mcp_blocks(blocks: list[Any] | None) -> list[str]:
    if not blocks:
        return []
    rendered: list[str] = []
    for block in blocks:
        data = _normalize_content_block(block)
        block_type = data.get("type")
        if block_type == "text":
            text_value = data.get("text")
            if text_value:
                rendered.append(str(text_value))
        elif block_type == "tool_result":
            rendered.extend(_render_mcp_blocks(data.get("content")))
        elif data:
            try:
                rendered.append(json.dumps(data))
            except Exception:
                continue
    return rendered


def _render_mcp_result(result: Any) -> str:
    parts: list[str] = []
    content = getattr(result, "content", None)
    parts.extend(_render_mcp_blocks(content))
    structured = getattr(result, "structuredContent", None)
    if structured:
        try:
            parts.append(json.dumps(structured))
        except Exception:
            parts.append(str(structured))
    return "\n".join(part for part in parts if part).strip()


def _call_mcp_connection(connection: models.WorkspaceMCPConnection, prompt: str, context_text: str) -> str | None:
    if ClientSessionGroup is None or StreamableHttpParameters is None:
        raise RuntimeError("Install the 'mcp' package to enable MCP tool connections.")

    headers: dict[str, str] = {}
    if connection.auth_token_encrypted:
        try:
            token = decrypt_secret(connection.auth_token_encrypted)
            headers["Authorization"] = f"Bearer {token}"
        except Exception as exc:  # pragma: no cover
            logger.warning("Failed to decrypt MCP token for %s: %s", connection.id, exc)

    params = StreamableHttpParameters(
        url=connection.endpoint_url,
        headers=headers or None,
    )

    async def _run() -> str | None:
        async with ClientSessionGroup() as group:
            session = await group.connect_to_server(params)
            try:
                arguments: dict[str, Any] = dict(connection.default_arguments or {})
                prompt_field = (connection.prompt_field or "prompt").strip() or "prompt"
                arguments.setdefault(prompt_field, prompt)
                effective_context = context_text.strip()
                if effective_context:
                    context_field = (connection.context_field or "context").strip()
                    arguments.setdefault(context_field or "context", effective_context)
                result = await group.call_tool(connection.tool_name, arguments)
                return _render_mcp_result(result)
            finally:
                await group.disconnect_from_server(session)

    return anyio.run(_run)

router = APIRouter(prefix="/workspaces/{workspace_id}/agents", tags=["agents"])
templates_router = APIRouter(prefix="/agents", tags=["agent_templates"])


def _agent_to_schema(
    agent: models.AIAgent,
    workspace: models.Workspace | None = None,
) -> schemas.WorkspaceAgentResponse:
    context_tag = (agent.context_tag or f"agent:{agent.id}").strip().lower()
    default_type = None
    is_default = False
    if workspace:
        if workspace.prd_agent_id == agent.id:
            is_default = True
            default_type = "prd"
        elif workspace.roadmap_agent_id == agent.id:
            is_default = True
            default_type = "roadmap"
    payload = schemas.WorkspaceAgentResponse(
        id=agent.id,
        workspace_id=agent.workspace_id,
        created_by=agent.created_by,
        created_at=agent.created_at,
        updated_at=agent.updated_at,
        shared_at=agent.shared_at,
        cloned_from_id=agent.cloned_from_id,
        name=agent.name,
        description=agent.description,
        purpose=agent.purpose,
        instructions=agent.instructions,
        tone=agent.tone,
        model_name=agent.model_name,
        temperature=agent.temperature,
        max_tokens=agent.max_tokens,
        modules=list(agent.modules or []),
        tools=dict(agent.tools or {}),
        capabilities=list(agent.capabilities or []),
        context_config=dict(agent.context_config or {}),
        mcp_connection_ids=list(agent.mcp_connection_ids or []),
        avatar_url=agent.avatar_url,
        accent_color=agent.accent_color,
        is_public=agent.is_public,
        context_tag=context_tag,
        is_default=is_default,
        default_type=default_type,
    )
    return payload


@router.get("", response_model=list[schemas.WorkspaceAgentResponse])
def list_agents(workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    workspace = (
        db.query(models.Workspace)
        .filter(models.Workspace.id == workspace_id)
        .first()
    )
    if workspace:
        ensure_default_workspace_agents(db, workspace)
    agents = (
        db.query(models.AIAgent)
        .filter(models.AIAgent.workspace_id == workspace_id)
        .order_by(models.AIAgent.updated_at.desc())
        .all()
    )
    return [_agent_to_schema(agent, workspace) for agent in agents]


@router.post("", response_model=schemas.WorkspaceAgentResponse)
def create_agent(
    workspace_id: UUID,
    user_id: UUID,
    payload: schemas.WorkspaceAgentCreate,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    agent = models.AIAgent(
        workspace_id=workspace_id,
        created_by=user_id,
        name=payload.name,
        description=payload.description,
        purpose=payload.purpose,
        instructions=payload.instructions,
        tone=payload.tone,
        model_name=payload.model_name,
        temperature=payload.temperature,
        max_tokens=payload.max_tokens,
        modules=payload.modules,
        tools=payload.tools,
        capabilities=payload.capabilities,
        context_config=payload.context_config,
        mcp_connection_ids=payload.mcp_connection_ids,
        avatar_url=payload.avatar_url,
        accent_color=payload.accent_color,
        is_public=payload.is_public or False,
    )
    db.add(agent)
    db.flush()
    if not agent.context_tag:
        agent.context_tag = f"agent:{agent.id}".lower()
        db.add(agent)
    db.commit()
    db.refresh(agent)
    workspace = (
        db.query(models.Workspace)
        .filter(models.Workspace.id == workspace_id)
        .first()
    )
    return _agent_to_schema(agent, workspace)


@router.patch("/{agent_id}", response_model=schemas.WorkspaceAgentResponse)
def update_agent(
    workspace_id: UUID,
    agent_id: UUID,
    user_id: UUID,
    payload: schemas.WorkspaceAgentUpdate,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    agent = (
        db.query(models.AIAgent)
        .filter(models.AIAgent.workspace_id == workspace_id, models.AIAgent.id == agent_id)
        .first()
    )
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(agent, key, value)
    db.add(agent)
    db.commit()
    db.refresh(agent)
    workspace = (
        db.query(models.Workspace)
        .filter(models.Workspace.id == workspace_id)
        .first()
    )
    return _agent_to_schema(agent, workspace)


@router.delete("/{agent_id}", status_code=204)
def delete_agent(
    workspace_id: UUID,
    agent_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    agent = (
        db.query(models.AIAgent)
        .filter(models.AIAgent.workspace_id == workspace_id, models.AIAgent.id == agent_id)
        .first()
    )
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    workspace = (
        db.query(models.Workspace)
        .filter(models.Workspace.id == workspace_id)
        .first()
    )
    if workspace and (workspace.prd_agent_id == agent.id or workspace.roadmap_agent_id == agent.id):
        raise HTTPException(status_code=400, detail="Default agents cannot be deleted.")
    db.delete(agent)
    db.commit()
    return None


def _normalize_tag(tag: str) -> str:
    return tag.strip().lower()


def _serialize_kb_entry(entry: models.KnowledgeBaseEntry) -> schemas.KnowledgeBaseEntryResponse:
    file_url = None
    if entry.file_path:
        file_url = f"/knowledge-base/entries/{entry.id}/download"
    return schemas.KnowledgeBaseEntryResponse(
        id=entry.id,
        kb_id=entry.kb_id,
        type=entry.type,  # type: ignore[arg-type]
        title=entry.title,
        content=entry.content,
        file_url=file_url,
        source_url=entry.source_url,
        created_by=entry.created_by,
        created_by_email=entry.creator.email if entry.creator else None,
        project_id=entry.project_id,
        tags=entry.tags or [],
        created_at=entry.created_at,
        updated_at=entry.updated_at,
    )


def _project_context_content(project: models.Project) -> str:
    parts: list[str] = []
    if project.description:
        parts.append(f"Description: {project.description}")
    if project.goals:
        parts.append(f"Goals: {project.goals}")
    if project.north_star_metric:
        parts.append(f"North star metric: {project.north_star_metric}")
    if project.target_personas:
        parts.append(f"Target personas: {', '.join(project.target_personas)}")
    if project.website_url:
        parts.append(f"Website: {project.website_url}")
    return "\n".join(parts) or "Project context linked."


def _prd_context_content(prd: models.PRD) -> str:
    parts: list[str] = []
    if prd.feature_name:
        parts.append(f"Feature: {prd.feature_name}")
    if prd.description:
        parts.append(f"Description: {prd.description}")
    if prd.goals:
        parts.append(f"Goals: {prd.goals}")
    if prd.content:
        snippet = prd.content.strip()
        if len(snippet) > 1200:
            snippet = snippet[:1200].rstrip() + "..."
        parts.append(f"Draft:\n{snippet}")
    return "\n".join(parts) or "PRD context linked."


def _roadmap_context_content(roadmap: models.Roadmap) -> str:
    if roadmap.content:
        snippet = roadmap.content.strip()
        if len(snippet) > 1200:
            snippet = snippet[:1200].rstrip() + "..."
        return f"Roadmap draft:\n{snippet}"
    return "Roadmap context linked."


def _get_agent_context_tag(agent: models.AIAgent) -> str:
    return (agent.context_tag or f"agent:{agent.id}").strip().lower()


@router.post("/{agent_id}/context/link", response_model=list[schemas.KnowledgeBaseEntryResponse])
def link_agent_context(
    workspace_id: UUID,
    agent_id: UUID,
    payload: schemas.AgentContextLinkRequest,
    db: Session = Depends(get_db),
):
    if payload.workspace_id != workspace_id:
        raise HTTPException(status_code=400, detail="Workspace mismatch")
    ensure_membership(db, workspace_id, payload.user_id, required_role="editor")
    agent = (
        db.query(models.AIAgent)
        .filter(models.AIAgent.workspace_id == workspace_id, models.AIAgent.id == agent_id)
        .first()
    )
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    context_tag = _get_agent_context_tag(agent)
    kb = ensure_workspace_kb(db, workspace_id)

    created_entries: list[schemas.KnowledgeBaseEntryResponse] = []

    if payload.project_ids:
        projects = (
            db.query(models.Project)
            .filter(
                models.Project.workspace_id == workspace_id,
                models.Project.id.in_(payload.project_ids),
            )
            .all()
        )
        for project in projects:
            project_tag = _normalize_tag(f"project:{project.id}")
            existing = (
                db.query(models.KnowledgeBaseEntry)
                .filter(
                    models.KnowledgeBaseEntry.kb_id == kb.id,
                    models.KnowledgeBaseEntry.tags.contains([context_tag]),
                    models.KnowledgeBaseEntry.tags.contains([project_tag]),
                )
                .first()
            )
            if existing:
                created_entries.append(_serialize_kb_entry(existing))
                continue
            entry = models.KnowledgeBaseEntry(
                kb_id=kb.id,
                type="document",
                title=f"Project: {project.title}",
                content=_project_context_content(project),
                created_by=payload.user_id,
                project_id=project.id,
                tags=["agent", "context", "link", context_tag, project_tag],
            )
            db.add(entry)
            db.flush()
            update_entry_embedding(db, entry, workspace_id=workspace_id)
            created_entries.append(_serialize_kb_entry(entry))

    if payload.prd_ids:
        prds = (
            db.query(models.PRD)
            .filter(
                models.PRD.workspace_id == workspace_id,
                models.PRD.id.in_(payload.prd_ids),
            )
            .all()
        )
        for prd in prds:
            prd_tag = _normalize_tag(f"prd:{prd.id}")
            existing = (
                db.query(models.KnowledgeBaseEntry)
                .filter(
                    models.KnowledgeBaseEntry.kb_id == kb.id,
                    models.KnowledgeBaseEntry.tags.contains([context_tag]),
                    models.KnowledgeBaseEntry.tags.contains([prd_tag]),
                )
                .first()
            )
            if existing:
                created_entries.append(_serialize_kb_entry(existing))
                continue
            entry = models.KnowledgeBaseEntry(
                kb_id=kb.id,
                type="prd",
                title=prd.feature_name or "PRD",
                content=_prd_context_content(prd),
                created_by=payload.user_id,
                project_id=prd.project_id,
                tags=["agent", "context", "link", context_tag, prd_tag],
            )
            db.add(entry)
            db.flush()
            update_entry_embedding(db, entry, workspace_id=workspace_id)
            created_entries.append(_serialize_kb_entry(entry))

    if payload.roadmap_ids:
        roadmaps = (
            db.query(models.Roadmap)
            .filter(models.Roadmap.id.in_(payload.roadmap_ids))
            .all()
        )
        for roadmap in roadmaps:
            roadmap_tag = _normalize_tag(f"roadmap:{roadmap.id}")
            existing = (
                db.query(models.KnowledgeBaseEntry)
                .filter(
                    models.KnowledgeBaseEntry.kb_id == kb.id,
                    models.KnowledgeBaseEntry.tags.contains([context_tag]),
                    models.KnowledgeBaseEntry.tags.contains([roadmap_tag]),
                )
                .first()
            )
            if existing:
                created_entries.append(_serialize_kb_entry(existing))
                continue
            entry = models.KnowledgeBaseEntry(
                kb_id=kb.id,
                type="roadmap",
                title="Roadmap",
                content=_roadmap_context_content(roadmap),
                created_by=payload.user_id,
                project_id=roadmap.project_id,
                tags=["agent", "context", "link", context_tag, roadmap_tag],
            )
            db.add(entry)
            db.flush()
            update_entry_embedding(db, entry, workspace_id=workspace_id)
            created_entries.append(_serialize_kb_entry(entry))

    if not created_entries:
        raise HTTPException(status_code=404, detail="No matching items found.")
    db.commit()
    return created_entries


@router.post("/{agent_id}/share", response_model=schemas.WorkspaceAgentResponse)
def share_agent(workspace_id: UUID, agent_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    agent = (
        db.query(models.AIAgent)
        .filter(models.AIAgent.workspace_id == workspace_id, models.AIAgent.id == agent_id)
        .first()
    )
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent.is_public = True
    agent.shared_at = agent.shared_at or agent.updated_at
    db.add(agent)
    db.commit()
    db.refresh(agent)
    workspace = (
        db.query(models.Workspace)
        .filter(models.Workspace.id == workspace_id)
        .first()
    )
    return _agent_to_schema(agent, workspace)


@templates_router.get("/templates", response_model=list[schemas.WorkspaceAgentTemplate])
def list_agent_templates(db: Session = Depends(get_db)):
    agents = (
        db.query(models.AIAgent)
        .filter(models.AIAgent.is_public.is_(True))
        .order_by(models.AIAgent.shared_at.desc().nullslast())
        .limit(50)
        .all()
    )
    payload = [_agent_to_schema(agent) for agent in agents]
    if len(payload) < len(DEFAULT_AGENT_TEMPLATE_SCHEMAS):
        needed = len(DEFAULT_AGENT_TEMPLATE_SCHEMAS) - len(payload)
        payload.extend(DEFAULT_AGENT_TEMPLATE_SCHEMAS[:needed])
    return payload


@router.post("/{agent_id}/clone", response_model=schemas.WorkspaceAgentResponse)
def clone_agent(workspace_id: UUID, agent_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    template_override = DEFAULT_AGENT_TEMPLATE_LOOKUP.get(agent_id)
    source = None
    if not template_override:
        source = db.query(models.AIAgent).filter(models.AIAgent.id == agent_id).first()
        if not source or (source.workspace_id != workspace_id and not source.is_public):
            raise HTTPException(status_code=404, detail="Template not found")
    template_name = template_override.name if template_override else source.name
    clone = models.AIAgent(
        workspace_id=workspace_id,
        created_by=user_id,
        name=f"{template_name} (copy)",
        description=(template_override.description if template_override else source.description),
        purpose=(template_override.purpose if template_override else source.purpose),
        tone=(template_override.tone if template_override else source.tone),
        avatar_url=(template_override.avatar_url if template_override else source.avatar_url),
        accent_color=(template_override.accent_color if template_override else source.accent_color),
        model_name=(template_override.model_name if template_override else source.model_name),
        temperature=(template_override.temperature if template_override else source.temperature),
        max_tokens=(template_override.max_tokens if template_override else source.max_tokens),
        instructions=(template_override.instructions if template_override else source.instructions),
        modules=(list(template_override.modules) if template_override else list(source.modules or [])),
        tools=(dict(template_override.tools) if template_override else dict(source.tools or {})),
        capabilities=(
            list(template_override.capabilities) if template_override else list(source.capabilities or [])
        ),
        context_config=(
            dict(template_override.context_config) if template_override else dict(source.context_config or {})
        ),
        mcp_connection_ids=(
            list(template_override.mcp_connection_ids)
            if template_override
            else list(source.mcp_connection_ids or [])
        ),
        cloned_from_id=(None if template_override else source.id),
    )
    db.add(clone)
    db.commit()
    db.refresh(clone)
    workspace = (
        db.query(models.Workspace)
        .filter(models.Workspace.id == workspace_id)
        .first()
    )
    return _agent_to_schema(clone, workspace)


def _build_context(
    db: Session,
    agent: models.AIAgent,
    workspace_id: UUID,
    project_id: UUID | None,
    prompt: str,
) -> list[schemas.KnowledgeBaseContextItem]:
    modules = set(agent.modules or [])
    config = dict(agent.context_config or {})
    include_workspace = config.get("include_workspace_knowledge", True)
    max_items = int(config.get("max_context_items", 8) or 8)
    max_items = max(1, min(max_items, 20))

    context_items: list[schemas.KnowledgeBaseContextItem] = []
    combined_entries: list[models.KnowledgeBaseEntry] = []
    seen_ids: set[UUID] = set()

    context_tag = _get_agent_context_tag(agent)
    if context_tag:
        kb = ensure_workspace_kb(db, workspace_id)
        tagged_entries = (
            db.query(models.KnowledgeBaseEntry)
            .filter(
                models.KnowledgeBaseEntry.kb_id == kb.id,
                models.KnowledgeBaseEntry.tags.contains([context_tag]),
            )
            .order_by(models.KnowledgeBaseEntry.updated_at.desc())
            .limit(max_items)
            .all()
        )
        for entry in tagged_entries:
            if entry.id in seen_ids:
                continue
            combined_entries.append(entry)
            seen_ids.add(entry.id)

    if include_workspace and len(combined_entries) < max_items:
        remaining = max_items - len(combined_entries)
        entries = get_relevant_entries(db, workspace_id, prompt, top_n=remaining, project_id=project_id)
        for entry in entries:
            if entry.id in seen_ids:
                continue
            combined_entries.append(entry)
            seen_ids.add(entry.id)

    if combined_entries:
        bundle = bundle_context_entries(combined_entries)
        context_items.extend([item.to_schema() for item in bundle])

    if "prd" in modules and project_id:
        embeddings = search_prd_embeddings(db, project_id, workspace_id, prompt or "recent changes", limit=3)
        context_items.extend(build_prd_context_items(embeddings, start_index=len(context_items) + 1))

    return context_items


@router.post("/{agent_id}/run", response_model=schemas.AgentRunResponse)
def run_agent(
    workspace_id: UUID,
    agent_id: UUID,
    payload: schemas.AgentRunRequest,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    agent = (
        db.query(models.AIAgent)
        .filter(models.AIAgent.workspace_id == workspace_id, models.AIAgent.id == agent_id)
        .first()
    )
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if payload.project_id:
        ensure_project_access(db, workspace_id, payload.project_id, user_id, required_role="viewer")
    context_items = _build_context(db, agent, workspace_id, payload.project_id, payload.prompt)
    context_text = ""
    for item in context_items:
        marker = item.marker or ""
        prefix = f"[{marker}] " if marker else ""
        context_text += f"{prefix}{item.title}: {item.snippet}\n"

    extra_mcp_context: list[str] = []
    if agent.mcp_connection_ids:
        connectors = (
            db.query(models.WorkspaceMCPConnection)
            .filter(
                models.WorkspaceMCPConnection.workspace_id == workspace_id,
                models.WorkspaceMCPConnection.id.in_(agent.mcp_connection_ids),
            )
            .all()
        )
        if connectors and ClientSessionGroup is None:
            raise HTTPException(
                status_code=500,
                detail="MCP integrations require the 'mcp' Python package to be installed on the server.",
            )
        connector_lookup = {connection.id: connection for connection in connectors}
        for connector_id in agent.mcp_connection_ids:
            connection = connector_lookup.get(connector_id)
            if not connection:
                continue
            try:
                snippet = _call_mcp_connection(connection, payload.prompt, context_text)
            except Exception as exc:  # pragma: no cover - external services may fail
                logger.warning("MCP connector %s failed: %s", connection.name, exc)
                continue
            if snippet:
                extra_mcp_context.append(f"[MCP:{connection.name}] {snippet}")

    combined_context = context_text.strip()
    if extra_mcp_context:
        mcp_block = "\n".join(extra_mcp_context).strip()
        if combined_context:
            combined_context = f"{combined_context}\n{mcp_block}"
        else:
            combined_context = mcp_block

    web_context_text = ""
    web_context_items: list[schemas.KnowledgeBaseContextItem] = []
    if bool((agent.tools or {}).get("canBrowseWeb")):
        try:
            web_context_text, web_context_items = _build_web_browse_context(payload.prompt)
        except Exception as exc:  # pragma: no cover - network/HTML parsing best effort
            logger.warning("Web browsing failed for agent %s: %s", agent.id, exc)
            web_context_text = ""
            web_context_items = []
    if web_context_text:
        combined_context = f"{combined_context}\n{web_context_text}" if combined_context else web_context_text
    if web_context_items:
        context_items.extend(web_context_items)

    system_prompt = agent.instructions
    if agent.tone:
        system_prompt = f"You respond in a {agent.tone} tone.\n\n{system_prompt}"
    if agent.purpose:
        system_prompt = f"{system_prompt}\n\nAgent purpose: {agent.purpose}"
    user_prompt = payload.prompt
    if combined_context:
        user_prompt = f"{payload.prompt}\n\nContext:\n{combined_context}"

    response_text = "Unable to generate a response."
    status = "completed"
    try:
        client = get_openai_client(db, workspace_id)
        completion = client.chat.completions.create(
            model=resolve_openai_chat_model(agent.model_name),
            temperature=agent.temperature or 0.3,
            max_tokens=agent.max_tokens or 1000,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        response_text = completion.choices[0].message.content or response_text
    except Exception as exc:  # pragma: no cover - depends on OpenAI
        status = "error"
        response_text = f"Agent failed: {exc}"

    run = models.AIAgentRun(
        agent_id=agent.id,
        workspace_id=workspace_id,
        project_id=payload.project_id,
        user_id=user_id,
        prompt=payload.prompt,
        response=response_text,
        status=status,
        context_entries=jsonable_encoder(context_items),
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    remember_workspace_event(
        db,
        workspace_id,
        content=f"Agent {agent.name} replied: {response_text[:600]}",
        source="agent_run",
        metadata={"agent_id": str(agent.id)},
        user_id=user_id,
    )

    return schemas.AgentRunResponse(
        run_id=run.id,
        agent_id=agent.id,
        response=response_text,
        context_used=context_items,
        status=status,  # type: ignore[arg-type]
        created_at=run.created_at,
    )


@router.get("/{agent_id}/runs", response_model=list[schemas.AgentRunLog])
def list_agent_runs(workspace_id: UUID, agent_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    runs = (
        db.query(models.AIAgentRun)
        .filter(models.AIAgentRun.workspace_id == workspace_id, models.AIAgentRun.agent_id == agent_id)
        .order_by(models.AIAgentRun.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        schemas.AgentRunLog(
            id=run.id,
            agent_id=run.agent_id,
            prompt=run.prompt,
            response=run.response,
            status=run.status,  # type: ignore[arg-type]
            created_at=run.created_at,
        )
        for run in runs
    ]


@router.get("/projects/{project_id}/agents", response_model=list[schemas.WorkspaceAgentResponse])
def list_project_agents(workspace_id: UUID, project_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_project_access(db, workspace_id, project_id, user_id, required_role="viewer")
    workspace = (
        db.query(models.Workspace)
        .filter(models.Workspace.id == workspace_id)
        .first()
    )
    assignments = (
        db.query(models.ProjectAgent)
        .join(models.AIAgent, models.AIAgent.id == models.ProjectAgent.agent_id)
        .filter(
            models.ProjectAgent.project_id == project_id,
            models.AIAgent.workspace_id == workspace_id,
        )
        .all()
    )
    return [_agent_to_schema(assignment.agent, workspace) for assignment in assignments]


@router.post("/projects/{project_id}/agents", response_model=list[schemas.WorkspaceAgentResponse])
def assign_project_agents(
    workspace_id: UUID,
    project_id: UUID,
    payload: schemas.ProjectAgentAssignRequest,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_project_access(db, workspace_id, project_id, user_id, required_role="contributor")
    desired = set(payload.agent_ids)
    current = (
        db.query(models.ProjectAgent)
        .filter(models.ProjectAgent.project_id == project_id)
        .all()
    )
    current_ids = {assignment.agent_id for assignment in current}
    for assignment in current:
        if assignment.agent_id not in desired:
            db.delete(assignment)
    for agent_id in desired - current_ids:
        agent = (
            db.query(models.AIAgent)
            .filter(models.AIAgent.id == agent_id, models.AIAgent.workspace_id == workspace_id)
            .first()
        )
        if not agent:
            continue
        db.add(
            models.ProjectAgent(
                project_id=project_id,
                agent_id=agent_id,
                assigned_by=user_id,
            )
        )
    db.commit()
    return list_project_agents(workspace_id, project_id, user_id, db)
