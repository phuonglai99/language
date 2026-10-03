'use client';
import { useState, useEffect } from 'react';
import { t } from '@/i18n';

interface NoteFolder { id: string; name: string; isSystem: boolean; }
interface WordInfo { zh: string; py: string; vn: string; pos: string; sourceLessonId?: string; }

export default function NoteModal({ word, onClose }: { word: WordInfo; onClose: () => void }) {
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/notes/folders').then(r => r.json()).then(d => {
      setFolders(d.folders ?? []);
      if (d.folders?.length) setSelectedId(d.folders[0].id);
    });
  }, []);

  async function createFolder() {
    if (!newName.trim()) return;
    const r = await fetch('/api/notes/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName }) });
    const d = await r.json();
    setFolders(f => [...f, d.folder]);
    setSelectedId(d.folder.id);
    setNewName('');
    setCreating(false);
  }

  async function save() {
    if (!selectedId) return;
    setSaving(true);
    await fetch('/api/notes/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId: selectedId, zh: word.zh, py: word.py, vn: word.vn, pos: word.pos, sourceLessonId: word.sourceLessonId }),
    });
    setSaving(false);
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
          <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 32, fontWeight: 700, color: 'var(--ink)' }}>{word.zh}</span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: 'var(--blue)' }}>{word.py}</span>
          <span style={{ fontSize: 13, color: 'var(--ink-soft)', flex: 1 }}>{word.vn}</span>
        </div>

        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ash)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t.notes.modal.heading}</div>

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
