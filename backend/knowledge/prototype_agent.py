import json
import logging
import os
import re
from textwrap import dedent
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from openai import OpenAIError
from sqlalchemy.orm import Session

from backend import schemas
from backend.ai_providers import get_openai_client
from backend.database import get_db
from backend.models import PrototypeSession, PrototypeMessage
from backend.knowledge.prototypes import (
    build_project_context_summary,
    fallback_spec,
    parse_spec,
    build_static_bundle,
)
from backend.workspaces import get_project_in_workspace

router = APIRouter(prefix="/projects/{project_id}/prototype-sessions", tags=["prototypes"])

logger = logging.getLogger(__name__)

DEFAULT_PROTOTYPE_MODEL = "gpt-4o"
PROTOTYPE_AGENT_MODEL = os.getenv("OPENAI_PROTOTYPE_MODEL")

PROTOTYPE_AGENT_SYSTEM_PROMPT = dedent(
    """
    You are an AI product manager helping refine an interactive prototype based on a project brief.
    You must respond in JSON with the shape:
    {
      "assistant_message": "string",
      "prototype_spec": { ... }  // follows the same schema as earlier prompt
    }
    - Use the project context to inform decisions.
    - Respect the user's latest instructions while carrying forward prior agreements.
    - Keep assistant_message conversational, highlighting changes you made.
    """
).strip()


def _session_to_response(session: PrototypeSession) -> schemas.PrototypeSessionResponse:
    latest_spec = None
    if session.latest_spec:
        latest_spec = schemas.PrototypeSpec(**session.latest_spec)

    messages = [
        schemas.PrototypeAgentMessage(
            id=message.id,
            role=message.role,  # type: ignore[arg-type]
            content=message.content,
            created_at=message.created_at,
        )
        for message in sorted(session.messages, key=lambda m: m.created_at)
    ]

    return schemas.PrototypeSessionResponse(
        id=session.id,
        project_id=str(session.project_id),
        workspace_id=session.workspace_id,
        created_at=session.created_at,
        updated_at=session.updated_at,
        latest_spec=latest_spec,
        bundle_url=session.latest_bundle_url,
        messages=messages,
    )


