from __future__ import annotations

import base64
import json
import logging
import os
import uuid
from uuid import UUID
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from textwrap import dedent
from typing import Any

import requests
from openai import OpenAI
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.knowledge.embeddings import generate_embedding
from backend.models import (
    Document,
    GitHubConnection,
    GitHubRepo,
    GitHubRepoContext,
    GitHubRepoInsight,
    KnowledgeEntry,
    PRD,
    Project,
    Roadmap,
)

logger = logging.getLogger(__name__)

GITHUB_API_BASE = "https://api.github.com"
GITHUB_ACCEPT_JSON = "application/vnd.github+json"
GITHUB_ACCEPT_RAW = "application/vnd.github.raw"
GITHUB_HEADERS_VERSION = "2022-11-28"

DOC_EXTENSIONS = {".md", ".rst", ".txt"}
CODE_EXTENSIONS = {
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".java",
    ".go",
    ".rs",
    ".cpp",
    ".c",
    ".h",
    ".hpp",
    ".swift",
    ".kt",
    ".m",
    ".rb",
    ".php",
}

MAX_FILE_BYTES = 200_000
MAX_CONTENT_CHARS = 8_000

openai_kwargs = {"api_key": os.getenv("OPENAI_API_KEY")}
openai_org = os.getenv("OPENAI_ORG")
if openai_org:
    openai_kwargs["organization"] = openai_org
openai_project = os.getenv("OPENAI_PROJECT")
if openai_project:
    openai_kwargs["project"] = openai_project

openai_client = OpenAI(**openai_kwargs)

PRODUCT_USE_CASE_CATEGORIES = [
    "Project CRUD",
    "Roadmap Generation",
    "PRD Generation",
]

PRODUCT_INSIGHT_SYSTEM_PROMPT = dedent(
    """
    You are an AI product strategist. Analyse the supplied project dossier and repository summaries to map them into
    business-focused product use cases. Focus on user value, measurable outcomes, and critical implementation details.

    Always respond as JSON with:
    {
      "product_use_cases": [
        {
          "use_case": "string",
          "problem": "string",
          "value_add": "string",
          "implementation_notes": ["bullet", ...],
          "supporting_assets": ["FILE:...", "DOC:...", "COMMIT:..."],
          "next_steps": ["optional bullet", ...]
        }
      ],
      "roadmap": {
        "phase_1": {"name": "", "goal": "", "key_initiatives": [""], "risks": [""], "evidence": ["..."]},
        "phase_2": {...},
        "phase_3": {...}
      },
      "prd_drafts": [
        {
          "name": "",
          "problem": "",
          "user_value": "",
          "solution_outline": ["bullet", ...],
          "metrics": [""],
          "engineering_notes": [""],
          "evidence": ["..."]
        }
      ]
    }

    Anchor the three product_use_cases to the categories provided (Project CRUD, Roadmap Generation, PRD Generation).
    Each recommendation must cite supporting assets to show provenance. If information is missing, call it out in
    "risks" or "next_steps" rather than inventing facts.
    """
).strip()

PRODUCT_INSIGHT_FEWSHOT_PROMPT = dedent(
    """
    Project Overview:
    Project title: Atlas Billing
    Description: Unified billing platform consolidating subscriptions and usage-based invoices.
    Goals: Reduce involuntary churn, improve finance reporting accuracy.
    North star metric: Net revenue retention
    Personas: Finance admin, Engineering lead
    Linked repository: github.com/example/atlas-billing

    Repository Highlights:
    - services/invoice-runner.ts: Batch job orchestrating nightly invoice generation; retries failed jobs.
    - docs/vision.md: States roadmap for automated proration and dispute workflows.

    Recent Commits:
    - 2025-02-10 Jane: Add payment failure webhooks
    - 2025-02-08 Alex: Document refund edge cases
    """
).strip()

