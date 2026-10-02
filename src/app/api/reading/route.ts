import { NextRequest, NextResponse } from 'next/server';
import { queryMBLessons } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const hsk = searchParams.get('hsk');

  const lessons = queryMBLessons({
    hsk: hsk ? Number(hsk) : null,
    q: searchParams.get('q'),
    status: searchParams.get('status'),
  });

  return NextResponse.json({ lessons });
}
