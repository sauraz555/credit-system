import { NextRequest, NextResponse } from 'next/server';
import { bureauStore } from '@/lib/mockBureauStore';

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const params = await Promise.resolve(context.params);
    const { id } = params;
    const body = await req.json().catch(() => ({}));
    const { status, notes } = body;

    const result = bureauStore.updateDispute(id, { status, notes });
    if (!result) {
      return NextResponse.json(
        { detail: 'Dispute not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { detail: err?.message || 'Error updating dispute' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  return PUT(req, context);
}