PRODUCT_INSIGHT_FEWSHOT_RESPONSE = dedent(
    """
    {
      "product_use_cases": [
        {
          "use_case": "Project CRUD",
          "problem": "Finance admins lack visibility into invoice retries and must manually reconcile failures.",
          "value_add": "Centralises invoice creation so teams recover failed payments and maintain audit trails.",
          "implementation_notes": [
            "Nightly invoice runner with exponential retries",
            "Webhook listener triggers customer outreach tasks"
          ],
          "supporting_assets": [
            "FILE:services/invoice-runner.ts",
            "COMMIT:2025-02-10 Jane"
          ],
          "next_steps": ["Add admin dashboard filters", "Surface retry analytics"]
        },
        {
          "use_case": "Roadmap Generation",
          "problem": "Teams lack a sequenced plan for automating proration and dispute workflows.",
          "value_add": "Roadmap phases guide collaboration between product, finance, and engineering.",
          "implementation_notes": [
            "Vision document outlines phased automation",
            "Dependencies on payment provider dispute APIs"
          ],
          "supporting_assets": ["DOC:docs/vision.md"],
          "next_steps": ["Align finance reporting milestones", "Define success metrics"]
        },
        {
          "use_case": "PRD Generation",
          "problem": "No structured spec for dunning workflows results in inconsistent recovery tactics.",
          "value_add": "PRD codifies requirements so engineering can ship workflow MVP quickly.",
          "implementation_notes": [
            "Webhook payloads drive CSM alerts",
            "Need PCI review for saved payment methods"
          ],
          "supporting_assets": ["FILE:services/invoice-runner.ts", "COMMIT:2025-02-10 Jane"],
          "next_steps": ["Draft customer comms templates"]
        }
      ],
      "roadmap": {
        "phase_1": {
          "name": "Stabilise Billing Core",
          "goal": "Ensure invoices are generated and retried reliably",
          "key_initiatives": ["Add retries to invoice runner", "Expose dunning dashboard"],
          "risks": ["Legacy gateway lacks webhook retries"],
          "evidence": ["FILE:services/invoice-runner.ts"]
        },
        "phase_2": {
          "name": "Self-Service Recovery",
          "goal": "Allow customers to update payment methods proactively",
          "key_initiatives": ["1-click payment update", "Customer email sequence"],
          "risks": ["Requires PCI review"],
          "evidence": ["DOC:docs/vision.md"]
        },
        "phase_3": {
          "name": "Revenue Intelligence",
          "goal": "Surface revenue-risk cohorts for finance and CS",
          "key_initiatives": ["Churn prediction reports", "Finance API"],
          "risks": ["Data warehouse dependency"],
          "evidence": ["DOC:docs/vision.md"]
        }
      },
      "prd_drafts": [
        {
          "name": "Dunning Workflow MVP",
          "problem": "Failed payments silently churn accounts without finance visibility.",
          "user_value": "Finance admins recover revenue and CSMs proactively reach out.",
          "solution_outline": [
            "Retry payments twice with exponential backoff",
            "Notify CSM on consecutive failures",
            "Add admin dashboard"
          ],
          "metrics": ["Recovery rate", "Time to resolution"],
          "engineering_notes": ["Coordinate with payment gateway webhooks", "Instrument retries for observability"],
          "evidence": ["COMMIT:2025-02-10 Jane", "FILE:services/invoice-runner.ts"]
        }
      ]
    }
    """
).strip()


def _build_repo_summary_block(
    repo: GitHubRepo,
    contexts: Sequence[GitHubRepoContext],
    metadata: dict[str, Any] | None,
    *,
    max_items: int = 20,
) -> str:
    meta = metadata or {}
    lines = [
        f"Repository: {repo.repo_full_name}",
        f"Description: {meta.get('description', '')}",
        f"Primary language: {meta.get('language', '')}",
        f"Topics: {', '.join(meta.get('topics', [])) if isinstance(meta.get('topics'), list) else ''}",
        "",
        "Repository Summaries:",
    ]

    for ctx in contexts[:max_items]:
        snippet = ctx.content_summary.replace("\n", " ").strip()
        lines.append(f"- {ctx.file_path}: {snippet}")

    return "\n".join(lines).strip()


def _gather_project_documents(project: Project | None, limit: int = 6) -> list[str]:
    if project is None or not getattr(project, "documents", None):
        return []
    docs = sorted(
        project.documents,
        key=lambda d: d.uploaded_at or datetime.min,
        reverse=True,
    )
    snippets: dict[str, str] = {}
    for doc in docs:
        if len(snippets) >= limit:
            break
        if doc.filename in snippets:
            continue
        content = (doc.content or "").strip().replace("\n", " ")
        if not content:
            continue
        snippets[doc.filename] = content[:400]
    return [f"- {filename}: {text}" for filename, text in snippets.items()]


