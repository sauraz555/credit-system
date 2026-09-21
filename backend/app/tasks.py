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

        # Rule 3: SCI > 7 years (unless resolved, which falls back to 5 yr default handled separately)
        sci_cutoff = today - timedelta(days=7 * 365)
        db.query(CreditLedger).filter(
            CreditLedger.record_type == RecordTypeEnum.SCI,
            CreditLedger.valid_from < sci_cutoff,
            CreditLedger.status == RecordStatusEnum.ACTIVE
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

# Periodic task schedule
celery_app.conf.beat_schedule = {
    'daily-expiry-job': {
        'task': 'app.tasks.run_data_expiry_job',
        'schedule': 86400.0, # Run every 24 hours
    },
}
