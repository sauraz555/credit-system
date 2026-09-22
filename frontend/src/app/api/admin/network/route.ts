import { NextResponse } from 'next/server';
import { bureauStore } from '@/lib/mockBureauStore';

export async function GET() {
  const network = bureauStore.getDirectorNetwork();
  return NextResponse.json(network);
}
