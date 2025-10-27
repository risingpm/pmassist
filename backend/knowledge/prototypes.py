import json
import logging
import os
import re
from textwrap import dedent
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from openai import OpenAI, OpenAIError
from sqlalchemy.orm import Session

from backend import schemas
from backend.database import get_db
from backend.models import (
    Prototype,
    PrototypeSession,
    PrototypeMessage,
    Roadmap,
    Project,
    Document,
    ProjectComment,
    ProjectLink,
    PRD,
)
from backend.workspaces import get_project_in_workspace
from pathlib import Path
import shutil

logger = logging.getLogger(__name__)

STATIC_ROOT = Path(__file__).resolve().parents[1] / "static" / "prototypes"
STATIC_ROOT.mkdir(parents=True, exist_ok=True)

router = APIRouter(prefix="/projects/{project_id}/prototypes", tags=["prototypes"])

MAX_BATCH_PROTOTYPES = 5

PROTOTYPE_SYSTEM_PROMPT = dedent(
    """
    You are a product design assistant who turns product roadmaps into runnable prototype blueprints.
    Respond with JSON following this schema:
    {
      "title": "string",
      "summary": "string",
      "goal": "string optional",
      "success_metrics": ["string"] optional,
      "key_screens": [
        {
          "name": "string",
          "goal": "string",
          "primary_actions": ["string"],
          "layout_notes": "string optional",
          "components": [
            {
              "kind": "hero | form | list | cta | stats | custom | navigation | modal",
              "title": "string optional",
              "description": "string optional",
              "fields": ["string"] optional,
              "actions": ["string"] optional,
              "sample_items": ["string"] optional,
              "dataset": [{"label": "string", "value": "string"}] optional
            }
          ]
        }
      ],
      "user_flow": ["string"] optional,
      "visual_style": "string optional",
      "call_to_action": "string optional"
    }
    Rules:
    - Provide actionable component details (forms, lists, CTAs) tied to the roadmap goal.
    - Prefer <=4 key screens, each with 2-4 components.
    - Use clear string values (no markdown) and keep text concise.
    - If roadmap lacks detail, infer reasonable defaults.
    """
).strip()


def build_project_context_summary(db: Session, project: Project) -> str:
    project_uuid = UUID(str(project.id))

    lines: list[str] = [
        f"Project: {project.title}",
        f"Goals: {project.goals or 'Not specified'}",
        f"North star metric: {project.north_star_metric or 'Not specified'}",
    ]

    documents = (
        db.query(Document)
        .filter(Document.project_id == project.id)
        .order_by(Document.uploaded_at.desc())
        .limit(5)
        .all()
    )
    if documents:
        lines.append("Documents:")
        for doc in documents:
            uploaded = getattr(doc.uploaded_at, "isoformat", lambda: "unknown")()
            lines.append(f"- {doc.filename} (uploaded {uploaded})")

    comments = (
        db.query(ProjectComment)
        .filter(ProjectComment.project_id == project.id)
        .order_by(ProjectComment.created_at.desc())
        .limit(5)
        .all()
    )
    if comments:
        lines.append("Recent comments:")
        for comment in comments:
            created = comment.created_at.isoformat() if comment.created_at else "unknown"
            lines.append(f"- [{created}] {comment.content}")

    links = (
        db.query(ProjectLink)
        .filter(ProjectLink.project_id == project_uuid)
        .order_by(ProjectLink.created_at.desc())
        .limit(5)
        .all()
    )
    if links:
        lines.append("Key links:")
        for link in links:
            lines.append(f"- {link.label}: {link.url}")

    prds = (
        db.query(PRD)
        .filter(PRD.project_id == project.id)
        .order_by(PRD.created_at.desc())
        .limit(3)
        .all()
    )
    if prds:
        lines.append("PRD snapshots:")
        for prd in prds:
            preview = (prd.content or prd.description or "").strip()
            preview = preview[:240] + ("…" if preview and len(preview) > 240 else "")
            lines.append(f"- {preview or 'Empty draft'}")

    existing_prototypes = (
        db.query(Prototype)
        .filter(Prototype.project_id == project.id)
        .order_by(Prototype.created_at.desc())
        .limit(3)
        .all()
    )
    if existing_prototypes:
        lines.append("Existing prototypes:")
        for proto in existing_prototypes:
            lines.append(f"- {proto.title} (created {proto.created_at.isoformat() if proto.created_at else 'unknown'})")

    return "\n".join(lines)


