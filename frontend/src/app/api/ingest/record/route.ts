import { NextRequest, NextResponse } from 'next/server';
import { bureauStore } from '@/lib/mockBureauStore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { entity_id, record_type, amount, valid_from, data } = body;

    if (!entity_id || !record_type) {
      return NextResponse.json(
        { detail: 'entity_id and record_type are required' },
        { status: 400 }
      );
    }

    const result = bureauStore.ingestRecord({
      entity_id,
      record_type,
      amount: amount !== undefined ? parseFloat(amount) : null,
      valid_from: valid_from || new Date().toISOString().split('T')[0],
      data: data || {}
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { detail: err?.message || 'Error ingesting credit record' },
      { status: 500 }
    );
  }
}
