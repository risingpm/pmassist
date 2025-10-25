from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import base64
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

from .database import get_db
from . import models, schemas
from .workspaces import create_workspace_with_owner, get_current_workspace

router = APIRouter(prefix="/auth", tags=["auth"])


def _hash_password(password: str) -> str:
    salt = os.urandom(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
    return base64.b64encode(salt + derived).decode("utf-8")


def _verify_password(password: str, encoded: str) -> bool:
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

    return schemas.AuthResponse(
        id=user.id,
        email=user.email,
        workspace_id=workspace.id,
        workspace_name=workspace.name,
    )


@router.post("/login", response_model=schemas.AuthResponse)
def login(payload: schemas.AuthLogin, db: Session = Depends(get_db)):
    email_normalised = payload.email.strip().lower()
    user = db.query(models.User).filter(models.User.email == email_normalised).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not _verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    workspace = get_current_workspace(db, user.id)
    return schemas.AuthResponse(
        id=user.id,
        email=user.email,
        workspace_id=workspace.id if workspace else None,
        workspace_name=workspace.name if workspace else None,
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