def _gather_project_prds(project: Project | None, limit: int = 4) -> list[str]:
    if project is None or not getattr(project, "prds", None):
        return []
    prds = sorted(
        project.prds,
        key=lambda p: p.updated_at or p.created_at,
        reverse=True,
    )[:limit]
    lines = []
    for prd in prds:
        name = prd.feature_name or getattr(prd, "title", None) or "PRD"
        content = (prd.content or prd.description or "").strip()
        if not content:
            continue
        snippet = content.replace("\n", " ")[:500]
        lines.append(f"- {name}: {snippet}")
    return lines


def _gather_project_roadmap(project: Project | None) -> list[str]:
    if project is None or not getattr(project, "roadmaps", None):
        return []
    roadmaps = sorted(
        project.roadmaps,
        key=lambda r: r.updated_at or r.created_at,
        reverse=True,
    )
    if not roadmaps:
        return []
    latest = roadmaps[0]
    content = latest.content
    if isinstance(content, dict):
        try:
            pretty = json.dumps(content, indent=2)
        except TypeError:
            pretty = str(content)
    else:
        pretty = str(content or "")
    snippet = pretty[:600]
    timestamp = latest.updated_at or latest.created_at
    stamp = timestamp.isoformat() if timestamp else ""
    return [f"- Latest roadmap ({stamp}): {snippet}"]


def _gather_manual_knowledge(
    db: Session,
    project: Project | None,
    limit: int = 5,
) -> list[str]:
    if project is None:
        return []
    try:
        project_uuid = uuid.UUID(str(project.id))
    except (ValueError, TypeError):
        return []

    entries = (
        db.query(KnowledgeEntry)
        .filter(
            KnowledgeEntry.project_id == project_uuid,
            ~KnowledgeEntry.source.in_(["github", "github_ai"]),
        )
        .order_by(KnowledgeEntry.created_at.desc())
        .limit(limit)
        .all()
    )

    lines = []
    for entry in entries:
        snippet = entry.content.replace("\n", " ")[:400]
        lines.append(f"- {entry.title}: {snippet}")
    return lines


def _build_project_insight_prompt(
    *,
    db: Session,
    repo: GitHubRepo,
    repo_summary: str,
    commits_blob: str,
    project: Project | None,
) -> str:
    sections: list[str] = []

    if project is not None:
        project_lines = [
            f"Project title: {project.title}",
            f"Description: {project.description}",
            f"Goals: {project.goals}",
            f"North star metric: {project.north_star_metric or 'Not specified'}",
            f"Personas: {', '.join(project.target_personas or []) if project.target_personas else 'Not specified'}",
        ]
        sections.append("Project Overview:\n" + "\n".join(project_lines))
        doc_lines = _gather_project_documents(project)
        if doc_lines:
            sections.append("Supporting documents:\n" + "\n".join(doc_lines))
        prd_lines = _gather_project_prds(project)
        if prd_lines:
            sections.append("Existing PRDs:\n" + "\n".join(prd_lines))
        roadmap_lines = _gather_project_roadmap(project)
        if roadmap_lines:
            sections.append("Existing roadmap insights:\n" + "\n".join(roadmap_lines))
        manual_lines = _gather_manual_knowledge(db, project)
        if manual_lines:
            sections.append("Manual knowledge entries:\n" + "\n".join(manual_lines))
    else:
        sections.append("Project Overview:\nNo specific project metadata available. Use repository context only.")

    sections.append("Repository highlights:\n" + repo_summary)
    sections.append("Recent commits:\n" + commits_blob)
    sections.append(
        "Focus use cases:\n" + "\n".join(f"- {name}" for name in PRODUCT_USE_CASE_CATEGORIES)
    )

    return "\n\n".join(section.strip() for section in sections if section.strip())


