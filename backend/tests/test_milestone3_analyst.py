"""Analyst back-testing and statistical discrimination test suite.

Validates statistical evaluation pipelines for credit scoring models, including
Area Under Curve (AUC-ROC), Gini coefficient, Kolmogorov-Smirnov (KS) statistic,
and decile calibration metrics computed across synthetic portfolio outcomes.

Architecture:
    Analyst & Statistical Validation Test Suite (Backend Integration Tests).
    Validates `/api/admin/models/backtest` endpoint and scoring engine statistical rigor.
    Invoked during model governance and validation test passes.

Legal / Regulatory:
    APRA Prudential Practice Guide CPG 223 / APRA CPS 220 risk management standards,
    requiring empirical discrimination and calibration proofs for internal credit models.
"""

import os
import sys
import csv
import io
import random
import pytest
from datetime import date, datetime, timedelta
from fastapi.testclient import TestClient

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app
from app.database import init_db, SessionLocal
from app.models import Entity, EntityTypeEnum, CreditLedger, RecordTypeEnum, RecordStatusEnum, ModelVersion, User, RoleEnum
from app.auth import create_access_token, hash_password
from app.encryption import encrypt_field, compute_blind_index

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_m3_data():
    """Provisions analyst accounts, baseline credit scoring model, and sample entities."""
    init_db()
    db = SessionLocal()

    # Create Analyst user
    analyst = db.query(User).filter(User.email == "analyst@bureau.gov.au").first()
    if not analyst:
        analyst = User(
            id="usr_analyst_m3",
            email="analyst@bureau.gov.au",
            password_hash=hash_password("Sprint2026!Analyst"),
            role=RoleEnum.ANALYST
        )
        db.add(analyst)

    # Create Admin user
    admin = db.query(User).filter(User.email == "admin@bureau.gov.au").first()
    if not admin:
        admin = User(
            id="usr_admin_m3",
            email="admin@bureau.gov.au",
            password_hash=hash_password("Sprint2026!Admin"),
            role=RoleEnum.ADMIN
        )
        db.add(admin)

    # Create Baseline Model
    model = db.query(ModelVersion).filter(ModelVersion.name == "M3 Baseline Test Model").first()
    if not model:
        model = ModelVersion(
            id="model_m3_test",
            name="M3 Baseline Test Model",
            type=EntityTypeEnum.INDIVIDUAL,
            weights={"rhi": 35, "utilization": 25, "history_length": 15, "defaults": 20, "inquiries": 5},
            band_thresholds={"Excellent": 800, "Great": 700, "Good": 600, "Fair": 500, "Poor": 0},
            active=True
        )
        db.add(model)

    # Create 50 entities for testing backtest discrimination
    for i in range(50):
        ent_id = f"IND-M3-TEST-{i:03d}"
        ent = db.query(Entity).filter(Entity.id == ent_id).first()
        if not ent:
            ent = Entity(
                id=ent_id,
                type=EntityTypeEnum.INDIVIDUAL,
                identifier=encrypt_field(ent_id),
                identifier_blind_index=compute_blind_index(ent_id),
                basic_info={"first_name": f"Test{i}", "last_name": "Subject"}
            )
            db.add(ent)
            db.commit()

            # Assign half good credit, half bad credit
            if i < 25:
                # Good credit: Clean RHI
                ledger = CreditLedger(
                    id=f"LED-GOOD-{i}",
                    entity_id=ent.id,
                    record_type=RecordTypeEnum.RHI,
                    data={"rhi_history": "000000000000000000000000"},
                    amount=5000.0,
                    valid_from=date(2023, 1, 1),
                    recorded_at=datetime(2023, 1, 1, 12, 0),
                    provider_id="PRV-CBA-001",
                    status=RecordStatusEnum.ACTIVE
                )
                db.add(ledger)
            else:
                # Bad credit: Defaults and poor RHI
                ledger1 = CreditLedger(
                    id=f"LED-BAD-DEF-{i}",
                    entity_id=ent.id,
                    record_type=RecordTypeEnum.DEFAULT,
                    data={"reason": "Non payment"},
                    amount=2000.0,
                    valid_from=date(2024, 1, 1),
                    recorded_at=datetime(2024, 1, 1, 12, 0),
                    provider_id="PRV-CBA-001",
                    status=RecordStatusEnum.ACTIVE
                )
                ledger2 = CreditLedger(
                    id=f"LED-BAD-RHI-{i}",
                    entity_id=ent.id,
                    record_type=RecordTypeEnum.RHI,
                    data={"rhi_history": "3456XXXX6666"},
                    amount=1500.0,
                    valid_from=date(2023, 1, 1),
                    recorded_at=datetime(2023, 1, 1, 12, 0),
                    provider_id="PRV-CBA-001",
                    status=RecordStatusEnum.ACTIVE
                )
                db.add(ledger1)
                db.add(ledger2)
    db.commit()
    db.close()

