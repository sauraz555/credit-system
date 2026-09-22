import { NextRequest, NextResponse } from 'next/server';
import { bureauStore } from '@/lib/mockBureauStore';

export async function POST(req: NextRequest) {
  try {
    let modelId = 'MODEL-NP-NAT-v1';
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData().catch(() => null);
      if (formData) {
        modelId = (formData.get('model_id') as string) || modelId;
      }
    } else {
      const body = await req.json().catch(() => ({}));
      if (body?.model_id) modelId = body.model_id;
    }

    const results = bureauStore.runBacktest(modelId);
    return NextResponse.json(results);
  } catch (err: any) {
    return NextResponse.json(
      { detail: err?.message || 'Error executing backtest' },
      { status: 500 }
    );
  }
}
