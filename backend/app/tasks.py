"""Asynchronous Background Workers and Regulatory Data Retention Sweeps.

This module coordinates scheduled background tasks using Celery and Celery Beat.
It executes automated statutory data retention sweeps to expire credit records (RHI,
defaults, SCIs, hardship notices) according to strict Australian legal deadlines, and monitors
statutory consumer disputes to alert analysts before the 30-day statutory resolution limit expires.

Architecture Tier:
    Asynchronous Tasks & Background Processing Layer (Celery Worker / Beat).

Key Dependencies & Callers:
    - Depends on Celery distributed task queue backed by Redis.
    - Operates directly against `CreditLedger`, `Dispute`, and `AuditLog` via SQLAlchemy sessions.
    - Triggered periodically via Celery Beat or ad-hoc by management scripts.

Regulatory & Compliance Context:
    - Privacy Act 1988 (Cth) Part IIIA Section 20W (Retention of Credit Information):
      Mandates strict maximum retention periods; retaining records past these limits is an offence.
      - Repayment History Information (RHI): 24 months max.
      - Default information: 5 years max.
      - Serious Credit Infringement (unresolved): 7 years max.
      - Serious Credit Infringement (resolved): Reverts to 5-year default expiration (Section 20U).
      - Financial Hardship Information: 12 months max after agreement termination.
    - Privacy Act 1988 Section 20V:
      Mandatory 30-day statutory investigation and resolution timeframe for credit disputes.
"""

import os
from datetime import date, timedelta
from celery import Celery
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models import CreditLedger, RecordTypeEnum, RecordStatusEnum

# Setup Celery distributed task queue
# Fallback to local redis if REDIS_URL not set in environment
celery_app = Celery(
    "credit_tasks",
    broker=os.getenv("REDIS_URL", "redis://localhost:6379/0")
)


@celery_app.task
def run_data_expiry_job():
    """Scheduled task enforcing statutory retention limits by marking records EXPIRED.

    Queries the credit ledger across all statutory record types and updates the status
    of any entry exceeding its Privacy Act Section 20W retention window.

    Returns:
        Confirmation message upon successful transaction commit.

    Raises:
        Exception: Rolls back transaction and re-raises on database errors.
    """
    db: Session = SessionLocal()
    today = date.today()
    
    try:
        # REVIEW-LEGAL: Rule 1: RHI > 24 months (Privacy Act 1988 s20W(2))
        # Repayment history must be purged exactly 2 years after the payment cycle date
        rhi_cutoff = today - timedelta(days=24 * 30)
        db.query(CreditLedger).filter(
            CreditLedger.record_type == RecordTypeEnum.RHI,
            CreditLedger.valid_from < rhi_cutoff,
            CreditLedger.status == RecordStatusEnum.ACTIVE
        ).update({"status": RecordStatusEnum.EXPIRED})

        # REVIEW-LEGAL: Rule 2: Defaults > 5 years (Privacy Act 1988 s20W(1) Item 3)
        # Defaults must expire 5 years from the date the default was listed, regardless of whether PAID
        default_cutoff = today - timedelta(days=5 * 365)
        db.query(CreditLedger).filter(
            CreditLedger.record_type == RecordTypeEnum.DEFAULT,
            CreditLedger.valid_from < default_cutoff,
            CreditLedger.status.in_([RecordStatusEnum.ACTIVE, RecordStatusEnum.PAID])
        ).update({"status": RecordStatusEnum.EXPIRED})

        # REVIEW-LEGAL: Rule 3a: SCI (Unresolved) > 7 years (Privacy Act 1988 s20W(1) Item 4)
        # Fraud or intentional evasion (SCI) may be retained for 7 years while active/unresolved
        sci_cutoff = today - timedelta(days=7 * 365)
        db.query(CreditLedger).filter(
            CreditLedger.record_type == RecordTypeEnum.SCI,
            CreditLedger.valid_from < sci_cutoff,
            CreditLedger.status == RecordStatusEnum.ACTIVE
        ).update({"status": RecordStatusEnum.EXPIRED})

        # REVIEW-LEGAL: Rule 3b: Resolved SCI reverts to default (Privacy Act 1988 s20U)
        # Once an SCI is marked RESOLVED, statutory retention reverts to standard default rules (5 years from original default)
        sci_resolved_cutoff = today - timedelta(days=5 * 365)
        db.query(CreditLedger).filter(
            CreditLedger.record_type == RecordTypeEnum.SCI,
            CreditLedger.status == RecordStatusEnum.RESOLVED,
            CreditLedger.valid_from < sci_resolved_cutoff
        ).update({"status": RecordStatusEnum.EXPIRED})

        # REVIEW-LEGAL: Rule 4: Hardship Flags > 1 year (Privacy Act 1988 s20W(1) Item 5)
        # Financial hardship information must be destroyed 12 months after the arrangement ends
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
    """Monitors open consumer disputes against the statutory 30-day resolution deadline.

    Under Australian Privacy Act 1988 Section 20V, a credit reporting body must resolve
    disputes within 30 days of receipt. This task identifies disputes nearing the deadline
    (<= 5 days remaining) or in statutory breach (<= 0 days) and emits audit log alerts.

    Returns:
        Dictionary containing the count and details of generated alerts.

    Raises:
        Exception: Rolls back transaction and re-raises on database errors.
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
            # REVIEW-LEGAL: Privacy Act 1988 s20V statutory 30-day investigation limit
            days_remaining = 30 - days_elapsed

            # REVIEW-ASSUMPTION: 5-day warning threshold gives risk analysts sufficient lead time to resolve files
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


# Periodic task schedule for Celery Beat daemon
celery_app.conf.beat_schedule = {
    'daily-expiry-job': {
        'task': 'app.tasks.run_data_expiry_job',
        'schedule': 86400.0, # Run once every 24 hours
    },
    'hourly-dispute-sla-check': {
        'task': 'app.tasks.check_dispute_sla_alerts',
        'schedule': 3600.0, # Run once every hour to detect approaching statutory deadlines
    },
}