def _call_agent(  # noqa: PLR0913
    *,
    db: Session,
    project,
    session: PrototypeSession,
    workspace_id: UUID,
    new_prompt: str | None,
) -> tuple[schemas.PrototypeSpec, str]:
    context = build_project_context_summary(db, project)

    history = []
    for message in sorted(session.messages, key=lambda m: m.created_at):
        history.append({"role": message.role, "content": message.content})

    user_prompt = new_prompt or "Please synthesise the prototype based on the latest project context."

    data = None
    model_used: str | None = None

    try:
        client = get_openai_client(db, workspace_id)
    except Exception as exc:  # pragma: no cover - configuration issue
        logger.warning("Prototype agent unavailable for workspace %s: %s", workspace_id, exc)
        client = None

    if client:
        messages = [
            {"role": "system", "content": PROTOTYPE_AGENT_SYSTEM_PROMPT},
            {"role": "system", "content": f"Project context:\n{context}"},
            *history,
            {"role": "user", "content": user_prompt},
        ]

        configured_candidates = [PROTOTYPE_AGENT_MODEL] if PROTOTYPE_AGENT_MODEL else []
        default_candidates = ["gpt-4.1", "gpt-4o", "gpt-4o-mini"]

        model_candidates: list[str] = []
        for model_name in configured_candidates + default_candidates:
            if model_name and model_name not in model_candidates:
                model_candidates.append(model_name)

        for model_name in model_candidates:
            try:
                logger.debug(
                    "prototype_agent_model_selected",
                    extra={"model": model_name, "configured_override": bool(PROTOTYPE_AGENT_MODEL)},
                )
                response = client.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    response_format={"type": "json_object"},
                    temperature=0.3,
                )
                data = json.loads(response.choices[0].message.content)
                model_used = model_name
                break
            except (OpenAIError, json.JSONDecodeError, KeyError) as exc:
                logger.warning(
                    "Prototype agent model failed",
                    extra={"model": model_name, "error": str(exc)},
                )
                data = None
            except Exception as exc:  # noqa: BLE001
                logger.exception(
                    "Prototype agent unexpected error",
                    extra={"model": model_name},
                )
                data = None

        if model_used:
            logger.info("prototype_agent_model_used", extra={"model": model_used})
        else:
            logger.error("prototype_agent_no_model_succeeded")

    if not data:
        spec_dict = fallback_spec(
            project,
            schemas.PrototypeGenerateRequest(workspace_id=workspace_id, phase=None, focus=new_prompt),
        )
        spec = parse_spec(spec_dict)
        summary = "Drafted a refreshed prototype using the local blueprint while the design model is unavailable."
        if new_prompt:
            summary += f" Incorporated your latest direction: \"{new_prompt}\"."
        return spec, summary

    focus_hint = (new_prompt or project.goals or project.description or "the product vision").strip()
    assistant_notes = None
    if isinstance(data, dict):
        raw_note = data.get("assistant_message")
        if isinstance(raw_note, str):
            assistant_notes = raw_note
    default_title = f"{project.title} · Concept prototype"
    default_summary = f"Interactive web experience exploring '{focus_hint}'."

    spec_payload = _normalise_spec_payload(
        data.get("prototype_spec") if isinstance(data, dict) else data,
        default_title=default_title,
        default_summary=default_summary,
        default_goal=project.goals,
        focus_hint=focus_hint,
        assistant_notes=assistant_notes,
    )
    if spec_payload and model_used:
        metadata = spec_payload.setdefault("metadata", {})
        if isinstance(metadata, dict):
            metadata.setdefault("openai_model", model_used)
    if not spec_payload:
        logger.warning("Prototype agent response missing usable prototype_spec; falling back")
        spec_dict = fallback_spec(
            project,
            schemas.PrototypeGenerateRequest(workspace_id=workspace_id, phase=None, focus=new_prompt),
        )
        spec = parse_spec(spec_dict)
        message = "Updated the prototype locally while we retry the design agent."
        if new_prompt:
            message += f" Captured your instruction: \"{new_prompt}\"."
        else:
            message += " Captured the latest project goals."
        return spec, message

    try:
        spec = parse_spec(spec_payload)
    except HTTPException as exc:
        logger.warning("Prototype agent returned invalid spec; falling back. detail=%s", exc.detail)
        spec_dict = fallback_spec(
            project,
            schemas.PrototypeGenerateRequest(workspace_id=workspace_id, phase=None, focus=new_prompt),
        )
        spec = parse_spec(spec_dict)
        message = "Updated the prototype locally while we retry the design agent due to a malformed response."
        if new_prompt:
            message += f" Incorporated: \"{new_prompt}\"."
        return spec, message

    assistant_message = data.get("assistant_message") or "Updated the prototype based on your latest direction."
    return spec, assistant_message


