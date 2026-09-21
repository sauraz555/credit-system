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
## Milestone 2: Correctness Decisions
- **Model Weights Validator**: Enforced Pydantic `@field_validator("weights")` requiring the sum of all factor weights to total exactly 100.0% (within 0.001 tolerance), raising ValueError resulting in HTTP 422 Unprocessable Entity if violated.
- **Provider Licensing Table & RHI Validation**: Created `Provider` model recording license type (ADI, ACL, TELECOM, UTILITY, COMMERCIAL) and permitted data types. Enforced Australian Privacy Act 1988 Part IIIA restriction that Repayment History Information (RHI) may only be submitted by eligible credit providers holding ADI or ACL licenses. Rejected submissions are logged to both `ingest_events` and `audit_log` with an `INGESTION_REJECTION` action.
- **Resolved SCI Reversion (5 Years)**: Under Section 20U of the Privacy Act 1988, Serious Credit Infringements (SCI) are retained for 7 years if unresolved. When marked `RESOLVED`, the record reverts to standard default retention (5 years from original default date). Implemented automated expiration of resolved SCIs older than 5 years in `tasks.py` during periodic Celery sweeps.
- **Enquiry History Exposure**: Updated `GET /api/reports/{id}` to return the full list of prior credit enquiries, and integrated the consumer subject portal to display a dedicated Enquiry History Table.
- **Bitemporal Point-in-Time Reconstruction**: Enhanced `GET /api/reports/{id}?as_of=YYYY-MM-DD` to filter both ledger records and credit enquiries by `valid_from <= as_of AND recorded_at <= as_of`. Replaced hardcoded frontend snapshot switch statements with dynamic fetches to this endpoint upon time-travel scrubber interaction.

## Milestone 3: Analyst Role & Real Back-Testing Decisions
- **Analyst Permission Isolation**: Analysts are granted access to audit logs, dispute queue management, bitemporal historical investigations, and model backtesting discrimination evaluations. Model creation, model activation into production, and user administration remain strictly restricted to `RoleEnum.ADMIN` returning HTTP 403 Forbidden to Analysts.
- **Real Back-Testing Discrimination Engine**: Replaced mock endpoints with a real statistical discrimination engine. Reads ground-truth outcome datasets (`entity_id, outcome_date, defaulted`), reconstructs point-in-time features as of `observation_date` via bitemporal ledger queries, and scores records against the selected model version.
- **Discrimination Statistics**: Computes non-parametric ROC AUC using pairwise concordant ranking between defaulters and non-defaulters, Gini coefficient ($2 \times \text{AUC} - 1$), Kolmogorov-Smirnov (KS) maximum cumulative distribution separation, empirical default rate per score band, and 10-decile calibration tables.
- **Synthetic Outcomes Dataset**: Pre-generated and seeded `synthetic_outcomes.csv` with 200 empirical entity outcomes calibrated against baseline scores to enable zero-upload automated testing and demonstrations.
- **Dedicated Analyst Workspace**: Built `/analyst` on IBM Carbon Design System featuring tabbed workflows for statutory s20V dispute tracking, bitemporal point-in-time file investigation, and backtesting calibration tables with prominent read-only model governance alerts.

## Milestone 4: Test Coverage & Edge Case Hardening Decisions
- **Edge Case Coverage**: Implemented comprehensive tests in `backend/tests/test_milestone4_edge_cases.py` verifying:
  - Clean files (100% on-time RHI, 0 defaults, long history) achieving >=800 Excellent score.
  - Thin file cap: history < 3 months strictly capped at 499 regardless of payment perfection.
  - Active default penalty: -100 points per active default.
  - Paid default treatment: status=PAID does not penalize as active default (-20 pts vs -100 pts), retained for 5 years.
  - SCI resolved reversion: unresolved retained 7 years, resolved reverts to 5-year default expiration.
  - Permanent Hardship Neutrality suite: verified that financial hardship flags (`V` or `A`) on RHI or ledger entries do NOT change credit scores (identical files with/without hardship yield identical scores).
  - Hardship-only file: calculates cleanly without errors and respects thin-file cap with zero public record penalties.
  - Director contagion structural risk: bankrupt director linked to multiple companies propagates structural risk penalty (-50 pts per risk point).
  - PAYDEX calculation and public records impact on corporate credit scoring.
  - FeatureStore point-in-time slices and Score persistence.
  - Ingestion validation, provider tenant isolation, bulk CSV error handling, and audit event tracking.
- **Coverage Target Achieved**: Exceeded the >=85% target across all 4 key modules:
  - `ingest.py`: **94%**
  - `scoring.py`: **92%**
  - `features.py`: **88%**
  - `tasks.py`: **88%**
  - Combined suite coverage: **91%** with 36 passing tests.


