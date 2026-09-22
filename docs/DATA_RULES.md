# Permitted Credit Data Types, Validation Rules & Retention Schedules

## 1. Statutory Regulatory Framework

Under the **Privacy Act 1988 (Cth) Part IIIA** and the **Privacy (Credit Reporting) Code 2014**, a Credit Reporting Body (CRB) operates under strict data sovereignty and minimization principles:
- Only explicitly permitted categories of credit information may be collected or recorded.
- Strict pre-conditions must be satisfied before adverse credit events (defaults) may be registered.
- Information must be automatically expunged or archived once statutory retention limits are reached.
- Sensitive identifiers, most notably **Tax File Numbers (TFN)**, are criminalized from collection in credit reporting.

---

## 2. Permitted Credit Data Types & Validation Rules

*Code Reference*: [`backend/app/schemas.py:IngestRecordRequest`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/schemas.py) and [`backend/app/routers/ingest.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/routers/ingest.py)

| Record Type | Permitted Reporters | Validation Constraints | Legal Basis |
| :--- | :--- | :--- | :--- |
| **RHI** (Repayment History Info) | Licensed ADIs and ACL credit providers only. *(Telcos and utilities prohibited).* | Up to 24 characters matching `^[0-6XACV]{1,24}$`. `0` (on time), `1-6` (overdue brackets), `X` (grace), `C` (closed), `A` (temp hardship), `V` (perm hardship). | Privacy Act s20N(1); CR Code cl 8. |
| **DEFAULT** (Consumer Default) | All licensed credit providers. | 1. Overdue amount $\ge \$150.00$.<br/>2. Overdue duration $\ge 60$ days.<br/>3. Formal written Section 6Q notice served $\ge 30$ days prior.<br/>4. Formal written Section 21D intent to list served $\ge 14$ days prior. | Privacy Act s6Q(1); Privacy Act s21D; CR Code cl 9. |
| **HARDSHIP** (Financial Hardship) | Licensed ADIs and ACL credit providers. | Must accompany or update an existing consumer credit account. Indicator must be `A` (temporary variance agreement) or `V` (permanent variation). | Privacy Act s6QA; National Credit Act s72. |
| **TRADE_PAYMENT** (Commercial Credit) | Commercial trade creditors and trade bureaus. | Invoice reference, agreed credit terms (net 30/60), actual payment date, Days Beyond Terms (DBT) integer $\ge -30$. | Privacy Act Part IIIA Div 3 (Commercial credit); Corporations Act 2001. |
| **BANKRUPTCY** (Public Record Adverse) | Insolvency and Trustee Service Australia (AFSA). | Official National Personal Insolvency Index (NPII) reference, petition date, bankruptcy discharge status. | Privacy Act s6(1) "credit information" para (j); s20W Table item 5. |
| **SCI** (Seriously Infringing Credit) | Licensed credit providers. | Fraudulent activity or intentional evasion of process. Requires evidence of reasonable steps taken to locate the consumer. | Privacy Act s6(1); CR Code cl 10. |

---

## 3. Statutory Exclusion: Tax File Numbers (TFN)

*Legal Citation*: **Privacy Act 1988 Part IIIA Section 20E(1)** and **Privacy (Tax File Number) Rule 2015**.

- **Statutory Rule**: A credit reporting body must not collect, hold, use, or disclose Tax File Numbers (TFN) under any circumstances.
- **Enforcement in CRMS**:
  - The database schemas (`models.py`) and API schemas (`schemas.py`) contain zero TFN columns or input fields.
  - Automated CI test `backend/tests/test_milestone1_security.py:test_tfn_not_in_schema_or_system` scans model ASTs and schemas to guarantee TFN data structures can never be committed.

---

## 4. Statutory Retention Periods & Expiry Schedules

*Legal Citation*: **Privacy Act 1988 Part IIIA Section 20W (Retention of credit information)**.

*Code Reference*: [`backend/app/tasks.py:run_data_expiry_job`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/tasks.py)

The bureau enforces automated, scheduled data retention expiration via Celery background tasks:

| Data Type | Statutory Retention Period | Expiry Calculation Date | Action Upon Expiration | Legal Citation |
| :--- | :--- | :--- | :--- | :--- |
| **RHI** | **2 Years** (24 Months) | Date monthly payment was due (`valid_from`). | Status set to `EXPIRED`; excluded from score calculations. | Privacy Act s20W Table item 1. |
| **DEFAULT** | **5 Years** | Date the default was listed (`valid_from`). | Status set to `EXPIRED`; expunged from score calculations. | Privacy Act s20W Table item 2. |
| **HARDSHIP** | **1 Year** (12 Months) | Date hardship agreement commenced (`valid_from`). | Status set to `EXPIRED`. | Privacy Act s20W Table item 1A. |
| **ENQUIRY** | **5 Years** | Date enquiry was logged (`created_at`). | Status set to `EXPIRED`; excluded from enquiry velocity. | Privacy Act s20W Table item 3. |
| **BANKRUPTCY** | **5 Years** (or 2 years post-discharge, whichever is later) | Date bankruptcy was declared or discharged. | Status set to `EXPIRED`. | Privacy Act s20W Table item 5. |
| **COURT JUDGMENT**| **5 Years** | Date judgment was entered. | Status set to `EXPIRED`. | Privacy Act s20W Table item 4. |

---

## 5. Automated Data Expiry Job Implementation

The data retention daemon runs as a Celery periodic beat task (`tasks.run_data_expiry_job`):

```python
# From backend/app/tasks.py
@celery_app.task(name="app.tasks.run_data_expiry_job")
def run_data_expiry_job():
    """Evaluates all active ledger records against Privacy Act s20W retention periods.
    
    Identifies records where (now - valid_from) exceeds statutory limits:
      - RHI: 730 days (2 years)
      - Defaults: 1825 days (5 years)
      - Hardship: 365 days (1 year)
      - Enquiries: 1825 days (5 years)
      
    Marks expired records with RecordStatusEnum.EXPIRED and logs tamper-evident audit events.
    """
```

In keeping with the **bitemporal ledger invariant**, expiring records are not deleted with raw SQL `DELETE` commands; instead, their status is updated to `EXPIRED` with an explicit `superseded_at` timestamp, preserving auditability for historical regulatory queries.
