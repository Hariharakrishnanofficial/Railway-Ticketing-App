import { useState } from 'react';
import { Icon, Badge, EmptyState, SkeletonRow, ConfirmDialog } from './UI';

/**
 * resolveValue(row, key) → display value
 * Pages pass this to handle Zoho's unpredictable field name casing.
 * Falls back to row[key] if not provided.
 */
export default function CRUDTable({
  columns, rows, loading,
  onEdit, onDelete, onConfirm, onMarkPaid,
  resolveValue,
}) {
  const [confirm, setConfirm]           = useState(null); // { row, action: 'delete' | 'confirm' | 'paid' }

  const getValue = (row, key) => {
    if (resolveValue) return resolveValue(row, key);
    return row[key] ?? '—';
  };

  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {columns.map((col) => (
                <th key={col.key} style={{
                  padding: '10px 16px', textAlign: 'left',
                  fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap',
                }}>
                  {col.label}
                </th>
              ))}
              <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={columns.length} />)
              : rows.length === 0
                ? (
                  <tr>
                    <td colSpan={columns.length + 1}>
                      <EmptyState icon="info" title="No records found" description="Add a record using the button above." />
                    </td>
                  </tr>
                )
                : rows.map((row, i) => (
                  <tr
                    key={row.ID || row.id || i}
                    style={{
                      borderBottom: '1px solid #0e1420',
                      background: i % 2 === 0 ? 'var(--bg-inset)' : 'transparent',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#0f1825'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = i % 2 === 0 ? 'var(--bg-inset)' : 'transparent'; }}
                  >
                    {columns.map((col) => {
                      const val = getValue(row, col.key);
                      return (
                        <td key={col.key} style={{ padding: '13px 16px', fontSize: 13, whiteSpace: 'nowrap' }}>
                          {col.badge ? (
                            <Badge status={String(val ?? '')} />
                          ) : col.mono ? (
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
                              {val ?? '—'}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 220 }}>
                              {String(val ?? '—')}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        {onConfirm && (row.Booking_Status ?? row.booking_status) !== 'confirmed' && (
                          <ActionBtn onClick={() => setConfirm({ row, action: 'confirm' })} icon="check" color="#4ade80" bg="#0f2a1e" border="#22c55e30" title="Confirm booking" />
                        )}
                        {onMarkPaid && (row.Payment_Status ?? row.payment_status) !== 'paid' && (
                          <ActionBtn onClick={() => setConfirm({ row, action: 'paid' })} icon="dollar" color="#60a5fa" bg="#0f1a2a" border="#3b82f630" title="Mark as paid" />
                        )}
                        <ActionBtn onClick={() => onEdit(row)} icon="edit" color="#60a5fa" bg="#0f1a2a" border="#3b82f630" title="Edit" />
                        <ActionBtn onClick={() => setConfirm({ row, action: 'delete' })} icon="trash" color="#f87171" bg="#2a0f0f" border="#ef444430" title="Delete" />
                      </div>
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>

      {confirm && confirm.action === 'confirm' && (
        <ConfirmDialog
          title="Confirm Booking"
          message="Mark this booking as confirmed?"
          confirmLabel="Yes, Confirm"
          accent="#22c55e"
          onConfirm={() => { onConfirm(confirm.row); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}

      {confirm && confirm.action === 'paid' && (
        <ConfirmDialog
          title="Mark as Paid"
          message="Mark this booking's payment status as paid?"
          confirmLabel="Yes, Mark Paid"
          accent="#60a5fa"
          onConfirm={() => { onMarkPaid(confirm.row); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}

      {confirm && confirm.action === 'delete' && (
        <ConfirmDialog
          danger
          title="Delete Record"
          message="This action is permanent and cannot be undone."
          onConfirm={() => { onDelete(confirm.row); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

function ActionBtn({ onClick, icon, color, bg, border, title }) {
  return (
    <button onClick={onClick} title={title} style={{
      padding: '6px 8px', borderRadius: 8,
      background: bg, border: `1px solid ${border}`,
      color, cursor: 'pointer', display: 'flex', alignItems: 'center',
      transition: 'opacity 0.15s',
    }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7'; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
    >
      <Icon name={icon} size={14} />
    </button>
  );
}