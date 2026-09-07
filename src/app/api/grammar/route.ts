import { NextRequest, NextResponse } from 'next/server';
import { getHanziiGrammarByHsk, getHanziiGrammarCounts } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const level = req.nextUrl.searchParams.get('level')?.trim() ?? '';
  if (!level) {
    const counts = getHanziiGrammarCounts();
    return NextResponse.json({ counts });
  }
  const items = getHanziiGrammarByHsk(level);
  return NextResponse.json({ items });
}
