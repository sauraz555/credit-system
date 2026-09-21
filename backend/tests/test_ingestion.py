import os
import sys
import unittest
from datetime import date
from pydantic import ValidationError

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.schemas import IngestRecordRequest
from app.models import RecordTypeEnum

class TestIngestionValidation(unittest.TestCase):
    
    def test_valid_rhi(self):
        req = IngestRecordRequest(
            entity_id="123",
            record_type=RecordTypeEnum.RHI,
            data={"rhi_history": "000000000000000000000012"},
            valid_from=date.today()
        )
        self.assertEqual(req.record_type, RecordTypeEnum.RHI)

    def test_invalid_rhi(self):
        with self.assertRaises(ValidationError) as context:
            IngestRecordRequest(
                entity_id="123",
                record_type=RecordTypeEnum.RHI,
                data={"rhi_history": "00000000000000000000001Y"}, # Y is invalid
                valid_from=date.today()
            )
        self.assertIn("RHI must only contain", str(context.exception))

    def test_valid_default(self):
        req = IngestRecordRequest(
            entity_id="123",
            record_type=RecordTypeEnum.DEFAULT,
            amount=200,
            data={"days_overdue": 90, "notice_given": True},
            valid_from=date.today()
        )
        self.assertEqual(req.record_type, RecordTypeEnum.DEFAULT)

    def test_invalid_default_low_amount(self):
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