def render_prototype_html(spec: schemas.PrototypeSpec) -> str:
    """Generate a minimal HTML preview for the prototype."""
    def render_component_html(component: schemas.PrototypeComponent) -> str:
        title = component.title or component.kind.title()
        desc = component.description or ""
        body = ""
        if component.kind == "form" and component.fields:
            fields_html = "".join(
                f"<div class=\"preview-field\"><label>{field}</label><input placeholder='Enter {field.lower()}' /></div>"
                for field in component.fields
            )
            body = f"<div class=\"preview-form\">{fields_html}<button class=\"button\">Submit</button></div>"
        elif component.kind == "list" and component.sample_items:
            items = "".join(f"<li>{item}</li>" for item in component.sample_items)
            body = f"<ul class=\"preview-list\">{items}</ul>"
        elif component.kind == "stats" and component.sample_items:
            items = "".join(f"<div class=\"preview-stat\">{item}</div>" for item in component.sample_items)
            body = f"<div class=\"preview-stats\">{items}</div>"
        else:
            body = f"<p>{desc}</p>" if desc else ""

        actions = "".join(f"<span class=\"chip\">{action}</span>" for action in component.actions or [])

        return (
            "<div class=\"component\">"
            f"<h4>{title}</h4>"
            f"{body}"
            f"<div class=\"actions\">{actions}</div>"
            "</div>"
        )

    sections: list[str] = []
    for screen in spec.key_screens:
        actions_html = "".join(f"<li>{action}</li>" for action in screen.primary_actions)
        notes_html = f"<p class=\"notes\">{screen.layout_notes}</p>" if screen.layout_notes else ""
        components_html = "".join(render_component_html(component) for component in screen.components)
        sections.append(
            """
            <section class=\"prototype-screen\">
                <h3>{name}</h3>
                <p class=\"goal\">{goal}</p>
                <ul>{actions}</ul>
                {notes}
                <div class=\"components\">{components}</div>
            </section>
            """.format(
                name=screen.name,
                goal=screen.goal,
                actions=actions_html,
                notes=notes_html,
                components=components_html,
            )
        )
    screen_items = "".join(sections)

    user_flow = ""
    if spec.user_flow:
        user_flow = "".join(f"<li>{step}</li>" for step in spec.user_flow)
        user_flow = f"<div class=\"user-flow\"><h3>User Flow</h3><ol>{user_flow}</ol></div>"

    visual_style = f"<p class=\"visual-style\">{spec.visual_style}</p>" if spec.visual_style else ""
    cta = f"<p class=\"cta\"><strong>Primary CTA:</strong> {spec.call_to_action}</p>" if spec.call_to_action else ""
    goal_html = f"<p class=\"primary-goal\"><strong>Goal:</strong> {spec.goal}</p>" if spec.goal else ""
    metrics_html = ""
    if spec.success_metrics:
        metrics_html = "".join(f"<li>{metric}</li>" for metric in spec.success_metrics)
        metrics_html = f"<div class=\"success-metrics\"><h4>Success metrics</h4><ul>{metrics_html}</ul></div>"

    return (
        "<article class=\"prototype\">"
        "<header>"
        f"<h2>{spec.title}</h2>"
        f"<p>{spec.summary}</p>"
        f"{goal_html}"
        f"{metrics_html}"
        f"{visual_style}"
        f"{cta}"
        "</header>"
        f"<div class=\"screens\">{screen_items}</div>"
        f"{user_flow}"
        "</article>"
    )


