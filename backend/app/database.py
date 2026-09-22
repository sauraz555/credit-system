import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.models import Base

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SQLITE_PATH = os.path.join(BASE_DIR, "credit_system.db").replace("\\", "/")

ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
DATABASE_URL = os.getenv("DATABASE_URL")

if ENVIRONMENT == "production":
    if not DATABASE_URL or not (DATABASE_URL.startswith("postgresql://") or DATABASE_URL.startswith("postgres://")):
        raise RuntimeError(
            "CRITICAL PRODUCTION CONFIG ERROR: SQLite fallback is strictly prohibited in production. "
            "A valid PostgreSQL connection string must be provided via DATABASE_URL."
        )
else:
    if not DATABASE_URL:
        DATABASE_URL = f"sqlite:///{DEFAULT_SQLITE_PATH}"

# Connect args specific to sqlite for multi-threading
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL, 
    connect_args=connect_args
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    Base.metadata.create_all(bind=engine)
    # Safe lightweight column migration for local SQLite dev database
    with engine.connect() as conn:
        for col, tbl, typ in [
            ("identifier_blind_index", "entities", "VARCHAR"),
            ("entity_id", "users", "VARCHAR"),
            ("totp_secret", "users", "VARCHAR"),
            ("mfa_enabled", "users", "BOOLEAN DEFAULT 0"),
            ("details", "audit_log", "JSON")
        ]:
            try:
                conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN {col} {typ}"))
                conn.commit()
            except Exception:
                pass
