import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.models import Base

# Support PostgreSQL, fallback to SQLite for local without docker
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SQLITE_PATH = os.path.join(BASE_DIR, "credit_system.db").replace("\\", "/")
DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    f"sqlite:///{DEFAULT_SQLITE_PATH}"
)

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