def _call_product_insight_model(prompt: str) -> dict[str, Any] | None:
    try:
        response = openai_client.chat.completions.create(
            model=os.getenv("OPENAI_INSIGHTS_MODEL", "gpt-4o"),
            messages=[
                {"role": "system", "content": PRODUCT_INSIGHT_SYSTEM_PROMPT},
                {"role": "user", "content": PRODUCT_INSIGHT_FEWSHOT_PROMPT},
                {"role": "assistant", "content": PRODUCT_INSIGHT_FEWSHOT_RESPONSE},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.35,
            max_tokens=1400,
        )
    except Exception as exc:  # pragma: no cover
        logger.exception("Failed to generate project insights: %s", exc)
        return None

    if not response.choices:
        return None

    raw = response.choices[0].message.content or "{}"
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Project insight response was not valid JSON: %s", raw)
        return None


def _coerce_endpoint_item(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        text = value.strip()
        return text or None
    if isinstance(value, dict):
        def _first(keys: Sequence[str]) -> str | None:
            for key in keys:
                raw = value.get(key)
                if isinstance(raw, str) and raw.strip():
                    return raw.strip()
        method = _first(["method", "http_method", "verb"])
        path = _first(["path", "endpoint", "url", "route"])
        name = _first(["name", "title"])
        description = _first(["description", "summary", "details"])
        primary = " ".join(
            part
            for part in [method.upper() if method else None, path or name]
            if part
        )
        if primary and description:
            return f"{primary} – {description}"
        if primary:
            return primary
        if description:
            return description
        return None
    text = str(value).strip()
    return text or None


def _coerce_endpoint_list(value: Any) -> list[str]:
    if value is None or value == "":
        return []
    items: list[str] = []
    if isinstance(value, (list, tuple, set)):
        for item in value:
            endpoint = _coerce_endpoint_item(item)
            if endpoint:
                items.append(endpoint)
    else:
        endpoint = _coerce_endpoint_item(value)
        if endpoint:
            items.append(endpoint)

    deduped: list[str] = []
    seen: set[str] = set()
    for item in items:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def _build_product_use_case_entries(
    repo: GitHubRepo,
    project_uuid: uuid.UUID | None,
    use_cases: list[dict[str, Any]],
) -> list[KnowledgeEntry]:
    entries: list[KnowledgeEntry] = []
    for use_case in use_cases:
        title = use_case.get("use_case") or "Product Use Case"
        problem = use_case.get("problem") or ""
        value_add = use_case.get("value_add") or ""
        implementation_notes = use_case.get("implementation_notes") or []
        supporting_assets = use_case.get("supporting_assets") or []
        next_steps = use_case.get("next_steps") or []
        api_endpoints = _coerce_endpoint_list(
            use_case.get("api_endpoints")
            or use_case.get("endpoints")
            or use_case.get("key_endpoints")
            or use_case.get("api_surface")
        )

        content_lines = [f"### {title}"]
        if problem:
            content_lines.append(f"**Problem:** {problem}")
        if value_add:
            content_lines.append(f"**Value Add:** {value_add}")
        if api_endpoints:
            content_lines.append("**API Endpoints:**")
            content_lines.extend(f"- {endpoint}" for endpoint in api_endpoints)
        if implementation_notes:
            content_lines.append("**Implementation Notes:**")
            content_lines.extend(f"- {note}" for note in implementation_notes)
        if supporting_assets:
            content_lines.append("**Supporting Assets:**")
            content_lines.extend(f"- {asset}" for asset in supporting_assets)
        if next_steps:
            content_lines.append("**Next Steps:**")
            content_lines.extend(f"- {step}" for step in next_steps)

        content = "\n".join(content_lines)
        entries.append(
            KnowledgeEntry(
                workspace_id=repo.workspace_id,
                repo_id=repo.id,
                project_id=project_uuid,
                source="github_ai",
                entry_type="product_use_case",
                title=title,
                content=content,
                metadata_json={
                    "repo_full_name": repo.repo_full_name,
                    "project_id": str(project_uuid) if project_uuid else None,
                    "use_case": title,
                    "problem": problem,
                    "value_add": value_add,
                    "api_endpoints": api_endpoints,
                    "implementation_notes": implementation_notes,
                    "supporting_assets": supporting_assets,
                    "next_steps": next_steps,
                },
            )
        )
    return entries


def _build_roadmap_entry(
    repo: GitHubRepo,
    project_uuid: uuid.UUID | None,
    roadmap: dict[str, Any] | None,
) -> KnowledgeEntry | None:
    if not isinstance(roadmap, dict) or not roadmap:
        return None

    lines = ["# AI Roadmap"]
    metadata = {"phases": {}}
    for key in ["phase_1", "phase_2", "phase_3"]:
        phase = roadmap.get(key)
        if not isinstance(phase, dict):
            continue
        title = phase.get("name") or key.replace("_", " ").title()
        lines.append(f"\n## {title}")
        for label in ["goal", "key_initiatives", "risks"]:
            value = phase.get(label)
            if not value:
                continue
            pretty_label = label.replace("_", " ").title()
            if isinstance(value, list):
                lines.append(f"**{pretty_label}:**")
                lines.extend(f"- {item}" for item in value if item)
            else:
                lines.append(f"**{pretty_label}:** {value}")
        metadata["phases"][key] = phase

    return KnowledgeEntry(
        workspace_id=repo.workspace_id,
        repo_id=repo.id,
        project_id=project_uuid,
        source="github_ai",
        entry_type="roadmap",
        title="AI Roadmap",
        content="\n".join(lines),
        metadata_json={"repo_full_name": repo.repo_full_name, **metadata},
    )


def _build_prd_entries(
    repo: GitHubRepo,
    project_uuid: uuid.UUID | None,
    prds: list[dict[str, Any]] | None,
) -> list[KnowledgeEntry]:
    entries: list[KnowledgeEntry] = []
    if not isinstance(prds, list):
        return entries

    for prd in prds:
        if not isinstance(prd, dict):
            continue
        name = prd.get("name") or "PRD Draft"
        content_lines = [f"### {name}"]
        metadata = {
            "name": name,
            "problem": prd.get("problem"),
            "user_value": prd.get("user_value"),
            "solution_outline": prd.get("solution_outline"),
            "metrics": prd.get("metrics"),
            "engineering_notes": prd.get("engineering_notes"),
            "evidence": prd.get("evidence"),
        }
        for key in ["problem", "user_value", "solution_outline", "metrics", "engineering_notes", "evidence"]:
            value = prd.get(key)
            if not value:
                continue
            label = key.replace("_", " ").title()
            if isinstance(value, list):
                content_lines.append(f"**{label}:**")
                content_lines.extend(f"- {item}" for item in value if item)
            else:
                content_lines.append(f"**{label}:** {value}")

        entries.append(
            KnowledgeEntry(
                workspace_id=repo.workspace_id,
                repo_id=repo.id,
                project_id=project_uuid,
                source="github_ai",
                entry_type="prd_draft",
                title=name,
                content="\n".join(content_lines),
                metadata_json={"repo_full_name": repo.repo_full_name, **metadata},
            )
        )

    return entries


class GitHubAPIError(RuntimeError):
    """Raised when the GitHub API returns an error response."""


def _request(
    access_token: str,
    endpoint: str,
    *,
    method: str = "GET",
    params: dict[str, Any] | None = None,
    accept: str = GITHUB_ACCEPT_JSON,
) -> Any:
    url = endpoint if endpoint.startswith("http") else f"{GITHUB_API_BASE}{endpoint}"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": accept,
        "X-GitHub-Api-Version": GITHUB_HEADERS_VERSION,
        "User-Agent": "pm-assist-integration",
    }
    try:
        response = requests.request(method, url, headers=headers, params=params, timeout=30)
    except requests.RequestException as exc:
        raise GitHubAPIError(f"GitHub request failed: {exc}") from exc

    if response.status_code == 204:
        return None
    if 200 <= response.status_code < 300:
        if accept == GITHUB_ACCEPT_RAW:
            return response.text
        if response.text:
            return response.json()
        return None

    detail = response.text or response.reason
    raise GitHubAPIError(f"GitHub API error ({response.status_code}): {detail}")


def fetch_authenticated_user(access_token: str) -> dict[str, Any]:
    return _request(access_token, "/user")


def list_user_repositories(access_token: str, *, per_page: int = 100) -> list[dict[str, Any]]:
    repos: list[dict[str, Any]] = []
    page = 1
    while True:
        batch = _request(
            access_token,
            "/user/repos",
            params={"per_page": per_page, "page": page, "sort": "updated"},
        )
        if not isinstance(batch, list) or not batch:
            break
        repos.extend(batch)
        if len(batch) < per_page:
            break
        page += 1
    return repos


def fetch_repository(access_token: str, owner: str, repo: str) -> dict[str, Any]:
    return _request(access_token, f"/repos/{owner}/{repo}")


def fetch_repository_topics(access_token: str, owner: str, repo: str) -> list[str]:
    data = _request(access_token, f"/repos/{owner}/{repo}/topics")
    if isinstance(data, dict):
        return data.get("names", [])
    return []


def fetch_repository_tree(access_token: str, owner: str, repo: str, ref: str) -> list[dict[str, Any]]:
    data = _request(access_token, f"/repos/{owner}/{repo}/git/trees/{ref}", params={"recursive": 1})
    if isinstance(data, dict):
        return data.get("tree", [])
    return []


def fetch_file_content(access_token: str, owner: str, repo: str, path: str, ref: str) -> str | None:
    try:
        raw = _request(
            access_token,
            f"/repos/{owner}/{repo}/contents/{path}",
            params={"ref": ref},
            accept=GITHUB_ACCEPT_RAW,
        )
    except GitHubAPIError as exc:
        logger.debug("Skipping file %s due to error: %s", path, exc)
        return None
    if not isinstance(raw, str):
        return None
    return raw


def fetch_recent_commits(access_token: str, owner: str, repo: str, *, per_page: int = 50) -> list[dict[str, Any]]:
    try:
        commits = _request(
            access_token,
            f"/repos/{owner}/{repo}/commits",
            params={"per_page": per_page},
        )
    except GitHubAPIError as exc:
        logger.warning("Unable to fetch commits for %s/%s: %s", owner, repo, exc)
        return []
    if not isinstance(commits, list):
        return []
    parsed: list[dict[str, Any]] = []
    for commit in commits:
        info = commit.get("commit", {}) if isinstance(commit, dict) else {}
        parsed.append(
            {
                "sha": commit.get("sha"),
                "message": info.get("message"),
                "author": info.get("author", {}).get("name"),
                "date": info.get("author", {}).get("date"),
                "html_url": commit.get("html_url"),
            }
        )
    return parsed


def _truncate(content: str, max_chars: int = MAX_CONTENT_CHARS) -> str:
    if len(content) <= max_chars:
        return content
    return content[: max_chars - 1000] + "\n...\n" + content[-1000:]


def _extension(path: str) -> str:
    lowered = path.lower()
    if "." not in lowered:
        return ""
    return lowered[lowered.rfind("."):]


def _summarize_file(file_path: str, content: str, *, is_code: bool) -> str:
    truncated = _truncate(content)
    if not truncated.strip():
        return ""

    system_prompt = (
        "You are an expert technical product manager summarizing repository assets for planning. "
        "Return concise, product-facing summaries highlighting purpose, responsibilities, and key dependencies."
    )
    if is_code:
        user_prompt = (
            f"File path: {file_path}\n"
            "Summarize the code's responsibilities, main components, and how it connects to the rest of the system. "
            "Highlight important APIs, data flows, or business rules."
            f"\n\nCode snippet:\n{truncated}"
        )
    else:
        user_prompt = (
            f"File path: {file_path}\n"
            "Summarize the documentation focusing on user value, product scope, and implementation notes."
            f"\n\nContent:\n{truncated}"
        )

    response = openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.2,
        max_tokens=400,
    )
    summary = response.choices[0].message.content if response.choices else ""
    return (summary or "").strip()


