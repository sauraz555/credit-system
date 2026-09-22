"""
Load Testing Runner for CRMS Platform
Simulates concurrent load:
- 50 Virtual Users executing Report Lookups
- 20 Virtual Users executing Data Ingestion
Rate limiting is raised/disabled for the test user via X-Benchmark-Test-User and user_id whitelist.
Reports p50, p95, p99 latencies, error rate, and throughput (req/s).
"""

import time
import statistics
import concurrent.futures
import sys
import os
import random
from datetime import date

sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

from fastapi.testclient import TestClient
from app.main import app
from app.auth import create_access_token
from app.database import SessionLocal, init_db
from app.models import User, RoleEnum

client = TestClient(app)

# Ensure load test user exists
init_db()
db = SessionLocal()
test_user = db.query(User).filter(User.id == "load_test_user").first()
if not test_user:
    test_user = User(
        id="load_test_user",
        email="provider@example.com",
        password_hash="system_hash",
        role=RoleEnum.PROVIDER,
        tenant_id="PRV-TEST-001"
    )
    db.add(test_user)
    try:
        db.commit()
    except Exception:
        db.rollback()
db.close()

token = create_access_token({
    "sub": "load_test_user",
    "email": "provider@example.com",
    "role": "PROVIDER",
    "tenant_id": "PRV-CBA-001"
})

HEADERS = {
    "Authorization": f"Bearer {token}",
    "X-Tenant-ID": "PRV-CBA-001",
    "X-Benchmark-Test-User": "true"
}

def execute_lookup(vu_id: int):
    # Lookup either Jonathan Vance or another seeded entity
    entity_id = "IND-8842-1994" if random.random() < 0.7 else "ACN-109-283-912"
    start = time.perf_counter()
    try:
        res = client.get(f"/api/reports/{entity_id}", headers=HEADERS)
        dur = (time.perf_counter() - start) * 1000.0
        success = (res.status_code == 200)
        return "lookup", dur, success
    except Exception:
        dur = (time.perf_counter() - start) * 1000.0
        return "lookup", dur, False

def execute_ingest(vu_id: int):
    start = time.perf_counter()
    try:
        res = client.post(
            "/api/ingest/record",
            json={
                "record_type": "DEFAULT",
                "provider_id": "PRV-CBA-001",
                "entity_id": "IND-8842-1994",
                "valid_from": "2026-08-01",
                "amount": round(random.uniform(500, 5000), 2),
                "data": {
                    "days_overdue": 65,
                    "notice_given": True,
                    "notice_days_met": True
                }
            },
            headers=HEADERS
        )
        dur = (time.perf_counter() - start) * 1000.0
        success = (res.status_code in [200, 201])
        return "ingest", dur, success
    except Exception:
        dur = (time.perf_counter() - start) * 1000.0
        return "ingest", dur, False

def run_benchmark(duration_seconds: int = 30):
    print(f"=== CRMS High-Concurrency Load Test ===")
    print(f"Configuration: 50 VUs (Report Lookups) + 20 VUs (Data Ingestion)")
    print(f"Target Duration: {duration_seconds} seconds")
    print(f"Rate Limiting: RAISED/DISABLED for test user ('load_test_user', X-Benchmark-Test-User: true)")
    print(f"Starting execution...")

    lookup_latencies = []
    ingest_latencies = []
    total_errors = 0
    total_requests = 0

    start_time = time.time()
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=70) as executor:
        futures = []
        # Dispatch initial batch of 50 lookup workers and 20 ingest workers
        while time.time() - start_time < duration_seconds:
            batch = []
            for vu in range(50):
                batch.append(executor.submit(execute_lookup, vu))
            for vu in range(20):
                batch.append(executor.submit(execute_ingest, vu))
                
            for fut in concurrent.futures.as_completed(batch):
                op, dur, success = fut.result()
                total_requests += 1
                if not success:
                    total_errors += 1
                if op == "lookup":
                    lookup_latencies.append(dur)
                else:
                    ingest_latencies.append(dur)
            time.sleep(0.05)

    total_elapsed = time.time() - start_time
    throughput = total_requests / total_elapsed if total_elapsed > 0 else 0
    error_rate = (total_errors / total_requests) * 100.0 if total_requests > 0 else 0

    print("\n================ BENCHMARK RESULTS ================")
    print(f"Total Elapsed Time: {total_elapsed:.2f}s")
    print(f"Total Requests Processed: {total_requests}")
    print(f"Throughput: {throughput:.2f} req/s")
    print(f"Total Errors: {total_errors}")
    print(f"Error Rate: {error_rate:.3f}%")

    if lookup_latencies:
        lookup_latencies.sort()
        p50 = statistics.median(lookup_latencies)
        p95 = lookup_latencies[int(len(lookup_latencies) * 0.95)]
        p99 = lookup_latencies[int(len(lookup_latencies) * 0.99)]
        print(f"\n--- Report Lookups (50 VUs) ---")
        print(f"Requests: {len(lookup_latencies)}")
        print(f"p50 Latency: {p50:.2f} ms")
        print(f"p95 Latency: {p95:.2f} ms")
        print(f"p99 Latency: {p99:.2f} ms")

    if ingest_latencies:
        ingest_latencies.sort()
        p50_ing = statistics.median(ingest_latencies)
        p95_ing = ingest_latencies[int(len(ingest_latencies) * 0.95)]
        p99_ing = ingest_latencies[int(len(ingest_latencies) * 0.99)]
        print(f"\n--- Data Ingestion (20 VUs) ---")
        print(f"Requests: {len(ingest_latencies)}")
        print(f"p50 Latency: {p50_ing:.2f} ms")
        print(f"p95 Latency: {p95_ing:.2f} ms")
        print(f"p99 Latency: {p99_ing:.2f} ms")
    print("===================================================\n")

if __name__ == "__main__":
    run_benchmark(duration_seconds=20)
