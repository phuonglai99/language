'use client';
import HanziZoom from '@/app/components/HanziZoom';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import type { VocabCard } from '@/types';
import { Pagination } from '@/app/components/Pagination';
import QuizMode from '../../lesson/[id]/QuizMode';
import { speakChinese } from '@/lib/speech';
import { t } from '@/i18n';
import {
  LOCAL_NOTES_CHANGED_EVENT, LOCAL_NOTES_STORAGE_KEY, deleteLocalNoteFolder, deleteLocalNoteItem, deleteLocalNoteItems, getLocalNoteFolder,
  listLocalNoteItems, renameLocalNoteFolder, type LocalNoteFolderWithCount, type LocalNoteItem,
} from '@/lib/localNotes';

const speak = (text: string) => { speakChinese(text); };

function noteItemToVocabCard(item: LocalNoteItem): VocabCard {
  return { id: item.id, zh: item.zh, py: item.py, vn: item.vn, pos: item.pos, botu: [], ex: { zh: '', vn: '' } };
}

// mode: null = default, 'select' = chọn từ (xoá / kiểm tra), 'quiz-pick' = chọn từ để kiểm tra
type Mode = null | 'select' | 'quiz-pick';

export default function NotesFolderPage() {
  const { id } = useParams<{ id: string }>();
  return <NotesFolderContent key={id} id={id} />;
}

