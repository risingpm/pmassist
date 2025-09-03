import os
import io
from docx import Document as DocxDocument
from PyPDF2 import PdfReader

def extract_text_from_file(filename: str, file_bytes: bytes) -> str:
    ext = os.path.splitext(filename)[1].lower()

    if ext in [".txt", ".md"]:
        return file_bytes.decode("utf-8", errors="ignore")

    elif ext == ".docx":
        file_stream = io.BytesIO(file_bytes)  # ✅ wrap in file-like object
        doc = DocxDocument(file_stream)
        return "\n".join([para.text for para in doc.paragraphs])

    elif ext == ".pdf":
        file_stream = io.BytesIO(file_bytes)  # ✅ wrap in file-like object
        reader = PdfReader(file_stream)
        text = []
        for page in reader.pages:
            text.append(page.extract_text() or "")
        return "\n".join(text)

    else:
        raise ValueError(f"Unsupported file type: {ext}")
