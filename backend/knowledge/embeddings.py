from typing import Sequence
from uuid import UUID

from sqlalchemy.orm import Session

from backend.ai_providers import get_openai_client


def generate_embedding(
    text: str,
    *,
    db: Session | None = None,
    workspace_id: UUID | None = None,
) -> Sequence[float]:
    """
    Generate an embedding for a chunk of text using OpenAI.
    """
    client = get_openai_client(db, workspace_id)
    response = client.embeddings.create(
        model="text-embedding-3-small",  # ✅ efficient and cheap
        input=text,
    )
    return response.data[0].embedding
