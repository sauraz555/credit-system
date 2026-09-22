"""Featured Entity Seeding Script for Nepal Credit Reporting Mechanism Demonstrations.

This script populates high-fidelity benchmark consumer and corporate profiles under Nepal regulatory framework:
1. Ram Kumar Shrestha (`CIT-27-01-78-04821`): Consumer with:
   - NEA electricity utility payment history (Consumer #012.14.882, New Baneshwor)
   - Nepal Telecom (NTC) FTTH & mobile communication utility history
   - Nabil Bank Ltd housing loan repayment history
   - Verified Inland Revenue Department (IRD) PAN tax compliance record
   - New Baneshwor verified residential tenancy agreement record
   - Disputed KUKL water utility charge under Section 12 of Nepal Individual Privacy Act 2018
   - Secondary National ID: `108-294-8172`
2. Apex Engineering & Infrastructure Solutions Pvt. Ltd. (`PAN-601283912`): Commercial infrastructure
   and engineering contractor in Pulchowk, Lalitpur with trade payment records, VAT registration,
   Office of Company Registrar (OCR) registration `142958/075/076`, and linked director Sita Sharma.

Architecture Tier:
    Test Data & Demonstrations Layer (`backend/scripts/`).

Regulatory Framework:
    Nepal Individual Privacy Act 2018 (वैयक्तिक गोपनीयता सम्बन्धी ऐन, २०७५) and Nepal Rastra Bank (NRB)
    Credit Information Directives.
"""

import os
import sys
from datetime import datetime, date, timedelta

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import init_db, SessionLocal
from app.models import (
    Entity, EntityTypeEnum, DirectorLink, CreditLedger,
    RecordTypeEnum, RecordStatusEnum, Score, ModelVersion, Dispute, Provider
)
from app.encryption import encrypt_field, compute_blind_index


