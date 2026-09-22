"""Test account and RBAC credential seeding script for Nepal Credit Reporting Mechanism.

This module provisions standard testing accounts spanning all four system roles
(ADMIN, ANALYST, PROVIDER, SUBJECT) with configured passwords and cryptographically
random Base32 TOTP MFA secrets for development and automated test suites.

Architecture:
    Infrastructure & Test Tooling (Backend Scripts).
    Depends on database models, Argon2 password hashing, and AES/HMAC encryption.
    Outputs dynamic credentials to TEST_ACCOUNTS.md.

Legal / Regulatory:
    Ensures role separation compliant with Nepal Individual Privacy Act 2018
    (वैयक्तिक गोपनीयता सम्बन्धी ऐन, २०७५) and Nepal Rastra Bank credit information
    directives, establishing distinct test subjects and licensed BFI provider tenants.
"""

import os
import sys
import pyotp

# Ensure local application packages can be resolved
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Data hygiene guardrail preventing accidental execution against production databases
if os.getenv("ENVIRONMENT") != "development":
    raise RuntimeError(
        "CRMS Data Hygiene Guardrail Violation: Seed script execution rejected! "
        "ENVIRONMENT environment variable must be strictly set to 'development'."
    )

from app.database import SessionLocal
from app.models import User, RoleEnum, Entity, EntityTypeEnum
from app.auth import hash_password
from app.encryption import encrypt_field, compute_blind_index

def seed_accounts():
    """Provisions RBAC test accounts across all system personas with MFA secrets.

    Cleanses existing test accounts to avoid unique constraint violations, creates
    associated individual entity 'CIT-27-01-78-04821' (Ram Kumar Shrestha) for subject testing,
    hashes passwords via Argon2id, commits records, and writes markdown credentials
    to TEST_ACCOUNTS.md.

    Raises:
        RuntimeError: If ENVIRONMENT is not explicitly 'development'.
    """
    db = SessionLocal()

    ram_id = "CIT-27-01-78-04821"
    ram = db.query(Entity).filter(Entity.id == ram_id).first()
    if not ram:
        ram = Entity(
            id=ram_id,
            type=EntityTypeEnum.INDIVIDUAL,
            identifier=encrypt_field(ram_id),
            identifier_blind_index=compute_blind_index(ram_id),
            basic_info={
                "first_name": "राम कुमार (Ram Kumar)",
                "last_name": "श्रेष्ठ (Shrestha)",
                "citizenship_no": "२७-०१-७८-०४८२१ (27-01-78-04821)",
                "national_id": "१०८-२९४-८१७२ (108-294-8172)",
                "pan_number": "301982741",
                "dob": "1984-05-28",
                "address": "नयाँ बानेश्वर, काठमाडौँ (New Baneshwor, Kathmandu, Nepal)",
                "phone": "+977 9851082914"
            }
        )
        db.add(ram)
        db.commit()

    # Generate cryptographically random MFA secrets per seed run
    admin_totp = pyotp.random_base32()
    analyst_totp = pyotp.random_base32()
    provider_totp = pyotp.random_base32()

    test_users = [
        {
            "id": "usr_admin_001",
            "email": "admin@example.com",
            "password": "Sprint2026!Admin",
            "role": RoleEnum.ADMIN,
            "totp_secret": admin_totp,
            "mfa_enabled": True,
            "tenant_id": None,
            "entity_id": None
        },
        {
            "id": "usr_analyst_001",
            "email": "analyst@example.com",
            "password": "Sprint2026!Analyst",
            "role": RoleEnum.ANALYST,
            "totp_secret": analyst_totp,
            "mfa_enabled": True,
            "tenant_id": None,
            "entity_id": None
        },
        {
            "id": "usr_provider_001",
            "email": "provider@example.com",
            "password": "Sprint2026!Provider",
            "role": RoleEnum.PROVIDER,
            "totp_secret": provider_totp,
            "mfa_enabled": True,
            "tenant_id": "PRV-NABIL-001",
            "entity_id": None
        },
        {
            "id": "usr_subject_001",
            "email": "subject@example.com",
            "password": "Sprint2026!Subject",
            "role": RoleEnum.SUBJECT,
            "totp_secret": None,
            "mfa_enabled": False,
            "tenant_id": None,
            "entity_id": ram_id
        }
    ]

    # Cleanly remove any old test accounts to prevent duplicate id/email conflicts
    db.query(User).filter(
        User.email.in_([
            "admin@example.com", "analyst@example.com", "provider@example.com", "subject@example.com"
        ]) | User.id.in_(["usr_admin_001", "usr_analyst_001", "usr_provider_001", "usr_subject_001"])
    ).delete(synchronize_session=False)
    db.commit()

    for u_data in test_users:
        hashed = hash_password(u_data["password"])
        new_user = User(
            id=u_data["id"],
            email=u_data["email"],
            password_hash=hashed,
            role=u_data["role"],
            totp_secret=u_data["totp_secret"],
            mfa_enabled=u_data["mfa_enabled"],
            tenant_id=u_data["tenant_id"],
            entity_id=u_data["entity_id"]
        )
        db.add(new_user)
        print(f"Created user: {new_user.email} ({new_user.role.value})")

    db.commit()
    db.close()

    # Write dynamic credentials to TEST_ACCOUNTS.md in root
    root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    test_accounts_path = os.path.join(root_dir, "TEST_ACCOUNTS.md")
    
    content = f"""# Test Accounts & Credentials (Dynamically Generated)
# Auto-generated by seed script - Never commit secrets to version control.
# Ignored by .gitignore per security policy.

| Role | Email | Password | MFA Enabled | TOTP Secret (Base32) | Associated ID | Access Level |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **ADMIN** | `admin@example.com` | `Sprint2026!Admin` | Yes | `{admin_totp}` | N/A | Full administrative control, model calibration, user management, audit logging |
| **ANALYST** | `analyst@example.com` | `Sprint2026!Analyst` | Yes | `{analyst_totp}` | N/A | Dispute investigations under Nepal Privacy Act Sec 12, back-testing, bitemporal file inspection |
| **PROVIDER** | `provider@example.com` | `Sprint2026!Provider` | Yes | `{provider_totp}` | `PRV-NABIL-001` | Data ingestion within licensed categories (Class A BFI, RHI, accounts, defaults) |
| **SUBJECT** | `subject@example.com` | `Sprint2026!Subject` | No | None | `{ram_id}` | Self-service consumer credit file, 5-pillar score breakdowns, enquiry history, dispute filing |

---

## MFA Verification Details
For accounts with MFA enabled (**Admin**, **Analyst**, **Provider**):
1. Upon submitting email and password at `/login`, an interim `mfa_token` is returned with `mfa_required: true`.
2. Enter the current 6-digit TOTP code generated from the corresponding TOTP Secret.

### Generating TOTP code via CLI:
```bash
python -c "import pyotp; print('Admin TOTP:', pyotp.TOTP('{admin_totp}').now())"
python -c "import pyotp; print('Analyst TOTP:', pyotp.TOTP('{analyst_totp}').now())"
python -c "import pyotp; print('Provider TOTP:', pyotp.TOTP('{provider_totp}').now())"
```
"""
    with open(test_accounts_path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Dynamically generated credentials written to {test_accounts_path}")

if __name__ == "__main__":
    seed_accounts()
