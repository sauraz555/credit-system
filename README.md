# Credit Reporting Mechanism (CRMS) Platform

An institutional-grade Comprehensive Credit Reporting (CCR) system operating in compliance with:
- **Privacy Act 1988 (Cth) Part IIIA** (Statutory credit reporting, 24-month RHI, Section 20V dispute adjudication)
- **APRA Prudential Standard APS 220** (Credit Risk Management & Corporate Group Contagion Protocols)
- **National Consumer Credit Protection Act 2009** (NCCP Act & Responsible Lending)

Built on a **FastAPI (Python)** backend with an immutable bitemporal ledger, deterministic scoring engine, Celery data retention tasks, and an enterprise **IBM Carbon Design System (`@carbon/react`)** Next.js web application.

---

## Architecture Overview

```
credit-system/
├── backend/                  # FastAPI Python backend
│   ├── app/
│   │   ├── routers/          # API endpoints (reports, ingest, disputes, admin)
│   │   ├── services/         # Deterministic scoring engine & feature store
│   │   ├── models.py         # SQLAlchemy models (bitemporal ledger, entities, scores)
│   │   ├── schemas.py        # Pydantic validation (min $150, 60+ days, notice given)
│   │   ├── database.py       # SQLite / PostgreSQL engine configuration
│   │   └── tasks.py          # Celery data expiry jobs (RHI 24m, defaults 5y)
│   ├── scripts/
│   │   ├── seed_data.py      # Seeds 500 individuals, 100 companies, RHI & trade lines
│   │   └── seed_featured.py  # Seeds primary demo entities (IND-8842-1994, ACN-109-283-912)
│   ├── tests/                # Pytest unit & integration test suite (9 test suites)
│   └── requirements.txt      # Python dependencies
├── frontend/                 # Next.js 16 (App Router) + IBM Carbon Design System
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx            # Executive Command Center & Direct File Search
│   │   │   ├── subject/[id]/       # Consumer Credit Report & Bitemporal Scrubber
│   │   │   ├── subject/            # Commercial Report & Director Contagion Network
│   │   │   ├── provider/           # Provider Ingestion Console & Real-time Check
│   │   │   └── admin/              # Supervisory Console & Section 20V Dispute Queue
│   │   ├── components/             # CarbonShell and layout components
│   │   └── globals.css             # IBM Plex typography & Carbon spacing tokens
│   └── package.json
└── README.md
```

---

## Key Modules & Features

### 1. Executive Command Center (`/`)
- Platform status ticker, live bureau operational statistics (monitored consumers, commercial entities, bitemporal ledger event blocks).
- Direct File Lookup with instant autocomplete search.
- Live bitemporal ledger audit event stream.

### 2. Consumer Credit Report (`/subject/[id]`)
- **4-KPI Financial Strip**: Comprehensive Bureau Score (0–1000) with calibrated multi-zone gauge, revolving utilisation, adverse listings, and credit velocity.
- **Bitemporal "As-Of" Time Machine**: Historical score reproduction (`Realtime (T-0)`, `2026-06-30`, `2025-12-31`, `2024-03-01`).
- **Live "What-If" Score Simulator**: Interactive debt paydown sliders and default removal switches.
- **24-Month Rolling RHI Calendar**: Account level drill-down (`0` on-time, `1` 30d late, `2` 60d late, `3-6` default risk, `X` grace, `C` closed).
- **Section 20V Statutory Dispute Filing**: Lodging formal disputes with automatic bitemporal ledger flagging.

### 3. Commercial Company Report & Director Network (`/subject`)
- **Commercial File Assessment**: PAYDEX 1–100 promptness score, trade credit experiences table, and PPSR registered charges.
- **Dynamic Director Contagion Topology**: Interactive SVG network graph illustrating company-director linkages, common directorships, cross-guarantees, and systemic risk contagion.
- **Entity Directory Switcher**: Live dropdown to inspect registered companies across the bureau.

### 4. Credit Provider Ingestion Console (`/provider`)
- **JSON & Batch Ingestion**: Real-time validation against Part IIIA statutory criteria (debt &ge; $150, 60+ days overdue, Section 6Q / 21D notices served).
- **Real-Time Bureau Inquiry**: Hard and soft inquiry simulation with instant risk decision support feedback.
- **Ingestion Batch Audit Log**: Real-time audit trail of committed and rejected events.

### 5. Supervisory & Risk Governance Console (`/admin`)
- **Algorithm Model Calibration**: Weight adjustment sliders (RHI, Utilisation, Longevity, Defaults, Enquiries) with statistical backtesting (Gini index, KS metric, PSI).
- **Section 20V Statutory Dispute Queue**: Real-time 30-day countdown timer monitor with one-click adjudication actions (**Expunge** or **Confirm Accurate**).
- **Cryptographic Ledger Verification**: SHA-256 Merkle root verification confirming zero ledger tampering.

---

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+ and npm

### Backend Setup
```bash
cd backend
python -m venv venv
venv\Scripts\activate       # On Windows (or source venv/bin/activate on Linux/macOS)
pip install -r requirements.txt

# Seed initial bureau database (608 entities)
python scripts/seed_data.py
python scripts/seed_featured.py

# Start the API server
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
API documentation is available at `http://127.0.0.1:8000/docs`.

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Web console is available at `http://localhost:3000`.

### Running Tests
```bash
cd backend
pytest tests/ -v
```

---

## Regulatory Compliance Reference
- **Part IIIA, Privacy Act 1988 (Cth)**: Comprehensive Credit Reporting statutory rules, permitted disclosures, and data retention schedules.
- **Privacy (Credit Reporting) Code 2014**: Operational code governing exchange of credit information between credit providers and credit reporting bodies (CRBs).
- **APRA Prudential Standard APS 220**: Credit quality management and corporate group contagion standards.
