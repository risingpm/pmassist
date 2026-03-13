from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session, joinedload

from backend import models, schemas
from backend.database import get_db
from backend.rbac import ensure_membership

router = APIRouter(prefix="/billing", tags=["billing"])
logger = logging.getLogger(__name__)

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")
DEFAULT_SUCCESS_URL = os.getenv("STRIPE_SUCCESS_URL")
DEFAULT_CANCEL_URL = os.getenv("STRIPE_CANCEL_URL")
DEFAULT_PORTAL_RETURN_URL = os.getenv("STRIPE_PORTAL_RETURN_URL")

PLAN_PRICE_LOOKUP: dict[str, str | None] = {
    "pro": os.getenv("STRIPE_PRICE_PRO"),
}
PRICE_PLAN_LOOKUP: dict[str, str] = {
    price: plan for plan, price in PLAN_PRICE_LOOKUP.items() if price
}

if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY


def _require_stripe():
    if not STRIPE_SECRET_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe is not configured. Set STRIPE_SECRET_KEY.",
        )
    return stripe


def _normalize_url(value: Any | None) -> str | None:
    if value is None:
        return None
    return str(value)


def _resolve_success_url(raw_url: Any | None) -> str:
    url = _normalize_url(raw_url) or DEFAULT_SUCCESS_URL
    if not url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Missing STRIPE_SUCCESS_URL configuration.",
        )
    if "{CHECKOUT_SESSION_ID}" not in url:
        separator = "&" if "?" in url else "?"
        url = f"{url}{separator}session_id={{CHECKOUT_SESSION_ID}}"
    return url


def _resolve_cancel_url(raw_url: Any | None) -> str:
    url = _normalize_url(raw_url) or DEFAULT_CANCEL_URL or DEFAULT_SUCCESS_URL
    if not url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Missing STRIPE_CANCEL_URL configuration.",
        )
    return url


def _resolve_portal_return_url(raw_url: Any | None) -> str:
    url = _normalize_url(raw_url) or DEFAULT_PORTAL_RETURN_URL or DEFAULT_SUCCESS_URL or DEFAULT_CANCEL_URL
    if not url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Missing STRIPE_PORTAL_RETURN_URL configuration.",
        )
    return url


def _map_subscription_status(raw_status: str | None) -> schemas.BillingStatusLiteral:
    normalized = (raw_status or "").lower()
    mapping = {
        "trialing": "active",
        "active": "active",
        "past_due": "past_due",
        "unpaid": "past_due",
        "incomplete": "pending",
        "incomplete_expired": "canceled",
        "canceled": "canceled",
    }
    return mapping.get(normalized, "pending")


def _timestamp_to_datetime(value: Any | None) -> datetime | None:
    if value is None:
        return None
    try:
        return datetime.fromtimestamp(int(value), tz=timezone.utc)
    except (ValueError, TypeError, OSError):
        return None


def _stripe_object_to_dict(obj: Any | None) -> dict[str, Any]:
    if obj is None:
        return {}
    if isinstance(obj, dict):
        return obj
    to_dict = getattr(obj, "to_dict", None)
    if callable(to_dict):
        return to_dict()
    return {}


def _metadata_dict(source: Any | None) -> dict[str, Any]:
    data = _stripe_object_to_dict(source)
    return data if isinstance(data, dict) else {}


def _workspace_from_metadata(db: Session, metadata: dict[str, Any]) -> models.Workspace | None:
    workspace_id_value = metadata.get("workspace_id")
    if not workspace_id_value:
        return None
    try:
        workspace_id = UUID(str(workspace_id_value))
    except (TypeError, ValueError):
        return None
    return (
        db.query(models.Workspace)
        .filter(models.Workspace.id == workspace_id)
        .first()
    )


def _subscription_price_id(subscription_dict: dict[str, Any]) -> str | None:
    items = subscription_dict.get("items") or {}
    data = items.get("data") or []
    if not data:
        return None
    first_item = data[0] or {}
    price = first_item.get("price") or {}
    return price.get("id")


def _plan_from_subscription(subscription_dict: dict[str, Any]) -> str | None:
    metadata = _metadata_dict(subscription_dict.get("metadata"))
    plan = metadata.get("plan")
    if plan:
        return plan
    price_id = _subscription_price_id(subscription_dict)
    if price_id and price_id in PRICE_PLAN_LOOKUP:
        return PRICE_PLAN_LOOKUP[price_id]
    return None


