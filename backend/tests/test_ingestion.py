"""Unit test suite for credit data ingestion validation rules.

Validates schema constraints enforced on incoming credit records, specifically
testing strict compliance with statutory default rules (Section 6Q) and 24-month
Repayment History Information (RHI) character sets.

Architecture:
    Backend Test Suite (Unit Tests).
    Validates Pydantic schemas in `app.schemas.IngestRecordRequest`.
    Invoked during CI/CD test automation runs.

Legal / Regulatory:
    Privacy Act 1988 Part IIIA, Section 6Q (Statutory default criteria: >= $150,
    >= 60 days overdue, formal notice issued) and Section 20N (RHI 0-24 codes).
"""

import os
import sys
import unittest
from datetime import date
from pydantic import ValidationError

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.schemas import IngestRecordRequest
from app.models import RecordTypeEnum

class TestIngestionValidation(unittest.TestCase):
    """Verifies schema-level ingestion constraints against statutory credit rules."""
    
    def test_valid_rhi(self):
        """Tests that a valid 24-character RHI string containing valid CR Code markers passes validation."""
        req = IngestRecordRequest(
            entity_id="123",
            record_type=RecordTypeEnum.RHI,
            data={"rhi_history": "000000000000000000000012"},
            valid_from=date.today()
        )
        self.assertEqual(req.record_type, RecordTypeEnum.RHI)

    def test_invalid_rhi(self):
        """Tests that invalid RHI characters (e.g. 'Y') raise a ValidationError."""
        with self.assertRaises(ValidationError) as context:
            IngestRecordRequest(
                entity_id="123",
                record_type=RecordTypeEnum.RHI,
                data={"rhi_history": "00000000000000000000001Y"}, # Y is invalid
                valid_from=date.today()
            )
        self.assertIn("RHI must only contain", str(context.exception))

    def test_valid_default(self):
        """Tests that a compliant default record (>= $150, >= 60 days overdue, notice given) passes validation."""
        req = IngestRecordRequest(
            entity_id="123",
            record_type=RecordTypeEnum.DEFAULT,
            amount=200,
            data={"days_overdue": 90, "notice_given": True},
            valid_from=date.today()
        )
        self.assertEqual(req.record_type, RecordTypeEnum.DEFAULT)

    def test_invalid_default_low_amount(self):
        """Tests that a default with amount < $150 is rejected under Privacy Act s6Q(1)(d)."""
        with self.assertRaises(ValidationError) as context:
            IngestRecordRequest(
                entity_id="123",
                record_type=RecordTypeEnum.DEFAULT,
                amount=100, # Invalid: < 150
                data={"days_overdue": 90, "notice_given": True},
                valid_from=date.today()
            )
        self.assertIn("Default amount must be >= $150", str(context.exception))

    def test_invalid_default_not_overdue_enough(self):
        """Tests that a default overdue for < 60 days is rejected under Privacy Act s6Q(1)(c)."""
        with self.assertRaises(ValidationError) as context:
            IngestRecordRequest(
                entity_id="123",
                record_type=RecordTypeEnum.DEFAULT,
                amount=500,
                data={"days_overdue": 30, "notice_given": True}, # Invalid: < 60 days
                valid_from=date.today()
            )
        self.assertIn("Default must be >= 60 days overdue", str(context.exception))
        
    def test_invalid_default_no_notice(self):
        """Tests that a default without statutory notice given is rejected under Privacy Act s6Q(1)(b)."""
        with self.assertRaises(ValidationError) as context:
            IngestRecordRequest(
                entity_id="123",
                record_type=RecordTypeEnum.DEFAULT,
                amount=500,
                data={"days_overdue": 90, "notice_given": False}, # Invalid: no notice
                valid_from=date.today()
            )
        self.assertIn("Notice must have been given", str(context.exception))

if __name__ == '__main__':
    unittest.main()
