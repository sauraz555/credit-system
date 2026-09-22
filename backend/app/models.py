"""SQLAlchemy ORM Data Models for the Credit Reporting Mechanism Platform.

This module defines the relational database schema and persistence models across the
entire credit reporting lifecycle, including user authentication, credit provider licensing,
legal entity representation, bitemporal credit ledgering, feature storage, model governance,
scoring outputs, credit enquiry tracking, statutory disputes, and immutable audit logs.

Architecture Tier:
    Data Layer / ORM (SQLAlchemy Declarative Models).

Key Dependencies & Callers:
    - Depends on SQLAlchemy 2.x declarative mapping.
    - Consumed by `backend/app/database.py` (engine & sessions), all API routers (`admin`,
      `auth_router`, `disputes`, `ingest`, `reports`), background tasks (`tasks.py`),
      and analytical services (`scoring.py`, `features.py`).

Regulatory & Compliance Context:
    - Privacy Act 1988 (Cth) Part IIIA & Privacy (Credit Reporting) Code 2014:
      Enforces data classification (RHI, Default, SCI), provider licensing eligibility,
      statutory dispute handling (Section 20V), and retention limits.
"""

import enum
import uuid
from datetime import datetime, date
from typing import Optional, List, Dict, Any

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Date, ForeignKey, 
    Enum, JSON, Numeric, text
)
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB

# If not using Postgres, we fallback to standard types in SQLAlchemy
# but we'll try to use standard types that map well.

Base = declarative_base()


class RoleEnum(str, enum.Enum):
    """User access roles governing Role-Based Access Control (RBAC).

    Attributes:
        ADMIN: System administrator with model activation and tenant management permissions.
        PROVIDER: Credit provider representative permitted to ingest data and query scores.
        ANALYST: Credit risk analyst with dispute adjudication and backtesting permissions.
        SUBJECT: Consumer or commercial entity with self-file access and statutory dispute rights.
    """
    ADMIN = "ADMIN"
    PROVIDER = "PROVIDER"
    ANALYST = "ANALYST"
    SUBJECT = "SUBJECT"


class EntityTypeEnum(str, enum.Enum):
    """Classification of credit subjects under Australian credit law.

    Attributes:
        INDIVIDUAL: Natural person subject to Privacy Act 1988 (Cth) Part IIIA consumer rules.
        COMPANY: Incorporated body subject to commercial credit reporting and director linkage.
    """
    INDIVIDUAL = "INDIVIDUAL"
    COMPANY = "COMPANY"


class RecordTypeEnum(str, enum.Enum):
    """Statutory credit record classifications under Privacy Act 1988 Part IIIA.

    Attributes:
        RHI: Repayment History Information (24-month rolling payment statuses 0-6).
        DEFAULT: Payment default (overdue >= $150 and >= 60 days).
        SCI: Serious Credit Infringement (fraud or intentional credit evasion).
        WRIT: Court writs and legal summons.
        BANKRUPTCY: Insolvency, Part IX debt agreements, and Part X arrangements.
        HARDSHIP: Financial hardship arrangement information (Codes A and V under Section 6QA).
        ENQUIRY: Credit application enquiry recorded by a participating credit provider.
        TRADE_PAYMENT: Commercial trade invoice settlement record (PAYDEX calculation).
    """
    RHI = "RHI"
    DEFAULT = "DEFAULT"
    SCI = "SCI"
    WRIT = "WRIT"
    BANKRUPTCY = "BANKRUPTCY"
    HARDSHIP = "HARDSHIP"
    ENQUIRY = "ENQUIRY"
    TRADE_PAYMENT = "TRADE_PAYMENT"


class RecordStatusEnum(str, enum.Enum):
    """Lifecycle states of ledger records for audit and compliance tracking.

    Attributes:
        ACTIVE: Currently valid credit information considered in score feature extraction.
        EXPIRED: Past the statutory retention limit (e.g. 2 yrs for RHI, 5 yrs for defaults).
        DISPUTED: Subject has lodged a Section 20V dispute; temporarily flagged.
        PAID: Default or judgment satisfied by the borrower.
        RESOLVED: SCI resolved, triggering statutory reversion from 7-year to 5-year retention.
    """
    ACTIVE = "ACTIVE"
    EXPIRED = "EXPIRED"
    DISPUTED = "DISPUTED"
    PAID = "PAID"
    RESOLVED = "RESOLVED"


