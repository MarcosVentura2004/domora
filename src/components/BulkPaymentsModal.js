import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const BULK_MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// tenants: [{ id, name, amount }]. With roomId, payments are scoped to that room.
export default function BulkPaymentsModal({ propertyId, roomId = null, tenants, localPayments, onConfirm, onClose }) {
  const now = new Date();
  const [tenantId, setTenantId] = useState(tenants[0]?.id);
  const [year, setYear] = useState(now.getFullYear());
  const [selected, setSelected] = useState(new Set());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let query = supabase
      .from('payments')
      .select('tenant_id, room_id, year, month, status, partial_amount')
      .eq('property_id', String(propertyId));
    if (roomId !== null) query = query.eq('room_id', String(roomId));
    query.then(({ data, error: err }) => {
        if (err) setError('No se han podido cargar los pagos existentes.');
        setRows(data || []);
        setLoading(false);
      });
  }, [propertyId, roomId]);

  const tenant = tenants.find(t => t.id === tenantId);
  const rent = Number(tenant?.amount) || 0;
  const keyOf = (y, m) => `${y}-${m}`;

  // Rooms have a single rent per month, so any confirmed row for the room counts
  const matchesRow = (r) => roomId !== null || r.tenant_id === tenantId;
  const matchesLocal = (p) => (roomId !== null ? p.roomId === roomId : p.tenantId === tenantId);
  const isPaid = (y, m) =>
    rows.some(r => matchesRow(r) && r.year === y && r.month === m && r.status === 'confirmed') ||
    localPayments.some(p => matchesLocal(p) && p.year === y && p.month === m && p.status === 'confirmed');
  const isFuture = (y, m) => y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth());
  const selectable = (y, m) => !isPaid(y, m) && !isFuture(y, m);

  const toggle = (m) => {
    setSelected(prev => {
      const next = new Set(prev);
      const k = keyOf(year, m);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  const yearMonths = BULK_MONTH_LABELS.map((_, m) => m).filter(m => selectable(year, m));
  const allYearSelected = yearMonths.length > 0 && yearMonths.every(m => selected.has(keyOf(year, m)));
  const toggleYear = () => {
    setSelected(prev => {
      const next = new Set(prev);
      yearMonths.forEach(m => { if (allYearSelected) next.delete(keyOf(year, m)); else next.add(keyOf(year, m)); });
      return next;
    });
  };

  const changeTenant = (id) => { setTenantId(id); setSelected(new Set()); };

  const handleSave = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    setError('');
    const months = Array.from(selected).map(k => {
      const [y, m] = k.split('-').map(Number);
      return { year: y, month: m };
    });
    const { saved, failed } = await onConfirm(tenantId, months, rows);
    setSaving(false);
    if (failed > 0) {
      setError(`Se han guardado ${saved} meses, pero ${failed} han fallado. Inténtalo de nuevo.`);
      return;
    }
    onClose();
  };

  const count = selected.size;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Registrar meses pagados</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {tenants.length > 1 && (
          <div className="form-group">
            <label>Inquilino</label>
            <div className="frequency-options subcategory-options">
              {tenants.map(t => (
                <button key={t.id} type="button"
                  className={`frequency-option ${tenantId === t.id ? 'selected' : ''}`}
                  onClick={() => changeTenant(t.id)}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {tenants.length === 1 && (
          <p style={{ fontSize: 14, color: '#666', marginBottom: 16, marginTop: -8 }}>
            Inquilino: <strong>{tenant?.name}</strong>
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <button type="button" className="month-nav-btn" onClick={() => setYear(y => y - 1)} disabled={year <= 2020}>‹</button>
          <span style={{ fontWeight: 600, fontSize: 16 }}>{year}</span>
          <button type="button" className="month-nav-btn" onClick={() => setYear(y => y + 1)} disabled={year >= now.getFullYear()}>›</button>
        </div>

        {loading ? (
          <p style={{ fontSize: 13, color: '#888', textAlign: 'center', padding: '24px 0' }}>Cargando…</p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {BULK_MONTH_LABELS.map((label, m) => {
                const paid = isPaid(year, m);
                const future = isFuture(year, m);
                const isSel = selected.has(keyOf(year, m));
                return (
                  <button key={m} type="button" disabled={paid || future} onClick={() => toggle(m)}
                    style={{
                      padding: '10px 4px', borderRadius: 10, fontSize: 14,
                      border: isSel ? '2px solid #111' : paid ? '1px solid #C8E6C9' : '1px solid #ddd',
                      background: isSel ? '#111' : paid ? '#E8F5E9' : future ? '#f5f5f5' : 'white',
                      color: isSel ? 'white' : paid ? '#2E7D32' : future ? '#ccc' : '#333',
                      fontWeight: isSel || paid ? 600 : 400,
                      cursor: paid || future ? 'default' : 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    }}>
                    {label}
                    {paid && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>

            {yearMonths.length > 0 && (
              <button type="button" onClick={toggleYear}
                style={{ marginTop: 12, background: 'none', border: 'none', color: '#007AFF', fontSize: 14, fontWeight: 500, cursor: 'pointer', padding: 4 }}>
                {allYearSelected ? 'Quitar selección de este año' : `Marcar todo ${year}`}
              </button>
            )}

            <p style={{ fontSize: 12, color: '#888', marginTop: 8, lineHeight: 1.4 }}>
              Los meses en verde ya están pagados. Cada mes se registrará con la renta completa ({rent.toFixed(2)} €).
            </p>
          </>
        )}

        {error && <p style={{ fontSize: 13, color: '#C62828', marginTop: 10 }}>{error}</p>}

        <button type="button" className="submit-button" style={{ marginTop: 16 }}
          disabled={count === 0 || saving || loading} onClick={handleSave}>
          {saving
            ? 'Guardando…'
            : count === 0
              ? 'Selecciona los meses'
              : `Marcar ${count} ${count === 1 ? 'mes' : 'meses'} como pagado${count === 1 ? '' : 's'} · ${(rent * count).toFixed(0)} €`}
        </button>
      </div>
    </div>
  );
}