def parse_spec(payload: dict[str, Any]) -> schemas.PrototypeSpec:
    try:
        return schemas.PrototypeSpec(**payload)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Invalid prototype spec returned: {exc}") from exc


def build_static_bundle(project_id: str, spec: schemas.PrototypeSpec) -> tuple[str, str]:
    project_id = str(project_id)
    slug = re.sub(r"[^a-z0-9-]+", "-", spec.title.lower()).strip("-")
    if not slug:
        slug = uuid4().hex[:8]
    bundle_dir = STATIC_ROOT / project_id / slug
    bundle_dir.mkdir(parents=True, exist_ok=True)

    html = f"""<!DOCTYPE html>
<html lang=\"en\">
  <head>
    <meta charset=\"UTF-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />
    <title>{spec.title}</title>
    <link rel=\"stylesheet\" href=\"./styles.css\" />
  </head>
  <body>
    <div id=\"app-root\"></div>
    <script type=\"module\" src=\"./app.js\"></script>
  </body>
</html>
"""

    css = dedent(
        """
        body {
          font-family: 'Inter', system-ui, sans-serif;
          background: #f1f5f9;
          color: #0f172a;
          margin: 0;
          padding: 32px;
        }
        .prototype {
          max-width: 960px;
          margin: 0 auto;
          background: white;
          border-radius: 32px;
          padding: 32px;
          box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08);
        }
        .app-nav {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 24px;
        }
        .app-nav button {
          border: none;
          padding: 10px 16px;
          border-radius: 9999px;
          background: rgba(59, 130, 246, 0.08);
          color: #1d4ed8;
          font-weight: 600;
          cursor: pointer;
        }
        .app-nav button.active {
          background: #2563eb;
          color: white;
        }
        .prototype header {
          border-bottom: 1px solid rgba(148, 163, 184, 0.35);
          padding-bottom: 16px;
          margin-bottom: 24px;
        }
        .prototype header h2 {
          margin: 0;
          font-size: 32px;
        }
        .prototype header p {
          margin: 8px 0 0 0;
          color: #475569;
          line-height: 1.6;
        }
        .prototype .screens {
          display: grid;
          gap: 16px;
        }
        .prototype-screen {
          background: rgba(59, 130, 246, 0.04);
          border: 1px solid rgba(59, 130, 246, 0.15);
          border-radius: 24px;
          padding: 20px;
        }
        .prototype-screen h3 {
          margin: 0 0 6px 0;
          font-size: 18px;
        }
        .prototype-screen .goal {
          color: #2563eb;
          margin: 0 0 10px 0;
          font-weight: 600;
        }
        .prototype-screen ul {
          margin: 0;
          padding-left: 20px;
          color: #1d4ed8;
        }
        .prototype-screen .notes {
          margin-top: 10px;
          color: #475569;
          font-style: italic;
        }
        .components {
          margin-top: 18px;
          display: grid;
          gap: 16px;
        }
        .component {
          background: white;
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 18px;
          padding: 16px;
        }
        .component h4 {
          margin: 0 0 8px 0;
          font-size: 16px;
        }
        .component .actions {
          margin-top: 12px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .chip {
          display: inline-flex;
          padding: 6px 12px;
          border-radius: 9999px;
          background: rgba(59, 130, 246, 0.12);
          color: #1d4ed8;
          font-size: 12px;
          font-weight: 600;
        }
        .prototype .user-flow {
          margin-top: 32px;
          border-top: 1px dashed rgba(59, 130, 246, 0.2);
          padding-top: 20px;
        }
        .prototype .user-flow ol {
          margin: 12px 0 0 20px;
          padding: 0;
          color: #0f172a;
        }
        .prototype .cta {
          margin-top: 16px;
          padding: 12px 18px;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          background: #1d4ed8;
          color: white;
          border-radius: 9999px;
          font-weight: 600;
        }
        a.button {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          text-decoration: none;
          font-weight: 600;
        }
        .notifications {
          margin-top: 24px;
          display: grid;
          gap: 12px;
        }
        .notification {
          border-radius: 16px;
          padding: 12px 16px;
          background: rgba(34, 197, 94, 0.12);
          color: #166534;
          font-size: 14px;
        }
        .preview-form label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 12px;
        }
        .preview-form input {
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.35);
          padding: 10px;
        }
        .preview-form button {
          border: none;
          border-radius: 9999px;
          background: #2563eb;
          color: white;
          padding: 10px 16px;
          cursor: pointer;
        }
        .preview-list {
          margin: 0;
          padding-left: 18px;
          color: #0f172a;
        }
        .preview-stats {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .preview-stat {
          background: rgba(59, 130, 246, 0.1);
          border-radius: 12px;
          padding: 8px 12px;
          font-weight: 600;
        }
        """
    )

    (bundle_dir / "index.html").write_text(html, encoding="utf-8")
    (bundle_dir / "styles.css").write_text(css, encoding="utf-8")
    app_js = f"""const spec = {json.dumps(spec.model_dump(), ensure_ascii=False)};

const state = {{
  currentScreen: 0,
  formData: {{}} ,
  listData: {{}} ,
  notifications: []
}};

function slug(str) {{
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}}

function pushNotification(message) {{
  state.notifications.unshift({{ message, id: Date.now() }});
  state.notifications = state.notifications.slice(0, 3);
  render();
}}

function handleAction(action) {{
  pushNotification(`Action: ${{action}}`);
}}

function renderNavigation() {{
  const nav = document.createElement("nav");
  nav.className = "app-nav";
  spec.key_screens.forEach((screen, index) => {{
    const btn = document.createElement("button");
    btn.textContent = screen.name;
    if (index === state.currentScreen) btn.classList.add("active");
    btn.onclick = () => {{
      state.currentScreen = index;
      render();
    }};
    nav.appendChild(btn);
  }});
  return nav;
}}

function renderScreen() {{
  const screen = spec.key_screens[state.currentScreen] ?? spec.key_screens[0];
  const container = document.createElement("section");
  container.className = "prototype-screen";
  container.innerHTML = `
    <h3>${{screen.name}}</h3>
    <p class="goal">${{screen.goal}}</p>
    <ul>${{screen.primary_actions.map((a) => `<li>${{a}}</li>`).join("")}}</ul>
    ${{screen.layout_notes ? `<p class="notes">${{screen.layout_notes}}</p>` : ""}}
  `;

  const componentsWrap = document.createElement("div");
  componentsWrap.className = "components";
  screen.components.forEach((component, componentIndex) => {{
    componentsWrap.appendChild(renderComponent(screen, component, componentIndex));
  }});
  container.appendChild(componentsWrap);
  return container;
}}

function renderComponent(screen, component, componentIndex) {{
  const wrapper = document.createElement("div");
  wrapper.className = "component";
  const title = component.title || component.kind;
  const description = component.description || "";
  wrapper.innerHTML = `<h4>${{title}}</h4>${{description ? `<p>${{description}}</p>` : ""}}`;

  const key = `${{slug(screen.name)}}-${{slug(title)}}-${{componentIndex}}`;

  if (component.kind === "form" && component.fields?.length) {{
    const form = document.createElement("form");
    form.className = "component-form";
    component.fields.forEach((field) => {{
      const group = document.createElement("div");
      group.className = "form-group";
      const label = document.createElement("label");
      label.textContent = field;
      const input = document.createElement("input");
      input.name = slug(field);
      input.placeholder = `Enter ${{field.toLowerCase()}}`;
      group.appendChild(label);
      group.appendChild(input);
      form.appendChild(group);
    }});
    const submit = document.createElement("button");
    submit.textContent = component.actions?.[0] || "Save";
    submit.className = "button";
    form.onsubmit = (event) => {{
      event.preventDefault();
      const formData = Array.from(new FormData(form).entries()).reduce((acc, [key, value]) => {{
        acc[key] = value;
        return acc;
      }}, {{}});
      state.formData[key] = formData;
      pushNotification(`${{title}} saved`);
    }};
    form.appendChild(submit);
    wrapper.appendChild(form);
  }} else if (component.kind === "list") {{
    const list = document.createElement("ul");
    list.className = "preview-list";
    const items = [
      ...(component.sample_items ?? []),
      ...(state.listData[key] ?? []),
    ];
    items.forEach((item) => {{
      const li = document.createElement("li");
      li.textContent = item;
      list.appendChild(li);
    }});
    wrapper.appendChild(list);
    const add = document.createElement("button");
    add.className = "button secondary";
    add.textContent = "Add item";
    add.onclick = () => {{
      const value = window.prompt(`Add item to ${{title}}`);
      if (!value) return;
      if (!state.listData[key]) state.listData[key] = [];
      state.listData[key].push(value);
      pushNotification(`Added "${{value}}" to ${{title}}`);
      render();
    }};
    wrapper.appendChild(add);
  }} else if (component.kind === "stats" && component.sample_items?.length) {{
    const stats = document.createElement("div");
    stats.className = "preview-stats";
    component.sample_items.forEach((item) => {{
      const stat = document.createElement("div");
      stat.className = "preview-stat";
      stat.textContent = item;
      stats.appendChild(stat);
    }});
    wrapper.appendChild(stats);
  }}

  (component.actions ?? []).forEach((action) => {{
    const btn = document.createElement("button");
    btn.className = "button";
    btn.type = "button";
    btn.textContent = action;
    btn.onclick = () => handleAction(action);
    wrapper.appendChild(btn);
  }});

  return wrapper;
}}

function renderNotifications() {{
  if (!state.notifications.length) return document.createElement("div");
  const wrap = document.createElement("div");
  wrap.className = "notifications";
  state.notifications.forEach((note) => {{
    const item = document.createElement("div");
    item.className = "notification";
    item.textContent = note.message;
    wrap.appendChild(item);
  }});
  return wrap;
}}

function render() {{
  const root = document.getElementById("app-root");
  if (!root) return;
  root.innerHTML = "";
  root.appendChild(renderNavigation());
  root.appendChild(renderScreen());
  root.appendChild(renderNotifications());
}}

document.addEventListener("DOMContentLoaded", () => {{
  render();
}});
"""

    (bundle_dir / "app.js").write_text(app_js, encoding="utf-8")

    relative = str((bundle_dir / "index.html").relative_to(Path(__file__).resolve().parents[1]))
    public_url = f"static/prototypes/{project_id}/{slug}/index.html"
    return relative, public_url