def _classify_file(path: str) -> str:
    ext = _extension(path)
    if ext in DOC_EXTENSIONS:
        return "doc"
    if ext in CODE_EXTENSIONS:
        return "code"
    return "other"


@dataclass
class ContextCandidate:
    path: str
    size: int
    type: str  # doc | code
    score: float


def _select_paths(tree: Sequence[dict[str, Any]], max_docs: int = 10, max_code: int = 12) -> list[ContextCandidate]:
    docs: list[ContextCandidate] = []
    code: list[ContextCandidate] = []

    for node in tree:
        if node.get("type") != "blob":
            continue
        path = node.get("path")
        size = int(node.get("size") or 0)
        if not path or size == 0 or size > MAX_FILE_BYTES:
            continue

        file_type = _classify_file(path)
        if file_type == "other":
            continue

        depth = path.count("/")
        score = depth + (size / 10000.0)

        candidate = ContextCandidate(path=path, size=size, type=file_type, score=score)

        if file_type == "doc":
            docs.append(candidate)
        else:
            code.append(candidate)

    docs.sort(key=lambda c: c.score)
    code.sort(key=lambda c: c.score)

    selected = docs[:max_docs] + code[:max_code]
    return selected


def sync_repository(
    db: Session,
    connection: GitHubConnection,
    repo_full_name: str,
    *,
    branch: str | None = None,
    force: bool = False,
) -> GitHubRepo:
    if "/" not in repo_full_name:
        raise ValueError("repo_full_name must be in the format 'owner/name'")

    owner, name = repo_full_name.split("/", 1)
    repo_data = fetch_repository(connection.access_token, owner, name)
    topics = fetch_repository_topics(connection.access_token, owner, name)

    target_branch = branch or repo_data.get("default_branch") or "main"
    tree = fetch_repository_tree(connection.access_token, owner, name, target_branch)
    commits = fetch_recent_commits(connection.access_token, owner, name)

    repo = (
        db.query(GitHubRepo)
        .filter(GitHubRepo.connection_id == connection.id, GitHubRepo.repo_full_name == repo_full_name)
        .first()
    )

    if not repo:
        repo = GitHubRepo(
            connection_id=connection.id,
            workspace_id=connection.workspace_id,
            repo_name=repo_data.get("name", name),
            repo_full_name=repo_full_name,
            repo_url=repo_data.get("html_url"),
            default_branch=target_branch,
            metadata_json={},
        )
        db.add(repo)
        db.flush()

    if (
        not force
        and repo.last_synced
        and repo.metadata_json
        and repo.metadata_json.get("pushed_at") == repo_data.get("pushed_at")
    ):
        logger.info("Repository %s already synced at latest commit", repo_full_name)
    else:
        logger.info("Syncing repository %s", repo_full_name)

        db.query(GitHubRepoContext).filter(GitHubRepoContext.repo_id == repo.id).delete()
        db.query(KnowledgeEntry).filter(
            KnowledgeEntry.repo_id == repo.id,
            KnowledgeEntry.source == "github",
        ).delete()
        db.query(GitHubRepoInsight).filter(GitHubRepoInsight.repo_id == repo.id).delete()

        candidates = _select_paths(tree)

        for candidate in candidates:
            file_content = fetch_file_content(connection.access_token, owner, name, candidate.path, target_branch)
            if file_content is None:
                continue

            summary = _summarize_file(candidate.path, file_content, is_code=(candidate.type == "code"))
            if not summary:
                continue

            embedding = generate_embedding(summary)

            context_row = GitHubRepoContext(
                repo_id=repo.id,
                file_path=candidate.path,
                content_summary=summary,
                embedding=embedding,
                metadata_json={
                    "type": candidate.type,
                    "size": candidate.size,
                },
            )
            db.add(context_row)

            knowledge_entry = KnowledgeEntry(
                workspace_id=connection.workspace_id,
                repo_id=repo.id,
                source="github",
                entry_type="source_code",
                title=f"{repo.repo_full_name}:{candidate.path}",
                content=summary,
                metadata_json={
                    "file_path": candidate.path,
                    "repo_full_name": repo.repo_full_name,
                    "type": candidate.type,
                },
                embedding=embedding,
            )
            db.add(knowledge_entry)

    repo.default_branch = target_branch
    repo.last_synced = datetime.utcnow()
    repo.metadata_json = {
        "description": repo_data.get("description"),
        "language": repo_data.get("language"),
        "stargazers_count": repo_data.get("stargazers_count"),
        "forks_count": repo_data.get("forks_count"),
        "open_issues_count": repo_data.get("open_issues_count"),
        "topics": topics,
        "pushed_at": repo_data.get("pushed_at"),
        "tree_sample_count": len(tree),
        "commit_samples": commits[:50],
    }

    db.commit()
    db.refresh(repo)

    assign_repo_entries_to_project(db, repo.id)

    return repo


