import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import init_db, SessionLocal
from app.models import User, RoleEnum, Entity, EntityTypeEnum
from app.auth import hash_password
from app.encryption import encrypt_field, compute_blind_index

def seed_accounts():
    init_db()
    db = SessionLocal()

    # Ensure Jonathan Vance exists so subject account has valid entity
    vance = db.query(Entity).filter(Entity.id == "IND-8842-1994").first()
    if not vance:
        vance = Entity(
            id="IND-8842-1994",
            type=EntityTypeEnum.INDIVIDUAL,
            identifier=encrypt_field("IND-8842-1994"),
            identifier_blind_index=compute_blind_index("IND-8842-1994"),
            basic_info={
                "first_name": "Jonathan",
                "last_name": "Vance",
                "dob": "1984-06-14",
                "address": "42 Miller St, North Sydney NSW 2060"
            }
        )
        db.add(vance)
        db.commit()

    test_users = [
        {
            "id": "usr_admin_001",
            "email": "admin@bureau.gov.au",
            "password": "Sprint2026!Admin",
            "role": RoleEnum.ADMIN,
            "totp_secret": "JBSWY3DPEHPK3PXP",
            "mfa_enabled": True,
            "tenant_id": None,
            "entity_id": None
        },
        {
            "id": "usr_analyst_001",
            "email": "analyst@bureau.gov.au",
            "password": "Sprint2026!Analyst",
            "role": RoleEnum.ANALYST,
            "totp_secret": "JBSWY3DPEHPK3PXQ",
            "mfa_enabled": True,
            "tenant_id": None,
            "entity_id": None
        },
        {
            "id": "usr_provider_001",
            "email": "provider@cba.com.au",
            "password": "Sprint2026!Provider",
            "role": RoleEnum.PROVIDER,
            "totp_secret": "JBSWY3DPEHPK3PXR",
            "mfa_enabled": True,
            "tenant_id": "PRV-CBA-001",
            "entity_id": None
        },
        {
            "id": "usr_subject_001",
            "email": "subject@consumer.gov.au",
            "password": "Sprint2026!Subject",
            "role": RoleEnum.SUBJECT,
            "totp_secret": None,
            "mfa_enabled": False,
            "tenant_id": None,
            "entity_id": "IND-8842-1994"
        }
    ]

    for u_data in test_users:
        existing = db.query(User).filter(User.email == u_data["email"]).first()
        hashed = hash_password(u_data["password"])
        if existing:
            existing.password_hash = hashed
            existing.role = u_data["role"]
            existing.totp_secret = u_data["totp_secret"]
            existing.mfa_enabled = u_data["mfa_enabled"]
            existing.tenant_id = u_data["tenant_id"]
            existing.entity_id = u_data["entity_id"]
            print(f"Updated user: {existing.email} ({existing.role.value})")
        else:
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
    print("Seed test accounts completed successfully.")

if __name__ == "__main__":
    seed_accounts()
