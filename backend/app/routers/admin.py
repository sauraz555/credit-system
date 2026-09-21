from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Dict, Any, List
from app.database import get_db
from app.models import ModelVersion, EntityTypeEnum, AuditLog

router = APIRouter(prefix="/api/admin", tags=["admin"])

class ModelCreate(BaseModel):
    name: str
    type: EntityTypeEnum
    weights: Dict[str, Any]
    band_thresholds: Dict[str, Any]
    active: bool = False

@router.post("/models")
def create_model(model_in: ModelCreate, db: Session = Depends(get_db)):
    if model_in.active:
        # Deactivate current active model
        db.query(ModelVersion).filter(
            ModelVersion.type == model_in.type,
            ModelVersion.active == True
        ).update({"active": False})
        
    model = ModelVersion(
        type=model_in.type,
        name=model_in.name,
        weights=model_in.weights,
        band_thresholds=model_in.band_thresholds,
        active=model_in.active
    )
    db.add(model)
    db.commit()
    return {"status": "success", "model_id": model.id}

@router.get("/models")
def get_models(db: Session = Depends(get_db)):
    models = db.query(ModelVersion).order_by(ModelVersion.created_at.desc()).all()
    return models

@router.post("/backtest")
def run_backtest(model_id: str, db: Session = Depends(get_db)):
    """
    Mock endpoint to simulate backtesting.
    In a real system, this would:
    1. Fetch historical point-in-time features from 12-24 months ago.
    2. Apply the selected model weights to get a predicted score.
    3. Compare against actual default events in the ensuing 12-24 months.
    4. Calculate Gini/AUC and report back.
    """
    return {
        "status": "success",
        "gini_index": 0.68,
        "auc": 0.85,
        "calibration": "Optimal",
        "message": f"Backtest simulated successfully for model {model_id}."
    }

@router.get("/audit")
def get_audit_log(db: Session = Depends(get_db)):
    logs = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).limit(50).all()
    return logs

@router.get("/network")
def get_director_network(limit_companies: int = 12, db: Session = Depends(get_db)):
    """Fetch corporate director contagion graph nodes and edges."""
    from app.models import Entity, DirectorLink, Score
    
    companies = db.query(Entity).filter(Entity.type == EntityTypeEnum.COMPANY).limit(limit_companies).all()
    
    nodes = []
    edges = []
    seen_nodes = set()
    
    for comp in companies:
        c_score = db.query(Score).filter(Score.entity_id == comp.id).order_by(Score.calculated_at.desc()).first()
        comp_name = comp.basic_info.get("company_name", f"Company {comp.identifier[:6]}")
        
        nodes.append({
            "id": comp.id,
            "label": comp_name,
            "type": "COMPANY",
            "identifier": comp.identifier,
            "score": c_score.score_value if c_score else 76,
            "risk": "HIGH" if (c_score and c_score.score_value < 50) else "LOW"
        })
        seen_nodes.add(comp.id)
        
        links = db.query(DirectorLink).filter(DirectorLink.company_entity_id == comp.id).all()
        for link in links:
            ind = db.query(Entity).filter(Entity.id == link.individual_entity_id).first()
            if ind:
                if ind.id not in seen_nodes:
                    ind_score = db.query(Score).filter(Score.entity_id == ind.id).order_by(Score.calculated_at.desc()).first()
                    ind_name = f"{ind.basic_info.get('first_name', '')} {ind.basic_info.get('last_name', '')}".strip() or f"Director {ind.identifier[:6]}"
                    nodes.append({
                        "id": ind.id,
                        "label": ind_name,
                        "type": "DIRECTOR",
                        "identifier": ind.identifier,
                        "score": ind_score.score_value if ind_score else 710,
                        "risk": "HIGH" if (ind_score and ind_score.score_value < 600) else "LOW"
                    })
                    seen_nodes.add(ind.id)
                
                edges.append({
                    "id": link.id,
                    "source": ind.id,
                    "target": comp.id,
                    "role": link.role,
                    "start_date": str(link.start_date)
                })
                
    return {
        "nodes": nodes,
        "edges": edges,
        "total_nodes": len(nodes),
        "total_edges": len(edges)
    }