def generate_ai_insights(db: Session, repo: GitHubRepo) -> None:
    contexts = (
        db.query(GitHubRepoContext)
        .filter(GitHubRepoContext.repo_id == repo.id)
        .order_by(GitHubRepoContext.created_at.asc())
        .all()
    )
    if not contexts:
        logger.info("No context available for repo %s; skipping AI insights", repo.repo_full_name)
        return

    metadata = repo.metadata_json if isinstance(repo.metadata_json, dict) else {}
    commit_snippets = metadata.get("commit_samples", []) if isinstance(metadata, dict) else []
    commit_lines = []
    for commit in commit_snippets[:20]:
        message = commit.get("message", "") if isinstance(commit, dict) else ""
        date = commit.get("date") if isinstance(commit, dict) else None
        author = commit.get("author") if isinstance(commit, dict) else None
        line = message.split("\n", 1)[0]
        commit_lines.append(f"- {date or ''} {author or ''}: {line}")

    repo_summary = _build_repo_summary_block(repo, contexts, metadata)
    commits_blob = "\n".join(commit_lines) or "No recent commits available"

    linked_projects = list(repo.projects)

    db.query(GitHubRepoInsight).filter(GitHubRepoInsight.repo_id == repo.id).delete()
    db.query(KnowledgeEntry).filter(
        KnowledgeEntry.repo_id == repo.id,
        KnowledgeEntry.source == "github_ai",
    ).delete()
    db.flush()

    targets = linked_projects or [None]

    for project in targets:
        prompt = _build_project_insight_prompt(
            db=db,
            repo=repo,
            repo_summary=repo_summary,
            commits_blob=commits_blob,
            project=project,
        )

        parsed = _call_product_insight_model(prompt)
        if parsed is None:
            continue

        project_uuid = None
        if project is not None:
            try:
                project_uuid = uuid.UUID(str(project.id))
            except (ValueError, TypeError):
                project_uuid = None

        use_cases = parsed.get("product_use_cases") or parsed.get("strategic_pillars") or []
        roadmap = parsed.get("roadmap")
        prd_drafts = parsed.get("prd_drafts") or []

        insight = GitHubRepoInsight(
            repo_id=repo.id,
            project_id=project_uuid,
            strategic_pillars=use_cases,
            roadmap=roadmap,
            prd_drafts=prd_drafts,
        )
        db.add(insight)
        db.flush()

        knowledge_entries: list[KnowledgeEntry] = []
        if isinstance(use_cases, list) and use_cases:
            knowledge_entries.extend(
                _build_product_use_case_entries(repo, project_uuid, use_cases)
            )
        roadmap_entry = _build_roadmap_entry(repo, project_uuid, roadmap)
        if roadmap_entry:
            knowledge_entries.append(roadmap_entry)
        knowledge_entries.extend(
            _build_prd_entries(repo, project_uuid, prd_drafts)
        )

        for entry in knowledge_entries:
            entry.embedding = generate_embedding(entry.content)
            db.add(entry)

    db.commit()

    assign_repo_entries_to_project(db, repo.id)


