"""Feature Engineering and Bitemporal Ledger Aggregation Service.

This module extracts quantitative risk signals from the immutable credit ledger
for both consumer individuals and commercial companies. It supports point-in-time
bitemporal reconstruction (`as_of` date queries), implements statutory Financial
Hardship Neutrality under the Privacy Act 1988 Part IIIA, computes dollar-weighted
commercial PAYDEX scores, and traverses director networks to quantify cross-corporate
insolvency contagion risk.

Architecture Tier:
    Analytical & Feature Engineering Layer (`backend/app/services/`).

Key Dependencies & Callers:
    - Depends on SQLAlchemy models (`CreditLedger`, `DirectorLink`, `Enquiry`, `Entity`).
    - Consumed by `backend/app/services/scoring.py` to drive model scoring equations,
      `routers/reports.py` for credit reports, and `routers/admin.py` for backtesting.

Regulatory & Compliance Context:
    - Privacy Act 1988 (Cth) Part IIIA & National Consumer Credit Protection Act 2009:
      Enforces statutory Hardship Neutrality (codes 'A' and 'V' must never degrade credit scores).
    - Privacy (Credit Reporting) Code 2014:
      Governs 24-month rolling Repayment History Information (RHI) evaluation.
"""

import math
from typing import Optional
from datetime import date, datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import CreditLedger, Enquiry, RecordTypeEnum, RecordStatusEnum, EntityTypeEnum, DirectorLink, Entity


def calculate_individual_features(entity_id: str, db: Session, as_of: Optional[date] = None) -> dict:
    """Extracts numerical credit risk features for an individual consumer.

    Queries the bitemporal ledger for all active, paid, and resolved entries valid
    on or before `as_of`. Computes time-decayed RHI payment performance, active/paid
    defaults, public record flags, file maturity, and recent enquiry velocity.

    Args:
        entity_id: Target consumer entity UUID.
        db: Scoped SQLAlchemy database session.
        as_of: Optional point-in-time date for historical file reconstruction.

    Returns:
        Dictionary containing extracted consumer features:
            - rhi_history_score (float 0.0-1.0): Time-weighted repayment performance.
            - total_credit_limit (float): Aggregated approved limits.
            - default_count (int): Total recorded defaults.
            - active_default_count (int): Currently outstanding unpaid defaults.
            - paid_default_count (int): Satisfied defaults.
            - default_amount (float): Total monetary balance of defaults.
            - sci_count (int): Serious Credit Infringement count.
            - bankruptcy_count (int): Insolvency and debt agreement count.
            - oldest_account_months (int): Credit history length in months.
            - enquiries_last_90_days (int): Inquiries recorded in previous 90 days.
            - hardship_flag (bool, optional): Present if hardship arrangement exists.

    Example:
        >>> feats = calculate_individual_features("IND-UUID-1234", db)
        >>> feats["rhi_history_score"] >= 0.0
        True
    """
    today = as_of or date.today()
    features = {
        "rhi_history_score": 0.0,
        "total_credit_limit": 0.0,
        "default_count": 0,
        "default_amount": 0.0,
        "sci_count": 0,
        "bankruptcy_count": 0,
        "oldest_account_months": 0,
        "enquiries_last_90_days": 0
    }

    # Fetch ledger records valid as of requested point-in-time
    records_q = db.query(CreditLedger).filter(
        CreditLedger.entity_id == entity_id,
        CreditLedger.status.in_([RecordStatusEnum.ACTIVE, RecordStatusEnum.PAID, RecordStatusEnum.RESOLVED])
    )
    # REVIEW-ASSUMPTION: Bitemporal filter ensures assertions recorded after as_of are excluded from historical view
    if as_of:
        as_of_dt = datetime.combine(as_of, datetime.max.time())
        records_q = records_q.filter(
            CreditLedger.valid_from <= as_of,
            CreditLedger.recorded_at <= as_of_dt
        )
    records = records_q.all()

    oldest_date = today
    rhi_points = 0
    rhi_max = 0

    for rec in records:
        if rec.valid_from < oldest_date:
            oldest_date = rec.valid_from

        if rec.record_type in [RecordTypeEnum.RHI, RecordTypeEnum.UTILITY]:
            # Evaluate rolling 24-month payment strings: '0', '1'-'6', 'X', etc.
            hist_str = (
                rec.data.get("rhi_history") or 
                rec.data.get("rhi_24_months") or 
                rec.data.get("history_24_months") or 
                ""
            )
            for i, char in enumerate(hist_str):
                weight = 1.0 - (i * 0.02)
                rhi_max += weight
                if char == '0':
                    rhi_points += weight
                elif char in '123456':
                    rhi_points += (weight * (1.0 - int(char)/10.0))
                elif char in ['V', 'A']:
                    # Hardship neutrality: protected from score degradation
                    rhi_points += weight
                elif char == 'X':
                    pass

            if rec.record_type == RecordTypeEnum.UTILITY:
                features["has_utility_record"] = True
                features["utility_payment_score"] = 0.98

        elif rec.record_type == RecordTypeEnum.TAX_COMPLIANCE:
            features["has_tax_compliance"] = True
            features["tax_compliance_score"] = 0.96

        elif rec.record_type == RecordTypeEnum.RENTAL:
            features["has_rental_record"] = True
            features["rental_payment_score"] = 0.95

        elif rec.record_type == RecordTypeEnum.BLACKLIST:
            features["is_blacklisted"] = True

        elif rec.record_type == RecordTypeEnum.DEFAULT:
            if rec.status == RecordStatusEnum.ACTIVE:
                features["active_default_count"] = features.get("active_default_count", 0) + 1
            elif rec.status == RecordStatusEnum.PAID:
                features["paid_default_count"] = features.get("paid_default_count", 0) + 1
            features["default_count"] += 1
            if rec.amount:
                features["default_amount"] += float(rec.amount)

        elif rec.record_type == RecordTypeEnum.HARDSHIP:
            # Protected under individual privacy provisions
            features["hardship_flag"] = True

        elif rec.record_type == RecordTypeEnum.SCI:
            features["sci_count"] += 1

        elif rec.record_type == RecordTypeEnum.BANKRUPTCY:
            features["bankruptcy_count"] += 1

    # Normalize RHI and utility score to a 0.0 - 1.0 ratio
    if rhi_max > 0:
        features["rhi_history_score"] = rhi_points / rhi_max
        if "utility_payment_score" not in features:
            features["utility_payment_score"] = features["rhi_history_score"]
    else:
        features["rhi_history_score"] = 0.95
        features["utility_payment_score"] = 0.95

    if "tax_compliance_score" not in features:
        features["tax_compliance_score"] = 0.90
    if "rental_payment_score" not in features:
        features["rental_payment_score"] = 0.90

    # Compute account maturity in approximate 30-day months
    months_old = (today - oldest_date).days // 30
    features["oldest_account_months"] = max(24, months_old)

    # Credit enquiry velocity over previous 90 days
    ninety_days_ago = today - timedelta(days=90)
    enquiries_q = db.query(Enquiry).filter(
        Enquiry.entity_id == entity_id,
        Enquiry.created_at >= ninety_days_ago
    )
    if as_of:
        enquiries_q = enquiries_q.filter(Enquiry.created_at <= as_of_dt)
    features["enquiries_last_90_days"] = enquiries_q.count()

    return features


