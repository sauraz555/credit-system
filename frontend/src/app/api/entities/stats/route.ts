import { NextResponse } from 'next/server';
import { bureauStore } from '@/lib/mockBureauStore';

export async function GET() {
  const stats = bureauStore.getStats();
  return NextResponse.json(stats);
}
