# Credit Reporting Mechanism REST API Reference

The CRMS API is built on FastAPI, providing asynchronous execution, automatic OpenAPI schema generation, strict Pydantic payload validation, and role-based access control.

- **Base URL**: `http://localhost:8000/api`
- **Interactive OpenAPI UI**: `http://localhost:8000/docs`
- **Authentication**: HTTP Bearer Token (`Authorization: Bearer <JWT>`)

---

## 1. Authentication Endpoints (`/api/auth`)

*Router*: [`backend/app/routers/auth_router.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/routers/auth_router.py)

### 1.1 Login & MFA Challenge
- **Endpoint**: `POST /api/auth/login`
- **Access Level**: Public
- **Request Body**:
```json
{
  "email": "analyst@example.com",
  "password": "Sprint2026!Analyst"
}
```
- **Response (MFA Step-Up Required - 200 OK)**:
```json
{
  "mfa_required": true,
  "mfa_token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "email": "analyst@example.com",
    "role": "ANALYST"
  }
}
```
- **Response (Standard Login - 200 OK)**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "user": {
    "id": "usr_analyst_001",
    "email": "analyst@example.com",
    "role": "ANALYST",
    "mfa_enabled": true
  }
}
```
- **Errors**:
  - `401 Unauthorized`: Invalid email or password.
  - `423 Locked`: Account locked due to exceeding 5 failed login attempts (15-minute lockout).

---

### 1.2 Verify Multi-Factor Authentication (TOTP)
- **Endpoint**: `POST /api/auth/mfa/verify`
- **Access Level**: Public (requires interim `mfa_token`)
- **Request Body**:
```json
{
  "mfa_token": "eyJhbGciOiJIUzI1NiIs...",
  "totp_code": "492018"
}
```
- **Response (200 OK)**: Full session tokens (`access_token`, `refresh_token`, `user`).
- **Errors**:
  - `401 Unauthorized`: Invalid or expired TOTP code.

---

### 1.3 Refresh Access Token
- **Endpoint**: `POST /api/auth/refresh`
- **Access Level**: Authenticated (requires refresh token)
- **Request Body**:
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```
- **Response (200 OK)**: New access token and rotated refresh token.
- **Errors**:
  - `401 Unauthorized`: Revoked token or reuse violation detected (entire token family invalidated).

---

## 2. Credit Ingestion Endpoints (`/api/ingest`)

*Router*: [`backend/app/routers/ingest.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/routers/ingest.py)

### 2.1 Ingest Single Credit Event
- **Endpoint**: `POST /api/ingest/record`
- **Access Level**: `PROVIDER`, `ADMIN`
- **Headers**:
  - `Authorization: Bearer <token>`
  - `X-Tenant-ID: PRV-NAB-001`
- **Request Body (Default Listing Example)**:
```json
{
  "provider_id": "PRV-NAB-001",
  "entity_id": "IND-8842-1994",
  "record_type": "DEFAULT",
  "valid_from": "2026-08-01",
  "amount": 750.00,
  "data": {
    "days_overdue": 65,
    "notice_given": true,
    "notice_days_met": true,
    "facility_type": "Credit Card"
  }
}
```
- **Side Effects**:
  - Appends new immutable record to `credit_ledger`.
  - Recalculates feature store metrics for target entity.
- **Response (201 Created)**:
```json
{
  "status": "success",
  "record_id": "c7a8b9f0-1234-4567-89ab-cdef01234567",
  "valid_from": "2026-08-01",
  "recorded_at": "2026-09-22T08:15:30Z"
}
```
- **Errors**:
  - `403 Forbidden`: Provider not licensed for record type (e.g. Non-ADI submitting RHI).
  - `422 Unprocessable Entity`: Statutory default criteria not met ($< \$150$, $< 60$ days, or notice not given).

---

### 2.2 Bulk CSV File Ingestion
- **Endpoint**: `POST /api/ingest/csv`
- **Access Level**: `PROVIDER`, `ADMIN`
- **Payload**: `multipart/form-data` with `file: file.csv`.
- **Response (200 OK)**:
```json
{
  "total_records": 100,
  "committed_records": 98,
  "rejected_records": 2,
  "errors": [
    { "row": 14, "error": "Default amount $120.00 is below statutory $150 threshold" }
  ]
}
```

---

## 3. Reports & Bitemporal Query Endpoints (`/api/reports`)

