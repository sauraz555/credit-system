# Credit Reporting Mechanism (CRM) — Master How-To Guide & Operations Manual

This comprehensive guide covers all features, workflows, administrative controls, local development steps, and deployment procedures for the **Nepal Localized Credit Reporting Mechanism (CRM)**.

---

## 1. System Overview & Architecture

The Credit Reporting Mechanism is an enterprise-grade statutory credit bureau and scoring platform localized for the **Nepal regulatory ecosystem** (Nepal Individual Privacy Act 2018, Nepal Rastra Bank Directives, Credit Information Bureau (CIB) statutory guidelines).

### Core Components
```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js 16 Frontend                      │
│     (App Router, Turbopack, Carbon Design System, i18n)     │
│        Deployed on Vercel: frontend-alpha-neon-82           │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS / JSON REST API
┌──────────────────────────────▼──────────────────────────────┐
│                    FastAPI Python Backend                   │
│   (Argon2id, RFC 6238 TOTP, AES-256-GCM, Bitemporal Ledger) │
│           Deployed on Fly.io / Railway / Docker             │
└──────────────────────────────┬──────────────────────────────┘
                               │ SQL / ORM
┌──────────────────────────────▼──────────────────────────────┐
│             PostgreSQL / SQLite Storage Engine              │
│    (Bitemporal CreditLedger, Entities, Disputes, AuditLog)  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Access, Roles & Test Accounts

The platform implements strict Role-Based Access Control (RBAC) enforced at both the Next.js Edge Middleware and FastAPI API route decorators.

### Test Credentials & Personas

| Role | Username / Email | Password | MFA Required | Default Entity / Scope | Primary Capabilities |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **Admin** | `admin@example.com` | `Sprint2026!Admin` | **Yes** | Entire Bureau | System configuration, audit logs, model governance |
| **Analyst** | `analyst@example.com` | `Sprint2026!Analyst` | **Yes** | Bureau-wide read | Backtesting, dispute adjudication, risk simulations |
| **Provider** | `provider@example.com` | `Sprint2026!Provider` | **Yes** | `PRV-NABIL-001` (Nabil Bank) | Data ingestion, portfolio event uploads, compliance |
| **Subject** | `subject@example.com` | `Sprint2026!Subject` | **No** | `CIT-27-01-78-04821` (Ram Kumar Shrestha) | Self-service consumer credit file, score breakdown, disputes |

---

## 3. How to Log In & Multi-Factor Authentication (MFA)

### Step-by-Step Login:
1. Navigate to [`/login`](https://frontend-alpha-neon-82.vercel.app/login).
2. Enter your Email and Password, or click any of the **Quick Test Persona Accounts** buttons.
3. Click **Sign In**.

### Completing MFA (for Admin, Analyst, Provider):
1. When prompted for the 6-digit TOTP code, check the test secret hint displayed in the blue info box or generate it using Python:
   ```bash
   # Admin
   python -c "import pyotp; print(pyotp.TOTP('MRYYKLJ3GNBXCF3JLRIBHR6QV4IFLCN2').now())"
   
   # Analyst
   python -c "import pyotp; print(pyotp.TOTP('WLNJMOIXHFS442MVSNNA5WQJE74JWV3I').now())"
   
   # Provider (Nabil Bank)
   python -c "import pyotp; print(pyotp.TOTP('FKH56R4XUAXHWHFGNX3QE5TY6KFOOMOH').now())"
   ```
2. Enter the 6-digit code and click **Verify MFA**.

---

## 4. Persona Workflows: Step-by-Step Guides

### 4.1. Consumer / Subject Self-Service (`/subject/[id]`)
**Target Persona:** Citizen / Consumer (`subject@example.com` or direct lookup).

1. **Accessing the File:**
   - Go to [`/subject/CIT-27-01-78-04821`](https://frontend-alpha-neon-82.vercel.app/subject/CIT-27-01-78-04821).
   - This opens the consumer file for **Ram Kumar Shrestha** (Citizenship: `CIT-27-01-78-04821`, Kathmandu).
2. **Understanding the 5-Pillar Score (0–1000 scale):**
   - **Repayment History (RHI) (35%)**: 24-month rolling payment history matrix (0 = on time, 1 = 30d, 2 = 60d, etc.).
   - **Credit Utilization (30%)**: Ratio of active revolving balances against sanctioned credit limits.
   - **Length of Credit History (15%)**: Age of oldest and average account lines (accounts < 3 months capped at 499 thin-file).
   - **Public Records & Defaults (10%)**: CIB blacklisting, default records, court decrees.
   - **Recent Enquiries (10%)**: Hard inquiries within the last 12 months.
3. **Hardship Neutrality:**
   - Payment codes `A` (Natural Disaster/Pandemic relief) and `V` (Bilateral Loan Restructuring) are statutory neutral (score multiplier 1.0).
4. **Filing a Dispute:**
   - Scroll to any incorrect account line.
   - Click **File Dispute** to submit a statutory challenge under Nepal Individual Privacy Act 2018 Sec 12.

---

### 4.2. Commercial Credit & Contagion Analysis (`/subject`)
**Target Persona:** Credit Underwriters & Analysts.

1. **Lookup by Tax/Registration Identifier:**
   - Navigate to [`/subject`](https://frontend-alpha-neon-82.vercel.app/subject).
   - Search by **PAN** (e.g., `PAN-301245678`) or **Company Registration (OCR)** (e.g., `OCR-987654321`).
2. **Commercial PAYDEX Score (1–100):**
   - Evaluates commercial entity trade credit and supplier promptness.
   - Scores $\ge 80$ represent prompt repayment; $< 50$ represent serious credit risk.
3. **Director Network Contagion Analysis:**
   - Inspect cross-directorship linkages.
   - Recursively identifies affiliated businesses where a co-director has defaulted ($-15$ penalty points per failed directorship up to depth 2).

---

### 4.3. Credit Provider Data Ingestion (`/provider`)
**Target Persona:** Bank & Financial Institution Data Officers (`provider@example.com`).

1. **Opening the Ingestion Portal:**
   - Navigate to [`/provider`](https://frontend-alpha-neon-82.vercel.app/provider).
2. **Submitting Credit Records:**
   - **Single Record Ingest:** Submit account opening, monthly balance update, default notice, or closure.
   - **Bulk Batch Ingest:** Upload JSON or NDJSON batch files containing multi-account records.
3. **Statutory Ingestion Validations:**
   - Only Class A/B/C BFIs and licensed Microfinance institutions can submit RHI.
   - TFN/Foreign unauthorized identifiers are automatically rejected under privacy guardrails.
   - All accepted records are immutably written to the **Bitemporal Credit Ledger**.

---

### 4.4. Analyst Backtesting & Risk Modeling (`/analyst`)
**Target Persona:** Quantitative Risk Analysts (`analyst@example.com`).

1. **Accessing the Risk Workbench:**
   - Navigate to [`/analyst`](https://frontend-alpha-neon-82.vercel.app/analyst).
2. **Backtesting Credit Scoring Models:**
   - Select model version (e.g., `NRB-CIB-v2.1` vs `Baseline-v1.0`).
   - Run historical backtests against default cohorts over 12/24/36-month windows.
   - Review Gini coefficients, KS metrics, and ROC curves.
3. **Macroeconomic Stress Testing:**
   - Simulate interest rate shocks (+200 bps) or remittance contractions on household default probabilities.

---

### 4.5. Governance & Audit Trails (`/admin`)
**Target Persona:** Bureau Administrators & Compliance Officers (`admin@example.com`).

1. **Accessing Audit Governance:**
   - Navigate to [`/admin`](https://frontend-alpha-neon-82.vercel.app/admin).
2. **Cryptographic Audit Log Inspection:**
   - View tamper-evident audit logs with SHA-256 event chaining (`prev_hash` $\to$ `current_hash`).
   - Audit all consumer file accesses under Nepal Privacy Act Sec 20R requirements.
3. **Dispute Resolution Tracking:**
   - Track 30-day statutory SLA countdowns on all open disputes.
   - View adjudication status and bitemporal ledger corrections.

---

## 5. Bilingual Localization (English & Nepali)

The application features full runtime bilingual localization without requiring full-page reloads.

### Toggling Language:
- In the top right header, click **[ EN ]** or **[ नेपाली ]**.
- The UI instantly switches translations (labels, buttons, pillar names, tables, and statuses) while retaining your session and current page state.
- Supports Devanagari typography (`Noto Sans Devanagari` and `Mukta` fonts).

---

## 6. Local Development Guide

### Prerequisites
- Node.js 18+ & npm
- Python 3.10+
- PostgreSQL or SQLite

### 6.1. Running the Backend
```bash
# Navigate to backend directory
cd backend

