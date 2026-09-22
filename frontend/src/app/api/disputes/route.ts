import { NextRequest, NextResponse } from 'next/server';
import { bureauStore } from '@/lib/mockBureauStore';

export async function GET() {
  const disputes = bureauStore.getDisputes();
  return NextResponse.json(disputes);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { entity_id, ledger_record_id, notes } = body;

    if (!entity_id) {
      return NextResponse.json(
        { detail: 'entity_id is required to lodge a dispute' },
        { status: 400 }
      );
    }

    const result = bureauStore.openDispute({
      entity_id,
      ledger_record_id,
      notes
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { detail: err?.message || 'Error opening dispute' },
      { status: 500 }
    );
  }
}