def fallback_spec(project, payload: schemas.PrototypeGenerateRequest) -> dict[str, Any]:
    phase = (payload.phase or "Key Experience").strip() or "Key Experience"
    primary_goal = (project.goals or "Create value for the user").strip()
    focus = (payload.focus or "Explore the core experience").strip()

    hero_description = focus if focus else primary_goal
    call_to_action = focus if focus else "Get started"

    focus_screen = {
        "name": focus[:60] or "Guided Exploration",
        "goal": f"Bring '{focus}' to life with tangible UI widgets.",
        "primary_actions": ["Try flow", "Preview"],
        "layout_notes": "Split layout with interactive module on the left and context on the right.",
        "components": [
            {
                "kind": "custom",
                "title": focus,
                "description": "Interactive module that showcases the noted experience with guiding copy and inline hints.",
                "actions": ["Run scenario", "View sample data"],
                "dataset": [
                    {"label": "Primary metric", "value": project.north_star_metric or "Activation"},
                    {"label": "Latest insight", "value": primary_goal},
                ],
            },
            {
                "kind": "list",
                "title": "Success checkpoints",
                "sample_items": [
                    "User completes the interactive step",
                    "Key data loads instantly",
                    "Clear next action is offered",
                ],
            },
        ],
    }

    dynamic_screens = [focus_screen]

    return {
        "title": f"{project.title} · {phase} prototype",
        "summary": f"Interactive web experience that highlights '{focus}' while keeping the core journey anchored to '{primary_goal}'.",
        "goal": primary_goal,
        "success_metrics": [
            "User completes the interactive focus flow",
            "User shares or commits",
            "User understands the value within the first minute",
        ],
        "key_screens": [
            {
                "name": "Hero / Value",
                "goal": "Focus attention on the primary promise and CTA",
                "primary_actions": ["Start", "Watch demo"],
                "layout_notes": "Full-width hero with concise copy and trust markers",
                "components": [
                    {
                        "kind": "hero",
                        "title": project.title,
                        "description": hero_description,
                        "actions": ["Start", "Watch demo"],
                    },
                    {
                        "kind": "stats",
                        "title": "Why it matters",
                        "sample_items": [
                            "125 PMs onboarded",
                            "+32% roadmap velocity",
                            "NPS 48 → 61",
                        ],
                    },
                ],
            },
            *dynamic_screens,
            {
                "name": "Core Interaction",
                "goal": "Show the key workflow that proves value",
                "primary_actions": ["Complete step", "View details"],
                "layout_notes": "Two-column layout with progress indicator",
                "components": [
                    {
                        "kind": "form",
                        "title": "Capture essentials",
                        "description": "Collect the minimum inputs to personalize the experience.",
                        "fields": ["Name", "Team", "North star metric"],
                        "actions": ["Save", "Skip"],
                    },
                    {
                        "kind": "list",
                        "title": "Example outcomes",
                        "sample_items": [
                            "Align launch themes for Q3",
                            "Track experiment backlog",
                            "Share roadmap digest",
                        ],
                    },
                ],
            },
            {
                "name": "Conversion",
                "goal": "Capture commitment or next best action",
                "primary_actions": ["Confirm", "Share"],
                "layout_notes": "Single column form, clear reinforcement of value",
                "components": [
                    {
                        "kind": "hero",
                        "title": "Ready to launch?",
                        "description": "Summarize what the user configured and what happens next.",
                        "actions": ["Confirm", "Share"],
                    },
                    {
                        "kind": "form",
                        "title": "Invite collaborators",
                        "fields": ["Email", "Role"],
                        "actions": ["Send invite"],
                    },
                ],
            },
        ],
        "user_flow": [
            "Land on the hero section and understand the promise",
            f"Engage with the '{focus}' experience to feel the differentiated value",
            "Complete the conversion step to finish the journey",
        ],
        "visual_style": "Minimalist web app aesthetic with ample white space, expressive accent colour, and component cards.",
        "call_to_action": call_to_action,
        "metadata": {
            "fallback": True,
            "focus": focus,
        },
    }


