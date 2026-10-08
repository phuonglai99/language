'use client';
import HanziZoom from '@/app/components/HanziZoom';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GRAMMAR_LEVEL_LABELS, UNLEVELED_LABEL } from '@/shared/grammar';
import { lessonGrammarHref } from '@/shared/lessons';
import { siteConfig, siteNameLines } from '@/config/site';
import { t } from '@/i18n';

type LessonMeta = {
  id: string; title: string; subtitle?: string; level: string;
  vocabCount: number; grammarCount: number;
};

type SearchResult = {
  /** null: dictionary word outside any lesson — shown, but not a link. */
  lessonId: string | null; lessonTitle: string; level: string;
  zh: string; py: string; vn: string; pos: string;
};

const LEVEL_COLOR: Record<string, string> = {
  HSK1: '#3a8a5c', HSK2: '#4a72a0', HSK3: '#a0720a',
  HSK4: '#c8392b', HSK5: '#7a3db0', HSK6: '#2a6080',
  'HSK7-9': '#2a6080', [UNLEVELED_LABEL]: '#6b7280',
};

const HSK_LEVELS = ['HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6'];
const GRAMMAR_HSK_LEVELS = GRAMMAR_LEVEL_LABELS;

const SECTIONS = [
  { key: 'vocab',    icon: '卡', label: t.common.features.vocab, color: '#c8392b' },
  { key: 'grammar',  icon: '文', label: t.common.features.grammar, color: '#a0720a' },
  { key: 'reading',  icon: '读', label: t.common.features.reading, color: '#3a8a5c' },
  { key: 'listen',   icon: '🎧', label: t.shell.sidebar.sections.listen, color: '#4a72a0' },
  { key: 'quiz',     icon: '测', label: t.common.features.quiz, color: '#4a72a0' },
  { key: 'game',     icon: '配', label: t.shell.sidebar.sections.game, color: '#7a3db0' },
];

function lessonHref(section: string, id: string): string {
  if (section === 'grammar') return lessonGrammarHref(id, '', 1);
  if (section === 'quiz')    return `/lesson/${id}?mode=quiz`;
  if (section === 'game')    return `/lesson/${id}?mode=match`;
  if (section === 'vocab')   return `/lesson/${id}?mode=list`;
  return `/lesson/${id}`;
}

