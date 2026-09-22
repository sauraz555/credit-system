from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from app.database import get_db
from app.models import Dispute, CreditLedger, RecordStatusEnum, AuditLog, Entity, User, RoleEnum
from app.auth import get_current_user, require_roles
from app.encryption import decrypt_field, compute_blind_index

router = APIRouter(prefix="/api/disputes", tags=["disputes"])

class DisputeCreate(BaseModel):
    ledger_record_id: Optional[str] = None
    entity_id: str
    notes: Optional[str] = None

class DisputeUpdate(BaseModel):
    status: str
    notes: Optional[str] = None

@router.get("")
def list_disputes(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(RoleEnum.ADMIN, RoleEnum.ANALYST))
):
    """Fetch all statutory disputes under Privacy Act 1988 Part IIIA s20V."""
    disputes = db.query(Dispute).order_by(Dispute.created_at.desc()).all()
    
    results = []
    for d in disputes:
        entity = db.query(Entity).filter(Entity.id == d.entity_id).first()
        ledger = db.query(CreditLedger).filter(CreditLedger.id == d.ledger_record_id).first() if d.ledger_record_id else None
        
        name = "Unknown Entity"
        if entity:
            if entity.basic_info.get("company_name"):
                name = entity.basic_info["company_name"]
            elif entity.basic_info.get("first_name"):
                name = f"{entity.basic_info.get('first_name', '')} {entity.basic_info.get('last_name', '')}".strip()
            else:
                name = entity.identifier
                
        # Calculate 30-day statutory SLA countdown
        now = datetime.utcnow()
        elapsed_days = (now - (d.created_at or now)).days
        days_remaining = max(0, 30 - elapsed_days) if d.status == "OPEN" else 0
        
        listing_desc = f"{ledger.record_type} (${ledger.amount or '0'})" if ledger else (d.ledger_record_id or "General Credit Listing")
        
        results.append({
            "id": d.id,
            "entity_id": d.entity_id,
            "subject_name": name,
            "target_listing": listing_desc,
            "grounds": d.notes or "Section 6Q/21D notice non-compliance or accuracy contest",
            "filed_date": d.created_at.strftime("%Y-%m-%d") if d.created_at else "2026-09-01",
            "days_remaining": days_remaining,
            "status": d.status,
            "resolved_at": d.resolved_at.strftime("%Y-%m-%d %H:%M:%S") if d.resolved_at else None
        })
        
    return results

@router.post("")
def open_dispute(
    dispute_in: DisputeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Find entity via ID, blind index, or identifier
    blind_idx = compute_blind_index(dispute_in.entity_id)
    entity = db.query(Entity).filter(
        (Entity.id == dispute_in.entity_id) |
        (Entity.identifier_blind_index == blind_idx) |
        (Entity.identifier == dispute_in.entity_id)
    ).first()
    
    actual_entity_id = entity.id if entity else dispute_in.entity_id
    
    # RBAC: Subject can only dispute their own file
    if current_user.role == RoleEnum.SUBJECT:
        if current_user.entity_id != actual_entity_id and current_user.id != actual_entity_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Subjects may only dispute listings on their own credit file."
            )
    
    # Verify or link ledger record
    ledger = None
    if dispute_in.ledger_record_id:
        ledger = db.query(CreditLedger).filter(CreditLedger.id == dispute_in.ledger_record_id).first()
        
    if not ledger and entity:
        # Fallback to any default or RHI ledger item for this entity
        ledger = db.query(CreditLedger).filter(CreditLedger.entity_id == actual_entity_id).first()
        
    ledger_id = ledger.id if ledger else (dispute_in.ledger_record_id or "GENERAL_LEDGER_RECORD")
    
    # Create dispute
    dispute = Dispute(
        ledger_record_id=ledger_id,
        entity_id=actual_entity_id,
        notes=dispute_in.notes,
        status="OPEN"
    )
    
    # Mark ledger as disputed if exists
    if ledger:
        ledger.status = RecordStatusEnum.DISPUTED
        
    # Audit log
    audit = AuditLog(
        user_id=current_user.id,
        action="CREATE_DISPUTE_SEC_20V",
        target_table="disputes",
        target_id=dispute.id,
        after_state={"status": "OPEN", "ledger": ledger_id, "entity": actual_entity_id}
    )
    
    db.add(dispute)
    db.add(audit)
    db.commit()
    
    return {
        "status": "success", 
        "dispute_id": dispute.id,
        "message": "Dispute lodged under Section 20V of Privacy Act 1988 (Cth). Listing flagged DISPUTED."
    }

@router.put("/{dispute_id}")
def update_dispute(
    dispute_id: str,
    dispute_in: DisputeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(RoleEnum.ADMIN, RoleEnum.ANALYST))
):
    dispute = db.query(Dispute).filter(Dispute.id == dispute_id).first()
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")
        
    old_status = dispute.status
    dispute.status = dispute_in.status
    if dispute_in.notes:
        dispute.notes = dispute_in.notes
        
    if dispute_in.status in ["CORRECTED", "UPHELD", "RESOLVED_EXPUNGED", "CONFIRMED_ACCURATE"]:
        dispute.resolved_at = datetime.utcnow()
        
        # Resolve the ledger record
        if dispute.ledger_record_id:
            ledger = db.query(CreditLedger).filter(CreditLedger.id == dispute.ledger_record_id).first()
            if ledger:
                if dispute_in.status in ["RESOLVED_EXPUNGED", "CORRECTED"]:
                    ledger.status = RecordStatusEnum.RESOLVED
                else:
                    ledger.status = RecordStatusEnum.ACTIVE
            
    # Audit log
    audit = AuditLog(
        user_id=current_user.id, 
        action="ADJUDICATE_DISPUTE",
        target_table="disputes",
        target_id=dispute.id,
        before_state={"status": old_status},
        after_state={"status": dispute.status, "notes": dispute_in.notes}
    )
    
    db.add(audit)
    db.commit()
    return {"status": "success", "new_status": dispute.status}

@router.get("/entity/{entity_id}")
def get_entity_disputes(
    entity_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Fetch disputes for an entity with Subject isolation."""
    blind_idx = compute_blind_index(entity_id)
    entity = db.query(Entity).filter(
        (Entity.id == entity_id) |
        (Entity.identifier_blind_index == blind_idx) |
        (Entity.identifier == entity_id)
    ).first()
    actual_id = entity.id if entity else entity_id

    if current_user.role == RoleEnum.SUBJECT:
        if current_user.entity_id != actual_id and current_user.id != actual_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Subjects may only view disputes for their own credit file."
            )

    disputes = db.query(Dispute).filter(Dispute.entity_id == actual_id).order_by(Dispute.created_at.desc()).all()
    return [
        {
            "id": d.id,
            "entity_id": d.entity_id,
            "ledger_record_id": d.ledger_record_id,
            "notes": d.notes,
            "status": d.status,
            "created_at": str(d.created_at),
            "resolved_at": str(d.resolved_at) if d.resolved_at else None
        }
        for d in disputes
    ]
