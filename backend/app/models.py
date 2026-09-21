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
    ADMIN = "ADMIN"
    PROVIDER = "PROVIDER"
    ANALYST = "ANALYST"
    SUBJECT = "SUBJECT"

class EntityTypeEnum(str, enum.Enum):
    INDIVIDUAL = "INDIVIDUAL"
    COMPANY = "COMPANY"

class RecordTypeEnum(str, enum.Enum):
    RHI = "RHI"
    DEFAULT = "DEFAULT"
    SCI = "SCI"
    WRIT = "WRIT"
    BANKRUPTCY = "BANKRUPTCY"
    HARDSHIP = "HARDSHIP"
    ENQUIRY = "ENQUIRY"
    TRADE_PAYMENT = "TRADE_PAYMENT"

class RecordStatusEnum(str, enum.Enum):
    ACTIVE = "ACTIVE"
    EXPIRED = "EXPIRED"
    DISPUTED = "DISPUTED"
    PAID = "PAID"
    RESOLVED = "RESOLVED"

class User(Base):
    __tablename__ = "users"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(Enum(RoleEnum), default=RoleEnum.SUBJECT, nullable=False)
    tenant_id = Column(String, nullable=True) # For providers (e.g. PRV-NAB-001)
    entity_id = Column(String, nullable=True) # For subjects (e.g. links to Entity.id)
    totp_secret = Column(String, nullable=True)
    mfa_enabled = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class Entity(Base):
    __tablename__ = "entities"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    type = Column(Enum(EntityTypeEnum), nullable=False)
    # Encrypted identifier (ABN/ACN for company, Driver License/Passport for individual)
    identifier = Column(String, nullable=False)
    identifier_blind_index = Column(String, index=True, nullable=True)
    basic_info = Column(JSON, default={}) # Name, DOB, Address, etc.
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    ledger_records = relationship("CreditLedger", back_populates="entity")
    scores = relationship("Score", back_populates="entity")
    enquiries = relationship("Enquiry", back_populates="entity")

class DirectorLink(Base):
    __tablename__ = "director_links"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    company_entity_id = Column(String, ForeignKey("entities.id"), nullable=False)
    individual_entity_id = Column(String, ForeignKey("entities.id"), nullable=False)
    role = Column(String, default="DIRECTOR")
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)

class IngestEvent(Base):
    __tablename__ = "ingest_events"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    provider_id = Column(String, nullable=True)
    raw_payload = Column(JSON, nullable=False)
    status = Column(String, nullable=False) # ACCEPTED, REJECTED
    error_log = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class CreditLedger(Base):
    __tablename__ = "credit_ledger"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    entity_id = Column(String, ForeignKey("entities.id"), nullable=False, index=True)
    record_type = Column(Enum(RecordTypeEnum), nullable=False)
    data = Column(JSON, nullable=False) # e.g. RHI codes, debt amount, etc.
    amount = Column(Numeric(12, 2), nullable=True)
    valid_from = Column(Date, nullable=False)
    valid_to = Column(Date, nullable=True) # Used for hardship/variations
    recorded_at = Column(DateTime, default=datetime.utcnow)
    provider_id = Column(String, nullable=True)
    status = Column(Enum(RecordStatusEnum), default=RecordStatusEnum.ACTIVE, nullable=False)
    
    entity = relationship("Entity", back_populates="ledger_records")

class FeatureStore(Base):
    __tablename__ = "feature_store"
    
    entity_id = Column(String, ForeignKey("entities.id"), primary_key=True)
    last_updated = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    features = Column(JSON, nullable=False)

class ModelVersion(Base):
    __tablename__ = "model_versions"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    type = Column(Enum(EntityTypeEnum), nullable=False)
    name = Column(String, nullable=False)
    weights = Column(JSON, nullable=False)
    band_thresholds = Column(JSON, nullable=False)
    active = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class Score(Base):
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
    __tablename__ = "enquiries"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    entity_id = Column(String, ForeignKey("entities.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    reason = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    entity = relationship("Entity", back_populates="enquiries")

class Dispute(Base):
    __tablename__ = "disputes"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    ledger_record_id = Column(String, ForeignKey("credit_ledger.id"), nullable=False)
    entity_id = Column(String, ForeignKey("entities.id"), nullable=False)
    status = Column(String, default="OPEN") # OPEN, UNDER_REVIEW, CORRECTED, UPHELD
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

class AuditLog(Base):
    __tablename__ = "audit_log"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, nullable=True)
    action = Column(String, nullable=False) # e.g. CREATE, UPDATE, DELETE, READ
    target_table = Column(String, nullable=False)
    target_id = Column(String, nullable=True)
    before_state = Column(JSON, nullable=True)
    after_state = Column(JSON, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
