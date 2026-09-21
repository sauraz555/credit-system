// ==============================================================================
// CRMS Performance & Resilience Benchmark - k6 Load Test
// Workload: High-concurrency Report Lookups and Ingestion
// Target: p95 latency < 500ms, error rate < 1%
// ==============================================================================

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const reportLookupLatency = new Trend('crms_report_lookup_duration');
const ingestionLatency = new Trend('crms_ingest_duration');
const failureRate = new Rate('crms_failed_requests');

export const options = {
  stages: [
    { duration: '10s', target: 20 }, // Ramp-up to 20 concurrent VUs
    { duration: '30s', target: 50 }, // Sustained load at 50 VUs
    { duration: '10s', target: 0 },  // Ramp-down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500'], // 95% of requests must complete under 500ms
    'crms_report_lookup_duration': ['p(95)<300'],
    'crms_ingest_duration': ['p(95)<400'],
    'crms_failed_requests': ['rate<0.01'], // < 1% failure rate
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:8000';

const ENTITY_IDS = [
  'IND-8842-1994',
  'ACN-109-283-912',
  'IND-1001-0001',
  'IND-1001-0002',
];

export default function () {
  // Scenario 1: Report Lookup (Point-in-Time & Live)
  const entityId = ENTITY_IDS[Math.floor(Math.random() * ENTITY_IDS.length)];
  const asOf = Math.random() > 0.5 ? '?as_of=2025-06-01' : '';
  const lookupRes = http.get(`${BASE_URL}/api/reports/${encodeURIComponent(entityId)}${asOf}`, {
    headers: { 'Accept': 'application/json' },
  });

  const lookupSuccess = check(lookupRes, {
    'lookup status is 200': (r) => r.status === 200,
    'lookup has entity': (r) => r.json('entity') !== undefined,
  });

  reportLookupLatency.add(lookupRes.timings.duration);
  failureRate.add(!lookupSuccess);

  // Scenario 2: Data Ingestion (Default / RHI)
  const isDefault = Math.random() > 0.5;
  const payload = isDefault
    ? JSON.stringify({
        data_type: 'DEFAULT',
        provider_id: 'PRV-NAB-001',
        entity_id: entityId,
        valid_from: '2026-01-15',
        amount: 850.00,
        data: {
          original_amount: 850.00,
          current_balance: 850.00,
          days_past_due: 65,
          section_6q_notice_sent: true,
          section_21d_notice_sent: true,
          account_type: 'CREDIT_CARD'
        }
      })
    : JSON.stringify({
        data_type: 'RHI',
        provider_id: 'PRV-CBA-001',
        entity_id: entityId,
        valid_from: '2026-02-01',
        data: {
          rhi_code: '0',
          account_id: 'ACC-BENCH-9921',
          payment_due_date: '2026-02-01'
        }
      });

  const ingestRes = http.post(`${BASE_URL}/api/ingest`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-ID': isDefault ? 'PRV-NAB-001' : 'PRV-CBA-001'
    },
  });

  const ingestSuccess = check(ingestRes, {
    'ingest status is 200': (r) => r.status === 200,
    'ingest event recorded': (r) => r.json('status') === 'ACCEPTED',
  });

  ingestionLatency.add(ingestRes.timings.duration);
  failureRate.add(!ingestSuccess);

  sleep(0.1);
}
