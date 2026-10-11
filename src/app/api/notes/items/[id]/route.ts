import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export function DELETE() {
  return NextResponse.json({ error: 'Anonymous notes are stored in localStorage.' }, { status: 410 });
}