def _normalise_spec_payload(
    raw: object,
    *,
    default_title: str,
    default_summary: str,
    default_goal: str | None,
    focus_hint: str,
    assistant_notes: str | None,
) -> dict[str, object] | None:
    """Best-effort conversion of model output into a valid spec shape."""

    if raw is None:
        return None

    payload: object = raw
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError as exc:  # noqa: PERF203
            logger.warning("Prototype agent emitted non-JSON spec payload: %s", exc)
            return None

    if not isinstance(payload, dict):
        logger.warning("Prototype agent spec payload has unexpected type: %s", type(payload).__name__)
        return None

    # Handle nested structure {"prototype_spec": {...}}
    if "prototype_spec" in payload and isinstance(payload["prototype_spec"], dict):
        payload = payload["prototype_spec"]

    # Normalise key casing
    if "keyScreens" in payload and "key_screens" not in payload:
        payload["key_screens"] = payload.pop("keyScreens")
    if "userFlow" in payload and "user_flow" not in payload:
        payload["user_flow"] = payload.pop("userFlow")
    if "callToAction" in payload and "call_to_action" not in payload:
        payload["call_to_action"] = payload.pop("callToAction")
    if "successMetrics" in payload and "success_metrics" not in payload:
        payload["success_metrics"] = payload.pop("successMetrics")

    if "summary" in payload and isinstance(payload["summary"], list):
        payload["summary"] = "\n".join(str(item) for item in payload["summary"] if item is not None)

    def _extract_list_items(notes: str | None) -> list[str]:
        if not notes:
            return []
        bullet_pattern = re.compile(r"^\s*(?:[-*•]\s+|\d+[.)-]\s+)(.+)")
        items: list[str] = []
        for line in notes.splitlines():
            match = bullet_pattern.match(line)
            if not match:
                continue
            candidate = match.group(1).strip()
            if not candidate:
                continue
            candidate = re.sub(r"\*\*(.*?)\*\*", r"\1", candidate)
            candidate = candidate.rstrip(" .")
            items.append(candidate)
        return items

    assistant_list_items = _extract_list_items(assistant_notes)

    def _extract_screens_from_pages(pages: list[dict[str, object]]) -> list[dict[str, object]]:
        nested_payload = _normalise_spec_payload(
            {"webpages": pages},
            default_title=default_title,
            default_summary=default_summary,
            default_goal=default_goal,
            focus_hint=focus_hint,
            assistant_notes=assistant_notes,
        )
        return nested_payload.get("key_screens", [])

    webpages = payload.get("webpages")
    if isinstance(webpages, list) and "key_screens" not in payload:
        derived_screens: list[dict[str, object]] = []
        for page in webpages:
            if not isinstance(page, dict):
                continue
            screen_name = page.get("title") or page.get("name") or page.get("slug") or "Experience"
            primary_actions = page.get("primary_actions") or page.get("actions") or []
            sections = page.get("sections") or page.get("widgets") or page.get("components") or []

            screen_components: list[dict[str, object]] = []
            if isinstance(sections, list):
                for section in sections:
                    if section is None:
                        continue
                    if isinstance(section, str):
                        screen_components.append(
                            {
                                "kind": "custom",
                                "title": section,
                                "description": section,
                                "actions": [],
                            }
                        )
                        continue
                    if not isinstance(section, dict):
                        continue

                    normalised_section = dict(section)
                    if "type" in normalised_section and "kind" not in normalised_section:
                        normalised_section["kind"] = normalised_section.pop("type")
                    if "primaryActions" in normalised_section and "actions" not in normalised_section:
                        normalised_section["actions"] = normalised_section.pop("primaryActions")
                    if "actions" not in normalised_section or normalised_section["actions"] is None:
                        normalised_section["actions"] = []
                    kind_value = normalised_section.get("kind")
                    if not isinstance(kind_value, str) or kind_value not in {
                        "hero",
                        "form",
                        "list",
                        "cta",
                        "stats",
                        "custom",
                        "navigation",
                        "modal",
                    }:
                        normalised_section["kind"] = "custom"
                    screen_components.append(normalised_section)

            derived_screens.append(
                {
                    "name": str(screen_name),
                    "goal": page.get("goal") or page.get("description") or "Showcase the experience.",
                    "primary_actions": [str(action) for action in primary_actions] if isinstance(primary_actions, list) else [],
                    "components": screen_components,
                    "layout_notes": page.get("layout_notes") or page.get("layoutNotes") or None,
                }
            )

        if derived_screens:
            payload["key_screens"] = derived_screens
            payload.pop("webpages", None)

    webpage = payload.get("webpage")
    if isinstance(webpage, dict) and "key_screens" not in payload:
        payload["key_screens"] = _extract_screens_from_pages([webpage])
        payload.pop("webpage", None)

    pages = payload.get("pages")
    if isinstance(pages, list) and "key_screens" not in payload:
        payload["key_screens"] = _extract_screens_from_pages([page for page in pages if isinstance(page, dict)])
        payload.pop("pages", None)

    main_page = payload.get("main_page")
    secondary_pages = payload.get("secondary_pages")
    if "key_screens" not in payload and (isinstance(main_page, dict) or isinstance(secondary_pages, list)):
        screens: list[dict[str, object]] = []
        if isinstance(main_page, dict):
            screens.extend(_extract_screens_from_pages([main_page]))
        if isinstance(secondary_pages, list):
            screens.extend(_extract_screens_from_pages([page for page in secondary_pages if isinstance(page, dict)]))
        if screens:
            payload["key_screens"] = screens
        payload.pop("main_page", None)
        payload.pop("secondary_pages", None)

    if not payload.get("key_screens"):
        sections = []
        for candidate_key in ("sections", "components", "widgets", "panels"):
            value = payload.get(candidate_key)
            if isinstance(value, list) and value:
                sections = value
                break

        components: list[dict[str, object]] = []
        if sections:
            for item in sections:
                if item is None:
                    continue
                if isinstance(item, str):
                    components.append(
                        {
                            "kind": "custom",
                            "title": item,
                            "description": item,
                            "actions": [],
                        }
                    )
                    continue
                if isinstance(item, dict):
                    component = dict(item)
                    if "type" in component and "kind" not in component:
                        component["kind"] = component.pop("type")
                    if "actions" not in component or component["actions"] is None:
                        component["actions"] = []
                    if "kind" not in component or not isinstance(component["kind"], str):
                        component["kind"] = "custom"
                    components.append(component)

        if assistant_list_items:
            components.append(
                {
                    "kind": "list",
                    "title": f"{focus_hint[:45] or 'Prototype'} metrics",
                    "sample_items": assistant_list_items[:8],
                    "actions": [],
                }
            )

        if not components:
            components.append(
                {
                    "kind": "custom",
                    "title": focus_hint[:60] or "Prototype canvas",
                    "description": payload.get("summary") or default_summary,
                    "actions": [],
                }
            )

        payload["key_screens"] = [
            {
                "name": focus_hint[:60] or (payload.get("title") or "Experience"),
                "goal": payload.get("goal") or default_goal or default_summary,
                "primary_actions": payload.get("primary_actions") if isinstance(payload.get("primary_actions"), list) else [],
                "components": components,
                "layout_notes": payload.get("layout_notes") or payload.get("layoutNotes"),
            }
        ]

    payload.setdefault("title", default_title)
    payload.setdefault("summary", default_summary)
    if default_goal:
        payload.setdefault("goal", default_goal)

    if not isinstance(payload.get("title"), str) or not payload.get("title"):
        payload["title"] = default_title

    if not isinstance(payload.get("summary"), str) or not payload.get("summary"):
        payload["summary"] = default_summary

    key_screens = payload.get("key_screens")
    if isinstance(key_screens, list):
        normalised_screens: list[dict[str, object]] = []
        for screen in key_screens:
            if screen is None:
                continue
            if isinstance(screen, str):
                # Allow string bullet points – wrap them into scaffold.
                normalised_screens.append(
                    {
                        "name": screen,
                        "goal": "Describe the intent for this screen.",
                        "primary_actions": [],
                        "components": [],
                    }
                )
                continue
            if not isinstance(screen, dict):
                continue

            normalised = dict(screen)
            if "primaryActions" in normalised and "primary_actions" not in normalised:
                normalised["primary_actions"] = normalised.pop("primaryActions")
            if "layoutNotes" in normalised and "layout_notes" not in normalised:
                normalised["layout_notes"] = normalised.pop("layoutNotes")

            # Ensure required collections.
            if "primary_actions" not in normalised or normalised["primary_actions"] is None:
                normalised["primary_actions"] = []
            if "components" not in normalised or normalised["components"] is None:
                normalised["components"] = []

            components = normalised.get("components")
            if isinstance(components, list):
                fixed_components: list[dict[str, object]] = []
                for component in components:
                    if component is None:
                        continue
                    if isinstance(component, str):
                        fixed_components.append({
                            "kind": "note",
                            "title": component,
                            "description": component,
                            "actions": [],
                        })
                        continue
                    if not isinstance(component, dict):
                        continue

                    fixed = dict(component)
                    if "sampleItems" in fixed and "sample_items" not in fixed:
                        fixed["sample_items"] = fixed.pop("sampleItems")
                    if "primaryActions" in fixed and "actions" not in fixed:
                        fixed["actions"] = fixed.pop("primaryActions")
                    if "actions" not in fixed or fixed["actions"] is None:
                        fixed["actions"] = []
                    fixed_components.append(fixed)
                normalised["components"] = fixed_components

                if assistant_list_items and not normalised["components"]:
                    normalised["components"].append(
                        {
                            "kind": "list",
                            "title": f"{(normalised.get('name') or focus_hint)[:45]} metrics",
                            "sample_items": assistant_list_items[:8],
                            "actions": [],
                        }
                    )

                if not normalised["components"]:
                    normalised["components"].append(
                        {
                            "kind": "custom",
                            "title": normalised.get("name") or focus_hint[:60] or "Prototype canvas",
                            "description": payload.get("summary") or default_summary,
                            "actions": [],
                        }
                    )

            normalised_screens.append(normalised)

        payload["key_screens"] = normalised_screens

    success_metrics = payload.get("success_metrics")
    if isinstance(success_metrics, list):
        payload["success_metrics"] = [str(metric) for metric in success_metrics if metric is not None]
    elif not success_metrics:
        payload["success_metrics"] = [
            "User completes the highlighted flow",
            "User understands the differentiated value",
        ]

    if assistant_list_items:
        metadata = payload.setdefault("metadata", {})
        if isinstance(metadata, dict):
            metadata.setdefault("assistant_metrics", assistant_list_items)

    return payload  # type: ignore[return-value]


