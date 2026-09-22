"""Synthetic Credit Bureau Population and Seeding Utility.

This script populates development databases with realistic Australian credit subjects,
including 500 consumer individuals (with simulated 24-month RHI strings and payment defaults),
100 commercial companies (with trade payment invoices and director linkages), and corporate
cross-directorship networks. It enforces an environment guardrail preventing execution outside development.

Architecture Tier:
    Database Seeding & Test Data (`backend/scripts/`).
"""

import os
import sys
import random
from datetime import datetime, date, timedelta
from faker import Faker

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# REVIEW-SECURITY: Enforce environment guardrail preventing accidental execution against production
if os.getenv("ENVIRONMENT") != "development":
    raise RuntimeError(
        "CRMS Data Hygiene Guardrail Violation: Seed script execution rejected! "
        "ENVIRONMENT environment variable must be strictly set to 'development'."
    )

from app.database import SessionLocal
from app.models import (
    Entity, EntityTypeEnum, DirectorLink, CreditLedger, 
    RecordTypeEnum, RecordStatusEnum
)

fake = Faker('en_AU') # Australian locale


def generate_rhi_code():
    """Generates a random RHI character code conforming to Australian CR Code standards."""
    # 0 = OK, 1-6 = Late, X = Missed
    codes = ["0", "0", "0", "0", "0", "1", "2", "3", "4", "5", "6", "X"]
    return random.choice(codes)


def seed():
    """Seeds the database with 500 individuals, 100 companies, director links, and ledger records."""
    # REVIEW-BUG: init_db() is called below without an import from app.database (raises NameError if run)
    init_db()
    db = SessionLocal()
    
    # Generate 500 individuals
    print("Generating individuals...")
    individuals = []
    for _ in range(500):
        ind = Entity(
            type=EntityTypeEnum.INDIVIDUAL,
            identifier=str(fake.unique.random_number(digits=9, fix_len=True)),
            basic_info={
                "first_name": fake.first_name(),
                "last_name": fake.last_name(),
                "dob": str(fake.date_of_birth(minimum_age=18, maximum_age=80)),
                "address": fake.address()
            }
        )
        individuals.append(ind)
        db.add(ind)
        
    # Generate 100 companies
    print("Generating companies...")
    companies = []
    for _ in range(100):
        comp = Entity(
            type=EntityTypeEnum.COMPANY,
            identifier=str(fake.unique.random_number(digits=11, fix_len=True)), # ABN length
            basic_info={
                "company_name": fake.company(),
                "registration_date": str(fake.date_between(start_date="-20y", end_date="-1y")),
                "address": fake.address()
            }
        )
        companies.append(comp)
        db.add(comp)
        
    db.commit()
    
    # Assign directors
    print("Linking directors...")
    for comp in companies:
        # 1 to 3 directors per company
        num_directors = random.randint(1, 3)
        directors = random.sample(individuals, num_directors)
        for d in directors:
            link = DirectorLink(
                company_entity_id=comp.id,
                individual_entity_id=d.id,
                role="DIRECTOR",
                start_date=fake.date_between(start_date="-5y", end_date="-1y")
            )
            db.add(link)
    db.commit()
    
    print("Generating ledger records...")
    today = date.today()
    
    # RHI for individuals
    for ind in individuals:
        # 80% have some credit history
        if random.random() < 0.8:
            start_date = today - timedelta(days=random.randint(100, 700))
            # Create a base account open event (simulated as Enquiry for simplicity, or we can just inject RHI)
            # We'll just write 24 months of RHI
            rhi_string = "".join([generate_rhi_code() for _ in range(24)])
            
            ledger = CreditLedger(
                entity_id=ind.id,
                record_type=RecordTypeEnum.RHI,
                data={"account_type": "CREDIT_CARD", "rhi_24_months": rhi_string},
                amount=random.randint(1000, 20000),
                valid_from=start_date,
                provider_id="TEST_BANK"
            )
            db.add(ledger)
            
        # 10% have defaults
        if random.random() < 0.1:
            ledger = CreditLedger(
                entity_id=ind.id,
                record_type=RecordTypeEnum.DEFAULT,
                data={"reason": "Non payment"},
                amount=random.randint(150, 5000),
                valid_from=today - timedelta(days=random.randint(30, 1000)),
                provider_id="TEST_BANK",
                status=random.choice([RecordStatusEnum.ACTIVE, RecordStatusEnum.PAID])
            )
            db.add(ledger)

    # Trade payments for companies
    for comp in companies:
        if random.random() < 0.9:
            ledger = CreditLedger(
                entity_id=comp.id,
                record_type=RecordTypeEnum.TRADE_PAYMENT,
                data={"days_beyond_terms": random.randint(0, 90)},
                amount=random.randint(500, 50000),
                valid_from=today - timedelta(days=random.randint(10, 300)),
                provider_id="TRADE_SUPPLIER"
            )
            db.add(ledger)
            
        # 5% have company defaults
        if random.random() < 0.05:
            ledger = CreditLedger(
                entity_id=comp.id,
                record_type=RecordTypeEnum.DEFAULT,
                data={"reason": "Unpaid invoice"},
                amount=random.randint(1000, 100000),
                valid_from=today - timedelta(days=random.randint(30, 800)),
                provider_id="TRADE_SUPPLIER"
            )
            db.add(ledger)
            
    db.commit()
    print("Seeding complete.")


if __name__ == "__main__":
    seed()
