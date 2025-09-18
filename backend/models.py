from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from sqlalchemy.types import UserDefinedType
from sqlalchemy.orm import relationship
import uuid

from .database import Base

# ✅ Custom pgvector type for SQLAlchemy
class Vector(UserDefinedType):
    def get_col_spec(self, **kw):
        return "vector(1536)"   # fixed size for OpenAI embeddings

    def bind_processor(self, dialect):
        def process(value):
            return value
        return process

    def result_processor(self, dialect, coltype):
        def process(value):
            return value
        return process


# ✅ Project Model
class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, index=True)
    description = Column(String)
    goals = Column(String)

    # Relationships
    roadmaps = relationship("Roadmap", back_populates="project", cascade="all, delete-orphan")
    prds = relationship("PRD", back_populates="project", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="project", cascade="all, delete-orphan")


# ✅ Roadmap Model
class Roadmap(Base):
    __tablename__ = "roadmaps"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    content = Column(JSONB, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_active = Column(Boolean, default=True)

    # Relationship
    project = relationship("Project", back_populates="roadmaps")


# ✅ PRD Model (updated with explicit fields)
class PRD(Base):
    __tablename__ = "prds"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)

    # 🔹 NEW: store full Markdown PRD as plain text
    content = Column(String, nullable=True)  

    # (Optional) keep structured fields for backward compatibility
    description = Column(String, nullable=True)
    goals = Column(String, nullable=True)
    feature_name = Column(String, nullable=True)

    version = Column(Integer, default=1)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationship
    project = relationship("Project", back_populates="prds")




# ✅ Document Model
class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String, nullable=False)
    chunk_index = Column(String, nullable=False)
    content = Column(String, nullable=False)
    embedding = Column(Vector)  # pgvector column
    uploaded_at = Column(DateTime, server_default=func.now())

    # Relationship
    project = relationship("Project", back_populates="documents")
