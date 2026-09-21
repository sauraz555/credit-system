import os
import sys
from datetime import datetime, date, timedelta

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import init_db, SessionLocal
from app.models import (
    Entity, EntityTypeEnum, DirectorLink, CreditLedger,
    RecordTypeEnum, RecordStatusEnum, Score, ModelVersion, Dispute
)

def seed_featured():
    init_db()
    db = SessionLocal()

    # 1. Check or create model version
    mv = db.query(ModelVersion).filter(ModelVersion.name == "CCR Production Baseline v1.0").first()
    if not mv:
        mv = ModelVersion(
            type=EntityTypeEnum.INDIVIDUAL,
            name="CCR Production Baseline v1.0",
            weights={"rhi": 0.35, "utilization": 0.25, "history_length": 0.15, "defaults": 0.20, "inquiries": 0.05},
            band_thresholds={"Excellent": 800, "Very Good": 700, "Good": 600, "Fair": 500, "Poor": 0},
            active=True
        )
        db.add(mv)
        db.commit()

    # 2. Seed Jonathan Edward Vance (IND-8842-1994)
    vance = db.query(Entity).filter(Entity.identifier == "IND-8842-1994").first()
    if not vance:
        print("Seeding Jonathan Edward Vance...")
        vance = Entity(
            id="IND-8842-1994",
            type=EntityTypeEnum.INDIVIDUAL,
            identifier="IND-8842-1994",
            basic_info={
                "first_name": "Jonathan",
                "last_name": "Vance",
                "dob": "1984-06-14",
                "address": "42 Miller St, North Sydney NSW 2060",
                "phone": "+61 412 889 001",
                "drivers_license": "DL-9081249A"
            }
        )
        db.add(vance)
        db.commit()

        # Add Ledger: Accounts & RHI
        cba_rhi = CreditLedger(
            id="ACC-CBA-9921",
            entity_id=vance.id,
            record_type=RecordTypeEnum.RHI,
            data={"account_type": "Credit Card (Revolving)", "provider_name": "Commonwealth Bank", "rhi_24_months": "000100000000000000000000"},
            amount=20000.0,
            valid_from=date(2018, 3, 12),
            provider_id="PRV-CBA-001",
            status=RecordStatusEnum.ACTIVE
        )
        nab_rhi = CreditLedger(
            id="ACC-NAB-1002",
            entity_id=vance.id,
            record_type=RecordTypeEnum.RHI,
            data={"account_type": "Residential Mortgage (Term)", "provider_name": "National Australia Bank", "rhi_24_months": "000000000000000000000000"},
            amount=650000.0,
            valid_from=date(2015, 8, 20),
            provider_id="PRV-NAB-001",
            status=RecordStatusEnum.ACTIVE
        )
        mac_rhi = CreditLedger(
            id="ACC-MAC-4412",
            entity_id=vance.id,
            record_type=RecordTypeEnum.RHI,
            data={"account_type": "Auto Loan (Secured)", "provider_name": "Macquarie Leasing", "rhi_24_months": "000000100000000000000000"},
            amount=35000.0,
            valid_from=date(2021, 11, 4),
            provider_id="PRV-MAC-001",
            status=RecordStatusEnum.ACTIVE
        )
        # Default listing
        tel_def = CreditLedger(
            id="DEF-TEL-2024-881",
            entity_id=vance.id,
            record_type=RecordTypeEnum.DEFAULT,
            data={"reason": "Telecommunications default", "provider_name": "Telstra Corporation", "days_overdue": 72, "notice_given": True},
            amount=420.0,
            valid_from=date(2024, 2, 10),
            provider_id="PRV-TLS-001",
            status=RecordStatusEnum.DISPUTED
        )
        db.add_all([cba_rhi, nab_rhi, mac_rhi, tel_def])
        db.commit()

        # Score
        score = Score(
            entity_id=vance.id,
            model_version_id=mv.id,
            score_value=712,
            band="Good (Prime Tier 2)",
            sub_scores={
                "payment_history": 298,
                "credit_utilization": 218,
                "length_of_history": 128,
                "inquiries_penalties": 68
            },
            top_factors=[
                "Consistently clean repayment history across primary residential mortgage (+65 pts)",
                "Low revolving credit utilisation at 25.4% of $20k CBA limit (+42 pts)",
                "Adverse listing: $420 Telstra utility default under s20V active dispute (-48 pts)",
                "Mature credit bureau file age of 11.2 years (+35 pts)"
            ],
            calculated_at=datetime.utcnow()
        )
        db.add(score)
        db.commit()

        # Add initial Dispute
        disp = Dispute(
            id="DISP-2026-9041",
            ledger_record_id=tel_def.id,
            entity_id=vance.id,
            notes="Section 6Q / 21D Statutory Notices Not Received by subject prior to default listing",
            status="OPEN"
        )
        db.add(disp)
        db.commit()

    # 3. Seed Apex Industrial Holdings Pty Ltd (ACN-109-283-912)
    apex = db.query(Entity).filter(Entity.identifier == "ACN-109-283-912").first()
    if not apex:
        print("Seeding Apex Industrial Holdings...")
        apex = Entity(
            id="ACN-109-283-912",
            type=EntityTypeEnum.COMPANY,
            identifier="ACN-109-283-912",
            basic_info={
                "company_name": "Apex Industrial Holdings Pty Ltd",
                "acn": "109-283-912",
                "abn": "48 109 283 912",
                "industry": "Heavy Machinery & Industrial Equipment Wholesaling (ANZSIC 3411)",
                "registration_date": "2004-05-18",
                "address": "Level 14, 201 Kent St, Sydney NSW 2000"
            }
        )
        db.add(apex)
        db.commit()

        # Trade payments
        tp1 = CreditLedger(
            id="TRADE-SUP-901",
            entity_id=apex.id,
            record_type=RecordTypeEnum.TRADE_PAYMENT,
            data={"supplier_name": "Australian Steel Mills Ltd", "terms": "30 Days Net", "days_beyond_terms": 2},
            amount=42300.0,
            valid_from=date(2026, 8, 1),
            provider_id="TRADE_SUP_901",
            status=RecordStatusEnum.ACTIVE
        )
        tp2 = CreditLedger(
            id="TRADE-SUP-118",
            entity_id=apex.id,
            record_type=RecordTypeEnum.TRADE_PAYMENT,
            data={"supplier_name": "National Fleet Leasing", "terms": "30 Days Net", "days_beyond_terms": 14},
            amount=24500.0,
            valid_from=date(2026, 7, 15),
            provider_id="TRADE_SUP_118",
            status=RecordStatusEnum.DISPUTED
        )
        db.add_all([tp1, tp2])
        db.commit()

        # Score
        comp_score = Score(
            entity_id=apex.id,
            model_version_id=mv.id,
            score_value=78,
            band="Prompt / Within Terms",
            sub_scores={
                "paydex": 78,
                "liquidity_ratio": 82,
                "structural_risk_penalty": 0,
                "public_record_penalty": 0
            },
            top_factors=[
                "Trade accounts paid average 4 days beyond terms (Low promptness risk)",
                "Strong commercial longevity: 22 years active registration with ASIC",
                "Clean court writ & judgment record: zero filings in past 5 years"
            ],
            calculated_at=datetime.utcnow()
        )
        db.add(comp_score)
        db.commit()

        # Link director Marcus Sterling
        marcus = db.query(Entity).filter(Entity.identifier == "IND-DIR-MARCUS").first()
        if not marcus:
            marcus = Entity(
                id="IND-DIR-MARCUS",
                type=EntityTypeEnum.INDIVIDUAL,
                identifier="IND-DIR-MARCUS",
                basic_info={"first_name": "Marcus", "last_name": "Sterling", "dob": "1972-11-20", "address": "Mosman NSW 2088"}
            )
            db.add(marcus)
            db.commit()

        link = DirectorLink(
            company_entity_id=apex.id,
            individual_entity_id=marcus.id,
            role="Managing Director & CEO",
            start_date=date(2004, 5, 18)
        )
        db.add(link)
        db.commit()

    print("Featured entities seeded successfully!")
    db.close()

if __name__ == "__main__":
    seed_featured()
