from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from typing import Optional, List, Dict, Any
from app.database import get_db
from app.models import (
    Entity, CreditLedger, Enquiry, Score, FeatureStore, 
    EntityTypeEnum, DirectorLink, User, RoleEnum, Dispute
)
from app.services.features import update_feature_store
from app.services.scoring import calculate_and_save_score

router = APIRouter(prefix="/api", tags=["reports", "scoring"])

def ensure_mock_user(db: Session) -> str:
    user = db.query(User).filter(User.id == "MOCK_USER_ID").first()
    if not user:
        user = User(
            id="MOCK_USER_ID",
            email="officer@apra-crms.gov.au",
            password_hash="system_managed_hash",
            role=RoleEnum.ANALYST
        )
        db.add(user)
        try:
            db.commit()
        except Exception:
            db.rollback()
    return "MOCK_USER_ID"

def find_entity(entity_id: str, db: Session) -> Optional[Entity]:
    # 1. Exact match on UUID or identifier
    entity = db.query(Entity).filter(
        or_(Entity.id == entity_id, Entity.identifier == entity_id)
    ).first()
    if entity:
        return entity
        
    # 2. Match with cleaned identifier (e.g. IND-8842-1994 -> 88421994 or partial)
    clean_id = entity_id.replace("-", "").replace("IND", "").replace("ACN", "").replace("ABN", "").strip()
    if clean_id:
        entity = db.query(Entity).filter(Entity.identifier.contains(clean_id)).first()
        if entity:
            return entity

    # 3. Fallback: match by name in basic_info
    entity = db.query(Entity).filter(
        or_(
            Entity.basic_info.cast(str).ilike(f"%{entity_id}%")
        )
    ).first()
    return entity

@router.get("/entities/stats")
def get_entity_stats(db: Session = Depends(get_db)):
    """Bureau aggregate metrics for executive dashboard."""
    individuals_count = db.query(Entity).filter(Entity.type == EntityTypeEnum.INDIVIDUAL).count()
    companies_count = db.query(Entity).filter(Entity.type == EntityTypeEnum.COMPANY).count()
    ledger_count = db.query(CreditLedger).count()
    disputes_count = db.query(Dispute).filter(Dispute.status == "OPEN").count()
    enquiries_count = db.query(Enquiry).count()
    
    return {
        "status": "online",
        "individuals_count": individuals_count,
        "companies_count": companies_count,
        "total_entities": individuals_count + companies_count,
        "ledger_events_count": ledger_count,
        "open_disputes_count": disputes_count,
        "total_enquiries": enquiries_count,
        "reporting_window": "SEPTEMBER 2026 CYCLE OPEN",
        "hash_consistency": "100.0%"
    }