def get_auth_headers(role: str, email: str):
    token = create_access_token({"sub": email, "email": email, "role": role})
    return {"Authorization": f"Bearer {token}"}

class TestMilestone3Analyst:

    def test_analyst_cannot_activate_models_or_manage_users(self):
        """1. Analysts cannot activate models or create models (403)."""
        analyst_headers = get_auth_headers("ANALYST", "analyst@bureau.gov.au")
        admin_headers = get_auth_headers("ADMIN", "admin@bureau.gov.au")

        # Attempt to create model as Analyst -> MUST BE 403
        model_payload = {
            "name": "Analyst Model Attempt",
            "type": "INDIVIDUAL",
            "weights": {"rhi": 40, "defaults": 30, "history_length": 30},
            "band_thresholds": {"Good": 600, "Poor": 0},
            "active": True
        }
        res_analyst = client.post("/api/admin/models", json=model_payload, headers=analyst_headers)
        assert res_analyst.status_code == 403, f"Analyst should not be able to create models: {res_analyst.status_code}"

        # Attempt as Admin -> MUST BE 200
        res_admin = client.post("/api/admin/models", json=model_payload, headers=admin_headers)
        assert res_admin.status_code == 200

    def test_real_backtest_with_predictive_outcomes_gives_high_auc(self):
        """2. Outcomes generated from score -> AUC well above 0.5 (> 0.70)."""
        analyst_headers = get_auth_headers("ANALYST", "analyst@bureau.gov.au")

        # Create predictive CSV: entities with bad credit (index >= 25) defaulted (1), clean credit (index < 25) did not (0)
        csv_buffer = io.StringIO()
        writer = csv.writer(csv_buffer)
        writer.writerow(["entity_id", "outcome_date", "defaulted"])

        for i in range(50):
            ent_id = f"IND-M3-TEST-{i:03d}"
            defaulted = 1 if i >= 25 else 0
            writer.writerow([ent_id, "2025-06-01", defaulted])

        csv_content = csv_buffer.getvalue().encode("utf-8")

        response = client.post(
            "/api/admin/backtest?model_id=model_m3_test&observation_date=2024-06-01",
            files={"file": ("outcomes.csv", csv_content, "text/csv")},
            headers=analyst_headers
        )

        assert response.status_code == 200, f"Backtest failed: {response.text}"
        data = response.json()
        assert "auc" in data
        assert "gini" in data
        assert "ks_statistic" in data
        assert "deciles" in data
        assert "band_performance" in data

        auc = data["auc"]
        # Predictive outcomes should produce AUC > 0.70 (well above 0.5)
        assert auc >= 0.70, f"Expected AUC well above 0.5, got {auc}"
        assert data["gini"] == pytest.approx(2 * auc - 1, abs=0.01)

    def test_real_backtest_with_shuffled_outcomes_gives_auc_near_half(self):
        """3. Shuffled / random outcomes -> AUC near 0.5 (between 0.35 and 0.65)."""
        analyst_headers = get_auth_headers("ANALYST", "analyst@bureau.gov.au")

        csv_buffer = io.StringIO()
        writer = csv.writer(csv_buffer)
        writer.writerow(["entity_id", "outcome_date", "defaulted"])

        # Random / uncorrelated default assignments
        random.seed(42)
        for i in range(50):
            ent_id = f"IND-M3-TEST-{i:03d}"
            defaulted = 1 if random.random() < 0.5 else 0
            writer.writerow([ent_id, "2025-06-01", defaulted])

        csv_content = csv_buffer.getvalue().encode("utf-8")

        response = client.post(
            "/api/admin/backtest?model_id=model_m3_test&observation_date=2024-06-01",
            files={"file": ("shuffled.csv", csv_content, "text/csv")},
            headers=analyst_headers
        )

        assert response.status_code == 200
        data = response.json()
        auc = data["auc"]
        # Near 0.5
        assert 0.35 <= auc <= 0.65, f"Expected AUC near 0.5 for shuffled outcomes, got {auc}"
