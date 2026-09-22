// k6 Load Test Script for CRMS
// Configuration: 50 virtual users for 5 minutes on report lookups, 20 virtual users on ingestion.
// Note: Rate limiting is raised/disabled for the test user via X-Benchmark-Test-User header.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// Custom metrics
const lookupDuration = new Trend('report_lookup_duration_ms');
const ingestDuration = new Trend('ingest_duration_ms');
const errorRate = new Rate('crms_error_rate');
const requestCounter = new Counter('total_benchmark_requests');

export const options = {
  scenarios: {
    report_lookups: {
      executor: 'constant-vus',
      vus: 50,
      duration: '5m',
      exec: 'lookupScenario',
    },
    data_ingestion: {
      executor: 'constant-vus',
      vus: 20,
      duration: '5m',
      exec: 'ingestScenario',
    },
  },
  thresholds: {
    'report_lookup_duration_ms': ['p(50)<50', 'p(95)<150', 'p(99)<300'],
    'ingest_duration_ms': ['p(50)<50', 'p(95)<150', 'p(99)<300'],
    'crms_error_rate': ['rate<0.01'], // <1% error rate
  },
};

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:8000';

// Pre-seeded token for load test user with rate limit bypass
const TEST_TOKEN = __ENV.AUTH_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJsb2FkX3Rlc3RfdXNlciIsImVtYWlsIjoicHJvdmlkZXJAbG9hZHRlc3QuY29tIiwicm9sZSI6IlBST1ZJREVSIiwidGVuYW50X2lkIjoiUFJWLVRFU1QtMDAxIiwidG9rZW5fdHlwZSI6ImFjY2VzcyJ9.placeholder';

const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${TEST_TOKEN}`,
  'X-Tenant-ID': 'PRV-TEST-001',
  'X-Benchmark-Test-User': 'true', // Rate limiting raised/disabled for test user
};

export function lookupScenario() {
  // Random sample across seeded 10,000 individuals and 2,000 companies
  const isCompany = Math.random() < 0.2;
  const entityId = isCompany 
    ? `ACN-109-283-${Math.floor(100 + Math.random() * 900)}` 
    : `IND-8842-${Math.floor(1000 + Math.random() * 9000)}`;

  const res = http.get(`${BASE_URL}/api/reports/${entityId}`, { headers: HEADERS });
  
  lookupDuration.add(res.timings.duration);
  requestCounter.add(1);

  const success = check(res, {
    'status is 200 or 404': (r) => r.status === 200 || r.status === 404,
  });
  errorRate.add(!success);

  sleep(0.1); // Small think time
}

export function ingestScenario() {
  const entityId = `IND-8842-${Math.floor(1000 + Math.random() * 9000)}`;
  const payload = JSON.stringify({
    record_type: 'RHI',
    provider_id: 'PRV-TEST-001',
    entity_id: entityId,
    valid_from: '2026-08-01',
    amount: Math.floor(500 + Math.random() * 25000),
    data: {
      account_type: 'Credit Card (Revolving)',
      rhi_24_months: '000000000000000000000000',
    },
  });

  const res = http.post(`${BASE_URL}/api/ingest/record`, payload, { headers: HEADERS });
  
  ingestDuration.add(res.timings.duration);
  requestCounter.add(1);

  const success = check(res, {
    'ingest status is 200 or 201': (r) => r.status === 200 || r.status === 201,
  });
  errorRate.add(!success);

  sleep(0.2);
}
