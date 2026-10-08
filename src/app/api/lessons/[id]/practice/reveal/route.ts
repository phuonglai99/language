import { NextRequest, NextResponse } from 'next/server';
import { getVocabularyPracticeBank } from '@/server';
import { t } from '@/i18n';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: t.practice.errors.invalidRequest }, { status: 400 });
  const value = body as Record<string, unknown>;
  if (typeof value.questionId !== 'string' || value.questionId.length > 200 ||
      typeof value.kind !== 'string' || typeof value.contentSignature !== 'string' || value.contentSignature.length > 200) {
    return NextResponse.json({ error: t.practice.errors.invalidRequest }, { status: 400 });
  }
  const bank = getVocabularyPracticeBank(id);
  if (!bank) return NextResponse.json({ error: t.api.common.notFound }, { status: 404 });
  if (value.contentSignature !== bank.contentSignature) {
    return NextResponse.json({ error: t.practice.errors.contentChanged }, { status: 409 });
  }
  const question = bank.internal.get(value.questionId);
  if (!question || question.dto.kind !== value.kind) {
    return NextResponse.json({ error: t.practice.errors.questionNotFound }, { status: 404 });
  }
  return NextResponse.json({
    questionId: question.dto.questionId, kind: question.dto.kind,
    contentSignature: bank.contentSignature, scoringVersion: bank.scoringVersion,
    answer: question.answer,
  });
}
