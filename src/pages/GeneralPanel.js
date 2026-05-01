import React, { useState, useEffect } from 'react';
import './Dashboard.css';
import { supabase } from '../supabaseClient';

const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth();

function getMonthlyIncome(property, year, month) {
  const ownership = (property.ownershipPercentage || 100) / 100;
  if (property.status === 'vacacional') {
    return (property.bookings || [])
      .filter(b => {
        const s = new Date(b.startDate);
        return b.status === 'confirmed' && s.getFullYear() === year && s.getMonth() === month;
      })
      .reduce((sum, b) => sum + (b.amount || 0), 0) * ownership;
  }
  if (property.status === 'por_habitaciones') {
    return (property.payments || [])
      .filter(p => p.year === year && p.month === month && p.status === 'confirmed' && p.roomId)
      .reduce((sum, p) => sum + (p.amount || 0), 0) * ownership;
  }
  if (property.status === 'alquilado' || property.status === 'otros') {
    return (property.payments || [])
      .filter(p => p.year === year && p.month === month && p.status === 'confirmed' && !p.roomId)
      .reduce((sum, p) => sum + (p.amount || 0), 0) * ownership;
  }
  return 0;
}

function getExpensesForMonth(expenses, year, month) {
  return expenses.filter(e => {
    if (e.active === false) return false;
    const start = new Date((e.start_date || e.createdAt) + (e.start_date ? 'T12:00:00' : ''));
    const sy = start.getFullYear(), sm = start.getMonth();
    if (year < sy || (year === sy && month < sm)) return false;
    if (e.type === 'puntual' || e.frequency === 'unico') return year === sy && month === sm;
    const monthsDiff = (year - sy) * 12 + (month - sm);
    const step = e.frequency === 'trimestral' ? 3 : e.frequency === 'anual' ? 12 : e.frequency === 'custom' ? (e.custom_frequency_months || 1) : 1;
    if (monthsDiff % step !== 0) return false;
    if (e.type === 'recurrente_temporal') {
      const paymentIndex = monthsDiff / step;
      if (paymentIndex >= (e.duration_payments || 0)) return false;
    }
    return true;
  });
}

function getMonthlyEquivalentGP(expense) {
  const amt = Number(expense.amount) || 0;
  if (expense.frequency === 'trimestral') return amt / 3;
  if (expense.frequency === 'anual') return amt / 12;
  if (expense.frequency === 'custom') return amt / (expense.custom_frequency_months || 1);
  return amt;
}

function getMonthlyExpenses(property, supabaseExpenses, year, month) {
  if (property.status === 'uso_propio') return 0;
  const propertyExpenses = (supabaseExpenses || []).filter(e => String(e.property_id) === String(property.id));
  const active = getExpensesForMonth(propertyExpenses, year, month);
  const ownership = property.ownershipPercentage || 100;
  return active.reduce((sum, e) => {
    const pct = e.expense_percentage != null ? e.expense_percentage : ownership;
    return sum + getMonthlyEquivalentGP(e) * pct / 100;
  }, 0);
}

