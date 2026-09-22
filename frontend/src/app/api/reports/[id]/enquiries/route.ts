import { NextRequest, NextResponse } from 'next/server';
import { bureauStore } from '@/lib/mockBureauStore';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const params = await Promise.resolve(context.params);
    const { id } = params;
    const enquiries = bureauStore.getEnquiries(id);
    return NextResponse.json(enquiries);
  } catch (err: any) {
    return NextResponse.json(
      { detail: err?.message || 'Error fetching enquiries' },
      { status: 500 }
    );
  }
}
