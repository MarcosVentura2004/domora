import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import './Calendario.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MONTH_NAMES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const DAY_NAMES_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// Colors for derived (read-only) event types
const EVENT_COLORS = {
  payment:  '#16A34A', // green
  expense:  '#EA580C', // orange
  incident: '#DC2626', // red
  contract: '#2563EB', // blue
};

// Palette offered in the manual-event color picker
const COLOR_PALETTE = [
  '#7C3AED', '#2563EB', '#0891B2',
  '#059669', '#D97706', '#DC2626',
];

const DERIVED_TYPE_LABELS = {
  payment:  'Pago',
  expense:  'Gasto',
  incident: 'Incidencia',
  contract: 'Fin de contrato',
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Returns an array of Date objects covering the full Mon–Sun weeks that
 * contain the first and last days of the given year/month (0-indexed).
 */
function getCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);

  // Offset to the Monday of the week containing the 1st
  const firstDow = firstDay.getDay(); // 0 = Sun
  const startOffset = firstDow === 0 ? 6 : firstDow - 1;
  const start = new Date(year, month, 1 - startOffset);

  // Offset to the Sunday of the week containing the last day
  const lastDow = lastDay.getDay();
  const endOffset = lastDow === 0 ? 0 : 7 - lastDow;
  const end = new Date(year, month + 1, endOffset);

  const days = [];
  const cur = new Date(start);
  while (cur <= end) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

/**
 * Returns all Date objects within (year, month) when a recurring expense fires.
 * Handles one-time and recurring types; respects skipped_months and duration_payments.
 *
 * Assumptions:
 *  - expense.frequency: 'mensual' | 'trimestral' | 'anual' | 'custom' | 'unico' | 'manual'
 *  - expense.type:      'puntual' | 'recurrente' | 'recurrente_temporal'
 *  - expense.skipped_months: array of 'YYYY-MM' strings
 *  - expense.custom_frequency_months: number of months for 'custom' frequency
 *  - expense.duration_payments: max number of occurrences for 'recurrente_temporal'
 */
function getExpenseDatesInMonth(expense, year, month) {
  if (!expense.start_date) return [];
  if (expense.active === false) return [];

  const startDate = new Date(expense.start_date + 'T00:00:00');
  const monthStart = new Date(year, month, 1);
  const monthEnd   = new Date(year, month + 1, 0);

  const freq = expense.frequency || 'mensual';
  const type = expense.type || 'recurrente';

  // One-time: only fires on start_date
  if (type === 'puntual' || freq === 'unico' || freq === 'manual') {
    if (startDate >= monthStart && startDate <= monthEnd) return [startDate];
    return [];
  }

  // Determine step in months
  let step = 1;
  if (freq === 'trimestral') step = 3;
  else if (freq === 'anual')  step = 12;
  else if (freq === 'custom') step = parseInt(expense.custom_frequency_months) || 1;

  const skipped = expense.skipped_months || [];

  // Max occurrences limit for recurrente_temporal
  const maxOccurrences =
    type === 'recurrente_temporal' && expense.duration_payments
      ? parseInt(expense.duration_payments)
      : Infinity;

  let cur = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  let occurrenceCount = 1;

  // Advance to the first occurrence >= monthStart
  while (cur < monthStart) {
    cur = new Date(cur.getFullYear(), cur.getMonth() + step, cur.getDate());
    occurrenceCount++;
    if (occurrenceCount > maxOccurrences) return [];
  }

  const dates = [];
  while (cur <= monthEnd) {
    if (occurrenceCount > maxOccurrences) break;
    const ym = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
    if (!skipped.includes(ym)) {
      dates.push(new Date(cur));
    }
    cur = new Date(cur.getFullYear(), cur.getMonth() + step, cur.getDate());
    occurrenceCount++;
  }
  return dates;
}

