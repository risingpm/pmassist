from __future__ import annotations

import base64
import hashlib
import os
from functools import lru_cache
from typing import Any
from uuid import UUID

try:
    from cryptography.fernet import Fernet, InvalidToken  # type: ignore
    _CRYPTO_IMPORT_ERROR: Exception | None = None
except ModuleNotFoundError as exc:  # pragma: no cover - optional dependency warning
    Fernet = None  # type: ignore[assignment]
    InvalidToken = Exception  # type: ignore[assignment]
    _CRYPTO_IMPORT_ERROR = exc
from openai import OpenAI
from sqlalchemy.orm import Session

from backend import models
from backend.token_metering import record_openai_usage

DEFAULT_DEV_CREDENTIAL_SECRET = "pmassist-dev-secret"
DEFAULT_OPENAI_KWARGS: dict[str, Any] = {}
_env_api_key = os.getenv("OPENAI_API_KEY")
if _env_api_key:
    DEFAULT_OPENAI_KWARGS["api_key"] = _env_api_key
_env_org = os.getenv("OPENAI_ORG")
if _env_org:
    DEFAULT_OPENAI_KWARGS["organization"] = _env_org
# NOTE: The OpenAI Python SDK currently does not accept a `project` kwarg on the client,
# so we ignore OPENAI_PROJECT for now to avoid runtime errors.


def _ensure_crypto() -> None:
    if Fernet is None:
        message = (
            "The 'cryptography' package is required to encrypt AI credentials. "
            "Install it via `pip install cryptography`."
        )
        raise RuntimeError(message) from _CRYPTO_IMPORT_ERROR


def _get_cipher() -> Fernet:
    _ensure_crypto()
    secret = os.getenv("AI_CREDENTIALS_SECRET") or os.getenv("APP_SECRET_KEY") or DEFAULT_DEV_CREDENTIAL_SECRET
    key = hashlib.sha256(secret.encode("utf-8")).digest()
    token = base64.urlsafe_b64encode(key)
    return Fernet(token)


def encrypt_secret(value: str) -> str:
    cipher = _get_cipher()
    return cipher.encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_secret(value: str) -> str:
    cipher = _get_cipher()
    try:
        return cipher.decrypt(value.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:  # pragma: no cover - safety net for corrupted secrets
        raise RuntimeError("Unable to decrypt stored OpenAI credential. Check AI_CREDENTIALS_SECRET.") from exc


def _load_workspace_credential(db: Session, workspace_id: UUID) -> models.WorkspaceAICredential | None:
    return (
        db.query(models.WorkspaceAICredential)
        .filter(models.WorkspaceAICredential.workspace_id == workspace_id, models.WorkspaceAICredential.provider == "openai")
        .first()
    )


def _load_global_credential(db: Session) -> models.TenantAICredential | None:
    return (
        db.query(models.TenantAICredential)
        .filter(models.TenantAICredential.provider == "openai")
        .order_by(models.TenantAICredential.updated_at.desc())
        .first()
    )


def build_openai_kwargs(db: Session | None, workspace_id: UUID | None) -> dict[str, Any]:
    kwargs = dict(DEFAULT_OPENAI_KWARGS)
    if db:
        global_record = _load_global_credential(db)
        if global_record:
            kwargs["api_key"] = decrypt_secret(global_record.api_key_encrypted)
            if global_record.organization:
                kwargs["organization"] = global_record.organization.strip()
            elif "organization" in kwargs:
                kwargs.pop("organization")
            return kwargs
    if workspace_id and db:
        record = _load_workspace_credential(db, workspace_id)
        if record:
            kwargs["api_key"] = decrypt_secret(record.api_key_encrypted)
            if record.organization:
                kwargs["organization"] = record.organization.strip()
            elif "organization" in kwargs:
                kwargs.pop("organization")
    if "api_key" not in kwargs or not kwargs["api_key"]:
        raise RuntimeError("OPENAI_API_KEY or workspace-specific key must be configured.")
    return kwargs


def get_openai_client(db: Session | None, workspace_id: UUID | None) -> OpenAI:
    kwargs = build_openai_kwargs(db, workspace_id)
    return OpenAI(**kwargs)


def test_openai_credentials(api_key: str, *, organization: str | None = None, project: str | None = None) -> None:
    kwargs: dict[str, Any] = {"api_key": api_key.strip()}
    if organization:
        kwargs["organization"] = organization.strip()
    client = OpenAI(**kwargs)
    client.models.list()


def metered_chat_completion(
    db: Session,
    *,
    workspace_id: UUID,
    user_id: UUID | None,
    feature: str,
    model: str,
    messages: list[dict[str, Any]],
    temperature: float | None = None,
    max_tokens: int | None = None,
    timeout: float | None = None,
    response_format: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
    **extra: Any,
):
    client = get_openai_client(db, workspace_id)
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
    }
    if temperature is not None:
        payload["temperature"] = temperature
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens
    if timeout is not None:
        payload["timeout"] = timeout
    if response_format is not None:
        payload["response_format"] = response_format
    payload.update(extra)

    response = client.chat.completions.create(**payload)
    try:
        record_openai_usage(
            db,
            workspace_id=workspace_id,
            user_id=user_id,
            feature=feature,
            model=model,
            usage=getattr(response, "usage", None),
            request_id=getattr(response, "id", None),
            metadata=metadata,
        )
    except Exception:
        # Metering should never fail user-facing generation.
        pass
    return response


