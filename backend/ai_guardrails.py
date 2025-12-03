from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, Sequence

from backend import models, schemas
from backend.knowledge_base_service import build_entry_content

CITATION_PATTERN = re.compile(r"\[(CTX\d+)\]")
DECLINE_PHRASE = "I don't know based on the current workspace knowledge."


@dataclass
class ContextSnippet:
    marker: str
    entry: models.KnowledgeBaseEntry
    snippet: str

    def to_schema(self) -> schemas.KnowledgeBaseContextItem:
        return schemas.KnowledgeBaseContextItem(
            id=self.entry.id,
            title=self.entry.title,
            type=self.entry.type,  # type: ignore[arg-type]
            snippet=self.snippet,
            marker=self.marker,
        )


def bundle_context_entries(entries: Sequence[models.KnowledgeBaseEntry]) -> list[ContextSnippet]:
    bundle: list[ContextSnippet] = []
    for index, entry in enumerate(entries, start=1):
        snippet = build_entry_content(entry, clip=240) or (entry.content or "")[:240]
        snippet = (snippet or "").strip()
        marker = f"CTX{index}"
        bundle.append(ContextSnippet(marker=marker, entry=entry, snippet=snippet))
    return bundle


def render_context_block(bundle: Sequence[ContextSnippet]) -> str:
    if not bundle:
        return "No knowledge base context provided."
    lines: list[str] = []
    for item in bundle:
        title = item.entry.title or "Untitled entry"
        entry_type = item.entry.type or "document"
        lines.append(f"[{item.marker}] {title} ({entry_type}) -> {item.snippet}")
    return "\n".join(lines)


def allowed_markers_from_items(items: Iterable[schemas.KnowledgeBaseContextItem]) -> set[str]:
    markers: set[str] = set()
    for item in items:
        if item.marker:
            markers.add(item.marker)
    return markers


def allowed_markers_from_payload(payload: Iterable[dict]) -> set[str]:
    markers: set[str] = set()
    for ctx in payload:
        marker = ctx.get("marker") if isinstance(ctx, dict) else None
        if marker:
            markers.add(str(marker))
    return markers


def verify_citations(
    texts: Sequence[str],
    allowed_markers: set[str] | None,
    *,
    decline_phrase: str = DECLINE_PHRASE,
) -> schemas.VerificationDetails:
    normalized = " ".join((text or "").strip() for text in texts if text).strip()
    if not normalized:
        return schemas.VerificationDetails(status="failed", message="Assistant response was empty.")
    if decline_phrase and normalized.lower() == decline_phrase.lower():
        return schemas.VerificationDetails(status="declined", message="Assistant declined due to missing context.")
    if not allowed_markers:
        return schemas.VerificationDetails(status="skipped", message="No knowledge context was supplied.")
    matches = CITATION_PATTERN.findall(normalized)
    if not matches:
        return schemas.VerificationDetails(status="failed", message="Response missing required [CTX#] citations.")
    invalid = sorted({match for match in matches if match not in allowed_markers})
    if invalid:
        return schemas.VerificationDetails(
            status="failed",
            message=f"Unknown citation markers detected: {', '.join(invalid)}.",
        )
    return schemas.VerificationDetails(status="passed", message="Citations verified against workspace knowledge.")


def verify_from_items(texts: Sequence[str], items: Sequence[schemas.KnowledgeBaseContextItem]) -> schemas.VerificationDetails:
    return verify_citations(texts, allowed_markers_from_items(items))

