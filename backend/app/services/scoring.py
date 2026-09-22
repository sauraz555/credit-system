"""Credit Scoring Engine and Risk Band Evaluation Service.

This module computes deterministic credit risk scores for consumer individuals (0-1000 scale)
and commercial companies (0-1000 scale). It translates aggregated features into component
sub-scores based on governance model configurations, applies statutory and risk-based
penalties (adverse blacklist listings, defaults, director contagion), enforces thin-file
ceilings, maps scores to qualitative risk bands, and persists score records for bureau auditability.

Architecture Tier:
    Scoring & Risk Engine Layer (`backend/app/services/`).

Key Dependencies & Callers:
    - Depends on SQLAlchemy models (`Score`, `ModelVersion`, `EntityTypeEnum`).
    - Consumed by `routers/reports.py` (during consumer and provider credit file lookups)
      and `routers/admin.py` (during statistical backtesting simulations).

Regulatory & Compliance Context:
    - Individual Privacy Act 2018 (वैयक्तिक गोपनीयता सम्बन्धी ऐन, २०७५):
      Requires transparent disclosure of scoring attribution factors and adverse drivers.
    - Nepal Rastra Bank (NRB) Directives on Credit Information & Scoring Calibration:
      Establishes individual scoring pillars:
      1. Utility payment history (35%)
      2. Blacklist & adverse records (25%)
      3. Income stability (20%)
      4. Business & tax compliance (12%)
      5. Rental payment history (8%)
"""

from datetime import datetime
from sqlalchemy.orm import Session
from app.models import Score, EntityTypeEnum, ModelVersion


def get_band(score: int) -> str:
    """Maps a 0-1000 numerical credit score to a qualitative risk band.

    Args:
        score: Numerical credit score integer between 0 and 1000.

    Returns:
        Qualitative risk band label:
            - 'Low' / न्यून: 0 - 299 (Extreme Credit Risk)
            - 'Fair' / मध्यम: 300 - 499 (Sub-prime / High Risk)
            - 'Good' / राम्रो: 500 - 699 (Standard Risk)
            - 'Great' / धेरै राम्रो: 700 - 799 (Low Risk)
            - 'Excellent' / उत्कृष्ट: 800 - 1000 (Prime / Very Low Risk)
    """
    if score < 300: return "Low"
    if score < 500: return "Fair"
    if score < 700: return "Good"
    if score < 800: return "Great"
    return "Excellent"


