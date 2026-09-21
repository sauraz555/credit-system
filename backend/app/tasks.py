import os
from datetime import date, timedelta
from celery import Celery
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models import CreditLedger, RecordTypeEnum, RecordStatusEnum

# Setup Celery
# Fallback to local redis if REDIS_URL not set
celery_app = Celery(
    "credit_tasks",
    broker=os.getenv("REDIS_URL", "redis://localhost:6379/0")
)

@celery_app.task
def run_data_expiry_job():
    """Scheduled job to expire data based on retention rules."""
    db: Session = SessionLocal()
    today = date.today()
    
    try:
        # Rule 1: RHI > 24 months
        rhi_cutoff = today - timedelta(days=24 * 30)
        db.query(CreditLedger).filter(
            CreditLedger.record_type == RecordTypeEnum.RHI,
            CreditLedger.valid_from < rhi_cutoff,
            CreditLedger.status == RecordStatusEnum.ACTIVE
        ).update({"status": RecordStatusEnum.EXPIRED})

        # Rule 2: Defaults > 5 years
        default_cutoff = today - timedelta(days=5 * 365)
        db.query(CreditLedger).filter(
            CreditLedger.record_type == RecordTypeEnum.DEFAULT,
            CreditLedger.valid_from < default_cutoff,
            CreditLedger.status.in_([RecordStatusEnum.ACTIVE, RecordStatusEnum.PAID])
        ).update({"status": RecordStatusEnum.EXPIRED})

        # Rule 3a: SCI (Unresolved) > 7 years
        sci_cutoff = today - timedelta(days=7 * 365)
        db.query(CreditLedger).filter(
            CreditLedger.record_type == RecordTypeEnum.SCI,
            CreditLedger.valid_from < sci_cutoff,
            CreditLedger.status == RecordStatusEnum.ACTIVE
        ).update({"status": RecordStatusEnum.EXPIRED})

        # Rule 3b: Resolved SCI reverts to default expiring 5 years from the original default date
        sci_resolved_cutoff = today - timedelta(days=5 * 365)
        db.query(CreditLedger).filter(
            CreditLedger.record_type == RecordTypeEnum.SCI,
            CreditLedger.status == RecordStatusEnum.RESOLVED,
            CreditLedger.valid_from < sci_resolved_cutoff
        ).update({"status": RecordStatusEnum.EXPIRED})

        # Rule 4: Hardship Flags > 1 year after valid_to (or valid_from if valid_to is None)
        hardships = db.query(CreditLedger).filter(
            CreditLedger.record_type == RecordTypeEnum.HARDSHIP,
            CreditLedger.status == RecordStatusEnum.ACTIVE
        ).all()
        
        for h in hardships:
            expiry_date = (h.valid_to or h.valid_from) + timedelta(days=365)
            if today > expiry_date:
                h.status = RecordStatusEnum.EXPIRED

        db.commit()
        return "Expiry job completed successfully"
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()

@celery_app.task
def check_dispute_sla_alerts():
    """
    Statutory Section 20V Dispute Resolution SLA Alert Job:
    Australian Privacy Act 1988 Part IIIA mandates a 30-day statutory resolution period.
    Monitors all open/in-progress disputes approaching the 30-day limit (<= 5 days remaining).
    Emits alerts and records audit events.
    """
    import logging
    from datetime import datetime
    from app.models import Dispute, AuditLog

    logger = logging.getLogger("crms.tasks.dispute_sla")
    db: Session = SessionLocal()
    now = datetime.utcnow()
    alerts = []

    try:
        # Check active non-resolved disputes
        disputes = db.query(Dispute).filter(
            Dispute.status.in_(["OPEN", "UNDER_REVIEW", "IN_INVESTIGATION", "PENDING"])
        ).all()

        for d in disputes:
            lodged_at = d.created_at or now
            days_elapsed = (now - lodged_at).days
            days_remaining = 30 - days_elapsed

            if days_remaining <= 5:
                severity = "BREACH_CRITICAL" if days_remaining <= 0 else "WARNING_URGENT"
                alert_msg = (
                    f"CRMS SLA ALERT [{severity}]: Dispute {d.id} for entity {d.entity_id} "
                    f"has {days_remaining} day(s) remaining of 30-day statutory SLA window! "
                    f"Current status: {d.status}."
                )
                logger.warning(alert_msg)
                alerts.append({
                    "dispute_id": d.id,
                    "entity_id": d.entity_id,
                    "days_remaining": days_remaining,
                    "severity": severity,
                    "message": alert_msg
                })

                # Record SLA alert into audit log
                audit = AuditLog(
                    action="DISPUTE_SLA_ALERT",
                    target_table="disputes",
                    target_id=d.id,
                    details={
                        "days_remaining": days_remaining,
                        "days_elapsed": days_elapsed,
                        "statutory_limit_days": 30,
                        "severity": severity,
                        "alert": alert_msg
                    }
                )
                db.add(audit)

        db.commit()
        return {"alerts_generated": len(alerts), "alerts": alerts}
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()

# Periodic task schedule
celery_app.conf.beat_schedule = {
    'daily-expiry-job': {
        'task': 'app.tasks.run_data_expiry_job',
        'schedule': 86400.0, # Run every 24 hours
    },
    'hourly-dispute-sla-check': {
        'task': 'app.tasks.check_dispute_sla_alerts',
        'schedule': 3600.0, # Run every hour
    },
}

