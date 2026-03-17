/**
 * AdminMasterLayout — Reusable admin data-management layout.
 *
 * Features:
 *  - Page header with title and "Add New" button
 *  - Live search/filter bar
 *  - Sortable column headers (click to toggle asc/desc)
 *  - Row hover with inline Edit/Delete action buttons
 *  - Bulk select via checkboxes (header to select all) + bulk delete
 *  - Pagination (configurable per-page: 25/50/100)
 *  - Slide-in right panel for Add/Edit forms (animated, with backdrop)
 *  - Delete confirmation modal
 *  - Empty-state illustration
 *  - ARIA roles and keyboard-accessible controls
 *
 * Usage:
 *   <AdminMasterLayout
 *     title="Stations"
 *     icon="📍"
 *     columns={[{ key: 'Station_Code', label: 'Code', sortable: true }, ...]}
 *     rows={stations}
 *     renderCell={(row, colKey) => row[colKey]}  // optional custom cell renderer
 *     renderForm={(row, onClose) => <MyForm row={row} onClose={onClose} />}
 *     onDelete={(ids) => deleteStations(ids)}
 *     loading={loading}
 *     searchKeys={['Station_Code', 'Station_Name']}
 *   />
 */
import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Tokens ───────────────────────────────────────────────────────────────────
const T = {
  font:    "'Inter', system-ui, sans-serif",
  bg:      '#0a0d14',
  surface: '#111827',
  raised:  '#1a2235',
  border:  '#1e2433',
  blue:    '#2E5FB3',
  red:     '#dc2626',
  green:   '#16a34a',
  text:    '#f9fafb',
  muted:   '#9ca3af',
  faint:   '#6b7280',
};

const PER_PAGE_OPTIONS = [25, 50, 100];

// ─── DeleteConfirmModal ───────────────────────────────────────────────────────
function DeleteConfirmModal({ count, onConfirm, onCancel }) {
  return (
    <div
      role="dialog" aria-modal="true" aria-label="Confirm deletion"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14,
        padding: 28, maxWidth: 380, width: '100%', fontFamily: T.font,
        boxShadow: '0 16px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: 32, marginBottom: 12, textAlign: 'center' }}>🗑️</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.text, textAlign: 'center', marginBottom: 8 }}>
          Delete {count} record{count > 1 ? 's' : ''}?
        </div>
        <div style={{ fontSize: 13, color: T.muted, textAlign: 'center', marginBottom: 24 }}>
          This action cannot be undone. The record{count > 1 ? 's' : ''} will be permanently removed.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel}
            style={{
              flex: 1, padding: '10px', borderRadius: 8, border: `1px solid ${T.border}`,
              background: 'transparent', color: T.muted, cursor: 'pointer',
              fontSize: 13, fontWeight: 600, fontFamily: T.font,
            }}>Cancel</button>
          <button onClick={onConfirm}
            style={{
              flex: 1, padding: '10px', borderRadius: 8, border: 'none',
              background: T.red, color: '#fff', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, fontFamily: T.font,
            }}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ─── SlidePanel ───────────────────────────────────────────────────────────────
function SlidePanel({ title, onClose, children }) {
  const panelRef = useRef(null);

  // Trap focus inside panel
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = panel.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusable[0]?.focus();
    const handleKey = e => {
      if (e.key !== 'Tab') return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
        e.preventDefault();
        (e.shiftKey ? last : first)?.focus();
      }
    };
    panel.addEventListener('keydown', handleKey);
    return () => panel.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 900,
          animation: 'fadein 0.2s ease',
        }}
      />
      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 420,
          maxWidth: '100vw', background: T.surface, borderLeft: `1px solid ${T.border}`,
          zIndex: 1000, display: 'flex', flexDirection: 'column',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.4)',
          animation: 'slideInRight 0.22s ease',
          fontFamily: T.font,
        }}
      >
        <style>{`
          @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
          @keyframes fadein { from { opacity: 0; } to { opacity: 1; } }
        `}</style>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: `1px solid ${T.border}`, flexShrink: 0,
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{title}</div>
          <button
            onClick={onClose}
            aria-label="Close panel"
            style={{
              width: 30, height: 30, borderRadius: 7, border: `1px solid ${T.border}`,
              background: 'transparent', color: T.faint, cursor: 'pointer', fontSize: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {children}
        </div>
      </div>
    </>
  );
}

