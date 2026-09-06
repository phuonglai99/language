'use client';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  accent?: string;
  total?: number;
  pageSize?: number;
}

export function Pagination({ currentPage, totalPages, onPageChange, accent = '#3b82f6', total, pageSize }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
    .reduce<(number | '…')[]>((acc, p, idx, arr) => {
      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('…');
      acc.push(p);
      return acc;
    }, []);

  const btnBase: React.CSSProperties = {
    border: 'none', borderRadius: 18, cursor: 'pointer',
    fontSize: 13, fontWeight: 400, transition: 'all 0.12s',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          style={{ ...btnBase, padding: '8px 18px', background: currentPage === 1 ? 'var(--border)' : 'var(--card-bg)', color: currentPage === 1 ? 'var(--ash-light)' : 'var(--ink)', cursor: currentPage === 1 ? 'default' : 'pointer', boxShadow: currentPage === 1 ? 'none' : '0 1px 4px rgba(0,0,0,0.08)' }}>
          ← Trước
        </button>

        {pages.map((p, i) =>
          p === '…'
            ? <span key={`e${i}`} style={{ color: 'var(--ash-light)', fontSize: 13, padding: '0 4px' }}>…</span>
            : <button key={p}
                onClick={() => onPageChange(p as number)}
                style={{ ...btnBase, width: 36, height: 36, background: currentPage === p ? accent : 'var(--card-bg)', color: currentPage === p ? '#fff' : 'var(--ink)', fontWeight: currentPage === p ? 700 : 400, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                {p}
              </button>
        )}

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          style={{ ...btnBase, padding: '8px 18px', background: currentPage === totalPages ? 'var(--border)' : 'var(--card-bg)', color: currentPage === totalPages ? 'var(--ash-light)' : 'var(--ink)', cursor: currentPage === totalPages ? 'default' : 'pointer', boxShadow: currentPage === totalPages ? 'none' : '0 1px 4px rgba(0,0,0,0.08)' }}>
          Sau →
        </button>
      </div>

      {total !== undefined && pageSize !== undefined && (
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--ash-light)' }}>
          Trang {currentPage}/{totalPages} · {total} mục
        </div>
      )}
    </div>
  );
}
