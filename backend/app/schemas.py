from typing import Optional, Dict, Any, List
from datetime import date, datetime
from pydantic import BaseModel, Field, validator
from app.models import RecordTypeEnum, EntityTypeEnum

class IngestRecordRequest(BaseModel):
    entity_id: str
    record_type: RecordTypeEnum
    amount: Optional[float] = None
    data: Dict[str, Any]
    valid_from: date
    valid_to: Optional[date] = None
    provider_id: Optional[str] = None

    @validator('data')
    def validate_data(cls, v, values):
        if 'record_type' not in values:
            return v
        
        record_type = values['record_type']

        if record_type == RecordTypeEnum.RHI:
            # Check RHI structure
            rhi_string = v.get("rhi_history")
            if rhi_string:
                for char in str(rhi_string):
                    if char not in ["0", "1", "2", "3", "4", "5", "6", "X"]:
                        raise ValueError("RHI must only contain 0, 1-6, or X")
        
        elif record_type == RecordTypeEnum.DEFAULT:
            amount = values.get('amount')
            if amount is None or amount < 150:
                raise ValueError("Default amount must be >= $150")
            
            days_overdue = v.get("days_overdue")
            if days_overdue is None or int(days_overdue) < 60:
                raise ValueError("Default must be >= 60 days overdue")
            
            if not v.get("notice_given", False):
                raise ValueError("Notice must have been given for a default")

        return v

class BulkIngestResponse(BaseModel):
    accepted_count: int
    rejected_count: int
    errors: List[Dict[str, Any]]
