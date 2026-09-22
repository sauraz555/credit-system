"""FastAPI Domain Routing Sub-Package for the Credit Reporting Mechanism Platform.

This package organizes API endpoint handlers by functional domain:
- `auth_router`: Authentication, MFA challenge verification, token rotation, and sessions.
- `admin`: Administrative configuration, model governance, audit logs, and backtesting.
- `ingest`: Credit provider data ingestion (RHI, defaults, trade payments, public records).
- `reports`: Bitemporal credit file inspection, enquiry logging, and scoring lookup.
- `disputes`: Statutory consumer disputes under Privacy Act 1988 (Cth) Section 20V.

Architecture Tier:
    API / Presentation Routing Layer.
"""
