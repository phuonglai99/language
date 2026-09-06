'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface NoteFolder { id: string; name: string; isSystem: boolean; createdAt: string; itemCount: number; }

export default function NotesPage() {
  const router = useRouter();
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  useEffect(() => {
    fetch('/api/notes/folders').then(r => r.json()).then(d => setFolders(d.folders ?? []));
  }, []);

  async function createFolder() {
    if (!newFolderName.trim()) return;
    const r = await fetch('/api/notes/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFolderName }),
    });
    const d = await r.json();
    setFolders(f => [...f, d.folder]);
    setNewFolderName('');
    setCreatingFolder(false);
    router.push(`/notes/${d.folder.id}`);
  }

  return (
    <div style={{ minHeight: '100vh', background: 'transparent' }}>
      {/* Header */}
      <header style={{ background: '#1e3a8a', position: 'sticky', top: 0, zIndex: 40, boxShadow: '0 2px 12px rgba(0,0,0,0.25)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href="/" style={{ textDecoration: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 13, flexShrink: 0, transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}>← Về trang chủ</Link>
          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)' }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>📝 Ghi chú của tôi</span>
          <div style={{ marginLeft: 'auto' }}>
            {creatingFolder ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setCreatingFolder(false); }}
                  placeholder="Tên folder…"
                  style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, outline: 'none', width: 180 }}
                />
                <button onClick={createFolder} style={{ padding: '6px 14px', background: '#fff', color: '#1e3a8a', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Tạo</button>
                <button onClick={() => setCreatingFolder(false)} style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Huỷ</button>
              </div>
            ) : (
              <button onClick={() => setCreatingFolder(true)}
                style={{ padding: '7px 16px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}>
                + Tạo folder mới
              </button>
            )}
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        {folders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--ash)' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>📁</div>
            <p style={{ fontSize: 15 }}>Chưa có folder nào.<br />Tạo folder đầu tiên để bắt đầu lưu từ vựng.</p>
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
                  </div>
                  {/* Card bottom */}
                  <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--ash)' }}>
                      {f.itemCount} từ
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>Xem →</span>
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