def metered_embedding_create(
    db: Session,
    *,
    workspace_id: UUID,
    user_id: UUID | None,
    feature: str,
    model: str,
    input_text: str,
    metadata: dict[str, Any] | None = None,
):
    client = get_openai_client(db, workspace_id)
    response = client.embeddings.create(model=model, input=input_text)
    try:
        record_openai_usage(
            db,
            workspace_id=workspace_id,
            user_id=user_id,
            feature=feature,
            model=model,
            usage=getattr(response, "usage", None),
            request_id=None,
            metadata=metadata,
        )
    except Exception:
        pass
    return response


def upsert_workspace_openai_credentials(
    db: Session,
    *,
    workspace_id: UUID,
    api_key: str,
    organization: str | None,
    project: str | None,
    user_id: UUID,
) -> models.WorkspaceAICredential:
    record = _load_workspace_credential(db, workspace_id)
    encrypted = encrypt_secret(api_key.strip())
    organization_value = organization.strip() if organization else None
    project_value = project.strip() if project else None

    if record:
        record.api_key_encrypted = encrypted
        record.organization = organization_value
        record.project = project_value
        record.updated_by = user_id
    else:
        record = models.WorkspaceAICredential(
            workspace_id=workspace_id,
            provider="openai",
            api_key_encrypted=encrypted,
            organization=organization_value,
            project=project_value,
            created_by=user_id,
            updated_by=user_id,
        )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def delete_workspace_openai_credentials(db: Session, *, workspace_id: UUID) -> None:
    record = _load_workspace_credential(db, workspace_id)
    if not record:
        return
    db.delete(record)
    db.commit()


def get_global_openai_credential(db: Session) -> models.TenantAICredential | None:
    return _load_global_credential(db)


def upsert_global_openai_credentials(
    db: Session,
    *,
    api_key: str,
    organization: str | None,
    project: str | None,
    user_id: UUID,
) -> models.TenantAICredential:
    record = _load_global_credential(db)
    encrypted = encrypt_secret(api_key.strip())
    organization_value = organization.strip() if organization else None
    project_value = project.strip() if project else None
    if record:
        record.api_key_encrypted = encrypted
        record.organization = organization_value
        record.project = project_value
        record.updated_by = user_id
    else:
        record = models.TenantAICredential(
            provider="openai",
            api_key_encrypted=encrypted,
            organization=organization_value,
            project=project_value,
            created_by=user_id,
            updated_by=user_id,
        )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def delete_global_openai_credentials(db: Session) -> None:
    record = _load_global_credential(db)
    if not record:
        return
    db.delete(record)
    db.commit()
