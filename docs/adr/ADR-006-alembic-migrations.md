# ADR-006: Database Schema Versioning & Governance via Alembic

## Status
Accepted

## Date
2026-09-21

## Context
In regulated financial systems, ad-hoc database schema mutations (e.g. running raw `CREATE TABLE` or `ALTER TABLE` commands manually) violate change governance controls required by *APRA CPS 234* and financial auditing standards. Schema evolution must be:
- Strictly version-controlled in the codebase.
- Reversible via explicit `downgrade()` scripts.
- Automatically verifiable upon application startup.
- Compatible across development (SQLite) and enterprise production (PostgreSQL) relational databases.

## Decision
We adopted **Alembic** as the database schema migration framework for SQLAlchemy:
1. Migration scripts reside in `backend/alembic/versions/` (e.g. `0001_baseline_schema.py`).
2. Each migration defines explicit, type-safe `upgrade()` and `downgrade()` operations covering tables, primary keys, foreign keys, and indexes.
3. On application startup, the FastAPI lifecycle hook inspects `alembic_version` and ensures the database is upgraded to `head` before accepting inbound HTTP traffic.

## Alternatives Considered
1. **SQLAlchemy `Base.metadata.create_all(bind=engine)`**:
   - *Rejected*: Creates missing tables on startup but cannot handle column modifications, index additions, schema downgrades, or data transformations.
2. **Manual SQL script executions**:
   - *Rejected*: Prone to human error, lacks automated tracking, and fails CI/CD continuous deployment requirements.

## Consequences
### Positive
- Fully automated, idempotent schema upgrades in CI/CD pipelines.
- Traceable history of all database schema changes linked to Git commits.
- Automatic verification of schema alignment on server startup.

### Negative / Trade-offs
- Developers must generate and review migration scripts whenever SQLAlchemy models change.
