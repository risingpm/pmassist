import os
from openai import OpenAI

_openai_kwargs = {"api_key": os.getenv("OPENAI_API_KEY")}
_openai_org = os.getenv("OPENAI_ORG")
if _openai_org:
    _openai_kwargs["organization"] = _openai_org
client = OpenAI(**_openai_kwargs)

def generate_embedding(text: str):
    """
    Generate an embedding for a chunk of text using OpenAI.
    """
    response = client.embeddings.create(
        model="text-embedding-3-small",  # ✅ efficient and cheap
        input=text
    )
    return response.data[0].embedding
