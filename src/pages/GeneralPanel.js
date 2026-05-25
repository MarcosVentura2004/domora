import React, { useState, useEffect } from 'react';
import './Dashboard.css';
import { supabase } from '../supabaseClient';
import { InvestmentForm } from '../components/InvestmentForm';

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
    return sum + (Number(e.amount) || 0) * pct / 100;
  }, 0);
}

// ─────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────
function GeneralPanel({ properties, userEmail, onNavigateToProperties, onOpenSettings, onOpenComparador, avatarUrl, avatarValid, onAvatarLoad, onAvatarError, hideHeader, hideAvatar, onUpdateProperty }) {
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
  const markedCount = pendingByPropertyList.reduce((sum, item) => {
    if (item.isPorHabitaciones) return sum + item.rooms.filter(r => r.markedAt).length;
    return sum + (item.markedAt ? 1 : 0);
  }, 0);

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
          return s + (Number(e.amount) || 0) * pct / 100;
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
                <button className="option-item" onClick={() => { if (onOpenComparador) onOpenComparador(); setShowOptionsMenu(false); }}>
                  Comparar inmuebles
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showReportModal && (
        <ReportModal properties={properties} supabaseExpenses={supabaseExpenses} onClose={() => setShowReportModal(false)} />
      )}
      {showRentabilityModal && (
        <RentabilityModal
          properties={properties}
          supabaseExpenses={supabaseExpenses}
          initialPropertyId={rentabilityInitialPropertyId}
          onUpdateProperty={onUpdateProperty}
          onClose={() => { setShowRentabilityModal(false); setRentabilityInitialPropertyId(null); }}
          onExpenseAdded={() => {
            const propertyIds = properties.map(p => String(p.id));
            if (propertyIds.length === 0) return;
            supabase
              .from('expenses')
              .select('*')
              .in('property_id', propertyIds)
              .then(({ data }) => { if (data) setSupabaseExpenses(data); });
          }}
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
          <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#aaa' }}>Neto real este mes</p>
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
                          {hasAlert
                            ? (() => { const n = markedCount > 0 ? markedCount : pendingCount; return `${n} pago${n !== 1 ? 's' : ''} por confirmar`; })()
                            : 'sin impagos este mes'}
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
  ibi: 'IBI', comunidad: 'Comunidad de propietarios',
  seguro: 'Seguro del hogar', seguros: 'Seguros',
  reparaciones: 'Reparaciones y conservación', suministros: 'Suministros',
  amortizacion: 'Amortización del inmueble', hipoteca: 'Hipoteca/Préstamo',
  gestion: 'Gastos de gestión', impuestos: 'Impuestos',
  publicidad: 'Publicidad', otros: 'Otros',
};

// Reglas de deducibilidad por categoría de gasto
function getDeductibilityInfo(categoryKey, isUsoPropioFiscal) {
  if (isUsoPropioFiscal) return { status: 'No', note: null };
  const rules = {
    ibi:          { status: 'Si',      note: null },
    comunidad:    { status: 'Si',      note: null },
    seguro:       { status: 'Si',      note: null },
    seguros:      { status: 'Si',      note: null },
    reparaciones: { status: 'Si',      note: null },
    gestion:      { status: 'Si',      note: null },
    suministros:  { status: 'Si',      note: null },
    publicidad:   { status: 'Si',      note: null },
    impuestos:    { status: 'Si',      note: null },
    amortizacion: { status: 'Si',      note: null },
    hipoteca:     { status: 'Parcial', note: 'Solo los intereses son deducibles, no la amortizacion del capital' },
    otros:        { status: 'Revisar', note: 'Confirmar deducibilidad con asesor fiscal' },
  };
  return rules[categoryKey] || { status: 'Revisar', note: null };
}

function ReportModal({ properties, supabaseExpenses, onClose }) {
  const currentYear = now.getFullYear();
  const reportableProperties = properties.filter(p => p.status !== 'uso_propio');
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [ownerName, setOwnerName] = useState('');
  const [ownerNif, setOwnerNif] = useState('');
  // tipo fiscal por propiedad: 'residencial' | 'turistico' | 'comercial' | 'propio'
  const [fiscalTypes, setFiscalTypes] = useState(() =>
    Object.fromEntries(reportableProperties.map(p => [p.id, p.status === 'vacacional' ? 'turistico' : 'residencial']))
  );
  const [declaredAmounts, setDeclaredAmounts] = useState({});
  const [expandedBreakdown, setExpandedBreakdown] = useState(new Set());

  const years = [];
  const minYear = reportableProperties.reduce((min, p) => {
    const y = new Date(p.createdAt || now).getFullYear();
    return y < min ? y : min;
  }, currentYear);
  for (let y = currentYear; y >= minYear; y--) years.push(y);

  const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const monthShort = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  const getYearlyData = (property) => {
    const ownership = property.ownershipPercentage || 100;
    const ownershipFraction = ownership / 100;
    const propertyExpenses = (supabaseExpenses || []).filter(e => String(e.property_id) === String(property.id));
    const lastMonth = selectedYear < currentYear ? 11 : currentMonth;
    const monthsData = [];

    for (let m = 0; m <= lastMonth; m++) {
      let cobrado = 0, pendiente = 0;

      if (property.status === 'vacacional') {
        cobrado = (property.bookings || [])
          .filter(b => { const s = new Date(b.startDate); return b.status === 'confirmed' && s.getFullYear() === selectedYear && s.getMonth() === m; })
          .reduce((sum, b) => sum + (b.amount || 0), 0) * ownershipFraction;
        pendiente = (property.bookings || [])
          .filter(b => { const s = new Date(b.startDate); return b.status === 'pending' && s.getFullYear() === selectedYear && s.getMonth() === m; })
          .reduce((sum, b) => sum + (b.amount || 0), 0) * ownershipFraction;
      } else if (property.status === 'por_habitaciones') {
        cobrado = (property.payments || [])
          .filter(p => p.year === selectedYear && p.month === m && p.status === 'confirmed' && p.roomId)
          .reduce((sum, p) => sum + (p.amount || 0), 0) * ownershipFraction;
        pendiente = (property.payments || [])
          .filter(p => p.year === selectedYear && p.month === m && p.status === 'pending' && p.roomId)
          .reduce((sum, p) => sum + (p.amount || 0), 0) * ownershipFraction;
      } else if (property.status === 'alquilado' || property.status === 'otros') {
        cobrado = (property.payments || [])
          .filter(p => p.year === selectedYear && p.month === m && p.status === 'confirmed')
          .reduce((sum, p) => sum + (p.amount || 0), 0) * ownershipFraction;
        pendiente = (property.payments || [])
          .filter(p => p.year === selectedYear && p.month === m && p.status === 'pending')
          .reduce((sum, p) => sum + (p.amount || 0), 0) * ownershipFraction;
      }

      const active = getExpensesForMonth(propertyExpenses, selectedYear, m);
      const expenses = active.reduce((sum, e) => {
        const pct = e.expense_percentage != null ? e.expense_percentage : ownership;
        return sum + getMonthlyEquivalentGP(e) * pct / 100;
      }, 0);

      monthsData.push({ month: m, cobrado, pendiente, expenses });
    }

    // Detalle de gastos: calcular impacto anual real por gasto iterando los 12 meses
    const expenseDetail = propertyExpenses
      .filter(e => e.active !== false)
      .map(e => {
        let annualTotal = 0;
        for (let m = 0; m <= lastMonth; m++) {
          const active = getExpensesForMonth([e], selectedYear, m);
          if (active.length > 0) {
            const pct = e.expense_percentage != null ? e.expense_percentage : ownership;
            annualTotal += getMonthlyEquivalentGP(e) * pct / 100;
          }
        }
        if (annualTotal === 0) return null;
        const startDate = new Date((e.start_date || e.createdAt) + (e.start_date ? 'T12:00:00' : ''));
        return {
          date: startDate.toLocaleDateString('es-ES'),
          categoryKey: e.category || 'otros',
          category: CATEGORY_LABELS[e.category] || e.category || 'Otros',
          name: e.description || '',
          frequency: e.frequency,
          amount: annualTotal,
          monthly: getMonthlyEquivalentGP(e),
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

  useEffect(() => {
    const defaults = {};
    reportableProperties.forEach(p => {
      const d = getYearlyData(p);
      defaults[String(p.id)] = { total: d.totalCobrado, byMonth: null };
    });
    setDeclaredAmounts(defaults);
    setExpandedBreakdown(new Set());
  }, [selectedYear]); // eslint-disable-line

  // ── Exportar Excel ──
  const generateExcel = async () => {
    const ExcelJSMod = await import('exceljs');
    const ExcelJS = ExcelJSMod.default || ExcelJSMod;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Domio';
    const euro = '#,##0.00 "€"';
    const mkFill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
    const mkFont = (bold, argb, size = 10) => ({ bold, color: { argb }, size });
    const sc = (cell, fill, font, align, border, numFmt) => {
      if (fill)   cell.fill      = fill;
      if (font)   cell.font      = font;
      if (align)  cell.alignment = align;
      if (border) cell.border    = border;
      if (numFmt) cell.numFmt    = numFmt;
    };
    const styleRow = (row, nCols, fill, font, align, border) => {
      for (let c = 1; c <= nCols; c++) sc(row.getCell(c), fill, font, align, border);
    };
    const addTitleRow = (ws, text, nCols, h = 30) => {
      const r = ws.addRow([text]); r.height = h;
      ws.mergeCells(ws.rowCount, 1, ws.rowCount, nCols);
      sc(r.getCell(1), mkFill('FF111111'), mkFont(true, 'FFFFFFFF', 13), { horizontal: 'left', vertical: 'middle' });
      return r;
    };
    const addSubtitleRow = (ws, text, nCols) => {
      const r = ws.addRow([text]); r.height = 17;
      ws.mergeCells(ws.rowCount, 1, ws.rowCount, nCols);
      sc(r.getCell(1), mkFill('FF111111'), { size: 8, italic: true, color: { argb: 'FFAAAAAA' } }, { horizontal: 'left', vertical: 'middle' });
      return r;
    };
    const addColHeaders = (ws, headers) => {
      const r = ws.addRow(headers); r.height = 20;
      r.eachCell({ includeEmpty: true }, (cell, col) => {
        sc(cell, mkFill('FFF0F0F0'), mkFont(true, 'FF555555', 9),
          { horizontal: col === 1 ? 'left' : 'center', vertical: 'middle' },
          { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } });
      });
      return r;
    };

    // ── HOJA 1: RESUMEN ──
    const ws1 = wb.addWorksheet('Resumen', { views: [{ showGridLines: false }] });
    const NC1 = 6;
    addTitleRow(ws1, `REPORTE FISCAL ${selectedYear}`, NC1);
    const subParts = [`Domio — ${new Date().toLocaleDateString('es-ES')}`];
    if (ownerName) subParts.push(ownerName);
    if (ownerNif)  subParts.push(`NIF: ${ownerNif}`);
    addSubtitleRow(ws1, subParts.join('   ·   '), NC1);
    ws1.addRow([]).height = 6;
    addColHeaders(ws1, ['Inmueble', 'Tipo fiscal', 'Ingresos cobrados', 'Importe a declarar', 'Gastos deducibles', 'Rendimiento neto']);

    let sumCobrado = 0, sumDeclared = 0, sumExpenses = 0;
    reportableProperties.forEach((property, idx) => {
      const data = getYearlyData(property);
      const declared = declaredAmounts[String(property.id)]?.total ?? data.totalCobrado;
      const fiscalLabel = ({ turistico: 'Turístico', comercial: 'Comercial', propio: 'Uso propio' }[fiscalTypes[property.id]] || 'Residencial');
      const net = declared - data.totalExpenses;
      const bg = mkFill(idx % 2 === 0 ? 'FFFFFFFF' : 'FFF9F9F9');
      const bdr = { bottom: { style: 'thin', color: { argb: 'FFF0F0F0' } } };
      const r = ws1.addRow([property.name, fiscalLabel, data.totalCobrado, declared, data.totalExpenses, net]);
      r.height = 22;
      styleRow(r, NC1, bg, null, { vertical: 'middle', horizontal: 'center' }, bdr);
      sc(r.getCell(1), null, mkFont(true, 'FF111111'), { horizontal: 'left', vertical: 'middle' });
      sc(r.getCell(2), null, mkFont(false, 'FF888888', 9));
      sc(r.getCell(3), null, mkFont(false, 'FF2E7D32'), null, null, euro);
      const hasDiff = Math.abs(declared - data.totalCobrado) > 0.01;
      sc(r.getCell(4), null, mkFont(hasDiff, hasDiff ? 'FF1565C0' : 'FF2E7D32'), null, null, euro);
      sc(r.getCell(5), null, mkFont(false, 'FFC62828'), null, null, euro);
      sc(r.getCell(6), null, mkFont(true, net >= 0 ? 'FF2E7D32' : 'FFC62828'), null, null, euro);
      sumCobrado += data.totalCobrado; sumDeclared += declared; sumExpenses += data.totalExpenses;
    });
    ws1.addRow([]).height = 6;
    const totalNet1 = sumDeclared - sumExpenses;
    const tRow1 = ws1.addRow(['TOTAL', '', sumCobrado, sumDeclared, sumExpenses, totalNet1]);
    tRow1.height = 24;
    styleRow(tRow1, NC1, mkFill('FFE8E8E8'), mkFont(true, 'FF333333'), { vertical: 'middle', horizontal: 'center' }, { top: { style: 'medium', color: { argb: 'FFAAAAAA' } } });
    sc(tRow1.getCell(1), null, null, { horizontal: 'left', vertical: 'middle' });
    sc(tRow1.getCell(3), null, mkFont(true, 'FF2E7D32'), null, null, euro);
    sc(tRow1.getCell(4), null, mkFont(true, 'FF1565C0'), null, null, euro);
    sc(tRow1.getCell(5), null, mkFont(true, 'FFC62828'), null, null, euro);
    sc(tRow1.getCell(6), null, mkFont(true, totalNet1 >= 0 ? 'FF2E7D32' : 'FFC62828'), null, null, euro);
    [28, 14, 20, 20, 20, 20].forEach((w, i) => { ws1.getColumn(i + 1).width = w; });

    // ── HOJA 2: DETALLE ──
    const ws2 = wb.addWorksheet('Detalle', { views: [{ showGridLines: false }] });
    const NC2 = 6;
    addTitleRow(ws2, `DETALLE DE TRANSACCIONES — ${selectedYear}`, NC2);
    ws2.addRow([]).height = 6;
    let r2 = 3;

    reportableProperties.forEach(property => {
      const data = getYearlyData(property);
      const exEntry = declaredAmounts[String(property.id)];
      const declared = exEntry?.total ?? data.totalCobrado;
      const exByMonth = exEntry?.byMonth ?? null;
      const secRow = ws2.addRow([property.name]); secRow.height = 24;
      ws2.mergeCells(r2, 1, r2, NC2);
      sc(secRow.getCell(1), mkFill('FF2C2C2C'), mkFont(true, 'FFFFFFFF', 11), { horizontal: 'left', vertical: 'middle' });
      r2++;
      const ch = ws2.addRow(['Fecha', 'Tipo', 'Categoría', 'Concepto', 'Importe', 'Estado']); ch.height = 17;
      ch.eachCell({ includeEmpty: true }, (cell, col) => {
        sc(cell, mkFill('FFE8E8E8'), mkFont(true, 'FF666666', 8),
          { horizontal: col === 1 || col === 4 ? 'left' : (col === 5 ? 'right' : 'center'), vertical: 'middle' },
          { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } });
      });
      r2++;
      const addR2 = (vals, bgArgb, amtArgb) => {
        const row = ws2.addRow(vals); row.height = 18;
        for (let c = 1; c <= NC2; c++) {
          sc(row.getCell(c), mkFill(bgArgb), null,
            { horizontal: c === 1 || c === 4 ? 'left' : (c === 5 ? 'right' : 'center'), vertical: 'middle' },
            { bottom: { style: 'thin', color: { argb: 'FFF5F5F5' } } });
        }
        sc(row.getCell(5), null, mkFont(false, amtArgb), null, null, euro);
        r2++;
      };
      data.monthsData.forEach(({ month, cobrado, pendiente }) => {
        if (cobrado > 0)   addR2([`${monthNames[month]} ${selectedYear}`, 'Ingreso',  'Alquiler', 'Ingreso cobrado',    cobrado,   'Cobrado'],  'FFF1F8E9', 'FF2E7D32');
        if (pendiente > 0) addR2([`${monthNames[month]} ${selectedYear}`, 'Ingreso',  'Alquiler', 'Ingreso pendiente',  pendiente, 'Pendiente'],'FFFFF9E6', 'FFF57F17');
        if (exByMonth && exByMonth[month] != null && Math.abs(exByMonth[month] - cobrado) > 0.01) {
          addR2([`${monthNames[month]} ${selectedYear}`, 'Declarar', 'Declaración', 'A declarar (mes ajustado)', exByMonth[month], 'Declarado'], 'FFE8F4FD', 'FF1565C0');
        }
      });
      if (!exByMonth && Math.abs(declared - data.totalCobrado) > 0.01) {
        addR2([`${selectedYear}`, 'Ajuste', 'Declaracion', 'Importe a declarar (ajustado por propietario)', declared, 'Declarado'], 'FFE8F4FD', 'FF1565C0');
      }
      data.expenseDetail.forEach(e => {
        addR2([e.date, 'Gasto', e.category, e.name || '—', -e.amount, 'Pagado'], 'FFFBE9E7', 'FFC62828');
      });
      const net2 = declared - data.totalExpenses;
      const stRow = ws2.addRow(['', 'SUBTOTAL', '', property.name, net2, '']); stRow.height = 22;
      styleRow(stRow, NC2, mkFill('FFF0F0F0'), mkFont(true, 'FF444444'), { vertical: 'middle' }, { top: { style: 'thin', color: { argb: 'FFBBBBBB' } } });
      sc(stRow.getCell(5), null, mkFont(true, net2 >= 0 ? 'FF2E7D32' : 'FFC62828'), { horizontal: 'right', vertical: 'middle' }, null, euro);
      r2++;
      ws2.addRow([]).height = 8; r2++;
    });
    [20, 10, 28, 34, 16, 12].forEach((w, i) => { ws2.getColumn(i + 1).width = w; });

    // ── HOJA 3: IRPF ──
    const ws3 = wb.addWorksheet('IRPF', { views: [{ showGridLines: false }] });
    const NC3 = 7;
    addTitleRow(ws3, `DATOS PARA EL IRPF — ${selectedYear}`, NC3);
    ws3.addRow([]).height = 6;
    addColHeaders(ws3, ['Inmueble', 'Tipo fiscal', 'Ingresos a declarar', 'Gastos deducibles', 'Rend. neto previo', 'Reducción 60%', 'Rend. neto reducido']);

    let irpfSumDec = 0, irpfSumExp = 0;
    reportableProperties.forEach((property, idx) => {
      const data = getYearlyData(property);
      const declared = declaredAmounts[String(property.id)]?.total ?? data.totalCobrado;
      const fiscalLabel = ({ turistico: 'Turístico', comercial: 'Comercial', propio: 'Uso propio' }[fiscalTypes[property.id]] || 'Residencial');
      const reduction = fiscalTypes[property.id] === 'residencial' ? 0.6 : 0;
      const netPrevio = declared - data.totalExpenses;
      const reductionAmt = reduction > 0 && netPrevio > 0 ? netPrevio * reduction : 0;
      const netReducido = netPrevio - reductionAmt;
      const bg = mkFill(idx % 2 === 0 ? 'FFFFFFFF' : 'FFF9F9F9');
      const bdr = { bottom: { style: 'thin', color: { argb: 'FFF0F0F0' } } };
      const r = ws3.addRow([property.name, fiscalLabel, declared, data.totalExpenses, netPrevio, reductionAmt > 0 ? -reductionAmt : '—', netReducido]);
      r.height = 22;
      styleRow(r, NC3, bg, null, { vertical: 'middle', horizontal: 'center' }, bdr);
      sc(r.getCell(1), null, mkFont(true, 'FF111111'), { horizontal: 'left', vertical: 'middle' });
      sc(r.getCell(2), null, mkFont(false, 'FF888888', 9));
      sc(r.getCell(3), null, mkFont(false, 'FF2E7D32'), null, null, euro);
      sc(r.getCell(4), null, mkFont(false, 'FFC62828'), null, null, euro);
      sc(r.getCell(5), null, mkFont(true, netPrevio >= 0 ? 'FF2E7D32' : 'FFC62828'), null, null, euro);
      if (reductionAmt > 0) sc(r.getCell(6), null, mkFont(false, 'FFF57F17'), null, null, euro);
      else r.getCell(6).font = { color: { argb: 'FFBBBBBB' } };
      sc(r.getCell(7), null, mkFont(true, netReducido >= 0 ? 'FF2E7D32' : 'FFC62828'), null, null, euro);
      irpfSumDec += declared; irpfSumExp += data.totalExpenses;
    });
    ws3.addRow([]).height = 6;
    const irpfNet = irpfSumDec - irpfSumExp;
    const tRow3 = ws3.addRow(['TOTAL', '', irpfSumDec, irpfSumExp, irpfNet, '', '']);
    tRow3.height = 24;
    styleRow(tRow3, NC3, mkFill('FFE8E8E8'), mkFont(true, 'FF333333'), { vertical: 'middle', horizontal: 'center' }, { top: { style: 'medium', color: { argb: 'FFAAAAAA' } } });
    sc(tRow3.getCell(1), null, null, { horizontal: 'left', vertical: 'middle' });
    sc(tRow3.getCell(3), null, mkFont(true, 'FF2E7D32'), null, null, euro);
    sc(tRow3.getCell(4), null, mkFont(true, 'FFC62828'), null, null, euro);
    sc(tRow3.getCell(5), null, mkFont(true, irpfNet >= 0 ? 'FF2E7D32' : 'FFC62828'), null, null, euro);
    ws3.addRow([]).height = 12;
    const noteR = ws3.addRow(['Nota: los importes declarados han sido revisados y confirmados por el propietario.']);
    ws3.mergeCells(ws3.rowCount, 1, ws3.rowCount, NC3);
    noteR.getCell(1).font = { italic: true, color: { argb: 'FF888888' }, size: 8 };
    const legalR = ws3.addRow(['Documento informativo generado por Domio. No constituye asesoramiento fiscal.']);
    ws3.mergeCells(ws3.rowCount, 1, ws3.rowCount, NC3);
    legalR.getCell(1).font = { italic: true, color: { argb: 'FFBBBBBB' }, size: 7 };
    [28, 14, 20, 20, 18, 16, 22].forEach((w, i) => { ws3.getColumn(i + 1).width = w; });

    // ── HOJA 4: IVA Y RETENCIONES ──
    const vatProperties = reportableProperties.filter(p => p.has_vat === true);
    if (vatProperties.length > 0) {
      const ws4 = wb.addWorksheet('IVA y Retenciones', { views: [{ showGridLines: false }] });
      const NC4 = 6;
      addTitleRow(ws4, `IVA Y RETENCIONES — ${selectedYear}`, NC4);
      ws4.addRow([]).height = 6;
      addColHeaders(ws4, ['Inmueble', 'Base imponible', 'IVA (21%)', 'Retención IRPF (19%)', 'Total facturado', 'Total recibido']);

      let vatSumBase = 0, vatSumIva = 0, vatSumRetencion = 0, vatSumFacturado = 0, vatSumRecibido = 0;

      vatProperties.forEach((property, idx) => {
        const data = getYearlyData(property);
        const baseImponible = data.totalCobrado || 0;
        const ivaRepercutido = baseImponible * 0.21;
        const totalFacturado = baseImponible + ivaRepercutido;
        const retencionIRPF = property.has_irpf_retention ? baseImponible * 0.19 : 0;
        const totalRecibido = totalFacturado - retencionIRPF;

        const bg = mkFill(idx % 2 === 0 ? 'FFFFFFFF' : 'FFF9F9F9');
        const bdr = { bottom: { style: 'thin', color: { argb: 'FFF0F0F0' } } };
        const r = ws4.addRow([
          property.name,
          baseImponible,
          ivaRepercutido,
          property.has_irpf_retention ? retencionIRPF : '—',
          totalFacturado,
          totalRecibido,
        ]);
        r.height = 22;
        styleRow(r, NC4, bg, null, { vertical: 'middle', horizontal: 'center' }, bdr);
        sc(r.getCell(1), null, mkFont(true, 'FF111111'), { horizontal: 'left', vertical: 'middle' });
        sc(r.getCell(2), null, mkFont(false, 'FF2E7D32'), null, null, euro);
        sc(r.getCell(3), null, mkFont(false, 'FF1565C0'), null, null, euro);
        if (property.has_irpf_retention) {
          sc(r.getCell(4), null, mkFont(false, 'FFF57F17'), null, null, euro);
        } else {
          r.getCell(4).font = { color: { argb: 'FFBBBBBB' } };
          r.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
        }
        sc(r.getCell(5), null, mkFont(true, 'FF111111'), null, null, euro);
        sc(r.getCell(6), null, mkFont(true, totalRecibido >= 0 ? 'FF2E7D32' : 'FFC62828'), null, null, euro);

        vatSumBase += baseImponible;
        vatSumIva += ivaRepercutido;
        vatSumRetencion += retencionIRPF;
        vatSumFacturado += totalFacturado;
        vatSumRecibido += totalRecibido;
      });

      ws4.addRow([]).height = 6;
      const tRow4 = ws4.addRow(['TOTAL', vatSumBase, vatSumIva, vatSumRetencion > 0 ? vatSumRetencion : '—', vatSumFacturado, vatSumRecibido]);
      tRow4.height = 24;
      styleRow(tRow4, NC4, mkFill('FFE8E8E8'), mkFont(true, 'FF333333'), { vertical: 'middle', horizontal: 'center' }, { top: { style: 'medium', color: { argb: 'FFAAAAAA' } } });
      sc(tRow4.getCell(1), null, null, { horizontal: 'left', vertical: 'middle' });
      sc(tRow4.getCell(2), null, mkFont(true, 'FF2E7D32'), null, null, euro);
      sc(tRow4.getCell(3), null, mkFont(true, 'FF1565C0'), null, null, euro);
      if (vatSumRetencion > 0) {
        sc(tRow4.getCell(4), null, mkFont(true, 'FFF57F17'), null, null, euro);
      } else {
        tRow4.getCell(4).font = { color: { argb: 'FFBBBBBB' }, bold: true };
        tRow4.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
      }
      sc(tRow4.getCell(5), null, mkFont(true, 'FF111111'), null, null, euro);
      sc(tRow4.getCell(6), null, mkFont(true, vatSumRecibido >= 0 ? 'FF2E7D32' : 'FFC62828'), null, null, euro);

      ws4.addRow([]).height = 8;
      const noteVat = ws4.addRow(['El IVA repercutido debe declararse trimestralmente (modelo 303). La retención IRPF es ingresada por el inquilino (modelo 115).']);
      ws4.mergeCells(ws4.rowCount, 1, ws4.rowCount, NC4);
      noteVat.getCell(1).font = { italic: true, color: { argb: 'FF888888' }, size: 8 };

      [28, 20, 16, 22, 18, 18].forEach((w, i) => { ws4.getColumn(i + 1).width = w; });
    }

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `reporte_fiscal_${selectedYear}.xlsx`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);

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
      const globalDeclared = allData.reduce((s, { p: prop, d }) => s + (declaredAmounts[String(prop.id)]?.total ?? d.totalCobrado), 0);
      const globalDeclaredNet = globalDeclared - globalExpenses;

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
        const fiscalType = fiscalTypes[property.id] === 'turistico' ? 'Alquiler turístico' : fiscalTypes[property.id] === 'comercial' ? 'Uso comercial' : fiscalTypes[property.id] === 'propio' ? 'Uso propio' : 'Residencial';
        const typeLabel = property.status === 'alquilado' ? 'Alquilado' : property.status === 'por_habitaciones' ? 'Por habitaciones' : property.status === 'vacacional' ? 'Vacacional' : property.status === 'otros' ? (property.customType || 'Otros') : 'Vacío';
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(80);
        doc.text(`${typeLabel} · ${property.ownershipPercentage || 100}% · ${fiscalType}`, pageW - 18, y + 8, { align: 'right' });
        y += 18;

        // Tabla mensual con estado cobro
        checkSpace(12);
        const propEntry = declaredAmounts[String(property.id)];
        const propByMonth = propEntry?.byMonth ?? null;
        doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(130);
        const c = [18, 44, 72, 102, 130, 157];
        // MES, COBRADO, A DECLARAR, PENDIENTE, GASTOS, NETO
        doc.text('MES', c[0], y); doc.text('COBRADO', c[1], y); doc.text('A DECLARAR', c[2], y);
        doc.text('PENDIENTE', c[3], y); doc.text('GASTOS', c[4], y); doc.text('NETO', c[5], y);
        doc.setDrawColor(210); doc.line(14, y + 2, pageW - 14, y + 2); y += 7;

        data.monthsData.forEach(({ month, cobrado, pendiente, expenses }) => {
          if (cobrado === 0 && pendiente === 0 && expenses === 0) return;
          checkSpace(7);
          const mDeclared = propByMonth ? (propByMonth[month] ?? null) : null;
          doc.setFont('helvetica', 'normal'); doc.setTextColor(50); doc.setFontSize(8);
          doc.text(monthShort[month], c[0], y);
          doc.setTextColor(46, 125, 50); doc.text(cobrado > 0 ? `+${cobrado.toFixed(2)} €` : '—', c[1], y);
          if (mDeclared !== null) {
            doc.setTextColor(21, 101, 192); doc.text(`${mDeclared.toFixed(2)} €`, c[2], y);
          } else {
            doc.setTextColor(200); doc.text('—', c[2], y);
          }
          doc.setTextColor(pendiente > 0 ? 200 : 180); doc.text(pendiente > 0 ? `${pendiente.toFixed(2)} €` : '—', c[3], y);
          doc.setTextColor(198, 40, 40); doc.text(expenses > 0 ? `-${expenses.toFixed(2)} €` : '—', c[4], y);
          const net = cobrado - expenses;
          net >= 0 ? doc.setTextColor(46, 125, 50) : doc.setTextColor(198, 40, 40);
          doc.text(`${net >= 0 ? '+' : ''}${net.toFixed(2)} €`, c[5], y);
          doc.setDrawColor(242); doc.line(14, y + 2, pageW - 14, y + 2); y += 7;
        });

        // Total inmueble
        checkSpace(10);
        const totalDeclaredForTable = propEntry?.total ?? data.totalCobrado;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(17);
        doc.text('TOTAL', c[0], y);
        doc.setTextColor(46, 125, 50); doc.text(`+${data.totalCobrado.toFixed(2)} €`, c[1], y);
        if (propByMonth !== null) {
          doc.setTextColor(21, 101, 192); doc.text(`${totalDeclaredForTable.toFixed(2)} €`, c[2], y);
        } else {
          doc.setTextColor(180); doc.text('—', c[2], y);
        }
        if (data.totalPendiente > 0) { doc.setTextColor(200, 100, 0); doc.text(`${data.totalPendiente.toFixed(2)} €`, c[3], y); }
        doc.setTextColor(198, 40, 40); doc.text(`-${data.totalExpenses.toFixed(2)} €`, c[4], y);
        data.net >= 0 ? doc.setTextColor(46, 125, 50) : doc.setTextColor(198, 40, 40);
        doc.text(`${data.net >= 0 ? '+' : ''}${data.net.toFixed(2)} €`, c[5], y);
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
        const fiscalType = fiscalTypes[property.id] === 'turistico' ? 'Alquiler turístico' : fiscalTypes[property.id] === 'comercial' ? 'Uso comercial' : fiscalTypes[property.id] === 'propio' ? 'Uso propio' : 'Residencial';
        const isUsoPropioFiscal = fiscalTypes[property.id] === 'propio';
        const reduction = fiscalTypes[property.id] === 'residencial' ? 0.6 : 0;
        const declaredForProp = declaredAmounts[String(property.id)]?.total ?? data.totalCobrado;
        const netPrevio = declaredForProp - data.totalExpenses;

        const rows2 = [
          { label: 'Ingresos a declarar', value: `${declaredForProp.toFixed(2)} €`, color: [46, 125, 50] },
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

          if (!row.bold) {
            doc.setDrawColor(238); doc.line(22, ry + 2, pageW - 18, ry + 2);
          }
          ry += 9;
        });

        y += boxH + 10;

        // ── Tabla de gastos con deducibilidad ──
        if (data.expenseDetail.length > 0) {
          // Cabecera tabla
          const tableHeaderH = 14;
          const rowH = 7;
          const tableRows = data.expenseDetail.map(e => ({
            label: e.category + (e.name ? ` — ${e.name}` : ''),
            amount: e.amount,
            deduct: getDeductibilityInfo(e.categoryKey, isUsoPropioFiscal),
          }));

          const totalDeducible = tableRows.reduce((sum, r) => {
            if (r.deduct.status === 'Si' || r.deduct.status === 'Parcial') return sum + r.amount;
            return sum;
          }, 0);

          const tableH = tableHeaderH + tableRows.length * rowH + 10;
          checkSpace(tableH + 6);

          // Fondo cabecera tabla
          doc.setFillColor(235, 235, 235);
          doc.rect(14, y, pageW - 28, tableHeaderH, 'F');

          const colGasto   = 18;
          const colImporte = pageW - 56;
          const colDeduct  = pageW - 16;

          doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(90);
          doc.text('GASTO', colGasto, y + 9);
          doc.text('IMPORTE', colImporte, y + 9, { align: 'right' });
          doc.text('DEDUCIBLE', colDeduct, y + 9, { align: 'right' });
          y += tableHeaderH;

          tableRows.forEach(r => {
            checkSpace(rowH + 2);
            doc.setFont('helvetica', 'normal'); doc.setTextColor(60); doc.setFontSize(7.5);
            const labelTrunc = r.label.length > 52 ? r.label.substring(0, 52) + '…' : r.label;
            doc.text(labelTrunc, colGasto, y + 5);
            doc.setTextColor(198, 40, 40);
            doc.text(`-${r.amount.toFixed(2)} €`, colImporte, y + 5, { align: 'right' });

            // Texto DEDUCIBLE con color, sin fondo
            const s = r.deduct.status;
            const textColor =
              s === 'Si'      ? [30, 100, 40]   :
              s === 'No'      ? [160, 30, 30]    :
              s === 'Parcial' ? [150, 80, 0]     :
                                [80, 80, 80];

            doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
            doc.setTextColor(...textColor);
            doc.text(s, colDeduct, y + 5, { align: 'right' });

            doc.setDrawColor(245); doc.line(14, y + rowH, pageW - 14, y + rowH);
            y += rowH;
          });

          // Total deducible real
          checkSpace(10);
          doc.setFillColor(245, 250, 245);
          doc.rect(14, y, pageW - 28, 10, 'F');
          doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(17);
          doc.text('Total deducible real', colGasto, y + 7);
          doc.setTextColor(46, 125, 50);
          doc.text(`-${totalDeducible.toFixed(2)} €`, colImporte, y + 7, { align: 'right' });
          y += 14;
        }

        y += 4;
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
      doc.text('INGRESOS A DECLARAR', tc[0], y + 18);
      doc.text('GASTOS DEDUCIBLES', tc[1], y + 18);
      doc.text('RENDIMIENTO NETO', tc[2], y + 18);

      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.setTextColor(150, 230, 150); doc.text(`+${globalDeclared.toFixed(2)} €`, tc[0], y + 27);
      doc.setTextColor(230, 100, 100); doc.text(`-${globalExpenses.toFixed(2)} €`, tc[1], y + 27);
      globalDeclaredNet >= 0 ? doc.setTextColor(150, 230, 150) : doc.setTextColor(230, 100, 100);
      doc.text(`${globalDeclaredNet >= 0 ? '+' : ''}${globalDeclaredNet.toFixed(2)} €`, tc[2], y + 27);

      y += 44;

      // Nota sobre gastos parciales y a revisar
      checkSpace(18);
      doc.setFontSize(7); doc.setFont('helvetica', 'italic'); doc.setTextColor(120);
      doc.text(
        "Los gastos marcados como 'Parcial' o 'Revisar' requieren confirmacion con un asesor fiscal.",
        14, y
      );
      y += 5;
      doc.text(
        "'Parcial' (hipoteca): solo los intereses son deducibles, no la amortizacion del capital.",
        14, y
      );
      y += 8;

      // Nota importes declarados por propietario
      checkSpace(8);
      doc.setFontSize(7); doc.setFont('helvetica', 'italic'); doc.setTextColor(80);
      doc.text('Los importes declarados han sido revisados y confirmados por el propietario.', 14, y);
      y += 10;

      // Nota legal final
      doc.setFontSize(6.5); doc.setTextColor(170); doc.setFont('helvetica', 'italic');
      doc.text('Documento informativo generado por Domio. No constituye asesoramiento fiscal ni tiene validez legal ante la Agencia Tributaria.', 14, 291);

      // ── SECCIÓN IVA Y RETENCIONES ──
      const vatPropertiesPDF = reportableProperties.filter(p => p.has_vat === true);
      if (vatPropertiesPDF.length > 0) {
        // Título de sección
        checkSpace(16);
        doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(17);
        doc.text('Inmuebles con IVA y retenciones', 14, y); y += 6;
        doc.setDrawColor(200); doc.line(14, y, pageW - 14, y); y += 8;

        vatPropertiesPDF.forEach(property => {
          const data = getYearlyData(property);
          const baseImponible = data.totalCobrado || 0;
          const ivaRepercutido = baseImponible * 0.21;
          const totalFacturado = baseImponible + ivaRepercutido;
          const retencionIRPF = property.has_irpf_retention ? baseImponible * 0.19 : 0;
          const totalRecibido = totalFacturado - retencionIRPF;

          const rowCount = property.has_irpf_retention ? 5 : 4;
          const boxH = 16 + rowCount * 9 + 4;
          checkSpace(boxH + 8);

          // Caja con borde izquierdo
          doc.setFillColor(248, 248, 248);
          doc.roundedRect(14, y, pageW - 28, boxH, 3, 3, 'F');
          doc.setFillColor(17, 17, 17);
          doc.rect(14, y, 3, boxH, 'F');

          // Nombre inmueble
          doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(17);
          doc.text(property.name, 22, y + 8);
          doc.setDrawColor(230); doc.line(22, y + 12, pageW - 18, y + 12);

          // Filas de datos
          let ry = y + 20;
          const vatRows = [
            { label: 'Base imponible', value: `${baseImponible.toFixed(2)} €`, color: [17, 17, 17], bold: false },
            { label: 'IVA repercutido (21%)  ->  Modelo 303', value: `${ivaRepercutido.toFixed(2)} €`, color: [21, 101, 192], bold: false },
            ...(property.has_irpf_retention ? [{ label: 'Retenci\u00f3n IRPF (19%)  ->  Modelo 115', value: `-${retencionIRPF.toFixed(2)} €`, color: [180, 100, 0], bold: false }] : []),
            { label: 'Total facturado', value: `${totalFacturado.toFixed(2)} €`, color: [17, 17, 17], bold: true },
            { label: 'Total recibido', value: `${totalRecibido.toFixed(2)} €`, color: totalRecibido >= 0 ? [46, 125, 50] : [198, 40, 40], bold: true },
          ];

          vatRows.forEach(row => {
            doc.setFontSize(8.5);
            doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
            doc.setTextColor(row.bold ? 17 : 70);
            doc.text(row.label, 22, ry);
            doc.setTextColor(...row.color);
            doc.setFont('helvetica', 'bold');
            doc.text(row.value, pageW - 18, ry, { align: 'right' });
            if (!row.bold) {
              doc.setDrawColor(238); doc.line(22, ry + 2, pageW - 18, ry + 2);
            }
            ry += 9;
          });

          y += boxH + 10;
        });

        // Nota al pie
        checkSpace(12);
        doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(120);
        doc.text(
          'El IVA repercutido debe declararse trimestralmente (modelo 303). La retenci\u00f3n IRPF es ingresada por el inquilino (modelo 115).',
          14, y
        );
        y += 10;
      }

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
              <label>Uso fiscal del inmueble</label>
              {reportableProperties.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <span style={{ fontSize: '13px', color: '#333', flex: 1 }}>{p.name}</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[['residencial', 'Residencial'], ['turistico', 'Turístico'], ['comercial', 'Comercial'], ['propio', 'Propio']].map(([key, label]) => (
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

          {/* Revisar importes */}
          {reportableProperties.length > 0 && (
            <div className="form-group">
              <label>Revisar importes a declarar</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                {reportableProperties.map(p => {
                  const data = getYearlyData(p);
                  const cobrado = data.totalCobrado;
                  const entry = declaredAmounts[String(p.id)];
                  const declared = entry?.total ?? cobrado;
                  const byMonth = entry?.byMonth ?? null;
                  const diff = declared - cobrado;
                  const isExpanded = expandedBreakdown.has(String(p.id));
                  const monthsWithCobro = data.monthsData.filter(md => md.cobrado > 0);
                  return (
                    <div key={p.id} style={{ background: '#F9F9F9', borderRadius: '10px', padding: '12px 14px' }}>
                      <p style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 600, color: '#222' }}>{p.name}</p>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '110px' }}>
                          <p style={{ margin: '0 0 4px', fontSize: '11px', color: '#bbb' }}>Ingresos cobrados</p>
                          <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#bbb' }}>{cobrado.toFixed(2)} €</p>
                        </div>
                        <div style={{ flex: 1, minWidth: '130px' }}>
                          <p style={{ margin: '0 0 4px', fontSize: '11px', color: '#555' }}>Importe a declarar</p>
                          <input
                            type="number"
                            step="0.01"
                            value={declared}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 0;
                              setDeclaredAmounts(prev => ({ ...prev, [String(p.id)]: { total: val, byMonth: null } }));
                              setExpandedBreakdown(prev => { const s = new Set(prev); s.delete(String(p.id)); return s; });
                            }}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid #ddd', fontSize: '14px', fontWeight: 600, color: '#111', background: 'white', boxSizing: 'border-box' }}
                          />
                          {monthsWithCobro.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                if (!isExpanded) {
                                  if (!byMonth) {
                                    const months = {};
                                    monthsWithCobro.forEach(({ month: m, cobrado: mc }) => { months[m] = mc; });
                                    setDeclaredAmounts(prev => ({ ...prev, [String(p.id)]: { total: prev[String(p.id)]?.total ?? cobrado, byMonth: months } }));
                                  }
                                  setExpandedBreakdown(prev => new Set([...prev, String(p.id)]));
                                } else {
                                  setExpandedBreakdown(prev => { const s = new Set(prev); s.delete(String(p.id)); return s; });
                                }
                              }}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', marginTop: '6px', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#1565C0', fontSize: '11px', fontWeight: 500 }}
                            >
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                                <path d="M2 3.5L5 6.5L8 3.5" stroke="#1565C0" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              Editar por meses
                            </button>
                          )}
                        </div>
                      </div>
                      {isExpanded && monthsWithCobro.length > 0 && (
                        <div style={{ marginTop: '10px', borderTop: '1px solid #eee', paddingTop: '10px', maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {monthsWithCobro.map(({ month: m, cobrado: mc }) => {
                            const monthDeclared = byMonth ? (byMonth[m] ?? mc) : mc;
                            return (
                              <div key={m} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '11px', color: '#555', width: '72px', flexShrink: 0 }}>{monthNames[m]}</span>
                                <span style={{ fontSize: '11px', color: '#bbb', width: '90px', flexShrink: 0 }}>Cobrado: {mc.toFixed(2)} €</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={monthDeclared}
                                  onChange={ev => {
                                    const val = parseFloat(ev.target.value) || 0;
                                    setDeclaredAmounts(prev => {
                                      const prevEntry = prev[String(p.id)] || { total: cobrado, byMonth: null };
                                      const prevBM = prevEntry.byMonth || {};
                                      const newBM = { ...prevBM, [m]: val };
                                      const newTotal = Object.values(newBM).reduce((s, v) => s + v, 0);
                                      return { ...prev, [String(p.id)]: { total: newTotal, byMonth: newBM } };
                                    });
                                  }}
                                  style={{ flex: 1, padding: '5px 8px', borderRadius: '6px', border: '1.5px solid #ddd', fontSize: '12px', fontWeight: 600, color: '#111', background: 'white', boxSizing: 'border-box' }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {Math.abs(diff) > 0.01 && (
                        <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#aaa' }}>
                          Diferencia: {diff >= 0 ? '+' : ''}{diff.toFixed(2)} €
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
function RentabilityModal({ properties, supabaseExpenses, initialPropertyId, onUpdateProperty, onClose, onExpenseAdded }) {
  const [selectedPropertyId, setSelectedPropertyId] = useState(
    initialPropertyId ?? (properties.length > 0 ? String(properties[0].id) : '')
  );
  const [historyPayments, setHistoryPayments] = useState([]);

  const property = properties.find(p => String(p.id) === String(selectedPropertyId));

  useEffect(() => {
    setHistoryPayments([]);
    if (!property?.id) return;
    supabase
      .from('payments')
      .select('year, month, amount, status')
      .eq('property_id', String(property.id))
      .eq('status', 'confirmed')
      .then(({ data }) => { if (data) setHistoryPayments(data); });
  }, [selectedPropertyId]); // eslint-disable-line

  const propertyExpenses = (supabaseExpenses || []).filter(
    e => String(e.property_id) === String(property?.id)
  );

  // ── PDF export — reads from property.investmentData after save ──────────────
  const handleExportPDF = () => {
    if (!property) return;
    import('jspdf').then(({ jsPDF }) => {
      const inv = property.investmentData || {};
      const doc = new jsPDF();
      const pageW = doc.internal.pageSize.getWidth();
      let y = 0;

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

      doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(17);
      doc.text(property.name, 14, y); y += 8;
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(120);
      const statusLabel = property.status === 'alquilado' ? 'Alquilado'
        : property.status === 'por_habitaciones' ? 'Por habitaciones'
        : property.status === 'vacacional' ? 'Vacacional'
        : property.status === 'otros' ? (property.customType || 'Otros') : 'Vacío';
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

      const purchasePrice = parseFloat(inv.purchasePrice) || 0;
      const downPayment = parseFloat(inv.downPayment) || 0;
      const acquisitionCosts = parseFloat(inv.acquisitionCosts) || 0;
      const initialInvestment = downPayment + acquisitionCosts;

      if (purchasePrice > 0) {
        section('Datos de inversión');
        row('Precio de compra', `${purchasePrice.toFixed(0)} €`);
        if (downPayment > 0) row('Entrada', `${downPayment.toFixed(0)} €`);
        if (acquisitionCosts > 0) row('Gastos de adquisición', `${acquisitionCosts.toFixed(0)} €`);
        if (initialInvestment > 0) row('Inversión total', `${initialInvestment.toFixed(0)} €`);
      }

      if (inv.mortgageEnabled && inv.monthlyMortgage) {
        section('Hipoteca');
        row('Cuota mensual', `${parseFloat(inv.monthlyMortgage).toFixed(0)} €`);
        if (inv.interestRate) row('Tipo de interés', `${inv.interestRate}% (${inv.rateType === 'variable' ? 'variable' : 'fijo'})`);
        if (inv.loanYears) row('Plazo', `${inv.loanYears} años`);
        if (inv.loanCapital) row('Capital del préstamo', `${parseFloat(inv.loanCapital).toFixed(0)} €`);
      }

      const ownership = (property.ownershipPercentage || 100) / 100;
      const ownershipPct = property.ownershipPercentage || 100;
      const monthlyMortgage = parseFloat(inv.monthlyMortgage) || 0;
      const mortgageInExp = propertyExpenses.some(e => e.active !== false && e.category === 'hipoteca');
      const effectiveMortgage = mortgageInExp ? 0 : monthlyMortgage;
      const configuredIncome = (() => {
        if (property.status === 'por_habitaciones')
          return (property.rooms || []).reduce((s, r) => s + (Number(r.price) || 0), 0) * ownership;
        if (property.status === 'alquilado' || property.status === 'otros') {
          const t = (property.tenants || []).reduce((s, t) => s + (Number(t.amount) || 0), 0);
          return (t || Number(property.price) || 0) * ownership;
        }
        return 0;
      })();
      const monthlyExpenses = propertyExpenses
        .filter(e => e.active !== false)
        .reduce((sum, e) => {
          const pct = e.expense_percentage != null ? e.expense_percentage : ownershipPct;
          const amt = Number(e.amount) || 0;
          const freq = e.frequency;
          const equiv = freq === 'trimestral' ? amt / 3 : freq === 'anual' ? amt / 12
            : freq === 'custom' ? amt / (e.custom_frequency_months || 1) : amt;
          return sum + equiv * pct / 100;
        }, 0);
      const cashflowBruto = configuredIncome - effectiveMortgage;
      const nowD = new Date();
      const last6 = [];
      let fy = nowD.getFullYear(), fm = nowD.getMonth();
      for (let i = 0; i < 6; i++) {
        last6.push({ year: fy, month: fm });
        if (fm === 0) { fm = 11; fy--; } else { fm--; }
      }
      const mwd = last6.filter(({ year, month }) => historyPayments.some(p => p.year === year && p.month === month));
      const avgIncome = mwd.length > 0
        ? mwd.reduce((t, { year, month }) =>
            t + historyPayments.filter(p => p.year === year && p.month === month).reduce((s, p) => s + (Number(p.amount) || 0), 0)
          , 0) / mwd.length * ownership
        : null;
      const cashflowNeto = avgIncome !== null ? avgIncome - monthlyExpenses - effectiveMortgage : null;
      const effectiveCF = cashflowNeto ?? cashflowBruto;
      const roi = initialInvestment > 0 ? (effectiveCF * 12 / initialInvestment) * 100 : null;
      const payback = initialInvestment > 0 && effectiveCF * 12 > 0 ? initialInvestment / (effectiveCF * 12) : null;
      const rentBruta = purchasePrice > 0 ? (configuredIncome * 12 / purchasePrice) * 100 : null;

      section('Indicadores');
      row('Cashflow bruto', `${cashflowBruto >= 0 ? '+' : ''}${cashflowBruto.toFixed(0)} €/mes`,
        cashflowBruto >= 0 ? [46, 125, 50] : [198, 40, 40]);
      if (cashflowNeto !== null) row(`Cashflow neto (${mwd.length} meses)`,
        `${cashflowNeto >= 0 ? '+' : ''}${cashflowNeto.toFixed(0)} €/mes`,
        cashflowNeto >= 0 ? [46, 125, 50] : [198, 40, 40]);
      if (rentBruta !== null) row('Rentabilidad bruta', `${rentBruta.toFixed(2)}%`);
      if (roi !== null) row('ROI', `${roi.toFixed(2)}%`,
        roi < 3 ? [198, 40, 40] : roi < 6 ? [230, 120, 0] : [46, 125, 50]);
      if (payback !== null) row('Payback', `${payback.toFixed(1)} años`);

      doc.setFontSize(6.5); doc.setTextColor(170); doc.setFont('helvetica', 'italic');
      doc.text('Documento informativo generado por Domio. No constituye asesoramiento financiero.', 14, 291);
      doc.save(`rentabilidad_${(property.name || 'propiedad').replace(/\s+/g, '_')}.pdf`);
    });
  };

  // ── Styles ────────────────────────────────────────────────────────────────────
  const inputStyle = {
    width: '100%', padding: '12px', borderRadius: '10px',
    border: '1px solid #ddd', fontSize: '15px', background: 'white', boxSizing: 'border-box',
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
            <label style={labelStyle}>Inmueble</label>
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

          {property ? (
            <>
              <InvestmentForm
                property={property}
                expenses={propertyExpenses}
                onUpdate={onUpdateProperty}
                landlordEmail={property.landlord_email}
                onExpenseAdded={onExpenseAdded}
              />

              {/* PDF Export */}
              <button
                onClick={handleExportPDF}
                style={{
                  padding: '11px 16px', borderRadius: '10px', border: '1px solid #ddd',
                  background: 'white', fontSize: '13px', fontWeight: 600,
                  cursor: 'pointer', color: '#333', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: '6px',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Exportar PDF
              </button>
            </>
          ) : (
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