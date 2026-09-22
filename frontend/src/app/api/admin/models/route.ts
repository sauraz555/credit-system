import { NextRequest, NextResponse } from 'next/server';
import { bureauStore } from '@/lib/mockBureauStore';

export async function GET() {
  const models = bureauStore.getModels();
  return NextResponse.json(models);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { name, type, weights, band_thresholds, active } = body;

    if (!name || !weights) {
      return NextResponse.json(
        { detail: 'name and weights are required' },
        { status: 400 }
      );
    }

    // Validate weights total 100% or 1.0
    const total = Object.values(weights).reduce((acc: number, val: any) => acc + parseFloat(val || 0), 0);
    if (Math.abs(total - 100.0) > 0.1 && Math.abs(total - 1.0) > 0.01) {
      return NextResponse.json(
        { detail: `Model weights must total exactly 100%. Current total: ${total}%` },
        { status: 422 }
      );
    }

    const result = bureauStore.createModel({
      name,
      type: type || 'INDIVIDUAL',
      weights,
      band_thresholds: band_thresholds || {},
      active: !!active
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { detail: err?.message || 'Error creating scoring model' },
      { status: 500 }
    );
  }
}