type MBLessonCounts = {
  total: number;
  byHsk: Record<number, number>;
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
  const [dragging, setDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragStartW = useRef(SIDEBAR_W_DEFAULT);
  const [lessons, setLessons] = useState<LessonMeta[]>([]);
  const [mbCounts, setMbCounts] = useState<MBLessonCounts>({ total: 0, byHsk: {} });
  const [grammarCounts, setGrammarCounts] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ vocab: true, grammar: true });
  const [subExpanded, setSubExpanded] = useState<Record<string, boolean>>({ 'grammar-HSK2': true });
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composingRef = useRef(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  const [searchToast, setSearchToast] = useState('');

  useEffect(() => {
    fetch('/api/lessons').then(r => r.json()).then(d => setLessons(d.lessons ?? []));
    // Counts only: the sidebar shows totals, so there is no need to pull every lesson.
    fetch('/api/reading/counts').then(r => r.json()).then(d => setMbCounts({ total: d.total ?? 0, byHsk: d.byHsk ?? {} }));
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

  const [previousSection, setPreviousSection] = useState(currentSection);
  if (previousSection !== currentSection) {
    setPreviousSection(currentSection);
    if (currentSection) setExpanded(p => ({ ...p, [currentSection]: true }));
  }

  const doSearch = useCallback((q: string) => {
    searchAbortRef.current?.abort();
    if (!q.trim()) { setSearchResults([]); setSearching(false); return; }
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearching(true);
    setSearchToast('');
    fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error('Search failed'); return r.json(); })
      .then(d => {
        if (controller.signal.aborted) return;
        const results = d.results ?? [];
        setSearchResults(results);
        setSearching(false);
        if (!results.length) setSearchToast(t.shell.sidebar.search.noResults);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setSearching(false);
        setSearchResults([]);
        setSearchToast(t.shell.sidebar.search.error);
      });
  }, []);

  useEffect(() => {
    searchAbortRef.current?.abort();
    if (composingRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      searchAbortRef.current?.abort();
    };
  }, [query, doSearch]);

  useEffect(() => {
    if (!searchToast) return;
    const timer = setTimeout(() => setSearchToast(''), 4000);
    return () => clearTimeout(timer);
  }, [searchToast]);

  const grouped = HSK_LEVELS.reduce<Record<string, LessonMeta[]>>((acc, lvl) => {
    acc[lvl] = lessons.filter(l => l.level === lvl);
    return acc;
  }, {});

  const toggleSection = (key: string) =>
    setExpanded(p => ({ ...p, [key]: !p[key] }));

  const toggleSub = (key: string) =>
    setSubExpanded(p => ({ ...p, [key]: !p[key] }));

  const closeAll = () => { setQuery(''); setSearchResults([]); };
  const collapseSidebar = () => {
    closeAll();
    setOpen(false);
  };

  return (
    <>
      {searchToast && <div role="status" aria-live="polite" style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000, maxWidth: 360, padding: '12px 18px', borderRadius: 10, background: '#26344a', color: '#fff', boxShadow: '0 4px 20px #0003' }}>{searchToast}</div>}
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
          <button onClick={() => setOpen(true)} title={t.shell.sidebar.openMenu} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <img src={siteConfig.logo} alt={siteConfig.shortName} style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover', display: 'block' }} />
          </button>
          {/* Expand icon */}
          <button
            onClick={() => setOpen(true)}
            title={t.shell.sidebar.openMenu}
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
          <Link href="/notes" title={t.shell.sidebar.notes} style={{ width: 32, height: 32, borderRadius: 8, background: pathname.startsWith('/notes') ? '#e09d3a44' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, textDecoration: 'none' }}>
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
        transition: dragging ? 'none' : 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
        boxShadow: open ? '4px 0 24px rgba(0,0,0,0.2)' : 'none',
      }}>
        {/* Sidebar header */}
        <div style={{ padding: '14px 14px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Link href="/" onClick={closeAll} style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', flex: 1 }}>
              <img src={siteConfig.logo} alt={siteConfig.shortName} style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
              <span style={{ fontFamily: 'Be Vietnam Pro, sans-serif', fontSize: 13, fontWeight: 700, color: '#f5f1e8', lineHeight: 1.2 }}>{siteNameLines()[0]}{siteNameLines()[1] && <><br /><span style={{ color: 'var(--sidebar-text)', fontWeight: 400 }}>{siteNameLines()[1]}</span></>}</span>
            </Link>
            {/* Collapse button */}
            <button
              onClick={collapseSidebar}
              title={t.shell.sidebar.collapse}
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
              onChange={e => { searchAbortRef.current?.abort(); setSearchToast(''); setSearching(!!e.target.value.trim()); setQuery(e.target.value); }}
              onCompositionStart={() => { composingRef.current = true; searchAbortRef.current?.abort(); if (debounceRef.current) clearTimeout(debounceRef.current); }}
              onCompositionEnd={e => { composingRef.current = false; const value = (e.target as HTMLInputElement).value; setQuery(value); doSearch(value); }}
              placeholder={t.shell.sidebar.search.placeholder}
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
                <div style={{ padding: '12px 14px', color: 'rgba(200,191,176,0.6)', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>{t.shell.sidebar.search.searching}</div>
              )}
              {!searching && searchResults.length === 0 && (
                <div style={{ padding: '12px 14px', color: 'rgba(200,191,176,0.5)', fontSize: 12 }}>{t.shell.sidebar.search.noResults}</div>
              )}
              {!searching && searchResults.map((r, i) => (
                <Link key={i} href={r.lessonId ? `/lesson/${r.lessonId}?word=${encodeURIComponent(r.zh)}` : '#'}
                  onClick={e => { if (r.lessonId) closeAll(); else e.preventDefault(); }}
                  aria-disabled={!r.lessonId}
                  style={{ display: 'block', padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', textDecoration: 'none', transition: 'background 0.1s', cursor: r.lessonId ? 'pointer' : 'default' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 16, color: '#f5f1e8', fontWeight: 600 }}><HanziZoom text={r.zh} pinyin={r.py} meaning={r.vn} sourceLessonId={r.lessonId ?? undefined} /></span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'rgba(200,191,176,0.6)' }}>{r.py}</span>
                    {r.pos && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'rgba(200,191,176,0.4)', letterSpacing: '0.1em' }}>{r.pos}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(200,191,176,0.7)', marginTop: 1 }}>{r.vn}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    {r.level && <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', background: LEVEL_COLOR[r.level] ?? 'var(--ash)', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>{r.level}</span>}
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
                      {/* prefetch off: /reading renders every lesson card, too big to
                          pull down speculatively from the sidebar. */}
                      <Link href="/reading" prefetch={false} onClick={closeAll}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 16px 4px 52px', textDecoration: 'none', color: 'rgba(200,191,176,0.6)', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', transition: 'color 0.1s' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#f5f1e8')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(200,191,176,0.6)')}>
                        {t.shell.sidebar.reading.all(mbCounts.total)}
                      </Link>
                      {[1,2,3,4,5].map(lvl => {
                        const count = mbCounts.byHsk[lvl] ?? 0;
                        if (!count) return null;
                        const lvlColor = LEVEL_COLOR[`HSK${lvl}`] ?? 'var(--ash-light)';
                        return (
                          <Link key={lvl} href={`/reading?hsk=${lvl}`} prefetch={false} onClick={closeAll}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 16px 4px 52px', textDecoration: 'none', transition: 'background 0.1s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <span style={{ fontSize: 9.5, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.12em', color: lvlColor, textTransform: 'uppercase', fontWeight: 700 }}>HSK {lvl}</span>
                            <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(200,191,176,0.3)', marginLeft: 'auto' }}>{t.shell.sidebar.reading.levelCount(count)}</span>
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
                        <span style={{ fontSize: 12, color: 'rgba(200,191,176,0.75)', fontFamily: 'Be Vietnam Pro, sans-serif' }}>{t.shell.sidebar.listen.dictation}</span>
                      </Link>
                      <Link href="/dictation/align" onClick={() => setOpen(false)} style={{ textDecoration: 'none', padding: '5px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <span style={{ fontSize: 11, color: 'rgba(200,191,176,0.5)' }}>✂️</span>
                        <span style={{ fontSize: 12, color: 'rgba(200,191,176,0.75)', fontFamily: 'Be Vietnam Pro, sans-serif' }}>{t.common.features.align}</span>
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
                            <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(200,191,176,0.3)', marginLeft: 'auto' }}>{t.shell.sidebar.grammar.pointCount(n)}</span>
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
                        ? t.shell.sidebar.vocab.wordCount(grp.reduce((s, l) => s + l.vocabCount, 0))
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
                                  {t.shell.sidebar.vocab.allWords}
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
            <span>{t.shell.sidebar.notes}</span>
          </Link>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '2px 16px' }} />
        </nav>

        {/* Resize handle */}
        <div
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 5, cursor: 'col-resize', zIndex: 10 }}
          onMouseDown={e => {
            setDragging(true);
            dragStartX.current = e.clientX;
            dragStartW.current = sidebarW;
            const onMove = (ev: MouseEvent) => {
              const next = Math.min(SIDEBAR_W_MAX, Math.max(SIDEBAR_W_MIN, dragStartW.current + ev.clientX - dragStartX.current));
              setSidebarW(next);
            };
            const onUp = () => {
              setDragging(false);
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
            <span style={{ fontFamily: 'Noto Serif SC, serif' }}>⌂</span> {t.common.features.home}
          </Link>
        </div>
      </aside>
    </>
  );
}
