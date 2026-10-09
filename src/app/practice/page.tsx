import type { Metadata } from 'next';
import PracticeMode from '@/app/lesson/[id]/PracticeMode';
import { t } from '@/i18n';

export const metadata: Metadata = {
  title: t.practice.title,
};

export default function PracticePage() {
  return (
    <main style={{
      minHeight: '100vh', padding: 'clamp(24px, 5vw, 56px) 24px',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      background: 'transparent',
    }}>
      <PracticeMode lessonId="hsk-1" />
    </main>
  );
}
