import { NextRequest, NextResponse } from 'next/server';
import { bureauStore } from '@/lib/mockBureauStore';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const params = await Promise.resolve(context.params);
    const { id } = params;
    const { searchParams } = new URL(req.url);
    const asOf = searchParams.get('as_of');

    const report = bureauStore.getReport(id, asOf);
    return NextResponse.json(report);
  } catch (err: any) {
    return NextResponse.json(
      { detail: err?.message || 'Error generating credit report' },
      { status: 500 }
    );
  }
}