def _apply_billing_update(
    db: Session,
    workspace: models.Workspace,
    *,
    plan: str | None,
    status: schemas.BillingStatusLiteral | None,
    customer_id: str | None = None,
    subscription_id: str | None = None,
    cancel_at: datetime | None = None,
    canceled_at: datetime | None = None,
) -> None:
    changed = False
    if plan and workspace.billing_plan != plan:
        workspace.billing_plan = plan
        changed = True
    if status and workspace.billing_status != status:
        workspace.billing_status = status
        changed = True
    if customer_id and workspace.stripe_customer_id != customer_id:
        workspace.stripe_customer_id = customer_id
        changed = True
    if subscription_id and workspace.stripe_subscription_id != subscription_id:
        workspace.stripe_subscription_id = subscription_id
        changed = True
    if cancel_at != workspace.billing_cancel_at:
        workspace.billing_cancel_at = cancel_at
        changed = True
    if canceled_at != workspace.billing_canceled_at:
        workspace.billing_canceled_at = canceled_at
        changed = True
    if changed:
        db.add(workspace)
        db.commit()


@router.post("/checkout", response_model=schemas.BillingCheckoutResponse)
def create_checkout_session(
    payload: schemas.BillingCheckoutRequest,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_membership(db, payload.workspace_id, user_id, required_role="admin")
    workspace = (
        db.query(models.Workspace)
        .options(joinedload(models.Workspace.owner))
        .filter(models.Workspace.id == payload.workspace_id)
        .first()
    )
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    price_id = PLAN_PRICE_LOOKUP.get(payload.plan)
    if not price_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Selected plan is not available for checkout.",
        )

    _require_stripe()

    customer_id = workspace.stripe_customer_id
    if not customer_id:
        owner_email = workspace.owner.email if workspace.owner and workspace.owner.email else None
        try:
            customer = stripe.Customer.create(
                email=owner_email,
                metadata={"workspace_id": str(workspace.id)},
            )
        except stripe.error.StripeError as exc:  # type: ignore[attr-defined]
            logger.exception("Unable to create Stripe customer for workspace %s", workspace.id)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Stripe is unavailable right now. Please try again.",
            ) from exc
        customer_id = customer.get("id")
        workspace.stripe_customer_id = customer_id

    success_url = _resolve_success_url(payload.success_url)
    cancel_url = _resolve_cancel_url(payload.cancel_url)

    try:
        session = stripe.checkout.Session.create(
            customer=customer_id,
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={"workspace_id": str(workspace.id), "plan": payload.plan},
            subscription_data={
                "metadata": {"workspace_id": str(workspace.id), "plan": payload.plan},
            },
        )
    except stripe.error.StripeError as exc:  # type: ignore[attr-defined]
        logger.exception("Unable to create Stripe checkout session for workspace %s", workspace.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to start checkout. Please try again.",
        ) from exc

    workspace.billing_plan = payload.plan
    workspace.billing_status = "pending"
    db.add(workspace)
    db.commit()
    db.refresh(workspace)

    return schemas.BillingCheckoutResponse(
        workspace_id=workspace.id,
        plan=payload.plan,
        checkout_url=session.url,
        session_id=session.id,
    )


