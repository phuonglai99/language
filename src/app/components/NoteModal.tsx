'use client';
import HanziZoom from '@/app/components/HanziZoom';
import { useState } from 'react';
import { t } from '@/i18n';
import { addLocalNoteItem, createLocalNoteFolder, listLocalNoteFolders, type LocalNoteFolder } from '@/lib/localNotes';

interface WordInfo { zh: string; py: string; vn: string; pos: string; sourceLessonId?: string; }

export default function NoteModal({ word, onClose }: { word: WordInfo; onClose: () => void }) {
  const [folders, setFolders] = useState<LocalNoteFolder[]>(() => listLocalNoteFolders());
  const [selectedId, setSelectedId] = useState<string>(() => {
    const localFolders = listLocalNoteFolders();
    return localFolders.find(folder => !folder.isSystem)?.id ?? localFolders[0]?.id ?? '';
  });
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  function createFolder() {
    if (!newName.trim()) return;
    const folder = createLocalNoteFolder(newName);
    if (!folder) { setError(t.notes.local.storageError); return; }
    setFolders(f => [...f, folder]);
    setSelectedId(folder.id);
    setNewName('');
    setCreating(false);
  }

  function save() {
    if (!selectedId) return;
    setSaving(true);
    const ok = addLocalNoteItem(selectedId, {
      sourceKey: `manual:${word.sourceLessonId ?? 'dictionary'}:${word.zh}:${word.py}`.slice(0, 240),
      zh: word.zh, py: word.py, vn: word.vn, pos: word.pos, sourceLessonId: word.sourceLessonId ?? null,
    });
    setSaving(false);
    if (!ok) { setError(t.notes.local.storageError); return; }
    setSaved(true);
    setTimeout(onClose, 800);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} />
      <div style={{ position: 'relative', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '24px', width: 'min(360px, 90vw)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}
        onClick={e => e.stopPropagation()}>

        {/* Word preview */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 32, fontWeight: 700, color: 'var(--ink)' }}><HanziZoom text={word.zh} pinyin={word.py} meaning={word.vn} /></span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: 'var(--blue)' }}>{word.py}</span>
          <span style={{ fontSize: 13, color: 'var(--ink-soft)', flex: 1 }}>{word.vn}</span>
        </div>

        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ash)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t.notes.modal.heading}</div>
        <div style={{ margin: '-4px 0 12px', fontSize: 11.5, color: 'var(--ash)' }}>{t.notes.local.localOnly}</div>

        {/* Folder list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14, maxHeight: 200, overflowY: 'auto' }}>
          {folders.map(f => (
            <button key={f.id} onClick={() => setSelectedId(f.id)}
              style={{ padding: '10px 14px', border: `1.5px solid ${selectedId === f.id ? 'var(--blue)' : 'var(--border)'}`, borderRadius: 8,
                background: selectedId === f.id ? 'rgba(59,130,246,0.1)' : 'var(--paper-alt)',
                cursor: 'pointer', textAlign: 'left', fontSize: 14, color: 'var(--ink)',
                display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.12s' }}>
              {f.isSystem ? '⚠️' : '📁'} {f.name}
              {selectedId === f.id && <span style={{ marginLeft: 'auto', color: 'var(--blue)', fontSize: 16 }}>✓</span>}
            </button>
          ))}

          {creating ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setCreating(false); }}
                placeholder={t.notes.modal.newFolderPlaceholder}
                style={{ flex: 1, padding: '8px 12px', border: '1.5px solid var(--blue)', borderRadius: 8, background: 'var(--paper-alt)', color: 'var(--ink)', fontSize: 13, outline: 'none' }} />
              <button onClick={createFolder} style={{ padding: '8px 12px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>{t.notes.modal.ok}</button>
            </div>
          ) : (
            <button onClick={() => setCreating(true)}
              style={{ padding: '8px 14px', border: '1.5px dashed var(--border)', borderRadius: 8, background: 'transparent', color: 'var(--ash)', cursor: 'pointer', fontSize: 13, textAlign: 'left' }}>
              {t.notes.modal.newFolder}
            </button>
          )}
        </div>

        {error && <p role="alert" style={{ margin: '0 0 12px', color: 'var(--red)', fontSize: 12.5 }}>{error}</p>}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card-bg)', cursor: 'pointer', fontSize: 14, color: 'var(--ash)' }}>{t.notes.actions.cancel}</button>
          <button onClick={save} disabled={!selectedId || saving || saved}
            style={{ flex: 2, padding: '10px', border: 'none', borderRadius: 8,
              background: saved ? 'var(--green)' : 'var(--blue)', color: '#fff',
              cursor: !selectedId || saving || saved ? 'default' : 'pointer',
              fontSize: 14, fontWeight: 600, transition: 'background 0.2s' }}>
            {saved ? t.notes.modal.saved : saving ? t.common.saving : t.common.saveToNotes}
          </button>
        </div>
      </div>
    </div>
  );
}
