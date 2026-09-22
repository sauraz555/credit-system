"""Credit scoring evaluation test suite.

Validates consumer credit report generation and real-time score evaluation endpoints,
verifying presence of score values, risk bands, and explanatory factor breakdowns.

Architecture:
    Integration Test Suite (Backend Tests).
    Validates report generation (`app.routers.reports`) and scoring engine (`app.services.scoring`).
    Executed during CI unit/integration runs.

Legal / Regulatory:
    Privacy Act 1988 Part IIIA Section 20R (Credit reporting scoring explanations
    and key contributing risk factors).
"""

import os
import sys
import unittest
from fastapi.testclient import TestClient

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app
from app.database import init_db, SessionLocal
from app.models import Entity
from app.auth import create_access_token, RoleEnum

client = TestClient(app)

class TestScoring(unittest.TestCase):
    """Verifies report generation and score calculation endpoints."""
    
    @classmethod
    def setUpClass(cls):
        """Initializes database schema prior to executing scoring tests."""
        init_db()
        
    def test_get_report_and_score(self):
        """Tests that fetching a credit report returns complete score object with bands and factors."""
        db = SessionLocal()
        # Find a random individual
        entity = db.query(Entity).first()
        db.close()
        
        if not entity:
            self.skipTest("No entities in DB, run seed_data.py first.")
            
        token = create_access_token({"sub": "admin-scoring-test", "email": "admin@bureau.gov.au", "role": RoleEnum.ADMIN})
        headers = {"Authorization": f"Bearer {token}"}
            
        response = client.get(f"/api/reports/{entity.id}", headers=headers)
        self.assertEqual(response.status_code, 200)
        
        data = response.json()
        self.assertIn("score", data)
        self.assertIn("value", data["score"])
        self.assertIn("band", data["score"])
        self.assertIn("top_factors", data["score"])

        # Also test the force evaluate endpoint
        eval_resp = client.post(f"/api/scoring/evaluate/{entity.id}", headers=headers)
        self.assertEqual(eval_resp.status_code, 200)
        self.assertIn("score_value", eval_resp.json())

if __name__ == '__main__':
    unittest.main()
