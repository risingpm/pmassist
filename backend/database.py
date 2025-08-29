from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Paste your Supabase connection string here
DATABASE_URL = "postgresql://postgres.ydgciehybkvfehxfarud:RisingPM-2025@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require"


engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