def _calculate_director_structural_risk(entity_id: str, db: Session, depth: int = 0) -> int:
    """Traverses corporate directorship links to calculate cross-entity contagion risk.

    Identifies if active directors of the target company have personal insolvencies,
    defaults, or directorships in other distressed commercial entities.

    Args:
        entity_id: Company entity UUID.
        db: Scoped database session.
        depth: Current recursion depth (bounded at depth 1).

    Returns:
        Integer risk points aggregating adverse director signals.
    """
    # REVIEW-ASSUMPTION: Recursion bounded at depth=1 to prevent performance bottlenecks or infinite graph cycles
    if depth > 1:
        return 0

    risk_score = 0

    # Find active directors of this company
    links = db.query(DirectorLink).filter(
        DirectorLink.company_entity_id == entity_id,
        DirectorLink.end_date.is_(None)
    ).all()

    for link in links:
        # Check individual director's personal bankruptcies and active defaults
        bad_events = db.query(CreditLedger).filter(
            CreditLedger.entity_id == link.individual_entity_id,
            CreditLedger.record_type.in_([RecordTypeEnum.BANKRUPTCY, RecordTypeEnum.DEFAULT]),
            CreditLedger.status == RecordStatusEnum.ACTIVE
        ).count()
        
        if bad_events > 0:
            risk_score += bad_events

        # Check other commercial entities directed by the same individual
        other_companies = db.query(DirectorLink).filter(
            DirectorLink.individual_entity_id == link.individual_entity_id,
            DirectorLink.company_entity_id != entity_id,
            DirectorLink.end_date.is_(None)
        ).all()

        for oc in other_companies:
            # Recursive check bounded by depth 1 (i.e. only check 1 level deep)
            risk_score += _calculate_director_structural_risk(oc.company_entity_id, db, depth + 1)

    return risk_score


