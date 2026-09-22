# Credit Reporting Mechanism (CRMS) Platform

An institutional-grade Comprehensive Credit Reporting (CCR) system operating in compliance with:
- **Privacy Act 1988 (Cth) Part IIIA** (Statutory credit reporting, 24-month RHI, Section 20V dispute adjudication)
- **Privacy (Credit Reporting) Code 2014 (CR Code)** (Operational credit reporting code and rules)
- **National Consumer Credit Protection Act 2009 (NCCPA)** (Consumer credit licensing and responsible lending)
- **Corporations Act 2001 (Cth)** (Commercial credit, director networks, and insolvency disclosures)

Built on a **FastAPI (Python 3.11)** backend with an append-only bitemporal ledger, deterministic scoring engine, Celery data retention tasks, and an enterprise **IBM Carbon Design System (`@carbon/react`)** Next.js web application.

---

## Documentation Suite (`/docs`)

Comprehensive documentation is available in the [`docs/`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/docs/) directory:

- [**Reviewer Guide**](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/docs/REVIEW_GUIDE.md): Recommended reading order, top 10 highest-risk files, REVIEW marker commands, marker counts, and human review checklists.
- [**System Architecture**](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/docs/ARCHITECTURE.md): Component diagram (Mermaid), end-to-end data flow, and bitemporal ledger worked example.
- [**Credit Scoring Specification**](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/docs/SCORING.md): Factor weights, mathematical formulas, normalizations, decay curves, bands, thin-file rules, and worked individual and commercial calculations.
- [**Data Rules & Statutory Retention**](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/docs/DATA_RULES.md): Permitted data types, Section 6Q default criteria, TFN statutory prohibition, and Section 20W retention schedules.
- [**Security & Cryptographic Architecture**](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/docs/SECURITY.md): Argon2id + TOTP MFA authentication, RBAC matrix, AES-256-GCM field encryption, and HMAC blind indexing.
- [**REST API Reference**](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/docs/API.md): Detailed specification of all endpoints with roles, request/response payloads, and error codes.
- [**Frontend Architecture**](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/docs/FRONTEND.md): Route map, IBM Carbon component inventory, state handling, and data fetching patterns.
- [**Operations & Deployment Guide**](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/docs/OPERATIONS.md): Environment variables, Alembic migrations, Celery tasks, monitoring, and backups.
- [**Regulatory & Technical Glossary**](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/docs/GLOSSARY.md): Definitions of RHI, SCI, CCR, PAYDEX, bitemporal time, blind indexing, and discrimination metrics.
- [**Architecture Decision Records (ADRs)**](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/docs/adr/):
  - [ADR-001: Bitemporal Append-Only Credit Ledger](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/docs/adr/ADR-001-bitemporal-ledger.md)
  - [ADR-002: Decoupled Feature Extraction & Deterministic Scoring Service](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/docs/adr/ADR-002-separate-scoring-service.md)
  - [ADR-003: Hardship Neutrality & Regulatory Exclusion in Scoring](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/docs/adr/ADR-003-hardship-neutrality.md)
  - [ADR-004: IBM Carbon Design System for Enterprise UI Architecture](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/docs/adr/ADR-004-carbon-design-system.md)
  - [ADR-005: Field-Level AES-256-GCM Encryption with HMAC Blind Indexing](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/docs/adr/ADR-005-aes-gcm-blind-index.md)
  - [ADR-006: Database Schema Versioning & Governance via Alembic](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/docs/adr/ADR-006-alembic-migrations.md)
- [**Review Findings Log**](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/REVIEW_FINDINGS.md): Suspected bugs, security observations, and regulatory assumptions logged for triage.

---

## Repository Map

