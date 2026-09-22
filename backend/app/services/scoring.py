"""Credit Scoring Engine and Risk Band Evaluation Service.

This module computes deterministic credit risk scores for consumer individuals (0-1000 scale)
and commercial companies (0-1000 scale). It translates aggregated features into component
sub-scores (payment history, file depth, enquiry velocity), applies statutory and risk-based
penalties (unpaid vs paid defaults, court records, director contagion), enforces thin-file
ceilings, maps scores to qualitative risk bands, and persists score records for bureau auditability.

Architecture Tier:
    Scoring & Risk Engine Layer (`backend/app/services/`).

Key Dependencies & Callers:
    - Depends on SQLAlchemy models (`Score`, `ModelVersion`, `EntityTypeEnum`).
    - Consumed by `routers/reports.py` (during consumer and provider credit file lookups)
      and `routers/admin.py` (during statistical backtesting simulations).

Regulatory & Compliance Context:
    - Privacy Act 1988 (Cth) Part IIIA Section 20R:
      Requires credit reporting bodies to provide explanatory factors describing key adverse
      and positive variables contributing to a score (implemented via `top_factors`).
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
            - 'Low': 0 - 299 (Extreme Credit Risk)
            - 'Fair': 300 - 499 (Sub-prime / High Risk)
            - 'Good': 500 - 699 (Standard Risk)
            - 'Great': 700 - 799 (Low Risk)
            - 'Excellent': 800 - 1000 (Prime / Very Low Risk)
    """
    # REVIEW-ASSUMPTION: Five-tier qualitative risk band cutoffs commonly used in Australian bureaus
    if score < 300: return "Low"
    if score < 500: return "Fair"
    if score < 700: return "Good"
    if score < 800: return "Great"
    return "Excellent"


def evaluate_individual_score(entity_id: str, features: dict, model: ModelVersion) -> dict:
    """Evaluates credit score, factor breakdown, and driving reasons for an individual.

    Calculates score based on base points (400), repayment performance (up to 400),
    history maturity (up to 100), and credit seeking inquiries (up to 100). Subtracts
    statutory penalties for active/paid defaults, SCIs, and insolvencies, and enforces
    the thin-file cap (< 3 months capped at 499).

    Args:
        entity_id: Consumer entity UUID.
        features: Dictionary produced by `calculate_individual_features()`.
        model: ModelVersion governance configuration.

    Returns:
        Dictionary with score outcome:
            - score (int): Final bounded score (0 - 1000).
            - band (str): Qualitative risk band.
            - sub_scores (dict): Component breakdown (payment_history, length_of_history, credit_seeking, penalties).
            - top_factors (list): Human-readable explanatory factors.
    """
    # Basic math model (ignoring exact dynamic weights for this prototype, but they are available in `model.weights`)
    rhi_score = features.get("rhi_history_score", 0.0)
    oldest_months = features.get("oldest_account_months", 0)
    enquiries = features.get("enquiries_last_90_days", 0)
    
    # REVIEW-ASSUMPTION: Factor allocation totaling 600 variable positive points over 400 base points:
    # 1. Payment History: Max 400 points based on 24-month decayed RHI
    payment_points = int(400 * rhi_score)
    # 2. Length of History: Max 100 points, scaling at 1.5 pts per month of maturity (reaches cap at ~66 months)
    history_points = min(100, int(oldest_months * 1.5))
    # 3. Credit Seeking: Max 100 points, penalizing -20 pts per enquiry in previous 90 days
    enquiry_points = max(0, 100 - (enquiries * 20))
    
    # Base score floor of 400 + up to 600 variable points = 1000 max score
    base_score = 400 + payment_points + history_points + enquiry_points
    
    # Penalties calculation:
    # REVIEW-ASSUMPTION: Paid defaults penalized at -20 pts vs -100 pts for active unpaid defaults
    # to incentivize borrower remediation and accurate CCR balance reporting
    if "active_default_count" in features or "paid_default_count" in features:
        active_defs = features.get("active_default_count", 0)
        paid_defs = features.get("paid_default_count", 0)
        def_penalty = (active_defs * 100) + (paid_defs * 20)
    else:
        def_penalty = features.get("default_count", 0) * 100
    # REVIEW-ASSUMPTION: Serious Credit Infringement (-150 pts) reflects intentional credit evasion
    sci_penalty = features.get("sci_count", 0) * 150
    # REVIEW-ASSUMPTION: Bankruptcy/Part IX/Part X (-300 pts) reflects severe legal insolvency
    bank_penalty = features.get("bankruptcy_count", 0) * 300
    
    total_penalty = def_penalty + sci_penalty + bank_penalty
    
    final_score = base_score - total_penalty
    final_score = max(0, min(1000, final_score))
    
    # REVIEW-ASSUMPTION: Thin File Cap: Files under 3 months old are capped at 499 (Fair band)
    # regardless of payment perfection to prevent unseasoned credit files from scoring in prime bands
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