def calculate_company_features(entity_id: str, db: Session, as_of: Optional[date] = None) -> dict:
    """Extracts commercial credit risk features for an incorporated company.

    Calculates trade credit payment timeliness (PAYDEX score), public court record
    frequencies (writs, judgments, insolvencies), enquiry frequency, and director
    network structural risk.

    Args:
        entity_id: Target company entity UUID.
        db: Scoped database session.
        as_of: Optional historical point-in-time reconstruction date.

    Returns:
        Dictionary containing commercial risk features:
            - paydex_score (int 1-100): Dollar-weighted payment timeliness index.
            - total_exposure (float): Aggregated commercial liabilities.
            - public_record_count (int): Count of court writs, defaults, and insolvencies.
            - oldest_account_months (int): Age of oldest trade credit account.
            - enquiries_last_90_days (int): Inquiries lodged in the last 90 days.
            - structural_risk_points (int): Director contagion risk points.
    """
    today = as_of or date.today()
    features = {
        "paydex_score": 100, # 1-100 index (100 = prompt, on-time trade payments)
        "total_exposure": 0.0,
        "public_record_count": 0,
        "oldest_account_months": 0,
        "enquiries_last_90_days": 0,
        "structural_risk_points": 0
    }

    records_q = db.query(CreditLedger).filter(
        CreditLedger.entity_id == entity_id,
        CreditLedger.status.in_([RecordStatusEnum.ACTIVE, RecordStatusEnum.PAID, RecordStatusEnum.RESOLVED])
    )
    if as_of:
        as_of_dt = datetime.combine(as_of, datetime.max.time())
        records_q = records_q.filter(
            CreditLedger.valid_from <= as_of,
            CreditLedger.recorded_at <= as_of_dt
        )
    records = records_q.all()

    oldest_date = today
    total_invoice_value = 0.0
    weighted_dbt_sum = 0.0

    for rec in records:
        if rec.valid_from < oldest_date:
            oldest_date = rec.valid_from

        if rec.record_type == RecordTypeEnum.TRADE_PAYMENT:
            # Dollar-weighted Days Beyond Terms (DBT) aggregation
            amt = float(rec.amount) if rec.amount else 0.0
            dbt = rec.data.get("days_beyond_terms", 0)
            
            total_invoice_value += amt
            weighted_dbt_sum += (amt * dbt)
        
        elif rec.record_type in [RecordTypeEnum.DEFAULT, RecordTypeEnum.WRIT, RecordTypeEnum.BANKRUPTCY]:
            features["public_record_count"] += 1

    # Calculate commercial PAYDEX score (1-100 index):
    # Paydex = 100 - average Days Beyond Terms (DBT), bounded between 1 and 100
    if total_invoice_value > 0:
        avg_dbt = weighted_dbt_sum / total_invoice_value
        paydex = max(1, 100 - min(100, int(avg_dbt)))
        features["paydex_score"] = paydex

    months_old = (today - oldest_date).days // 30
    features["oldest_account_months"] = months_old

    # Commercial credit enquiry volume over previous 90 days
    ninety_days_ago = today - timedelta(days=90)
    enquiries_q = db.query(Enquiry).filter(
        Enquiry.entity_id == entity_id,
        Enquiry.created_at >= ninety_days_ago
    )
    if as_of:
        enquiries_q = enquiries_q.filter(Enquiry.created_at <= as_of_dt)
    features["enquiries_last_90_days"] = enquiries_q.count()

    # Structural contagion risk across linked company directorships
    features["structural_risk_points"] = _calculate_director_structural_risk(entity_id, db)

    return features


def update_feature_store(entity_id: str, db: Session, as_of: Optional[date] = None):
    """Refreshes and persists the cached FeatureStore for an entity.

    Calculates features based on entity type (INDIVIDUAL vs COMPANY). If `as_of`
    is supplied, returns a transient HistoricalFeatureStore without modifying
    the persistent live store.

    Args:
        entity_id: Target entity UUID.
        db: Scoped SQLAlchemy database session.
        as_of: Optional historical point-in-time date.

    Returns:
        FeatureStore model instance, transient historical container, or None if entity not found.
    """
    from app.models import FeatureStore
    entity = db.query(Entity).filter(Entity.id == entity_id).first()
    if not entity:
        return None
    
    if entity.type == EntityTypeEnum.INDIVIDUAL:
        features = calculate_individual_features(entity_id, db, as_of=as_of)
    else:
        features = calculate_company_features(entity_id, db, as_of=as_of)
        
    if as_of:
        # For historical point-in-time calculation, return pseudo FeatureStore without modifying current store
        class HistoricalFeatureStore:
            def __init__(self, f):
                self.features = f
        return HistoricalFeatureStore(features)

    fs = db.query(FeatureStore).filter(FeatureStore.entity_id == entity_id).first()
    if not fs:
        fs = FeatureStore(entity_id=entity_id, features=features)
        db.add(fs)
    else:
        fs.features = features
        fs.last_updated = datetime.utcnow()
    
    db.commit()
    return fs
