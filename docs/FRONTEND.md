# Frontend Architecture & Component Inventory

## 1. Overview & Technology Stack

The Credit Reporting Mechanism (CRMS) frontend is built on **Next.js 16 (App Router)** utilizing the **IBM Carbon Design System (`@carbon/react` v1.70.0)**. It delivers a high-density, accessible, dark-themed enterprise user experience for credit bureau operations.

- **Framework**: Next.js 16 (Turbopack, TypeScript, React 19)
- **Design System**: IBM Carbon Design System (`@carbon/react`, `@carbon/icons-react`)
- **Accessibility Target**: W3C WCAG 2.1 Level AA (validated via `@axe-core/playwright`)
- **Theme Support**: Default enterprise dark mode (`g100`) with dynamic toggle to light mode (`g10`)
- **Typography**: IBM Plex Sans (body, headings) and IBM Plex Mono (scores, timestamps, identifiers)

---

## 2. Route Map & Role Clearances

Access to routes is governed by **Next.js Edge Middleware** (`src/middleware.ts`) which validates session cookies (`auth_token`, `auth_role`) and redirects unauthorized users to `/403` or unauthenticated users to `/login`.

| Path | Primary Component | Minimum Role | Permitted Roles | Functional Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `/` | `src/app/page.tsx` | PUBLIC / AUTH | Anyone | Platform overview, operational stats, direct file search, ledger event stream. |
| `/login` | `src/app/login/page.tsx` | PUBLIC | Anyone | Credential submission, MFA TOTP challenge modal, quick persona test selector. |
| `/403` | `src/app/403/page.tsx` | PUBLIC | Anyone | Access Denied view with explanation of RBAC policy violation and account switcher. |
| `/subject/[id]` | `src/app/subject/[id]/page.tsx`| SUBJECT | SUBJECT, ANALYST, ADMIN, PROVIDER | 0–1000 score gauge, 24m RHI calendar, what-if simulator, Section 20V dispute modal. |
| `/subject` | `src/app/subject/page.tsx` | SUBJECT | SUBJECT, ANALYST, ADMIN, PROVIDER | Commercial corporate credit report, PAYDEX 1–100 gauge, Director Network graph. |
| `/provider` | `src/app/provider/page.tsx` | PROVIDER | PROVIDER, ADMIN | Single JSON ingestion console, batch CSV uploader, statutory enquiry portal. |
| `/admin` | `src/app/admin/page.tsx` | ADMIN | ADMIN | Model weight sliders, deployment controls, Section 20V dispute queue, Merkle audit. |
| `/analyst` | `src/app/analyst/page.tsx` | ANALYST | ANALYST, ADMIN | Bitemporal "as-of" file investigator, model backtesting uploader (AUC/Gini/KS). |

---

## 3. Core Component Inventory

### 3.1 Layout Shell (`src/components/CarbonShell.tsx`)
- Persistent enterprise container wrapping all routes.
- **IBM Carbon Header**: Displays platform brand prefix, current enterprise release (`v2.4-enterprise`), and primary navigation links.
- **Header Global Bar**:
  - Theme toggle button (`g100` dark $\leftrightarrow$ `g10` light).
  - Search trigger and notification indicator.
  - Role pill tag badge (`ADMIN`, `ANALYST`, `PROVIDER`, `SUBJECT`).
  - Sign-out button clearing tokens, cookies, and localStorage.
- **SideNav Menu**: Grouped quick navigation with expandable menus for Credit Subjects, Data Providers, and Auditing.
- **WCAG 2.1 AA Compliance**: Includes `SkipToContent` component linking directly to `#main-content`.

### 3.2 Consumer Credit Report Components (`src/app/subject/[id]/page.tsx`)
- **Credit Score Gauge**: Semi-circular calibrated SVG gauge visualizing 0–1000 score with qualitative risk color coding (`Excellent`, `Great`, `Good`, `Fair`, `Poor`).
- **24-Month RHI Grid**: 24-column interactive calendar displaying statutory repayment history codes with status badges:
  - `0`: Paid on time (Emerald)
  - `1`: 30 days overdue (Amber)
  - `2`: 60 days overdue (Orange)
  - `3-6`: Default threshold (Red)
  - `X`: No data / Grace (Muted)
  - `C`: Account closed (Blue)
  - `A` / `V`: Hardship arrangement (Purple)
- **Bitemporal "As-Of" Scrubber**: Time scrubber buttons allowing instantaneous query reconstruction for past reporting dates (`T-0 Realtime`, `2026-06-30`, `2025-12-31`, `2024-03-01`).
- **What-If Credit Simulator**: Client-side interactive simulator evaluating theoretical score adjustments based on debt paydowns and default expungement.
- **Section 20V Dispute Modal**: Carbon `Modal` dialog allowing consumers to file formal challenges against specific ledger records.

### 3.3 Commercial Credit Components (`src/app/subject/page.tsx`)
- **PAYDEX Promptness Meter**: Horizontal linear gauge mapping commercial payment timeliness from 1 to 100 with DBT indicators.
- **Director Network Graph**: Interactive SVG network topology showing relationships between companies, common directors, and cross-guarantee structural risk contagion.
- **Trade Experiences Table**: Detailed supplier credit performance breakdown by invoice terms and delinquency brackets.

---

## 4. State Management & Data Fetching

### 4.1 Client-Side Session State
- Authentication tokens (`access_token`, `refresh_token`), user roles, and entity IDs are maintained in `localStorage`.
- Edge routing authorization is maintained via twin cookies (`auth_token`, `auth_role`) enabling zero-latency edge route protection before React hydration.
- The `CarbonShell` listens to Next.js `usePathname()` transitions to re-synchronize role pills and navigation state.

### 4.2 Data Fetching Pattern
- All data fetching is executed via native `fetch()` calls to `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`).
- Standard pattern:
```typescript
const token = localStorage.getItem('access_token');
const headers = {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
};
const res = await fetch(`${API_BASE}/api/reports/${id}`, { headers });
if (res.status === 403) {
  // Handle role segregation
}
```
- Pages wrapped in `React.Suspense` with Carbon `InlineLoading` or `Loading` indicators for smooth async transition states.