function NotesFolderContent({ id }: { id: string }) {
  const router = useRouter();
  const [folder, setFolder] = useState<LocalNoteFolderWithCount | null>(null);
  const [items, setItems] = useState<LocalNoteItem[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState(false);
  const [quizVocab, setQuizVocab] = useState<VocabCard[] | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDeleteSelected, setConfirmDeleteSelected] = useState(false);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<string | null>(null);
  const [notesPage, setNotesPage] = useState(1);
  const NOTES_PAGE_SIZE = 24;

  useEffect(() => {
    const load = () => {
      setFolder(getLocalNoteFolder(id));
      setItems(listLocalNoteItems(id));
    };
    const onStorage = (event: StorageEvent) => { if (event.key === LOCAL_NOTES_STORAGE_KEY) load(); };
    load();
    window.addEventListener('storage', onStorage);
    window.addEventListener(LOCAL_NOTES_CHANGED_EVENT, load);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(LOCAL_NOTES_CHANGED_EVENT, load);
    };
  }, [id]);

  function exitMode() { setMode(null); setSelected(new Set()); setConfirmDeleteSelected(false); }

  function toggleItem(itemId: string) {
    setSelected(s => { const n = new Set(s); if (n.has(itemId)) n.delete(itemId); else n.add(itemId); return n; });
  }

  const allSelected = items.length > 0 && selected.size === items.length;
  function toggleSelectAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(items.map(i => i.id)));
  }

  function renameFolder() {
    if (!renameVal.trim() || !folder) { setRenamingId(null); return; }
    renameLocalNoteFolder(id, renameVal);
    setFolder(f => f ? { ...f, name: renameVal.trim() } : f);
    setRenamingId(null);
  }

  function deleteFolder() {
    deleteLocalNoteFolder(id);
    router.push('/notes');
  }

  function deleteItem(itemId: string) {
    deleteLocalNoteItem(itemId);
    setItems(i => i.filter(x => x.id !== itemId));
    setFolder(f => f ? { ...f, itemCount: Math.max(0, f.itemCount - 1) } : f);
    setConfirmDeleteItem(null);
  }

  function deleteSelected() {
    deleteLocalNoteItems(selected);
    const removed = selected.size;
    setItems(i => i.filter(x => !selected.has(x.id)));
    setFolder(f => f ? { ...f, itemCount: Math.max(0, f.itemCount - removed) } : f);
    exitMode();
  }

  function startQuizFromSelected() {
    const vocab = items.filter(i => selected.has(i.id)).map(noteItemToVocabCard);
    if (vocab.length < 2) return;
    setQuizVocab(vocab);
    exitMode();
  }

  if (quizVocab) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 40 }}>
        <div style={{ width: '100%', maxWidth: 720, padding: '0 24px' }}>
          <button onClick={() => setQuizVocab(null)} style={{ marginBottom: 20, padding: '8px 18px', border: '1px solid var(--border)', borderRadius: 20, background: 'var(--card-bg)', cursor: 'pointer', fontSize: 13, color: 'var(--ash)' }}>{t.notes.folder.backToNotes}</button>
          <QuizMode vocab={quizVocab} speak={speak} />
        </div>
      </div>
    );
  }

  // ── Header right buttons ───────────────────────────────────────────────────
  function renderHeaderActions() {
    if (items.length === 0) return null;

    if (mode === null) return (
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn ghost onClick={() => { setMode('select'); setSelected(new Set()); }}>{t.notes.folder.selectWords}</Btn>
        <Btn primary onClick={() => { setMode('quiz-pick'); setSelected(new Set(items.map(i => i.id))); }} disabled={items.length < 2}>{t.notes.folder.createQuiz}</Btn>
      </div>
    );

    if (mode === 'select') return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', flexShrink: 0 }}>{t.notes.folder.selectedCount(selected.size)}</span>
        <Btn ghost onClick={toggleSelectAll}>{allSelected ? t.notes.folder.deselectAll : t.notes.folder.selectAll}</Btn>
        <Btn danger onClick={() => setConfirmDeleteSelected(true)} disabled={selected.size === 0}>{t.notes.actions.delete}</Btn>
        <Btn primary onClick={startQuizFromSelected} disabled={selected.size < 2}>{t.notes.folder.quiz}</Btn>
        <Btn ghost onClick={exitMode}>{t.notes.actions.cancel}</Btn>
      </div>
    );

    if (mode === 'quiz-pick') return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{t.notes.folder.selectedCount(selected.size)}</span>
        <Btn ghost onClick={toggleSelectAll}>{allSelected ? t.notes.folder.deselectAll : t.notes.folder.selectAll}</Btn>
        <Btn primary onClick={startQuizFromSelected} disabled={selected.size < 2}>{t.common.start}</Btn>
        <Btn ghost onClick={exitMode}>{t.notes.actions.cancel}</Btn>
      </div>
    );

    return null;
  }

  return (
    <div style={{ minHeight: '100vh', background: 'transparent' }}>
      {/* Confirm delete selected — overlay */}
      {confirmDeleteSelected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setConfirmDeleteSelected(false)}>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, padding: '32px 36px', maxWidth: 360, width: '90%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🗑</div>
            <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>{t.notes.folder.deleteSelectedConfirm(selected.size)}</h3>
            <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--ash)' }}>{t.notes.folder.cannotUndo}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDeleteSelected(false)}
                style={{ flex: 1, padding: '11px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--paper-alt)', cursor: 'pointer', fontSize: 14, color: 'var(--ink)' }}>{t.notes.actions.cancel}</button>
              <button onClick={deleteSelected}
                style={{ flex: 1, padding: '11px', border: 'none', borderRadius: 10, background: 'var(--red)', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>{t.notes.actions.delete}</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header style={{ background: '#1e3a8a', position: 'sticky', top: 0, zIndex: 40, boxShadow: '0 2px 12px rgba(0,0,0,0.25)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'nowrap' }}>
          <Link href="/notes" style={{ textDecoration: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 13, flexShrink: 0, transition: 'color 0.15s', whiteSpace: 'nowrap' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}>{t.notes.folder.back}</Link>
          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)', flexShrink: 0 }} />

          {/* Folder name */}
          {renamingId === 'folder' ? (
            <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') renameFolder(); if (e.key === 'Escape') setRenamingId(null); }}
              onBlur={renameFolder}
              style={{ fontSize: 14, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 6, padding: '4px 10px', outline: 'none', minWidth: 0 }} />
          ) : (
            <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
              {folder?.isSystem ? '⚠️' : '📁'} {folder?.name ?? '…'}
              {folder?.isLocal && <span style={{ marginLeft: 8, fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(255,255,255,.65)' }}>{t.notes.local.onDevice}</span>}
            </span>
          )}

          {/* Folder edit/delete — only in default mode */}
          {folder && !folder.isSystem && mode === null && (
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              {confirmDeleteFolder ? (
                <>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', alignSelf: 'center', whiteSpace: 'nowrap' }}>{t.notes.folder.deleteFolderConfirm}</span>
                  <button onClick={deleteFolder} style={{ padding: '5px 10px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{t.notes.actions.delete}</button>
                  <button onClick={() => setConfirmDeleteFolder(false)} style={{ padding: '5px 8px', background: 'rgba(255,255,255,0.12)', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12 }}>{t.notes.actions.cancel}</button>
                </>
              ) : (
                <>
                  <button onClick={() => { setRenamingId('folder'); setRenameVal(folder.name); }}
                    style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}>✏️</button>
                  <button onClick={() => setConfirmDeleteFolder(true)}
                    style={{ padding: '4px 8px', background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.3)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.15)')}>🗑</button>
                </>
              )}
            </div>
          )}

          <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
            {renderHeaderActions()}
          </div>
        </div>

        {/* Quiz-pick mode hint bar */}
        {mode === 'quiz-pick' && (
          <div style={{ background: 'rgba(255,255,255,0.08)', borderTop: '1px solid rgba(255,255,255,0.1)', padding: '8px 24px', fontSize: 12, color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>
            {t.notes.folder.quizPickHint}
          </div>
        )}
        {mode === 'select' && (
          <div style={{ background: 'rgba(255,255,255,0.08)', borderTop: '1px solid rgba(255,255,255,0.1)', padding: '8px 24px', fontSize: 12, color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>
            {t.notes.folder.selectHint}
          </div>
        )}
      </header>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px' }}>
        {folder && (
          <p style={{ fontSize: 13, color: 'var(--ash)', marginBottom: 20 }}>{t.notes.folder.itemCount(items.length)}</p>
        )}

        {items.length === 0 && (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--ash)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📝</div>
            <p style={{ fontSize: 14 }}>{t.notes.folder.emptyTitle}<br />{t.notes.folder.emptyHint}</p>
          </div>
        )}

        {items.length > 0 && (() => {
          const totalNotesPages = Math.max(1, Math.ceil(items.length / NOTES_PAGE_SIZE));
          const curNotesPage = Math.min(notesPage, totalNotesPages);
          const pageItems = mode !== null ? items : items.slice((curNotesPage - 1) * NOTES_PAGE_SIZE, curNotesPage * NOTES_PAGE_SIZE);
          return (<>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {pageItems.map(item => {
              const isSelected = selected.has(item.id);
              const inMode = mode !== null;
              return (
                <div key={item.id}
                  onClick={() => { if (inMode) toggleItem(item.id); }}
                  style={{
                    display: 'flex', flexDirection: 'column',
                    background: 'var(--card-bg)',
                    border: `1.5px solid ${isSelected ? 'var(--blue)' : 'var(--border)'}`,
                    borderRadius: 14, overflow: 'hidden',
                    cursor: inMode ? 'pointer' : 'default',
                    transition: 'border-color 0.12s, box-shadow 0.12s, transform 0.1s',
                    boxShadow: isSelected ? '0 0 0 3px rgba(59,130,246,0.15)' : '0 1px 4px rgba(0,0,0,0.06)',
                    transform: isSelected ? 'translateY(-1px)' : 'none',
                    position: 'relative',
                  }}>
                  {/* Checkbox overlay in select/quiz-pick mode */}
                  {inMode && (
                    <div style={{ position: 'absolute', top: 10, left: 10, width: 20, height: 20, border: `2px solid ${isSelected ? 'var(--blue)' : 'var(--border)'}`, borderRadius: 5, background: isSelected ? 'var(--blue)' : 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
                      {isSelected && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                    </div>
                  )}

                  {/* Card body */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px 12px 12px', gap: 4, background: 'var(--paper-alt)' }}>
                    {item.pos && (
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--ash-light)', background: 'var(--border)', padding: '1px 5px', borderRadius: 3 }}>{item.pos}</span>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 44, fontWeight: 700, color: 'var(--ink)' }}><HanziZoom text={item.zh} pinyin={item.py} meaning={item.vn} /></span>
                      <button type="button" aria-label={t.common.speak} onClick={e => { e.stopPropagation(); speak(item.zh); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8 }}>🔊</button>
                    </div>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--blue)' }}>{item.py}</span>
                  </div>

                  {/* Card footer */}
                  <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6, minHeight: 44 }}>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--ink)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.vn}</span>
                    {!inMode && (
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        {item.sourceLessonId && (
                          <Link href={`/lesson/${item.sourceLessonId}?mode=list&word=${encodeURIComponent(item.zh)}`}
                            onClick={e => e.stopPropagation()}
                            title={t.notes.folder.goToLesson}
                            style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', fontSize: 12, color: 'var(--ash)', transition: 'background 0.1s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.15)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'var(--border)')}>→</Link>
                        )}
                        {confirmDeleteItem === item.id ? (
                          <>
                            <button onClick={e => { e.stopPropagation(); deleteItem(item.id); }}
                              style={{ height: 26, padding: '0 8px', borderRadius: 6, background: 'var(--red)', border: 'none', cursor: 'pointer', fontSize: 11, color: '#fff', fontWeight: 600 }}>{t.notes.actions.delete}</button>
                            <button onClick={e => { e.stopPropagation(); setConfirmDeleteItem(null); }}
                              style={{ height: 26, padding: '0 6px', borderRadius: 6, background: 'var(--border)', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--ash)' }}>✕</button>
                          </>
                        ) : (
                          <button onClick={e => { e.stopPropagation(); setConfirmDeleteItem(item.id); }}
                            title={t.notes.actions.delete}
                            style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--border)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--ash)', transition: 'background 0.1s, color 0.1s' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--red-light)'; e.currentTarget.style.color = 'var(--red)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--ash)'; }}>🗑</button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {mode === null && (
            <Pagination
              currentPage={curNotesPage}
              totalPages={totalNotesPages}
              onPageChange={p => setNotesPage(p)}
              accent="var(--blue)"
              total={items.length}
              pageSize={NOTES_PAGE_SIZE}
            />
          )}
          </>);
        })()}
      </div>
    </div>
  );
}

// ── Button helpers ─────────────────────────────────────────────────────────────
function Btn({ children, onClick, primary, danger, disabled }: {
  children: React.ReactNode; onClick?: () => void;
  primary?: boolean; danger?: boolean; ghost?: boolean; disabled?: boolean;
}) {
  const bg = disabled ? 'rgba(255,255,255,0.08)'
    : primary ? '#fff'
    : danger ? '#ef4444'
    : 'rgba(255,255,255,0.12)';
  const color = disabled ? 'rgba(255,255,255,0.3)'
    : primary ? '#1e3a8a'
    : '#fff';
  return (
    <button onClick={disabled ? undefined : onClick} style={{
      padding: '6px 14px', background: bg, color, border: 'none', borderRadius: 8,
      cursor: disabled ? 'default' : 'pointer', fontSize: 13, fontWeight: primary || danger ? 700 : 500,
      whiteSpace: 'nowrap', transition: 'background 0.15s',
    }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.opacity = '0.85'; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}>
      {children}
    </button>
  );
}
