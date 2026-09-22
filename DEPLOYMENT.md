# Production Deployment & Environment Guide

## 1. System Overview

The **Credit Reporting Mechanism (CRMS)** architecture is decoupled into two independent production tiers:
- **Frontend Presentation Layer**: Next.js 16 (App Router) deployed to **Vercel** with the Carbon Design System.
- **Backend Service Layer**: FastAPI Python service backed by PostgreSQL (bitemporal ledger) and Redis (rate limiting & token revocation), deployable to **Railway** or **Fly.io**.

---

## 2. GitHub Repository Configuration

- **Repository**: [`https://github.com/sauraz555/credit-system`](https://github.com/sauraz555/credit-system)
- **Active Hotfix Branch**: `hotfix-live`
- **Renamed From**: `credit-sysyem` &rarr; `credit-system`

---

## 3. Vercel Deployment & Password Protection

### Live URLs
- **Production URL**: `https://frontend-alpha-neon-82.vercel.app`
- **Deployment URL**: `https://frontend-g9l61i3b5-sauraz555s-projects.vercel.app`

### Password Protection Configuration

Shared Site Password:
```
CreditReporting2026!
```

#### Dual Lockdown Strategy:
1. **Edge Middleware Basic Auth (Active on All Tiers including Hobby)**:
   In `frontend/src/middleware.ts`, any request to the site checks the `SITE_PASSWORD` environment variable.
   To lock down the site immediately via Vercel CLI:
   ```bash
   npx vercel env add SITE_PASSWORD production
   # Value: CreditReporting2026!
   ```
   When set, unauthorized visitors receive an HTTP 401 Basic Auth challenge (`Credit Reporting Mechanism Secure Gateway`).
   
2. **Native Vercel Deployment Protection (Requires Pro Plan)**:
   If the Vercel team/account is upgraded to Pro:
   ```bash
   npx vercel project protection enable frontend --password --protection-password "CreditReporting2026!"
   ```

---

## 4. Backend Deployment Guide (FastAPI + PostgreSQL + Redis)

### Option A: 1-Click Railway Deployment (Recommended)
1. Install Railway CLI or open [Railway Dashboard](https://railway.app/new):
   ```bash
   npm i -g @railway/cli
   railway login
   railway init
   ```
2. Add Database plugins:
   - Add **PostgreSQL** service (copies `DATABASE_URL` into environment).
   - Add **Redis** service (copies `REDIS_URL` into environment).
3. Connect the GitHub repository `sauraz555/credit-system` (Root: `backend/Dockerfile` configured in `railway.json`).
4. Set the following environment variables on the backend service:
   ```env
   SECRET_KEY=crms-super-secret-production-encryption-key-minimum-32-chars-2026
   ENCRYPTION_KEY=32-byte-hex-string-for-aes-gcm-field-level-encryption==
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   REDIS_URL=${{Redis.REDIS_URL}}
   CORS_ORIGINS=https://frontend-alpha-neon-82.vercel.app,https://*.vercel.app
   PORT=8000
   ```
5. Run migrations & seed data:
   ```bash
   railway run python -m alembic upgrade head
   railway run python -m scripts.seed_data
   ```
6. Copy the generated Railway public service URL (e.g. `https://crms-backend-production.up.railway.app`).

---

### Option B: Fly.io Deployment
1. Install `flyctl` and authenticate:
   ```bash
   fly auth login
   ```
2. Launch with `fly.toml`:
   ```bash
   fly launch --config fly.toml --no-deploy
   ```
3. Provision PostgreSQL and Redis:
   ```bash
   fly postgres create --name crms-postgres --region syd
   fly redis create --name crms-redis --region syd
   fly postgres attach crms-postgres
   ```
4. Set required secrets:
   ```bash
   fly secrets set SECRET_KEY="crms-super-secret-production-key-2026" ENCRYPTION_KEY="32-byte-hex-string-for-aes-gcm-key"
   ```
5. Deploy:
   ```bash
   fly deploy
   ```

---

## 5. Connecting Frontend to Backend on Vercel

Once the backend service is deployed:
1. Add `NEXT_PUBLIC_API_URL` to Vercel:
   ```bash
   npx vercel env add NEXT_PUBLIC_API_URL production
   # Value: https://<your-backend-url>
   ```
2. Redeploy frontend:
   ```bash
   npx vercel --prod --yes
   ```
3. The offline banner (`"Demo backend not connected. Set NEXT_PUBLIC_API_URL."`) will disappear, and login/data fetching will connect to the live backend.

---

## 6. Test Accounts & Credentials

| Role | Email | Password | MFA Enabled | TOTP Secret (Base32) | Access Scope |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ADMIN** | `admin@example.com` | `Sprint2026!Admin` | Yes | `MRYYKLJ3GNBXCF3JLRIBHR6QV4IFLCN2` | Governance, Model Activation, User Management |
| **ANALYST** | `analyst@example.com` | `Sprint2026!Analyst` | Yes | `WLNJMOIXHFS442MVSNNA5WQJE74JWV3I` | Dispute Adjudication, Point-in-time Investigation, Back-testing |
| **PROVIDER** | `provider@example.com` | `Sprint2026!Provider` | Yes | `FKH56R4XUAXHWHFGNX3QE5TY6KFOOMOH` | Ingestion Console, Inquiry Gateway (`PRV-CBA-001`) |
| **SUBJECT** | `subject@example.com` | `Sprint2026!Subject` | No | None | Consumer Credit File (`IND-8842-1994`) |

### TOTP Code Generator (CLI)
```bash
python -c "import pyotp; print('Admin TOTP:', pyotp.TOTP('MRYYKLJ3GNBXCF3JLRIBHR6QV4IFLCN2').now())"
python -c "import pyotp; print('Analyst TOTP:', pyotp.TOTP('WLNJMOIXHFS442MVSNNA5WQJE74JWV3I').now())"
python -c "import pyotp; print('Provider TOTP:', pyotp.TOTP('FKH56R4XUAXHWHFGNX3QE5TY6KFOOMOH').now())"
```
