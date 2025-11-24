from __future__ import annotations

from textwrap import dedent
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend import models, schemas
from backend.database import get_db
from backend.knowledge_base_service import ensure_workspace_kb, get_relevant_entries
from backend.rbac import ensure_membership

router = APIRouter(prefix="/builder", tags=["builder"])

THEME_TOKENS = {
    "colors": {
        "primary": "#6366f1",
        "secondary": "#06b6d4",
        "background": "#0f172a",
        "surface": "#1e293b",
    },
    "radii": "1rem",
    "spacing": [4, 8, 16, 24],
    "typography": {
        "font": "Inter",
        "heading": "font-semibold text-xl",
        "body": "text-base text-slate-200",
    },
}


def _serialize_context(entries: list[models.KnowledgeBaseEntry]) -> list[schemas.KnowledgeBaseContextItem]:
    serialized: list[schemas.KnowledgeBaseContextItem] = []
    for entry in entries:
        snippet = (entry.content or "")[:600]
        serialized.append(
            schemas.KnowledgeBaseContextItem(
                id=entry.id,
                title=entry.title,
                type=entry.type,
                snippet=snippet,
            )
        )
    return serialized


def _build_component(prompt: str) -> str:
    import json

    safe_prompt = prompt.strip().capitalize() or "Prototype exploration"
    prompt_literal = json.dumps(safe_prompt)
    template = dedent(
        """
        import { motion } from "framer-motion";

        export default function Prototype() {
          const metricValues = ["72%", "88%", "63%"];
          const briefTitle = SAFE_PROMPT_TEXT;
          return (
            <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#111827] to-[#0b1120] text-white font-[Inter]">
              <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 lg:flex-row">
                <motion.aside
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur lg:w-1/3"
                >
                  <p className="text-xs uppercase tracking-[0.3em] text-white/60">Builder brief</p>
                  <h1 className="mt-4 text-2xl font-semibold tracking-tight">{briefTitle}</h1>
                  <p className="mt-3 text-sm text-white/70">
                    This layout combines glass panels, gradients, and motion to visualize the requested experience.
                  </p>
                  <div className="mt-5 space-y-2 text-sm text-white/70">
                    <p>• Dark gradient canvas</p>
                    <p>• Cards with frosted glass</p>
                    <p>• Animated timeline + analytics tiles</p>
                  </div>
                </motion.aside>
                <motion.main
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, duration: 0.6 }}
                  className="flex-1 space-y-6"
                >
                  <div className="rounded-3xl border border-white/10 bg-gradient-to-r from-[#312e81]/70 to-[#0ea5e9]/60 p-6 shadow-2xl backdrop-blur">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-white/80">Command center</p>
                        <p className="text-xl font-semibold">Strategic overview</p>
                      </div>
                      <button className="rounded-full bg-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white transition hover:bg-white/30">
                        Quick Actions
                      </button>
                    </div>
                    <div className="mt-6 grid gap-4 md:grid-cols-3">
                      {["Focus", "Momentum", "Health"].map((metric, index) => (
                        <div key={metric} className="rounded-2xl bg-white/10 p-4 shadow-inner">
                          <p className="text-sm text-white/70">{metric}</p>
                          <p className="mt-2 text-3xl font-semibold">{metricValues[index] ?? "82%"}</p>
                          <p className="text-xs text-white/60">+4.2% WoW</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
                      <p className="text-xs uppercase tracking-[0.25em] text-white/70">Milestones</p>
                      <div className="mt-4 space-y-4">
                        {["Explore", "Build", "Launch"].map((phase, idx) => (
                          <div key={phase} className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#4f46e5] to-[#14b8a6] text-center text-sm font-semibold leading-10">
                              {idx + 1}
                            </div>
                            <div>
                              <p className="text-sm font-semibold">{phase} phase</p>
                              <p className="text-xs text-white/60">Adaptive scope + UX polish</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
                      <p className="text-xs uppercase tracking-[0.25em] text-white/70">Timeline</p>
                      <div className="mt-4 h-48 rounded-2xl border border-white/10 bg-black/30 p-4">
                        <p className="text-sm text-white/60">Adaptive slots reserved for timeline visualization.</p>
                      </div>
                    </div>
                  </div>
                </motion.main>
              </div>
            </div>
          );
        }
        """
    ).strip()
    return template.replace("SAFE_PROMPT_TEXT", prompt_literal)


