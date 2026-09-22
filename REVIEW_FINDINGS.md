# Review Findings & Suspected Issues Log

During this autonomous documentation pass across the Credit Reporting Mechanism (CRMS) codebase, all source files were audited line by line. In strict accordance with the **HARD RULE (COMMENT-ONLY, NO BEHAVIOUR CHANGES)**, zero code refactoring or bug fixes were applied to source files. All suspected bugs and architectural observations are formally logged below for human engineering triage.

---

## 1. Identified Bugs (`REVIEW-BUG`)

### Finding 1: `NameError: name 'init_db' is not defined` in `seed_data.py`
- **Location**: [`backend/scripts/seed_data.py:L30`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/scripts/seed_data.py#L30)
- **Severity**: Medium (Development Tooling)
- **Description**:
  In `seed_data.py`, line 30 calls `init_db()` at the start of the `seed()` routine to ensure tables are created:
  ```python
  def seed():
      init_db()  # <-- NameError
      db = SessionLocal()
  ```
  However, `init_db` is never imported from `app.database`. Only `from app.database import SessionLocal` is present on line 21. Executing `python backend/scripts/seed_data.py` directly crashes with:
  ```
  NameError: name 'init_db' is not defined
  ```
- **Code Tagged**: `# REVIEW-BUG: init_db is invoked here but was never imported from app.database`
- **Recommended Fix**: Add `init_db` to the import statement: `from app.database import SessionLocal, init_db`.

---

## 2. Security & Operational Observations (`REVIEW-SECURITY`)

### Finding 2: Rate Limit Bypass Header in Load Testing Suite
- **Location**: [`backend/app/rate_limiter.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/rate_limiter.py) and [`scripts/run_load_test.py:L58`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/scripts/run_load_test.py#L58)
- **Severity**: High (Production Risk)
- **Description**:
  The rate limiter contains a bypass check allowing requests with `X-Benchmark-Test-User: true` and user ID `load_test_user` to evade rate limits during load testing.
- **Recommended Fix**:
  Ensure production API gateways / reverse proxies (e.g. Nginx, Cloudflare, AWS ALB) unconditionally strip incoming `X-Benchmark-Test-User` headers from external traffic, and restrict this bypass mechanism to `ENVIRONMENT == "development"`.

### Finding 3: Development Fallback Cryptographic Keys
- **Location**: [`backend/app/encryption.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/encryption.py) and [`backend/app/auth.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/auth.py)
- **Severity**: High (Production Risk)
- **Description**:
  If `ENCRYPTION_KEY`, `BLIND_INDEX_SALT`, or `JWT_SECRET_KEY` are not set in the process environment, the modules fall back to hardcoded default strings to facilitate local development testing.
- **Recommended Fix**:
  In non-development environments (`ENVIRONMENT == "production"`), the application should immediately raise a fatal `RuntimeError` and refuse to boot if any cryptographic key is missing or set to a known default value.

---

## 3. Regulatory & Legal Assumptions (`REVIEW-ASSUMPTION` / `REVIEW-LEGAL`)

### Finding 4: Thin-File Score Cap of 499 Points
- **Location**: [`backend/app/services/scoring.py:L114`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/services/scoring.py#L114)
- **Description**:
  Entities with $< 3$ months of credit history are capped at a maximum score of 499 ("Poor" qualitative band).
- **Reviewer Action**:
  A credit risk committee should validate whether 499 points accurately reflects portfolio risk or if an explicit "Thin-File / Unrated" status should be assigned instead of forcing an entity into the "Poor" adverse risk tier.

### Finding 5: Director Structural Contagion Recursion Depth
- **Location**: [`backend/app/services/features.py:L186`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/services/features.py#L186)
- **Description**:
  Director contagion structural risk traverses company-director linkages with a fixed depth limit of 2 and deducts 15 points per failed co-directorship.
- **Reviewer Action**:
  Confirm with commercial risk officers whether depth 2 is optimal or if depth 3 with an exponential decay factor should be evaluated for complex multi-layered corporate holdings.
