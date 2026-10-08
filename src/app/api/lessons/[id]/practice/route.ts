import { NextRequest, NextResponse } from 'next/server';
import { getVocabularyPracticeBank } from '@/server';
import { t } from '@/i18n';
import type { PracticeBankDTO } from '@/types/api';

export const runtime = 'nodejs';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bank = getVocabularyPracticeBank(id);
  if (!bank) return NextResponse.json({ error: t.api.common.notFound }, { status: 404 });
  const dto: PracticeBankDTO = {
    lessonId: bank.lessonId, contentSignature: bank.contentSignature, scoringVersion: bank.scoringVersion,
    questions: bank.questions, counts: bank.counts, excluded: bank.excluded,
  };
  return NextResponse.json(dto, { headers: { 'Cache-Control': 'no-store' } });
}
