import { NextResponse } from 'next/server';
import { getAllLessons } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const lessons = getAllLessons();
  return NextResponse.json({ lessons });
}
