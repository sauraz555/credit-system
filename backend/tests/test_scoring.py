import os
import sys
import unittest
from fastapi.testclient import TestClient

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app
from app.database import init_db, SessionLocal
from app.models import Entity

client = TestClient(app)

class TestScoring(unittest.TestCase):
    
    @classmethod
    def setUpClass(cls):
        init_db()
        
    def test_get_report_and_score(self):
        db = SessionLocal()
        # Find a random individual
        entity = db.query(Entity).first()
        db.close()
        
        if not entity:
            self.skipTest("No entities in DB, run seed_data.py first.")
            
        response = client.get(f"/api/reports/{entity.id}")
        self.assertEqual(response.status_code, 200)
        
        data = response.json()
        self.assertIn("score", data)
        self.assertIn("value", data["score"])
        self.assertIn("band", data["score"])
        self.assertIn("top_factors", data["score"])

        # Also test the force evaluate endpoint
        eval_resp = client.post(f"/api/scoring/evaluate/{entity.id}")
        self.assertEqual(eval_resp.status_code, 200)
        self.assertIn("score_value", eval_resp.json())

if __name__ == '__main__':
    unittest.main()
