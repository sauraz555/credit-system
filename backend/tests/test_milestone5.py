"""Dispute lifecycle and automated data retention test suite.

Validates the full consumer dispute resolution cycle from submission through adjudication,
ensuring ledger status transitions between ACTIVE, DISPUTED, and RESOLVED. Also validates
the scheduled data retention task (Section 20W) against statutory expiry limits.

Architecture:
    Integration Test Suite (Backend Tests).
    Validates dispute endpoints (`app.routers.disputes`) and Celery tasks (`app.tasks`).
    Executed during CI test runs.

Legal / Regulatory:
    Privacy Act 1988 Part IIIA: Section 20V (Dispute resolution procedures and record status
    isolation) and Section 20W (Statutory retention: RHI 2 years, Defaults 5 years).
"""

from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models import CreditLedger, Entity, Dispute, RecordStatusEnum, RecordTypeEnum, EntityTypeEnum
from app.auth import create_access_token, RoleEnum
import datetime
from app.tasks import run_data_expiry_job

client = TestClient(app)

import uuid

def test_dispute_lifecycle():
    """Tests full lifecycle of dispute lodgement and status propagation to ledger."""
    db = SessionLocal()
    token = create_access_token({"sub": "admin-milestone5", "email": "admin@bureau.gov.au", "role": RoleEnum.ADMIN})
    headers = {"Authorization": f"Bearer {token}"}
    
    # 1. Create a dummy entity
    entity = Entity(type=EntityTypeEnum.INDIVIDUAL, identifier=f"DISPUTE_TEST_{uuid.uuid4().hex[:8]}", basic_info={})
    db.add(entity)
    db.commit()
    
    # 2. Add a default record
    ledger = CreditLedger(
        entity_id=entity.id,
        record_type=RecordTypeEnum.DEFAULT,
        status=RecordStatusEnum.ACTIVE,
        valid_from=datetime.datetime.utcnow(),
        provider_id="TEST_PROV",
        amount=500.0,
        data={}
    )
    db.add(ledger)
    db.commit()
    
    # 3. Open dispute via API
    resp = client.post("/api/disputes", json={
        "ledger_record_id": ledger.id,
        "entity_id": entity.id,
        "notes": "I never missed this payment"
    }, headers=headers)
    assert resp.status_code == 200
    dispute_id = resp.json()["dispute_id"]
    
    # Check ledger is marked as DISPUTED
    db.refresh(ledger)
    assert ledger.status == RecordStatusEnum.DISPUTED
    
    # 4. Resolve dispute via API
    resp2 = client.put(f"/api/disputes/{dispute_id}", json={
        "status": "CORRECTED",
        "notes": "Provider admitted error"
    }, headers=headers)
    assert resp2.status_code == 200
    
    db.refresh(ledger)
    assert ledger.status == RecordStatusEnum.RESOLVED
    
    db.close()


def test_data_expiry_celery_job():
    """Tests synchronous execution of data expiry job, verifying RHI and DEFAULT status updates."""
    db = SessionLocal()
    
    entity = Entity(type=EntityTypeEnum.INDIVIDUAL, identifier=f"EXPIRY_TEST_{uuid.uuid4().hex[:8]}", basic_info={})
    db.add(entity)
    db.commit()
    
    # Create RHI from 3 years ago
    rhi = CreditLedger(
        entity_id=entity.id,
        record_type=RecordTypeEnum.RHI,
        status=RecordStatusEnum.ACTIVE,
        valid_from=datetime.datetime.utcnow() - datetime.timedelta(days=3 * 365),
        provider_id="TEST_PROV",
        data={"history": "0"}
    )
    # Create Default from 6 years ago
    dflt = CreditLedger(
        entity_id=entity.id,
        record_type=RecordTypeEnum.DEFAULT,
        status=RecordStatusEnum.ACTIVE,
        valid_from=datetime.datetime.utcnow() - datetime.timedelta(days=6 * 365),
        provider_id="TEST_PROV",
        data={"days": 90}
    )
    
    db.add(rhi)
    db.add(dflt)
    db.commit()
    
    # Run task synchronously
    run_data_expiry_job()
    
    db.refresh(rhi)
    db.refresh(dflt)
    
    assert rhi.status == RecordStatusEnum.EXPIRED
    assert dflt.status == RecordStatusEnum.EXPIRED
    
    db.close()
