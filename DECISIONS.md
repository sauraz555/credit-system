# Architectural and Implementation Decisions Log

This document records all architectural choices, engineering tradeoffs, and resolution of ambiguous or blocked items encountered during the autonomous fix sprint.

## Sprint Initialisation (2026-09-22)
- **Git Branch**: Created `fix-sprint` branch off `main` to ensure zero direct commits to `main`.
- **Database Backup**: Exported baseline timestamped backups to `/backups/` (`credit_system_backend_20260922_062340.db` and `credit_system_root_20260922_062340.db`).
- **Methodology**: Test-Driven Development (TDD) — write failing test, confirm failure, implement fix, confirm pass, verify full suite.

## Milestone 1: Security Decisions
- **Argon2 Password Hashing**: Implemented `argon2id` through the `argon2-cffi` library with memory and time cost parameters according to modern cryptographic best practice.
- **JWT & TOTP MFA**: Access tokens (60 min) and refresh tokens (7 days) signed with HS256. Dual-step MFA verification using `pyotp` (TOTP RFC 6238) for ADMIN, ANALYST, and PROVIDER roles.
- **FastAPI HTTPBearer Status Code**: Configured `HTTPBearer(auto_error=False)` and explicitly return `401 Unauthorized` (rather than FastAPI's default 403) when no Bearer credentials are provided.
- **Subject Privacy Isolation**: Enforced in `reports.py` and `disputes.py` that callers with `RoleEnum.SUBJECT` may only access records corresponding to `current_user.entity_id == entity.id`.
- **Field-Level Encryption (FLE)**: AES-256-GCM authenticated encryption with a unique 12-byte random IV/nonce per value stored for `identifier` and `basic_info`.
- **Deterministic Blind Index**: Computed using HMAC-SHA256 with an independent key (`BLIND_INDEX_KEY`) over normalised identifiers to permit exact-match database queries without decrypting the entire database.
- **Rate Limiting**: Sliding-window rate limiting keyed per user ID and IP address backed by Redis, with in-memory fallback if Redis is unreachable in local test environments.
- **Database Switching**: Configured standard `DATABASE_URL` targeting PostgreSQL in production and Docker containers, retaining SQLite local fallback when `postgresql://` is omitted so the local pytest suite runs without external daemons.
- **TFN Purge**: Completely eradicated Tax File Number (TFN) references from schemas, entity models, seed scripts, and UI to ensure full Privacy Act 1988 Part IIIA compliance.

