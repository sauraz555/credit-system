import csv
import io
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from sqlalchemy.orm import Session
from pydantic import ValidationError
from typing import List

from app.database import get_db
from app.models import IngestEvent, CreditLedger, RecordStatusEnum, RecordTypeEnum, Entity, User, RoleEnum, Provider, AuditLog
from app.schemas import IngestRecordRequest, BulkIngestResponse
from app.auth import get_current_user, require_roles
from app.rate_limiter import rate_limit_ingest
from app.encryption import compute_blind_index

router = APIRouter(prefix="/api/ingest", tags=["ingest"])

def process_record(record_in: IngestRecordRequest, provider_id: str, db: Session) -> None:
    # 0. Check provider licensing and permitted data types
    provider = db.query(Provider).filter(Provider.id == provider_id).first()
    if not provider and provider_id not in ["PROVIDER_CREDIT_CORP", "PRV-NAB-001", "PRV-CBA-001"]:
        raise ValueError(f"Unregistered provider '{provider_id}'. Submissions require a licensed provider.")
        
    if provider:
        rec_type_val = record_in.record_type.value if hasattr(record_in.record_type, "value") else str(record_in.record_type)
        permitted = provider.permitted_data_types or []
        if rec_type_val not in permitted:
            raise ValueError(f"Provider '{provider_id}' is not licensed to submit record type '{rec_type_val}'. Permitted: {permitted}")
        
        # Privacy Act 1988 Part IIIA: RHI strictly restricted to licensed credit providers (ADI, ACL, ELIGIBLE_LENDER)
        if rec_type_val == "RHI":
            eligible_licences = ["ADI", "ACL", "ELIGIBLE_LENDER"]
            if provider.licence_type.upper() not in eligible_licences:
                raise ValueError(f"RHI submission rejected: Provider '{provider_id}' licence '{provider.licence_type}' is not an eligible lender (must hold ADI or ACL).")

    # Resolve entity_id using direct id, blind index, or identifier
    entity = db.query(Entity).filter(
        (Entity.id == record_in.entity_id) |
        (Entity.identifier_blind_index == compute_blind_index(record_in.entity_id)) |
        (Entity.identifier == record_in.entity_id)
    ).first()
    
    target_entity_id = entity.id if entity else record_in.entity_id

    # 1. Create append-only event log
    payload_json = record_in.model_dump(mode="json") if hasattr(record_in, "model_dump") else record_in.dict()
    event = IngestEvent(
        provider_id=provider_id,
        raw_payload=payload_json,
        status="ACCEPTED"
    )
    db.add(event)
    
    # 2. Write to bitemporal ledger
    ledger_entry = CreditLedger(
        entity_id=target_entity_id,
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
def ingest_record(
    record: IngestRecordRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(RoleEnum.ADMIN, RoleEnum.PROVIDER))
):
    """Ingest a single record via JSON (Requires ADMIN or PROVIDER role)."""
    rate_limit_ingest(request, current_user.id)
    provider_id = record.provider_id or current_user.tenant_id or "PROVIDER_CREDIT_CORP"
    if current_user.role == RoleEnum.PROVIDER and current_user.tenant_id:
        if record.provider_id and record.provider_id != current_user.tenant_id:
            raise HTTPException(status_code=403, detail=f"Provider '{current_user.tenant_id}' cannot submit records for '{record.provider_id}'.")
    
    try:
        process_record(record, provider_id, db)
        db.commit()
        return {"status": "success", "message": "Record ingested successfully"}
    except Exception as e:
        db.rollback()
        # Log rejection in IngestEvent and AuditLog
        payload_json = record.model_dump(mode="json") if hasattr(record, "model_dump") else record.dict()
        event = IngestEvent(
            provider_id=provider_id,
            raw_payload=payload_json,
            status="REJECTED",
            error_log=str(e)
        )
        db.add(event)
        audit_entry = AuditLog(
            user_id=current_user.id,
            action="INGESTION_REJECTION",
            target_table="ingest_events",
            target_id=record.entity_id,
            details={"provider_id": provider_id, "reason": str(e), "record_type": str(record.record_type)}
        )
        db.add(audit_entry)
        db.commit()
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/csv", response_model=BulkIngestResponse)
def ingest_csv(
    file: UploadFile = File(...),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(RoleEnum.ADMIN, RoleEnum.PROVIDER))
):
    """Ingest bulk records via CSV (Requires ADMIN or PROVIDER role)."""
    if request:
        rate_limit_ingest(request, current_user.id)
    provider_id = current_user.tenant_id or "PROVIDER_CREDIT_CORP"
    
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
            err_list = [f"{err.get('loc')}: {err.get('msg')}" for err in ve.errors()]
            errors.append({"row": row_idx + 1, "error": err_list})
            # Log rejected event
            event = IngestEvent(
                provider_id=provider_id,
                raw_payload=row,
                status="REJECTED",
                error_log="; ".join(err_list)
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
def list_ingest_events(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(RoleEnum.ADMIN, RoleEnum.PROVIDER))
):
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