def _save_messages(db: Session, session: PrototypeSession, role: str, content: str) -> PrototypeMessage:
    message = PrototypeMessage(session_id=session.id, role=role, content=content)
    db.add(message)
    db.flush()
    return message


@router.get("", response_model=list[schemas.PrototypeSessionResponse])
def list_sessions(project_id: str, workspace_id: UUID, db: Session = Depends(get_db)):
    project = get_project_in_workspace(db, project_id, workspace_id)

    sessions = (
        db.query(PrototypeSession)
        .filter(
            PrototypeSession.project_id == project.id,
            PrototypeSession.workspace_id.in_([project.workspace_id, None]),
        )
        .order_by(PrototypeSession.updated_at.desc())
        .all()
    )
    return [_session_to_response(session) for session in sessions]


@router.post("", response_model=schemas.PrototypeSessionResponse, status_code=status.HTTP_201_CREATED)
def start_session(
    project_id: str,
    payload: schemas.PrototypeSessionCreateRequest,
    db: Session = Depends(get_db),
):
    project = get_project_in_workspace(db, project_id, payload.workspace_id)
    session = PrototypeSession(
        project_id=project.id,
        workspace_id=project.workspace_id,
    )
    db.add(session)
    db.flush()

    if payload.prompt:
        _save_messages(db, session, "user", payload.prompt.strip())
        spec, assistant_message = _call_agent(
            db=db,
            project=project,
            session=session,
            workspace_id=payload.workspace_id,
            new_prompt=payload.prompt,
        )
        new_spec_dict = json.loads(spec.model_dump_json())
        bundle_path = session.latest_bundle_path
        bundle_url = session.latest_bundle_url
        metrics = new_spec_dict.get("metadata", {}).get("assistant_metrics") if isinstance(new_spec_dict.get("metadata"), dict) else None
        if session.latest_spec != new_spec_dict or not bundle_url:
            bundle_path, bundle_url = build_static_bundle(project.id, spec)
            logger.info(
                "prototype_bundle_built",
                extra={
                    "project_id": str(project.id),
                    "session_id": str(session.id),
                    "fallback": bool(new_spec_dict.get("metadata", {}).get("fallback") if isinstance(new_spec_dict.get("metadata"), dict) else False),
                    "assistant_metrics": metrics,
                },
            )
        else:
            logger.info(
                "prototype_bundle_reused",
                extra={
                    "project_id": str(project.id),
                    "session_id": str(session.id),
                    "assistant_metrics": metrics,
                },
            )
        session.latest_spec = new_spec_dict
        session.latest_bundle_path = bundle_path
        session.latest_bundle_url = bundle_url
        _save_messages(db, session, "assistant", assistant_message)

    db.commit()
    db.refresh(session)
    return _session_to_response(session)