def evaluate_individual_score(entity_id: str, features: dict, model: ModelVersion) -> dict:
    """Evaluates credit score, factor breakdown, and driving reasons for an individual.

    Calculates score based on governance model configuration.
    For Nepal national credit scoring models, evaluates across the 5 statutory pillars:
    1. Utility payment history — 35% (max 350 pts)
    2. Blacklist / adverse records — 25% (max 250 pts)
    3. Income stability — 20% (max 200 pts)
    4. Business / tax compliance — 12% (max 120 pts)
    5. Rental payment history — 8% (max 80 pts)

    Args:
        entity_id: Consumer entity UUID.
        features: Dictionary produced by `calculate_individual_features()`.
        model: ModelVersion governance configuration.

    Returns:
        Dictionary with score outcome:
            - score (int): Final bounded score (0 - 1000).
            - band (str): Qualitative risk band.
            - sub_scores (dict): 5-pillar component breakdown.
            - top_factors (list): Human-readable explanatory factors.
    """
    weights = model.weights if model and model.weights else {}
    is_nepal_model = (
        "utility_history" in weights or 
        "utility_payment_history" in weights or 
        "blacklist_adverse" in weights or
        not weights # default to Nepal model if unconfigured
    )

    def _norm_weight(val, default_val):
        if val is None:
            return default_val
        try:
            f = float(val)
            return f / 100.0 if f > 1.0 else f
        except Exception:
            return default_val

    if is_nepal_model:
        # 1. Utility Payment History: 35% (350 points max)
        util_ratio = features.get("utility_payment_score", features.get("rhi_history_score", 0.96))
        util_weight = _norm_weight(weights.get("utility_payment_history") or weights.get("utility_history"), 0.35)
        utility_points = int(1000 * util_weight * util_ratio)

        # 2. Blacklist / Adverse Records: 25% (250 points max)
        adverse_weight = _norm_weight(weights.get("blacklist_adverse_records") or weights.get("blacklist_adverse"), 0.25)
        max_adverse_points = int(1000 * adverse_weight)
        is_blacklisted = features.get("is_blacklisted", False)
        active_defs = features.get("active_default_count", features.get("default_count", 0))
        paid_defs = features.get("paid_default_count", 0)
        
        adverse_deduction = 0
        if is_blacklisted:
            adverse_deduction += max_adverse_points # complete forfeiture of blacklist points
        else:
            adverse_deduction += (active_defs * 120) + (paid_defs * 30)
        blacklist_points = max(0, max_adverse_points - adverse_deduction)

        # 3. Income Stability: 20% (200 points max)
        income_ratio = features.get("income_stability_score", 0.90)
        income_weight = _norm_weight(weights.get("income_stability"), 0.20)
        income_points = int(1000 * income_weight * income_ratio)

        # 4. Business / Tax Compliance: 12% (120 points max)
        tax_ratio = features.get("tax_compliance_score", 0.95)
        tax_weight = _norm_weight(weights.get("tax_compliance"), 0.12)
        tax_points = int(1000 * tax_weight * tax_ratio)

        # 5. Rental Payment History: 8% (80 points max)
        rental_ratio = features.get("rental_payment_score", 0.90)
        rental_weight = _norm_weight(weights.get("rental_payment_history") or weights.get("rental_history"), 0.08)
        rental_points = int(1000 * rental_weight * rental_ratio)

        final_score = utility_points + blacklist_points + income_points + tax_points + rental_points
        final_score = max(0, min(1000, final_score))

        # Thin file cap for files under 3 months
        oldest_months = features.get("oldest_account_months", 24)
        if oldest_months < 3:
            final_score = min(final_score, 499)

        top_factors = [
            f"Utility payment track contributing {utility_points} pts (35% weight)",
            f"Adverse/Blacklist status: {blacklist_points} pts of {max_adverse_points} pts retained",
            f"Income & banking stability contributing {income_points} pts (20% weight)",
            f"Tax compliance (Inland Revenue Department) contributing {tax_points} pts (12% weight)",
            f"Rental payment reliability contributing {rental_points} pts (8% weight)"
        ]

        return {
            "score": final_score,
            "band": get_band(final_score),
            "sub_scores": {
                "utility_payment_history": utility_points,
                "blacklist_adverse_records": blacklist_points,
                "income_stability": income_points,
                "tax_compliance": tax_points,
                "rental_payment_history": rental_points
            },
            "top_factors": top_factors
        }

    # Legacy scoring fallback (e.g. for historical versions)
    rhi_score = features.get("rhi_history_score", 0.0)
    oldest_months = features.get("oldest_account_months", 0)
    enquiries = features.get("enquiries_last_90_days", 0)
    
    payment_points = int(400 * rhi_score)
    history_points = min(100, int(oldest_months * 1.5))
    enquiry_points = max(0, 100 - (enquiries * 20))
    base_score = 400 + payment_points + history_points + enquiry_points
    
    active_defs = features.get("active_default_count", features.get("default_count", 0))
    paid_defs = features.get("paid_default_count", 0)
    total_penalty = (active_defs * 100) + (paid_defs * 20)
    
    final_score = max(0, min(1000, base_score - total_penalty))
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
    """Evaluates commercial credit score and director contagion risk for a company.

    Calculates score based on base points (400), commercial trade PAYDEX timeliness
    (up to 400), commercial credit maturity (up to 150), and recent credit inquiries (up to 50).
    Penalizes public court records and director contagion risk.

    Args:
        entity_id: Company entity UUID.
        features: Dictionary produced by `calculate_company_features()`.
        model: ModelVersion governance configuration.

    Returns:
        Dictionary with commercial score outcome:
            - score (int): Final bounded score (0 - 1000).
            - band (str): Qualitative risk band.
            - sub_scores (dict): Breakdown (paydex, length_of_history, structural_risk_penalty, public_record_penalty).
            - top_factors (list): Human-readable explanatory factors.
    """
    paydex = features.get("paydex_score", 100)
    oldest_months = features.get("oldest_account_months", 0)
    enquiries = features.get("enquiries_last_90_days", 0)
    
    # REVIEW-ASSUMPTION: PAYDEX score (1-100) scaled by 4x yields up to 400 points
    paydex_points = paydex * 4
    # Length of commercial trading history: up to 150 points (2.5 pts per month)
    history_points = min(150, int(oldest_months * 2.5))
    # Enquiry penalty: 50 base points minus 10 points per inquiry
    enquiry_points = max(0, 50 - (enquiries * 10))
    
    base_score = 400 + paydex_points + history_points + enquiry_points
    
    # Commercial Penalties:
    # Public records (writs, judgments, defaults): -150 pts each
    pub_rec_penalty = features.get("public_record_count", 0) * 150
    # REVIEW-ASSUMPTION: Director structural risk: -50 pts per contagion point linked to bankrupt directors
    structural_risk_penalty = features.get("structural_risk_points", 0) * 50
    
    total_penalty = pub_rec_penalty + structural_risk_penalty
    
    final_score = base_score - total_penalty
    final_score = max(0, min(1000, final_score))
    
    # Thin File cap for newly registered companies under 3 months
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
    """Calculates credit score using active model and persists result to database.

    Retrieves the currently active `ModelVersion` for the given entity type, runs the
    appropriate scoring equation, creates a persistent `Score` record, and returns it.

    Args:
        entity_id: Target entity UUID.
        entity_type: EntityTypeEnum (INDIVIDUAL or COMPANY).
        features: Feature dictionary extracted from ledger.
        db: Scoped SQLAlchemy database session.

    Returns:
        Persisted Score SQLAlchemy model instance.
    """
    # Fetch active model for the corresponding entity type
    model = db.query(ModelVersion).filter(
        ModelVersion.type == entity_type,
        ModelVersion.active == True
    ).first()
    
    if not model:
        # REVIEW-ASSUMPTION: Create a baseline fallback model if none is marked active to support initial setup
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
