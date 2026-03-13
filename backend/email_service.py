import logging
import os
from datetime import datetime

import requests


logger = logging.getLogger(__name__)


class EmailConfigurationError(RuntimeError):
    """Raised when invite email delivery is not properly configured."""


class EmailDeliveryError(RuntimeError):
    """Raised when the email provider rejects or fails a request."""


def _require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise EmailConfigurationError(f"{name} must be set to send workspace invitations.")
    return value


def _build_invite_link(token: str) -> str:
    custom_template = os.getenv("INVITE_ACCEPT_URL", "").strip()
    if custom_template:
        try:
            return custom_template.format(token=token)
        except Exception as exc:  # pragma: no cover - defensive
            raise EmailConfigurationError("INVITE_ACCEPT_URL must include a '{token}' placeholder.") from exc

    app_base = os.getenv("WORKSPACE_APP_URL") or os.getenv("APP_BASE_URL") or "http://localhost:5175"
    app_base = app_base.rstrip("/")
    return f"{app_base}/signin?invite={token}"


def send_workspace_invite_email(
    *,
    recipient_email: str,
    workspace_name: str,
    role: str,
    invite_token: str,
    expires_at: datetime,
    inviter_name: str | None = None,
) -> None:
    """
    Send a transactional invite email via Resend. Raises on failure so callers can roll back DB state.
    """

    api_key = _require_env("RESEND_API_KEY")
    sender = _require_env("INVITE_EMAIL_SENDER")
    invite_link = _build_invite_link(invite_token)

    inviter_label = inviter_name or "A teammate"
    expires_label = expires_at.strftime("%B %d, %Y")
    role_label = role.title()

    subject = f"You're invited to join {workspace_name} on PM Assist"

    html_body = f"""
    <p>Hi there,</p>
    <p><strong>{inviter_label}</strong> invited you to join the workspace <strong>{workspace_name}</strong> as a <strong>{role_label}</strong>.</p>
    <p>Click the button below to accept. This invite expires on {expires_label}.</p>
    <p style="margin:20px 0;">
      <a href="{invite_link}" style="background-color:#111827;color:#ffffff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;">
        Accept invitation
      </a>
    </p>
    <p>If the button does not work, copy and paste this link into your browser:</p>
    <p style="font-family:monospace;font-size:13px;">{invite_link}</p>
    <p>— The PM Assist team</p>
    """.strip()

    text_body = (
        f"{inviter_label} invited you to join {workspace_name} as a {role_label}. "
        f"Accept before {expires_label}: {invite_link}"
    )

    payload = {
        "from": sender,
        "to": [recipient_email],
        "subject": subject,
        "html": html_body,
        "text": text_body,
    }

    try:
        response = requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=10,
        )
    except requests.RequestException as exc:  # pragma: no cover - network failure path
        raise EmailDeliveryError("Failed to reach the email provider.") from exc

    if response.status_code >= 400:
        raise EmailDeliveryError(
            f"Email provider returned {response.status_code}: {response.text}",
        )

    logger.info("Workspace invite email queued via Resend for %s", recipient_email)