def generate_spec_with_openai(messages: list[dict[str, str]]) -> dict[str, Any] | None:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None

    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            response_format={"type": "json_object"},
            temperature=0.4,
        )
        return json.loads(response.choices[0].message.content)
    except (OpenAIError, json.JSONDecodeError, KeyError) as exc:
        logger.warning("Prototype generation via OpenAI failed: %s", exc)
        return None


def _get_project_and_active_roadmap(db: Session, project_id: str, workspace_id: UUID) -> tuple[Project, Roadmap]:
    project = get_project_in_workspace(db, project_id, workspace_id)

    roadmap = (
        db.query(Roadmap)
        .filter(
            Roadmap.project_id == project.id,
            Roadmap.is_active == True,
        )
        .order_by(Roadmap.created_at.desc())
        .first()
    )

    if not roadmap:
        raise HTTPException(status_code=404, detail="No roadmap available for this project.")

    return project, roadmap


def _build_generation_messages(
    project: Project,
    roadmap: Roadmap,
    payload: schemas.PrototypeGenerateRequest,
    *,
    variant_index: int,
    total_variants: int,
) -> list[dict[str, str]]:
    context_sections = [
        f"Project: {project.title}\nGoals: {project.goals}",
        f"Roadmap Content:\n{roadmap.content}",
    ]
    if payload.phase:
        context_sections.append(f"Focus on roadmap phase: {payload.phase}")
    if payload.focus:
        context_sections.append(f"Special requests: {payload.focus}")

    if total_variants > 1:
        context_sections.append(
            dedent(
                f"""
                Create variant {variant_index + 1} of {total_variants}. Each variant should explore a distinct direction while staying
                aligned with the roadmap goals and avoiding repetition across variants.
                """
            ).strip()
        )

    return [
        {"role": "system", "content": PROTOTYPE_SYSTEM_PROMPT},
        {"role": "user", "content": "\n\n".join(context_sections)},
    ]