```
credit-system/
├── backend/                       # FastAPI Python application
│   ├── alembic/                   # Alembic database schema migrations
│   │   ├── env.py                 # Migration runtime configuration
│   │   └── versions/              # Migration scripts (0001_baseline_schema.py)
│   ├── app/                       # Core backend source package
│   │   ├── auth.py                # Argon2id, TOTP MFA, JWT rotation, lockouts
│   │   ├── database.py            # SQLAlchemy engine, session factory, guardrails
│   │   ├── encryption.py          # AES-256-GCM field encryption & HMAC blind index
│   │   ├── main.py                # FastAPI app initialization, middleware, metrics
│   │   ├── models.py              # SQLAlchemy relational schema (12 tables)
│   │   ├── rate_limiter.py        # Sliding-window rate limiter (Redis / memory)
│   │   ├── schemas.py             # Pydantic validation schemas (s6Q default rules)
│   │   ├── tasks.py               # Celery periodic jobs (s20W retention, SLA alerts)
│   │   ├── routers/               # FastAPI REST routers
│   │   │   ├── admin.py           # Model deployment, backtesting, audit logs
│   │   │   ├── auth_router.py     # Login, TOTP verify, refresh, logout
│   │   │   ├── disputes.py        # Section 20V dispute lodgement & adjudication
│   │   │   ├── ingest.py          # Credit provider single & batch CSV ingestion
│   │   │   └── reports.py         # Bitemporal report queries & enquiry logging
│   │   └── services/              # Business logic services
│   │       ├── features.py        # Decayed RHI, hardship neutrality, director risk
│   │       └── scoring.py         # CCR 0-1000 score & PAYDEX 1-100 evaluation
│   ├── scripts/                   # Database maintenance and seeding scripts
│   │   ├── inspect_db.py          # Quick database inspection utility
│   │   ├── seed_data.py           # Bulk demo entity and RHI generator
│   │   ├── seed_featured.py       # Seeds primary test entities (IND-8842, ACN-109)
│   │   ├── seed_synthetic_outcomes.py # Generates backtesting outcomes dataset
│   │   └── seed_test_accounts.py  # Generates test persona accounts and MFA secrets
│   └── tests/                     # Backend pytest suite (9 suites, 50 tests)
├── frontend/                      # Next.js 16 Web Application (IBM Carbon Design)
│   ├── src/
│   │   ├── app/                   # App Router pages
│   │   │   ├── 403/               # Insufficient role authorization view
│   │   │   ├── admin/             # Model governance, dispute queue, Merkle audit
│   │   │   ├── analyst/           # Bitemporal file investigator & backtesting
│   │   │   ├── login/             # Identity authentication & TOTP MFA modal
│   │   │   ├── provider/          # Ingestion console & credit enquiry portal
│   │   │   ├── subject/           # Commercial credit file & PAYDEX view
│   │   │   ├── subject/[id]/      # Consumer credit report & 24m RHI grid
│   │   │   ├── layout.tsx         # Root HTML layout and IBM Plex font imports
│   │   │   └── page.tsx           # Operational command center & direct search
│   │   ├── components/            # CarbonShell and layout components
│   │   └── middleware.ts          # Edge RBAC and session routing guard
│   └── tests/                     # Playwright E2E and Axe accessibility tests
│       ├── axe.spec.ts            # Automated WCAG 2.1 AA accessibility scans
│       ├── e2e.spec.ts            # Multi-persona end-to-end integration workflows
│       └── totp.ts                # RFC 6238 TOTP generator for automated tests
├── docs/                          # Comprehensive system documentation
│   ├── adr/                       # Architecture Decision Records (ADRs 001-006)
│   ├── ARCHITECTURE.md            # Architecture, data flows, bitemporal ledger
│   ├── SCORING.md                 # Scoring formulas, weights, worked calculations
│   ├── DATA_RULES.md              # Permitted data types, validation, retention
│   ├── SECURITY.md                # Security, auth, RBAC, encryption, rate limits
│   ├── API.md                     # Complete REST API reference
│   ├── FRONTEND.md                # Route map, component inventory, state handling
│   ├── OPERATIONS.md              # Deploy, env vars, migrations, Celery, backups
│   ├── GLOSSARY.md                # Statutory and technical glossary
│   └── REVIEW_GUIDE.md            # Reading order, top 10 risk files, review checklists
├── scripts/                       # Root benchmarking and verification scripts
│   ├── benchmark_latency.py       # p50, p90, p95, p99 latency benchmarking
│   ├── run_load_test.py           # High-concurrency load testing runner (70 VUs)
│   └── verify_ast_equivalence.py  # AST equivalence verifier (proves zero behavior change)
├── DECISIONS.md                   # Chronological engineering decisions log
├── REVIEW_FINDINGS.md             # Suspected bugs, security risks, assumptions
└── README.md                      # Platform overview and quick start guide
```

---

## Verification & How to Run Tests

### 1. Python AST Equivalence Proof (Zero Behaviour Changes)
```bash
# Proves 100% AST identity across all 35 Python files compared to base branch
python scripts/verify_ast_equivalence.py fix-sprint
```

### 2. Backend Test Suite (Pytest)
```bash
cd backend
venv\Scripts\python -m pytest tests/ -v
# Output: 50 passed in ~8 seconds
```

### 3. Frontend Type-Checking & Production Build
```bash
cd frontend
npx tsc --noEmit
# Output: 0 errors

npm run build
# Output: Compiled successfully, all static & dynamic routes generated
```

### 4. End-to-End & Accessibility Tests (Playwright)
```bash
cd frontend
# Run WCAG 2.1 AA automated accessibility scans across all 8 routes
npm run test:a11y

# Run full end-to-end multi-role workflows
npm run test:e2e
```

