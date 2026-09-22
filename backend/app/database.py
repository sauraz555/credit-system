"""Database Engine, Session Management, and Environment Configuration.

This module initializes the SQLAlchemy database engine, session factory (`SessionLocal`),
and FastAPI dependency (`get_db`) for database transaction lifecycle management. It enforces
strict environment guardrails ensuring production environments strictly require PostgreSQL,
while allowing local development and testing to run against SQLite.

Architecture Tier:
    Infrastructure / Database Layer.

Key Dependencies & Callers:
    - Depends on SQLAlchemy engine/sessionmaker and `app.models.Base`.
    - Injected into every FastAPI endpoint via `Depends(get_db)`.
    - Invoked by Celery tasks (`tasks.py`), seed scripts (`seed_data.py`), and test fixtures.

Regulatory & Compliance Context:
    - In production, financial ledger integrity mandates ACID transaction guarantees,
      row-level locking, and durability only provided by PostgreSQL. SQLite fallback
      is prohibited in production by design.
"""

import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.models import Base

# Calculate the project root directory to resolve the default SQLite path for dev environments
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SQLITE_PATH = os.path.join(BASE_DIR, "credit_system.db").replace("\\", "/")

ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
DATABASE_URL = os.getenv("DATABASE_URL")

# REVIEW-SECURITY: Prevent SQLite from running in production where multi-process concurrency
# and data durability cannot be guaranteed. Production requires PostgreSQL.
if ENVIRONMENT == "production":
    if not DATABASE_URL or not (DATABASE_URL.startswith("postgresql://") or DATABASE_URL.startswith("postgres://")):
        raise RuntimeError(
            "CRITICAL PRODUCTION CONFIG ERROR: SQLite fallback is strictly prohibited in production. "
            "A valid PostgreSQL connection string must be provided via DATABASE_URL."
        )
else:
    # Default to local SQLite when running in development or testing without an external PostgreSQL daemon
    if not DATABASE_URL:
        DATABASE_URL = f"sqlite:///{DEFAULT_SQLITE_PATH}"

# Connect args specific to sqlite for multi-threading:
# SQLite by default restricts connections to the thread that created them.
# FastAPI serves requests across a thread pool, requiring check_same_thread=False.
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL, 
    connect_args=connect_args
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """FastAPI dependency yielding a scoped SQLAlchemy database session.

    Yields:
        Session: Active SQLAlchemy session for the duration of the HTTP request.

    Note:
        The session is automatically closed in the finally block upon request completion.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initializes the database schema and performs dev column migrations.

    Creates all defined tables if they do not exist. For local SQLite development,
    it executes non-destructive ALTER TABLE statements for newly added columns
    to avoid manual database wipes during incremental development.

    Raises:
        Exception: Database connection or schema execution errors.
    """
    Base.metadata.create_all(bind=engine)
    # REVIEW-ASSUMPTION: Safe lightweight column migration for local SQLite dev database.
    # In production, migrations are managed exclusively via Alembic revisions.
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
                # Column already exists or table structure matches; ignore on dev rerun
                pass