def _generate_spec_for_variant(
    project: Project,
    roadmap: Roadmap,
    payload: schemas.PrototypeGenerateRequest,
    *,
    variant_index: int,
    total_variants: int,
) -> schemas.PrototypeSpec:
    messages = _build_generation_messages(project, roadmap, payload, variant_index=variant_index, total_variants=total_variants)
    data = generate_spec_with_openai(messages) or fallback_spec(project, payload)
    spec = parse_spec(data)

    metadata = dict(spec.metadata or {})
    metadata.setdefault("variant_index", variant_index + 1)
    metadata.setdefault("variant_total", total_variants)

    update_payload: dict[str, Any] = {"metadata": metadata}

    if total_variants > 1:
        variant_suffix = f" · Variant {variant_index + 1}"
        if variant_suffix not in spec.title:
            update_payload["title"] = f"{spec.title}{variant_suffix}"
        summary_prefix = f"[Variant {variant_index + 1}] "
        if not spec.summary.startswith(summary_prefix):
            update_payload["summary"] = f"{summary_prefix}{spec.summary}"

    return spec.model_copy(update=update_payload)


def _persist_prototype(
    db: Session,
    *,
    project: Project,
    roadmap: Roadmap,
    payload: schemas.PrototypeGenerateRequest,
    spec: schemas.PrototypeSpec,
) -> Prototype:
    spec_dict = json.loads(spec.model_dump_json())
    html_preview = render_prototype_html(spec)
    bundle_relative, bundle_public = build_static_bundle(project.id, spec)

    project_uuid = project.id if isinstance(project.id, UUID) else UUID(str(project.id))
    roadmap_uuid = roadmap.id if isinstance(roadmap.id, UUID) else UUID(str(roadmap.id))

    prototype = Prototype(
        project_id=project_uuid,
        roadmap_id=roadmap_uuid,
        roadmap_version=getattr(roadmap, "version", None),
        phase=payload.phase,
        title=spec.title,
        summary=spec.summary,
        spec=spec_dict,
        html_preview=html_preview,
        bundle_path=bundle_relative,
        bundle_url=bundle_public,
        workspace_id=project.workspace_id,
    )
    db.add(prototype)
    db.commit()
    db.refresh(prototype)
    return prototype


