from __future__ import annotations

import logging
import re
from html import unescape
from html.parser import HTMLParser
from typing import Optional
from urllib.parse import urlparse
from uuid import UUID

import requests
from sqlalchemy.orm import Session

from backend import models
from backend.knowledge_base_service import ensure_workspace_kb

logger = logging.getLogger(__name__)

_USER_AGENT = "pm-assist-researcher/1.0"
_MAX_CONTENT_CHARS = 8000


class _WebsiteTextExtractor(HTMLParser):
    """Minimal HTML parser that extracts readable text while skipping scripts."""

    _BLOCK_TAGS = {
        "p",
        "div",
        "section",
        "article",
        "header",
        "footer",
        "main",
        "li",
        "ul",
        "ol",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
    }

    def __init__(self) -> None:
        super().__init__()
        self._skip_depth = 0
        self._parts: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:  # type: ignore[override]
        if tag in {"script", "style", "noscript"}:
            self._skip_depth += 1
        elif tag == "br":
            self._parts.append("\n")

    def handle_endtag(self, tag: str) -> None:  # type: ignore[override]
        if tag in {"script", "style", "noscript"}:
            self._skip_depth = max(self._skip_depth - 1, 0)
        elif tag in self._BLOCK_TAGS:
            self._parts.append("\n")

    def handle_data(self, data: str) -> None:  # type: ignore[override]
        if self._skip_depth:
            return
        text = unescape(data).strip()
        if text:
            self._parts.append(f"{text} ")

    def get_text(self) -> str:
        raw = "".join(self._parts)
        raw = re.sub(r"\r\n?", "\n", raw)
        raw = re.sub(r"[ \t]+\n", "\n", raw)
        raw = re.sub(r"\n{3,}", "\n\n", raw)
        raw = re.sub(r"[ \t]{2,}", " ", raw)
        lines = [line.strip() for line in raw.splitlines()]
        return "\n".join(line for line in lines if line)


def normalize_project_website(raw: Optional[str]) -> Optional[str]:
    """Trim and ensure a scheme is present for project website inputs."""
    if not raw:
        return None
    trimmed = raw.strip()
    if not trimmed:
        return None
    parsed = urlparse(trimmed)
    if not parsed.scheme:
        trimmed = f"https://{trimmed}"
    return trimmed


def _fetch_website_text(url: str) -> Optional[str]:
    try:
        response = requests.get(
            url,
            timeout=10,
            headers={"User-Agent": _USER_AGENT},
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("Failed to fetch project website %s: %s", url, exc)
        return None

    content_type = response.headers.get("Content-Type", "")
    text = response.text
    if "html" in content_type.lower():
        parser = _WebsiteTextExtractor()
        parser.feed(text)
        parser.close()
        text = parser.get_text()

    cleaned = re.sub(r"\s+\n", "\n", text)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = cleaned.strip()
    if not cleaned:
        return None
    return cleaned[:_MAX_CONTENT_CHARS]


def ingest_project_website(db: Session, project: models.Project, user_id: UUID | None = None) -> None:
    """Fetch the project's website and store it in the workspace knowledge base."""
    url = normalize_project_website(project.website_url)
    if not url or not project.workspace_id:
        return

    text = _fetch_website_text(url)
    if not text:
        return

    kb = ensure_workspace_kb(db, project.workspace_id)
    existing = (
        db.query(models.KnowledgeBaseEntry)
        .filter(
            models.KnowledgeBaseEntry.project_id == project.id,
            models.KnowledgeBaseEntry.source_url == url,
            models.KnowledgeBaseEntry.type == "research",
        )
        .first()
    )

    content = f"Source: {url}\n\n{text}"
    if existing:
        existing.title = f"Website research: {project.title}"
        existing.content = content
        tags = set(existing.tags or [])
        tags.update({"project_website", "research"})
        existing.tags = sorted(tags)
    else:
        entry = models.KnowledgeBaseEntry(
            kb_id=kb.id,
            type="research",
            title=f"Website research: {project.title}",
            content=content,
            source_url=url,
            project_id=project.id,
            tags=["project_website", "research"],
            created_by=user_id,
        )
        db.add(entry)
    db.commit()


def clear_project_website_research(db: Session, project: models.Project, source_url: Optional[str]) -> None:
    """Remove outdated website entries when a URL is cleared or replaced."""
    if not source_url:
        return
    (
        db.query(models.KnowledgeBaseEntry)
        .filter(
            models.KnowledgeBaseEntry.project_id == project.id,
            models.KnowledgeBaseEntry.source_url == source_url,
            models.KnowledgeBaseEntry.type == "research",
        )
        .delete()
    )
    db.commit()
