import { NextRequest, NextResponse } from 'next/server';
import { bureauStore } from '@/lib/mockBureauStore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { detail: 'Email address is required' },
        { status: 400 }
      );
    }

    const authResult = bureauStore.authenticate(email);
    return NextResponse.json(authResult);
  } catch (err: any) {
    return NextResponse.json(
      { detail: err?.message || 'Authentication error' },
      { status: 500 }
    );
  }
}
