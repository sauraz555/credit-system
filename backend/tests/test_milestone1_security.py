"""Security and RBAC verification test suite.

Validates core security architecture controls including unauthenticated rejection (401),
cross-role RBAC enforcement (403), consumer self-service file isolation, sliding-window
rate limiting (429), field-level encryption (AES-256-GCM + HMAC blind indexing), and
strict statutory prohibition of Tax File Numbers (TFN).

Architecture:
    Security Test Suite (Backend Integration Tests).
    Validates FastAPI routers, authentication middleware, rate limiting, and encryption.
    Executed during CI/CD security audits.

Legal / Regulatory:
    Privacy Act 1988 Part IIIA, Section 20E (Strict prohibition against collecting or storing
    Tax File Numbers), Section 20R (Consumer credit report access controls), and Australian
    Privacy Principles (APP 11: Security of personal information).
"""

import os
import sys
import unittest
from datetime import date
from fastapi.testclient import TestClient

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app
from app.database import init_db, SessionLocal, engine
from app.models import User, RoleEnum, Entity, EntityTypeEnum
from app.auth import create_access_token, hash_password
from app.encryption import encrypt_field, decrypt_field, compute_blind_index

client = TestClient(app)

class TestMilestone1Security(unittest.TestCase):
    """Integration test suite evaluating API authentication, RBAC, and encryption guarantees."""

    @classmethod
    def setUpClass(cls):
        init_db()
        db = SessionLocal()
        # Seed test entities and users
        # Entity A
        cls.entity_a = db.query(Entity).filter(Entity.identifier_blind_index == compute_blind_index("IND-TEST-A")).first()
        if not cls.entity_a:
            cls.entity_a = Entity(
                type=EntityTypeEnum.INDIVIDUAL,
                identifier=encrypt_field("IND-TEST-A"),
                identifier_blind_index=compute_blind_index("IND-TEST-A"),
                basic_info=encrypt_field('{"first_name": "Alice", "last_name": "Smith"}')
            )
            db.add(cls.entity_a)
            db.commit()
            db.refresh(cls.entity_a)

        # Entity B
        cls.entity_b = db.query(Entity).filter(Entity.identifier_blind_index == compute_blind_index("IND-TEST-B")).first()
        if not cls.entity_b:
            cls.entity_b = Entity(
                type=EntityTypeEnum.INDIVIDUAL,
                identifier=encrypt_field("IND-TEST-B"),
                identifier_blind_index=compute_blind_index("IND-TEST-B"),
                basic_info=encrypt_field('{"first_name": "Bob", "last_name": "Jones"}')
            )
            db.add(cls.entity_b)
            db.commit()
            db.refresh(cls.entity_b)

        # Admin user
        cls.admin_user = db.query(User).filter(User.email == "admin_test@bureau.gov.au").first()
        if not cls.admin_user:
            cls.admin_user = User(
                email="admin_test@bureau.gov.au",
                password_hash=hash_password("AdminPass123!"),
                role=RoleEnum.ADMIN
            )
            db.add(cls.admin_user)

        # Provider user
        cls.provider_user = db.query(User).filter(User.email == "provider_test@bank.com.au").first()
        if not cls.provider_user:
            cls.provider_user = User(
                email="provider_test@bank.com.au",
                password_hash=hash_password("ProviderPass123!"),
                role=RoleEnum.PROVIDER,
                tenant_id="PRV-NAB-001"
            )
            db.add(cls.provider_user)

        # Subject user (linked to Entity A)
        cls.subject_user = db.query(User).filter(User.email == "subject_a@test.com").first()
        if not cls.subject_user:
            cls.subject_user = User(
                email="subject_a@test.com",
                password_hash=hash_password("SubjectPass123!"),
                role=RoleEnum.SUBJECT,
                entity_id=cls.entity_a.id
            )
            db.add(cls.subject_user)

        db.commit()
        db.refresh(cls.admin_user)
        db.refresh(cls.provider_user)
        db.refresh(cls.subject_user)

        cls.entity_a_id = cls.entity_a.id
        cls.entity_b_id = cls.entity_b.id

        # Tokens
        cls.admin_token = create_access_token({"sub": cls.admin_user.id, "email": cls.admin_user.email, "role": RoleEnum.ADMIN})
        cls.provider_token = create_access_token({"sub": cls.provider_user.id, "email": cls.provider_user.email, "role": RoleEnum.PROVIDER, "tenant_id": cls.provider_user.tenant_id})
        cls.subject_token = create_access_token({"sub": cls.subject_user.id, "email": cls.subject_user.email, "role": RoleEnum.SUBJECT, "entity_id": cls.entity_a.id})
        db.close()

    def test_unauthenticated_endpoints_return_401(self):
        """Unauthenticated access to protected endpoints must return 401."""
        res_admin = client.get("/api/admin/models")
        self.assertEqual(res_admin.status_code, 401, f"Expected 401 for unauthenticated /api/admin/models, got {res_admin.status_code}")

        res_ingest = client.post("/api/ingest/record", json={"entity_id": "123", "record_type": "RHI", "data": {}, "valid_from": "2026-01-01"})
        self.assertEqual(res_ingest.status_code, 401, f"Expected 401 for unauthenticated /api/ingest/record, got {res_ingest.status_code}")

        res_report = client.get(f"/api/reports/{self.entity_a_id}")
        self.assertEqual(res_report.status_code, 401, f"Expected 401 for unauthenticated /api/reports, got {res_report.status_code}")

    def test_rbac_forbidden_across_roles_returns_403(self):
        """A user with PROVIDER role cannot access ADMIN endpoints."""
        headers = {"Authorization": f"Bearer {self.provider_token}"}
        res = client.get("/api/admin/models", headers=headers)
        self.assertEqual(res.status_code, 403, f"Expected 403 for provider accessing admin, got {res.status_code}")

    def test_subject_cannot_read_other_subject_returns_403(self):
        """Subject A can read Subject A's report, but cannot read Subject B's report."""
        headers = {"Authorization": f"Bearer {self.subject_token}"}
        # Read own file
        res_own = client.get(f"/api/reports/{self.entity_a_id}", headers=headers)
        self.assertEqual(res_own.status_code, 200, f"Subject should be able to read own file, got {res_own.status_code}")

        # Read other file
        res_other = client.get(f"/api/reports/{self.entity_b_id}", headers=headers)
        self.assertEqual(res_other.status_code, 403, f"Subject A reading Subject B must return 403, got {res_other.status_code}")

    def test_rate_limiter_returns_429(self):
        """Rapid calls exceeding rate limit must return 429 Too Many Requests."""
        from app.rate_limiter import rate_limiter
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        # Exhaust rate limit by sending rapid requests
        got_429 = False
        for _ in range(70):
            res = client.get(f"/api/reports/{self.entity_a_id}", headers=headers)
            if res.status_code == 429:
                got_429 = True
                break
        self.assertTrue(got_429, "Rate limiter should trigger 429 on rapid requests")
        # Reset memory store so other tests are not throttled
        rate_limiter._memory_store.clear()

    def test_identifiers_unreadable_in_raw_db(self):
        """Raw DB queries must show ciphertext, not cleartext identifiers or PII."""
        db = SessionLocal()
        raw_entity = db.query(Entity).filter(Entity.id == self.entity_a_id).first()
        db.close()

        # The stored identifier in the DB must NOT be plaintext "IND-TEST-A"
        self.assertNotEqual(raw_entity.identifier, "IND-TEST-A")
        # Decrypting it must yield "IND-TEST-A"
        self.assertEqual(decrypt_field(raw_entity.identifier), "IND-TEST-A")
        # Blind index lookup works
        blind_idx = compute_blind_index("IND-TEST-A")
        self.assertEqual(raw_entity.identifier_blind_index, blind_idx)

    def test_tfn_not_in_schema_or_system(self):
        """TFN must not be present in schemas or models."""
        from app import models, schemas
        import inspect
        models_src = inspect.getsource(models)
        schemas_src = inspect.getsource(schemas)
        self.assertNotIn("TFN", models_src.upper().replace("PLATFORM", ""))
        self.assertNotIn("TAX FILE NUMBER", models_src.upper())
        self.assertNotIn("TFN", schemas_src.upper().replace("PLATFORM", ""))
        self.assertNotIn("TAX FILE NUMBER", schemas_src.upper())

if __name__ == "__main__":
    unittest.main()
