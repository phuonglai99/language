'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { t } from '@/i18n';
import {
  LOCAL_NOTES_CHANGED_EVENT, LOCAL_NOTES_MAX_ITEMS, LOCAL_NOTES_SAFE_LIMIT_BYTES, LOCAL_NOTES_STORAGE_KEY, createLocalNoteFolder,
  listLocalNoteFolders, localNotesUsage, type LocalNoteFolderWithCount,
} from '@/lib/localNotes';

export default function NotesPage() {
  const router = useRouter();
  const [folders, setFolders] = useState<LocalNoteFolderWithCount[]>([]);
  const [usage, setUsage] = useState({ usedBytes: 0, limitBytes: LOCAL_NOTES_SAFE_LIMIT_BYTES, percent: 0, itemCount: 0, maxItems: LOCAL_NOTES_MAX_ITEMS });
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  useEffect(() => {
    const load = () => { setFolders(listLocalNoteFolders()); setUsage(localNotesUsage()); };
    const onStorage = (event: StorageEvent) => { if (event.key === LOCAL_NOTES_STORAGE_KEY) load(); };
    const onLocalChange = () => { load(); };
    load();
    window.addEventListener('storage', onStorage);
    window.addEventListener(LOCAL_NOTES_CHANGED_EVENT, onLocalChange);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener(LOCAL_NOTES_CHANGED_EVENT, onLocalChange); };
  }, []);

  function createFolder() {
    if (!newFolderName.trim()) return;
    const folder = createLocalNoteFolder(newFolderName);
    if (!folder) return;
    setNewFolderName('');
    setCreatingFolder(false);
    router.push(`/notes/${folder.id}`);
  }

  return (
    <div style={{ minHeight: '100vh', background: 'transparent' }}>
      {/* Header */}
      <header style={{ background: '#1e3a8a', position: 'sticky', top: 0, zIndex: 40, boxShadow: '0 2px 12px rgba(0,0,0,0.25)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href="/" style={{ textDecoration: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 13, flexShrink: 0, transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}>{t.common.backHome}</Link>
          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)' }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{t.notes.folders.title}</span>
          <div style={{ marginLeft: 'auto' }}>
            {creatingFolder ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setCreatingFolder(false); }}
                  placeholder={t.notes.folders.newFolderPlaceholder}
                  style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, outline: 'none', width: 180 }}
                />
                <button onClick={createFolder} style={{ padding: '6px 14px', background: '#fff', color: '#1e3a8a', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{t.notes.folders.create}</button>
                <button onClick={() => setCreatingFolder(false)} style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>{t.notes.actions.cancel}</button>
              </div>
            ) : (
              <button onClick={() => setCreatingFolder(true)}
                style={{ padding: '7px 16px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}>
                {t.notes.folders.newFolder}
              </button>
            )}
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ marginBottom: 20, padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--paper-alt)', color: 'var(--ash)', fontSize: 12.5 }}>
          <div>{t.notes.local.summary(usage.itemCount, usage.maxItems, formatBytes(usage.usedBytes))}</div>
          <div style={{ height: 5, marginTop: 8, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}><div style={{ width: `${usage.percent}%`, height: '100%', background: usage.percent >= 85 ? 'var(--red)' : 'var(--blue)' }} /></div>
        </div>
        {folders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--ash)' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>📁</div>
            <p style={{ fontSize: 15 }}>{t.notes.folders.emptyTitle}<br />{t.notes.folders.emptyHint}</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
            {folders.map(f => (
              <Link key={f.id} href={`/notes/${f.id}`} style={{ textDecoration: 'none' }}>
                <div style={{
                  background: 'var(--card-bg)', border: '1.5px solid var(--border)',
                  borderRadius: 16, overflow: 'hidden', cursor: 'pointer',
                  transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.15s',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                }}
                  onMouseEnter={e => { const d = e.currentTarget as HTMLDivElement; d.style.borderColor = 'var(--blue)'; d.style.boxShadow = '0 4px 16px rgba(59,130,246,0.15)'; d.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={e => { const d = e.currentTarget as HTMLDivElement; d.style.borderColor = 'var(--border)'; d.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'; d.style.transform = 'translateY(0)'; }}>
                  {/* Card top */}
                  <div style={{ padding: '28px 24px 20px', background: 'var(--paper-alt)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 40 }}>{f.isSystem ? '⚠️' : '📁'}</span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', textAlign: 'center' }}>{f.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--blue)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }}>{t.notes.local.onDevice}</span>
                  </div>
                  {/* Card bottom */}
                  <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--ash)' }}>
                      {t.notes.folders.wordCount(f.itemCount)}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{t.notes.folders.open}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}
