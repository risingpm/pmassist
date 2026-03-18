from typing import Sequence
from uuid import UUID

from sqlalchemy.orm import Session

from backend.ai_providers import get_openai_client, metered_embedding_create


def generate_embedding(
    text: str,
    *,
    db: Session | None = None,
    workspace_id: UUID | None = None,
    user_id: UUID | None = None,
) -> Sequence[float]:
    """
    Generate an embedding for a chunk of text using OpenAI.
    """
    if db and workspace_id:
        response = metered_embedding_create(
            db,
            workspace_id=workspace_id,
            user_id=user_id,
            feature="embedding.generate",
            model="text-embedding-3-small",
            input_text=text,
        )
    else:
        client = get_openai_client(db, workspace_id)
        response = client.embeddings.create(
            model="text-embedding-3-small",  # ✅ efficient and cheap
            input=text,
        )
    return response.data[0].embedding
