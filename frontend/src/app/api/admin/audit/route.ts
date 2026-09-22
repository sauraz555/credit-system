import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json([
    {
      id: 'AUD-2026-09-01',
      action: 'MODEL_VERSION_ACTIVATE',
      target_table: 'model_versions',
      target_id: 'MODEL-NP-NAT-v1',
      user_id: 'admin@creditreporting.gov.np',
      timestamp: '2026-09-20T10:14:00Z',
      details: 'Activated Nepal National Credit Scoring Model v1.0 (5 pillars)'
    },
    {
      id: 'AUD-2026-09-02',
      action: 'DISPUTE_STATUS_CHANGE',
      target_table: 'disputes',
      target_id: 'DISP-NP-2081-05',
      user_id: 'analyst@creditreporting.gov.np',
      timestamp: '2026-08-28T10:00:00Z',
      details: 'Status updated to RESOLVED_EXPUNGED under Section 12'
    }
  ]);
}
