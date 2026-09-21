import os
import csv
import io
from datetime import date, datetime
from fastapi import APIRouter, Depends, UploadFile, File, Query, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator
from typing import Dict, Any, List, Optional
from app.database import get_db
from app.models import ModelVersion, EntityTypeEnum, AuditLog, User, RoleEnum, Entity
from app.auth import get_current_user, require_roles
from app.encryption import decrypt_field
from app.services.features import calculate_individual_features, calculate_company_features
from app.services.scoring import evaluate_individual_score, evaluate_company_score, get_band

router = APIRouter(prefix="/api/admin", tags=["admin"])

class ModelCreate(BaseModel):
    name: str
    type: EntityTypeEnum
    weights: Dict[str, Any]
    band_thresholds: Dict[str, Any]
    active: bool = False

    @field_validator("weights")
    @classmethod
    def validate_weights_total_100(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        if not v:
            raise ValueError("Weights dictionary cannot be empty")
        try:
            total = sum(float(w) for w in v.values())
        except (ValueError, TypeError):
            raise ValueError("All weight values must be numeric")
        if abs(total - 100.0) > 0.001:
            raise ValueError(f"Model weights must total exactly 100%. Current total: {total}%")
        return v

@router.post("/models")
def create_model(
    model_in: ModelCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(RoleEnum.ADMIN))
):
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
def get_models(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(RoleEnum.ADMIN, RoleEnum.ANALYST))
):
    models = db.query(ModelVersion).order_by(ModelVersion.created_at.desc()).all()
    return models

