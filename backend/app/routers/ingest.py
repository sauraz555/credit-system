import csv
import io
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import ValidationError
from typing import List

from app.database import get_db
from app.models import IngestEvent, CreditLedger, RecordStatusEnum
from app.schemas import IngestRecordRequest, BulkIngestResponse

router = APIRouter(prefix="/api/ingest", tags=["ingest"])

def process_record(record_in: IngestRecordRequest, provider_id: str, db: Session) -> None:
    # 1. Create append-only event log
    event = IngestEvent(
        provider_id=provider_id,
        raw_payload=record_in.dict(),
        status="ACCEPTED"
    )
    db.add(event)
    
    # 2. Write to bitemporal ledger
    ledger_entry = CreditLedger(
        entity_id=record_in.entity_id,
        record_type=record_in.record_type,
        data=record_in.data,
        amount=record_in.amount,
        valid_from=record_in.valid_from,
        valid_to=record_in.valid_to,
        provider_id=provider_id,
        status=RecordStatusEnum.ACTIVE
    )
    db.add(ledger_entry)

@router.post("/record")
def ingest_record(record: IngestRecordRequest, db: Session = Depends(get_db)):
    """Ingest a single record via JSON."""
    # Assuming provider_id is extracted from a JWT token in a real scenario
    provider_id = "MOCK_PROVIDER_123" 
    
    try:
        process_record(record, provider_id, db)
        db.commit()
        return {"status": "success", "message": "Record ingested successfully"}
    except Exception as e:
        db.rollback()
        # Log rejection
        event = IngestEvent(
            provider_id=provider_id,
            raw_payload=record.dict(),
            status="REJECTED",
            error_log=str(e)
        )
        db.add(event)
        db.commit()
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/csv", response_model=BulkIngestResponse)
def ingest_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Ingest bulk records via CSV."""
    provider_id = "MOCK_PROVIDER_123"
    
    content = file.file.read().decode("utf-8")
    reader = csv.DictReader(io.StringIO(content))
    
    accepted = 0
    rejected = 0
    errors = []
    
    for row_idx, row in enumerate(reader):
        try:
            # Simple conversion mapping for CSV rows to our schema structure
            # A real implementation would have more robust mapping based on the CSV spec
            data_payload = {}
            if row.get("rhi_history"):
                data_payload["rhi_history"] = row.get("rhi_history")
            if row.get("days_overdue"):
                data_payload["days_overdue"] = int(row.get("days_overdue"))
            if row.get("notice_given"):
                data_payload["notice_given"] = row.get("notice_given").lower() == 'true'

            req = IngestRecordRequest(
                entity_id=row["entity_id"],
                record_type=row["record_type"],
                data=data_payload,
                amount=float(row["amount"]) if row.get("amount") else None,
                valid_from=row["valid_from"]
            )
            process_record(req, provider_id, db)
            accepted += 1
            
        except ValidationError as ve:
            rejected += 1
            errors.append({"row": row_idx + 1, "error": ve.errors()})
            # Log rejected event
            event = IngestEvent(
                provider_id=provider_id,
                raw_payload=row,
                status="REJECTED",
                error_log=str(ve.errors())
            )
            db.add(event)
        except Exception as e:
            rejected += 1
            errors.append({"row": row_idx + 1, "error": str(e)})
            
    db.commit()
    
    return BulkIngestResponse(
        accepted_count=accepted,
        rejected_count=rejected,
        errors=errors
    )

@router.get("/events")
def list_ingest_events(limit: int = 50, db: Session = Depends(get_db)):
    """Fetch recent ingestion events for the provider audit log."""
    events = db.query(IngestEvent).order_by(IngestEvent.created_at.desc()).limit(limit).all()
    return [
        {
            "id": evt.id,
            "provider_id": evt.provider_id,
            "raw_payload": evt.raw_payload,
            "status": evt.status,
            "error_log": evt.error_log,
            "created_at": evt.created_at.strftime("%Y-%m-%d %H:%M:%S") if evt.created_at else None
        }
        for evt in events
    ]