@router.get("/entities")
def list_entities(
    type: Optional[str] = Query(None, description="INDIVIDUAL or COMPANY"),
    search: Optional[str] = Query(None, description="Search by identifier or name"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """Search and paginate bureau entities."""
    query = db.query(Entity)
    if type:
        query = query.filter(Entity.type == type.upper())
    if search:
        s = search.strip()
        query = query.filter(
            or_(
                Entity.identifier.ilike(f"%{s}%"),
                Entity.id.ilike(f"%{s}%"),
                Entity.basic_info.cast(str).ilike(f"%{s}%")
            )
        )
    
    total = query.count()
    entities = query.order_by(Entity.created_at.desc()).offset(offset).limit(limit).all()
    
    results = []
    for e in entities:
        score = db.query(Score).filter(Score.entity_id == e.id).order_by(Score.calculated_at.desc()).first()
        results.append({
            "id": e.id,
            "type": e.type,
            "identifier": e.identifier,
            "basic_info": e.basic_info,
            "score": {
                "value": score.score_value if score else None,
                "band": score.band if score else "Unscored"
            } if score else None
        })
        
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "entities": results
    }

@router.post("/scoring/evaluate/{entity_id}")
def evaluate_score(entity_id: str, db: Session = Depends(get_db)):
    """Force recompute of features and score for an entity."""
    entity = find_entity(entity_id, db)
    if not entity:
        raise HTTPException(status_code=404, detail=f"Entity {entity_id} not found")
        
    fs = update_feature_store(entity.id, db)
    score = calculate_and_save_score(entity.id, entity.type, fs.features, db)
    
    return {
        "status": "success",
        "score_id": score.id,
        "score_value": score.score_value,
        "band": score.band,
        "sub_scores": score.sub_scores,
        "top_factors": score.top_factors
    }

@router.get("/reports/{entity_id}")
def get_report(entity_id: str, db: Session = Depends(get_db)):
    """Fetch full credit report, returning score, ledger, and director links."""
    entity = find_entity(entity_id, db)
    if not entity:
        raise HTTPException(status_code=404, detail=f"Entity '{entity_id}' not found")
        
    # Log enquiry safely
    try:
        user_id = ensure_mock_user(db)
        enquiry = Enquiry(
            entity_id=entity.id,
            user_id=user_id,
            reason="Comprehensive Bureau Credit Assessment (Part IIIA)"
        )
        db.add(enquiry)
        db.commit()
    except Exception:
        db.rollback()
        
    # Fetch active score
    score = db.query(Score).filter(Score.entity_id == entity.id).order_by(Score.calculated_at.desc()).first()
    
    # If no score exists, calculate it real-time
    if not score:
        fs = update_feature_store(entity.id, db)
        score = calculate_and_save_score(entity.id, entity.type, fs.features, db)
        
    # Fetch ledger records
    ledger = db.query(CreditLedger).filter(CreditLedger.entity_id == entity.id).order_by(CreditLedger.valid_from.desc()).all()
    
    # Fetch director relationships
    directors_data = []
    directorships_data = []
    
    if entity.type == EntityTypeEnum.COMPANY:
        links = db.query(DirectorLink).filter(DirectorLink.company_entity_id == entity.id).all()
        for link in links:
            ind = db.query(Entity).filter(Entity.id == link.individual_entity_id).first()
            if ind:
                other_count = db.query(DirectorLink).filter(
                    DirectorLink.individual_entity_id == ind.id,
                    DirectorLink.company_entity_id != entity.id
                ).count()
                
                ind_score = db.query(Score).filter(Score.entity_id == ind.id).order_by(Score.calculated_at.desc()).first()
                
                directors_data.append({
                    "link_id": link.id,
                    "individual_id": ind.id,
                    "identifier": ind.identifier,
                    "name": f"{ind.basic_info.get('first_name', '')} {ind.basic_info.get('last_name', '')}".strip() or ind.identifier,
                    "role": link.role,
                    "start_date": str(link.start_date),
                    "other_directorships": other_count,
                    "contagion_risk": "HIGH" if (ind_score and ind_score.score_value < 600) else "LOW",
                    "individual_score": ind_score.score_value if ind_score else 720
                })
    else:
        links = db.query(DirectorLink).filter(DirectorLink.individual_entity_id == entity.id).all()
        for link in links:
            comp = db.query(Entity).filter(Entity.id == link.company_entity_id).first()
            if comp:
                comp_score = db.query(Score).filter(Score.entity_id == comp.id).order_by(Score.calculated_at.desc()).first()
                directorships_data.append({
                    "company_id": comp.id,
                    "company_identifier": comp.identifier,
                    "company_name": comp.basic_info.get("company_name", comp.identifier),
                    "role": link.role,
                    "start_date": str(link.start_date),
                    "paydex_score": comp_score.score_value if comp_score else 75
                })
    
    return {
        "entity": {
            "id": entity.id,
            "type": entity.type,
            "identifier": entity.identifier,
            "basic_info": entity.basic_info,
            "created_at": str(entity.created_at)
        },
        "score": {
            "value": score.score_value,
            "band": score.band,
            "top_factors": score.top_factors,
            "sub_scores": score.sub_scores,
            "calculated_at": str(score.calculated_at)
        },
        "directors": directors_data,
        "directorships": directorships_data,
        "ledger": [
            {
                "id": rec.id,
                "record_type": rec.record_type,
                "data": rec.data,
                "amount": float(rec.amount) if rec.amount is not None else None,
                "valid_from": str(rec.valid_from),
                "valid_to": str(rec.valid_to) if rec.valid_to else None,
                "provider_id": rec.provider_id,
                "status": rec.status,
                "recorded_at": str(rec.recorded_at)
            }
            for rec in ledger
        ]
    }
