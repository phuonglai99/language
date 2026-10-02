import { NextResponse } from 'next/server';
import { getMBLessonCounts } from '@/lib/db';

export async function GET() {
  return NextResponse.json(getMBLessonCounts());
}
