import { NextRequest, NextResponse } from 'next/server';
import { queryPassages } from '@/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const hsk = searchParams.get('hsk');

  const lessons = await queryPassages({
    hsk: hsk ? Number(hsk) : null,
    q: searchParams.get('q'),
    status: searchParams.get('status'),
  });

  return NextResponse.json({ lessons });
}
