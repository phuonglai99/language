'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type LessonMeta = {
  id: string; title: string; subtitle?: string; level: string;
  vocabCount: number; grammarCount: number;
};

type SearchResult = {
  lessonId: string; lessonTitle: string; level: string;
  zh: string; py: string; vn: string; pos: string;
};

const LEVEL_COLOR: Record<string, string> = {
  HSK1: '#3a8a5c', HSK2: '#4a72a0', HSK3: '#a0720a',
  HSK4: '#c8392b', HSK5: '#7a3db0', HSK6: '#2a6080',
  'HSK7-9': '#2a6080', Khác: '#6b7280',
};

const HSK_LEVELS = ['HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6'];
const GRAMMAR_HSK_LEVELS = ['HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6', 'HSK7-9', 'Khác'];

const SECTIONS = [
  { key: 'vocab',    icon: '卡', label: 'Từ vựng',       color: '#c8392b' },
  { key: 'grammar',  icon: '文', label: 'Ngữ pháp',      color: '#a0720a' },
  { key: 'reading',  icon: '读', label: 'Đọc bài khoá',  color: '#3a8a5c' },
  { key: 'listen',   icon: '🎧', label: 'Luyện nghe',    color: '#4a72a0' },
  { key: 'quiz',     icon: '测', label: 'Kiểm tra',      color: '#4a72a0' },
  { key: 'game',     icon: '配', label: 'Trò chơi',      color: '#7a3db0' },
];

function lessonHref(section: string, id: string): string {
  if (section === 'grammar') return `/grammar/${id}`;
  if (section === 'quiz')    return `/lesson/${id}?mode=quiz`;
  if (section === 'game')    return `/lesson/${id}?mode=match`;
  if (section === 'vocab')   return `/lesson/${id}?mode=list`;
  return `/lesson/${id}`;
}

type MBLessonMeta = {
  slug: string; title_en: string; title_zh_simplified: string; hsk_level: number;
};

const SIDEBAR_W_DEFAULT = 272;
const SIDEBAR_W_MIN = 200;
const SIDEBAR_W_MAX = 400;

function activeSection(pathname: string): string {
  if (pathname.startsWith('/reading')) return 'reading';
  if (pathname.startsWith('/grammar')) return 'grammar';
  if (pathname.startsWith('/vocab')) return 'vocab';
  if (pathname.startsWith('/lesson')) return 'vocab';
  if (pathname.startsWith('/dictation')) return 'listen';
  return '';
}

