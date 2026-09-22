"""Alembic Database Migration Environment and Execution Context.

This module configures the runtime environment for Alembic database schema migrations.
It imports the SQLAlchemy metadata from `app.models.Base`, resolves the active database
connection URL from the environment (`DATABASE_URL`), and executes migrations either in
offline SQL generation mode or online direct transaction mode.

Architecture Tier:
    Database Infrastructure / Schema Migration Layer (`backend/alembic/`).

Key Dependencies & Callers:
    - Depends on Alembic context, SQLAlchemy pool/engine, `app.models.Base`, and `app.database.DATABASE_URL`.
    - Invoked by the Alembic CLI tool (`alembic upgrade head`, `alembic revision --autogenerate`).

Regulatory & Compliance Context:
    - Financial bureau data schemas mandate deterministic version control and auditability
      for all schema modifications.
"""

from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

import os
import sys
from pathlib import Path

# Add backend directory to path to enable importing app models
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.models import Base
from app.database import DATABASE_URL

# Target declarative metadata for autogenerate support
target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Runs database migrations in 'offline' SQL generation mode.

    Configures the context with just a URL and not an Engine, emitting
    raw SQL statements to stdout without connecting directly to the database engine.
    """
    url = os.getenv("DATABASE_URL") or DATABASE_URL
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Runs database migrations in 'online' direct execution mode.

    Creates an Engine and associates a connection with the context,
    executing migration revisions within an active database transaction.
    """
    configuration = config.get_section(config.config_ini_section, {})
    db_url = os.getenv("DATABASE_URL") or DATABASE_URL
    configuration["sqlalchemy.url"] = db_url

    # REVIEW-ASSUMPTION: Use NullPool in migrations to prevent persistent connection pooling during CLI executions
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
