from datetime import datetime
from sqlalchemy.orm import Session
from app.models import Score, EntityTypeEnum, ModelVersion

def get_band(score: int) -> str:
    if score < 300: return "Low"
    if score < 500: return "Fair"
    if score < 700: return "Good"
    if score < 800: return "Great"
    return "Excellent"

def evaluate_individual_score(entity_id: str, features: dict, model: ModelVersion) -> dict:
    # Basic math model (ignoring exact dynamic weights for this prototype, but they are available in `model.weights`)
    rhi_score = features.get("rhi_history_score", 0.0)
    oldest_months = features.get("oldest_account_months", 0)
    enquiries = features.get("enquiries_last_90_days", 0)
    
    payment_points = int(400 * rhi_score)
    history_points = min(100, int(oldest_months * 1.5))
    enquiry_points = max(0, 100 - (enquiries * 20))
    
    base_score = 400 + payment_points + history_points + enquiry_points
    
    # Penalties
    def_penalty = features.get("default_count", 0) * 100
    sci_penalty = features.get("sci_count", 0) * 150
    bank_penalty = features.get("bankruptcy_count", 0) * 300
    
    total_penalty = def_penalty + sci_penalty + bank_penalty
    
    final_score = base_score - total_penalty
    final_score = max(0, min(1000, final_score))
    
    # Thin File cap
    if oldest_months < 3:
        final_score = min(final_score, 499)
        
    return {
        "score": final_score,
        "band": get_band(final_score),
        "sub_scores": {
            "payment_history": payment_points,
            "length_of_history": history_points,
            "credit_seeking": enquiry_points,
            "penalties": total_penalty
        },
        "top_factors": [
            f"Payment history contributing {payment_points} pts",
            f"Public records penalizing {total_penalty} pts" if total_penalty > 0 else "No significant public records"
        ]
    }

def evaluate_company_score(entity_id: str, features: dict, model: ModelVersion) -> dict:
    paydex = features.get("paydex_score", 100)
    oldest_months = features.get("oldest_account_months", 0)
    enquiries = features.get("enquiries_last_90_days", 0)
    
    paydex_points = paydex * 4
    history_points = min(150, int(oldest_months * 2.5))
    enquiry_points = max(0, 50 - (enquiries * 10))
    
    base_score = 400 + paydex_points + history_points + enquiry_points
    
    # Penalties
    pub_rec_penalty = features.get("public_record_count", 0) * 150
    structural_risk_penalty = features.get("structural_risk_points", 0) * 50
    
    total_penalty = pub_rec_penalty + structural_risk_penalty
    
    final_score = base_score - total_penalty
    final_score = max(0, min(1000, final_score))
    
    # Thin File
    if oldest_months < 3:
        final_score = min(final_score, 499)
        
    return {
        "score": final_score,
        "band": get_band(final_score),
        "sub_scores": {
            "paydex": paydex_points,
            "length_of_history": history_points,
            "structural_risk_penalty": structural_risk_penalty,
            "public_record_penalty": pub_rec_penalty
        },
        "top_factors": [
            f"Trade payments contributing {paydex_points} pts (PAYDEX {paydex})",
            f"Director structural risk penalizing {structural_risk_penalty} pts" if structural_risk_penalty > 0 else "Low director contagion risk"
        ]
    }

def calculate_and_save_score(entity_id: str, entity_type: EntityTypeEnum, features: dict, db: Session):
    # Fetch active model
    model = db.query(ModelVersion).filter(
        ModelVersion.type == entity_type,
        ModelVersion.active == True
    ).first()
    
    if not model:
        # Create a default model if none exists (for ease of testing)
        model = ModelVersion(
            type=entity_type,
            name="v1.0 Baseline",
            weights={},
            band_thresholds={},
            active=True
        )
        db.add(model)
        db.commit()
        db.refresh(model)
        
    if entity_type == EntityTypeEnum.INDIVIDUAL:
        result = evaluate_individual_score(entity_id, features, model)
    else:
        result = evaluate_company_score(entity_id, features, model)
        
    score_record = Score(
        entity_id=entity_id,
        model_version_id=model.id,
        score_value=result["score"],
        band=result["band"],
        sub_scores=result["sub_scores"],
        top_factors=result["top_factors"],
        calculated_at=datetime.utcnow()
    )
    db.add(score_record)
    db.commit()
    
    return score_record
