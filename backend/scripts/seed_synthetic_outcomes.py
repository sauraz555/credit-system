import os
import sys
import csv
import random
from datetime import date, timedelta

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import init_db, SessionLocal
from app.models import Entity, EntityTypeEnum
from app.services.features import calculate_individual_features, calculate_company_features
from app.services.scoring import evaluate_individual_score, evaluate_company_score

def generate_synthetic_outcomes():
    init_db()
    db = SessionLocal()
    
    entities = db.query(Entity).limit(200).all()
    out_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "synthetic_outcomes.csv")
    
    print(f"Found {len(entities)} entities. Generating outcomes...")
    
    rows = []
    random.seed(42)
    obs_date = date(2024, 6, 1)
    outcome_date = date(2025, 6, 1)
    
    for ent in entities:
        # Evaluate credit score to generate realistic ground truth outcomes
        if ent.type == EntityTypeEnum.INDIVIDUAL:
            feat = calculate_individual_features(ent.id, db, as_of=obs_date)
            class ModelStub:
                id = "baseline"
                name = "Baseline"
                weights = {}
            res = evaluate_individual_score(ent.id, feat, ModelStub())
        else:
            feat = calculate_company_features(ent.id, db, as_of=obs_date)
            class ModelStub:
                id = "baseline"
                name = "Baseline"
                weights = {}
            res = evaluate_company_score(ent.id, feat, ModelStub())
            
        score = res["score"]
        # Probability of default decreases sharply as score increases
        pd = max(0.01, min(0.95, 1.0 - (score / 1000.0) ** 1.8))
        defaulted = 1 if random.random() < pd else 0
        
        rows.append({
            "entity_id": ent.id,
            "outcome_date": str(outcome_date),
            "defaulted": defaulted
        })
        
    db.close()
    
    with open(out_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["entity_id", "outcome_date", "defaulted"])
        writer.writeheader()
        writer.writerows(rows)
        
    print(f"Wrote {len(rows)} outcomes to {out_file}")

if __name__ == "__main__":
    generate_synthetic_outcomes()
