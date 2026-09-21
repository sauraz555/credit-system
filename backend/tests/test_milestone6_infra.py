import os
import sys
import pytest
from datetime import datetime, timedelta

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.main import app
from app.database import get_db, SessionLocal, engine
from app.models import Dispute, CreditLedger, Entity, EntityTypeEnum, RecordTypeEnum, RecordStatusEnum, AuditLog
from app.tasks import check_dispute_sla_alerts

client = TestClient(app)

class TestMilestone6Infrastructure:

    def test_health_check_endpoint_checks_db_and_redis(self):
        """Milestone 6.4: /health endpoint verifies DB and Redis connectivity."""
        response = client.get("/health")
        assert response.status_code in [200, 503]
        data = response.json()
        assert "status" in data
        assert "database" in data
        assert "redis" in data
        # Database in test suite must be connected
        assert data["database"] == "connected"

    def test_metrics_prometheus_endpoint(self):
        """Milestone 6.4: /metrics endpoint exposes Prometheus telemetry."""
        response = client.get("/metrics")
        assert response.status_code == 200
        # Check standard Prometheus format headers/content
        content = response.text
        assert "crms" in content or "python_info" in content or "process_cpu_seconds" in content

    def test_dispute_sla_alert_celery_task(self):
        """Milestone 6.6: Celery job alerts on disputes approaching 30-day limit."""
        db: Session = SessionLocal()
        try:
            # 1. Create a test entity and ledger record
            import uuid
            unique_id = f"TEST-SLA-{uuid.uuid4().hex[:8]}"
            entity = Entity(
                type=EntityTypeEnum.INDIVIDUAL,
                identifier=unique_id,
                basic_info={"first_name": "SLA", "last_name": "Test"}
            )
            db.add(entity)
            db.commit()
            db.refresh(entity)

            ledger = CreditLedger(
                entity_id=entity.id,
                record_type=RecordTypeEnum.DEFAULT,
                data={"reason": "Unpaid loan"},
                amount=500.0,
                valid_from=datetime.utcnow().date() - timedelta(days=40),
                status=RecordStatusEnum.ACTIVE
            )
            db.add(ledger)
            db.commit()
            db.refresh(ledger)

            # 2. Create a dispute lodged 26 days ago (4 days remaining of 30-day statutory SLA)
            lodged_26d_ago = datetime.utcnow() - timedelta(days=26)
            urgent_dispute = Dispute(
                ledger_record_id=ledger.id,
                entity_id=entity.id,
                status="OPEN",
                notes="Urgent dispute nearing 30 days",
                created_at=lodged_26d_ago
            )
            db.add(urgent_dispute)

            # 3. Create a fresh dispute lodged 2 days ago (28 days remaining, no alert needed)
            fresh_dispute = Dispute(
                ledger_record_id=ledger.id,
                entity_id=entity.id,
                status="OPEN",
                notes="Normal dispute lodged recently",
                created_at=datetime.utcnow() - timedelta(days=2)
            )
            db.add(fresh_dispute)
            db.commit()

            # Execute the SLA alert job
            result = check_dispute_sla_alerts()
            assert result is not None
            assert result["alerts_generated"] >= 1
            
            # Verify the urgent dispute was flagged
            flagged_ids = [a["dispute_id"] for a in result["alerts"]]
            assert urgent_dispute.id in flagged_ids
            assert fresh_dispute.id not in flagged_ids

            # Verify audit log was recorded
            audit = db.query(AuditLog).filter(
                AuditLog.action == "DISPUTE_SLA_ALERT",
                AuditLog.target_id == urgent_dispute.id
            ).first()
            assert audit is not None
            assert audit.details["days_remaining"] <= 5
        finally:
            db.close()
