import { NextResponse } from 'next/server';
import { getPassageCounts } from '@/server';

export async function GET() {
  return NextResponse.json(await getPassageCounts());
}
