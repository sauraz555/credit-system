# Codebase Reviewer Guide

This guide is designed for a new human engineer, risk auditor, or legal reviewer performing a comprehensive code review of the Credit Reporting Mechanism (CRMS).

---

## 1. Recommended Reading Order

To understand how data flows through the system and where critical regulatory invariants are enforced, follow this sequence:

1. **System & Bitemporal Data Architecture**:
   - [`docs/ARCHITECTURE.md`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/docs/ARCHITECTURE.md): System layout and bitemporal ledger worked example.
   - [`backend/app/models.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/models.py): Relational schema, `CreditLedger`, `Entity`, and `AuditLog` definitions.
2. **Statutory Data Ingestion & Validation**:
   - [`docs/DATA_RULES.md`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/docs/DATA_RULES.md): Regulatory rules, Section 6Q criteria, and retention periods.
   - [`backend/app/schemas.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/schemas.py): Pydantic validation rules and regular expressions.
   - [`backend/app/routers/ingest.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/routers/ingest.py): Provider licensing checks and ledger append operations.
3. **Deterministic Scoring Engine & Hardship Neutrality**:
   - [`docs/SCORING.md`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/docs/SCORING.md): Mathematical formulas, normalizations, and worked examples.
   - [`backend/app/services/features.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/services/features.py): RHI exponential decay, hardship exclusion, and director network recursion.
   - [`backend/app/services/scoring.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/services/scoring.py): Individual CCR score (0–1000) and Commercial PAYDEX (1–100).
4. **Security, Cryptography & Access Control**:
   - [`docs/SECURITY.md`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/docs/SECURITY.md): Authentication flow, RBAC matrix, and field-level encryption.
   - [`backend/app/encryption.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/encryption.py): AES-256-GCM authenticated encryption and HMAC blind indexing.
   - [`backend/app/auth.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/auth.py): Argon2id hashing, TOTP verification, and refresh token rotation.
5. **Regulatory Workflow & Lifecycle Jobs**:
   - [`backend/app/routers/disputes.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/routers/disputes.py): Section 20V dispute lodgement and adjudication.
   - [`backend/app/tasks.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/tasks.py): Celery automated retention expiry and dispute SLA tracking.
6. **Frontend Presentation & Edge RBAC**:
   - [`docs/FRONTEND.md`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/docs/FRONTEND.md): Route map and component inventory.
   - [`frontend/src/middleware.ts`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/frontend/src/middleware.ts): Edge role segregation middleware.
   - [`frontend/src/app/subject/[id]/page.tsx`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/frontend/src/app/subject/%5Bid%5D/page.tsx): Consumer credit report interface.

---

## 2. The 10 Highest-Risk Files & Why

| Rank | File Path | Risk Category | Reason Why Reviewer Must Scrutinize |
| :---: | :--- | :--- | :--- |
| **1** | [`backend/app/services/scoring.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/services/scoring.py) | Regulatory & Legal | Calculates the legal credit score. High risk of regulatory non-compliance if hardship is penalized or thin-file cap fails. |
| **2** | [`backend/app/services/features.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/services/features.py) | Algorithmic Risk | Computes RHI decay curves and recursive director structural contagion. Recursion cycles could cause stack overflow or loop hangs. |
| **3** | [`backend/app/encryption.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/encryption.py) | Security Risk | Implements AES-256-GCM and HMAC-SHA256 blind indexing. A flaw in nonce generation or tag verification leads to catastrophic data breach. |
| **4** | [`backend/app/models.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/models.py) | Data Integrity | Core bitemporal ledger schema (`CreditLedger`). Accidental `nullable=True` or missing bitemporal indexes breaks point-in-time querying. |
| **5** | [`backend/app/routers/ingest.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/routers/ingest.py) | Legal Compliance | Gatekeeper for inbound credit data. Must enforce provider licensing under Privacy Act Section 20N (only ADIs/ACLs submit RHI). |
| **6** | [`backend/app/auth.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/auth.py) | Security Risk | Handles password verification (Argon2id), RFC 6238 TOTP verification, JWT creation, and refresh token rotation with reuse detection. |
| **7** | [`backend/app/tasks.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/tasks.py) | Regulatory Invariant | Automated Celery job expunging expired data under Section 20W (RHI 2y, defaults 5y). If this fails, the bureau unlawfully retains credit data. |
| **8** | [`backend/app/routers/disputes.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/routers/disputes.py) | Legal Compliance | Section 20V dispute tracking. Must maintain strict 30-day countdown SLAs and bitemporally update ledger statuses upon resolution. |
| **9** | [`backend/app/routers/reports.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/routers/reports.py) | Privacy & Audit | Bitemporal `as_of` query reconstruction. Automatically generates mandatory `Enquiry` audit records under Privacy Act Section 20R. |
| **10** | [`frontend/src/middleware.ts`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/frontend/src/middleware.ts) | Edge RBAC | First line of defense against unauthorized cross-role portal access. Flaws in matcher regex or cookie parsing expose portal zones. |