// ─── SkeletonRow ──────────────────────────────────────────────────────────────
function SkeletonRow({ cols }) {
  return (
    <tr>
      <td style={{ padding: '12px 14px', width: 36 }}>
        <div style={{ width: 16, height: 16, borderRadius: 4, background: T.border }} />
      </td>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={{ padding: '12px 14px' }}>
          <div style={{ height: 14, borderRadius: 4, background: T.border, width: `${50 + (i % 3) * 20}%` }} />
        </td>
      ))}
      <td style={{ padding: '12px 14px', width: 90 }} />
    </tr>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AdminMasterLayout({
  title       = 'Records',
  icon        = '📋',
  columns     = [],
  rows        = [],
  renderCell  = (row, key) => row[key],
  renderForm,
  onDelete,
  loading     = false,
  searchKeys  = [],
  onRefresh,
}) {
  const [search,    setSearch]    = useState('');
  const [sortKey,   setSortKey]   = useState(columns[0]?.key || '');
  const [sortDir,   setSortDir]   = useState('asc');  // 'asc' | 'desc'
  const [selected,  setSelected]  = useState(new Set());
  const [page,      setPage]      = useState(1);
  const [perPage,   setPerPage]   = useState(25);
  const [panel,     setPanel]     = useState(null);   // null | { row, isNew }
  const [deleteTarget, setDeleteTarget] = useState(null); // null | Set<id>

  const getId = row => row.ID || row.id || JSON.stringify(row);

  // Filter
  const filtered = rows.filter(row => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (searchKeys.length ? searchKeys : columns.map(c => c.key)).some(k =>
      String(row[k] ?? '').toLowerCase().includes(q)
    );
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey] ?? '';
    const bv = b[sortKey] ?? '';
    const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
    return sortDir === 'asc' ? cmp : -cmp;
  });

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const safePage   = Math.min(page, totalPages);
  const paginated  = sorted.slice((safePage - 1) * perPage, safePage * perPage);

  // Reset page when search changes
  useEffect(() => { setPage(1); }, [search]);

  const toggleSort = key => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const toggleAll = () => {
    if (selected.size === paginated.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(paginated.map(r => getId(r))));
    }
  };

  const toggleRow = id => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulkDelete = () => setDeleteTarget(new Set(selected));
  const handleRowDelete  = row => setDeleteTarget(new Set([getId(row)]));

  const confirmDelete = async () => {
    if (onDelete && deleteTarget) await onDelete([...deleteTarget]);
    setSelected(new Set());
    setDeleteTarget(null);
  };

  const openAdd  = ()    => setPanel({ row: null, isNew: true });
  const openEdit = row   => setPanel({ row, isNew: false });
  const closePanel = ()  => setPanel(null);

  const allOnPageSelected = paginated.length > 0 && paginated.every(r => selected.has(getId(r)));

  return (
    <div style={{ fontFamily: T.font }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>{icon}</span>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: T.text }}>{title}</h1>
            <p style={{ margin: 0, fontSize: 12, color: T.faint }}>
              {loading ? 'Loading…' : `${filtered.length} record${filtered.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {onRefresh && (
            <button onClick={onRefresh}
              title="Refresh"
              style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: T.muted, cursor: 'pointer', fontSize: 13, fontFamily: T.font }}>
              ↺ Refresh
            </button>
          )}
          {renderForm && (
            <button onClick={openAdd}
              aria-label={`Add new ${title}`}
              style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: T.blue, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 6 }}>
              + Add New
            </button>
          )}
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${title.toLowerCase()}…`}
            aria-label={`Search ${title}`}
            style={{
              width: '100%', padding: '9px 12px 9px 36px', boxSizing: 'border-box',
              background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8,
              color: T.text, fontSize: 13, fontFamily: T.font, outline: 'none',
              transition: 'border-color 0.15s',
            }}
            onFocus={e  => e.target.style.borderColor = T.blue}
            onBlur={e   => e.target.style.borderColor = T.border}
          />
          <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: T.faint, fontSize: 14, pointerEvents: 'none' }}>⌕</span>
        </div>

        {/* Bulk delete */}
        {selected.size > 0 && (
          <button onClick={handleBulkDelete}
            style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid #991b1b`, background: '#2a0f0f', color: '#f87171', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 6 }}>
            🗑️ Delete {selected.size}
          </button>
        )}

        {/* Per-page */}
        <select
          value={perPage}
          onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
          aria-label="Rows per page"
          style={{
            padding: '8px 12px', background: T.bg, border: `1px solid ${T.border}`,
            borderRadius: 8, color: T.muted, fontSize: 12, fontFamily: T.font, cursor: 'pointer',
          }}
        >
          {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n} per page</option>)}
        </select>
      </div>

      {/* ── Table ── */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: T.font }} role="grid" aria-label={title}>
            <thead>
              <tr style={{ background: T.raised, borderBottom: `1px solid ${T.border}` }}>
                {/* Bulk select checkbox */}
                <th style={{ padding: '10px 14px', width: 36, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleAll}
                    aria-label="Select all on page"
                    style={{ accentColor: T.blue, width: 15, height: 15, cursor: 'pointer' }}
                  />
                </th>
                {columns.map(col => (
                  <th key={col.key}
                    onClick={col.sortable !== false ? () => toggleSort(col.key) : undefined}
                    aria-sort={sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    style={{
                      padding: '10px 14px', textAlign: 'left',
                      fontSize: 11, fontWeight: 600, color: sortKey === col.key ? T.blue : T.faint,
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                      cursor: col.sortable !== false ? 'pointer' : 'default',
                      userSelect: 'none', whiteSpace: 'nowrap',
                      transition: 'color 0.15s',
                    }}
                    onMouseEnter={e => { if (col.sortable !== false) e.currentTarget.style.color = T.muted; }}
                    onMouseLeave={e => { e.currentTarget.style.color = sortKey === col.key ? T.blue : T.faint; }}
                  >
                    {col.label}
                    {col.sortable !== false && (
                      <span style={{ marginLeft: 4, opacity: sortKey === col.key ? 1 : 0.35 }}>
                        {sortKey === col.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
                      </span>
                    )}
                  </th>
                ))}
                <th style={{ padding: '10px 14px', width: 90, textAlign: 'center',
                  fontSize: 11, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={columns.length} />)
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 2} style={{ padding: '52px 24px', textAlign: 'center' }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.faint }}>
                      {search ? 'No results match your search' : `No ${title.toLowerCase()} found`}
                    </div>
                    {!search && renderForm && (
                      <button onClick={openAdd} style={{
                        marginTop: 12, padding: '8px 20px', borderRadius: 8, border: 'none',
                        background: T.blue, color: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: T.font,
                      }}>Add First Record</button>
                    )}
                  </td>
                </tr>
              ) : paginated.map((row, i) => {
                const id = getId(row);
                const isSelected = selected.has(id);
                return (
                  <tr key={id}
                    aria-selected={isSelected}
                    style={{
                      background: isSelected ? `${T.blue}0f` : 'transparent',
                      borderBottom: `1px solid ${T.border}`,
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = `${T.raised}`; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(id)}
                        aria-label={`Select row ${i + 1}`}
                        style={{ accentColor: T.blue, width: 15, height: 15, cursor: 'pointer' }}
                      />
                    </td>
                    {columns.map(col => (
                      <td key={col.key} style={{ padding: '10px 14px', fontSize: 13, color: col.mono ? T.muted : T.text, fontFamily: col.mono ? "'JetBrains Mono', monospace" : T.font, maxWidth: col.maxWidth || 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {renderCell(row, col.key)}
                      </td>
                    ))}
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
                        {renderForm && (
                          <button onClick={() => openEdit(row)}
                            aria-label="Edit"
                            title="Edit"
                            style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${T.border}`, background: 'transparent', color: T.muted, cursor: 'pointer', fontSize: 12, fontFamily: T.font, transition: 'all 0.15s' }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = T.blue; e.currentTarget.style.color = '#60a5fa'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted; }}
                          >✏️</button>
                        )}
                        {onDelete && (
                          <button onClick={() => handleRowDelete(row)}
                            aria-label="Delete"
                            title="Delete"
                            style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${T.border}`, background: 'transparent', color: T.muted, cursor: 'pointer', fontSize: 12, fontFamily: T.font, transition: 'all 0.15s' }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = '#991b1b'; e.currentTarget.style.color = '#f87171'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted; }}
                          >🗑️</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {!loading && sorted.length > perPage && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', borderTop: `1px solid ${T.border}`, flexWrap: 'wrap', gap: 8,
          }}>
            <span style={{ fontSize: 12, color: T.faint, fontFamily: T.font }}>
              Showing {(safePage-1)*perPage+1}–{Math.min(safePage*perPage, sorted.length)} of {sorted.length}
            </span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <PageBtn label="«" onClick={() => setPage(1)}          disabled={safePage === 1} />
              <PageBtn label="‹" onClick={() => setPage(p => p-1)}  disabled={safePage === 1} />
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const mid   = Math.min(Math.max(safePage, 3), totalPages - 2);
                const p     = totalPages <= 5 ? i+1 : mid - 2 + i;
                return (
                  <PageBtn key={p} label={String(p)} onClick={() => setPage(p)} active={p === safePage} />
                );
              })}
              <PageBtn label="›" onClick={() => setPage(p => p+1)}         disabled={safePage === totalPages} />
              <PageBtn label="»" onClick={() => setPage(totalPages)}        disabled={safePage === totalPages} />
            </div>
          </div>
        )}
      </div>

      {/* ── Slide panel ── */}
      {panel && renderForm && (
        <SlidePanel
          title={panel.isNew ? `Add ${title.replace(/s$/, '')}` : `Edit ${title.replace(/s$/, '')}`}
          onClose={closePanel}
        >
          {renderForm(panel.row, closePanel)}
        </SlidePanel>
      )}

      {/* ── Delete confirmation ── */}
      {deleteTarget && (
        <DeleteConfirmModal
          count={deleteTarget.size}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ─── PageBtn helper ───────────────────────────────────────────────────────────
function PageBtn({ label, onClick, disabled, active }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? 'page' : undefined}
      style={{
        minWidth: 30, height: 30, padding: '0 8px', borderRadius: 6,
        border: `1px solid ${active ? '#2E5FB3' : '#1e2433'}`,
        background: active ? 'rgba(46,95,179,0.18)' : 'transparent',
        color: disabled ? '#374151' : active ? '#60a5fa' : '#9ca3af',
        cursor: disabled ? 'default' : 'pointer',
        fontSize: 12, fontFamily: "'Inter', system-ui, sans-serif",
        transition: 'all 0.12s',
      }}
    >{label}</button>
  );
}
