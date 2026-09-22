"""Pydantic Request and Response Validation Schemas for Credit Data Ingestion.

This module defines input/output contracts and strict statutory validation rules for credit
record ingestion under Australian privacy and credit reporting law. It ensures that credit
providers cannot submit unpermitted values (e.g. invalid RHI codes) or list consumer defaults
that fail to satisfy statutory minimum debt and delinquency thresholds.

Architecture Tier:
    API / Schema & Validation Layer.

Key Dependencies & Callers:
    - Depends on Pydantic v1/v2 compatibility (`BaseModel`, `validator`).
    - Consumed by `routers/ingest.py` for batch and single-record credit data ingestion.

Regulatory & Compliance Context:
    - Privacy Act 1988 (Cth) Section 6Q & Section 21D:
      A default may only be listed if debt is >= $150, overdue by >= 60 days, and written notice was given.
    - Privacy (Credit Reporting) Code 2014 (CR Code):
      Governs permitted Repayment History Information (RHI) code characters ('0', '1'-'6', 'X').
"""

from typing import Optional, Dict, Any, List
from datetime import date, datetime
from pydantic import BaseModel, Field, validator
from app.models import RecordTypeEnum, EntityTypeEnum


class IngestRecordRequest(BaseModel):
    """Validation schema for incoming credit ledger entries.

    Attributes:
        entity_id: Target consumer or commercial subject identifier.
        record_type: RecordTypeEnum value (RHI, DEFAULT, SCI, etc.).
        amount: Numerical monetary value (e.g., defaulted balance or credit limit).
        data: Structured JSON metadata holding repayment strings or delinquency notes.
        valid_from: Effective start date of the financial status in reality.
        valid_to: Optional effective termination date (for hardship or fixed-term loans).
        provider_id: Credit provider code submitting the record.
    """
    entity_id: str
    record_type: RecordTypeEnum
    amount: Optional[float] = None
    data: Dict[str, Any]
    valid_from: date
    valid_to: Optional[date] = None
    provider_id: Optional[str] = None

    @validator('data')
    def validate_data(cls, v, values):
        """Enforces statutory credit reporting rules on incoming payload data.

        Args:
            v: The `data` dictionary payload.
            values: Previously validated fields including `record_type` and `amount`.

        Returns:
            Validated data dictionary.

        Raises:
            ValueError: If RHI characters are invalid, or if default amount/age/notice fail s6Q rules.
        """
        if 'record_type' not in values:
            return v
        
        record_type = values['record_type']

        if record_type == RecordTypeEnum.RHI:
            # REVIEW-LEGAL: Under Privacy (Credit Reporting) Code 2014, RHI is strictly restricted to:
            # '0': Paid on time / current
            # '1'-'6': Number of payment cycles overdue (1=up to 29 days, ..., 6=180+ days)
            # 'X': Not available / account inactive
            rhi_string = v.get("rhi_history")
            if rhi_string:
                for char in str(rhi_string):
                    if char not in ["0", "1", "2", "3", "4", "5", "6", "X"]:
                        raise ValueError("RHI must only contain 0, 1-6, or X")
        
        elif record_type == RecordTypeEnum.DEFAULT:
            # REVIEW-LEGAL: Privacy Act 1988 (Cth) Section 6Q statutory minimums:
            # 1. Minimum overdue balance threshold: >= $150 AUD
            amount = values.get('amount')
            if amount is None or amount < 150:
                raise ValueError("Default amount must be >= $150")
            
            # 2. Minimum overdue age threshold: >= 60 days past due date
            days_overdue = v.get("days_overdue")
            if days_overdue is None or int(days_overdue) < 60:
                raise ValueError("Default must be >= 60 days overdue")
            
            # 3. Mandatory Section 6Q/21D written notice served to debtor
            if not v.get("notice_given", False):
                raise ValueError("Notice must have been given for a default")

        return v


class BulkIngestResponse(BaseModel):
    """Response payload summarizing batch ingestion outcomes.

    Attributes:
        accepted_count: Number of successfully validated and ledgered records.
        rejected_count: Number of rejected records due to schema or statutory violations.
        errors: Detailed breakdown of record indices and validation failure reasons.
    """
    accepted_count: int
    rejected_count: int
    errors: List[Dict[str, Any]]
