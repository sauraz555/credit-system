import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Credit Reporting Mechanism (नेपाल कर्जा सूचना प्रणाली)',
    version: '1.0.0-nepal'
  });
}