*Router*: [`backend/app/routers/reports.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/routers/reports.py)

### 3.1 Get Credit Report (Real-Time or Bitemporal As-Of)
- **Endpoint**: `GET /api/reports/{id}?as_of=2025-06-01`
- **Access Level**: `SUBJECT` (own file only), `ANALYST`, `ADMIN`, `PROVIDER`
- **Query Parameters**:
  - `as_of` *(optional)*: ISO 8601 date string to reconstruct historical credit file state as known at that date.
- **Side Effects**:
  - If requested by `PROVIDER`, automatically inserts an immutable `Enquiry` record under Privacy Act Section 20R.
- **Response (200 OK)**:
```json
{
  "entity": {
    "id": "IND-8842-1994",
    "type": "INDIVIDUAL",
    "identifier": "IND-8842-1994",
    "basic_info": {
      "first_name": "Jonathan",
      "last_name": "Vance",
      "dob": "1984-06-14"
    }
  },
  "score": {
    "value": 712,
    "band": "Great",
    "as_of": "2025-06-01",
    "top_factors": [
      { "factor": "Clean 24-month repayment history", "impact": "POSITIVE" },
      { "factor": "Single paid statutory default listed in 2024", "impact": "NEGATIVE" }
    ]
  },
  "ledger_records": [ ... ],
  "enquiries": [ ... ],
  "disputes": [ ... ]
}
```
- **Errors**:
  - `403 Forbidden`: Authenticated Subject attempting to access another consumer's file.
  - `404 Not Found`: Entity identifier does not exist.

---

## 4. Dispute Resolution Endpoints (`/api/disputes`)

*Router*: [`backend/app/routers/disputes.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/routers/disputes.py)

### 4.1 Lodge Statutory Dispute
- **Endpoint**: `POST /api/disputes`
- **Access Level**: `SUBJECT`, `ANALYST`, `ADMIN`
- **Request Body**:
```json
{
  "ledger_record_id": "c7a8b9f0-1234-4567-89ab-cdef01234567",
  "entity_id": "IND-8842-1994",
  "reason": "I did not miss this payment; direct debit failed due to bank glitch",
  "evidence_documents": ["bank_statement_aug2026.pdf"]
}
```
- **Side Effects**:
  - Flags target `CreditLedger` status as `DISPUTED`.
  - Initiates statutory 30-day countdown timer (`resolution_due = created_at + 30 days`).
- **Response (201 Created)**:
```json
{
  "dispute_id": "dsp-99102",
  "status": "OPEN",
  "sla_deadline": "2026-10-22T08:30:00Z",
  "ledger_status": "DISPUTED"
}
```

---

### 4.2 Adjudicate Dispute
- **Endpoint**: `PUT /api/disputes/{id}`
- **Access Level**: `ANALYST`, `ADMIN`
- **Request Body**:
```json
{
  "status": "CORRECTED",
  "resolution_notes": "Bank confirmed system outage on due date; default expunged."
}
```
- **Side Effects**:
  - Updates target ledger record status to `RESOLVED` (or marks superseded).
  - Triggers score recalculation.
- **Response (200 OK)**:
```json
{
  "dispute_id": "dsp-99102",
  "status": "CORRECTED",
  "resolved_at": "2026-09-22T10:00:00Z"
}
```

---

## 5. Model Governance & Backtesting (`/api/admin`)

*Router*: [`backend/app/routers/admin.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/routers/admin.py)

### 5.1 Deploy Model Version
- **Endpoint**: `POST /api/admin/models`
- **Access Level**: `ADMIN`
- **Request Body**:
```json
{
  "name": "CCR Model v2.1",
  "type": "INDIVIDUAL",
  "weights": {
    "rhi": 35,
    "utilization": 25,
    "history_length": 15,
    "defaults": 20,
    "inquiries": 5
  },
  "band_thresholds": {
    "Excellent": 800,
    "Great": 700,
    "Good": 600,
    "Fair": 500,
    "Poor": 0
  },
  "active": true
}
```
- **Errors**:
  - `422 Unprocessable Entity`: Weights do not sum to exactly 100.

---

### 5.2 Execute Model Backtest
- **Endpoint**: `POST /api/admin/models/backtest`
- **Access Level**: `ANALYST`, `ADMIN`
- **Payload**: `multipart/form-data` with test outcomes CSV (columns: `entity_id`, `actual_default_binary`).
- **Response (200 OK)**:
```json
{
  "model_version": "v1.0",
  "sample_size": 500,
  "auc_roc": 0.842,
  "gini_coefficient": 0.684,
  "kolmogorov_smirnov": 0.521,
  "decile_calibration": [
    { "decile": 1, "avg_score": 380, "actual_default_rate": 0.38 },
    { "decile": 10, "avg_score": 890, "actual_default_rate": 0.01 }
  ]
}
```