@router.post("/backtest")
async def run_backtest(
    model_id: str = Query(...),
    observation_date: Optional[str] = Query(None),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(RoleEnum.ADMIN, RoleEnum.ANALYST))
):
    """
    Real backtesting endpoint:
    1. Reads outcome CSV (entity_id, outcome_date, defaulted).
    2. Reconstructs features as of observation_date from bitemporal ledger.
    3. Evaluates credit scores using the target model.
    4. Computes discrimination metrics (AUC, Gini, KS statistic).
    5. Builds default rate by score band and 10-decile calibration table.
    """
    # 1. Fetch Model
    model = db.query(ModelVersion).filter(ModelVersion.id == model_id).first()
    if not model:
        model = db.query(ModelVersion).filter(ModelVersion.active == True).first()
    if not model:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found.")

    # 2. Parse observation date
    if observation_date:
        try:
            obs_date = datetime.strptime(observation_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid observation_date format. Use YYYY-MM-DD.")
    else:
        obs_date = date.today()

    # 3. Read outcomes CSV
    raw_content = ""
    if file:
        content_bytes = await file.read()
        raw_content = content_bytes.decode("utf-8-sig", errors="replace")
    else:
        # Fallback to backend/scripts/synthetic_outcomes.csv
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        default_csv = os.path.join(base_dir, "scripts", "synthetic_outcomes.csv")
        if os.path.exists(default_csv):
            with open(default_csv, "r", encoding="utf-8-sig") as f:
                raw_content = f.read()
        else:
            raise HTTPException(status_code=400, detail="No outcomes file provided and synthetic_outcomes.csv not found.")

    reader = csv.DictReader(io.StringIO(raw_content))
    rows = []
    for r in reader:
        clean_row = {k.strip().lower(): v.strip() for k, v in r.items() if k}
        ent_id = clean_row.get("entity_id")
        if not ent_id:
            continue
        val = clean_row.get("defaulted", "0")
        try:
            defaulted = int(val)
        except ValueError:
            defaulted = 1 if val.lower() in ["true", "yes", "1"] else 0
        rows.append({
            "entity_id": ent_id,
            "outcome_date": clean_row.get("outcome_date", ""),
            "defaulted": defaulted
        })

    if not rows:
        raise HTTPException(status_code=400, detail="Outcomes CSV is empty or missing valid entity_id rows.")

    # 4. Score each entity as of observation_date
    scored_records = []
    for item in rows:
        ent_id = item["entity_id"]
        defaulted = item["defaulted"]
        entity = db.query(Entity).filter(Entity.id == ent_id).first()
        if not entity:
            continue

        if entity.type == EntityTypeEnum.INDIVIDUAL:
            features = calculate_individual_features(ent_id, db, as_of=obs_date)
            res = evaluate_individual_score(ent_id, features, model)
        else:
            features = calculate_company_features(ent_id, db, as_of=obs_date)
            res = evaluate_company_score(ent_id, features, model)

        score = res["score"]
        band = res.get("band", get_band(score))
        scored_records.append({
            "entity_id": ent_id,
            "score": score,
            "band": band,
            "defaulted": defaulted
        })

    if not scored_records:
        raise HTTPException(status_code=400, detail="None of the entities in the CSV were found in the database.")

    # 5. Discrimination Metrics (AUC, Gini, KS)
    defaulters = [r["score"] for r in scored_records if r["defaulted"] == 1]
    non_defaulters = [r["score"] for r in scored_records if r["defaulted"] == 0]
    n_def = len(defaulters)
    n_non = len(non_defaulters)

    if n_def == 0 or n_non == 0:
        auc = 0.5
        gini = 0.0
        ks_stat = 0.0
    else:
        # Lower credit score indicates higher risk of default
        # Concordant pair: defaulter has lower score than non-defaulter
        concordant = 0.0
        for s_def in defaulters:
            for s_non in non_defaulters:
                if s_def < s_non:
                    concordant += 1.0
                elif s_def == s_non:
                    concordant += 0.5
        auc = concordant / (n_def * n_non)
        gini = 2.0 * auc - 1.0

        # Kolmogorov-Smirnov statistic
        sorted_records = sorted(scored_records, key=lambda x: x["score"])
        cum_def = 0
        cum_non = 0
        max_diff = 0.0
        for r in sorted_records:
            if r["defaulted"] == 1:
                cum_def += 1
            else:
                cum_non += 1
            diff = abs((cum_def / n_def) - (cum_non / n_non))
            if diff > max_diff:
                max_diff = diff
        ks_stat = max_diff

    # 6. Default rate by band
    target_bands = ["Excellent", "Great", "Good", "Fair", "Poor"]
    band_counts = {b: 0 for b in target_bands}
    band_defaults = {b: 0 for b in target_bands}

    for r in scored_records:
        b = r["band"]
        if b == "Low":
            b = "Poor"
        elif b == "Very Good":
            b = "Great"
        if b not in band_counts:
            band_counts[b] = 0
            band_defaults[b] = 0
        band_counts[b] += 1
        if r["defaulted"] == 1:
            band_defaults[b] += 1

    band_performance = []
    for b in target_bands:
        cnt = band_counts.get(b, 0)
        defs = band_defaults.get(b, 0)
        rate = (defs / cnt) if cnt > 0 else 0.0
        band_performance.append({
            "band": b,
            "count": cnt,
            "defaults": defs,
            "default_rate": round(rate, 4)
        })

    # 7. Decile calibration table
    sorted_all = sorted(scored_records, key=lambda x: x["score"])
    deciles = []
    n_tot = len(sorted_all)
    for i in range(10):
        s_idx = (i * n_tot) // 10
        e_idx = ((i + 1) * n_tot) // 10
        bucket = sorted_all[s_idx:e_idx]
        b_cnt = len(bucket)
        if b_cnt > 0:
            b_defs = sum(1 for x in bucket if x["defaulted"] == 1)
            b_min = min(x["score"] for x in bucket)
            b_max = max(x["score"] for x in bucket)
            b_rate = b_defs / b_cnt
        else:
            b_defs = 0
            b_min = 0
            b_max = 0
            b_rate = 0.0
        deciles.append({
            "decile": i + 1,
            "score_min": b_min,
            "score_max": b_max,
            "count": b_cnt,
            "defaults": b_defs,
            "observed_default_rate": round(b_rate, 4)
        })

    return {
        "status": "success",
        "model_id": model.id,
        "model_name": model.name,
        "observation_date": str(obs_date),
        "total_records": len(scored_records),
        "auc": round(auc, 4),
        "gini": round(gini, 4),
        "gini_index": round(gini, 4),
        "ks_statistic": round(ks_stat, 4),
        "band_performance": band_performance,
        "deciles": deciles,
        "message": f"Backtest executed on {len(scored_records)} records with AUC {round(auc, 4)}."
    }

@router.get("/audit")
def get_audit_log(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(RoleEnum.ADMIN))
):
    logs = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).limit(50).all()
    return logs

@router.get("/network")
def get_director_network(
    limit_companies: int = 12,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(RoleEnum.ADMIN, RoleEnum.ANALYST))
):
    """Fetch corporate director contagion graph nodes and edges."""
    from app.models import Entity, DirectorLink, Score
    
    companies = db.query(Entity).filter(Entity.type == EntityTypeEnum.COMPANY).limit(limit_companies).all()
    
    nodes = []
    edges = []
    seen_nodes = set()
    
    for comp in companies:
        c_score = db.query(Score).filter(Score.entity_id == comp.id).order_by(Score.calculated_at.desc()).first()
        comp_ident = decrypt_field(comp.identifier)
        comp_name = comp.basic_info.get("company_name", f"Company {comp_ident[:6] if comp_ident else 'Unknown'}")
        
        nodes.append({
            "id": comp.id,
            "label": comp_name,
            "type": "COMPANY",
            "identifier": comp_ident,
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
                    ind_ident = decrypt_field(ind.identifier)
                    ind_name = f"{ind.basic_info.get('first_name', '')} {ind.basic_info.get('last_name', '')}".strip() or f"Director {ind_ident[:6] if ind_ident else 'Unknown'}"
                    nodes.append({
                        "id": ind.id,
                        "label": ind_name,
                        "type": "DIRECTOR",
                        "identifier": ind_ident,
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