@router.get(
    "/workspaces/{workspace_id}",
    response_model=schemas.WorkspaceBillingStatus,
)
def get_workspace_billing_status(workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    workspace = db.query(models.Workspace).filter(models.Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    plan = workspace.billing_plan or "trial"
    status_value = workspace.billing_status or "inactive"
    return schemas.WorkspaceBillingStatus(
        workspace_id=workspace.id,
        plan=plan,
        status=status_value,
        stripe_customer_id=workspace.stripe_customer_id,
        stripe_subscription_id=workspace.stripe_subscription_id,
        cancel_at=workspace.billing_cancel_at,
        canceled_at=workspace.billing_canceled_at,
    )


def _construct_event(payload: bytes, signature: str | None):
    if STRIPE_WEBHOOK_SECRET:
        try:
            return stripe.Webhook.construct_event(payload, signature, STRIPE_WEBHOOK_SECRET)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook payload") from exc
        except stripe.error.SignatureVerificationError as exc:  # type: ignore[attr-defined]
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook signature") from exc
    try:
        decoded = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook payload") from exc
    return stripe.Event.construct_from(decoded, stripe.api_key)


def _handle_checkout_completed(db: Session, session_obj: Any) -> None:
    payload = _stripe_object_to_dict(session_obj)
    metadata = _metadata_dict(payload.get("metadata"))
    workspace = _workspace_from_metadata(db, metadata)
    subscription_id = payload.get("subscription")
    customer_id = payload.get("customer")
    plan = metadata.get("plan") or workspace.billing_plan if workspace else None
    status_value: schemas.BillingStatusLiteral = "active"

    subscription_dict: dict[str, Any] = {}
    if subscription_id and STRIPE_SECRET_KEY:
        try:
            subscription = stripe.Subscription.retrieve(subscription_id)
            subscription_dict = _stripe_object_to_dict(subscription)
        except stripe.error.StripeError as exc:  # type: ignore[attr-defined]
            logger.warning("Unable to fetch subscription %s: %s", subscription_id, exc)

    if not workspace and subscription_dict:
        workspace = _workspace_from_metadata(db, _metadata_dict(subscription_dict.get("metadata")))

    cancel_at_dt = None
    canceled_at_dt = None
    if subscription_dict:
        status_value = _map_subscription_status(subscription_dict.get("status"))
        derived_plan = _plan_from_subscription(subscription_dict)
        plan = derived_plan or plan
        cancel_at_dt = _timestamp_to_datetime(subscription_dict.get("cancel_at"))
        canceled_at_dt = _timestamp_to_datetime(subscription_dict.get("canceled_at"))

    if not workspace:
        logger.warning("Stripe checkout completion missing workspace context. metadata=%s", metadata)
        return

    _apply_billing_update(
        db,
        workspace,
        plan=plan or workspace.billing_plan or "trial",
        status=status_value,
        customer_id=customer_id,
        subscription_id=subscription_id,
        cancel_at=cancel_at_dt,
        canceled_at=canceled_at_dt,
    )


def _handle_subscription_event(db: Session, subscription_obj: Any) -> None:
    subscription_dict = _stripe_object_to_dict(subscription_obj)
    metadata = _metadata_dict(subscription_dict.get("metadata"))
    workspace = _workspace_from_metadata(db, metadata)
    if not workspace:
        logger.warning("Subscription event missing workspace metadata. metadata=%s", metadata)
        return
    plan = _plan_from_subscription(subscription_dict) or workspace.billing_plan or "trial"
    status_value = _map_subscription_status(subscription_dict.get("status"))
    customer_id = subscription_dict.get("customer")
    subscription_id = subscription_dict.get("id")
    cancel_at_dt = _timestamp_to_datetime(subscription_dict.get("cancel_at"))
    canceled_at_dt = _timestamp_to_datetime(subscription_dict.get("canceled_at"))
    _apply_billing_update(
        db,
        workspace,
        plan=plan,
        status=status_value,
        customer_id=customer_id,
        subscription_id=subscription_id,
        cancel_at=cancel_at_dt,
        canceled_at=canceled_at_dt,
    )


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    payload = await request.body()
    signature = request.headers.get("stripe-signature")
    event = _construct_event(payload, signature)
    event_type = event["type"]
    data_object = event["data"]["object"]

    if event_type == "checkout.session.completed":
        _handle_checkout_completed(db, data_object)
    elif event_type in {
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    }:
        _handle_subscription_event(db, data_object)

    return JSONResponse({"received": True})


@router.post("/confirm", response_model=schemas.WorkspaceBillingStatus)
def confirm_checkout_session(
    payload: schemas.BillingConfirmRequest,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_membership(db, payload.workspace_id, user_id, required_role="viewer")
    _require_stripe()
    try:
        session = stripe.checkout.Session.retrieve(payload.session_id)
    except stripe.error.InvalidRequestError as exc:  # type: ignore[attr-defined]
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid checkout session") from exc

    metadata = _metadata_dict(session.get("metadata"))
    workspace_meta_id = metadata.get("workspace_id")
    if not workspace_meta_id or str(payload.workspace_id) != str(workspace_meta_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Session does not belong to this workspace")

    _handle_checkout_completed(db, session)

    workspace = db.query(models.Workspace).filter(models.Workspace.id == payload.workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found after confirmation")

    return schemas.WorkspaceBillingStatus(
        workspace_id=workspace.id,
        plan=workspace.billing_plan or "trial",
        status=workspace.billing_status or "inactive",
        stripe_customer_id=workspace.stripe_customer_id,
        stripe_subscription_id=workspace.stripe_subscription_id,
        cancel_at=workspace.billing_cancel_at,
        canceled_at=workspace.billing_canceled_at,
    )


@router.post("/portal", response_model=schemas.BillingPortalResponse)
def create_billing_portal_session(
    payload: schemas.BillingPortalRequest,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_membership(db, payload.workspace_id, user_id, required_role="viewer")
    workspace = db.query(models.Workspace).filter(models.Workspace.id == payload.workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    if not workspace.stripe_customer_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer not available for portal access")
    _require_stripe()
    return_url = _resolve_portal_return_url(payload.return_url)
    try:
        session = stripe.billing_portal.Session.create(
            customer=workspace.stripe_customer_id,
            return_url=return_url,
        )
    except stripe.error.StripeError as exc:  # type: ignore[attr-defined]
        logger.exception("Unable to create billing portal session for workspace %s", workspace.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to open the billing portal right now. Try again shortly.",
        ) from exc
    return schemas.BillingPortalResponse(portal_url=session.url)