@router.post("/{session_id}/message", response_model=schemas.PrototypeSessionResponse)
def continue_session(
    project_id: str,
    session_id: UUID,
    payload: schemas.PrototypeSessionMessageRequest,
    db: Session = Depends(get_db),
):
    project = get_project_in_workspace(db, project_id, payload.workspace_id)
    session = (
        db.query(PrototypeSession)
        .filter(
            PrototypeSession.id == session_id,
            PrototypeSession.project_id == project.id,
            PrototypeSession.workspace_id.in_([project.workspace_id, None]),
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Prototype session not found")

    message_content = payload.message.strip()
    if not message_content:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    _save_messages(db, session, "user", message_content)
    spec, assistant_message = _call_agent(
        db=db,
        project=project,
        session=session,
        workspace_id=payload.workspace_id,
        new_prompt=payload.message,
    )
    new_spec_dict = json.loads(spec.model_dump_json())
    bundle_path = session.latest_bundle_path
    bundle_url = session.latest_bundle_url
    metrics = new_spec_dict.get("metadata", {}).get("assistant_metrics") if isinstance(new_spec_dict.get("metadata"), dict) else None
    if session.latest_spec != new_spec_dict or not bundle_url:
        bundle_path, bundle_url = build_static_bundle(project.id, spec)
        logger.info(
            "prototype_bundle_built",
            extra={
                "project_id": str(project.id),
                "session_id": str(session.id),
                "fallback": bool(new_spec_dict.get("metadata", {}).get("fallback") if isinstance(new_spec_dict.get("metadata"), dict) else False),
                "assistant_metrics": metrics,
            },
        )
    else:
        logger.info(
            "prototype_bundle_reused",
            extra={
                "project_id": str(project.id),
                "session_id": str(session.id),
                "assistant_metrics": metrics,
            },
        )
    session.latest_spec = new_spec_dict
    session.latest_bundle_path = bundle_path
    session.latest_bundle_url = bundle_url
    _save_messages(db, session, "assistant", assistant_message)
    db.commit()
    db.refresh(session)
    return _session_to_response(session)