class User(Base):
    """User account entity supporting RBAC, MFA, and tenant isolation.

    Attributes:
        id: Primary key UUID string.
        email: Unique user email address (must be @example.com in test/seed data).
        password_hash: Argon2id cryptographic password hash.
        role: RBAC role determining route and resource permissions.
        tenant_id: Organization identifier for credit providers (e.g., 'PRV-CBA-001').
        entity_id: Linked Entity.id for SUBJECT accounts to enforce self-file isolation.
        totp_secret: Encrypted base32 TOTP secret for RFC 6238 two-factor authentication.
        mfa_enabled: Flag indicating whether MFA is mandatory for this account.
        created_at: UTC timestamp when the user account was provisioned.
    """
    __tablename__ = "users"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, index=True, nullable=False)
    # REVIEW-SECURITY: Passwords hashed with Argon2id; never stored in plaintext.
    password_hash = Column(String, nullable=False)
    role = Column(Enum(RoleEnum), default=RoleEnum.SUBJECT, nullable=False)
    # Tenant isolation identifier for credit providers to prevent cross-organization leakage
    tenant_id = Column(String, nullable=True) # For providers (e.g. PRV-NAB-001)
    # Subject isolation identifier: ensures consumer accounts cannot inspect foreign files
    entity_id = Column(String, nullable=True) # For subjects (e.g. links to Entity.id)
    # REVIEW-SECURITY: TOTP secret must be kept confidential and validated before token issuance
    totp_secret = Column(String, nullable=True)
    mfa_enabled = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Provider(Base):
    """Licensed Credit Provider entity recording regulatory permissions.

    Under Privacy Act 1988 Part IIIA, only eligible credit providers (such as ADIs
    or ACL holders) are permitted to submit and access Repayment History Information (RHI).

    Attributes:
        id: Unique provider code (e.g., 'PRV-CBA-001').
        name: Commercial institution name.
        licence_type: Regulatory license class (ADI, ACL, TELECOM, UTILITY, COMMERCIAL).
        permitted_data_types: List of permitted RecordTypeEnum strings for ingestion.
        is_active: Whether the provider's bureau ingestion access is currently authorized.
        created_at: Timestamp of provider registration.
    """
    __tablename__ = "providers"
    
    id = Column(String, primary_key=True) # e.g. PRV-CBA-001
    name = Column(String, nullable=False)
    # REVIEW-LEGAL: Licence type governs RHI eligibility under Privacy Act 1988 s20E.
    licence_type = Column(String, nullable=False) # e.g. ADI, ACL, TELECOM, UTILITY, COMMERCIAL
    permitted_data_types = Column(JSON, default=list) # e.g. ["RHI", "DEFAULT", "ENQUIRY"]
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Entity(Base):
    """Credit subject profile representing an individual consumer or commercial company.

    Sensitive government identifiers (ABN, ACN, Driver License) are protected via
    AES-256-GCM field-level encryption. Exact searches are performed using an HMAC-SHA256
    blind index to avoid plaintext query patterns.

    Attributes:
        id: Primary key UUID string.
        type: Classification (INDIVIDUAL or COMPANY).
        identifier: Ciphertext (AES-256-GCM) storing the government identifier.
        identifier_blind_index: HMAC-SHA256 deterministic hash for indexed exact lookup.
        basic_info: Encrypted or masked demographic metadata (Name, DOB, Address).
        created_at: Timestamp of subject file creation.
        ledger_records: Associated credit ledger history entries.
        scores: Historical and current credit score calculations.
        enquiries: Bureau access log of commercial enquiries against this file.
    """
    __tablename__ = "entities"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    type = Column(Enum(EntityTypeEnum), nullable=False)
    # Encrypted identifier (ABN/ACN for company, Driver License/Passport for individual)
    # REVIEW-SECURITY: Field-level AES-256-GCM encrypted; never store plaintext PII
    identifier = Column(String, nullable=False)
    # REVIEW-SECURITY: Deterministic HMAC-SHA256 blind index enables O(1) exact match without decrypting
    identifier_blind_index = Column(String, index=True, nullable=True)
    basic_info = Column(JSON, default={}) # Name, DOB, Address, etc.
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    ledger_records = relationship("CreditLedger", back_populates="entity")
    scores = relationship("Score", back_populates="entity")
    enquiries = relationship("Enquiry", back_populates="entity")


