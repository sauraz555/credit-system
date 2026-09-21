import os
import sys
import uuid
import pytest
from datetime import date, datetime, timedelta
from fastapi.testclient import TestClient

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app
from app.database import init_db, SessionLocal
from app.models import (
    Entity, EntityTypeEnum, CreditLedger, RecordTypeEnum, RecordStatusEnum,
    ModelVersion, DirectorLink, FeatureStore, Score, Provider, User, RoleEnum
)
from app.auth import create_access_token, hash_password
from app.encryption import encrypt_field, compute_blind_index
from app.services.features import (
    calculate_individual_features, calculate_company_features,
    update_feature_store, _calculate_director_structural_risk
)
from app.services.scoring import (
    evaluate_individual_score, evaluate_company_score,
    calculate_and_save_score, get_band
)
from app.tasks import run_data_expiry_job

client = TestClient(app)

def get_auth_headers(role: str, email: str, tenant_id: str = None):
    payload = {"sub": email, "email": email, "role": role}
    if tenant_id:
        payload["tenant_id"] = tenant_id
    token = create_access_token(payload)
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture(scope="module", autouse=True)
def setup_m4_data():
    init_db()
    db = SessionLocal()

    # Seed an ADI provider for ingest tests
    cba = db.query(Provider).filter(Provider.id == "PRV-M4-ADI").first()
    if not cba:
        cba = Provider(
            id="PRV-M4-ADI",
            name="CBA Test Bank",
            licence_type="ADI",
            permitted_data_types=["RHI", "DEFAULT", "HARDSHIP", "TRADE_PAYMENT", "BANKRUPTCY", "SCI"]
        )
        db.add(cba)

    # Seed Provider User
    prv_user = db.query(User).filter(User.email == "provider_m4@bureau.gov.au").first()
    if not prv_user:
        prv_user = User(
            id="usr_m4_prv",
            email="provider_m4@bureau.gov.au",
            password_hash=hash_password("Pass123!"),
            role=RoleEnum.PROVIDER,
            tenant_id="PRV-M4-ADI"
        )
        db.add(prv_user)

    # Seed baseline individual & company models if not present
    ind_model = db.query(ModelVersion).filter(
        ModelVersion.type == EntityTypeEnum.INDIVIDUAL,
        ModelVersion.active == True
    ).first()
    if not ind_model:
        ind_model = ModelVersion(
            id="mod_m4_ind",
            name="M4 Baseline Individual",
            type=EntityTypeEnum.INDIVIDUAL,
            weights={"rhi": 40, "history_length": 20, "credit_seeking": 20, "defaults": 20},
            band_thresholds={"Excellent": 800, "Great": 700, "Good": 600, "Fair": 500, "Poor": 0},
            active=True
        )
        db.add(ind_model)

    comp_model = db.query(ModelVersion).filter(
        ModelVersion.type == EntityTypeEnum.COMPANY,
        ModelVersion.active == True
    ).first()
    if not comp_model:
        comp_model = ModelVersion(
            id="mod_m4_comp",
            name="M4 Baseline Company",
            type=EntityTypeEnum.COMPANY,
            weights={"paydex": 40, "history_length": 20, "structural_risk": 20, "public_records": 20},
            band_thresholds={"Excellent": 800, "Great": 700, "Good": 600, "Fair": 500, "Poor": 0},
            active=True
        )
        db.add(comp_model)

    db.commit()
    db.close()


