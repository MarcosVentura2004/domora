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

// Colors per event type
const C = {
  realizados: '#16A34A',  // dark green
  pendientes: '#22c55e',  // lighter green (same family)
  incidencia: '#DC2626',  // red
  recordatorio: '#D97706', // amber
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns Mon-aligned grid days for the given year/month (0-indexed). */
function getCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);

  const firstDow  = firstDay.getDay(); // 0=Sun
  const startOff  = firstDow === 0 ? 6 : firstDow - 1;
  const start     = new Date(year, month, 1 - startOff);

  const lastDow = lastDay.getDay();
  const endOff  = lastDow === 0 ? 0 : 7 - lastDow;
  const end     = new Date(year, month + 1, endOff);

  const days = [];
  const cur  = new Date(start);
  while (cur <= end) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

/** Local YYYY-MM-DD string from a Date (no UTC shift). */
function toLocalDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Format a number as Spanish currency string (e.g. "1.250 €"). */
function formatEur(amount) {
  if (amount == null || isNaN(amount)) return '';
  return Number(amount).toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' €';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Calendario({ userEmail, onBack }) {
  const today = new Date();

  // ── Month navigation ──────────────────────────────────────────────────────
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  // ── Auth ──────────────────────────────────────────────────────────────────
  const [landlordId, setLandlordId] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setLandlordId(user.id);
    });
  }, []);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState({
    cobros: true,
    realizados: true,
    pendientes: true,
    incidencias: true,
    recordatorios: true,
  });

  const toggleFilter = (key) =>
    setFilters(prev => ({ ...prev, [key]: !prev[key] }));

  // ── Data ──────────────────────────────────────────────────────────────────
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [properties,     setProperties]     = useState([]);
  // Aggregated payment events keyed by dateString
  // Each entry: { type:'cobros_realizados'|'cobros_pendientes', date, count, total, payments:[] }
  const [paymentEvents,  setPaymentEvents]  = useState([]);
  // Individual incident events
  const [incidentEvents, setIncidentEvents] = useState([]);
  // Recordatorios from calendar_events table
  const [recordatorios,  setRecordatorios]  = useState([]);

  // ── UI state ──────────────────────────────────────────────────────────────
  // selectedDay: shows day-detail bottom sheet
  const [selectedDay, setSelectedDay] = useState(null);
  // modal: null | { mode:'create', date:Date } | { mode:'edit', event:{} }
  const [modal,  setModal]  = useState(null);
  const [form,   setForm]   = useState({ title: '', description: '', property_id: '' });
  const [saving, setSaving] = useState(false);

  // ── Fetch derived data (payments + incidents) ─────────────────────────────
  const fetchDerived = useCallback(async () => {
    if (!userEmail) return;
    setLoading(true);
    setError(null);

    const monthStart    = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
    const nextMonthDate = new Date(viewYear, viewMonth + 1, 1);
    const nextMonthStr  = toLocalDate(nextMonthDate);

    try {
      const [
        { data: propsData,    error: e1 },
        { data: payments,     error: e2 },
        { data: inquilinos,   error: e3 },
        { data: incidents,    error: e4 },
      ] = await Promise.all([
        supabase.from('properties').select('id, data').eq('landlord_email', userEmail),

        // Fetch payments for this billing month
        supabase
          .from('payments')
          .select('id, year, month, status, tenant_id, room_id, tenant_name, property_id, amount, partial_amount, pending_amount, confirmed_at')
          .eq('landlord_email', userEmail)
          .eq('year',  viewYear)
          .eq('month', viewMonth + 1),

        // Inquilinos to resolve payment_config.endDay per tenant
        supabase
          .from('inquilinos')
          .select('tenant_id, room_id, payment_config, tenant_name, property_name')
          .eq('landlord_email', userEmail),

        // Incidents created/updated this month
        // Assumption: using created_at as the incident date (no separate incident_date column found)
        supabase
          .from('incidents')
          .select('id, description, status, created_at, property_id')
          .eq('landlord_email', userEmail)
          .gte('created_at', monthStart)
          .lt('created_at',  nextMonthStr),
      ]);

      if (e1 || e2 || e3 || e4) throw new Error('Error en una o más consultas');

      // ── Properties map ──────────────────────────────────────────────────
      const props = (propsData || []).map(r => r.data);
      setProperties(props);
      const propNameMap = {};
      props.forEach(p => { if (p?.id) propNameMap[p.id] = p.name || ''; });

      // ── Payments → aggregated per day ────────────────────────────────────
      // Build inquilino lookup: key → payment_config
      const inqMap = {};
      (inquilinos || []).forEach(i => {
        const k = i.room_id ? `room_${i.room_id}` : `tenant_${i.tenant_id}`;
        inqMap[k] = i;
      });

      const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

      // Group payments by (type, date)
      const confirmedByDay = {}; // dateStr → [payment]
      const pendingByDay   = {}; // dateStr → [payment]

      (payments || []).forEach(p => {
        if (p.status === 'rejected') return; // skip rejected

        const inqKey = p.room_id ? `room_${p.room_id}` : `tenant_${p.tenant_id}`;
        const inq    = inqMap[inqKey];
        // Use payment deadline (endDay) as the display date for all payments.
        // This groups all a month's cobros on the same deadline day,
        // making it easy to see at a glance who has and hasn't paid.
        const endDay = Math.min(inq?.payment_config?.endDay || 5, daysInMonth);
        const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

        const enriched = {
          ...p,
          displayDate: dateStr,
          tenant_name:  p.tenant_name || inq?.tenant_name || '',
          propertyName: propNameMap[p.property_id] || inq?.property_name || '',
        };

        if (p.status === 'confirmed') {
          if (!confirmedByDay[dateStr]) confirmedByDay[dateStr] = [];
          confirmedByDay[dateStr].push(enriched);
        } else {
          // pending or partial → goes into cobros_pendientes
          if (!pendingByDay[dateStr]) pendingByDay[dateStr] = [];
          pendingByDay[dateStr].push(enriched);
        }
      });

      const pEvents = [];
      Object.entries(confirmedByDay).forEach(([dateStr, list]) => {
        const total = list.reduce((s, p) => s + (p.amount || 0), 0);
        pEvents.push({
          id:       `cobros_realizados_${dateStr}`,
          type:     'cobros_realizados',
          date:     new Date(dateStr + 'T00:00:00'),
          count:    list.length,
          total,
          label:    `${list.length} ${list.length === 1 ? 'cobro' : 'cobros'} · ${formatEur(total)}`,
          payments: list,
        });
      });
      Object.entries(pendingByDay).forEach(([dateStr, list]) => {
        // For pending/partial, use pending_amount if available, else amount
        const total = list.reduce((s, p) => {
          const due = p.status === 'partial' ? (p.pending_amount ?? p.amount ?? 0) : (p.amount ?? 0);
          return s + due;
        }, 0);
        pEvents.push({
          id:       `cobros_pendientes_${dateStr}`,
          type:     'cobros_pendientes',
          date:     new Date(dateStr + 'T00:00:00'),
          count:    list.length,
          total,
          label:    `${list.length} pendiente${list.length > 1 ? 's' : ''} · ${formatEur(total)}`,
          payments: list,
        });
      });
      setPaymentEvents(pEvents);

      // ── Incidents ─────────────────────────────────────────────────────────
      const iEvents = (incidents || []).map(inc => ({
        id:          `incidencia_${inc.id}`,
        type:        'incidencia',
        date:        new Date(inc.created_at),
        label:       (inc.description || 'Incidencia').substring(0, 35),
        description: inc.description || '',
        status:      inc.status || 'open',
        property_id: inc.property_id,
        propertyName: propNameMap[inc.property_id] || '',
      }));
      setIncidentEvents(iEvents);

    } catch (err) {
      console.error('[Calendario] Error cargando datos:', err);
      setError('No se pudieron cargar los datos del calendario.');
    }
    setLoading(false);
  }, [userEmail, viewYear, viewMonth]);

  // ── Fetch recordatorios (calendar_events table) ───────────────────────────
  const fetchRecordatorios = useCallback(async () => {
    if (!landlordId) return;
    const monthStart = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
    const monthEnd   = toLocalDate(new Date(viewYear, viewMonth + 1, 0));

    const { data, error: err } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('landlord_id', landlordId)
      .gte('event_date', monthStart)
      .lte('event_date', monthEnd);

    if (err) {
      console.error('[Calendario] Error cargando recordatorios:', err);
      return;
    }

    const propNameMap = {};
    properties.forEach(p => { if (p?.id) propNameMap[p.id] = p.name || ''; });

    setRecordatorios(
      (data || []).map(e => ({
        ...e,
        type:        'recordatorio',
        date:        new Date(e.event_date + 'T00:00:00'),
        label:       e.title,
        propertyName: propNameMap[e.property_id] || '',
      }))
    );
  }, [landlordId, viewYear, viewMonth, properties]);

  useEffect(() => { fetchDerived(); },        [fetchDerived]);
  useEffect(() => { fetchRecordatorios(); },  [fetchRecordatorios]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };
  const goToday = () => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); };

  // ── Build events-by-day map (filtered) ───────────────────────────────────
  const allEvents = [
    ...(filters.cobros && filters.realizados ? paymentEvents.filter(e => e.type === 'cobros_realizados') : []),
    ...(filters.cobros && filters.pendientes ? paymentEvents.filter(e => e.type === 'cobros_pendientes') : []),
    ...(filters.incidencias ? incidentEvents : []),
    ...(filters.recordatorios ? recordatorios : []),
  ];

  const eventsByDay = {};
  allEvents.forEach(ev => {
    const key = ev.date.toDateString();
    if (!eventsByDay[key]) eventsByDay[key] = [];
    eventsByDay[key].push(ev);
  });

  const calDays = getCalendarDays(viewYear, viewMonth);

  // ── Day detail helpers ────────────────────────────────────────────────────
  const openDayDetail = (day) => {
    setSelectedDay(day);
  };

  // ── Recordatorio modal helpers ────────────────────────────────────────────
  const openCreateReminder = (day) => {
    setSelectedDay(null);
    setForm({ title: '', description: '', property_id: '' });
    setModal({ mode: 'create', date: day });
  };

  const openEditReminder = (event) => {
    setSelectedDay(null);
    setForm({
      title:       event.title || event.label || '',
      description: event.description || '',
      property_id: event.property_id || '',
    });
    setModal({ mode: 'edit', event });
  };

  const handleSave = async () => {
    if (!form.title.trim() || !landlordId) return;
    setSaving(true);

    if (modal.mode === 'create') {
      const { error: err } = await supabase.from('calendar_events').insert({
        landlord_id:  landlordId,
        property_id:  form.property_id || null,
        title:        form.title.trim(),
        description:  form.description.trim() || null,
        event_date:   toLocalDate(modal.date),
        event_type:   'recordatorio',
        color:        C.recordatorio,
      });
      if (err) console.error('[Calendario] Error al crear recordatorio:', err);
      else { await fetchRecordatorios(); setModal(null); }
    } else if (modal.mode === 'edit') {
      const { error: err } = await supabase
        .from('calendar_events')
        .update({
          title:       form.title.trim(),
          description: form.description.trim() || null,
          property_id: form.property_id || null,
        })
        .eq('id', modal.event.id);
      if (err) console.error('[Calendario] Error al editar recordatorio:', err);
      else { await fetchRecordatorios(); setModal(null); }
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!modal?.event?.id) return;
    if (!window.confirm('¿Eliminar este recordatorio?')) return;
    await supabase.from('calendar_events').delete().eq('id', modal.event.id);
    await fetchRecordatorios();
    setModal(null);
  };

  // ── Chip ordering within a day cell ──────────────────────────────────────
  // Priority: incidencias > recordatorios > cobros pendientes > cobros realizados
  function sortedChips(events) {
    const order = { incidencia: 0, recordatorio: 1, cobros_pendientes: 2, cobros_realizados: 3 };
    return [...events].sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9));
  }

  // ── Month title ───────────────────────────────────────────────────────────
  const monthTitle = `${MONTH_NAMES_ES[viewMonth]} ${viewYear}`;

  // ── Day detail events (expanded, individual payments) ─────────────────────
  const dayDetailEvents = selectedDay ? (eventsByDay[selectedDay.toDateString()] || []) : [];
  const detailIncidencias    = dayDetailEvents.filter(e => e.type === 'incidencia');
  const detailRecordatorios  = dayDetailEvents.filter(e => e.type === 'recordatorio');
  const detailRealizados     = dayDetailEvents.find(e => e.type === 'cobros_realizados');
  const detailPendientes     = dayDetailEvents.find(e => e.type === 'cobros_pendientes');
  const totalDayEvents       = dayDetailEvents.length;

  // ── Render ────────────────────────────────────────────────────────────────
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

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div className="cal-filters">
        {/* Cobros master toggle */}
        <button
          className={`cal-filter-pill ${filters.cobros ? 'cal-filter-pill--cobros-active' : ''}`}
          onClick={() => toggleFilter('cobros')}
        >
          <span className="cal-filter-dot" style={{ background: C.realizados }} />
          Cobros
        </button>

        {/* Sub-filters: only visible when cobros is active */}
        {filters.cobros && (
          <>
            <button
              className={`cal-filter-pill cal-filter-pill--sub ${filters.realizados ? 'cal-filter-pill--realizados-active' : ''}`}
              onClick={() => toggleFilter('realizados')}
            >
              Realizados
            </button>
            <button
              className={`cal-filter-pill cal-filter-pill--sub ${filters.pendientes ? 'cal-filter-pill--pendientes-active' : ''}`}
              onClick={() => toggleFilter('pendientes')}
            >
              Pendientes
            </button>
          </>
        )}

        <div className="cal-filter-sep" />

        <button
          className={`cal-filter-pill ${filters.incidencias ? 'cal-filter-pill--incidencias-active' : ''}`}
          onClick={() => toggleFilter('incidencias')}
        >
          <span className="cal-filter-dot" style={{ background: C.incidencia }} />
          Incidencias
        </button>

        <button
          className={`cal-filter-pill ${filters.recordatorios ? 'cal-filter-pill--recordatorios-active' : ''}`}
          onClick={() => toggleFilter('recordatorios')}
        >
          <span className="cal-filter-dot" style={{ background: C.recordatorio }} />
          Recordatorios
        </button>
      </div>

      {/* ── Weekday headers ───────────────────────────────────────────────── */}
      <div className="cal-weekdays">
        {DAY_NAMES_ES.map(d => (
          <div key={d} className="cal-weekday">{d}</div>
        ))}
      </div>

      {/* ── Calendar grid ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="cal-status">Cargando...</div>
      ) : error ? (
        <div className="cal-status cal-status--error">{error}</div>
      ) : (
        <div className="cal-grid">
          {calDays.map(day => {
            const isCurrentMonth = day.getMonth() === viewMonth;
            const isToday        = day.toDateString() === today.toDateString();
            const dayEvts        = sortedChips(eventsByDay[day.toDateString()] || []);
            const MAX_CHIPS      = 3;
            const visible        = dayEvts.slice(0, MAX_CHIPS);
            const overflow       = dayEvts.length - visible.length;

            return (
              <div
                key={day.toISOString()}
                className={[
                  'cal-day',
                  isCurrentMonth ? '' : 'cal-day--other',
                  isToday ? 'cal-day--today' : '',
                ].join(' ').trim()}
                onClick={() => isCurrentMonth && openDayDetail(day)}
                role={isCurrentMonth ? 'button' : undefined}
                tabIndex={isCurrentMonth ? 0 : -1}
                onKeyDown={e => e.key === 'Enter' && isCurrentMonth && openDayDetail(day)}
                aria-label={
                  isCurrentMonth
                    ? `${day.getDate()} de ${MONTH_NAMES_ES[day.getMonth()]}${dayEvts.length > 0 ? ', ' + dayEvts.length + ' eventos' : ''}`
                    : undefined
                }
              >
                <span className="cal-day-num">{day.getDate()}</span>
                <div className="cal-day-events">
                  {visible.map(ev => (
                    <div
                      key={ev.id}
                      className="cal-chip"
                      style={
                        ev.type === 'cobros_pendientes'
                          ? { background: '#dcfce7', color: '#166534' }
                          : { background: ev.type === 'cobros_realizados' ? C.realizados : ev.type === 'incidencia' ? C.incidencia : C.recordatorio, color: 'white' }
                      }
                    >
                      {ev.label}
                    </div>
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

      {/* ── Day detail panel ──────────────────────────────────────────────── */}
      {selectedDay && (
        <div
          className="cal-overlay"
          onClick={() => setSelectedDay(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="cal-panel" onClick={e => e.stopPropagation()}>
            {/* Panel header */}
            <div className="cal-panel-header">
              <div className="cal-panel-header-left">
                <span className="cal-panel-date">
                  {selectedDay.toLocaleDateString('es-ES', {
                    weekday: 'long', day: 'numeric', month: 'long',
                  })}
                </span>
              </div>
              <div className="cal-panel-header-right">
                <button
                  className="cal-panel-add-btn"
                  onClick={() => openCreateReminder(selectedDay)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5"
                      strokeLinecap="round"/>
                  </svg>
                  Recordatorio
                </button>
                <button
                  className="cal-panel-close"
                  onClick={() => setSelectedDay(null)}
                  aria-label="Cerrar"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* Panel body */}
            <div className="cal-panel-body">
              {totalDayEvents === 0 && (
                <p className="cal-panel-empty">Sin eventos este día</p>
              )}

              {/* Incidencias */}
              {detailIncidencias.length > 0 && (
                <div className="cal-panel-section">
                  <span className="cal-panel-section-label" style={{ color: C.incidencia }}>
                    Incidencias
                  </span>
                  {detailIncidencias.map(ev => (
                    <div key={ev.id} className="cal-detail-row">
                      <span className="cal-detail-dot" style={{ background: C.incidencia }} />
                      <div className="cal-detail-info">
                        <span className="cal-detail-title">{ev.description || 'Incidencia'}</span>
                        {ev.propertyName && (
                          <span className="cal-detail-sub">{ev.propertyName}</span>
                        )}
                        <span
                          className="cal-detail-badge"
                          style={{
                            background: ev.status === 'open' ? '#fef2f2' : '#f0fdf4',
                            color: ev.status === 'open' ? '#DC2626' : '#16A34A',
                          }}
                        >
                          {ev.status === 'open' ? 'Abierta' : 'Resuelta'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Recordatorios */}
              {detailRecordatorios.length > 0 && (
                <div className="cal-panel-section">
                  <span className="cal-panel-section-label" style={{ color: C.recordatorio }}>
                    Recordatorios
                  </span>
                  {detailRecordatorios.map(ev => (
                    <button
                      key={ev.id}
                      className="cal-detail-row cal-detail-row--clickable"
                      onClick={() => openEditReminder(ev)}
                    >
                      <span className="cal-detail-dot" style={{ background: C.recordatorio }} />
                      <div className="cal-detail-info">
                        <span className="cal-detail-title">{ev.title || ev.label}</span>
                        {ev.propertyName && (
                          <span className="cal-detail-sub">{ev.propertyName}</span>
                        )}
                        {ev.description && (
                          <span className="cal-detail-sub">{ev.description}</span>
                        )}
                      </div>
                      <svg className="cal-detail-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2"
                          strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  ))}
                </div>
              )}

              {/* Cobros realizados */}
              {detailRealizados && (
                <div className="cal-panel-section">
                  <span className="cal-panel-section-label" style={{ color: C.realizados }}>
                    Cobros realizados · {formatEur(detailRealizados.total)}
                  </span>
                  {detailRealizados.payments.map(p => (
                    <div key={p.id} className="cal-detail-row">
                      <span className="cal-detail-dot" style={{ background: C.realizados }} />
                      <div className="cal-detail-info">
                        <span className="cal-detail-title">
                          Cobro recibido · {p.tenant_name} · {formatEur(p.amount)}
                        </span>
                        {p.propertyName && (
                          <span className="cal-detail-sub">{p.propertyName}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Cobros pendientes */}
              {detailPendientes && (
                <div className="cal-panel-section">
                  <span className="cal-panel-section-label" style={{ color: '#166534' }}>
                    Cobros pendientes · {formatEur(detailPendientes.total)}
                  </span>
                  {detailPendientes.payments.map(p => {
                    const due = p.status === 'partial'
                      ? (p.pending_amount ?? p.amount ?? 0)
                      : (p.amount ?? 0);
                    return (
                      <div key={p.id} className="cal-detail-row">
                        <span className="cal-detail-dot" style={{ background: C.pendientes }} />
                        <div className="cal-detail-info">
                          <span className="cal-detail-title">
                            {p.status === 'partial' ? 'Pago parcial' : 'Cobro pendiente'} · {p.tenant_name} · {formatEur(due)}
                          </span>
                          {p.propertyName && (
                            <span className="cal-detail-sub">{p.propertyName}</span>
                          )}
                          {p.status === 'partial' && p.partial_amount != null && (
                            <span className="cal-detail-sub">
                              Recibido: {formatEur(p.partial_amount)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: crear / editar recordatorio ───────────────────────────── */}
      {modal && (
        <div
          className="cal-overlay"
          onClick={() => setModal(null)}
          role="dialog"
          aria-modal="true"
          aria-label={modal.mode === 'create' ? 'Nuevo recordatorio' : 'Editar recordatorio'}
        >
          <div className="cal-modal" onClick={e => e.stopPropagation()}>
            <div className="cal-modal-header">
              <h3 className="cal-modal-title">
                {modal.mode === 'create' ? 'Nuevo recordatorio' : 'Editar recordatorio'}
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
                placeholder="¿Qué hay que recordar?"
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
                placeholder="Notas adicionales..."
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
                <option value="">Sin propiedad asociada</option>
                {properties.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="cal-modal-actions">
              {modal.mode === 'edit' && (
                <button className="cal-btn cal-btn--delete" onClick={handleDelete}>
                  Eliminar
                </button>
              )}
              <div className="cal-modal-actions-right">
                <button className="cal-btn cal-btn--secondary" onClick={() => setModal(null)}>
                  Cancelar
                </button>
                <button
                  className="cal-btn cal-btn--primary"
                  onClick={handleSave}
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
