import re

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50):
    """
    Splits text into chunks of ~chunk_size words with overlap.
    Default: 500 words per chunk, 50 word overlap.
    """
    words = re.split(r"\s+", text)
    chunks = []

    start = 0
    while start < len(words):
        end = start + chunk_size
        chunk = " ".join(words[start:end])
        chunks.append(chunk)
        start += chunk_size - overlap  # move with overlap

    return chunks