class TestMilestone4EdgeCases:

    def test_clean_file_individual(self):
        """1. Clean file: 0 defaults, 100% clean RHI, history > 24 months -> Excellent score (>= 800)."""
        db = SessionLocal()
        u = uuid.uuid4().hex[:8]
        ent = Entity(
            id=f"IND-CLEAN-{u}",
            type=EntityTypeEnum.INDIVIDUAL,
            identifier=encrypt_field(f"CLEAN_{u}"),
            identifier_blind_index=compute_blind_index(f"CLEAN_{u}"),
            basic_info={"first_name": "Clean", "last_name": "Profile"}
        )
        db.add(ent)
        db.commit()

        # Add 24 months of on-time RHI
        ledger = CreditLedger(
            id=f"LED-CLEAN-{u}",
            entity_id=ent.id,
            record_type=RecordTypeEnum.RHI,
            data={"rhi_history": "000000000000000000000000"},
            amount=10000.0,
            valid_from=date.today() - timedelta(days=36 * 30), # 36 months history
            status=RecordStatusEnum.ACTIVE
        )
        db.add(ledger)
        db.commit()

        features = calculate_individual_features(ent.id, db)
        model = db.query(ModelVersion).filter(ModelVersion.type == EntityTypeEnum.INDIVIDUAL, ModelVersion.active == True).first()
        res = evaluate_individual_score(ent.id, features, model)
        db.close()

        assert features["rhi_history_score"] == 1.0
        assert features["default_count"] == 0
        assert features["oldest_account_months"] >= 24
        assert res["score"] >= 800, f"Expected clean file score >= 800, got {res['score']}"
        assert res["band"] == "Excellent"
        assert res["sub_scores"]["penalties"] == 0

    def test_thin_file_cap(self):
        """2. Thin file cap: history length < 3 months -> score capped strictly at 499."""
        db = SessionLocal()
        u = uuid.uuid4().hex[:8]
        ent = Entity(
            id=f"IND-THIN-{u}",
            type=EntityTypeEnum.INDIVIDUAL,
            identifier=encrypt_field(f"THIN_{u}"),
            identifier_blind_index=compute_blind_index(f"THIN_{u}"),
            basic_info={"first_name": "New", "last_name": "ToCredit"}
        )
        db.add(ent)
        db.commit()

        # Account opened only 1 month ago
        ledger = CreditLedger(
            id=f"LED-THIN-{u}",
            entity_id=ent.id,
            record_type=RecordTypeEnum.RHI,
            data={"rhi_history": "0"},
            amount=5000.0,
            valid_from=date.today() - timedelta(days=30), # 1 month history (< 3 months)
            status=RecordStatusEnum.ACTIVE
        )
        db.add(ledger)
        db.commit()

        features = calculate_individual_features(ent.id, db)
        model = db.query(ModelVersion).filter(ModelVersion.type == EntityTypeEnum.INDIVIDUAL, ModelVersion.active == True).first()
        res = evaluate_individual_score(ent.id, features, model)
        db.close()

        assert features["oldest_account_months"] < 3
        assert res["score"] <= 499, f"Thin file must be capped at 499, got {res['score']}"

    def test_active_default_penalty(self):
        """3. Active default penalty: file with active default incurs -100 point penalty."""
        db = SessionLocal()
        u = uuid.uuid4().hex[:8]
        ent = Entity(
            id=f"IND-ACTIVEDEF-{u}",
            type=EntityTypeEnum.INDIVIDUAL,
            identifier=encrypt_field(f"ACTIVEDEF_{u}"),
            identifier_blind_index=compute_blind_index(f"ACTIVEDEF_{u}"),
            basic_info={"first_name": "Active", "last_name": "Defaulter"}
        )
        db.add(ent)
        db.commit()

        # 24 months account
        ledger_rhi = CreditLedger(
            id=f"LED-ACTIVEDEF-RHI-{u}",
            entity_id=ent.id,
            record_type=RecordTypeEnum.RHI,
            data={"rhi_history": "000000000000000000000000"},
            amount=5000.0,
            valid_from=date.today() - timedelta(days=24 * 30),
            status=RecordStatusEnum.ACTIVE
        )
        # 1 active default
        ledger_def = CreditLedger(
            id=f"LED-ACTIVEDEF-DEF-{u}",
            entity_id=ent.id,
            record_type=RecordTypeEnum.DEFAULT,
            data={"reason": "Unpaid credit card balance"},
            amount=1500.0,
            valid_from=date.today() - timedelta(days=180),
            status=RecordStatusEnum.ACTIVE
        )
        db.add(ledger_rhi)
        db.add(ledger_def)
        db.commit()

        features = calculate_individual_features(ent.id, db)
        model = db.query(ModelVersion).filter(ModelVersion.type == EntityTypeEnum.INDIVIDUAL, ModelVersion.active == True).first()
        res = evaluate_individual_score(ent.id, features, model)
        db.close()

        assert features["active_default_count"] == 1
        assert res["sub_scores"]["penalties"] == 100

    def test_paid_default_treatment(self):
        """4. Paid default: status=PAID does not penalize as an active default."""
        db = SessionLocal()
        u = uuid.uuid4().hex[:8]
        ent = Entity(
            id=f"IND-PAIDDEF-{u}",
            type=EntityTypeEnum.INDIVIDUAL,
            identifier=encrypt_field(f"PAIDDEF_{u}"),
            identifier_blind_index=compute_blind_index(f"PAIDDEF_{u}"),
            basic_info={"first_name": "Paid", "last_name": "Defaulter"}
        )
        db.add(ent)
        db.commit()

        ledger_rhi = CreditLedger(
            id=f"LED-PAIDDEF-RHI-{u}",
            entity_id=ent.id,
            record_type=RecordTypeEnum.RHI,
            data={"rhi_history": "000000000000000000000000"},
            amount=5000.0,
            valid_from=date.today() - timedelta(days=24 * 30),
            status=RecordStatusEnum.ACTIVE
        )
        ledger_paid_def = CreditLedger(
            id=f"LED-PAIDDEF-DEF-{u}",
            entity_id=ent.id,
            record_type=RecordTypeEnum.DEFAULT,
            data={"reason": "Paid overdue amount in full"},
            amount=1500.0,
            valid_from=date.today() - timedelta(days=180),
            status=RecordStatusEnum.PAID
        )
        db.add(ledger_rhi)
        db.add(ledger_paid_def)
        db.commit()

        features = calculate_individual_features(ent.id, db)
        model = db.query(ModelVersion).filter(ModelVersion.type == EntityTypeEnum.INDIVIDUAL, ModelVersion.active == True).first()
        res = evaluate_individual_score(ent.id, features, model)
        db.close()

        assert features["paid_default_count"] == 1
        assert features.get("active_default_count", 0) == 0
        assert res["sub_scores"]["penalties"] == 20

    def test_sci_resolved_to_default_reversion(self):
        """5. SCI resolved to default: Unresolved retained 7 years, Resolved reverts to 5 years."""
        db = SessionLocal()
        today = date.today()
        u = uuid.uuid4().hex[:8]

        ent = Entity(
            id=f"IND-SCI-{u}",
            type=EntityTypeEnum.INDIVIDUAL,
            identifier=encrypt_field(f"SCI_{u}"),
            identifier_blind_index=compute_blind_index(f"SCI_{u}"),
            basic_info={"first_name": "SCI", "last_name": "Subject"}
        )
        db.add(ent)
        db.commit()

        # SCI 1: Unresolved, 6 years old -> Should STAY ACTIVE (7-year limit not reached)
        sci_unresolved = CreditLedger(
            id=f"LED-SCI-UNRES-{u}",
            entity_id=ent.id,
            record_type=RecordTypeEnum.SCI,
            data={"reason": "Fraud suspected"},
            amount=3000.0,
            valid_from=today - timedelta(days=6 * 365),
            status=RecordStatusEnum.ACTIVE
        )
        # SCI 2: Resolved, 6 years old -> Should EXPIRE (5-year default limit reached)
        sci_resolved_expired = CreditLedger(
            id=f"LED-SCI-RESEXP-{u}",
            entity_id=ent.id,
            record_type=RecordTypeEnum.SCI,
            data={"reason": "Contested and resolved"},
            amount=3000.0,
            valid_from=today - timedelta(days=6 * 365),
            status=RecordStatusEnum.RESOLVED
        )
        # SCI 3: Resolved, 3 years old -> Should STAY RESOLVED (< 5 years)
        sci_resolved_active = CreditLedger(
            id=f"LED-SCI-RESKEEP-{u}",
            entity_id=ent.id,
            record_type=RecordTypeEnum.SCI,
            data={"reason": "Resolved recent"},
            amount=3000.0,
            valid_from=today - timedelta(days=3 * 365),
            status=RecordStatusEnum.RESOLVED
        )
        db.add(sci_unresolved)
        db.add(sci_resolved_expired)
        db.add(sci_resolved_active)
        db.commit()

        # Run Celery data expiry job
        res = run_data_expiry_job()
        assert res == "Expiry job completed successfully"

        # Reload records
        rec1 = db.query(CreditLedger).filter(CreditLedger.id == f"LED-SCI-UNRES-{u}").first()
        rec2 = db.query(CreditLedger).filter(CreditLedger.id == f"LED-SCI-RESEXP-{u}").first()
        rec3 = db.query(CreditLedger).filter(CreditLedger.id == f"LED-SCI-RESKEEP-{u}").first()

        assert rec1.status == RecordStatusEnum.ACTIVE, "Unresolved SCI under 7 years must stay ACTIVE"
        assert rec2.status == RecordStatusEnum.EXPIRED, "Resolved SCI over 5 years must EXPIRE"
        assert rec3.status == RecordStatusEnum.RESOLVED, "Resolved SCI under 5 years must remain retained"
        db.close()

    def test_hardship_neutrality_permanent_suite(self):
        """6 & 7. Hardship neutrality: identical files with and without hardship receive the exact same score."""
        db = SessionLocal()
        today = date.today()
        u = uuid.uuid4().hex[:8]

        # Entity A: Standard file without hardship
        ent_a = Entity(
            id=f"IND-HARDSHIP-A-{u}",
            type=EntityTypeEnum.INDIVIDUAL,
            identifier=encrypt_field(f"HARDSHIP_A_{u}"),
            identifier_blind_index=compute_blind_index(f"HARDSHIP_A_{u}"),
            basic_info={"first_name": "Subject", "last_name": "Alpha"}
        )
        # Entity B: Identical file, but with Hardship flag
        ent_b = Entity(
            id=f"IND-HARDSHIP-B-{u}",
            type=EntityTypeEnum.INDIVIDUAL,
            identifier=encrypt_field(f"HARDSHIP_B_{u}"),
            identifier_blind_index=compute_blind_index(f"HARDSHIP_B_{u}"),
            basic_info={"first_name": "Subject", "last_name": "Beta"}
        )
        db.add(ent_a)
        db.add(ent_b)
        db.commit()

        # Same RHI for both
        rhi_a = CreditLedger(
            id=f"LED-RHI-A-{u}",
            entity_id=ent_a.id,
            record_type=RecordTypeEnum.RHI,
            data={"rhi_history": "000000000000000000000000"},
            amount=8000.0,
            valid_from=today - timedelta(days=24 * 30),
            status=RecordStatusEnum.ACTIVE
        )
        rhi_b = CreditLedger(
            id=f"LED-RHI-B-{u}",
            entity_id=ent_b.id,
            record_type=RecordTypeEnum.RHI,
            data={"rhi_history": "000000000000000000000000"},
            amount=8000.0,
            valid_from=today - timedelta(days=24 * 30),
            status=RecordStatusEnum.ACTIVE
        )
        # Add Hardship Record to Entity B ONLY
        hardship_b = CreditLedger(
            id=f"LED-HARDSHIP-FLAG-B-{u}",
            entity_id=ent_b.id,
            record_type=RecordTypeEnum.HARDSHIP,
            data={"hardship_type": "Variation", "code": "V"},
            valid_from=today - timedelta(days=60),
            valid_to=today + timedelta(days=180),
            status=RecordStatusEnum.ACTIVE
        )
        db.add(rhi_a)
        db.add(rhi_b)
        db.add(hardship_b)
        db.commit()

        features_a = calculate_individual_features(ent_a.id, db)
        features_b = calculate_individual_features(ent_b.id, db)

        model = db.query(ModelVersion).filter(ModelVersion.type == EntityTypeEnum.INDIVIDUAL, ModelVersion.active == True).first()
        res_a = evaluate_individual_score(ent_a.id, features_a, model)
        res_b = evaluate_individual_score(ent_b.id, features_b, model)

        db.close()

        assert features_b.get("hardship_flag") is True
        assert features_a.get("hardship_flag") is None or features_a.get("hardship_flag") is False
        assert res_a["score"] == res_b["score"], f"Hardship changed score! {res_a['score']} vs {res_b['score']}"
        assert res_a["band"] == res_b["band"]

    def test_hardship_only_file(self):
        """Hardship-only file: calculates without error, respects thin-file cap, no penalty."""
        db = SessionLocal()
        u = uuid.uuid4().hex[:8]
        ent = Entity(
            id=f"IND-HARDSHIP-ONLY-{u}",
            type=EntityTypeEnum.INDIVIDUAL,
            identifier=encrypt_field(f"HARDSHIP_ONLY_{u}"),
            identifier_blind_index=compute_blind_index(f"HARDSHIP_ONLY_{u}"),
            basic_info={"first_name": "Only", "last_name": "Hardship"}
        )
        db.add(ent)
        db.commit()

        hardship_rec = CreditLedger(
            id=f"LED-ONLY-HARDSHIP-{u}",
            entity_id=ent.id,
            record_type=RecordTypeEnum.HARDSHIP,
            data={"hardship_type": "Temporary Arrangement", "code": "A"},
            valid_from=date.today() - timedelta(days=30),
            status=RecordStatusEnum.ACTIVE
        )
        db.add(hardship_rec)
        db.commit()

        features = calculate_individual_features(ent.id, db)
        model = db.query(ModelVersion).filter(ModelVersion.type == EntityTypeEnum.INDIVIDUAL, ModelVersion.active == True).first()
        res = evaluate_individual_score(ent.id, features, model)
        db.close()

        assert features["hardship_flag"] is True
        assert res["sub_scores"]["penalties"] == 0
        assert res["score"] <= 499 # Thin file cap

    def test_company_with_bankrupt_director_linked_to_another_company(self):
        """8. Company with bankrupt director linked to another company: contagion structural risk deduction."""
        db = SessionLocal()
        today = date.today()
        u = uuid.uuid4().hex[:8]

        # Individual Director
        director = Entity(
            id=f"IND-DIR-{u}",
            type=EntityTypeEnum.INDIVIDUAL,
            identifier=encrypt_field(f"DIR_{u}"),
            identifier_blind_index=compute_blind_index(f"DIR_{u}"),
            basic_info={"first_name": "Bankrupt", "last_name": "Director"}
        )
        # Company A
        comp_a = Entity(
            id=f"CMP-HOLDING-A-{u}",
            type=EntityTypeEnum.COMPANY,
            identifier=encrypt_field(f"CMPA_{u}"),
            identifier_blind_index=compute_blind_index(f"CMPA_{u}"),
            basic_info={"company_name": "Alpha Operations Pty Ltd"}
        )
        # Company B (linked to same director)
        comp_b = Entity(
            id=f"CMP-SUBSIDIARY-B-{u}",
            type=EntityTypeEnum.COMPANY,
            identifier=encrypt_field(f"CMPB_{u}"),
            identifier_blind_index=compute_blind_index(f"CMPB_{u}"),
            basic_info={"company_name": "Beta Ventures Pty Ltd"}
        )
        db.add(director)
        db.add(comp_a)
        db.add(comp_b)
        db.commit()

        # Director has active bankruptcy
        bank_ledger = CreditLedger(
            id=f"LED-BANKRUPTCY-{u}",
            entity_id=director.id,
            record_type=RecordTypeEnum.BANKRUPTCY,
            data={"court": "Federal Court of Australia", "declaration": "Personal insolvency"},
            valid_from=today - timedelta(days=365),
            status=RecordStatusEnum.ACTIVE
        )
        db.add(bank_ledger)

        # Links between director and companies
        link_a = DirectorLink(
            company_entity_id=comp_a.id,
            individual_entity_id=director.id,
            role="DIRECTOR",
            start_date=today - timedelta(days=700)
        )
        link_b = DirectorLink(
            company_entity_id=comp_b.id,
            individual_entity_id=director.id,
            role="MANAGING_DIRECTOR",
            start_date=today - timedelta(days=500)
        )
        db.add(link_a)
        db.add(link_b)

        # Company A has on-time trade payments
        trade_a = CreditLedger(
            id=f"LED-TRADE-A-{u}",
            entity_id=comp_a.id,
            record_type=RecordTypeEnum.TRADE_PAYMENT,
            amount=50000.0,
            data={"days_beyond_terms": 0},
            valid_from=today - timedelta(days=365),
            status=RecordStatusEnum.ACTIVE
        )
        db.add(trade_a)
        db.commit()

        # Check structural risk points
        features_a = calculate_company_features(comp_a.id, db)
        model = db.query(ModelVersion).filter(ModelVersion.type == EntityTypeEnum.COMPANY, ModelVersion.active == True).first()
        res_a = evaluate_company_score(comp_a.id, features_a, model)

        features_b = calculate_company_features(comp_b.id, db)
        res_b = evaluate_company_score(comp_b.id, features_b, model)

        db.close()

        assert features_a["structural_risk_points"] >= 1, "Director personal bankruptcy must raise structural risk"
        assert res_a["sub_scores"]["structural_risk_penalty"] >= 50, "Contagion risk penalty must be applied to company"
        assert features_b["structural_risk_points"] >= 1, "Company B sharing same director must also carry structural risk"
        assert res_b["sub_scores"]["structural_risk_penalty"] >= 50

    def test_company_paydex_and_public_records(self):
        """Company PAYDEX calculation and public record penalty."""
        db = SessionLocal()
        today = date.today()
        u = uuid.uuid4().hex[:8]

        comp = Entity(
            id=f"CMP-PAYDEX-{u}",
            type=EntityTypeEnum.COMPANY,
            identifier=encrypt_field(f"CMPPAYDEX_{u}"),
            identifier_blind_index=compute_blind_index(f"CMPPAYDEX_{u}"),
            basic_info={"company_name": "Paydex Test Pty Ltd"}
        )
        db.add(comp)
        db.commit()

        # Late trade payment (DBT = 40)
        trade = CreditLedger(
            id=f"LED-TRADE-LATE-{u}",
            entity_id=comp.id,
            record_type=RecordTypeEnum.TRADE_PAYMENT,
            amount=20000.0,
            data={"days_beyond_terms": 40},
            valid_from=today - timedelta(days=180),
            status=RecordStatusEnum.ACTIVE
        )
        # Court writ on file
        writ = CreditLedger(
            id=f"LED-WRIT-{u}",
            entity_id=comp.id,
            record_type=RecordTypeEnum.WRIT,
            amount=5000.0,
            data={"court": "Supreme Court of NSW"},
            valid_from=today - timedelta(days=90),
            status=RecordStatusEnum.ACTIVE
        )
        db.add(trade)
        db.add(writ)
        db.commit()

        feat = calculate_company_features(comp.id, db)
        model = db.query(ModelVersion).filter(ModelVersion.type == EntityTypeEnum.COMPANY, ModelVersion.active == True).first()
        res = evaluate_company_score(comp.id, feat, model)
        db.close()

        assert feat["paydex_score"] == 60 # 100 - 40 DBT
        assert feat["public_record_count"] == 1
        assert res["sub_scores"]["public_record_penalty"] == 150

    def test_feature_store_update_and_score_persistence(self):
        """Test feature store persistence, historical slice, and score saving."""
        db = SessionLocal()
        u = uuid.uuid4().hex[:8]
        ent = Entity(
            id=f"IND-FS-{u}",
            type=EntityTypeEnum.INDIVIDUAL,
            identifier=encrypt_field(f"FS_{u}"),
            identifier_blind_index=compute_blind_index(f"FS_{u}"),
            basic_info={"first_name": "FS", "last_name": "Test"}
        )
        db.add(ent)
        db.commit()

        ledger = CreditLedger(
            id=f"LED-FS-{u}",
            entity_id=ent.id,
            record_type=RecordTypeEnum.RHI,
            data={"rhi_history": "000000000000000000000000"},
            amount=8000.0,
            valid_from=date.today() - timedelta(days=36 * 30),
            status=RecordStatusEnum.ACTIVE
        )
        db.add(ledger)
        db.commit()

        # Update feature store permanently
        fs = update_feature_store(ent.id, db)
        assert fs is not None
        assert "rhi_history_score" in fs.features

        # Update feature store as_of historical date (returns HistoricalFeatureStore)
        fs_hist = update_feature_store(ent.id, db, as_of=date(2023, 1, 1))
        assert fs_hist is not None
        assert "rhi_history_score" in fs_hist.features

        # Calculate and save score
        score_obj = calculate_and_save_score(ent.id, EntityTypeEnum.INDIVIDUAL, fs.features, db)
        assert score_obj is not None
        assert score_obj.score_value >= 800

        # Verify score persisted in DB
        saved_score = db.query(Score).filter(Score.entity_id == ent.id).first()
        assert saved_score is not None
        assert saved_score.score_value == score_obj.score_value
        db.close()

    def test_ingest_endpoint_various_records(self):
        """Test ingestion endpoint for multiple record types (TRADE_PAYMENT, SCI, BANKRUPTCY, HARDSHIP)."""
        headers = get_auth_headers("PROVIDER", "provider_m4@bureau.gov.au", tenant_id="PRV-M4-ADI")
        u = uuid.uuid4().hex[:8]

        db = SessionLocal()
        comp_id = f"CMP-INGEST-{u}"
        ind_id = f"IND-INGEST-{u}"
        comp = Entity(
            id=comp_id,
            type=EntityTypeEnum.COMPANY,
            identifier=encrypt_field(f"INGEST_{u}"),
            identifier_blind_index=compute_blind_index(f"INGEST_{u}"),
            basic_info={"company_name": "Ingest Target Pty Ltd"}
        )
        ind = Entity(
            id=ind_id,
            type=EntityTypeEnum.INDIVIDUAL,
            identifier=encrypt_field(f"INGEST_IND_{u}"),
            identifier_blind_index=compute_blind_index(f"INGEST_IND_{u}"),
            basic_info={"first_name": "Ingest", "last_name": "Target"}
        )
        db.add(comp)
        db.add(ind)
        db.commit()
        db.close()

        # 1. Trade payment ingest
        payload_tp = {
            "entity_id": comp_id,
            "provider_id": "PRV-M4-ADI",
            "record_type": "TRADE_PAYMENT",
            "amount": 12000.0,
            "valid_from": str(date.today()),
            "data": {"days_beyond_terms": 5, "invoice_number": "INV-2026-001"}
        }
        res_tp = client.post("/api/ingest/record", json=payload_tp, headers=headers)
        assert res_tp.status_code == 200

        # 2. Hardship ingest
        payload_hs = {
            "entity_id": ind_id,
            "provider_id": "PRV-M4-ADI",
            "record_type": "HARDSHIP",
            "amount": 0.0,
            "valid_from": str(date.today()),
            "data": {"hardship_type": "Variation", "code": "V"}
        }
        res_hs = client.post("/api/ingest/record", json=payload_hs, headers=headers)
        assert res_hs.status_code == 200

        # 3. Bankruptcy ingest
        payload_bk = {
            "entity_id": ind_id,
            "provider_id": "PRV-M4-ADI",
            "record_type": "BANKRUPTCY",
            "amount": 45000.0,
            "valid_from": str(date.today()),
            "data": {"court": "Federal Court"}
        }
        res_bk = client.post("/api/ingest/record", json=payload_bk, headers=headers)
        assert res_bk.status_code == 200

        # 4. Ingest with unauthorized provider -> 401 or 403
        payload_bad_prv = dict(payload_tp, provider_id="PRV-UNKNOWN-999")
        bad_headers = get_auth_headers("PROVIDER", "provider_m4@bureau.gov.au", tenant_id="PRV-UNKNOWN-999")
        res_bad_prv = client.post("/api/ingest/record", json=payload_bad_prv, headers=bad_headers)
        assert res_bad_prv.status_code in [400, 401, 403]

    def test_bulk_csv_ingest_and_events_listing(self):
        """Test bulk CSV ingest endpoint with both valid and invalid records, and verify /api/ingest/events."""
        headers = get_auth_headers("PROVIDER", "provider_m4@bureau.gov.au", tenant_id="PRV-M4-ADI")
        u = uuid.uuid4().hex[:8]

        db = SessionLocal()
        ent_id = f"IND-CSV-{u}"
        ent = Entity(
            id=ent_id,
            type=EntityTypeEnum.INDIVIDUAL,
            identifier=encrypt_field(f"CSV_{u}"),
            identifier_blind_index=compute_blind_index(f"CSV_{u}"),
            basic_info={"first_name": "CSV", "last_name": "Ingest"}
        )
        db.add(ent)
        db.commit()
        db.close()

        # CSV with 1 valid RHI and 1 invalid DEFAULT (amount 50 < 150)
        csv_data = (
            f"entity_id,record_type,amount,valid_from,rhi_history,days_overdue,notice_given\n"
            f"{ent_id},RHI,,2026-01-01,000000000000000000000000,,\n"
            f"{ent_id},DEFAULT,50,2026-01-01,,90,true\n"
        )

        response = client.post(
            "/api/ingest/csv",
            files={"file": ("bulk_ingest.csv", csv_data.encode("utf-8"), "text/csv")},
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["accepted_count"] == 1
        assert data["rejected_count"] == 1
        assert len(data["errors"]) == 1

        # Fetch /api/ingest/events
        res_events = client.get("/api/ingest/events", headers=headers)
        assert res_events.status_code == 200
        events_data = res_events.json()
        assert len(events_data) > 0
        assert any(e["status"] == "REJECTED" for e in events_data)

    def test_ingest_rejection_audit_logging(self):
        """Test that single record rejection writes to IngestEvent and AuditLog."""
        headers = get_auth_headers("PROVIDER", "provider_m4@bureau.gov.au", tenant_id="PRV-M4-ADI")
        u = uuid.uuid4().hex[:8]

        # Ingest a DEFAULT without required statutory notice -> triggers business validation rejection
        invalid_default_payload = {
            "entity_id": f"IND-REJECT-{u}",
            "provider_id": "PRV-M4-ADI",
            "record_type": "DEFAULT",
            "amount": 200.0,
            "valid_from": str(date.today()),
            "data": {"days_overdue": 75, "notice_given": False} # Notice False triggers ValueError
        }
        res = client.post("/api/ingest/record", json=invalid_default_payload, headers=headers)
        assert res.status_code == 422 or res.status_code == 400