class DirectorLink(Base):
    """Corporate cross-directorship association model.

    Enables corporate contagion risk modeling by linking individual directors
    to their companies, allowing insolvency or default history to be evaluated
    across related commercial entities.

    Attributes:
        id: Primary key UUID string.
        company_entity_id: Foreign key to the company Entity.
        individual_entity_id: Foreign key to the individual director Entity.
        role: Corporate position (default: "DIRECTOR").
        start_date: Directorship appointment date.
        end_date: Directorship resignation or termination date (None if active).
    """
    __tablename__ = "director_links"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    company_entity_id = Column(String, ForeignKey("entities.id"), nullable=False)
    individual_entity_id = Column(String, ForeignKey("entities.id"), nullable=False)
    role = Column(String, default="DIRECTOR")
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)


class IngestEvent(Base):
    """Immutable audit trail for incoming batch and real-time ingestion payloads.

    Stores the raw payload and validation result for forensic audit and provider SLA monitoring.

    Attributes:
        id: Primary key UUID string.
        provider_id: Code of the ingesting credit provider.
        raw_payload: Original JSON document received at the ingestion API.
        status: Ingestion outcome (ACCEPTED, REJECTED).
        error_log: Detailed validation failure reasons if rejected.
        created_at: Ingestion attempt timestamp.
    """
    __tablename__ = "ingest_events"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    provider_id = Column(String, nullable=True)
    raw_payload = Column(JSON, nullable=False)
    status = Column(String, nullable=False) # ACCEPTED, REJECTED
    error_log = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class CreditLedger(Base):
    """Bitemporal ledger recording all credit events and statutory information.

    Implements a bitemporal model using:
    - Business / Effective Time: `valid_from` to `valid_to` (when the event occurred in the real world).
    - System / Recording Time: `recorded_at` (when the bureau received and persisted the fact).

    This enables point-in-time historical reconstruction without retroactive data alteration.

    Attributes:
        id: Primary key UUID string.
        entity_id: Target credit subject UUID.
        record_type: Credit classification (RHI, DEFAULT, SCI, etc.).
        data: Structured JSON payload (e.g. RHI codes, balance, overdue days).
        amount: Numerical monetary amount (debt, default balance, credit limit).
        valid_from: Effective start date of the credit condition.
        valid_to: Effective end date (used for hardship arrangements or temporary variations).
        recorded_at: Timestamp when the bureau recorded the ledger entry.
        provider_id: Source credit provider submitting the data.
        status: Active, expired, disputed, or resolved status.
        entity: Parent Entity relationship.
    """
    __tablename__ = "credit_ledger"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    entity_id = Column(String, ForeignKey("entities.id"), nullable=False, index=True)
    record_type = Column(Enum(RecordTypeEnum), nullable=False)
    data = Column(JSON, nullable=False) # e.g. RHI codes, debt amount, etc.
    amount = Column(Numeric(12, 2), nullable=True)
    # Bitemporal effective time: when the financial event took effect in reality
    valid_from = Column(Date, nullable=False)
    # Bitemporal effective termination: used for hardship variations or resolved arrangements
    valid_to = Column(Date, nullable=True) # Used for hardship/variations
    # Bitemporal assertion time: when the bureau system recorded this fact
    recorded_at = Column(DateTime, default=datetime.utcnow)
    provider_id = Column(String, nullable=True)
    status = Column(Enum(RecordStatusEnum), default=RecordStatusEnum.ACTIVE, nullable=False)
    
    entity = relationship("Entity", back_populates="ledger_records")


class FeatureStore(Base):
    """Aggregated numerical feature store caching point-in-time credit signals.

    Attributes:
        entity_id: Primary key foreign key to Entity.
        last_updated: Timestamp of latest feature pipeline sweep.
        features: Key-value mapping of computed features (e.g. default counts, RHI metrics).
    """
    __tablename__ = "feature_store"
    
    entity_id = Column(String, ForeignKey("entities.id"), primary_key=True)
    last_updated = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    features = Column(JSON, nullable=False)


