import { NextRequest, NextResponse } from 'next/server';
import { getVocabularyPracticeBank } from '@/server';
import { gradeHanzi, gradePinyin, parseNumericPinyin, type PracticeKind } from '@/lib/vocabularyPractice';
import type { PracticeCheckDTO } from '@/types/api';
import { t } from '@/i18n';

export const runtime = 'nodejs';
const KINDS: PracticeKind[] = ['hanzi-to-pinyin', 'hanzi-to-hanzi', 'vi-to-hanzi'];

type CheckBody = { questionId: string; kind: PracticeKind; input: string; contentSignature: string };

function bodyValue(value: unknown): CheckBody | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Partial<CheckBody>;
  if (typeof body.questionId !== 'string' || body.questionId.length > 200 ||
      typeof body.kind !== 'string' || !KINDS.includes(body.kind as PracticeKind) ||
      typeof body.input !== 'string' || body.input.length > 200 ||
      typeof body.contentSignature !== 'string' || body.contentSignature.length > 200) return null;
  return body as CheckBody;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let value: unknown;
  try { value = await request.json(); } catch { value = null; }
  const body = bodyValue(value);
  if (!body) return NextResponse.json({ error: t.practice.errors.invalidRequest }, { status: 400 });
  const bank = getVocabularyPracticeBank(id);
  if (!bank) return NextResponse.json({ error: t.api.common.notFound }, { status: 404 });
  if (body.contentSignature !== bank.contentSignature) {
    return NextResponse.json({ error: t.practice.errors.contentChanged }, { status: 409 });
  }
  const question = bank.internal.get(body.questionId);
  if (!question || question.dto.kind !== body.kind) {
    return NextResponse.json({ error: t.practice.errors.questionNotFound }, { status: 404 });
  }

  let correct: boolean;
  let issues: PracticeCheckDTO['issues'];
  if (body.kind === 'hanzi-to-pinyin') {
    const parsed = parseNumericPinyin(body.input);
    if (!parsed.ok) {
      return NextResponse.json({ error: t.practice.format[parsed.error], formatError: parsed.error }, { status: 422 });
    }
    const alternatives = question.acceptedPinyin.map(expected => gradePinyin(parsed.syllables, expected));
    const grade = alternatives.find(result => result.correct) ?? alternatives.sort((a, b) => a.issues.length - b.issues.length)[0];
    correct = grade.correct;
    issues = grade.issues.map(issue => ({
      kind: issue.kind, expectedIndex: issue.expectedIndex, actualIndex: issue.actualIndex,
      ...(issue.expected ? { expected: issue.expected } : {}), ...(issue.actual ? { actual: issue.actual } : {}),
    }));
  } else {
    const grade = gradeHanzi(body.input, question.acceptedHanzi);
    if ('error' in grade) {
      return NextResponse.json({ error: t.practice.format[grade.error], formatError: grade.error }, { status: 422 });
    }
    correct = grade.correct;
  }

  const result: PracticeCheckDTO = {
    questionId: body.questionId, kind: body.kind, contentSignature: bank.contentSignature,
    scoringVersion: bank.scoringVersion, status: correct ? 'correct' : 'incorrect',
    feedback: correct ? t.practice.feedback.correct : body.kind === 'hanzi-to-pinyin'
      ? t.practice.feedback.pinyinIncorrect : t.practice.feedback.hanziIncorrect,
    ...(issues?.length ? { issues } : {}), answer: question.answer,
  };
  return NextResponse.json(result);
}
