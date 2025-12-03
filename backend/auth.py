from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_
import base64
import hashlib
import hmac
import json
import os
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID
import requests

from .database import get_db
from . import models, schemas
from .workspaces import create_workspace_with_owner, get_current_workspace
from backend.rbac import normalize_role

router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_TOKEN_INFO_URL = "https://oauth2.googleapis.com/tokeninfo"
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
DEMO_WORKSPACE_NAME = "Demo Workspace"
DEMO_PROJECT_TITLE = "Launch the Unified PM Hub"
DEMO_PROJECT_DESCRIPTION = "Centralized hub for planning, prioritization, and shipping with an AI copilot."
DEMO_PROJECT_GOALS = "Highlight AI-assisted workflows, keep demo data in sync, and guide PMs to value quickly."
DEMO_PROJECT_PERSONAS = ["Product Managers", "Delivery Leads"]
DEMO_PRD_CONTENT = """# Unified PM Hub — Demo PRD

## Executive Summary
PM Assist helps PMs move ideas to execution faster. This demo space shows how PRDs, roadmaps, and Kanban stay connected with AI.

## Goals
- Showcase AI Coach and template workflows
- Provide a safe sandbox for exploring rituals
- Encourage creating a first project with AI

## Functional Requirements
1. Demo PRD with a structured outline
2. Roadmap split into MVP vs Phase 2
3. Kanban tasks mapped to roadmap items
4. Quick CTA to talk with the AI Coach

## Success Metrics
- Time-to-first-insight under 5 minutes
- At least two AI interactions
- User launches their own project from a template

## Launch Considerations
- Make it clear demo data is safe to explore
- Encourage inviting teammates after confidence
- Remind users they can ask the AI Coach anything"""
DEMO_ROADMAP = {
    "mvp": [
        {
            "title": "Guided walkthrough",
            "description": "Surface onboarding tips so PMs know where to click first.",
            "status": "in-progress",
        },
        {
            "title": "Template-powered PRD creation",
            "description": "Pair templates with AI prompts to auto-generate specs.",
            "status": "in-progress",
        },
    ],
    "phase_2": [
        {
            "title": "Team invites + collaboration",
            "description": "Prompt users to bring in Eng + Design once ready.",
            "status": "planned",
        },
        {
            "title": "Live integrations",
            "description": "Connect Jira, Slack, and Notion actions from AI Coach.",
            "status": "planned",
        },
    ],
}
DEMO_TASKS = [
    {
        "title": "Explore the demo PRD",
        "description": "Review the sample spec to see how AI fills in each section.",
        "status": "todo",
        "priority": "medium",
        "due_in_days": 1,
    },
    {
        "title": "Review the roadmap milestones",
        "description": "Check how MVP vs Phase 2 items are organized and edit freely.",
        "status": "in_progress",
        "priority": "medium",
        "due_in_days": 2,
    },
    {
        "title": "Complete your first Kanban card",
        "description": "Drag a task to Done to see the workflow update instantly.",
        "status": "done",
        "priority": "low",
        "due_in_days": 0,
    },
]