def _remove_bundle(bundle_path: str | None) -> None:
    if not bundle_path:
        return
    bundle_fs_path = Path(__file__).resolve().parents[1] / bundle_path
    bundle_dir = bundle_fs_path.parent
    if bundle_dir.exists():
        shutil.rmtree(bundle_dir, ignore_errors=True)


@router.get("", response_model=list[schemas.PrototypeResponse])
def list_prototypes(project_id: str, workspace_id: UUID, db: Session = Depends(get_db)):
    project = get_project_in_workspace(db, project_id, workspace_id)

    prototypes = (
        db.query(Prototype)
        .filter(
            Prototype.project_id == project.id,
            Prototype.workspace_id.in_([project.workspace_id, None]),
        )
        .order_by(Prototype.created_at.desc())
        .all()
    )
    return prototypes


@router.post("", response_model=schemas.PrototypeResponse, status_code=status.HTTP_201_CREATED)
def generate_prototype(
    project_id: str,
    payload: schemas.PrototypeGenerateRequest,
    db: Session = Depends(get_db),
):
    if payload.count and payload.count > 1:
        raise HTTPException(status_code=400, detail="Use /batch endpoint when requesting multiple prototypes.")

    project, roadmap = _get_project_and_active_roadmap(db, project_id, payload.workspace_id)
    spec = _generate_spec_for_variant(project, roadmap, payload, variant_index=0, total_variants=1)
    prototype = _persist_prototype(db, project=project, roadmap=roadmap, payload=payload, spec=spec)
    return prototype