def seed_featured():
    """Seeds rich, realistic Nepal featured entities and associated ledger records for live demo."""
    init_db()
    db = SessionLocal()

    # 0. Seed Nepal Licensed Providers
    providers_data = [
        {"id": "PRV-NABIL-001", "name": "Nabil Bank Limited", "licence_type": "CLASS_A_BFI", "is_active": True},
        {"id": "PRV-SANIMA-001", "name": "Sanima Bank Limited", "licence_type": "CLASS_A_BFI", "is_active": True},
        {"id": "PRV-MUKTI-001", "name": "Muktinath Bikas Bank Limited", "licence_type": "CLASS_B_BFI", "is_active": True},
        {"id": "PRV-NEA-001", "name": "Nepal Electricity Authority (NEA)", "licence_type": "UTILITY_NEA", "is_active": True},
        {"id": "PRV-KUKL-001", "name": "Kathmandu Upatyaka Khanepani Limited (KUKL)", "licence_type": "UTILITY_WATER", "is_active": True},
        {"id": "PRV-NTC-001", "name": "Nepal Telecom (NTC)", "licence_type": "TELECOM_PROVIDER", "is_active": True},
        {"id": "PRV-NCELL-001", "name": "Ncell Axiata Limited", "licence_type": "TELECOM_PROVIDER", "is_active": True},
        {"id": "PRV-NRB-CIC-001", "name": "Credit Information Centre (CIC) / Karza Suchana Kendra", "licence_type": "NRB_BLACKLIST", "is_active": True},
    ]
    for p_info in providers_data:
        existing_p = db.query(Provider).filter(Provider.id == p_info["id"]).first()
        if not existing_p:
            new_p = Provider(
                id=p_info["id"],
                name=p_info["name"],
                licence_type=p_info["licence_type"],
                is_active=p_info["is_active"],
                created_at=datetime.utcnow()
            )
            db.add(new_p)
    db.commit()

    # 1. Seed Nepal National Credit Scoring Model v1.0
    # Individual weights must total 100%:
    # - Utility payment history: 35% (0.35)
    # - Blacklist / adverse records: 25% (0.25)
    # - Income stability: 20% (0.20)
    # - Business / tax compliance: 12% (0.12)
    # - Rental payment history: 8% (0.08)
    mv = db.query(ModelVersion).filter(ModelVersion.name == "Nepal National Credit Scoring Model v1.0").first()
    if not mv:
        mv = ModelVersion(
            type=EntityTypeEnum.INDIVIDUAL,
            name="Nepal National Credit Scoring Model v1.0",
            weights={
                "utility_payment_history": 0.35,
                "blacklist_adverse_records": 0.25,
                "income_stability": 0.20,
                "tax_compliance": 0.12,
                "rental_payment_history": 0.08
            },
            band_thresholds={
                "उत्कृष्ट (Excellent)": 800,
                "धेरै राम्रो (Very Good)": 700,
                "राम्रो (Good)": 600,
                "मध्यम (Fair)": 500,
                "कमजोर (Poor)": 0
            },
            active=True
        )
        db.add(mv)
        db.commit()

    # 2. Seed Ram Kumar Shrestha (CIT-27-01-78-04821)
    ram_id = "CIT-27-01-78-04821"
    ram = db.query(Entity).filter(Entity.id == ram_id).first()
    if not ram:
        print("Seeding Ram Kumar Shrestha (CIT-27-01-78-04821)...")
        ram = Entity(
            id=ram_id,
            type=EntityTypeEnum.INDIVIDUAL,
            identifier=encrypt_field(ram_id),
            identifier_blind_index=compute_blind_index(ram_id),
            basic_info={
                "first_name": "राम कुमार (Ram Kumar)",
                "last_name": "श्रेष्ठ (Shrestha)",
                "citizenship_no": "२७-०१-७८-०४८२१ (27-01-78-04821)",
                "national_id": "१०८-२९४-८१७२ (108-294-8172)",
                "pan_number": "301982741",
                "dob_bs": "२०४१-०२-१५",
                "dob_ad": "1984-05-28",
                "dob": "1984-05-28",
                "district": "काठमाडौँ (Kathmandu)",
                "municipality": "काठमाडौँ महानगरपालिका वडा नं १० (Kathmandu Metropolitian Ward 10)",
                "address": "नयाँ बानेश्वर, काठमाडौँ (New Baneshwor, Kathmandu, Bagmati Province)",
                "phone": "+977 9851082914"
            }
        )
        db.add(ram)
        db.commit()

        # Backward compatibility alias for IND-8842-1994 pointing to Ram Kumar Shrestha
        legacy_vance = db.query(Entity).filter(Entity.id == "IND-8842-1994").first()
        if not legacy_vance:
            legacy_vance = Entity(
                id="IND-8842-1994",
                type=EntityTypeEnum.INDIVIDUAL,
                identifier=encrypt_field("IND-8842-1994"),
                identifier_blind_index=compute_blind_index("IND-8842-1994"),
                basic_info=ram.basic_info
            )
            db.add(legacy_vance)
            db.commit()

        # Add Ledger Records:
        # Pillar 1: Utility Payment History (35%)
        nea_util = CreditLedger(
            id="ACC-NEA-8821",
            entity_id=ram.id,
            record_type=RecordTypeEnum.UTILITY,
            data={
                "utility_type": "Electricity (विद्युत् सेवा)",
                "provider_name": "Nepal Electricity Authority (नेपाल विद्युत् प्राधिकरण)",
                "consumer_no": "012.14.882",
                "counter": "Baneshwor Distribution Centre",
                "monthly_average_npr": 4500.0,
                "history_24_months": "000000000000000000000000",
                "timely_payment_rate": "100%"
            },
            amount=4500.0,
            valid_from=date(2019, 4, 1),
            provider_id="PRV-NEA-001",
            status=RecordStatusEnum.ACTIVE
        )

        ntc_util = CreditLedger(
            id="ACC-NTC-4412",
            entity_id=ram.id,
            record_type=RecordTypeEnum.UTILITY,
            data={
                "utility_type": "Telecommunications (दूरसञ्चार तथा फाइबर सेवा)",
                "provider_name": "Nepal Telecom (नेपाल टेलिकम)",
                "service_number": "01-4489124",
                "plan": "FTTH Unlimited Premium 100Mbps",
                "monthly_average_npr": 2200.0,
                "history_24_months": "000000000000000000000000",
                "timely_payment_rate": "100%"
            },
            amount=2200.0,
            valid_from=date(2020, 7, 15),
            provider_id="PRV-NTC-001",
            status=RecordStatusEnum.ACTIVE
        )

        # BFI Loan & Repayment History
        nabil_loan = CreditLedger(
            id="ACC-NABIL-9012",
            entity_id=ram.id,
            record_type=RecordTypeEnum.RHI,
            data={
                "account_type": "Residential Housing Loan (आवासीय घर कर्जा)",
                "provider_name": "Nabil Bank Limited (नबिल बैंक लिमिटेड)",
                "loan_account_no": "NBL-HL-082914-01",
                "interest_base_rate": "NRB Base Rate + 1.85%",
                "rhi_24_months": "000000000000000000000000",
                "facility_limit_npr": 4500000.0,
                "current_outstanding_npr": 3280000.0
            },
            amount=4500000.0,
            valid_from=date(2021, 9, 1),
            provider_id="PRV-NABIL-001",
            status=RecordStatusEnum.ACTIVE
        )

        # Pillar 4: Tax Compliance (12%)
        tax_rec = CreditLedger(
            id="REC-IRD-TAX-2080",
            entity_id=ram.id,
            record_type=RecordTypeEnum.TAX_COMPLIANCE,
            data={
                "authority": "Inland Revenue Department (आन्तरिक राजस्व विभाग - IRD)",
                "pan_number": "301982741",
                "filing_status": "D-01 Income Tax Returns Verified",
                "tax_clearance_certificate": "TCC-2080/81-KTM-9142",
                "fiscal_years_compliant": ["2078/79", "2079/80", "2080/81"],
                "annual_assessed_income_npr": 1850000.0
            },
            amount=1850000.0,
            valid_from=date(2021, 7, 16),
            provider_id="PRV-NRB-CIC-001",
            status=RecordStatusEnum.ACTIVE
        )

        # Pillar 5: Rental Payment History (8%)
        rental_rec = CreditLedger(
            id="REC-RENTAL-KTM-01",
            entity_id=ram.id,
            record_type=RecordTypeEnum.RENTAL,
            data={
                "tenancy_type": "Registered Residential Tenancy (घरबहाल सम्झौता)",
                "ward_office": "Kathmandu Metropolitian City Ward 10",
                "monthly_rent_npr": 32000.0,
                "verified_payment_months": 24,
                "digital_payment_channel": "ConnectIPS / Nabil Mobile Banking",
                "timely_payment_ratio": "100%"
            },
            amount=32000.0,
            valid_from=date(2022, 1, 1),
            provider_id="PRV-NABIL-001",
            status=RecordStatusEnum.ACTIVE
        )

        # Pillar 2: Adverse / Disputed Record (Water Utility - KUKL)
        kukl_dispute = CreditLedger(
            id="DEF-KUKL-2024-881",
            entity_id=ram.id,
            record_type=RecordTypeEnum.DEFAULT,
            data={
                "reason": "Pipeline water supply billing variance under technical investigation",
                "provider_name": "Kathmandu Upatyaka Khanepani Limited (KUKL)",
                "consumer_no": "KUKL-KTM-04821",
                "days_overdue": 45,
                "notice_given": True,
                "section_reference": "Section 12 of Nepal Individual Privacy Act 2018 (वैयक्तिक गोपनीयता सम्बन्धी ऐन, २०७५)"
            },
            amount=12500.0,
            valid_from=date(2024, 2, 10),
            provider_id="PRV-KUKL-001",
            status=RecordStatusEnum.DISPUTED
        )

        db.add_all([nea_util, ntc_util, nabil_loan, tax_rec, rental_rec, kukl_dispute])
        db.commit()

        # Score with 5 Nepal Pillars:
        # Utility (35%), Blacklist (25%), Income (20%), Tax (12%), Rental (8%)
        score = Score(
            entity_id=ram.id,
            model_version_id=mv.id,
            score_value=768,
            band="धेरै राम्रो (Very Good - Prime Tier 1)",
            sub_scores={
                "utility_payment_history": 335,
                "blacklist_adverse_records": 210,
                "income_stability": 182,
                "tax_compliance": 115,
                "rental_payment_history": 76
            },
            top_factors=[
                "नेपाल विद्युत् प्राधिकरण (NEA) तथा दूरसञ्चारको २४ महिने नियमित भुक्तानी अभिलेख (+68 अंक)",
                "नबिल बैंक आवास कर्जाको नियमित किस्ता भुक्तानी अभिलेख (+54 अंक)",
                "आन्तरिक राजस्व विभाग (IRD) कर चुक्ता प्रमाणपत्र २०८०/८१ प्रमाणित (+38 अंक)",
                "खानेपानी (KUKL) सम्बन्धी रु १२,५०० को दाबी वैयक्तिक गोपनीयता ऐन २०७५ को दफा १२ बमोजिम पुनरावलोकनमा (-22 अंक)"
            ],
            calculated_at=datetime.utcnow()
        )
        db.add(score)
        db.commit()

        # Seed open dispute under Nepal Individual Privacy Act 2018 Section 12
        disp = Dispute(
            id="DISP-NP-2081-01",
            ledger_record_id=kukl_dispute.id,
            entity_id=ram.id,
            notes="वैयक्तिक गोपनीयता सम्बन्धी ऐन, २०७५ को दफा १२ बमोजिम खानेपानी मिटर बिग्रेको कारण आएको बिल सच्याउन निवेदन पेश गरिएको (Section 12 dispute for meter variance rectification)",
            status="OPEN"
        )
        db.add(disp)
        db.commit()

    # 3. Seed Apex Engineering & Infrastructure Solutions Pvt. Ltd. (PAN-601283912)
    apex_id = "PAN-601283912"
    apex = db.query(Entity).filter(Entity.id == apex_id).first()
    if not apex:
        print("Seeding Apex Engineering & Infrastructure Solutions Pvt. Ltd. (PAN-601283912)...")
        apex = Entity(
            id=apex_id,
            type=EntityTypeEnum.COMPANY,
            identifier=encrypt_field(apex_id),
            identifier_blind_index=compute_blind_index(apex_id),
            basic_info={
                "company_name": "Apex Engineering & Infrastructure Solutions Pvt. Ltd.",
                "company_name_ne": "एपिक्स इन्जिनियरिङ्ग एण्ड इन्फ्रास्ट्रक्चर सोलुसन्स प्रा. लि.",
                "pan": "601283912",
                "vat_number": "601283912",
                "ocr_registration_number": "142958/075/076",
                "industry": "Civil Engineering, Bridge & Hydropower Infrastructure Solutions",
                "registration_date": "2018-08-15",
                "district": "ललितपुर (Lalitpur)",
                "municipality": "ललितपुर महानगरपालिका वडा नं ३ (Lalitpur Metropolitian Ward 3)",
                "address": "पुल्चोक, ललितपुर (Pulchowk, Lalitpur, Bagmati Province, Nepal)",
                "phone": "+977 1 5529184",
                "email": "info@apexengineering.com.np"
            }
        )
        db.add(apex)
        db.commit()

        # Legacy alias for ACN-109-283-912
        legacy_apex = db.query(Entity).filter(Entity.id == "ACN-109-283-912").first()
        if not legacy_apex:
            legacy_apex = Entity(
                id="ACN-109-283-912",
                type=EntityTypeEnum.COMPANY,
                identifier=encrypt_field("ACN-109-283-912"),
                identifier_blind_index=compute_blind_index("ACN-109-283-912"),
                basic_info=apex.basic_info
            )
            db.add(legacy_apex)
            db.commit()

        # Trade payments with Nepali suppliers
        tp1 = CreditLedger(
            id="TRADE-SUP-HIMSTEEL",
            entity_id=apex.id,
            record_type=RecordTypeEnum.TRADE_PAYMENT,
            data={
                "supplier_name": "Himsteel Industries Limited (हिमसिट्ल इन्डस्ट्रिज लि.)",
                "terms": "30 Days Net (३० दिन भुक्तानी अवधि)",
                "days_beyond_terms": 2,
                "pan": "300182941"
            },
            amount=1850000.0,
            valid_from=date(2026, 8, 1),
            provider_id="TRADE-SUP-HIMSTEEL",
            status=RecordStatusEnum.ACTIVE
        )
        tp2 = CreditLedger(
            id="TRADE-SUP-SHIVAM",
            entity_id=apex.id,
            record_type=RecordTypeEnum.TRADE_PAYMENT,
            data={
                "supplier_name": "Shivam Cements Limited (शिवम सिमेन्ट लि.)",
                "terms": "30 Days Net (३० दिन भुक्तानी अवधि)",
                "days_beyond_terms": 5,
                "pan": "301829148"
            },
            amount=920000.0,
            valid_from=date(2026, 7, 15),
            provider_id="TRADE-SUP-SHIVAM",
            status=RecordStatusEnum.ACTIVE
        )
        db.add_all([tp1, tp2])
        db.commit()

        # Score for commercial company
        comp_score = Score(
            entity_id=apex.id,
            model_version_id=mv.id,
            score_value=82,
            band="समयमै भुक्तानी (Prompt / Low Risk)",
            sub_scores={
                "trade_promptness": 84,
                "banking_standing": 82,
                "tax_compliance": 88,
                "legal_standing": 80
            },
            top_factors=[
                "सप्लायरहरूलाई औसत २ दिनभित्र समयमै भुक्तानी (Supplier payments prompt within 2 days)",
                "कम्पनी रजिस्ट्रारको कार्यालय (OCR) तथा आन्तरिक राजस्व विभाग (IRD) कर चुक्ता अद्यावधिक",
                "नेपाल राष्ट्र बैंक (NRB) वा कर्जा सूचना केन्द्र (CIC) को कालोसूचीमा कुनै विवरण नरहेको"
            ],
            calculated_at=datetime.utcnow()
        )
        db.add(comp_score)
        db.commit()

        # Link Director Sita Sharma
        sita_id = "IND-DIR-SITA"
        sita = db.query(Entity).filter(Entity.id == sita_id).first()
        if not sita:
            sita = Entity(
                id=sita_id,
                type=EntityTypeEnum.INDIVIDUAL,
                identifier=encrypt_field("CIT-28-02-75-01928"),
                identifier_blind_index=compute_blind_index("CIT-28-02-75-01928"),
                basic_info={
                    "first_name": "सीता (Sita)",
                    "last_name": "शर्मा (Sharma)",
                    "citizenship_no": "२८-०२-७५-०१९२८ (28-02-75-01928)",
                    "dob": "1978-03-22",
                    "district": "ललितपुर (Lalitpur)",
                    "address": "झम्सिखेल, ललितपुर (Jhamsikhel, Lalitpur)"
                }
            )
            db.add(sita)
            db.commit()

        link = DirectorLink(
            company_entity_id=apex.id,
            individual_entity_id=sita.id,
            role="प्रबन्ध निर्देशक तथा प्रमुख कार्यकारी अधिकृत (Managing Director & CEO)",
            start_date=date(2018, 8, 15)
        )
        db.add(link)
        db.commit()

    print("Nepal featured entities, providers, and scoring models seeded successfully!")
    db.close()


if __name__ == "__main__":
    seed_featured()