/** Format a Date as YYYY-MM-DD in local time */
function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Calendario({ userEmail, onBack }) {
  const today = new Date();

  // ── Navigation state ──────────────────────────────────────────────────────
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  // ── Auth / landlord ───────────────────────────────────────────────────────
  // landlordId stores auth.uid() which is used as landlord_id in calendar_events
  const [landlordId, setLandlordId] = useState(null);

  // ── Data loading ──────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  // Derived (read-only) event lists
  const [paymentEvents,  setPaymentEvents]  = useState([]);
  const [expenseEvents,  setExpenseEvents]  = useState([]);
  const [incidentEvents, setIncidentEvents] = useState([]);
  const [contractEvents, setContractEvents] = useState([]);

  // Manual events (calendar_events table)
  const [manualEvents, setManualEvents] = useState([]);

  // Properties list (for contract-end chips + modal selector)
  const [properties, setProperties] = useState([]);

  // ── Modal state ───────────────────────────────────────────────────────────
  // modal: null | { mode: 'create', date: Date } | { mode: 'edit', event: {} }
  const [modal,  setModal]  = useState(null);
  const [form,   setForm]   = useState({ title: '', description: '', property_id: '', color: COLOR_PALETTE[0] });
  const [saving, setSaving] = useState(false);

  // ── Tooltip for derived events ────────────────────────────────────────────
  // tooltip: null | { event: {} }
  const [tooltip, setTooltip] = useState(null);

  // ── Get auth user id ──────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setLandlordId(user.id);
    });
  }, []);

  // ── Fetch derived events (payments, expenses, incidents, contracts) ────────
  const fetchDerivedEvents = useCallback(async () => {
    if (!userEmail) return;
    setLoading(true);
    setError(null);

    const monthStartStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
    // Start of next month for open-ended filters
    const nextMonthDate  = new Date(viewYear, viewMonth + 1, 1);
    const nextMonthStr   = toLocalDateStr(nextMonthDate);

    try {
      const [
        { data: propertiesData, error: propErr },
        { data: payments,       error: payErr },
        { data: inquilinos,     error: inqErr },
        { data: expenses,       error: expErr },
        { data: incidents,      error: incErr },
      ] = await Promise.all([
        // Properties (for contract-end dates + modal selector)
        supabase
          .from('properties')
          .select('id, data')
          .eq('landlord_email', userEmail),

        // Payments for the current month
        // Note: 'year' and 'month' columns store numeric values (e.g. 2026, 5)
        supabase
          .from('payments')
          .select('id, year, month, status, tenant_id, room_id, tenant_name, property_id, amount')
          .eq('landlord_email', userEmail)
          .eq('year',  viewYear)
          .eq('month', viewMonth + 1), // month is 1-indexed in DB

        // Inquilinos to resolve payment_config.endDay per tenant
        supabase
          .from('inquilinos')
          .select('tenant_id, room_id, payment_config, tenant_name, property_name')
          .eq('landlord_email', userEmail),

        // All expenses (date filtering done client-side for frequency logic)
        supabase
          .from('expenses')
          .select('id, type, frequency, start_date, amount, description, active, property_id, custom_frequency_months, skipped_months, duration_payments')
          .eq('landlord_email', userEmail),

        // Incidents created this month
        // Assumption: created_at is used as the incident date (no separate incident_date column found)
        supabase
          .from('incidents')
          .select('id, description, status, created_at, property_id')
          .eq('landlord_email', userEmail)
          .gte('created_at', monthStartStr)
          .lt('created_at',  nextMonthStr),
      ]);

      if (propErr || payErr || inqErr || expErr || incErr) {
        throw new Error('Error en una o más consultas');
      }

      // ── Properties (contract-end chips + modal) ──────────────────────────
      const props = (propertiesData || []).map(r => r.data);
      setProperties(props);

      // ── Payments ─────────────────────────────────────────────────────────
      // Build a lookup: tenant key → payment_config.endDay
      // Key: room_id ? 'room_{room_id}' : 'tenant_{tenant_id}'
      const inqMap = {};
      (inquilinos || []).forEach(i => {
        const key = i.room_id ? `room_${i.room_id}` : `tenant_${i.tenant_id}`;
        inqMap[key] = i;
      });

      const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

      const pEvents = (payments || []).map(p => {
        const key = p.room_id ? `room_${p.room_id}` : `tenant_${p.tenant_id}`;
        const inq  = inqMap[key];
        // Use payment deadline day from payment_config; fallback to 5
        const endDay = Math.min(inq?.payment_config?.endDay || 5, daysInMonth);
        const statusLabel =
          p.status === 'confirmed' ? 'Confirmado' :
          p.status === 'pending'   ? 'Pendiente' :
          p.status === 'partial'   ? 'Parcial' :
          p.status === 'rejected'  ? 'Rechazado' : p.status;
        const name = p.tenant_name || inq?.tenant_name || '';
        return {
          id:     `payment_${p.id}`,
          type:   'payment',
          date:   new Date(viewYear, viewMonth, endDay),
          label:  `Pago · ${name}`,
          detail: `${statusLabel}${name ? ' · ' + name : ''}${inq?.property_name ? ' · ' + inq.property_name : ''}`,
          color:  EVENT_COLORS.payment,
        };
      });
      setPaymentEvents(pEvents);

      // ── Expenses ──────────────────────────────────────────────────────────
      const eEvents = [];
      (expenses || []).forEach(exp => {
        const dates = getExpenseDatesInMonth(exp, viewYear, viewMonth);
        dates.forEach(d => {
          eEvents.push({
            id:     `expense_${exp.id}_${d.getTime()}`,
            type:   'expense',
            date:   d,
            label:  exp.description || `Gasto ${exp.frequency || ''}`.trim(),
            detail: `${exp.description || 'Gasto'}${exp.amount != null ? ' · ' + exp.amount + ' €' : ''}`,
            color:  EVENT_COLORS.expense,
          });
        });
      });
      setExpenseEvents(eEvents);

      // ── Incidents ─────────────────────────────────────────────────────────
      const iEvents = (incidents || []).map(inc => ({
        id:     `incident_${inc.id}`,
        type:   'incident',
        date:   new Date(inc.created_at),
        label:  inc.description ? inc.description.substring(0, 28) : 'Incidencia',
        detail: `${inc.description || 'Incidencia'} · ${inc.status === 'open' ? 'Abierta' : 'Resuelta'}`,
        color:  EVENT_COLORS.incident,
      }));
      setIncidentEvents(iEvents);

      // ── Contract ends ─────────────────────────────────────────────────────
      // contractEnd is stored in the property's JSON data column
      // Only 'alquilado' properties are checked (por_habitaciones rooms don't
      // expose a room-level contractEnd in the current schema)
      const cEvents = [];
      props.forEach(prop => {
        if (!prop.contractEnd) return;
        const d = new Date(prop.contractEnd + 'T00:00:00');
        if (d.getFullYear() === viewYear && d.getMonth() === viewMonth) {
          cEvents.push({
            id:     `contract_${prop.id}`,
            type:   'contract',
            date:   d,
            label:  `Fin contrato · ${prop.name || ''}`,
            detail: `Fin de contrato de ${prop.name || 'propiedad'} el ${d.toLocaleDateString('es-ES')}`,
            color:  EVENT_COLORS.contract,
          });
        }
      });
      setContractEvents(cEvents);

    } catch (err) {
      console.error('[Calendario] Error cargando datos:', err);
      setError('No se pudieron cargar los datos del calendario.');
    }

    setLoading(false);
  }, [userEmail, viewYear, viewMonth]);

  // ── Fetch manual events (calendar_events table) ───────────────────────────
  const fetchManualEvents = useCallback(async () => {
    if (!landlordId) return;
    const monthStartStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
    const monthEndStr   = toLocalDateStr(new Date(viewYear, viewMonth + 1, 0));

    const { data, error: err } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('landlord_id', landlordId)
      .gte('event_date', monthStartStr)
      .lte('event_date', monthEndStr);

    if (err) {
      console.error('[Calendario] Error cargando eventos manuales:', err);
      return;
    }

    setManualEvents(
      (data || []).map(e => ({
        ...e,
        type:   'manual',
        date:   new Date(e.event_date + 'T00:00:00'),
        label:  e.title,
        detail: e.description || '',
        color:  e.color || COLOR_PALETTE[0],
      }))
    );
  }, [landlordId, viewYear, viewMonth]);

  useEffect(() => { fetchDerivedEvents(); }, [fetchDerivedEvents]);
  useEffect(() => { fetchManualEvents();  }, [fetchManualEvents]);

  // ── Month navigation ──────────────────────────────────────────────────────
  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const goToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  };

  // ── Build event map keyed by day ──────────────────────────────────────────
  const allEvents = [
    ...paymentEvents,
    ...expenseEvents,
    ...incidentEvents,
    ...contractEvents,
    ...manualEvents,
  ];

  const eventsByDay = {};
  allEvents.forEach(ev => {
    const key = ev.date.toDateString();
    if (!eventsByDay[key]) eventsByDay[key] = [];
    eventsByDay[key].push(ev);
  });

  const calDays = getCalendarDays(viewYear, viewMonth);

  // ── Modal helpers ─────────────────────────────────────────────────────────
  const openCreateModal = (date) => {
    setForm({ title: '', description: '', property_id: '', color: COLOR_PALETTE[0] });
    setModal({ mode: 'create', date });
    setTooltip(null);
  };

  const openEditModal = (event) => {
    setForm({
      title:       event.title  || event.label || '',
      description: event.description || '',
      property_id: event.property_id  || '',
      color:       event.color || COLOR_PALETTE[0],
    });
    setModal({ mode: 'edit', event });
    setTooltip(null);
  };

  const handleSaveEvent = async () => {
    if (!form.title.trim() || !landlordId) return;
    setSaving(true);

    if (modal.mode === 'create') {
      const { error: err } = await supabase.from('calendar_events').insert({
        landlord_id:  landlordId,
        property_id:  form.property_id || null,
        title:        form.title.trim(),
        description:  form.description.trim() || null,
        event_date:   toLocalDateStr(modal.date),
        event_type:   'manual',
        color:        form.color,
      });
      if (err) console.error('[Calendario] Error al crear evento:', err);
      else { await fetchManualEvents(); setModal(null); }
    } else if (modal.mode === 'edit') {
      const { error: err } = await supabase
        .from('calendar_events')
        .update({
          title:       form.title.trim(),
          description: form.description.trim() || null,
          property_id: form.property_id || null,
          color:       form.color,
        })
        .eq('id', modal.event.id);
      if (err) console.error('[Calendario] Error al editar evento:', err);
      else { await fetchManualEvents(); setModal(null); }
    }

    setSaving(false);
  };

  const handleDeleteEvent = async () => {
    if (!modal?.event?.id) return;
    if (!window.confirm('¿Eliminar este evento?')) return;
    const { error: err } = await supabase
      .from('calendar_events')
      .delete()
      .eq('id', modal.event.id);
    if (err) console.error('[Calendario] Error al eliminar evento:', err);
    else { await fetchManualEvents(); setModal(null); }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const monthTitle = (() => {
    const name = MONTH_NAMES_ES[viewMonth];
    return `${name.charAt(0).toUpperCase() + name.slice(1)} ${viewYear}`;
  })();

  return (
    <div className="cal-container">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="cal-page-header">
        <button className="cal-back-btn" onClick={onBack} aria-label="Volver">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className="cal-page-title">Calendario</span>
        <button className="cal-today-btn" onClick={goToday}>Hoy</button>
      </div>

      {/* ── Month navigation ─────────────────────────────────────────────── */}
      <div className="cal-month-nav">
        <button className="cal-nav-btn" onClick={prevMonth} aria-label="Mes anterior">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className="cal-month-label">{monthTitle}</span>
        <button className="cal-nav-btn" onClick={nextMonth} aria-label="Mes siguiente">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* ── Leyenda de colores ────────────────────────────────────────────── */}
      <div className="cal-legend">
        <span className="cal-legend-item">
          <span className="cal-legend-dot" style={{ background: EVENT_COLORS.payment }} />
          Pagos
        </span>
        <span className="cal-legend-item">
          <span className="cal-legend-dot" style={{ background: EVENT_COLORS.expense }} />
          Gastos
        </span>
        <span className="cal-legend-item">
          <span className="cal-legend-dot" style={{ background: EVENT_COLORS.incident }} />
          Incidencias
        </span>
        <span className="cal-legend-item">
          <span className="cal-legend-dot" style={{ background: EVENT_COLORS.contract }} />
          Contratos
        </span>
      </div>

      {/* ── Weekday headers ───────────────────────────────────────────────── */}
      <div className="cal-weekdays">
        {DAY_NAMES_ES.map(d => (
          <div key={d} className="cal-weekday">{d}</div>
        ))}
      </div>

      {/* ── Calendar grid ────────────────────────────────────────────────── */}
      {loading ? (
        <div className="cal-status">Cargando...</div>
      ) : error ? (
        <div className="cal-status cal-status--error">{error}</div>
      ) : (
        <div className="cal-grid">
          {calDays.map(day => {
            const isCurrentMonth = day.getMonth() === viewMonth;
            const isToday        = day.toDateString() === today.toDateString();
            const dayEvents      = eventsByDay[day.toDateString()] || [];
            // Show max 3 chips; "+N" for the rest
            const visibleEvents  = dayEvents.slice(0, 3);
            const overflow       = dayEvents.length - visibleEvents.length;

            return (
              <div
                key={day.toISOString()}
                className={[
                  'cal-day',
                  isCurrentMonth ? '' : 'cal-day--other',
                  isToday        ? 'cal-day--today' : '',
                ].join(' ').trim()}
                onClick={() => isCurrentMonth && openCreateModal(day)}
                role="button"
                tabIndex={isCurrentMonth ? 0 : -1}
                onKeyDown={e => e.key === 'Enter' && isCurrentMonth && openCreateModal(day)}
                aria-label={`${day.getDate()} ${MONTH_NAMES_ES[day.getMonth()]} ${day.getFullYear()}`}
              >
                <span className="cal-day-num">{day.getDate()}</span>
                <div className="cal-day-events">
                  {visibleEvents.map(ev => (
                    <button
                      key={ev.id}
                      className="cal-chip"
                      style={{ background: ev.color }}
                      onClick={e => {
                        e.stopPropagation();
                        if (ev.type === 'manual') openEditModal(ev);
                        else setTooltip(prev => prev?.event?.id === ev.id ? null : { event: ev });
                      }}
                      title={ev.label}
                    >
                      {ev.label}
                    </button>
                  ))}
                  {overflow > 0 && (
                    <span className="cal-chip-overflow">+{overflow} más</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Tooltip for derived (read-only) events ────────────────────────── */}
      {tooltip && (
        <div
          className="cal-overlay"
          onClick={() => setTooltip(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Detalle del evento"
        >
          <div className="cal-tooltip" onClick={e => e.stopPropagation()}>
            <div
              className="cal-tooltip-header"
              style={{ borderLeft: `4px solid ${tooltip.event.color}` }}
            >
              <span className="cal-tooltip-type">
                {DERIVED_TYPE_LABELS[tooltip.event.type] || tooltip.event.type}
              </span>
              <button
                className="cal-tooltip-close"
                onClick={() => setTooltip(null)}
                aria-label="Cerrar"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <p className="cal-tooltip-label">{tooltip.event.label}</p>
            {tooltip.event.detail && (
              <p className="cal-tooltip-detail">{tooltip.event.detail}</p>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: crear / editar evento manual ──────────────────────────── */}
      {modal && (modal.mode === 'create' || modal.mode === 'edit') && (
        <div
          className="cal-overlay"
          onClick={() => setModal(null)}
          role="dialog"
          aria-modal="true"
          aria-label={modal.mode === 'create' ? 'Nuevo evento' : 'Editar evento'}
        >
          <div className="cal-modal" onClick={e => e.stopPropagation()}>
            <div className="cal-modal-header">
              <h3 className="cal-modal-title">
                {modal.mode === 'create' ? 'Nuevo evento' : 'Editar evento'}
              </h3>
              <button
                className="cal-modal-close"
                onClick={() => setModal(null)}
                aria-label="Cerrar"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {modal.mode === 'create' && (
              <p className="cal-modal-date">
                {modal.date.toLocaleDateString('es-ES', {
                  weekday: 'long', day: 'numeric', month: 'long',
                })}
              </p>
            )}

            <div className="cal-form-group">
              <label className="cal-label">Título *</label>
              <input
                className="cal-input"
                type="text"
                placeholder="Nombre del evento"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                autoFocus
                maxLength={120}
              />
            </div>

            <div className="cal-form-group">
              <label className="cal-label">Descripción</label>
              <textarea
                className="cal-textarea"
                placeholder="Notas opcionales..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
                maxLength={500}
              />
            </div>

            <div className="cal-form-group">
              <label className="cal-label">Propiedad (opcional)</label>
              <select
                className="cal-select"
                value={form.property_id}
                onChange={e => setForm(f => ({ ...f, property_id: e.target.value }))}
              >
                <option value="">Todas las propiedades</option>
                {properties.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="cal-form-group">
              <label className="cal-label">Color</label>
              <div className="cal-color-picker">
                {COLOR_PALETTE.map(c => (
                  <button
                    key={c}
                    type="button"
                    className={`cal-swatch ${form.color === c ? 'cal-swatch--active' : ''}`}
                    style={{ background: c }}
                    onClick={() => setForm(f => ({ ...f, color: c }))}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
            </div>

            <div className="cal-modal-actions">
              {modal.mode === 'edit' && (
                <button
                  className="cal-btn cal-btn--delete"
                  onClick={handleDeleteEvent}
                >
                  Eliminar
                </button>
              )}
              <div className="cal-modal-actions-right">
                <button
                  className="cal-btn cal-btn--secondary"
                  onClick={() => setModal(null)}
                >
                  Cancelar
                </button>
                <button
                  className="cal-btn cal-btn--primary"
                  onClick={handleSaveEvent}
                  disabled={!form.title.trim() || saving}
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