@router.post("/batch", response_model=list[schemas.PrototypeResponse], status_code=status.HTTP_201_CREATED)
def generate_prototype_batch(
    project_id: str,
    payload: schemas.PrototypeGenerateRequest,
    db: Session = Depends(get_db),
):
    requested = payload.count or 1
    total = max(1, min(requested, MAX_BATCH_PROTOTYPES))

    project, roadmap = _get_project_and_active_roadmap(db, project_id, payload.workspace_id)
    prototypes: list[Prototype] = []
    for index in range(total):
        spec = _generate_spec_for_variant(project, roadmap, payload, variant_index=index, total_variants=total)
        prototype = _persist_prototype(db, project=project, roadmap=roadmap, payload=payload, spec=spec)
        prototypes.append(prototype)
    return prototypes


@router.delete("/{prototype_id}")
def delete_prototype(
    project_id: str,
    prototype_id: UUID,
    workspace_id: UUID,
    db: Session = Depends(get_db),
):
    project = get_project_in_workspace(db, project_id, workspace_id)

    prototype = (
        db.query(Prototype)
        .filter(
            Prototype.id == prototype_id,
            Prototype.project_id == project.id,
            Prototype.workspace_id.in_([project.workspace_id, None]),
        )
        .first()
    )
    if not prototype:
        raise HTTPException(status_code=404, detail="Prototype not found")

    if prototype.bundle_path:
        bundle_fs_path = Path(__file__).resolve().parents[1] / prototype.bundle_path
        bundle_dir = bundle_fs_path.parent
        if bundle_dir.exists():
            shutil.rmtree(bundle_dir, ignore_errors=True)

    db.delete(prototype)
    db.commit()

    return {"id": str(prototype_id), "deleted": True}


@router.delete("")
def delete_all_prototypes(
    project_id: str,
    workspace_id: UUID,
    include_sessions: bool = True,
    db: Session = Depends(get_db),
):
    project = get_project_in_workspace(db, project_id, workspace_id)

    prototypes = (
        db.query(Prototype)
        .filter(
            Prototype.project_id == project.id,
            Prototype.workspace_id.in_([project.workspace_id, None]),
        )
        .all()
    )

    deleted_prototypes = 0
    for prototype in prototypes:
        _remove_bundle(prototype.bundle_path)
        db.delete(prototype)
        deleted_prototypes += 1

    deleted_sessions = 0
    if include_sessions:
        sessions = (
            db.query(PrototypeSession)
            .filter(
                PrototypeSession.project_id == project.id,
                PrototypeSession.workspace_id.in_([project.workspace_id, None]),
            )
            .all()
        )

        session_ids = [session.id for session in sessions]
        if session_ids:
            db.query(PrototypeMessage).filter(PrototypeMessage.session_id.in_(session_ids)).delete(synchronize_session=False)

        for session in sessions:
            _remove_bundle(session.latest_bundle_path)
            db.delete(session)
            deleted_sessions += 1

    db.commit()

    return {
        "deleted_prototypes": deleted_prototypes,
        "deleted_sessions": deleted_sessions,
    }
