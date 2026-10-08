import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const localOnly = () => NextResponse.json({ error: 'Anonymous notes are stored in localStorage.' }, { status: 410 });

export const PATCH = localOnly;
export const DELETE = localOnly;