// ─────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────
function GeneralPanel({ properties, userEmail, onNavigateToProperties, onOpenSettings, avatarUrl, avatarValid, onAvatarLoad, onAvatarError, hideHeader, hideAvatar }) {
  const [viewMonth, setViewMonth] = useState(currentMonth);
  const [viewYear, setViewYear] = useState(currentYear);

  const goToPrevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else { setViewMonth(m => m - 1); }
  };
  const goToNextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else { setViewMonth(m => m + 1); }
  };
  const isCurrentMonth = viewYear === currentYear && viewMonth === currentMonth;

  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showRentabilityModal, setShowRentabilityModal] = useState(false);
  const [rentabilityInitialPropertyId, setRentabilityInitialPropertyId] = useState(null);
  const [expandedCard, setExpandedCard] = useState(null);
  const toggleCard = (key) => setExpandedCard(prev => prev === key ? null : key);
  const [expandedProperty, setExpandedProperty] = useState(null);
  const toggleProperty = (name) => setExpandedProperty(prev => prev === name ? null : name);
  const [expandedIncidentPhoto, setExpandedIncidentPhoto] = useState({});
  const toggleIncidentPhoto = (id) => setExpandedIncidentPhoto(prev => ({ ...prev, [id]: !prev[id] }));

  const handleResolveIncident = async (incidentId) => {
    await supabase.from('incidents').update({ status: 'resolved' }).eq('id', incidentId);
    setSupabaseIncidents(prev => prev.filter(i => i.id !== incidentId));
  };
  const [supabasePayments, setSupabasePayments] = useState([]);
  const [supabaseIncidents, setSupabaseIncidents] = useState([]);
  const [supabaseExpenses, setSupabaseExpenses] = useState([]);

  useEffect(() => {
    const propertyIds = properties.map(p => String(p.id));
    if (propertyIds.length === 0) return;

    const fetchPayments = () => {
      supabase
        .from('payments')
        .select('property_id, tenant_id, room_id, status, amount, confirmed_at, marked_at')
        .in('property_id', propertyIds)
        .eq('year', viewYear)
        .eq('month', viewMonth)
        .then(({ data, error }) => {
          console.log('[GeneralPanel fetchPayments] Registros del mes recibidos de Supabase:', {
            year: currentYear, month: currentMonth,
            count: data?.length ?? 0,
            error,
            records: (data || []).map(p => ({
              property_id: p.property_id,
              tenant_id: p.tenant_id,
              room_id: p.room_id,
              status: p.status,
              confirmed_at: p.confirmed_at,
              marked_at: p.marked_at,
            })),
          });
          if (data) setSupabasePayments(data);
        });
    };

    fetchPayments();

    // Refresca cada 30 segundos para reflejar pagos confirmados desde PropertyDetail
    const interval = setInterval(fetchPayments, 30000);

    // También refresca al volver a la pestaña
    const handleVisibility = () => { if (document.visibilityState === 'visible') fetchPayments(); };
    document.addEventListener('visibilitychange', handleVisibility);

    supabase
      .from('expenses')
      .select('*')
      .in('property_id', propertyIds)
      .then(({ data }) => { if (data) setSupabaseExpenses(data); });

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [properties, viewYear, viewMonth]); // eslint-disable-line

  useEffect(() => {
    if (!userEmail) return;
    supabase
      .from('incidents')
      .select('*')
      .eq('landlord_email', userEmail)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setSupabaseIncidents(data); });
  }, [userEmail]);

  const totalIncome = properties.reduce((sum, p) => sum + getMonthlyIncome(p, viewYear, viewMonth), 0);
  const totalExpenses = properties.reduce((sum, p) => sum + getMonthlyExpenses(p, supabaseExpenses, viewYear, viewMonth), 0);
  const totalNet = totalIncome - totalExpenses;

  const occupied = properties.filter(p =>
    p.status === 'alquilado' ||
    p.status === 'otros' ||
    (p.status === 'por_habitaciones' && (p.rooms || []).some(r => r.tenant)) ||
    (p.status === 'vacacional' && (p.bookings || []).some(b => {
      const s = new Date(b.startDate), e = new Date(b.endDate);
      return b.status === 'confirmed' && s <= now && e >= now;
    }))
  ).length;

  const monthName = new Date(viewYear, viewMonth, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  const usoPropioProperties = properties.filter(p => p.status === 'uso_propio');

  // Datos por propiedad para el ranking (uso_propio excluido del resumen financiero)
  const propertyStats = properties
    .filter(p => p.status !== 'uso_propio')
    .map(p => ({
      name: p.name,
      id: p.id,
      status: p.status,
      income: getMonthlyIncome(p, viewYear, viewMonth),
      expenses: getMonthlyExpenses(p, supabaseExpenses, viewYear, viewMonth),
      net: getMonthlyIncome(p, viewYear, viewMonth) - getMonthlyExpenses(p, supabaseExpenses, viewYear, viewMonth),
    })).sort((a, b) => b.net - a.net);

  // ── Alertas importantes ──

  // Pagos pendientes: un inquilino está al día ÚNICAMENTE si existe un registro con
  // status === 'confirmed' en la tabla payments para el mes/año actual.
  // Si no existe ese registro (sea porque no hay ningún pago o porque solo hay uno
  // con status 'pending'), el pago se considera pendiente de confirmar por el propietario.
  const pendingMap = {};

  properties.forEach(prop => {
    if (['uso_propio', 'vacio', 'vacacional'].includes(prop.status)) return;
    const propPayments = supabasePayments.filter(p => String(p.property_id) === String(prop.id));

    if (prop.status === 'alquilado' || prop.status === 'otros') {
      if ((prop.tenants || []).length === 0) return;
      const hasConfirmed = propPayments.some(
        p => !p.room_id && (p.status || '').trim() === 'confirmed'
      );
      if (!hasConfirmed) {
        if (!pendingMap[prop.name]) pendingMap[prop.name] = { count: 0, total: 0, rooms: [], isPorHabitaciones: false };
        pendingMap[prop.name].count++;
        const existingPayment = propPayments.find(p => !p.room_id);
        pendingMap[prop.name].total += existingPayment?.amount || 0;
        // markedAt: el inquilino marcó el pago pero el propietario aún no lo ha confirmado
        pendingMap[prop.name].markedAt = !!(existingPayment?.marked_at && !existingPayment?.confirmed_at);
      }
    } else if (prop.status === 'por_habitaciones') {
      (prop.rooms || []).filter(r => r.tenant).forEach(room => {
        const hasConfirmed = propPayments.some(
          p => String(p.room_id) === String(room.id) && (p.status || '').trim() === 'confirmed'
        );
        if (!hasConfirmed) {
          if (!pendingMap[prop.name]) pendingMap[prop.name] = { count: 0, total: 0, rooms: [], isPorHabitaciones: true };
          pendingMap[prop.name].isPorHabitaciones = true;
          pendingMap[prop.name].count++;
          const roomPayment = propPayments.find(p => String(p.room_id) === String(room.id));
          pendingMap[prop.name].total += roomPayment?.amount || 0;
          pendingMap[prop.name].rooms.push({
            roomName: room.name || 'Habitación',
            tenantName: (room.tenant && room.tenant.name) ? room.tenant.name : '',
            markedAt: !!(roomPayment?.marked_at && !roomPayment?.confirmed_at),
          });
        }
      });
    }
  });
  const pendingByPropertyList = Object.entries(pendingMap).map(([name, d]) => ({ name, ...d }));
  const pendingCount = pendingByPropertyList.reduce((sum, item) => sum + item.count, 0);
  const pendingTotal = pendingByPropertyList.reduce((sum, item) => sum + item.total, 0);

  // Atención financiera
  const computeMonthTotal = (year, month) =>
    properties
      .filter(p => p.status !== 'uso_propio')
      .reduce((sum, p) => {
        const pExp = supabaseExpenses.filter(e => String(e.property_id) === String(p.id));
        const active = getExpensesForMonth(pExp, year, month);
        const ownership = p.ownershipPercentage || 100;
        return sum + active.reduce((s, e) => {
          const pct = e.expense_percentage != null ? e.expense_percentage : ownership;
          return s + getMonthlyEquivalentGP(e) * pct / 100;
        }, 0);
      }, 0);

  const prevSixExpenses = Array.from({ length: 6 }, (_, i) => {
    let m = currentMonth - i - 1;
    let y = currentYear;
    if (m < 0) { m += 12; y -= 1; }
    return computeMonthTotal(y, m);
  });
  const avgMonthlyExpenses = prevSixExpenses.reduce((s, v) => s + v, 0) / prevSixExpenses.length;
  const expensesHighPct = avgMonthlyExpenses > 0 ? Math.round((totalExpenses / avgMonthlyExpenses - 1) * 100) : 0;
  const showHighExpenses = avgMonthlyExpenses > 0 && expensesHighPct > 20;

  const negativeCashflowProps = propertyStats.filter(s => s.net < 0);
  const emptyProps = properties.filter(p => p.status === 'vacio');

  // Habitaciones sin inquilino en propiedades por_habitaciones
  const emptyRooms = [];
  properties.forEach(prop => {
    if (prop.status === 'por_habitaciones') {
      (prop.rooms || []).filter(r => !r.tenant).forEach(room => {
        emptyRooms.push({ roomName: room.name || 'Habitación', propName: prop.name });
      });
    }
  });

  // Alertas graves: pérdidas o vacíos (pisos o habitaciones)
  const hasGraveAlerts = negativeCashflowProps.length > 0 || emptyProps.length > 0 || emptyRooms.length > 0;

  const activeRentalProps = propertyStats.filter(s => s.status !== 'vacio');
  const avgCashflow = activeRentalProps.length > 0
    ? activeRentalProps.reduce((sum, s) => sum + s.net, 0) / activeRentalProps.length
    : 0;

  // Propiedades sin ningún gasto registrado (excluidas vacías y uso_propio)
  const propsWithoutExpenses = propertyStats.filter(s =>
    !['vacio', 'uso_propio'].includes(s.status) && s.expenses === 0
  );

  // Tasa de ocupación (excluye uso_propio)
  const rentableCount = properties.filter(p => p.status !== 'uso_propio').length;
  const occupationRate = rentableCount > 0 ? Math.round(occupied / rentableCount * 100) : 0;

  const alertBadgeCount =
    (pendingCount > 0 ? 1 : 0) +
    (supabaseIncidents.length > 0 ? 1 : 0) +
    (hasGraveAlerts ? 1 : 0);

  return (
    <div className="dashboard-container" style={{ paddingBottom: '80px' }}>
      {/* Header — oculto cuando está embebido dentro de otro componente con su propio header */}
      {!hideHeader && (
        <div className="dashboard-header">
          {!hideAvatar ? (
            <button className="profile-button" onClick={onOpenSettings}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', position: 'relative', background: '#E5E5E5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {avatarUrl && (
                  <img
                    src={avatarUrl}
                    alt=""
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: avatarValid ? 'block' : 'none' }}
                    onLoad={onAvatarLoad}
                    onError={onAvatarError}
                  />
                )}
                {!avatarValid && (
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <circle cx="16" cy="16" r="16" fill="#E5E5E5"/>
                    <path d="M16 16c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="#666"/>
                  </svg>
                )}
              </div>
            </button>
          ) : (
            <div style={{ width: 32 }} />
          )}
          <span style={{ fontWeight: 600, fontSize: '17px', color: '#111' }}>Resumen</span>
          <div style={{ position: 'relative' }}>
            <button className="options-button" onClick={() => setShowOptionsMenu(!showOptionsMenu)}>⋮</button>
            {showOptionsMenu && (
              <div className="options-menu" style={{ right: 0, left: 'auto' }}>
                <button className="option-item" onClick={() => { setShowReportModal(true); setShowOptionsMenu(false); }}>
                  Reporte anual
                </button>
                <button className="option-item" onClick={() => { setShowRentabilityModal(true); setShowOptionsMenu(false); }}>
                  Calcular rentabilidad
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showReportModal && (
        <ReportModal properties={properties} onClose={() => setShowReportModal(false)} />
      )}
      {showRentabilityModal && (
        <RentabilityModal
          properties={properties}
          supabaseExpenses={supabaseExpenses}
          initialPropertyId={rentabilityInitialPropertyId}
          onClose={() => { setShowRentabilityModal(false); setRentabilityInitialPropertyId(null); }}
        />
      )}

      <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Mes con navegación */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <button
            onClick={goToPrevMonth}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', color: '#aaa' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <p style={{ margin: 0, fontSize: '13px', color: '#aaa', textTransform: 'capitalize', minWidth: '120px', textAlign: 'center' }}>{monthName}</p>
          <button
            onClick={goToNextMonth}
            disabled={isCurrentMonth}
            style={{ background: 'none', border: 'none', cursor: isCurrentMonth ? 'default' : 'pointer', padding: '4px', display: 'flex', alignItems: 'center', color: isCurrentMonth ? '#ddd' : '#aaa' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        {/* Tarjeta principal neto */}
        <div style={{
          background: 'white', borderRadius: '20px', padding: '24px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.07)', textAlign: 'center'
        }}>
          <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#aaa' }}>Neto total este mes</p>
          <p style={{
            margin: '0 0 20px', fontSize: '38px', fontWeight: 700,
            color: totalNet >= 0 ? '#2E7D32' : '#C62828'
          }}>
            {totalNet >= 0 ? '+' : ''}{totalNet.toFixed(0)} €
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div style={{ background: '#F1F8E9', borderRadius: '12px', padding: '14px 8px', textAlign: 'center' }}>
              <p style={{ margin: '0 0 4px', fontSize: '11px', color: '#888' }}>Ingresos</p>
              <p style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#2E7D32' }}>+{totalIncome.toFixed(0)} €</p>
            </div>
            <div style={{ background: '#FBE9E7', borderRadius: '12px', padding: '14px 8px', textAlign: 'center' }}>
              <p style={{ margin: '0 0 4px', fontSize: '11px', color: '#888' }}>Gastos</p>
              <p style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#C62828' }}>-{totalExpenses.toFixed(0)} €</p>
            </div>
          </div>
          <div style={{ background: '#E3F2FD', borderRadius: '12px', padding: '14px 8px', textAlign: 'center' }}>
            <p style={{ margin: '0 0 4px', fontSize: '11px', color: '#888' }}>Ocupados</p>
            <p style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1565C0' }}>{occupied}/{properties.length}</p>
          </div>
        </div>

        {/* Alertas importantes */}
        {properties.length > 0 && (
          <div style={{ background: 'white', borderRadius: '20px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#111' }}>Alertas importantes</h3>
              {alertBadgeCount > 0 && (
                <span style={{ background: '#E53935', color: 'white', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>
                  {alertBadgeCount}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

              {/* ── Pagos pendientes ── */}
              {(() => {
                const hasAlert = pendingCount > 0;
                const color = hasAlert ? '#C62828' : '#2E7D32';
                const iconColor = hasAlert ? '#E53935' : '#4CAF50';
                const bg = hasAlert ? '#FBE9E7' : '#F1F8E9';
                const border = hasAlert ? 'rgba(229,57,53,0.15)' : 'rgba(76,175,80,0.15)';
                const isOpen = expandedCard === 'payments';
                return (
                  <div style={{ borderRadius: '14px', border: `1px solid ${border}`, overflow: 'hidden' }}>
                    <button onClick={() => toggleCard('payments')} style={{ width: '100%', background: bg, border: 'none', padding: '13px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '11px' }}>
                      <div style={{ flexShrink: 0, width: '32px', height: '32px', borderRadius: '8px', background: hasAlert ? 'rgba(229,57,53,0.1)' : 'rgba(76,175,80,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <rect x="3" y="4" width="18" height="18" rx="2" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <line x1="16" y1="2" x2="16" y2="6" stroke={iconColor} strokeWidth="2" strokeLinecap="round"/>
                          <line x1="8" y1="2" x2="8" y2="6" stroke={iconColor} strokeWidth="2" strokeLinecap="round"/>
                          <line x1="3" y1="10" x2="21" y2="10" stroke={iconColor} strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <p style={{ margin: '0 0 1px', fontSize: '13px', fontWeight: 700, color }}>
                          {pendingCount} pago{pendingCount !== 1 ? 's' : ''} pendiente{pendingCount !== 1 ? 's' : ''}
                        </p>
                        <p style={{ margin: 0, fontSize: '11px', color: '#999' }}>
                          {hasAlert ? (pendingTotal > 0 ? `por valor de ${pendingTotal.toFixed(0)} €` : 'pendientes de confirmar') : 'sin impagos este mes'}
                        </p>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                        <path d="M6 9l6 6 6-6" stroke="#bbb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    {isOpen && (
                      <div style={{ padding: '10px 14px 14px', background: 'white', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {pendingByPropertyList.length === 0 ? (
                          <p style={{ margin: 0, fontSize: '13px', color: '#888', textAlign: 'center', padding: '4px 0' }}>Todos los pagos están confirmados</p>
                        ) : pendingByPropertyList.map((item, i) => (
                          <div key={i}>
                            <button
                              onClick={() => item.isPorHabitaciones ? toggleProperty(item.name) : undefined}
                              style={{
                                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '9px 12px', borderRadius: expandedProperty === item.name ? '10px 10px 0 0' : '10px',
                                background: '#FBE9E7', border: 'none', cursor: item.isPorHabitaciones ? 'pointer' : 'default', textAlign: 'left',
                              }}
                            >
                              <div>
                                <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#333' }}>{item.name}</p>
                                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#888' }}>{item.count} pago{item.count !== 1 ? 's' : ''} sin confirmar</p>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {!item.isPorHabitaciones && item.markedAt ? (
                                  <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#F59E0B' }}>
                                    Confirmado por inquilino
                                  </p>
                                ) : (
                                  <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#C62828' }}>
                                    {item.total > 0 ? `${item.total.toFixed(0)} €` : '—'}
                                  </p>
                                )}
                                {item.isPorHabitaciones && (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ transform: expandedProperty === item.name ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
                                    <path d="M6 9l6 6 6-6" stroke="#C62828" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                )}
                              </div>
                            </button>
                            {item.isPorHabitaciones && expandedProperty === item.name && (
                              <div style={{ background: '#fff0ee', borderRadius: '0 0 10px 10px', padding: '4px 12px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {item.rooms.map((r, ri) => (
                                  <div key={ri} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', borderRadius: '8px', background: 'rgba(229,57,53,0.06)' }}>
                                    <p style={{ margin: 0, fontSize: '12px', color: '#555' }}>{r.roomName}{r.tenantName ? ` — ${r.tenantName}` : ''}</p>
                                    {r.markedAt ? (
                                      <p style={{ margin: 0, fontSize: '11px', color: '#F59E0B', fontWeight: 600 }}>Confirmado por inquilino</p>
                                    ) : (
                                      <p style={{ margin: 0, fontSize: '11px', color: '#C62828', fontWeight: 600 }}>sin pago</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── Incidencias ── */}
              {(() => {
                const count = supabaseIncidents.length;
                const hasAlert = count > 0;
                const color = hasAlert ? '#E65100' : '#2E7D32';
                const iconColor = hasAlert ? '#FB8C00' : '#4CAF50';
                const bg = hasAlert ? '#FFF8E1' : '#F1F8E9';
                const border = hasAlert ? 'rgba(251,140,0,0.15)' : 'rgba(76,175,80,0.15)';
                const isOpen = expandedCard === 'incidents';
                return (
                  <div style={{ borderRadius: '14px', border: `1px solid ${border}`, overflow: 'hidden' }}>
                    <button onClick={() => toggleCard('incidents')} style={{ width: '100%', background: bg, border: 'none', padding: '13px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '11px' }}>
                      <div style={{ flexShrink: 0, width: '32px', height: '32px', borderRadius: '8px', background: hasAlert ? 'rgba(251,140,0,0.1)' : 'rgba(76,175,80,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <p style={{ margin: '0 0 1px', fontSize: '13px', fontWeight: 700, color }}>
                          {count} incidencia{count !== 1 ? 's' : ''} abierta{count !== 1 ? 's' : ''}
                        </p>
                        <p style={{ margin: 0, fontSize: '11px', color: '#999' }}>
                          {hasAlert ? 'requieren tu atención' : 'sin incidencias activas'}
                        </p>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                        <path d="M6 9l6 6 6-6" stroke="#bbb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    {isOpen && (
                      <div style={{ padding: '10px 14px 14px', background: 'white', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {supabaseIncidents.length === 0 ? (
                          <p style={{ margin: 0, fontSize: '13px', color: '#888', textAlign: 'center', padding: '4px 0' }}>No hay incidencias abiertas</p>
                        ) : supabaseIncidents.map(incident => {
                          const hasImage = incident.attachment_url && /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(incident.attachment_url);
                          const hasFile = incident.attachment_url && !hasImage;
                          const photoOpen = !!expandedIncidentPhoto[incident.id];
                          return (
                            <div key={incident.id} style={{ borderRadius: '10px', background: '#FFF8E1', overflow: 'hidden' }}>
                              <div style={{ padding: '10px 12px' }}>
                                <p style={{ margin: '0 0 3px', fontSize: '13px', fontWeight: 600, color: '#333' }}>
                                  {incident.property_name} — {incident.tenant_name}
                                </p>
                                <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#555', lineHeight: '1.5' }}>
                                  {incident.description}
                                </p>
                                {/* Fila inferior: fecha + adjunto (si hay) + resolver */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <p style={{ margin: 0, fontSize: '11px', color: '#aaa', flex: 1 }}>
                                    {new Date(incident.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                  {hasImage && (
                                    <button
                                      onClick={() => toggleIncidentPhoto(incident.id)}
                                      title="Ver foto adjunta"
                                      style={{ display: 'flex', alignItems: 'center', gap: '4px', background: photoOpen ? 'rgba(251,140,0,0.12)' : 'rgba(0,0,0,0.06)', border: 'none', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer' }}
                                    >
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                                        <rect x="3" y="3" width="18" height="18" rx="2" stroke={photoOpen ? '#FB8C00' : '#666'} strokeWidth="2"/>
                                        <circle cx="8.5" cy="8.5" r="1.5" fill={photoOpen ? '#FB8C00' : '#666'}/>
                                        <path d="M21 15l-5-5L5 21" stroke={photoOpen ? '#FB8C00' : '#666'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                      </svg>
                                      <span style={{ fontSize: '11px', color: photoOpen ? '#FB8C00' : '#555', fontWeight: 600 }}>Foto</span>
                                    </button>
                                  )}
                                  {hasFile && (
                                    <a
                                      href={incident.attachment_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(0,0,0,0.06)', borderRadius: '6px', padding: '4px 8px', textDecoration: 'none' }}
                                    >
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        <path d="M14 2v6h6" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                      </svg>
                                      <span style={{ fontSize: '11px', color: '#555', fontWeight: 600 }}>Archivo</span>
                                    </a>
                                  )}
                                  <button
                                    onClick={() => handleResolveIncident(incident.id)}
                                    style={{ background: '#4CAF50', color: 'white', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                                  >
                                    Resolver
                                  </button>
                                </div>
                              </div>
                              {hasImage && photoOpen && (
                                <img
                                  src={incident.attachment_url}
                                  alt="Adjunto"
                                  onClick={() => window.open(incident.attachment_url, '_blank')}
                                  style={{ width: '100%', maxHeight: '120px', objectFit: 'cover', display: 'block', cursor: 'pointer', borderRadius: '0 0 10px 10px' }}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── Atención financiera ── */}
              {(() => {
                const isOpen = expandedCard === 'financial';
                const subtitle = hasGraveAlerts
                  ? [
                      negativeCashflowProps.length > 0 && `${negativeCashflowProps.length} piso${negativeCashflowProps.length !== 1 ? 's' : ''} con pérdidas`,
                      emptyProps.length > 0 && `${emptyProps.length} piso${emptyProps.length !== 1 ? 's' : ''} vacío${emptyProps.length !== 1 ? 's' : ''}`,
                      emptyRooms.length > 0 && `${emptyRooms.length} habitación${emptyRooms.length !== 1 ? 'es' : ''} vacía${emptyRooms.length !== 1 ? 's' : ''}`,
                    ].filter(Boolean).join(' · ')
                  : `Cashflow medio: ${avgCashflow >= 0 ? '+' : ''}${avgCashflow.toFixed(0)} €/mes`;
                return (
                  <div style={{ borderRadius: '14px', border: '1px solid rgba(25,118,210,0.15)', overflow: 'hidden' }}>
                    <button onClick={() => toggleCard('financial')} style={{ width: '100%', background: '#E3F2FD', border: 'none', padding: '13px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '11px' }}>
                      <div style={{ flexShrink: 0, width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(25,118,210,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#1976D2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M14 2v6h6" stroke="#1976D2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <line x1="16" y1="13" x2="8" y2="13" stroke="#1976D2" strokeWidth="2" strokeLinecap="round"/>
                          <line x1="16" y1="17" x2="8" y2="17" stroke="#1976D2" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '1px' }}>
                          <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#1565C0' }}>Atención financiera</p>
                          {hasGraveAlerts && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="#E53935" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="rgba(229,57,53,0.1)"/>
                              <line x1="12" y1="9" x2="12" y2="13" stroke="#E53935" strokeWidth="2" strokeLinecap="round"/>
                              <line x1="12" y1="17" x2="12.01" y2="17" stroke="#E53935" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                          )}
                        </div>
                        <p style={{ margin: 0, fontSize: '11px', color: '#999' }}>{subtitle}</p>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                        <path d="M6 9l6 6 6-6" stroke="#bbb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    {isOpen && (
                      <div style={{ padding: '10px 14px 14px', background: 'white', display: 'flex', flexDirection: 'column', gap: '8px' }}>

                        {/* Alertas graves en rojo */}
                        {negativeCashflowProps.map((s, i) => (
                          <div key={`neg-${i}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: '10px', background: '#FBE9E7' }}>
                            <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#333' }}>{s.name} — los gastos superan los ingresos</p>
                            <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#C62828', flexShrink: 0, marginLeft: '8px' }}>−{Math.abs(s.net).toFixed(0)} €/mes</p>
                          </div>
                        ))}
                        {emptyProps.map((p, i) => (
                          <div key={`eprop-${i}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: '10px', background: '#FBE9E7' }}>
                            <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#333' }}>{p.name} — piso vacío este mes</p>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginLeft: '8px' }}>
                              <circle cx="12" cy="12" r="10" stroke="#E53935" strokeWidth="2"/>
                              <line x1="15" y1="9" x2="9" y2="15" stroke="#E53935" strokeWidth="2" strokeLinecap="round"/>
                              <line x1="9" y1="9" x2="15" y2="15" stroke="#E53935" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                          </div>
                        ))}
                        {emptyRooms.map((r, i) => (
                          <div key={`eroom-${i}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: '10px', background: '#FBE9E7' }}>
                            <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#333' }}>{r.roomName} ({r.propName}) — habitación vacía este mes</p>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginLeft: '8px' }}>
                              <circle cx="12" cy="12" r="10" stroke="#E53935" strokeWidth="2"/>
                              <line x1="15" y1="9" x2="9" y2="15" stroke="#E53935" strokeWidth="2" strokeLinecap="round"/>
                              <line x1="9" y1="9" x2="15" y2="15" stroke="#E53935" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                          </div>
                        ))}

                        {/* Consejos en azul/gris */}
                        {avgCashflow > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '10px', background: '#E3F2FD' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke="#1976D2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <polyline points="22 4 12 14.01 9 11.01" stroke="#1976D2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <p style={{ margin: 0, fontSize: '12px', color: '#1565C0' }}>Buen rendimiento general, cashflow medio de <strong>+{avgCashflow.toFixed(0)} €/mes</strong></p>
                          </div>
                        )}
                        {propsWithoutExpenses.length > 0 && propsWithoutExpenses.map((s, i) => (
                          <div key={`noexp-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '10px', background: '#F3F4F6' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                              <circle cx="12" cy="12" r="10" stroke="#888" strokeWidth="2"/>
                              <line x1="12" y1="8" x2="12" y2="12" stroke="#888" strokeWidth="2" strokeLinecap="round"/>
                              <line x1="12" y1="16" x2="12.01" y2="16" stroke="#888" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                            <p style={{ margin: 0, fontSize: '12px', color: '#555' }}><strong>{s.name}</strong> no tiene gastos registrados, considera añadir hipoteca o comunidad</p>
                          </div>
                        ))}
                        {showHighExpenses && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '10px', background: '#FFF8E1' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="#FB8C00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <line x1="12" y1="9" x2="12" y2="13" stroke="#FB8C00" strokeWidth="2" strokeLinecap="round"/>
                              <line x1="12" y1="17" x2="12.01" y2="17" stroke="#FB8C00" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                            <p style={{ margin: 0, fontSize: '12px', color: '#E65100' }}>Gastos <strong>+{expensesHighPct}%</strong> sobre la media de los últimos 6 meses</p>
                          </div>
                        )}
                        {occupationRate >= 80 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '10px', background: '#E3F2FD' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke="#1976D2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <polyline points="22 4 12 14.01 9 11.01" stroke="#1976D2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <p style={{ margin: 0, fontSize: '12px', color: '#1565C0' }}>Ocupación al <strong>{occupationRate}%</strong>, muy por encima de la media</p>
                          </div>
                        )}
                        {!hasGraveAlerts && !showHighExpenses && propsWithoutExpenses.length === 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '10px', background: '#F3F4F6' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                              <circle cx="12" cy="12" r="10" stroke="#888" strokeWidth="2"/>
                              <line x1="12" y1="8" x2="12" y2="12" stroke="#888" strokeWidth="2" strokeLinecap="round"/>
                              <line x1="12" y1="16" x2="12.01" y2="16" stroke="#888" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                            <p style={{ margin: 0, fontSize: '12px', color: '#555' }}>Revisa los gastos deducibles antes de la declaración de IRPF</p>
                          </div>
                        )}

                      </div>
                    )}
                  </div>
                );
              })()}

            </div>
          </div>
        )}

        {/* Ranking inmuebles */}
        {(propertyStats.length > 0 || usoPropioProperties.length > 0) && (
          <div style={{ background: 'white', borderRadius: '20px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '15px', fontWeight: 600, color: '#111' }}>Inmuebles este mes</h3>

            {/* Alquileres */}
            {propertyStats.length > 0 && (
              <>
                {usoPropioProperties.length > 0 && (
                  <p style={{ margin: '0 0 8px', fontSize: '11px', fontWeight: 700, color: '#bbb', letterSpacing: '0.5px' }}>ALQUILERES</p>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {propertyStats.map((stat, i) => {
                    const matchedProperty = properties.find(p => p.name === stat.name);
                    return (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px 14px', borderRadius: '12px', background: '#F9F9F9',
                        cursor: 'pointer'
                      }} onClick={() => {
                        if (matchedProperty) {
                          setRentabilityInitialPropertyId(String(matchedProperty.id));
                          setShowRentabilityModal(true);
                        }
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{
                            width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', fontSize: '11px', fontWeight: 700,
                            background: i === 0 ? '#FFF8E1' : '#F3F4F6',
                            color: i === 0 ? '#F9A825' : '#999'
                          }}>{i + 1}</span>
                          <div>
                            <p style={{ margin: 0, fontSize: '14px', fontWeight: 500, color: '#111' }}>{stat.name}</p>
                            <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#aaa' }}>
                              +{stat.income.toFixed(0)} € ingresos · -{stat.expenses.toFixed(0)} € gastos
                            </p>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            fontSize: '15px', fontWeight: 700,
                            color: stat.net >= 0 ? '#2E7D32' : '#C62828'
                          }}>
                            {stat.net >= 0 ? '+' : ''}{stat.net.toFixed(0)} €
                          </span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, opacity: 0.35 }}>
                            <path d="M9 18l6-6-6-6" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Uso propio */}
            {usoPropioProperties.length > 0 && (
              <>
                {propertyStats.length > 0 && (
                  <div style={{ borderTop: '1px solid #f0f0f0', margin: '14px 0 10px' }} />
                )}
                <p style={{ margin: '0 0 8px', fontSize: '11px', fontWeight: 700, color: '#bbb', letterSpacing: '0.5px' }}>USO PROPIO</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {usoPropioProperties.map((p, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 14px', borderRadius: '12px', background: '#EEF3FB',
                      cursor: 'pointer'
                    }} onClick={onNavigateToProperties}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#3F6BAA', flexShrink: 0 }} />
                        <p style={{ margin: 0, fontSize: '14px', fontWeight: 500, color: '#111' }}>{p.name}</p>
                      </div>
                      <span style={{ fontSize: '12px', color: '#3F6BAA', fontWeight: 600 }}>Uso propio</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Estado vacío */}
        {properties.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#aaa' }}>
            <p style={{ fontSize: '15px' }}>Aún no tienes inmuebles.</p>
            <p style={{ fontSize: '13px' }}>Ve a Propiedades para añadir el primero.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Modal reporte anual
// ─────────────────────────────────────────────
const CATEGORY_LABELS = {
  ibi: 'IBI', comunidad: 'Comunidad de propietarios', seguro: 'Seguro del hogar',
  reparaciones: 'Reparaciones y conservación', suministros: 'Suministros',
  amortizacion: 'Amortización del inmueble', hipoteca: 'Intereses hipotecarios',
  gestion: 'Gastos de gestión', otros: 'Otros',
};

function ReportModal({ properties, onClose }) {
  const currentYear = now.getFullYear();
  const reportableProperties = properties.filter(p => p.status !== 'uso_propio');
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [ownerName, setOwnerName] = useState('');
  const [ownerNif, setOwnerNif] = useState('');
  // tipo fiscal por propiedad: 'vivienda' | 'turistico'
  const [fiscalTypes, setFiscalTypes] = useState(() =>
    Object.fromEntries(reportableProperties.map(p => [p.id, p.status === 'vacacional' ? 'turistico' : 'vivienda']))
  );

  const years = [];
  const minYear = reportableProperties.reduce((min, p) => {
    const y = new Date(p.createdAt || now).getFullYear();
    return y < min ? y : min;
  }, currentYear);
  for (let y = currentYear; y >= minYear; y--) years.push(y);

  const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const monthShort = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  const getYearlyData = (property) => {
    const ownership = (property.ownershipPercentage || 100) / 100;
    const monthsData = [];

    for (let m = 0; m < 12; m++) {
      let cobrado = 0, pendiente = 0;

      if (property.status === 'vacacional') {
        cobrado = (property.bookings || [])
          .filter(b => { const s = new Date(b.startDate); return b.status === 'confirmed' && s.getFullYear() === selectedYear && s.getMonth() === m; })
          .reduce((sum, b) => sum + (b.amount || 0), 0) * ownership;
        pendiente = (property.bookings || [])
          .filter(b => { const s = new Date(b.startDate); return b.status === 'pending' && s.getFullYear() === selectedYear && s.getMonth() === m; })
          .reduce((sum, b) => sum + (b.amount || 0), 0) * ownership;
      } else if (property.status === 'por_habitaciones') {
        cobrado = (property.payments || [])
          .filter(p => p.year === selectedYear && p.month === m && p.status === 'confirmed' && p.roomId)
          .reduce((sum, p) => sum + (p.amount || 0), 0) * ownership;
        pendiente = (property.payments || [])
          .filter(p => p.year === selectedYear && p.month === m && p.status === 'pending' && p.roomId)
          .reduce((sum, p) => sum + (p.amount || 0), 0) * ownership;
      } else if (property.status === 'alquilado' || property.status === 'otros') {
        cobrado = (property.payments || [])
          .filter(p => p.year === selectedYear && p.month === m && p.status === 'confirmed')
          .reduce((sum, p) => sum + (p.amount || 0), 0) * ownership;
        pendiente = (property.payments || [])
          .filter(p => p.year === selectedYear && p.month === m && p.status === 'pending')
          .reduce((sum, p) => sum + (p.amount || 0), 0) * ownership;
      }

      const expenses = (property.expenses || []).reduce((sum, e) => {
        const created = new Date(e.createdAt);
        const cy = created.getFullYear(), cm = created.getMonth();
        if (selectedYear < cy || (selectedYear === cy && m < cm)) return sum;
        if (e.frequency === 'unico' && !(selectedYear === cy && m === cm)) return sum;
        const pct = e.expensePercentage || (property.ownershipPercentage || 100);
        return sum + (e.amount * pct / 100);
      }, 0);

      monthsData.push({ month: m, cobrado, pendiente, expenses });
    }

    // Detalle de gastos con fecha
    const expenseDetail = (property.expenses || []).map(e => {
      const created = new Date(e.createdAt);
      const cy = created.getFullYear();
      if (cy > selectedYear) return null;
      const annual = e.frequency === 'unico'
        ? (cy === selectedYear ? e.amount * (e.expensePercentage || property.ownershipPercentage || 100) / 100 : 0)
        : e.amount * 12 * (e.expensePercentage || property.ownershipPercentage || 100) / 100;
      if (annual === 0) return null;
      return {
        date: created.toLocaleDateString('es-ES'),
        category: CATEGORY_LABELS[e.category] || e.category || 'Otros',
        name: e.description || e.name || '',
        frequency: e.frequency,
        amount: annual,
        monthly: e.amount,
      };
    }).filter(Boolean);

    // Gastos por categoría
    const expensesByCategory = {};
    expenseDetail.forEach(e => {
      const cat = e.category;
      if (!expensesByCategory[cat]) expensesByCategory[cat] = 0;
      expensesByCategory[cat] += e.amount;
    });

    const totalCobrado = monthsData.reduce((s, m) => s + m.cobrado, 0);
    const totalPendiente = monthsData.reduce((s, m) => s + m.pendiente, 0);
    const totalExpenses = monthsData.reduce((s, m) => s + m.expenses, 0);

    return { monthsData, totalCobrado, totalPendiente, totalExpenses, net: totalCobrado - totalExpenses, expenseDetail, expensesByCategory };
  };

  // ── Exportar Excel ──
  const generateExcel = () => {
    import('xlsx').then(XLSX => {
      const rows = [];
      reportableProperties.forEach(property => {
        const data = getYearlyData(property);
        // Ingresos
        data.monthsData.forEach(({ month, cobrado, pendiente }) => {
          if (cobrado > 0) rows.push({ Fecha: `${monthNames[month]} ${selectedYear}`, Inmueble: property.name, Tipo: 'Ingreso', Categoría: 'Alquiler', Concepto: 'Ingreso cobrado', Importe: cobrado, Estado: 'Cobrado' });
          if (pendiente > 0) rows.push({ Fecha: `${monthNames[month]} ${selectedYear}`, Inmueble: property.name, Tipo: 'Ingreso', Categoría: 'Alquiler', Concepto: 'Ingreso pendiente', Importe: pendiente, Estado: 'Pendiente' });
        });
        // Gastos
        data.expenseDetail.forEach(e => {
          rows.push({ Fecha: e.date, Inmueble: property.name, Tipo: 'Gasto', Categoría: e.category, Concepto: e.name, Importe: -e.amount, Estado: 'Pagado' });
        });
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [{ wch: 18 }, { wch: 24 }, { wch: 10 }, { wch: 28 }, { wch: 28 }, { wch: 12 }, { wch: 12 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Fiscal ${selectedYear}`);
      XLSX.writeFile(wb, `reporte_fiscal_${selectedYear}.xlsx`);
    });
  };

  // ── Generar PDF ──
  const generatePDF = () => {
    import('jspdf').then(({ jsPDF }) => {
      const doc = new jsPDF();
      const pageW = doc.internal.pageSize.getWidth();
      let y = 0;

      const addPage = () => {
        // Nota legal en cada página
        doc.setFontSize(6.5); doc.setTextColor(180); doc.setFont('helvetica', 'italic');
        doc.text('Documento informativo generado por Domio. No constituye asesoramiento fiscal ni tiene validez legal ante la Agencia Tributaria.', 14, 291);
        doc.addPage(); y = 20;
      };
      const checkSpace = (needed) => { if (y + needed > 280) addPage(); };

      const drawHeader = () => {
        doc.setFillColor(17, 17, 17);
        doc.rect(0, 0, pageW, 38, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18); doc.setFont('helvetica', 'bold');
        doc.text('Domio', 14, 16);
        doc.setFontSize(10); doc.setFont('helvetica', 'normal');
        doc.text(`Reporte Fiscal ${selectedYear}`, 14, 26);
        doc.setFontSize(8); doc.setTextColor(170, 170, 170);
        doc.text(`Generado el ${now.toLocaleDateString('es-ES')}`, pageW - 14, 26, { align: 'right' });
        y = 48;
      };

      drawHeader();

      // Propietario
      if (ownerName || ownerNif) {
        doc.setTextColor(60); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
        if (ownerName) { doc.text(`Propietario: ${ownerName}`, 14, y); y += 6; }
        if (ownerNif) { doc.text(`NIF/CIF: ${ownerNif}`, 14, y); y += 6; }
        y += 4;
      }

      // ── PÁGINA 1: Resumen global ──
      const allData = reportableProperties.map(p => ({ p, d: getYearlyData(p) }));
      const globalCobrado = allData.reduce((s, { d }) => s + d.totalCobrado, 0);
      const globalPendiente = allData.reduce((s, { d }) => s + d.totalPendiente, 0);
      const globalExpenses = allData.reduce((s, { d }) => s + d.totalExpenses, 0);
      const globalNet = globalCobrado - globalExpenses;

      // Caja resumen
      doc.setFillColor(245, 245, 245);
      doc.roundedRect(14, y, pageW - 28, 36, 3, 3, 'F');
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(17);
      doc.text('Resumen Global del Año', 20, y + 9);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.setTextColor(46, 125, 50); doc.text(`Ingresos cobrados: +${globalCobrado.toFixed(2)} €`, 20, y + 19);
      if (globalPendiente > 0) { doc.setTextColor(230, 120, 0); doc.text(`Pendiente de cobro: ${globalPendiente.toFixed(2)} €`, 20, y + 26); }
      doc.setTextColor(198, 40, 40); doc.text(`Gastos deducibles: -${globalExpenses.toFixed(2)} €`, 110, y + 19);
      globalNet >= 0 ? doc.setTextColor(46, 125, 50) : doc.setTextColor(198, 40, 40);
      doc.setFont('helvetica', 'bold');
      doc.text(`Rendimiento neto: ${globalNet >= 0 ? '+' : ''}${globalNet.toFixed(2)} €`, 110, y + 26);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
      doc.text(`${reportableProperties.length} inmueble${reportableProperties.length !== 1 ? 's' : ''}`, 20, y + 33);
      y += 44;

      // Gastos globales por categoría
      const globalCats = {};
      allData.forEach(({ d }) => {
        Object.entries(d.expensesByCategory).forEach(([cat, total]) => {
          globalCats[cat] = (globalCats[cat] || 0) + total;
        });
      });
      const catEntries = Object.entries(globalCats).filter(([, v]) => v > 0);
      if (catEntries.length > 0) {
        checkSpace(14 + catEntries.length * 7);
        doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(17);
        doc.text('Gastos por Categoría (todos los inmuebles)', 14, y); y += 6;
        doc.setDrawColor(220); doc.line(14, y, pageW - 14, y); y += 5;
        catEntries.sort((a, b) => b[1] - a[1]).forEach(([cat, total]) => {
          doc.setFont('helvetica', 'normal'); doc.setTextColor(60); doc.setFontSize(8.5);
          doc.text(cat, 18, y);
          doc.setTextColor(198, 40, 40);
          doc.text(`-${total.toFixed(2)} €`, pageW - 18, y, { align: 'right' });
          doc.setDrawColor(240); doc.line(14, y + 2, pageW - 14, y + 2); y += 7;
        });
        y += 6;
      }

      // ── POR CADA INMUEBLE ──
      allData.forEach(({ p: property, d: data }) => {
        checkSpace(50);

        // Cabecera inmueble
        doc.setFillColor(230, 230, 230);
        doc.rect(14, y, pageW - 28, 12, 'F');
        doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(17);
        doc.text(property.name, 18, y + 8);
        const fiscalType = fiscalTypes[property.id] === 'turistico' ? 'Alquiler turístico' : 'Vivienda habitual';
        const typeLabel = property.status === 'alquilado' ? 'Alquilado' : property.status === 'por_habitaciones' ? 'Por habitaciones' : property.status === 'vacacional' ? 'Vacacional' : property.status === 'otros' ? (property.customType || 'Otros') : 'Vacío';
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(80);
        doc.text(`${typeLabel} · ${property.ownershipPercentage || 100}% · ${fiscalType}`, pageW - 18, y + 8, { align: 'right' });
        y += 18;

        // Tabla mensual con estado cobro
        checkSpace(12);
        doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(130);
        const c = [18, 48, 88, 122, 155, 182];
        doc.text('MES', c[0], y); doc.text('COBRADO', c[1], y); doc.text('PENDIENTE', c[2], y);
        doc.text('GASTOS', c[3], y); doc.text('NETO', c[4], y);
        doc.setDrawColor(210); doc.line(14, y + 2, pageW - 14, y + 2); y += 7;

        data.monthsData.forEach(({ month, cobrado, pendiente, expenses }) => {
          if (cobrado === 0 && pendiente === 0 && expenses === 0) return;
          checkSpace(7);
          doc.setFont('helvetica', 'normal'); doc.setTextColor(50); doc.setFontSize(8);
          doc.text(monthShort[month], c[0], y);
          doc.setTextColor(46, 125, 50); doc.text(cobrado > 0 ? `+${cobrado.toFixed(2)} €` : '—', c[1], y);
          doc.setTextColor(pendiente > 0 ? 200 : 180); doc.text(pendiente > 0 ? `${pendiente.toFixed(2)} €` : '—', c[2], y);
          doc.setTextColor(198, 40, 40); doc.text(expenses > 0 ? `-${expenses.toFixed(2)} €` : '—', c[3], y);
          const net = cobrado - expenses;
          net >= 0 ? doc.setTextColor(46, 125, 50) : doc.setTextColor(198, 40, 40);
          doc.text(`${net >= 0 ? '+' : ''}${net.toFixed(2)} €`, c[4], y);
          doc.setDrawColor(242); doc.line(14, y + 2, pageW - 14, y + 2); y += 7;
        });

        // Total inmueble
        checkSpace(10);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(17);
        doc.text('TOTAL', c[0], y);
        doc.setTextColor(46, 125, 50); doc.text(`+${data.totalCobrado.toFixed(2)} €`, c[1], y);
        if (data.totalPendiente > 0) { doc.setTextColor(200, 100, 0); doc.text(`${data.totalPendiente.toFixed(2)} €`, c[2], y); }
        doc.setTextColor(198, 40, 40); doc.text(`-${data.totalExpenses.toFixed(2)} €`, c[3], y);
        data.net >= 0 ? doc.setTextColor(46, 125, 50) : doc.setTextColor(198, 40, 40);
        doc.text(`${data.net >= 0 ? '+' : ''}${data.net.toFixed(2)} €`, c[4], y);
        y += 12;

        // Detalle de gastos
        if (data.expenseDetail.length > 0) {
          checkSpace(12 + data.expenseDetail.length * 7);
          doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(100);
          doc.text('DETALLE DE GASTOS', 18, y); y += 5;
          doc.setDrawColor(220); doc.line(14, y, pageW - 14, y); y += 5;
          const gc = [18, 42, 100, 155];
          doc.setFontSize(7); doc.setTextColor(140);
          doc.text('FECHA', gc[0], y); doc.text('CATEGORÍA', gc[1], y); doc.text('CONCEPTO', gc[2], y); doc.text('IMPORTE', gc[3], y);
          y += 5;
          data.expenseDetail.forEach(e => {
            checkSpace(7);
            doc.setFont('helvetica', 'normal'); doc.setTextColor(60); doc.setFontSize(7.5);
            doc.text(e.date, gc[0], y);
            doc.text(e.category.length > 22 ? e.category.substring(0, 22) + '…' : e.category, gc[1], y);
            const concept = e.name.length > 28 ? e.name.substring(0, 28) + '…' : (e.name || '—');
            doc.text(concept, gc[2], y);
            doc.setTextColor(198, 40, 40);
            doc.text(`-${e.amount.toFixed(2)} €`, gc[3], y);
            doc.setDrawColor(245); doc.line(14, y + 2, pageW - 14, y + 2); y += 7;
          });
          y += 6;
        }

        y += 4;
      });

      // ── ÚLTIMA PÁGINA: Datos para IRPF ──
      addPage();
      drawHeader();

      // Título sección
      doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(17);
      doc.text('Datos para la Declaración de la Renta (IRPF)', 14, y);
      y += 3;
      doc.setDrawColor(17); doc.setLineWidth(0.8); doc.line(14, y, pageW - 14, y); doc.setLineWidth(0.2);
      y += 12;

      allData.forEach(({ p: property, d: data }) => {
        const fiscalType = fiscalTypes[property.id] === 'turistico' ? 'Alquiler turístico' : 'Vivienda habitual';
        const reduction = fiscalTypes[property.id] === 'vivienda' ? 0.6 : 0;
        const netPrevio = data.totalCobrado - data.totalExpenses;

        const rows2 = [
          { label: 'Ingresos íntegros (cobrados)', value: `${data.totalCobrado.toFixed(2)} €`, color: [46, 125, 50] },
          { label: 'Gastos deducibles', value: `-${data.totalExpenses.toFixed(2)} €`, color: [198, 40, 40] },
          { label: 'Rendimiento neto previo', value: `${netPrevio >= 0 ? '+' : ''}${netPrevio.toFixed(2)} €`, color: netPrevio >= 0 ? [46, 125, 50] : [198, 40, 40], bold: !reduction },
        ];
        if (reduction > 0) {
          if (netPrevio > 0) {
            const reductionAmt = netPrevio * reduction;
            const netReducido = netPrevio * (1 - reduction);
            rows2.push({ label: 'Reducción vivienda habitual (60%)', value: `-${reductionAmt.toFixed(2)} €`, color: [198, 40, 40] });
            rows2.push({ label: 'Rendimiento neto reducido', value: `+${netReducido.toFixed(2)} €`, color: [46, 125, 50], bold: true });
          } else {
            rows2.push({ label: 'Reducción vivienda habitual (60%)', value: 'No aplica (rendimiento negativo)', color: [160, 160, 160] });
            rows2.push({ label: 'Rendimiento neto reducido', value: `${netPrevio.toFixed(2)} €`, color: [198, 40, 40], bold: true });
          }
        }
        if (data.totalPendiente > 0) {
          rows2.push({ label: 'Pendiente de cobro (no computa en IRPF)', value: `${data.totalPendiente.toFixed(2)} €`, color: [180, 100, 0] });
        }

        const boxH = 18 + rows2.length * 9 + 6;
        checkSpace(boxH + 8);

        // Borde izquierdo de color + caja blanca con sombra simulada
        doc.setFillColor(248, 248, 248);
        doc.roundedRect(14, y, pageW - 28, boxH, 3, 3, 'F');
        doc.setFillColor(17, 17, 17);
        doc.rect(14, y, 3, boxH, 'F');

        // Nombre inmueble
        doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(17);
        doc.text(property.name, 22, y + 8);

        // Badge tipo fiscal
        const badgeX = pageW - 18;
        const badgeLabel = fiscalType;
        doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        const badgeW = doc.getTextWidth(badgeLabel) + 8;
        doc.setFillColor(fiscalTypes[property.id] === 'turistico' ? 255 : 240, fiscalTypes[property.id] === 'turistico' ? 243 : 248, fiscalTypes[property.id] === 'turistico' ? 224 : 255);
        doc.roundedRect(badgeX - badgeW, y + 3, badgeW, 8, 2, 2, 'F');
        doc.setTextColor(fiscalTypes[property.id] === 'turistico' ? 100 : 50, fiscalTypes[property.id] === 'turistico' ? 120 : 80, fiscalTypes[property.id] === 'turistico' ? 40 : 160);
        doc.text(badgeLabel, badgeX - badgeW / 2, y + 8.5, { align: 'center' });

        // Separador
        doc.setDrawColor(230); doc.line(22, y + 12, pageW - 18, y + 12);

        // Filas de datos
        let ry = y + 20;
        rows2.forEach(row => {
          doc.setFontSize(8.5);
          doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
          doc.setTextColor(row.bold ? 17 : 70);
          doc.text(row.label, 22, ry);
          doc.setTextColor(...row.color);
          doc.setFont('helvetica', 'bold');
          doc.text(row.value, pageW - 18, ry, { align: 'right' });

          // Línea separadora suave solo entre filas (no al final)
          if (!row.bold) {
            doc.setDrawColor(238); doc.line(22, ry + 2, pageW - 18, ry + 2);
          }
          ry += 9;
        });

        y += boxH + 10;
      });

      // Caja resumen IRPF total
      checkSpace(38);
      doc.setFillColor(17, 17, 17);
      doc.roundedRect(14, y, pageW - 28, 34, 3, 3, 'F');

      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
      doc.text('Total a declarar', 20, y + 10);

      // Tres columnas dentro de la caja oscura
      const tc = [20, 85, 155];
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(170, 170, 170);
      doc.text('INGRESOS COBRADOS', tc[0], y + 18);
      doc.text('GASTOS DEDUCIBLES', tc[1], y + 18);
      doc.text('RENDIMIENTO NETO', tc[2], y + 18);

      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.setTextColor(150, 230, 150); doc.text(`+${globalCobrado.toFixed(2)} €`, tc[0], y + 27);
      doc.setTextColor(230, 100, 100); doc.text(`-${globalExpenses.toFixed(2)} €`, tc[1], y + 27);
      globalNet >= 0 ? doc.setTextColor(150, 230, 150) : doc.setTextColor(230, 100, 100);
      doc.text(`${globalNet >= 0 ? '+' : ''}${globalNet.toFixed(2)} €`, tc[2], y + 27);

      y += 40;

      // Nota legal final
      doc.setFontSize(6.5); doc.setTextColor(170); doc.setFont('helvetica', 'italic');
      doc.text('Documento informativo generado por Domio. No constituye asesoramiento fiscal ni tiene validez legal ante la Agencia Tributaria.', 14, 291);

      doc.save(`reporte_fiscal_${selectedYear}.pdf`);
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Reporte anual</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '4px 0' }}>
          <div className="form-group">
            <label>Año fiscal</label>
            <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}
              style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #ddd', fontSize: '15px', background: 'white' }}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Tu nombre (opcional)</label>
            <input type="text" placeholder="Ej: Marcos Ventura" value={ownerName} onChange={e => setOwnerName(e.target.value)} />
          </div>
          <div className="form-group">
            <label>NIF (opcional)</label>
            <input type="text" placeholder="Ej: 12345678A" value={ownerNif} onChange={e => setOwnerNif(e.target.value)} />
          </div>

          {/* Tipo fiscal por propiedad */}
          {reportableProperties.length > 0 && (
            <div className="form-group">
              <label>Tipo fiscal por inmueble</label>
              {reportableProperties.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <span style={{ fontSize: '13px', color: '#333', flex: 1 }}>{p.name}</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[['vivienda', 'Vivienda'], ['turistico', 'Turístico']].map(([key, label]) => (
                      <button key={key} type="button"
                        onClick={() => setFiscalTypes(prev => ({ ...prev, [p.id]: key }))}
                        style={{
                          padding: '5px 10px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
                          border: `1.5px solid ${fiscalTypes[p.id] === key ? '#111' : '#ddd'}`,
                          background: fiscalTypes[p.id] === key ? '#111' : 'white',
                          color: fiscalTypes[p.id] === key ? 'white' : '#666',
                          fontWeight: fiscalTypes[p.id] === key ? 600 : 400,
                        }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <p style={{ margin: 0, fontSize: '12px', color: '#aaa', lineHeight: '1.5' }}>
            El reporte incluye ingresos con estado de cobro, gastos desglosados por categoría, resumen global y página de datos para el IRPF.
          </p>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="submit-button" style={{ flex: 1 }} onClick={generatePDF}>Descargar PDF</button>
            <button className="submit-button" style={{ flex: 1, background: '#1D6F42' }} onClick={generateExcel}>Descargar Excel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Modal calculadora de rentabilidad
// ─────────────────────────────────────────────
function RentabilityModal({ properties, supabaseExpenses, initialPropertyId, onClose }) {
  const [selectedPropertyId, setSelectedPropertyId] = useState(
    initialPropertyId ?? (properties.length > 0 ? String(properties[0].id) : '')
  );
  const [investmentData, setInvestmentData] = useState({
    purchasePrice: '',
    initialInvestment: '',
    monthlyMortgage: '',
    monthlyAmortization: '',
    loanCapital: '',
    interestRate: '',
    rateType: 'fijo',
    loanYears: '',
    loanStartDate: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [historyPayments, setHistoryPayments] = useState([]);

  const property = properties.find(p => String(p.id) === String(selectedPropertyId));

  useEffect(() => {
    if (property?.investmentData) {
      setInvestmentData({
        purchasePrice: property.investmentData.purchasePrice ?? '',
        initialInvestment: property.investmentData.initialInvestment ?? '',
        monthlyMortgage: property.investmentData.monthlyMortgage ?? '',
        monthlyAmortization: property.investmentData.monthlyAmortization ?? '',
        loanCapital: property.investmentData.loanCapital ?? '',
        interestRate: property.investmentData.interestRate ?? '',
        rateType: property.investmentData.rateType ?? 'fijo',
        loanYears: property.investmentData.loanYears ?? '',
        loanStartDate: property.investmentData.loanStartDate ?? '',
      });
    } else {
      setInvestmentData({ purchasePrice: '', initialInvestment: '', monthlyMortgage: '', monthlyAmortization: '', loanCapital: '', interestRate: '', rateType: 'fijo', loanYears: '', loanStartDate: '' });
    }
    setSaved(false);
    setHistoryPayments([]);
    if (!property) return;
    supabase
      .from('payments')
      .select('year, month, amount, status')
      .eq('property_id', String(property.id))
      .eq('status', 'confirmed')
      .then(({ data }) => { if (data) setHistoryPayments(data); });
  }, [selectedPropertyId]);

  const handleSave = async () => {
    if (!property) return;
    setSaving(true);
    const updatedProperty = { ...property, investmentData };
    await supabase
      .from('properties')
      .update({ data: updatedProperty, updated_at: new Date().toISOString() })
      .eq('id', property.id);
    setSaving(false);
    setSaved(true);
  };

  const handleExportPDF = () => {
    import('jspdf').then(({ jsPDF }) => {
      const doc = new jsPDF();
      const pageW = doc.internal.pageSize.getWidth();
      let y = 0;

      // Header
      doc.setFillColor(17, 17, 17);
      doc.rect(0, 0, pageW, 38, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18); doc.setFont('helvetica', 'bold');
      doc.text('Domio', 14, 16);
      doc.setFontSize(10); doc.setFont('helvetica', 'normal');
      doc.text('Informe de Rentabilidad', 14, 26);
      doc.setFontSize(8); doc.setTextColor(170, 170, 170);
      doc.text(new Date().toLocaleDateString('es-ES'), pageW - 14, 26, { align: 'right' });
      y = 48;

      // Nombre propiedad
      doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(17);
      doc.text(property.name, 14, y); y += 8;
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(120);
      const statusLabel = property.status === 'alquilado' ? 'Alquilado' : property.status === 'por_habitaciones' ? 'Por habitaciones' : property.status === 'vacacional' ? 'Vacacional' : property.status === 'otros' ? (property.customType || 'Otros') : 'Vacío';
      doc.text(statusLabel, 14, y); y += 12;

      const row = (label, value, color) => {
        doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
        doc.text(label, 18, y);
        doc.setFont('helvetica', 'bold');
        if (color) doc.setTextColor(...color); else doc.setTextColor(17);
        doc.text(value, pageW - 14, y, { align: 'right' });
        doc.setDrawColor(240); doc.line(14, y + 2, pageW - 14, y + 2);
        y += 9;
      };
      const section = (title) => {
        y += 4;
        doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(17);
        doc.text(title, 14, y); y += 3;
        doc.setDrawColor(180); doc.setLineWidth(0.5); doc.line(14, y, pageW - 14, y); doc.setLineWidth(0.2);
        y += 8;
      };

      // Cashflow
      section('Cashflow mensual');
      row('Cashflow bruto (alquiler − hipoteca)',
        `${cashflowBruto >= 0 ? '+' : ''}${cashflowBruto.toFixed(2)} €`,
        cashflowBruto >= 0 ? [46, 125, 50] : [198, 40, 40]);
      if (hasHistoricalData) {
        row(`Cashflow neto (promedio ${monthsWithData.length} meses reales)`,
          `${cashflowNeto >= 0 ? '+' : ''}${cashflowNeto.toFixed(2)} €`,
          cashflowNeto >= 0 ? [46, 125, 50] : [198, 40, 40]);
      }

      // Rentabilidad
      section('Indicadores de rentabilidad');
      if (initialInvestment > 0) row('Inversión inicial', `${initialInvestment.toFixed(2)} €`);
      if (roiAnual !== null) {
        row(`ROI anual (${hasHistoricalData ? 'neto' : 'bruto'})`,
          `${roiAnual.toFixed(2)}%`,
          roiAnual < 3 ? [198, 40, 40] : roiAnual < 6 ? [230, 120, 0] : [46, 125, 50]);
      }
      if (payback !== null) row(`Payback (${hasHistoricalData ? 'neto' : 'bruto'})`, `${payback.toFixed(1)} años`);
      if (monthsElapsed > 0) {
        row(`Equity acumulado (${monthsElapsed} meses)`,
          `${equityAcumulado >= 0 ? '+' : ''}${equityAcumulado.toFixed(2)} €`,
          equityAcumulado >= 0 ? [46, 125, 50] : [198, 40, 40]);
      }

      // Hipoteca
      if (mortgageCalc) {
        section(`Hipoteca — fórmula francesa (${investmentData.rateType === 'variable' ? 'tipo variable' : 'tipo fijo'})`);
        row('Capital inicial', `${(parseFloat(investmentData.loanCapital) || 0).toFixed(2)} €`);
        row('Tipo de interés', `${investmentData.interestRate}%`);
        row('Plazo', `${investmentData.loanYears} años`);
        row('Cuota mensual', `${mortgageCalc.monthlyPayment.toFixed(2)} €`);
        row('Capital pendiente actual', `${mortgageCalc.remainingCapital.toFixed(2)} €`);
        row('Amortización mensual actual', `${mortgageCalc.monthlyAmortization.toFixed(2)} €`);
        row('Intereses mensuales actuales', `${mortgageCalc.monthlyInterest.toFixed(2)} €`);
      } else if (mortgageIsAutoDetected) {
        section('Hipoteca');
        row('Cuota (detectada en gastos)', `${detectedMortgageAmount.toFixed(2)} €`);
      }

      // Nota legal
      doc.setFontSize(6.5); doc.setTextColor(170); doc.setFont('helvetica', 'italic');
      doc.text('Documento informativo generado por Domio. No constituye asesoramiento financiero.', 14, 291);

      doc.save(`rentabilidad_${(property.name || 'propiedad').replace(/\s+/g, '_')}.pdf`);
    });
  };

  // Ingresos configurados (alquiler base, no pagos confirmados — igual que el gauge)
  const getConfiguredIncome = (p) => {
    const ownership = (p.ownershipPercentage || 100) / 100;
    if (p.status === 'por_habitaciones') {
      return (p.rooms || []).reduce((sum, r) => sum + (Number(r.price) || 0), 0) * ownership;
    }
    if (p.status === 'alquilado' || p.status === 'otros') {
      const tenantsTotal = (p.tenants || []).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      return (tenantsTotal || Number(p.price) || 0) * ownership;
    }
    return 0;
  };

  // Gastos normalizados mensualmente (equivalente mensual de todos los gastos activos — igual que el gauge)
  const getNormalizedExpenses = (p) => {
    const ownershipPct = p.ownershipPercentage || 100;
    const propExpenses = (supabaseExpenses || []).filter(
      e => String(e.property_id) === String(p.id) && e.active !== false
    );
    return propExpenses.reduce((sum, e) => {
      const pct = e.expense_percentage != null ? e.expense_percentage : ownershipPct;
      return sum + getMonthlyEquivalentGP(e) * pct / 100;
    }, 0);
  };

  // Detección automática de hipoteca en los gastos
  const mortgageExpense = property
    ? (supabaseExpenses || []).find(
        e => String(e.property_id) === String(property.id) &&
             e.active !== false &&
             e.category === 'hipoteca'
      )
    : null;
  const mortgageIsAutoDetected = !!mortgageExpense;
  const detectedMortgageAmount = mortgageExpense ? getMonthlyEquivalentGP(mortgageExpense) : 0;

  // Calculadora de hipoteca (fórmula francesa) — sólo si no hay hipoteca auto-detectada
  const computeMortgage = () => {
    const K = parseFloat(investmentData.loanCapital) || 0;
    const annualRate = parseFloat(investmentData.interestRate) || 0;
    const years = parseFloat(investmentData.loanYears) || 0;
    const startStr = investmentData.loanStartDate;
    if (!K || !years || !startStr) return null;
    const r = (annualRate / 100) / 12;
    const n = Math.round(years * 12);
    const P = r === 0 ? K / n : K * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
    const loanStart = new Date(startStr);
    const t = Math.max(0,
      (currentYear - loanStart.getFullYear()) * 12 + (currentMonth - loanStart.getMonth())
    );
    const K_t = r === 0
      ? Math.max(0, K - P * t)
      : Math.max(0, K * Math.pow(1 + r, t) - P * (Math.pow(1 + r, t) - 1) / r);
    const monthlyInterest = K_t * r;
    const monthlyAmort = Math.max(0, P - monthlyInterest);
    return { monthlyPayment: P, remainingCapital: K_t, monthlyAmortization: monthlyAmort, monthlyInterest, t };
  };
  const mortgageCalc = (!mortgageIsAutoDetected && property) ? computeMortgage() : null;

  const effectiveMortgage = mortgageIsAutoDetected
    ? detectedMortgageAmount
    : (mortgageCalc ? mortgageCalc.monthlyPayment : (parseFloat(investmentData.monthlyMortgage) || 0));

  // Ingresos y gastos base
  const monthlyIncome = property ? getConfiguredIncome(property) : 0;
  const monthlyExpenses = property ? getNormalizedExpenses(property) : 0;
  const monthlyAmortization = mortgageCalc
    ? mortgageCalc.monthlyAmortization
    : (parseFloat(investmentData.monthlyAmortization) || 0);
  const initialInvestment = parseFloat(investmentData.initialInvestment) || 0;

  // Cashflow bruto: alquiler configurado − hipoteca
  const cashflowBruto = monthlyIncome - effectiveMortgage;

  // Cashflow neto: promedio de (pagos confirmados − gastos) de los últimos 6 meses
  const last6Months = [];
  let fy = currentYear, fm = currentMonth;
  for (let i = 0; i < 6; i++) {
    last6Months.push({ year: fy, month: fm });
    if (fm === 0) { fm = 11; fy--; } else { fm--; }
  }
  const ownership = (property?.ownershipPercentage || 100) / 100;
  const monthsWithData = last6Months.filter(({ year, month }) =>
    historyPayments.some(p => p.year === year && p.month === month)
  );
  const avgConfirmedIncome = monthsWithData.length > 0
    ? monthsWithData.reduce((total, { year, month }) => {
        return total + historyPayments
          .filter(p => p.year === year && p.month === month)
          .reduce((s, p) => s + (Number(p.amount) || 0), 0);
      }, 0) / monthsWithData.length * ownership
    : null;

  // Si hipoteca auto-detectada ya está en monthlyExpenses, no restar dos veces
  const cashflowNeto = avgConfirmedIncome !== null
    ? avgConfirmedIncome - monthlyExpenses - (mortgageIsAutoDetected ? 0 : effectiveMortgage)
    : null;

  const hasHistoricalData = cashflowNeto !== null;
  const effectiveCashflow = hasHistoricalData ? cashflowNeto : cashflowBruto;

  // ROI y Payback sobre el cashflow más preciso disponible
  const beneficioAnual = effectiveCashflow * 12;
  const roiAnual = initialInvestment > 0 ? (beneficioAnual / initialInvestment) * 100 : null;
  const payback = initialInvestment > 0 && beneficioAnual > 0 ? initialInvestment / beneficioAnual : null;

  // Equity acumulado
  const startDateStr = property?.investmentData?.purchaseDate || property?.createdAt;
  const startDate = startDateStr ? new Date(startDateStr) : new Date();
  const monthsElapsed = Math.max(0,
    (currentYear - startDate.getFullYear()) * 12 + (currentMonth - startDate.getMonth())
  );
  const equityAcumulado = effectiveCashflow * monthsElapsed + monthlyAmortization * monthsElapsed;

  // Semáforo ROI
  const roiColor = roiAnual === null ? '#999'
    : roiAnual < 3 ? '#C62828' : roiAnual < 6 ? '#F57F17' : '#2E7D32';
  const roiBg = roiAnual === null ? '#F5F5F5'
    : roiAnual < 3 ? '#FBE9E7' : roiAnual < 6 ? '#FFF8E1' : '#F1F8E9';
  const roiLabel = roiAnual === null ? null
    : roiAnual < 3 ? 'Bajo' : roiAnual < 6 ? 'Moderado' : 'Bueno';

  const cashflowCard = (value, label, subtitle) => {
    const color = value >= 0 ? '#2E7D32' : '#C62828';
    const bg = value >= 0 ? '#F1F8E9' : '#FBE9E7';
    return (
      <div style={{ background: bg, borderRadius: '14px', padding: '16px', textAlign: 'center' }}>
        <p style={{ margin: '0 0 6px', fontSize: '11px', color: '#888', fontWeight: 500 }}>{label}</p>
        <p style={{ margin: 0, fontSize: '22px', fontWeight: 700, color }}>
          {value >= 0 ? '+' : ''}{value.toFixed(0)} €
        </p>
        {subtitle && <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#aaa' }}>{subtitle}</p>}
      </div>
    );
  };

  const inputStyle = {
    width: '100%', padding: '12px', borderRadius: '10px',
    border: '1px solid #ddd', fontSize: '15px', background: 'white',
    boxSizing: 'border-box',
  };
  const labelStyle = {
    display: 'block', fontSize: '13px', fontWeight: 500, color: '#555', marginBottom: '6px',
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h2>Rentabilidad</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '4px 0' }}>

          {/* Selector de inmueble */}
          <div>
            <label style={labelStyle}>Inmueble a analizar</label>
            <select
              value={selectedPropertyId}
              onChange={e => setSelectedPropertyId(e.target.value)}
              style={inputStyle}
            >
              {properties.map(p => (
                <option key={p.id} value={String(p.id)}>{p.name}</option>
              ))}
            </select>
          </div>

          {property && (
            <>
              {/* Sección 1: Datos de inversión */}
              <div style={{ background: '#F9F9F9', borderRadius: '16px', padding: '16px' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 600, color: '#111' }}>
                  Datos de inversión
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {[
                    { key: 'purchasePrice',     label: 'Precio de compra',                               placeholder: 'Ej: 150000' },
                    { key: 'initialInvestment', label: 'Inversión inicial (entrada + impuestos + reforma)', placeholder: 'Ej: 40000' },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <label style={labelStyle}>{label}</label>
                      <div style={{ position: 'relative' }}>
                        <input
                          type="number" min="0" placeholder={placeholder}
                          value={investmentData[key]}
                          onChange={e => { setInvestmentData(prev => ({ ...prev, [key]: e.target.value })); setSaved(false); }}
                          style={{ ...inputStyle, paddingRight: '36px' }}
                        />
                        <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#aaa', fontSize: '14px' }}>€</span>
                      </div>
                    </div>
                  ))}

                  {mortgageIsAutoDetected ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#E8F5E9', borderRadius: '10px', padding: '12px 14px' }}>
                      <span style={{ fontSize: '16px', color: '#2E7D32' }}>✓</span>
                      <p style={{ margin: 0, fontSize: '13px', color: '#2E7D32', lineHeight: 1.4 }}>
                        <strong>Hipoteca detectada en tus gastos:</strong> {detectedMortgageAmount.toFixed(0)} €/mes
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Calculadora de hipoteca */}
                      <div style={{ background: '#F0F4FF', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#3949AB' }}>Calculadora de hipoteca</p>

                        <div>
                          <label style={labelStyle}>Capital inicial del préstamo</label>
                          <div style={{ position: 'relative' }}>
                            <input type="number" min="0" placeholder="Ej: 120000"
                              value={investmentData.loanCapital}
                              onChange={e => { setInvestmentData(prev => ({ ...prev, loanCapital: e.target.value })); setSaved(false); }}
                              style={{ ...inputStyle, paddingRight: '36px' }} />
                            <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#aaa', fontSize: '14px' }}>€</span>
                          </div>
                        </div>

                        <div>
                          <label style={labelStyle}>Tipo de interés</label>
                          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                            {['fijo', 'variable'].map(type => (
                              <button key={type} type="button"
                                onClick={() => { setInvestmentData(prev => ({ ...prev, rateType: type })); setSaved(false); }}
                                style={{
                                  flex: 1, padding: '9px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
                                  border: `1.5px solid ${investmentData.rateType === type ? '#3949AB' : '#ddd'}`,
                                  background: investmentData.rateType === type ? '#3949AB' : 'white',
                                  color: investmentData.rateType === type ? 'white' : '#666',
                                  fontWeight: investmentData.rateType === type ? 600 : 400,
                                }}>
                                {type === 'fijo' ? 'Fijo' : 'Variable'}
                              </button>
                            ))}
                          </div>
                          <div style={{ position: 'relative' }}>
                            <input type="number" min="0" step="0.01"
                              placeholder={investmentData.rateType === 'variable' ? 'Ej: 3.5 (Euribor + diferencial)' : 'Ej: 2.5'}
                              value={investmentData.interestRate}
                              onChange={e => { setInvestmentData(prev => ({ ...prev, interestRate: e.target.value })); setSaved(false); }}
                              style={{ ...inputStyle, paddingRight: '36px' }} />
                            <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#aaa', fontSize: '14px' }}>%</span>
                          </div>
                          {investmentData.rateType === 'variable' && (
                            <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#F57F17', lineHeight: 1.4 }}>
                              Este cálculo es una aproximación basada en el tipo actual. Actualízalo cuando cambie tu cuota.
                            </p>
                          )}
                        </div>

                        <div>
                          <label style={labelStyle}>Años totales de la hipoteca</label>
                          <input type="number" min="1" max="40" placeholder="Ej: 25"
                            value={investmentData.loanYears}
                            onChange={e => { setInvestmentData(prev => ({ ...prev, loanYears: e.target.value })); setSaved(false); }}
                            style={inputStyle} />
                        </div>

                        <div>
                          <label style={labelStyle}>Fecha de inicio de la hipoteca</label>
                          <input type="date"
                            value={investmentData.loanStartDate}
                            onChange={e => { setInvestmentData(prev => ({ ...prev, loanStartDate: e.target.value })); setSaved(false); }}
                            style={inputStyle} />
                        </div>

                        {/* Resultados calculados */}
                        {mortgageCalc && (
                          <>
                            {investmentData.rateType === 'variable' && (
                              <div style={{ background: '#FFF3E0', borderRadius: '8px', padding: '10px 12px' }}>
                                <p style={{ margin: 0, fontSize: '12px', color: '#E65100', fontWeight: 500 }}>
                                  ⚠ Cálculo aproximado — tipo variable sujeto a revisión
                                </p>
                              </div>
                            )}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
                              {[
                                { label: 'Cuota mensual', value: `${mortgageCalc.monthlyPayment.toFixed(0)} €` },
                                { label: 'Capital pendiente', value: `${mortgageCalc.remainingCapital.toFixed(0)} €` },
                                { label: 'Amortización/mes', value: `${mortgageCalc.monthlyAmortization.toFixed(0)} €` },
                                { label: 'Intereses/mes', value: `${mortgageCalc.monthlyInterest.toFixed(0)} €` },
                              ].map(({ label, value }) => (
                                <div key={label} style={{ background: 'white', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
                                  <p style={{ margin: '0 0 3px', fontSize: '10px', color: '#888' }}>{label}</p>
                                  <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#3949AB' }}>{value}</p>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Fallback manual si no hay datos para la calculadora */}
                      {!mortgageCalc && (
                        <>
                          <div>
                            <label style={labelStyle}>O introduce la cuota manualmente</label>
                            <div style={{ position: 'relative' }}>
                              <input type="number" min="0" placeholder="Ej: 650"
                                value={investmentData.monthlyMortgage}
                                onChange={e => { setInvestmentData(prev => ({ ...prev, monthlyMortgage: e.target.value })); setSaved(false); }}
                                style={{ ...inputStyle, paddingRight: '36px' }} />
                              <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#aaa', fontSize: '14px' }}>€</span>
                            </div>
                          </div>
                          <div>
                            <label style={labelStyle}>De esa cuota, ¿cuánto es amortización?</label>
                            <div style={{ position: 'relative' }}>
                              <input type="number" min="0" placeholder="Ej: 300"
                                value={investmentData.monthlyAmortization}
                                onChange={e => { setInvestmentData(prev => ({ ...prev, monthlyAmortization: e.target.value })); setSaved(false); }}
                                style={{ ...inputStyle, paddingRight: '36px' }} />
                              <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#aaa', fontSize: '14px' }}>€</span>
                            </div>
                          </div>
                        </>
                      )}
                    </>
                  )}

                  <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                      padding: '12px', borderRadius: '10px', border: 'none',
                      background: saved ? '#4CAF50' : '#111',
                      color: 'white', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                      transition: 'background 0.2s',
                    }}
                  >
                    {saving ? 'Guardando...' : saved ? 'Guardado ✓' : 'Guardar datos'}
                  </button>
                </div>
              </div>

              {/* Sección 2: Resultados */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#111' }}>Resultados</h3>
                  <button onClick={handleExportPDF} style={{
                    padding: '7px 14px', borderRadius: '8px', border: 'none',
                    background: '#111', color: 'white', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                  }}>
                    Exportar PDF
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>

                  {/* Cashflow bruto */}
                  {cashflowCard(cashflowBruto, 'Cashflow bruto', 'Alquiler − hipoteca')}

                  {/* Cashflow neto */}
                  {hasHistoricalData
                    ? cashflowCard(cashflowNeto, 'Cashflow neto', `Promedio ${monthsWithData.length} meses reales`)
                    : (
                      <div style={{ background: '#F5F5F5', borderRadius: '14px', padding: '16px', textAlign: 'center' }}>
                        <p style={{ margin: '0 0 6px', fontSize: '11px', color: '#888', fontWeight: 500 }}>Cashflow neto</p>
                        <p style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#bbb' }}>Sin historial</p>
                        <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#ccc' }}>Confirma pagos para calcularlo</p>
                      </div>
                    )
                  }

                  {/* ROI anual */}
                  <div style={{ background: roiBg, borderRadius: '14px', padding: '16px', textAlign: 'center' }}>
                    <p style={{ margin: '0 0 6px', fontSize: '11px', color: '#888', fontWeight: 500 }}>
                      ROI anual {hasHistoricalData ? '(neto)' : '(bruto)'}
                    </p>
                    <p style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: roiColor }}>
                      {roiAnual !== null ? `${roiAnual.toFixed(1)}%` : '—'}
                    </p>
                    {roiLabel && (
                      <p style={{ margin: '4px 0 0', fontSize: '11px', fontWeight: 600, color: roiColor }}>{roiLabel}</p>
                    )}
                  </div>

                  {/* Payback */}
                  <div style={{ background: '#F0F7FF', borderRadius: '14px', padding: '16px', textAlign: 'center' }}>
                    <p style={{ margin: '0 0 6px', fontSize: '11px', color: '#888', fontWeight: 500 }}>
                      Payback {hasHistoricalData ? '(neto)' : '(bruto)'}
                    </p>
                    <p style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#1565C0' }}>
                      {payback !== null ? `${payback.toFixed(1)} años` : '—'}
                    </p>
                  </div>

                  {/* Equity acumulado */}
                  <div style={{ background: '#F3F4F6', borderRadius: '14px', padding: '16px', textAlign: 'center', gridColumn: '1 / -1' }}>
                    <p style={{ margin: '0 0 6px', fontSize: '11px', color: '#888', fontWeight: 500 }}>Equity acumulado</p>
                    <p style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: equityAcumulado >= 0 ? '#2E7D32' : '#C62828' }}>
                      {equityAcumulado >= 0 ? '+' : ''}{equityAcumulado.toFixed(0)} €
                    </p>
                    {monthsElapsed > 0 && (
                      <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#aaa' }}>
                        {monthsElapsed} meses · desde {startDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {properties.length === 0 && (
            <p style={{ textAlign: 'center', color: '#aaa', fontSize: '14px' }}>
              No tienes inmuebles registrados.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default GeneralPanel;