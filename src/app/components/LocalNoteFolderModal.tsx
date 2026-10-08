'use client';

import { useState } from 'react';
import { createLocalNoteFolder, listLocalNoteFolders, type LocalNoteFolder } from '@/lib/localNotes';
import { t } from '@/i18n';

export default function LocalNoteFolderModal({ selectedId, onSelect, onClose }: {
  selectedId?: string;
  onSelect: (folder: LocalNoteFolder) => void;
  onClose: () => void;
}) {
  const [folders, setFolders] = useState<LocalNoteFolder[]>(() => listLocalNoteFolders());
  const [choice, setChoice] = useState(() => {
    const localFolders = listLocalNoteFolders();
    return localFolders.some(folder => folder.id === selectedId) ? selectedId ?? '' : localFolders[0]?.id ?? '';
  });
  const [creating, setCreating] = useState(() => listLocalNoteFolders().length === 0);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  function createFolder() {
    const folder = createLocalNoteFolder(newName);
    if (!folder) { setError(t.practice.localNotes.storageError); return; }
    setFolders(value => [...value, folder]);
    setChoice(folder.id); setNewName(''); setCreating(false); setError('');
  }

  const selected = folders.find(folder => folder.id === choice);
  return <div role="presentation" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(2px)' }} />
    <section role="dialog" aria-modal="true" aria-labelledby="local-note-folder-title" onClick={event => event.stopPropagation()}
      style={{ position: 'relative', width: 'min(420px, 100%)', maxHeight: '85vh', overflowY: 'auto', padding: 24, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card-bg)', boxShadow: '0 20px 60px rgba(0,0,0,.35)' }}>
      <h2 id="local-note-folder-title" style={{ margin: 0, fontSize: 20 }}>{t.practice.localNotes.modalTitle}</h2>
      <p style={{ color: 'var(--ash)', fontSize: 13, lineHeight: 1.5 }}>{t.practice.localNotes.localOnly}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, margin: '16px 0' }}>
        {folders.map(folder => <button type="button" key={folder.id} onClick={() => setChoice(folder.id)}
          style={{ padding: '11px 13px', border: `1.5px solid ${choice === folder.id ? 'var(--blue)' : 'var(--border)'}`, borderRadius: 8, background: choice === folder.id ? 'rgba(59,130,246,.1)' : 'var(--paper-alt)', color: 'var(--ink)', cursor: 'pointer', textAlign: 'left' }}>
          📁 {folder.name}{choice === folder.id && <span style={{ float: 'right', color: 'var(--blue)' }}>✓</span>}
        </button>)}
        {creating ? <div style={{ display: 'flex', gap: 7 }}>
          <input autoFocus value={newName} onChange={event => { setNewName(event.target.value); setError(''); }} maxLength={100}
            onKeyDown={event => { if (event.key === 'Enter') createFolder(); if (event.key === 'Escape' && folders.length) setCreating(false); }}
            placeholder={t.practice.localNotes.newFolderPlaceholder}
            style={{ minWidth: 0, flex: 1, padding: '9px 11px', border: '1.5px solid var(--blue)', borderRadius: 8, background: 'var(--paper-alt)', color: 'var(--ink)' }} />
          <button type="button" onClick={createFolder} disabled={!newName.trim()} style={{ ...modalButton, background: 'var(--blue)', color: 'white' }}>{t.practice.localNotes.create}</button>
        </div> : <button type="button" onClick={() => setCreating(true)} style={{ ...modalButton, borderStyle: 'dashed', textAlign: 'left' }}>{t.practice.localNotes.newFolder}</button>}
      </div>
      {error && <p role="alert" style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onClose} style={modalButton}>{t.notes.actions.cancel}</button>
        <button type="button" disabled={!selected} onClick={() => { if (selected) onSelect(selected); }} style={{ ...modalButton, borderColor: 'var(--blue)', background: 'var(--blue)', color: 'white', opacity: selected ? 1 : .5 }}>{t.practice.localNotes.choose}</button>
      </div>
    </section>
  </div>;
}

const modalButton: React.CSSProperties = { padding: '9px 13px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--paper-alt)', color: 'var(--ink)', cursor: 'pointer', fontWeight: 600 };
