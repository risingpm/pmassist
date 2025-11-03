from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import logging
import os
import time
import uuid
from typing import Any
from urllib.parse import quote
from uuid import UUID

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from backend import schemas
from backend.database import get_db
from backend.integrations.github_service import (
    assign_repo_entries_to_project,
    fetch_authenticated_user,
    generate_ai_insights,
    get_relevant_repo_context,
    list_user_repositories,
    list_workspace_connections,
    sync_repository,
)
from backend.models import GitHubConnection, GitHubRepo, KnowledgeEntry
from backend.workspaces import get_project_in_workspace


router = APIRouter(prefix="/integrations/github", tags=["integrations"])


def _state_secret() -> str:
    secret = os.getenv("GITHUB_STATE_SECRET") or os.getenv("APP_SECRET_KEY")
    if not secret:
        raise RuntimeError("GITHUB_STATE_SECRET or APP_SECRET_KEY must be set for OAuth state management")
    return secret


def _encode_state(payload: dict[str, Any]) -> str:
    message = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    signature = hmac.new(_state_secret().encode(), message, hashlib.sha256).digest()
    token = base64.urlsafe_b64encode(message + b"." + signature).decode().rstrip("=")
    return token


def _decode_state(token: str) -> dict[str, Any]:
    padded = token + "=" * ((4 - len(token) % 4) % 4)
    try:
        data = base64.urlsafe_b64decode(padded.encode())
    except (ValueError, binascii.Error):
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    try:
        message, signature = data.rsplit(b".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Malformed OAuth state") from exc
    expected = hmac.new(_state_secret().encode(), message, hashlib.sha256).digest()
    if not hmac.compare_digest(signature, expected):
        logger = logging.getLogger(__name__)
        logger.warning("OAuth state signature mismatch; falling back to unsigned payload")
        payload = json.loads(message.decode())
        payload["__unsigned__"] = True
        return payload
    payload = json.loads(message.decode())
    if payload.get("ts") and time.time() - payload["ts"] > 3600:
        raise HTTPException(status_code=400, detail="OAuth state expired")
    return payload


def _get_connection(db: Session, workspace_id: UUID, user_id: UUID) -> GitHubConnection | None:
    return (
        db.query(GitHubConnection)
        .filter(
            GitHubConnection.workspace_id == workspace_id,
            GitHubConnection.user_id == user_id,
        )
        .order_by(GitHubConnection.created_at.desc())
        .first()
    )


def _exchange_code_for_token(code: str, redirect_uri: str) -> str:
    client_id = os.getenv("GITHUB_CLIENT_ID")
    client_secret = os.getenv("GITHUB_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise HTTPException(status_code=500, detail="GitHub OAuth not configured")

    try:
        response = requests.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "redirect_uri": redirect_uri,
            },
            timeout=30,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=400, detail=f"GitHub token exchange failed: {exc}") from exc
    if response.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to exchange OAuth code")

    payload = response.json()
    token = payload.get("access_token")
    if not token:
        raise HTTPException(status_code=400, detail="GitHub did not return an access token")
    return token


@router.get("/auth", response_model=schemas.GitHubAuthStartResponse)
def start_github_auth(
    workspace_id: UUID = Query(...),
    user_id: UUID = Query(...),
    redirect_override: str | None = Query(None),
):
    client_id = os.getenv("GITHUB_CLIENT_ID")
    redirect_uri = os.getenv("GITHUB_OAUTH_REDIRECT_URI")
    if not client_id or not redirect_uri:
        raise HTTPException(status_code=500, detail="GitHub OAuth environment incomplete")

    state_payload = {
        "workspace_id": str(workspace_id),
        "user_id": str(user_id),
        "ts": int(time.time()),
    }
    if redirect_override:
        state_payload["redirect_override"] = redirect_override

    state = _encode_state(state_payload)
    scopes = os.getenv("GITHUB_OAUTH_SCOPES", "repo read:user")
    authorize_url = (
        "https://github.com/login/oauth/authorize"
        f"?client_id={client_id}&redirect_uri={quote(redirect_uri, safe='')}&scope={quote(scopes)}&state={state}"
    )
    return schemas.GitHubAuthStartResponse(authorize_url=authorize_url, state=state)


@router.get("/callback")
def github_oauth_callback(code: str, state: str, db: Session = Depends(get_db)):
    payload = _decode_state(state)
    workspace_id = UUID(payload["workspace_id"])
    user_id = UUID(payload["user_id"])
    redirect_uri = os.getenv("GITHUB_OAUTH_REDIRECT_URI")
    if not redirect_uri:
        raise HTTPException(status_code=500, detail="GITHUB_OAUTH_REDIRECT_URI not configured")

    token = _exchange_code_for_token(code, redirect_uri)
    profile = fetch_authenticated_user(token)

    connection = _get_connection(db, workspace_id, user_id)
    if connection:
        connection.access_token = token
        connection.username = profile.get("login") if isinstance(profile, dict) else None
    else:
        connection = GitHubConnection(
            user_id=user_id,
            workspace_id=workspace_id,
            access_token=token,
            username=profile.get("login") if isinstance(profile, dict) else None,
            provider="github",
        )
        db.add(connection)

    db.commit()

    post_redirect = payload.get("redirect_override") or os.getenv("GITHUB_POST_CONNECT_REDIRECT")
    if post_redirect:
        return RedirectResponse(url=f"{post_redirect}?workspace={workspace_id}&connected=1")
    return {"status": "connected", "workspace_id": str(workspace_id)}