def _hash_password(password: str) -> str:
    salt = os.urandom(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
    return base64.b64encode(salt + derived).decode("utf-8")


def _verify_password(password: str, encoded: str | None) -> bool:
    if not encoded:
        return False
    try:
        decoded = base64.b64decode(encoded.encode("utf-8"))
    except Exception:
        return False

    if len(decoded) < 17:
        return False

    salt, stored_hash = decoded[:16], decoded[16:]
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
    return hmac.compare_digest(stored_hash, candidate)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _auth_response_for_user(db: Session, user: models.User, workspace_hint: models.Workspace | None = None) -> schemas.AuthResponse:
    workspace = workspace_hint or get_current_workspace(db, user.id)
    role = None
    workspace_id = None
    workspace_name = None
    if workspace:
        workspace_id = workspace.id
        workspace_name = workspace.name
        membership = (
            db.query(models.WorkspaceMember)
            .filter(
                models.WorkspaceMember.workspace_id == workspace.id,
                models.WorkspaceMember.user_id == user.id,
            )
            .first()
        )
        role = normalize_role(membership.role) if membership else None
    return schemas.AuthResponse(
        id=user.id,
        email=user.email,
        workspace_id=workspace_id,
        workspace_name=workspace_name,
        workspace_role=role,
    )


@router.post("/signup", response_model=schemas.AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: schemas.AuthCreate, db: Session = Depends(get_db)):
    email_normalised = payload.email.strip().lower()
    if not email_normalised:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is required")

    existing = db.query(models.User).filter(models.User.email == email_normalised).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already in use")

    password_hash = _hash_password(payload.password)
    user = models.User(email=email_normalised, password_hash=password_hash)
    db.add(user)
    db.commit()
    db.refresh(user)

    workspace_name = f"{payload.email.split('@')[0]}'s Workspace"
    workspace = create_workspace_with_owner(db, name=workspace_name, owner_id=user.id)

    return _auth_response_for_user(db, user, workspace_hint=workspace)


@router.post("/login", response_model=schemas.AuthResponse)
def login(payload: schemas.AuthLogin, db: Session = Depends(get_db)):
    email_normalised = payload.email.strip().lower()
    user = db.query(models.User).filter(models.User.email == email_normalised).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not _verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    return _auth_response_for_user(db, user)


@router.post("/google", response_model=schemas.AuthResponse)
def google_login(payload: schemas.GoogleAuthRequest, db: Session = Depends(get_db)):
    credential = (payload.credential or "").strip()
    if not credential:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing Google credential.")

    try:
        response = requests.get(
            GOOGLE_TOKEN_INFO_URL,
            params={"id_token": credential},
            timeout=10,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to verify Google token.") from exc

    if response.status_code != 200:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google credential.")

    token_data = response.json()
    audience = token_data.get("aud")
    if GOOGLE_CLIENT_ID and audience != GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google credential is not meant for this app.")

    email = (token_data.get("email") or "").strip().lower()
    sub = token_data.get("sub")
    email_verified = str(token_data.get("email_verified", "")).lower() in {"true", "1"}
    if not email or not sub:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google profile missing email or id.")
    if not email_verified:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google email must be verified.")

    display_name = token_data.get("name")
    user = (
        db.query(models.User)
        .filter(or_(models.User.google_sub == sub, models.User.email == email))
        .first()
    )
    workspace = None
    if not user:
        user = models.User(email=email, google_sub=sub, display_name=display_name)
        db.add(user)
        db.commit()
        db.refresh(user)
        default_name = display_name or email.split("@")[0]
        workspace = create_workspace_with_owner(
            db,
            name=f"{default_name}'s Workspace",
            owner_id=user.id,
        )
    else:
        updated = False
        if user.google_sub is None:
            user.google_sub = sub
            updated = True
        if not user.display_name and display_name:
            user.display_name = display_name
            updated = True
        if updated:
            db.add(user)
            db.commit()
            db.refresh(user)
        workspace = get_current_workspace(db, user.id)
        if not workspace:
            fallback = display_name or email.split("@")[0]
            workspace = create_workspace_with_owner(
                db,
                name=f"{fallback}'s Workspace",
                owner_id=user.id,
            )

    return _auth_response_for_user(db, user, workspace_hint=workspace)


@router.post("/initialize", response_model=schemas.AuthInitializeResponse)
def initialize_demo(payload: schemas.AuthInitializeRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    workspace = get_current_workspace(db, user.id)
    created_workspace = False
    if workspace is None:
        workspace = create_workspace_with_owner(db, name=DEMO_WORKSPACE_NAME, owner_id=user.id)
        created_workspace = True

    project = (
        db.query(models.Project)
        .filter(models.Project.workspace_id == workspace.id)
        .order_by(models.Project.created_at.asc())
        .first()
    )

    has_demo = False
    if created_workspace or project is None:
        project = _create_demo_project(db, workspace.id, user.id)
        has_demo = True

    return schemas.AuthInitializeResponse(
        workspace_id=workspace.id,
        project_id=project.id if project else None,
        has_demo=has_demo,
    )


@router.post("/logout")
def logout():
    return {"status": "ok"}


@router.post("/forgot-password", response_model=schemas.ForgotPasswordResponse)
def forgot_password(payload: schemas.ForgotPasswordRequest, db: Session = Depends(get_db)):
    email_normalised = payload.email.strip().lower()
    user = db.query(models.User).filter(models.User.email == email_normalised).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    token = secrets.token_urlsafe(32)
    token_hash = _hash_token(token)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)

    reset = models.PasswordResetToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(reset)
    db.commit()

    return schemas.ForgotPasswordResponse(reset_token=token, expires_at=reset.expires_at)


@router.post("/reset-password")
def reset_password(payload: schemas.ResetPasswordRequest, db: Session = Depends(get_db)):
    hashed = _hash_token(payload.token)
    now = datetime.now(timezone.utc)

    entry = (
        db.query(models.PasswordResetToken)
        .filter(
            models.PasswordResetToken.token_hash == hashed,
            models.PasswordResetToken.used_at.is_(None),
            models.PasswordResetToken.expires_at > now,
        )
        .first()
    )

    if not entry:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")

    user = db.query(models.User).filter(models.User.id == entry.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")

    user.password_hash = _hash_password(payload.new_password)
    entry.used_at = now
    db.add(user)
    db.add(entry)
    db.commit()

    return {"status": "password_reset"}


def _create_demo_project(db: Session, workspace_id: UUID, user_id: UUID) -> models.Project:
    project = models.Project(
        title=DEMO_PROJECT_TITLE,
        description=DEMO_PROJECT_DESCRIPTION,
        goals=DEMO_PROJECT_GOALS,
        north_star_metric="Activated demo users",
        target_personas=DEMO_PROJECT_PERSONAS,
        workspace_id=workspace_id,
    )
    db.add(project)
    db.flush()

    db.add(models.ProjectMember(project_id=project.id, user_id=user_id, role="owner"))

    prd = models.PRD(
        project_id=project.id,
        workspace_id=workspace_id,
        feature_name="Unified PM Hub",
        description=DEMO_PROJECT_DESCRIPTION,
        goals=DEMO_PROJECT_GOALS,
        content=DEMO_PRD_CONTENT,
    )
    db.add(prd)

    roadmap = models.Roadmap(
        project_id=project.id,
        workspace_id=workspace_id,
        content=json.dumps(DEMO_ROADMAP, indent=2),
    )
    db.add(roadmap)

    now = datetime.now(timezone.utc)
    created_tasks: list[models.Task] = []
    for spec in DEMO_TASKS:
        due_date = None
        offset = spec.get("due_in_days")
        if isinstance(offset, int):
            due_date = now + timedelta(days=offset)
        created_tasks.append(
            models.Task(
                workspace_id=workspace_id,
                project_id=project.id,
                title=spec["title"],
                description=spec.get("description"),
                status=spec["status"],
                priority=spec["priority"],
                due_date=due_date,
                created_by=user_id,
            )
        )
    db.add_all(created_tasks)
    db.commit()
    db.refresh(project)
    return project
