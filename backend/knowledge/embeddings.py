import os
from openai import OpenAI

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def generate_embedding(text: str):
    """
    Generate an embedding for a chunk of text using OpenAI.
    """
    response = client.embeddings.create(
        model="text-embedding-3-small",  # ✅ efficient and cheap
        input=text
    )
    return response.data[0].embedding
