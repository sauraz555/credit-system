import math
from datetime import date, datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import CreditLedger, Enquiry, RecordTypeEnum, RecordStatusEnum, EntityTypeEnum, DirectorLink, Entity

def calculate_individual_features(entity_id: str, db: Session) -> dict:
    today = date.today()
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

    # Fetch ledger records
    records = db.query(CreditLedger).filter(
        CreditLedger.entity_id == entity_id,
        CreditLedger.status.in_([RecordStatusEnum.ACTIVE, RecordStatusEnum.PAID])
    ).all()

    oldest_date = today
    rhi_points = 0
    rhi_max = 0

    for rec in records:
        if rec.valid_from < oldest_date:
            oldest_date = rec.valid_from

        if rec.record_type == RecordTypeEnum.RHI:
            # RHI strings are up to 24 chars: '0', '1'-'6', 'X'
            rhi_str = rec.data.get("rhi_history", "")
            for i, char in enumerate(rhi_str):
                # Weight recent months higher
                weight = 1.0 - (i * 0.02) # Max 24 months, so weight drops to ~0.52
                rhi_max += weight
                if char == '0':
                    rhi_points += weight
                elif char in '123456':
                    rhi_points += (weight * (1.0 - int(char)/10.0)) # partial points
                elif char == 'X':
                    pass # 0 points

        elif rec.record_type == RecordTypeEnum.DEFAULT:
            features["default_count"] += 1
            if rec.amount:
                features["default_amount"] += float(rec.amount)

        elif rec.record_type == RecordTypeEnum.SCI:
            features["sci_count"] += 1

        elif rec.record_type == RecordTypeEnum.BANKRUPTCY:
            features["bankruptcy_count"] += 1

    if rhi_max > 0:
        features["rhi_history_score"] = rhi_points / rhi_max

    months_old = (today - oldest_date).days // 30
    features["oldest_account_months"] = months_old

    # Enquiries
    ninety_days_ago = today - timedelta(days=90)
    enquiries_count = db.query(Enquiry).filter(
        Enquiry.entity_id == entity_id,
        Enquiry.created_at >= ninety_days_ago
    ).count()
    features["enquiries_last_90_days"] = enquiries_count

    return features

def _calculate_director_structural_risk(entity_id: str, db: Session, depth: int = 0) -> int:
    if depth > 1:
        return 0

    risk_score = 0
    # Find directors
    links = db.query(DirectorLink).filter(
        DirectorLink.company_entity_id == entity_id,
        DirectorLink.end_date.is_(None)
    ).all()

    for link in links:
        # Check individual's personal bankruptcies/defaults
        bad_events = db.query(CreditLedger).filter(
            CreditLedger.entity_id == link.individual_entity_id,
            CreditLedger.record_type.in_([RecordTypeEnum.BANKRUPTCY, RecordTypeEnum.DEFAULT]),
            CreditLedger.status == RecordStatusEnum.ACTIVE
        ).count()
        
        if bad_events > 0:
            risk_score += bad_events

        # Check other companies they direct
        other_companies = db.query(DirectorLink).filter(
            DirectorLink.individual_entity_id == link.individual_entity_id,
            DirectorLink.company_entity_id != entity_id,
            DirectorLink.end_date.is_(None)
        ).all()

        for oc in other_companies:
            # Recursive check bounded by depth 1 (i.e. only check 1 level deep)
            risk_score += _calculate_director_structural_risk(oc.company_entity_id, db, depth + 1)

    return risk_score

def calculate_company_features(entity_id: str, db: Session) -> dict:
    today = date.today()
    features = {
        "paydex_score": 100, # 1-100 index
        "total_exposure": 0.0,
        "public_record_count": 0,
        "oldest_account_months": 0,
        "enquiries_last_90_days": 0,
        "structural_risk_points": 0
    }

    records = db.query(CreditLedger).filter(
        CreditLedger.entity_id == entity_id,
        CreditLedger.status.in_([RecordStatusEnum.ACTIVE, RecordStatusEnum.PAID])
    ).all()

    oldest_date = today
    total_invoice_value = 0.0
    weighted_dbt_sum = 0.0

    for rec in records:
        if rec.valid_from < oldest_date:
            oldest_date = rec.valid_from

        if rec.record_type == RecordTypeEnum.TRADE_PAYMENT:
            amt = float(rec.amount) if rec.amount else 0.0
            dbt = rec.data.get("days_beyond_terms", 0)
            
            total_invoice_value += amt
            weighted_dbt_sum += (amt * dbt)
        
        elif rec.record_type in [RecordTypeEnum.DEFAULT, RecordTypeEnum.WRIT, RecordTypeEnum.BANKRUPTCY]:
            features["public_record_count"] += 1

    # Calculate PAYDEX (1-100)
    # 0 DBT = 100, >90 DBT = 0. Linear mapping for simplicity in this model
    if total_invoice_value > 0:
        avg_dbt = weighted_dbt_sum / total_invoice_value
        paydex = max(1, 100 - min(100, int(avg_dbt)))
        features["paydex_score"] = paydex

    months_old = (today - oldest_date).days // 30
    features["oldest_account_months"] = months_old

    # Enquiries
    ninety_days_ago = today - timedelta(days=90)
    enquiries_count = db.query(Enquiry).filter(
        Enquiry.entity_id == entity_id,
        Enquiry.created_at >= ninety_days_ago
    ).count()
    features["enquiries_last_90_days"] = enquiries_count

    # Structural risk
    features["structural_risk_points"] = _calculate_director_structural_risk(entity_id, db)

    return features

def update_feature_store(entity_id: str, db: Session):
    from app.models import FeatureStore
    entity = db.query(Entity).filter(Entity.id == entity_id).first()
    if not entity:
        return None
    
    if entity.type == EntityTypeEnum.INDIVIDUAL:
        features = calculate_individual_features(entity_id, db)
    else:
        features = calculate_company_features(entity_id, db)
        
    fs = db.query(FeatureStore).filter(FeatureStore.entity_id == entity_id).first()
    if not fs:
        fs = FeatureStore(entity_id=entity_id, features=features)
        db.add(fs)
    else:
        fs.features = features
        fs.last_updated = datetime.utcnow()
    
    db.commit()
    return fs
