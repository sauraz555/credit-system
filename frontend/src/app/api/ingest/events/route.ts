import { NextResponse } from 'next/server';
import { bureauStore } from '@/lib/mockBureauStore';

export async function GET() {
  const events = bureauStore.getIngestEvents();
  return NextResponse.json(events);
}
