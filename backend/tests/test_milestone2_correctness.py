import os
import sys
import pytest
import uuid
from datetime import date, datetime, timedelta
from fastapi.testclient import TestClient

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app
from app.database import init_db, SessionLocal
from app.models import (
    Entity, EntityTypeEnum, CreditLedger, RecordTypeEnum, 
    RecordStatusEnum, User, RoleEnum, Provider, AuditLog, Enquiry
)
from app.auth import create_access_token, hash_password
from app.tasks import run_data_expiry_job
from app.encryption import encrypt_field, compute_blind_index

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_test_data():
    init_db()
    db = SessionLocal()
    
    # Ensure admin user exists
    admin = db.query(User).filter(User.email == "admin@bureau.gov.au").first()
    if not admin:
        admin = User(
            id="usr_admin_m2",
            email="admin@bureau.gov.au",
            password_hash=hash_password("Sprint2026!Admin"),
            role=RoleEnum.ADMIN
        )
        db.add(admin)
        db.commit()
    db.close()

def get_admin_headers():
    token = create_access_token({"sub": "admin@bureau.gov.au", "email": "admin@bureau.gov.au", "role": "ADMIN"})
    return {"Authorization": f"Bearer {token}"}

class TestMilestone2Correctness:

    def test_model_weights_validator_rejects_non_100(self):
        """1. Backend validator: weights must total exactly 100, else 422."""
        headers = get_admin_headers()

        # Case A: weights sum to 90 -> 422
        bad_payload_90 = {
            "name": "Model 90 Percent",
            "type": "INDIVIDUAL",
            "weights": {"rhi": 30, "defaults": 30, "inquiries": 30},
            "band_thresholds": {"Excellent": 800, "Good": 600, "Poor": 0},
            "active": False
        }
        res1 = client.post("/api/admin/models", json=bad_payload_90, headers=headers)
        assert res1.status_code == 422, f"Expected 422 for sum 90, got {res1.status_code}: {res1.text}"

        # Case B: weights sum to 105 -> 422
        bad_payload_105 = {
            "name": "Model 105 Percent",
            "type": "INDIVIDUAL",
            "weights": {"rhi": 40, "defaults": 40, "inquiries": 25},
            "band_thresholds": {"Excellent": 800, "Good": 600, "Poor": 0},
            "active": False
        }
        res2 = client.post("/api/admin/models", json=bad_payload_105, headers=headers)
        assert res2.status_code == 422, f"Expected 422 for sum 105, got {res2.status_code}: {res2.text}"

        # Case C: weights sum to exactly 100 -> 200
        valid_payload_100 = {
            "name": "Model Exactly 100",
            "type": "INDIVIDUAL",
            "weights": {"rhi": 35, "utilization": 25, "history_length": 15, "defaults": 20, "inquiries": 5},
            "band_thresholds": {"Excellent": 800, "Good": 600, "Poor": 0},
            "active": False
        }
        res3 = client.post("/api/admin/models", json=valid_payload_100, headers=headers)
        assert res3.status_code == 200, f"Expected 200 for sum 100, got {res3.status_code}: {res3.text}"

    def test_provider_licensing_and_rhi_rejection(self):
        """2. Providers table with licence type and permitted data types; RHI rejected unless from an eligible lender; log rejections."""
        db = SessionLocal()
        
        # Create an eligible lender provider (ADI / Bank)
        cba = db.query(Provider).filter(Provider.id == "PRV-TEST-CBA").first()
        if not cba:
            cba = Provider(
                id="PRV-TEST-CBA",
                name="Commonwealth Bank Test",
                licence_type="ADI",
                permitted_data_types=["RHI", "DEFAULT", "ENQUIRY"]
            )
            db.add(cba)

        # Create a non-eligible provider (Telecom / Utility)
        telco = db.query(Provider).filter(Provider.id == "PRV-TEST-TELCO").first()
        if not telco:
            telco = Provider(
                id="PRV-TEST-TELCO",
                name="Telco Services Test",
                licence_type="TELECOM",
                permitted_data_types=["DEFAULT", "ENQUIRY"] # No RHI permitted!
            )
            db.add(telco)

        # Create provider users
        telco_user = db.query(User).filter(User.email == "telco@test.com").first()
        if not telco_user:
            telco_user = User(
                id="usr_telco_test",
                email="telco@test.com",
                password_hash=hash_password("Pass123!"),
                role=RoleEnum.PROVIDER,
                tenant_id="PRV-TEST-TELCO"
            )
            db.add(telco_user)

        cba_user = db.query(User).filter(User.email == "cba@test.com").first()
        if not cba_user:
            cba_user = User(
                id="usr_cba_test",
                email="cba@test.com",
                password_hash=hash_password("Pass123!"),
                role=RoleEnum.PROVIDER,
                tenant_id="PRV-TEST-CBA"
            )
            db.add(cba_user)

        # Create test entity
        ent = Entity(
            id="IND-M2-LIC-001",
            type=EntityTypeEnum.INDIVIDUAL,
            identifier=encrypt_field("IND-M2-LIC-001"),
            identifier_blind_index=compute_blind_index("IND-M2-LIC-001"),
            basic_info={"first_name": "Licence", "last_name": "Test"}
        )
        db.merge(ent)
        db.commit()
        db.close()

        telco_token = create_access_token({"sub": "usr_telco_test", "email": "telco@test.com", "role": "PROVIDER"})
        telco_headers = {"Authorization": f"Bearer {telco_token}"}

        cba_token = create_access_token({"sub": "usr_cba_test", "email": "cba@test.com", "role": "PROVIDER"})
        cba_headers = {"Authorization": f"Bearer {cba_token}"}

        # Attempt to ingest RHI from telco provider -> MUST BE REJECTED
        rhi_payload = {
            "entity_id": "IND-M2-LIC-001",
            "record_type": "RHI",
            "data": {
                "account_number": "ACC-TELCO-123",
                "rhi_24_months": "000000000000000000000000"
            },
            "amount": 1200.0,
            "valid_from": str(date.today() - timedelta(days=60))
        }

        resp_telco = client.post("/api/ingest/record", json=rhi_payload, headers=telco_headers)
        assert resp_telco.status_code in [400, 422], f"Expected rejection for Telco RHI, got {resp_telco.status_code}"

        # Verify rejection was logged in audit/events
        db = SessionLocal()
        audit_rejection = db.query(AuditLog).filter(
            AuditLog.action == "INGESTION_REJECTION"
        ).order_by(AuditLog.timestamp.desc()).first()
        assert audit_rejection is not None
        assert "PRV-TEST-TELCO" in str(audit_rejection.details)

        # Attempt to ingest RHI from eligible ADI CBA provider -> MUST SUCCEED
        resp_cba = client.post("/api/ingest/record", json=rhi_payload, headers=cba_headers)
        assert resp_cba.status_code == 200, f"Expected CBA RHI to succeed, got: {resp_cba.text}"
        db.close()

    def test_resolved_sci_reverts_to_default_and_expires_after_5_years(self):
        """3. Resolved SCI reverts to a default expiring 5 years from the original default date."""
        db = SessionLocal()
        today = date.today()

        ent = Entity(
            id="IND-M2-SCI-001",
            type=EntityTypeEnum.INDIVIDUAL,
            identifier=encrypt_field("IND-M2-SCI-001"),
            identifier_blind_index=compute_blind_index("IND-M2-SCI-001"),
            basic_info={"first_name": "SCI", "last_name": "Test"}
        )
        db.merge(ent)

        # Record 1: Unresolved SCI from 6 years ago (valid_from = today - 6 years) -> active under 7y retention
        sci_unresolved = CreditLedger(
            id="LEDGER-SCI-UNRESOLVED-6Y",
            entity_id=ent.id,
            record_type=RecordTypeEnum.SCI,
            status=RecordStatusEnum.ACTIVE,
            valid_from=today - timedelta(days=6 * 365),
            provider_id="PRV-TEST-CBA",
            amount=3000.0,
            data={"reason": "Fraudulent avoidance"}
        )
        db.merge(sci_unresolved)

        # Record 2: Resolved SCI from 6 years ago (valid_from = today - 6 years, status = RESOLVED)
        # Reverts to 5-year default retention, so after 6 years it MUST EXPIRE
        sci_resolved_6y = CreditLedger(
            id="LEDGER-SCI-RESOLVED-6Y",
            entity_id=ent.id,
            record_type=RecordTypeEnum.SCI,
            status=RecordStatusEnum.RESOLVED,
            valid_from=today - timedelta(days=6 * 365),
            provider_id="PRV-TEST-CBA",
            amount=2500.0,
            data={"reason": "Resolved fraud"}
        )
        db.merge(sci_resolved_6y)

        # Record 3: Resolved SCI from 3 years ago (valid_from = today - 3 years, status = RESOLVED)
        # Within 5 years -> MUST REMAIN RESOLVED (NOT EXPIRED)
        sci_resolved_3y = CreditLedger(
            id="LEDGER-SCI-RESOLVED-3Y",
            entity_id=ent.id,
            record_type=RecordTypeEnum.SCI,
            status=RecordStatusEnum.RESOLVED,
            valid_from=today - timedelta(days=3 * 365),
            provider_id="PRV-TEST-CBA",
            amount=1500.0,
            data={"reason": "Resolved fraud 3y"}
        )
        db.merge(sci_resolved_3y)
        db.commit()

        # Execute retention expiry job
        run_data_expiry_job()

        # Check statuses
        r1 = db.query(CreditLedger).filter(CreditLedger.id == "LEDGER-SCI-UNRESOLVED-6Y").first()
        r2 = db.query(CreditLedger).filter(CreditLedger.id == "LEDGER-SCI-RESOLVED-6Y").first()
        r3 = db.query(CreditLedger).filter(CreditLedger.id == "LEDGER-SCI-RESOLVED-3Y").first()

        assert r1.status == RecordStatusEnum.ACTIVE, "Unresolved SCI under 7 years should remain ACTIVE"
        assert r2.status == RecordStatusEnum.EXPIRED, "Resolved SCI past 5 years must expire"
        assert r3.status == RecordStatusEnum.RESOLVED, "Resolved SCI within 5 years should remain RESOLVED"
        db.close()

    def test_report_returns_enquiries(self):
        """4. Report API returns enquiries; subject portal shows an enquiry history table."""
        db = SessionLocal()
        headers = get_admin_headers()

        ent = Entity(
            id="IND-M2-ENQ-001",
            type=EntityTypeEnum.INDIVIDUAL,
            identifier=encrypt_field("IND-M2-ENQ-001"),
            identifier_blind_index=compute_blind_index("IND-M2-ENQ-001"),
            basic_info={"first_name": "Enquiry", "last_name": "Subject"}
        )
        db.merge(ent)
        
        # Add specific historical enquiry
        enq = Enquiry(
            id="ENQ-TEST-HISTORICAL-001",
            entity_id=ent.id,
            user_id="usr_admin_m2",
            reason="Home Loan Application Assessment"
        )
        db.merge(enq)
        db.commit()
        db.close()

        res = client.get(f"/api/reports/{ent.id}", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert "enquiries" in data, "Report response must contain 'enquiries' key"
        assert isinstance(data["enquiries"], list)
        assert len(data["enquiries"]) >= 1
        found = any(e.get("reason") == "Home Loan Application Assessment" for e in data["enquiries"])
        assert found, "Historical enquiry not found in report enquiries array"

    def test_bitemporal_as_of_reconstruction(self):
        """5. GET /api/reports/{id}?as_of=YYYY-MM-DD reconstructs file and score from the bitemporal ledger."""
        db = SessionLocal()
        headers = get_admin_headers()

        ent = Entity(
            id="IND-M2-ASOF-001",
            type=EntityTypeEnum.INDIVIDUAL,
            identifier=encrypt_field("IND-M2-ASOF-001"),
            identifier_blind_index=compute_blind_index("IND-M2-ASOF-001"),
            basic_info={"first_name": "Bitemporal", "last_name": "Observer"}
        )
        db.merge(ent)

        # Record from 2023
        rec_2023 = CreditLedger(
            id="LEDGER-ASOF-2023",
            entity_id=ent.id,
            record_type=RecordTypeEnum.RHI,
            data={"account_type": "Mortgage", "rhi_24_months": "000000000000000000000000"},
            amount=300000.0,
            valid_from=date(2023, 1, 15),
            recorded_at=datetime(2023, 1, 15, 12, 0, 0),
            provider_id="PRV-TEST-CBA",
            status=RecordStatusEnum.ACTIVE
        )
        db.merge(rec_2023)

        # Record from 2025 (Default)
        rec_2025 = CreditLedger(
            id="LEDGER-ASOF-2025",
            entity_id=ent.id,
            record_type=RecordTypeEnum.DEFAULT,
            data={"reason": "Missed installment"},
            amount=4500.0,
            valid_from=date(2025, 6, 20),
            recorded_at=datetime(2025, 6, 20, 14, 0, 0),
            provider_id="PRV-TEST-CBA",
            status=RecordStatusEnum.ACTIVE
        )
        db.merge(rec_2025)
        db.commit()
        db.close()

        # Query as of 2024-01-01 (should see ONLY rec_2023, NOT rec_2025)
        res_2024 = client.get(f"/api/reports/{ent.id}?as_of=2024-01-01", headers=headers)
        assert res_2024.status_code == 200
        data_2024 = res_2024.json()
        ledger_ids_2024 = [r["id"] for r in data_2024["ledger"]]
        assert "LEDGER-ASOF-2023" in ledger_ids_2024
        assert "LEDGER-ASOF-2025" not in ledger_ids_2024, "2025 default must not appear in 2024 as-of file"

        # Query as of 2026-01-01 (should see both records)
        res_2026 = client.get(f"/api/reports/{ent.id}?as_of=2026-01-01", headers=headers)
        assert res_2026.status_code == 200
        data_2026 = res_2026.json()
        ledger_ids_2026 = [r["id"] for r in data_2026["ledger"]]
        assert "LEDGER-ASOF-2023" in ledger_ids_2026
        assert "LEDGER-ASOF-2025" in ledger_ids_2026
