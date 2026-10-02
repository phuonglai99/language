import Link from 'next/link';
import { queryMBLessons } from '@/lib/db';
import { ReadingBreadcrumb } from './ReadingBreadcrumb';
import { ReadingSearch, ReadingFilterPills, type AlignmentStatus } from './ReadingFilters';

function getAlignmentStatus(categories: string[]): AlignmentStatus | null {
  if (categories.includes('Uncheck')) return 'Uncheck';
  if (categories.includes('Checked')) return 'Checked';
  return null;
}

function getAlignmentStatusParam(status: string | undefined): AlignmentStatus | null {
  const normalized = status?.toLowerCase();
  if (normalized === 'checked') return 'Checked';
  if (normalized === 'uncheck' || normalized === 'unchecked') return 'Uncheck';
  return null;
}

function isAlignmentStatus(cat: string) {
  return cat === 'Checked' || cat === 'Uncheck';
}

function AlignmentStatusBadge({ status }: { status: AlignmentStatus }) {
  return (
    <span className={`align-badge ${status === 'Checked' ? 'align-badge-checked' : 'align-badge-uncheck'}`}>
      {status}
    </span>
  );
}

interface Props {
  searchParams: Promise<{ hsk?: string; q?: string; status?: string }>;
}

export default async function ReadingPage({ searchParams }: Props) {
  const params = await searchParams;
  const hskParam = params.hsk ? Number(params.hsk) : null;
  const hsk = hskParam && Number.isFinite(hskParam) ? hskParam : null;
  const q = params.q ?? '';
  const status = getAlignmentStatusParam(params.status);

  // Read straight from SQLite while rendering: no client fetch round-trip, and
  // the filtering happens in the query rather than over the whole table.
  const lessons = queryMBLessons({ hsk, q, status });

  return (
    <div style={{ minHeight: '100vh', background: 'transparent' }}>
      {/* Header */}
      <header style={{ background: '#1e3a8a', position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 2px 12px rgba(0,0,0,0.25)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/" className="reading-back-link" style={{ textDecoration: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 13, marginRight: 4, transition: 'color 0.15s' }}>← </Link>
            <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 20, fontWeight: 700, color: '#fff' }}>读课文</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Đọc bài khoá</span>
          </div>
          <ReadingSearch hsk={hsk} q={q} status={status} />
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'rgba(200,191,176,0.5)', whiteSpace: 'nowrap' }}>
            <strong style={{ color: '#f5f1e8' }}>{lessons.length}</strong> bài
          </span>
        </div>
      </header>

      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 24px' }}>
        {(hsk || q) && (
          <ReadingBreadcrumb items={[
            { href: '/reading', label: 'Đọc bài khoá' },
            ...(hsk ? [{ href: q ? `/reading?hsk=${hsk}` : undefined, label: `HSK ${hsk}` }] : []),
            ...(q ? [{ label: q }] : []),
          ]} />
        )}
        <ReadingFilterPills hsk={hsk} q={q} status={status} />

        {/* Grid */}
        {lessons.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--ash)' }}>Không tìm thấy bài nào.</div>
        ) : (
          <div className="lesson-grid">
            {lessons.map(l => {
              const alignmentStatus = getAlignmentStatus(l.categories);
              const displayCategories = l.categories.filter(cat => !isAlignmentStatus(cat)).slice(0, 3);
              return (
              <Link key={l.slug} href={`/reading/${l.slug}`} prefetch={false} className="lesson-card-link">
                <div className={`lesson-card lvl-${l.hsk_level}`}>
                  <div className="lesson-card-bar" />

                  <div className="lesson-card-body">
                    {/* Level + audio */}
                    <div className="lesson-card-top">
                      <span className="lesson-level-pill">HSK {l.hsk_level}</span>
                      <div className="lesson-card-top-right">
                        {alignmentStatus && <AlignmentStatusBadge status={alignmentStatus} />}
                        {l.audio_url && <span className="lesson-audio-icon">🎧</span>}
                      </div>
                    </div>

                    <div className="lesson-card-title-zh">{l.title_zh_simplified}</div>
                    <div className="lesson-card-title-en">{l.title_en}</div>

                    <div className="lesson-card-foot">
                      <div className="lesson-card-cats">
                        {displayCategories.map(cat => <span key={cat} className="cat-badge">{cat}</span>)}
                      </div>
                      <span className="lesson-card-count">{l.vocabCount ?? 0} từ</span>
                    </div>
                  </div>
                </div>
              </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