export default function GlobalShell() {
  const pathname = usePathname();
  const currentSection = activeSection(pathname);
  const [open, setOpen] = useState(true);
  const [sidebarW, setSidebarW] = useState(SIDEBAR_W_DEFAULT);
  const draggingRef = useRef(false);
  const dragStartX = useRef(0);
  const dragStartW = useRef(SIDEBAR_W_DEFAULT);
  const [lessons, setLessons] = useState<LessonMeta[]>([]);
  const [mbLessons, setMbLessons] = useState<MBLessonMeta[]>([]);
  const [grammarCounts, setGrammarCounts] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ vocab: true, grammar: true });
  const [subExpanded, setSubExpanded] = useState<Record<string, boolean>>({ 'grammar-HSK2': true });
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composingRef = useRef(false);

  useEffect(() => {
    fetch('/api/lessons').then(r => r.json()).then(d => setLessons(d.lessons ?? []));
    fetch('/api/reading').then(r => r.json()).then(d => setMbLessons(d.lessons ?? []));
    fetch('/api/grammar').then(r => r.json()).then(d => {
      const map: Record<string, number> = {};
      for (const row of (d.counts ?? []) as { hsk: string; count: number }[]) map[row.hsk] = row.count;
      setGrammarCounts(map);
    });
  }, []);

  useEffect(() => {
    const main = document.getElementById('app-main');
    if (main) main.style.paddingLeft = open ? `${sidebarW}px` : '52px';
    document.body.style.setProperty('--sidebar-w', open ? `${sidebarW}px` : '52px');
  }, [open, sidebarW]);

  useEffect(() => {
    if (currentSection) {
      setExpanded(p => ({ ...p, [currentSection]: true }));
    }
  }, [currentSection]);

  const doSearch = useCallback((q: string) => {
    if (!q.trim()) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    fetch(`/api/search?q=${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then(d => { setSearchResults(d.results ?? []); setSearching(false); })
      .catch(() => setSearching(false));
  }, []);

  useEffect(() => {
    if (composingRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  const grouped = HSK_LEVELS.reduce<Record<string, LessonMeta[]>>((acc, lvl) => {
    acc[lvl] = lessons.filter(l => l.level === lvl);
    return acc;
  }, {});

  const toggleSection = (key: string) =>
    setExpanded(p => ({ ...p, [key]: !p[key] }));

  const toggleSub = (key: string) =>
    setSubExpanded(p => ({ ...p, [key]: !p[key] }));

  const closeAll = () => { setQuery(''); setSearchResults([]); };

  return (
    <>
      {/* Mini rail — shown when sidebar is closed */}
      {!open && (
        <div style={{
          position: 'fixed', top: 0, left: 0, bottom: 0, width: 52, zIndex: 200,
          background: 'var(--sidebar-bg)',
          borderRight: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          paddingTop: 12, gap: 16,
        }}>
          {/* Logo */}
          <button onClick={() => setOpen(true)} title="Mở menu" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <img src="/icon.png" alt="ice-bear" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover', display: 'block' }} />
          </button>
          {/* Expand icon */}
          <button
            onClick={() => setOpen(true)}
            title="Mở menu"
            style={{
              width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.06)', color: 'rgba(200,191,176,0.6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 14,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#f5f1e8'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(200,191,176,0.6)'; }}
          >
            ›
          </button>
          {/* Section icons */}
          {SECTIONS.map(sec => (
            <div key={sec.key} title={sec.label} style={{ width: 32, height: 32, borderRadius: 8, background: currentSection === sec.key ? sec.color + '44' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontFamily: 'Noto Serif SC, serif', color: currentSection === sec.key ? '#fff' : sec.color, cursor: 'pointer' }}
              onClick={() => setOpen(true)}>
              {sec.icon}
            </div>
          ))}
          {/* Notes icon */}
          <Link href="/notes" title="Ghi chú của tôi" style={{ width: 32, height: 32, borderRadius: 8, background: pathname.startsWith('/notes') ? '#e09d3a44' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, textDecoration: 'none' }}>
            📝
          </Link>
        </div>
      )}

      {/* Sidebar */}
      <aside style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 150,
        width: sidebarW, background: 'var(--sidebar-bg)',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', flexDirection: 'column',
        transform: open ? 'translateX(0)' : `translateX(-${sidebarW}px)`,
        transition: draggingRef.current ? 'none' : 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
        boxShadow: open ? '4px 0 24px rgba(0,0,0,0.2)' : 'none',
      }}>
        {/* Sidebar header */}
        <div style={{ padding: '14px 14px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Link href="/" onClick={closeAll} style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', flex: 1 }}>
              <img src="/icon.png" alt="ice-bear" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
              <span style={{ fontFamily: 'Be Vietnam Pro, sans-serif', fontSize: 13, fontWeight: 700, color: '#f5f1e8', lineHeight: 1.2 }}>ice-bear is<br /><span style={{ color: 'var(--sidebar-text)', fontWeight: 400 }}>learning</span></span>
            </Link>
            {/* Collapse button */}
            <button
              onClick={closeAll}
              title="Thu gọn"
              style={{
                width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.06)', color: 'rgba(200,191,176,0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#f5f1e8'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(200,191,176,0.6)'; }}
            >
              ‹
            </button>
          </div>

          {/* Search bar */}
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(200,191,176,0.5)', fontSize: 14, pointerEvents: 'none' }}>🔍</span>
            <input
              ref={searchRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onCompositionStart={() => { composingRef.current = true; }}
              onCompositionEnd={e => { composingRef.current = false; setQuery((e.target as HTMLInputElement).value); }}
              placeholder="Tìm từ vựng (pinyin, hán tự…)"
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '8px 10px 8px 32px',
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 7, color: '#f5f1e8', fontSize: 13,
                fontFamily: 'Be Vietnam Pro, sans-serif', outline: 'none',
              }}
            />
          </div>

          {/* Search results */}
          {(query.trim().length > 0) && (
            <div style={{ marginTop: 8, maxHeight: 260, overflowY: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
              {searching && (
                <div style={{ padding: '12px 14px', color: 'rgba(200,191,176,0.6)', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>Đang tìm…</div>
              )}
              {!searching && searchResults.length === 0 && (
                <div style={{ padding: '12px 14px', color: 'rgba(200,191,176,0.5)', fontSize: 12 }}>Không tìm thấy từ nào</div>
              )}
              {!searching && searchResults.map((r, i) => (
                <Link key={i} href={`/lesson/${r.lessonId}`} onClick={closeAll}
                  style={{ display: 'block', padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', textDecoration: 'none', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 16, color: '#f5f1e8', fontWeight: 600 }}>{r.zh}</span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'rgba(200,191,176,0.6)' }}>{r.py}</span>
                    {r.pos && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'rgba(200,191,176,0.4)', letterSpacing: '0.1em' }}>{r.pos}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(200,191,176,0.7)', marginTop: 1 }}>{r.vn}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', background: LEVEL_COLOR[r.level] ?? 'var(--ash)', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>{r.level}</span>
                    <span style={{ fontSize: 10, color: 'rgba(200,191,176,0.5)' }}>{r.lessonTitle}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Nav sections */}
        <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
          {SECTIONS.map(sec => {
            const isActive = currentSection === sec.key;
            return (
            <div key={sec.key}>
              {/* Section header */}
              <button
                onClick={() => toggleSection(sec.key)}
                style={{
                  width: '100%', padding: '10px 16px', border: 'none',
                  background: isActive ? 'rgba(255,255,255,0.08)' : 'none',
                  borderLeft: isActive ? `3px solid ${sec.color}` : '3px solid transparent',
                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                  color: isActive ? '#fff' : '#f5f1e8', fontSize: 13, fontWeight: isActive ? 700 : 600,
                  fontFamily: 'Be Vietnam Pro, sans-serif',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'none'; }}
              >
                <span style={{ width: 26, height: 26, borderRadius: 6, background: isActive ? sec.color + '55' : sec.color + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: sec.icon.length > 1 ? 13 : 14, fontFamily: 'Noto Serif SC, serif', color: isActive ? '#fff' : sec.color, flexShrink: 0 }}>
                  {sec.icon}
                </span>
                <span style={{ flex: 1, textAlign: 'left' }}>{sec.label}</span>
                <span style={{ fontSize: 10, color: isActive ? 'rgba(255,255,255,0.5)' : 'rgba(200,191,176,0.4)', transition: 'transform 0.2s', transform: expanded[sec.key] ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
              </button>

              {/* Section content */}
              {expanded[sec.key] && (
                <div style={{ paddingBottom: 4 }}>
                  {sec.key === 'reading' ? (
                    // Reading: link to /reading with HSK sub-groups
                    <div>
                      <Link href="/reading" onClick={closeAll}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 16px 4px 52px', textDecoration: 'none', color: 'rgba(200,191,176,0.6)', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', transition: 'color 0.1s' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#f5f1e8')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(200,191,176,0.6)')}>
                        Tất cả {mbLessons.length} bài →
                      </Link>
                      {[1,2,3,4,5].map(lvl => {
                        const grp = mbLessons.filter(l => l.hsk_level === lvl);
                        if (!grp.length) return null;
                        const lvlColor = LEVEL_COLOR[`HSK${lvl}`] ?? 'var(--ash-light)';
                        return (
                          <Link key={lvl} href={`/reading?hsk=${lvl}`} onClick={closeAll}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 16px 4px 52px', textDecoration: 'none', transition: 'background 0.1s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <span style={{ fontSize: 9.5, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.12em', color: lvlColor, textTransform: 'uppercase', fontWeight: 700 }}>HSK {lvl}</span>
                            <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(200,191,176,0.3)', marginLeft: 'auto' }}>{grp.length} bài →</span>
                          </Link>
                        );
                      })}
                    </div>
                  ) : sec.key === 'listen' ? (
                    <div style={{ padding: '4px 16px 8px 52px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Link href="/dictation" onClick={() => setOpen(false)} style={{ textDecoration: 'none', padding: '5px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <span style={{ fontSize: 11, color: 'rgba(200,191,176,0.5)' }}>🎙</span>
                        <span style={{ fontSize: 12, color: 'rgba(200,191,176,0.75)', fontFamily: 'Be Vietnam Pro, sans-serif' }}>Chép chính tả Tiếng Trung</span>
                      </Link>
                      <Link href="/dictation/align" onClick={() => setOpen(false)} style={{ textDecoration: 'none', padding: '5px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <span style={{ fontSize: 11, color: 'rgba(200,191,176,0.5)' }}>✂️</span>
                        <span style={{ fontSize: 12, color: 'rgba(200,191,176,0.75)', fontFamily: 'Be Vietnam Pro, sans-serif' }}>Cắt audio thủ công</span>
                      </Link>
                    </div>
                  ) : sec.key === 'grammar' ? (
                    <div>
                      {GRAMMAR_HSK_LEVELS.map(lvl => {
                        const n = grammarCounts[lvl] ?? 0;
                        if (!n) return null;
                        const lvlColor = LEVEL_COLOR[lvl] ?? 'var(--ash-light)';
                        return (
                          <Link key={lvl} href={`/grammar/hsk/${encodeURIComponent(lvl)}`} onClick={closeAll}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 16px 4px 52px', textDecoration: 'none', transition: 'background 0.1s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <span style={{ fontSize: 9.5, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.12em', color: lvlColor, textTransform: 'uppercase', fontWeight: 700 }}>{lvl}</span>
                            <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(200,191,176,0.3)', marginLeft: 'auto' }}>{n} điểm →</span>
                          </Link>
                        );
                      })}
                    </div>
                  ) : (
                    // Other sections (vocab, quiz, game): collapsible HSK sub-folders
                    HSK_LEVELS.map(lvl => {
                      const grp = grouped[lvl] ?? [];
                      if (grp.length === 0) return null;
                      const lvlColor = LEVEL_COLOR[lvl] ?? 'var(--ash-light)';
                      const subKey = `${sec.key}-${lvl}`;
                      const isSubOpen = subExpanded[subKey] ?? false;
                      const count = sec.key === 'vocab'
                        ? `${grp.reduce((s, l) => s + l.vocabCount, 0)} từ`
                        : `${grp.length}`;
                      return (
                        <div key={lvl}>
                          <button
                            onClick={() => toggleSub(subKey)}
                            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 16px 4px 46px', color: lvlColor }}
                          >
                            <span style={{ fontSize: 9, transition: 'transform 0.15s', transform: isSubOpen ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>▶</span>
                            <span style={{ fontSize: 9.5, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700 }}>{lvl}</span>
                            <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(200,191,176,0.3)', marginLeft: 'auto' }}>{count}</span>
                          </button>
                          {isSubOpen && (
                            <>
                              {sec.key === 'vocab' && (
                                <Link href={`/vocab/${lvl}`} onClick={closeAll}
                                  style={{ display: 'flex', alignItems: 'center', padding: '4px 14px 4px 66px', textDecoration: 'none', color: lvlColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace', transition: 'background 0.1s' }}
                                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                  <span style={{ fontSize: 9, color: 'rgba(200,191,176,0.25)', marginRight: 6, flexShrink: 0 }}>└</span>
                                  Tất cả từ vựng →
                                </Link>
                              )}
                              {grp.map(l => (
                                <Link
                                  key={l.id}
                                  href={lessonHref(sec.key, l.id)}
                                  onClick={closeAll}
                                  title={l.title}
                                  style={{ display: 'flex', alignItems: 'center', padding: '5px 14px 5px 66px', textDecoration: 'none', color: 'rgba(200,191,176,0.8)', fontSize: 12, transition: 'background 0.1s, color 0.1s' }}
                                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#f5f1e8'; }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(200,191,176,0.8)'; }}
                                >
                                  <span style={{ fontSize: 9, color: 'rgba(200,191,176,0.25)', marginRight: 6, flexShrink: 0 }}>└</span>
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</span>
                                </Link>
                              ))}
                            </>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '2px 16px' }} />
            </div>
            );
          })}
          {/* Notes link — after game section */}
          <Link href="/notes" onClick={closeAll}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
              textDecoration: 'none', border: 'none',
              background: pathname.startsWith('/notes') ? 'rgba(255,255,255,0.08)' : 'none',
              borderLeft: `3px solid ${pathname.startsWith('/notes') ? '#e09d3a' : 'transparent'}`,
              color: pathname.startsWith('/notes') ? '#fff' : '#f5f1e8',
              fontSize: 13, fontWeight: pathname.startsWith('/notes') ? 700 : 600,
              fontFamily: 'Be Vietnam Pro, sans-serif',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { if (!pathname.startsWith('/notes')) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            onMouseLeave={e => { if (!pathname.startsWith('/notes')) e.currentTarget.style.background = 'none'; }}>
            <span style={{ width: 26, height: 26, borderRadius: 6, background: pathname.startsWith('/notes') ? '#e09d3a55' : '#e09d3a33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>📝</span>
            <span>Ghi chú của tôi</span>
          </Link>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '2px 16px' }} />
        </nav>

        {/* Resize handle */}
        <div
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 5, cursor: 'col-resize', zIndex: 10 }}
          onMouseDown={e => {
            draggingRef.current = true;
            dragStartX.current = e.clientX;
            dragStartW.current = sidebarW;
            const onMove = (ev: MouseEvent) => {
              const next = Math.min(SIDEBAR_W_MAX, Math.max(SIDEBAR_W_MIN, dragStartW.current + ev.clientX - dragStartX.current));
              setSidebarW(next);
            };
            const onUp = () => {
              draggingRef.current = false;
              document.removeEventListener('mousemove', onMove);
              document.removeEventListener('mouseup', onUp);
              document.body.style.cursor = '';
              document.body.style.userSelect = '';
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        />

        {/* Footer links */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Link href="/" onClick={closeAll} style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'rgba(200,191,176,0.6)', fontSize: 12, transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#f5f1e8')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(200,191,176,0.6)')}>
            <span style={{ fontFamily: 'Noto Serif SC, serif' }}>⌂</span> Trang chủ
          </Link>
        </div>
      </aside>
    </>
  );
}