# Create & activate virtual environment
python -m venv venv
venv\Scripts\activate      # Windows
# source venv/bin/activate  # Linux/macOS

# Install dependencies
pip install -r requirements.txt

# Run database seed
python seed_data.py

# Start FastAPI development server
uvicorn app.main:app --reload --port 8000
```
- API Swagger Documentation: `http://localhost:8000/docs`
- API Health Endpoint: `http://localhost:8000/health`

### 6.2. Running the Frontend
```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start Next.js development server with Turbopack
npm run dev
```
- Frontend application URL: `http://localhost:3000`

### 6.3. Running Automated Tests
```bash
# Backend Test Suite (Pytest)
cd backend
pytest -v

# Frontend Test Suite (Playwright)
cd frontend
npx playwright test
```

---

## 7. Cloud Deployment & Production Operations

### 7.1. Deploying Frontend to Vercel
```bash
cd frontend
vercel --prod --force --yes
```
- **Live URL**: `https://frontend-alpha-neon-82.vercel.app`

### 7.2. Environment Variables Configuration

#### Backend `.env`:
```env
DATABASE_URL=postgresql://user:password@host:5432/credit_db
JWT_SECRET=super-secret-jwt-key-minimum-32-chars
ENCRYPTION_KEY=base64-encoded-32-byte-aes-gcm-key
BLIND_INDEX_SALT=base64-encoded-salt-key
CORS_ORIGINS=https://frontend-alpha-neon-82.vercel.app,http://localhost:3000
```

#### Frontend `.env.local`:
```env
NEXT_PUBLIC_API_URL=https://api.creditreporting.gov.np
NEXT_PUBLIC_GIT_SHA=v1.0-nepal
```

---

## 8. Troubleshooting & FAQs

### Q1: Why am I being redirected to `/login` when clicking navigation tabs?
**Answer:** The navigation routes are protected by Edge RBAC middleware. If you are not signed in or your JWT session has expired, you will be redirected to `/login`. Sign in using one of the test persona accounts.

### Q2: How do I resolve an MFA code failure?
**Answer:** Ensure the local system clock is synchronized (TOTP uses RFC 6238 30-second time windows). Alternatively, refer to the Base32 test secret displayed on the login card to generate a fresh token.

### Q3: How does Bitemporal Querying work?
**Answer:** Every ledger entry contains two time dimensions:
- `valid_time`: The historical date the credit event occurred in the real world.
- `transaction_time`: The exact timestamp the record was written into the ledger.
To reconstruct a credit file at any past point in time, pass the `as_of` query parameter (e.g., `/api/reports/CIT-27-01-78-04821?as_of=2025-12-31T00:00:00Z`).