---

## 3. REVIEW Marker Commands & Counts

Throughout the codebase, special comment markers flag locations that require human engineering, security, or legal confirmation.

### Search Commands

#### Using ripgrep (`rg`):
```bash
# List all legal regulatory review markers
rg "REVIEW-LEGAL" --glob "!node_modules" --glob "!venv" --glob "!.next"

# List all scoring and business assumption markers
rg "REVIEW-ASSUMPTION" --glob "!node_modules" --glob "!venv" --glob "!.next"

# List all critical security audit markers
rg "REVIEW-SECURITY" --glob "!node_modules" --glob "!venv" --glob "!.next"

# List all known incomplete / TODO items
rg "REVIEW-TODO" --glob "!node_modules" --glob "!venv" --glob "!.next"

# List all identified suspected bugs
rg "REVIEW-BUG" --glob "!node_modules" --glob "!venv" --glob "!.next"
```

#### Using PowerShell:
```powershell
Get-ChildItem -Recurse -Include *.py,*.ts,*.tsx | Where-Object { $_.FullName -notmatch "node_modules|\.next|venv" } | Select-String -Pattern "REVIEW-LEGAL"
```

### Exact Marker Counts by Type

| Marker Type | Prefix | Count | Description |
| :--- | :--- | :---: | :--- |
| **Legal Review** | `# REVIEW-LEGAL:` / `// REVIEW-LEGAL:` | **15** | Interpretation of statutory regulations (Privacy Act, NCCPA, CR Code). |
| **Scoring Assumptions**| `# REVIEW-ASSUMPTION:` / `// REVIEW-ASSUMPTION:`| **31** | Undocumented model weights, decay slopes, threshold cut-offs, penalty sizes. |
| **Security Review** | `# REVIEW-SECURITY:` / `// REVIEW-SECURITY:` | **47** | Cryptographic key handling, RBAC checks, blind indexing, token rotation. |
| **Known TODOs** | `# REVIEW-TODO:` / `// REVIEW-TODO:` | **0** | No remaining incomplete placeholders in documented codebase. |
| **Suspected Bugs** | `# REVIEW-BUG:` / `// REVIEW-BUG:` | **1** | Suspected bug in `seed_data.py` (missing `init_db` import). |
| **TOTAL MARKERS** | | **94** | |

---

## 4. Human Reviewer Checklists

### Legal Review Checklist
- [ ] Confirm that default criteria ($overdue \ge \$150$ and $\ge 60$ days overdue) in `backend/app/schemas.py` match Section 6Q(1) of the Privacy Act 1988.
- [ ] Confirm that hardship codes `A` and `V` in `backend/app/services/features.py` are strictly neutral (score value = 1.0) and never penalize the consumer.
- [ ] Confirm that telcos and utilities are prohibited from submitting RHI under Section 20N in `backend/app/routers/ingest.py`.
- [ ] Confirm that Tax File Numbers (TFN) are strictly prohibited from collection under Section 20E.
- [ ] Confirm that every credit provider report lookup generates an immutable `Enquiry` record under Section 20R.

### Scoring Assumptions Checklist
- [ ] Review the 499-point thin-file score cap in `backend/app/services/scoring.py` for credit histories $< 3$ months.
- [ ] Review the 24-month RHI exponential decay rate of $0.95^t$ in `backend/app/services/features.py`.
- [ ] Review the bankruptcy deduction of $-400$ points and court judgment deduction of $-150$ points.
- [ ] Review the Director Network recursion depth limit of 2 and the $-15$ point deduction per failed co-directorship.

### Security Checklist
- [ ] Verify that `AES-256-GCM` uses a cryptographically random 12-byte IV for every encryption call (`encryption.py`).
- [ ] Verify that `BLIND_INDEX_SALT` is stored separately from `ENCRYPTION_KEY`.
- [ ] Verify that refresh token rotation (RTR) revokes the entire token family when reuse is detected (`auth.py`).
- [ ] Verify that brute-force lockout activates after 5 consecutive failures (`auth.py`).
- [ ] Verify that consumer subjects are strictly isolated to their own `entity_id` in `reports.py` and `disputes.py`.

### Data Retention Checklist
- [ ] Verify that `run_data_expiry_job` in `backend/app/tasks.py` runs on a daily schedule.
- [ ] Verify that RHI records expire at exactly 730 days (2 years) under Section 20W.
- [ ] Verify that Defaults and Enquiries expire at exactly 1825 days (5 years) under Section 20W.
- [ ] Verify that expired records are marked as `EXPIRED` rather than physically deleted, preserving bitemporal query integrity.
