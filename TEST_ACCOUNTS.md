# Test Accounts & Credentials

This document provides credentials for the pre-seeded role accounts for testing and verification across the Credit Reporting Mechanism platform.

| Role | Email | Password | MFA Enabled | TOTP Secret (Base32) | Associated ID | Access Level |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **ADMIN** | `admin@bureau.gov.au` | `Sprint2026!Admin` | Yes | `JBSWY3DPEHPK3PXP` | N/A | Full administrative control, model activation, user management, audit logging |
| **ANALYST** | `analyst@bureau.gov.au` | `Sprint2026!Analyst` | Yes | `JBSWY3DPEHPK3PXQ` | N/A | Dispute investigations, back-testing, bitemporal historical file inspection (cannot activate models or modify users) |
| **PROVIDER** | `provider@cba.com.au` | `Sprint2026!Provider` | Yes | `JBSWY3DPEHPK3PXR` | `PRV-CBA-001` | Data ingestion within licensed categories (RHI, accounts, defaults) |
| **SUBJECT** | `subject@consumer.gov.au` | `Sprint2026!Subject` | No | None | `IND-8842-1994` | Self-service consumer credit file, score breakdowns, enquiry history, dispute filing |

---

## MFA Verification Details
For accounts with MFA enabled (**Admin**, **Analyst**, **Provider**):
1. Upon submitting email and password at `/login`, an interim `mfa_token` is returned with `mfa_required: true`.
2. Enter the current 6-digit TOTP code generated from the corresponding TOTP Secret (or use python `pyotp.TOTP("<SECRET>").now()`).
3. Successful verification returns the JWT access token, refresh token, and user profile.

### Generating TOTP code via CLI:
```bash
python -c "import pyotp; print('Admin TOTP:', pyotp.TOTP('JBSWY3DPEHPK3PXP').now())"
python -c "import pyotp; print('Analyst TOTP:', pyotp.TOTP('JBSWY3DPEHPK3PXQ').now())"
python -c "import pyotp; print('Provider TOTP:', pyotp.TOTP('JBSWY3DPEHPK3PXR').now())"
```