def _render_preview_html(code: str) -> str:
    return dedent(
        f"""
        <!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
            <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
            <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
            <script crossorigin src="https://unpkg.com/framer-motion@11.0.5/dist/framer-motion.umd.js"></script>
            <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
            <style>
              html, body {{
                margin: 0;
                height: 100%;
                font-family: 'Inter', sans-serif;
              }}
            </style>
          </head>
          <body>
            <div id="root"></div>
            <script type="text/babel">
              const motion = window.framerMotion.motion;
              {code}
              const root = ReactDOM.createRoot(document.getElementById('root'));
              root.render(<Prototype />);
            </script>
          </body>
        </html>
        """
    ).strip()


@router.post("/chat", response_model=schemas.BuilderChatResponse)
def builder_chat(payload: schemas.BuilderChatRequest, db: Session = Depends(get_db)):
    membership = ensure_membership(db, payload.workspace_id, payload.user_id, required_role="editor")
    if membership.role not in {"admin", "editor"}:
        raise HTTPException(status_code=403, detail="Insufficient permissions for builder chat.")

    context_entries = get_relevant_entries(db, payload.workspace_id, payload.prompt, top_n=3)
    serialized_context = _serialize_context(context_entries)

    code = _build_component(payload.prompt)
    suggestions = [
        "Add KPI tiles for adoption and retention.",
        "Swap to a lighter theme with accent borders.",
        "Introduce tabs for phases or squads.",
    ]
    message = (
        "Drafted a high-fidelity prototype canvas using the PM Assist gradient system and glass panels. "
        "Feel free to refine the layout, add cards, or request additional modules."
    )
    return schemas.BuilderChatResponse(
        message=message,
        code=code,
        design_tokens=THEME_TOKENS,
        context_entries=serialized_context,
        suggestions=suggestions,
    )


@router.post("/preview", response_model=schemas.BuilderPreviewResponse)
def builder_preview(payload: schemas.BuilderPreviewRequest):
    if not payload.code.strip():
        raise HTTPException(status_code=400, detail="Code is required for preview.")
    return schemas.BuilderPreviewResponse(preview_html=_render_preview_html(payload.code))


@router.post("/save", response_model=schemas.BuilderPrototypeResponse)
def builder_save(payload: schemas.BuilderSaveRequest, db: Session = Depends(get_db)):
    ensure_membership(db, payload.workspace_id, payload.user_id, required_role="editor")
    record = models.BuilderPrototype(
        workspace_id=payload.workspace_id,
        project_id=payload.project_id,
        title=payload.title.strip() or "Prototype",
        prompt=payload.prompt,
        code=payload.code,
        preview_html=payload.preview_html,
        design_tokens=payload.design_tokens,
        created_by=payload.user_id,
    )
    db.add(record)
    db.flush()

    kb = ensure_workspace_kb(db, payload.workspace_id)
    kb_entry = models.KnowledgeBaseEntry(
        kb_id=kb.id,
        type="prototype",
        title=payload.title.strip() or "Prototype",
        content=f"Prompt: {payload.prompt}\n\n{payload.code[:8000]}",
        project_id=payload.project_id,
        created_by=payload.user_id,
        tags=["prototype"],
    )
    db.add(kb_entry)
    db.commit()
    db.refresh(record)

    return schemas.BuilderPrototypeResponse(
        id=record.id,
        workspace_id=record.workspace_id,
        project_id=record.project_id,
        title=record.title,
        prompt=record.prompt,
        code=record.code,
        preview_html=record.preview_html,
        design_tokens=record.design_tokens or {},
        created_by=record.created_by,
        created_at=record.created_at,
    )


@router.get("/{workspace_id}/list", response_model=list[schemas.BuilderPrototypeResponse])
def list_builder_prototypes(workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    records = (
        db.query(models.BuilderPrototype)
        .filter(models.BuilderPrototype.workspace_id == workspace_id)
        .order_by(models.BuilderPrototype.created_at.desc())
        .all()
    )
    return [
        schemas.BuilderPrototypeResponse(
            id=record.id,
            workspace_id=record.workspace_id,
            project_id=record.project_id,
            title=record.title,
            prompt=record.prompt,
            code=record.code,
            preview_html=record.preview_html,
            design_tokens=record.design_tokens or {},
            created_by=record.created_by,
            created_at=record.created_at,
        )
        for record in records
    ]
