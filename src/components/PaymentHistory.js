import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import BulkPaymentsModal from './BulkPaymentsModal';

const formatMonthYear = (year, month) =>
  new Date(year, month, 1)
    .toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    .replace(/^\w/, c => c.toUpperCase());

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Full-screen payment history for a property (by tenant) or a room (roomId).
 * Merges local property.payments with the Supabase payments table, and syncs
 * confirmed months missing locally through onSyncPayments so the monthly
 * "Historial" card (income / net) reflects them too.
 *
 * tenants: [{ id, name, amount }]
 */
export default function PaymentHistory({ propertyId, roomId = null, payments, tenants = [], onBulkConfirm, onSyncPayments, onBack }) {
  const [showBulk, setShowBulk] = useState(false);
  const [rows, setRows] = useState([]);

  const load = useCallback(async () => {
    let query = supabase
      .from('payments')
      .select('tenant_id, room_id, year, month, status, amount, partial_amount, confirmed_at, marked_at')
      .eq('property_id', String(propertyId));
    query = roomId !== null ? query.eq('room_id', String(roomId)) : query.is('room_id', null);
    const { data, error } = await query;
    if (!error && data) setRows(data);
  }, [propertyId, roomId]);

  useEffect(() => { load(); }, [load]);

  const tenantName = (id) => tenants.find(t => String(t.id) === String(id))?.name;
  const inScope = (p) => (roomId !== null ? p.roomId === roomId : !p.roomId);
  const sameEntry = (p, r) =>
    p.year === r.year && p.month === r.month &&
    (roomId !== null || String(p.tenantId) === String(r.tenant_id));

  // Add confirmed Supabase months that the local payments array doesn't know about
  useEffect(() => {
    if (!onSyncPayments || rows.length === 0) return;
    const missing = rows.filter(r =>
      r.status === 'confirmed' &&
      (roomId !== null || r.tenant_id) &&
      !payments.some(p => inScope(p) && sameEntry(p, r) && p.status === 'confirmed')
    );
    if (missing.length === 0) return;
    const updated = payments.filter(p => !(inScope(p) && missing.some(r => sameEntry(p, r))));
    missing.forEach(r => {
      const base = {
        year: r.year, month: r.month, status: 'confirmed',
        amount: r.amount, confirmedAt: r.confirmed_at, markedAt: r.marked_at,
      };
      updated.push(roomId !== null
        ? { ...base, roomId, tenantName: tenants[0]?.name }
        : { ...base, tenantId: r.tenant_id, tenantName: tenantName(r.tenant_id) });
    });
    onSyncPayments(updated);
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  // One entry per month (and tenant): Supabase row wins over local data
  const entries = [];
  payments.filter(inScope).forEach(p => {
    entries.push({
      year: p.year, month: p.month, status: p.status, amount: p.amount,
      tenantName: p.tenantName || tenantName(p.tenantId),
      markedAt: p.markedAt, confirmedAt: p.confirmedAt, tenantKey: p.tenantId,
    });
  });
  rows.forEach(r => {
    const e = {
      year: r.year, month: r.month, status: r.status, amount: r.amount,
      partialAmount: r.partial_amount,
      tenantName: roomId !== null ? tenants[0]?.name : tenantName(r.tenant_id),
      markedAt: r.marked_at, confirmedAt: r.confirmed_at, tenantKey: r.tenant_id,
    };
    const idx = entries.findIndex(x => x.year === e.year && x.month === e.month &&
      (roomId !== null || String(x.tenantKey) === String(e.tenantKey)));
    if (idx >= 0) entries[idx] = { ...entries[idx], ...e, tenantName: e.tenantName || entries[idx].tenantName };
    else entries.push(e);
  });
  entries.sort((a, b) => (b.year - a.year) || (b.month - a.month));

  const badge = (status) => {
    if (status === 'confirmed') return { cls: 'green', label: 'Pagado' };
    if (status === 'partial') return { cls: 'orange', label: 'Pago parcial' };
    return { cls: 'orange', label: 'Pendiente' };
  };

  const handleBulkConfirm = async (...args) => {
    const result = await onBulkConfirm(...args);
    await load();
    return result;
  };

  return (
    <div className="payment-history-container">
      <div className="detail-header">
        <button className="back-button" onClick={onBack}>←</button>
        <h1 className="detail-title">Historial de pagos</h1>
      </div>

      {tenants.length > 0 && onBulkConfirm && (
        <div style={{ padding: '16px 16px 0' }}>
          <button className="payment-history-btn" onClick={() => setShowBulk(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <polyline points="9 16 11 18 15 14" />
            </svg>
            Registrar meses pagados
          </button>
        </div>
      )}

      {showBulk && (
        <BulkPaymentsModal
          propertyId={propertyId}
          roomId={roomId}
          tenants={tenants}
          localPayments={payments}
          onConfirm={handleBulkConfirm}
          onClose={() => setShowBulk(false)}
        />
      )}

      <div className="payment-history-list">
        {entries.length === 0 ? (
          <div className="no-payments">
            <p>No hay pagos registrados todavía</p>
          </div>
        ) : (
          entries.map((payment) => {
            const b = badge(payment.status);
            return (
              <div key={`${payment.year}-${payment.month}-${payment.tenantKey || ''}`} className="payment-history-item">
                <div className="payment-month">
                  <h3>{formatMonthYear(payment.year, payment.month)}</h3>
                  <span className={`payment-status-badge ${b.cls}`}>{b.label}</span>
                </div>
                <div className="payment-details">
                  {payment.tenantName && (
                    <div className="payment-detail-row">
                      <span className="detail-label">Inquilino:</span>
                      <span>{payment.tenantName}</span>
                    </div>
                  )}
                  {payment.amount != null && (
                    <div className="payment-detail-row">
                      <span className="detail-label">Importe:</span>
                      <span>
                        {payment.status === 'partial' && payment.partialAmount != null
                          ? `${Number(payment.partialAmount).toFixed(2)} € de ${Number(payment.amount).toFixed(2)} €`
                          : `${Number(payment.amount).toFixed(2)} €`}
                      </span>
                    </div>
                  )}
                  {payment.status === 'confirmed' && payment.confirmedAt && (
                    <div className="payment-detail-row">
                      <span className="detail-label">Confirmado:</span>
                      <span>{formatDate(payment.confirmedAt)}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
