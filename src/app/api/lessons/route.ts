import { NextResponse } from 'next/server';
import { listLessons } from '@/server';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ lessons: await listLessons() });
}