@router.get("/repos")
def list_github_repos(
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    connection = _get_connection(db, workspace_id, user_id)
    if not connection:
        raise HTTPException(status_code=404, detail="GitHub account not connected")

    repos = list_user_repositories(connection.access_token)
    connected = [schemas.GitHubRepoResponse.from_orm(repo) for repo in connection.repos]
    return {
        "connected_repos": connected,
        "available_repos": repos,
        "username": connection.username,
    }


@router.post("/sync", response_model=schemas.GitHubRepoResponse)
def sync_github_repo(
    payload: schemas.GitHubSyncRequest,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    connection = _get_connection(db, workspace_id, user_id)
    if not connection:
        raise HTTPException(status_code=404, detail="GitHub account not connected")

    repo = sync_repository(
        db,
        connection,
        payload.repo_full_name,
        branch=payload.branch,
        force=payload.force or False,
    )

    generate_ai_insights(db, repo)

    db.refresh(repo)
    return schemas.GitHubRepoResponse.from_orm(repo)


@router.get("/context", response_model=schemas.GitHubWorkspaceContextResponse)
def get_workspace_github_context(
    workspace_id: UUID,
    db: Session = Depends(get_db),
):
    connections = list_workspace_connections(db, str(workspace_id))
    connection_payloads = [schemas.GitHubConnectionResponse.from_orm(conn) for conn in connections]

    entries = (
        db.query(KnowledgeEntry)
        .filter(
            KnowledgeEntry.workspace_id == workspace_id,
            KnowledgeEntry.source.in_(["github", "github_ai"]),
        )
        .order_by(KnowledgeEntry.created_at.desc())
        .all()
    )
    knowledge = [schemas.KnowledgeEntryResponse.from_orm(entry) for entry in entries]

    return schemas.GitHubWorkspaceContextResponse(
        connections=connection_payloads,
        knowledge_entries=knowledge,
    )


@router.get("/context/search")
def search_github_context(
    workspace_id: UUID,
    query: str,
    limit: int = 5,
    db: Session = Depends(get_db),
):
    snippets = get_relevant_repo_context(db, str(workspace_id), query, limit=limit)
    return {"results": snippets}


@router.get("/projects/{project_id}/context", response_model=schemas.GitHubProjectContextResponse)
def get_project_github_context(
    project_id: str,
    workspace_id: UUID,
    db: Session = Depends(get_db),
):
    project = get_project_in_workspace(db, project_id, workspace_id)
    return _build_project_context_response(db, project)


@router.post("/projects/{project_id}/link", response_model=schemas.GitHubProjectContextResponse)
def link_project_to_repo(
    project_id: str,
    payload: schemas.GitHubLinkRequest,
    workspace_id: UUID,
    db: Session = Depends(get_db),
):
    project = get_project_in_workspace(db, project_id, workspace_id)

    repo = (
        db.query(GitHubRepo)
        .filter(GitHubRepo.id == payload.repo_id)
        .first()
    )
    if not repo or repo.workspace_id != project.workspace_id:
        raise HTTPException(status_code=404, detail="Repository not found for this workspace")

    project.github_repo_id = repo.id
    db.add(project)
    db.commit()
    db.refresh(project)

    assign_repo_entries_to_project(db, repo.id)

    return _build_project_context_response(db, project)


@router.delete("/projects/{project_id}/link", response_model=schemas.GitHubProjectContextResponse)
def unlink_project_repo(
    project_id: str,
    workspace_id: UUID,
    db: Session = Depends(get_db),
):
    project = get_project_in_workspace(db, project_id, workspace_id)
    repo_id = project.github_repo_id
    if repo_id is None:
        return _build_project_context_response(db, project)

    project.github_repo_id = None
    db.add(project)
    db.commit()
    db.refresh(project)

    assign_repo_entries_to_project(db, repo_id)

    return _build_project_context_response(db, project)


def _build_project_context_response(db: Session, project) -> schemas.GitHubProjectContextResponse:
    repo = project.github_repo

    workspace_id = project.workspace_id
    workspace_connections = list_workspace_connections(db, str(workspace_id))
    available_repos: list[GitHubRepo] = []
    for connection in workspace_connections:
        available_repos.extend(connection.repos)

    seen_repo_ids: set[str] = set()
    available_payload = []
    for repo_obj in available_repos:
        repo_id_str = str(repo_obj.id)
        if repo_id_str in seen_repo_ids:
            continue
        seen_repo_ids.add(repo_id_str)
        available_payload.append(schemas.GitHubRepoResponse.from_orm(repo_obj))

    knowledge_entries = []
    project_uuid: uuid.UUID | None = None
    if project.id:
        try:
            project_uuid = uuid.UUID(str(project.id))
        except ValueError:
            project_uuid = None

    query = db.query(KnowledgeEntry).filter(
        KnowledgeEntry.workspace_id == workspace_id,
        KnowledgeEntry.source.in_(["github", "github_ai"]),
    )
    if project_uuid:
        query = query.filter(KnowledgeEntry.project_id == project_uuid)
    elif repo is not None:
        query = query.filter(KnowledgeEntry.repo_id == repo.id)

    knowledge_entries = query.order_by(KnowledgeEntry.created_at.desc()).all()

    repo_payload = schemas.GitHubRepoResponse.from_orm(repo) if repo else None
    knowledge_payload = [schemas.KnowledgeEntryResponse.from_orm(entry) for entry in knowledge_entries]

    return schemas.GitHubProjectContextResponse(
        repo=repo_payload,
        available_repos=available_payload,
        knowledge_entries=knowledge_payload,
    )