def get_relevant_repo_context(
    db: Session,
    workspace_id: str | None,
    query: str,
    *,
    limit: int = 5,
) -> list[dict[str, Any]]:
    if not workspace_id:
        return []
    embedding = generate_embedding(query)
    rows = db.execute(
        text(
            """
            SELECT c.file_path, c.content_summary
            FROM github_repo_context c
            JOIN github_repos r ON c.repo_id = r.id
            WHERE r.workspace_id = :workspace_id
            ORDER BY c.embedding <-> :embedding
            LIMIT :limit
            """
        ),
        {"workspace_id": str(workspace_id), "embedding": embedding, "limit": limit},
    )
    return [dict(row) for row in rows]


def list_workspace_connections(db: Session, workspace_id: str | None) -> list[GitHubConnection]:
    if not workspace_id:
        return []
    return (
        db.query(GitHubConnection)
        .filter(GitHubConnection.workspace_id == workspace_id)
        .order_by(GitHubConnection.created_at.asc())
        .all()
    )


def assign_repo_entries_to_project(db: Session, repo_id: UUID | str) -> None:
    repo_uuid = repo_id if isinstance(repo_id, UUID) else uuid.UUID(str(repo_id))
    project = (
        db.query(Project)
        .filter(Project.github_repo_id == repo_uuid)
        .first()
    )
    project_uuid: uuid.UUID | None = None
    if project and project.id:
        try:
            project_uuid = uuid.UUID(str(project.id))
        except ValueError:
            project_uuid = None

    db.query(KnowledgeEntry).filter(KnowledgeEntry.repo_id == repo_uuid).update(
        {"project_id": project_uuid}, synchronize_session=False
    )
    db.commit()