class ModelVersion(Base):
    """Governance model defining credit scoring weights and calibration thresholds.

    Attributes:
        id: Primary key UUID string.
        type: INDIVIDUAL or COMPANY model classification.
        name: Human-readable model designation (e.g., 'v1.0-consumer-balanced').
        weights: Dictionary of factor weights summing to exactly 100.0%.
        band_thresholds: Score boundary cutoffs for risk tiers (Excellent, Good, Average, etc.).
        active: Boolean flag indicating if this version is the production scoring engine.
        created_at: Creation and governance approval timestamp.
    """
    __tablename__ = "model_versions"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    type = Column(Enum(EntityTypeEnum), nullable=False)
    name = Column(String, nullable=False)
    # REVIEW-ASSUMPTION: Factor weights must sum to 100.0%; enforced in Admin router schemas
    weights = Column(JSON, nullable=False)
    band_thresholds = Column(JSON, nullable=False)
    active = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Score(Base):
    """Historical score output calculated by the scoring engine for an entity.

    Attributes:
        id: Primary key UUID string.
        entity_id: Target subject UUID.
        model_version_id: Model configuration used to produce the score.
        score_value: Credit score integer (scale 0-1000 for individual, 0-100 for commercial).
        band: Qualitative risk band descriptor (Excellent, Very Good, Good, Average, Below Average).
        sub_scores: Component scores per factor before weighted aggregation.
        top_factors: Adverse or positive driving factors explaining the score.
        calculated_at: Timestamp of score generation.
        entity: Parent Entity relationship.
    """
    __tablename__ = "scores"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    entity_id = Column(String, ForeignKey("entities.id"), nullable=False, index=True)
    model_version_id = Column(String, ForeignKey("model_versions.id"), nullable=False)
    score_value = Column(Integer, nullable=False)
    band = Column(String, nullable=False)
    sub_scores = Column(JSON, nullable=False)
    top_factors = Column(JSON, nullable=False)
    calculated_at = Column(DateTime, default=datetime.utcnow)
    
    entity = relationship("Entity", back_populates="scores")


class Enquiry(Base):
    """Mandatory audit record of credit provider inquiries against a subject.

    Under Privacy Act 1988 Section 20E/20M, every bureau lookup by a provider
    must be logged as an enquiry, visible to the consumer subject on file.

    Attributes:
        id: Primary key UUID string.
        entity_id: Subject whose file was accessed.
        user_id: Provider user ID that performed the lookup.
        reason: Purpose code or loan application reference.
        created_at: Timestamp of enquiry.
        entity: Parent Entity relationship.
    """
    __tablename__ = "enquiries"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    entity_id = Column(String, ForeignKey("entities.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    reason = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    entity = relationship("Entity", back_populates="enquiries")


class Dispute(Base):
    """Statutory consumer dispute filed under Privacy Act 1988 (Cth) Section 20V.

    Credit reporting bodies must investigate and resolve correction requests within
    a 30-day statutory SLA window.

    Attributes:
        id: Primary key UUID string.
        ledger_record_id: Disputed ledger entry UUID.
        entity_id: Subject lodging the dispute.
        status: Current adjudication state (OPEN, UNDER_REVIEW, CORRECTED, UPHELD).
        notes: Supporting documentation, subject statement, or resolution reason.
        created_at: Timestamp of dispute lodgement (starts the 30-day statutory clock).
        resolved_at: Adjudication timestamp when status moved to CORRECTED or UPHELD.
    """
    __tablename__ = "disputes"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    ledger_record_id = Column(String, ForeignKey("credit_ledger.id"), nullable=False)
    entity_id = Column(String, ForeignKey("entities.id"), nullable=False)
    # REVIEW-LEGAL: Privacy Act 1988 s20V mandates 30-day resolution window for dispute status
    status = Column(String, default="OPEN") # OPEN, UNDER_REVIEW, CORRECTED, UPHELD
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)


class AuditLog(Base):
    """Immutable audit ledger recording all administrative, query, and data mutations.

    Attributes:
        id: Primary key UUID string.
        user_id: Actor UUID performing the action (or None for system sweeps).
        action: Verb describing operation (CREATE, UPDATE, DELETE, READ, INGESTION_REJECTION).
        target_table: Database table affected.
        target_id: Record primary key in the affected table.
        before_state: Snapshot of data prior to modification.
        after_state: Snapshot of data post-modification.
        details: Metadata such as IP address, query parameters, or rejection reasons.
        timestamp: UTC timestamp of the audit event.
    """
    __tablename__ = "audit_log"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, nullable=True)
    action = Column(String, nullable=False) # e.g. CREATE, UPDATE, DELETE, READ
    target_table = Column(String, nullable=False)
    target_id = Column(String, nullable=True)
    before_state = Column(JSON, nullable=True)
    after_state = Column(JSON, nullable=True)
    details = Column(JSON, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
