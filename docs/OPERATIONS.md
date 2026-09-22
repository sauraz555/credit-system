# Operations, Deployment & Maintenance Guide

## 1. Environment Configuration

All operational configuration is managed via environment variables.

| Variable Name | Default / Example | Purpose | Sensitive? |
| :--- | :--- | :--- | :--- |
| `ENVIRONMENT` | `production` / `development` | System runtime mode; guards seed scripts. | No |
| `DATABASE_URL` | `sqlite:///./credit_bureau.db` | PostgreSQL / SQLite database connection URI. | Yes |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis broker for Celery queues and rate limiting. | Yes |
| `JWT_SECRET_KEY` | `crms-insecure-default-key-...` | Secret used to sign and verify HMAC-SHA256 JWT tokens. | **CRITICAL** |
| `ENCRYPTION_KEY` | `MDEyMzQ1Njc4OWFiY2RlZjAx...` | Base64-encoded 256-bit key for AES-256-GCM field encryption. | **CRITICAL** |
| `BLIND_INDEX_SALT` | `crms-blind-index-default-salt...` | Cryptographic salt for deterministic HMAC-SHA256 indexing. | **CRITICAL** |
| `SENTRY_DSN` | `https://...@sentry.io/...` | Sentry Application Performance Monitoring endpoint. | Yes |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend API base URL consumed by Next.js frontend. | No |

---

## 2. Database Migrations (Alembic)

*Code Reference*: [`backend/alembic/`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/alembic/)

The relational schema is managed with **Alembic**. On server startup, FastAPI automatically verifies and upgrades the schema to the latest revision (`backend/alembic/versions/0001_baseline_schema.py`).

### Common Migration Commands
```bash
cd backend

# Apply all pending database migrations
venv\Scripts\alembic upgrade head

# Generate a new auto-detected migration revision
venv\Scripts\alembic revision --autogenerate -m "add_new_indicator"

# Revert the most recent migration
venv\Scripts\alembic downgrade -1
```

---

## 3. Celery Background Jobs & Schedules

*Code Reference*: [`backend/app/tasks.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/tasks.py)

Background tasks and statutory countdown timers are handled by **Celery** with Redis as the message broker.

| Task Function | Schedule | Purpose & Action Taken |
| :--- | :--- | :--- |
| `app.tasks.run_data_expiry_job` | Daily at 02:00 UTC | **Privacy Act Section 20W Data Retention**:<br/>Scans active ledger records; marks expired records (`RHI` > 2y, `DEFAULT` > 5y, `HARDSHIP` > 1y) with `RecordStatusEnum.EXPIRED`. |
| `app.tasks.check_dispute_sla_alerts` | Every 4 Hours | **Privacy Act Section 20V Dispute SLA Tracking**:<br/>Identifies open disputes approaching the 30-day statutory resolution deadline ($\ge 25$ days elapsed) and logs escalation alerts. |

### Running Celery Workers in Production
```bash
cd backend

# Start the Celery Worker process
venv\Scripts\celery -A app.tasks.celery_app worker --loglevel=info --concurrency=4

# Start the Celery Beat scheduler
venv\Scripts\celery -A app.tasks.celery_app beat --loglevel=info
```

---

## 4. Monitoring & Telemetry

### 4.1 Health Check Probe (`GET /health`)
- Used by Kubernetes readiness/liveness probes and load balancers.
- Verifies relational database connection (`SELECT 1`) and Redis ping.
- Returns `200 OK` when healthy, or `503 Service Unavailable` if an essential dependency fails.

### 4.2 Prometheus Metrics (`GET /metrics`)
- Scraped by Prometheus agents for Grafana dashboards.
- Telemetry exposed:
  - `crms_http_requests_total`: Request counter partitioned by method, endpoint, and HTTP status code.
  - `crms_request_duration_seconds`: Histogram of endpoint latency percentiles.
  - `crms_bitemporal_ledger_events_total`: Total committed ledger events.
  - `crms_active_disputes_count`: Gauge of currently unresolved Section 20V disputes.

---

## 5. Backup & Disaster Recovery

### 5.1 Database Backup Strategy
- **Full Nightly Backup**: PostgreSQL `pg_dump` or SQLite snapshot executed prior to the 02:00 UTC Celery expiry job.
- **Continuous Archiving**: Write-Ahead Logging (WAL) shipping enabled to support Point-in-Time Recovery (PITR) to any second within the trailing 30 days.

### 5.2 Backup Command Example (PostgreSQL)
```bash
# Export encrypted database dump
pg_dump -Fc -h localhost -U crms_admin credit_bureau | \
  openssl enc -aes-256-cbc -salt -pbkdf2 -out backup_$(date +%F).dump.enc
```

### 5.3 Restore Verification
- Restorations must be verified against an isolated staging instance.
- Run `backend/venv/Scripts/python -m pytest backend/tests` against the restored instance to verify data integrity and scoring calculation consistency.
