# Permitted Credit Data Types, Validation Rules & Retention Schedules

## 1. Statutory Regulatory Framework

Under the **Nepal Individual Privacy Act 2018 (वैयक्तिक गोपनीयता सम्बन्धी ऐन, २०७५)** and **Nepal Rastra Bank (NRB) Credit Information Directives**, the Credit Reporting Mechanism (CRMS) operates under strict data sovereignty, privacy protection, and minimization principles:
- Only explicitly permitted categories of credit and utility payment information may be collected or recorded.
- Strict pre-conditions must be satisfied before adverse credit events (defaults or blacklist recommendations) may be registered.
- Information must be automatically expunged or archived once statutory retention limits are reached.
- Individual privacy rights under Section 12 grant every subject the right to inspect, verify, dispute, and demand correction of inaccurate records.

---

## 2. Permitted Credit Data Types & Validation Rules

*Code Reference*: [`backend/app/schemas.py:IngestRecordRequest`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/schemas.py) and [`backend/app/routers/ingest.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/routers/ingest.py)

| Record Type | Permitted Reporters | Validation Constraints | Legal Basis |
| :--- | :--- | :--- | :--- |
| **UTILITY** (Utility Payment History) | Nepal Electricity Authority (NEA), KUKL & Water Supply, Nepal Telecom (NTC), Ncell. | Consumer/service number, monthly billing amount in NPR, 24-month payment history grid. | Nepal Individual Privacy Act 2018; Utility Service Standards. |
| **RHI** (Repayment History Info) | NRB-licensed BFIs (Class A, B, C, D banks & financial institutions) only. *(Non-financial utilities prohibited).* | Up to 24 characters matching `^[0-6XACV]{1,24}$`. `0` (on time), `1-6` (overdue brackets), `X` (grace), `C` (closed), `A` (temp restructuring), `V` (permanent variation). | NRB Unified Directives for BFIs; Nepal Individual Privacy Act 2018. |
| **DEFAULT** (Delinquent Default) | Licensed BFIs and registered utility providers. | 1. Overdue amount $\ge \text{NPR } 10,000.00$.<br/>2. Overdue duration $\ge 60$ days.<br/>3. Formal written notice served $\ge 30$ days prior.<br/>4. Notice of intent to register with credit bureau served $\ge 14$ days prior. | NRB Credit Information Directives; Nepal Individual Privacy Act 2018 Sec 12. |
| **BLACKLIST** (NRB Blacklist / Adverse) | Nepal Rastra Bank (NRB) and Credit Information Centre (CIC / कर्जा सूचना केन्द्र). | Formal blacklist notice reference, default amount, overdue period $\ge 90$ days, promoter/borrower identification. | NRB Blacklist Directives & Credit Information Bye-Laws. |
| **TAX_COMPLIANCE** (Tax Filing & Clearance) | Inland Revenue Department (IRD / आन्तरिक राजस्व विभाग). | Permanent Account Number (PAN), fiscal year tax return verification, Tax Clearance Certificate reference. | Income Tax Act 2058; IRD Verification Framework. |
| **RENTAL** (Tenancy Payment Verification) | Local Municipality/Ward registered tenancy agreements and verified banking channels. | Monthly rent amount in NPR, verified banking payment track record, municipality ward registration reference. | Local Government Operation Act 2074; Nepal Tenancy Regulations. |
| **TRADE_PAYMENT** (Commercial Credit) | Commercial trade creditors, equipment suppliers, registered corporations. | Invoice reference, PAN/VAT of trading parties, agreed credit terms (net 30/60), actual payment date, Days Beyond Terms (DBT) integer $\ge -30$. | Commercial Code & Companies Act 2063. |

---

## 3. Statutory Consumer Rights (Section 12 of Individual Privacy Act 2018)

*Legal Citation*: **Nepal Individual Privacy Act 2018 (वैयक्तिक गोपनीयता सम्बन्धी ऐन, २०७५) Section 12**.

- **Statutory Rule**: Every individual has the fundamental right to obtain full disclosure of all credit and personal information held by the reporting body.
- **Dispute & Correction Procedure**:
  - An individual may submit a formal dispute against any incorrect, unverified, or outdated listing.
  - The reporting body must flag the contested listing as `DISPUTED` immediately, neutralizing any punitive scoring impact pending formal investigation.
  - Formal resolution and verification must be completed within statutory time limits.

---

## 4. Statutory Retention Periods & Expiry Schedules

*Code Reference*: [`backend/app/tasks.py:run_data_expiry_job`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/tasks.py)

The bureau enforces automated, scheduled data retention expiration via periodic background tasks:

| Data Type | Statutory Retention Period | Expiry Calculation Date | Action Upon Expiration | Legal Citation |
| :--- | :--- | :--- | :--- | :--- |
| **UTILITY** | **2 Years** (24 Months) | Date monthly bill was due (`valid_from`). | Status set to `EXPIRED`; excluded from score calculations. | Nepal Individual Privacy Act 2018. |
| **RHI** | **2 Years** (24 Months) | Date monthly BFI payment was due (`valid_from`). | Status set to `EXPIRED`; excluded from score calculations. | NRB Credit Reporting Directives. |
| **DEFAULT** | **5 Years** | Date the default was registered (`valid_from`). | Status set to `EXPIRED`; expunged from score calculations. | NRB Credit Information Framework. |
| **ENQUIRY** | **5 Years** | Date enquiry was logged (`created_at`). | Status set to `EXPIRED`; excluded from enquiry velocity. | Bureau Audit Standards. |
| **BLACKLIST** | **Until Cleared + 2 Years** | Date NRB/CIC issues official blacklist clearance certificate. | Status set to `EXPIRED`; credit rights fully restored. | NRB Blacklist Directives. |
| **COURT JUDGMENT**| **5 Years** | Date judgment was registered. | Status set to `EXPIRED`. | Judicial Record Rules. |

---

## 5. Automated Data Expiry Job Implementation

The data retention daemon runs as a periodic task (`tasks.run_data_expiry_job`), querying the immutable ledger and moving records older than their statutory limit to `EXPIRED`.
