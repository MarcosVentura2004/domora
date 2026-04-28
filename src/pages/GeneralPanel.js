import React, { useState, useEffect } from 'react';
import './Dashboard.css';
import { supabase } from '../supabaseClient';

const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth();

function getMonthlyIncome(property) {
  const ownership = (property.ownershipPercentage || 100) / 100;
  if (property.status === 'vacacional') {
    return (property.bookings || [])
      .filter(b => {
        const s = new Date(b.startDate);
        return b.status === 'confirmed' && s.getFullYear() === currentYear && s.getMonth() === currentMonth;
      })
      .reduce((sum, b) => sum + (b.amount || 0), 0) * ownership;
  }
  if (property.status === 'por_habitaciones') {
    return (property.payments || [])
      .filter(p => p.year === currentYear && p.month === currentMonth && p.status === 'confirmed' && p.roomId)
      .reduce((sum, p) => sum + (p.amount || 0), 0) * ownership;
  }
  if (property.status === 'alquilado' || property.status === 'otros') {
    return (property.payments || [])
      .filter(p => p.year === currentYear && p.month === currentMonth && p.status === 'confirmed' && !p.roomId)
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

function getMonthlyExpenses(property, supabaseExpenses) {
  if (property.status === 'uso_propio') return 0;
  const propertyExpenses = (supabaseExpenses || []).filter(e => String(e.property_id) === String(property.id));
  const active = getExpensesForMonth(propertyExpenses, currentYear, currentMonth);
  const ownership = property.ownershipPercentage || 100;
  return active.reduce((sum, e) => {
    const pct = e.expense_percentage != null ? e.expense_percentage : ownership;
    return sum + getMonthlyEquivalentGP(e) * pct / 100;
  }, 0);
}

function generateAlerts(properties, supabasePayments = [], supabaseExpenses = []) {
  const alerts = [];

  properties.forEach(property => {
    if (property.status === 'uso_propio') return;

    const ownership = (property.ownershipPercentage || 100) / 100;

    // Pagos pendientes de confirmar (Supabase es fuente de verdad)
    if (property.status === 'alquilado' || property.status === 'otros' || property.status === 'por_habitaciones') {
      const supabasePending = supabasePayments.filter(
        p => String(p.property_id) === String(property.id) && p.status === 'pending'
      );
      const localPending = (property.payments || []).filter(
        p => p.year === currentYear && p.month === currentMonth && p.status === 'pending'
      );
      const pendingCount = supabasePending.length || localPending.length;
      if (pendingCount > 0) {
        alerts.push({
          type: 'warning',
          text: `${property.name} — ${pendingCount} pago${pendingCount > 1 ? 's' : ''} pendiente${pendingCount > 1 ? 's' : ''} de confirmar`,
          property: property.name,
        });
      }
    }

    // Habitaciones con inquilino sin ningún pago este mes
    if (property.status === 'por_habitaciones') {
      const roomsWithTenant = (property.rooms || []).filter(r => r.tenant);
      roomsWithTenant.forEach(room => {
        const hasPayment = (property.payments || []).some(
          p => p.year === currentYear && p.month === currentMonth && p.roomId === room.id
        );
        if (!hasPayment) {
          alerts.push({
            type: 'warning',
            text: `${property.name} — ${room.name}: ${room.tenant.name} no ha registrado el pago de este mes`,
            property: property.name,
          });
        }
      });
    }

    // Habitaciones vacías
    if (property.status === 'por_habitaciones') {
      const emptyRooms = (property.rooms || []).filter(r => !r.tenant);
      if (emptyRooms.length > 0) {
        alerts.push({
          type: 'info',
          text: `${property.name} — ${emptyRooms.length} habitación${emptyRooms.length > 1 ? 'es' : ''} vacía${emptyRooms.length > 1 ? 's' : ''}`,
          property: property.name,
        });
      }
    }

    // Piso vacío
    if (property.status === 'vacio') {
      alerts.push({
        type: 'info',
        text: `${property.name} — sin inquilino`,
        property: property.name,
      });
    }

    // Sin pagos este mes (alquilado/otros con inquilino)
    if ((property.status === 'alquilado' || property.status === 'otros') && (property.tenants || []).length > 0) {
      const supabaseForProperty = supabasePayments.filter(
        p => String(p.property_id) === String(property.id)
      );
      const hasSupabasePayment = supabaseForProperty.length > 0;
      const hasLocalPayment = (property.payments || []).some(
        p => p.year === currentYear && p.month === currentMonth
      );
      if (!hasSupabasePayment && !hasLocalPayment) {
        alerts.push({
          type: 'warning',
          text: `${property.name} — sin registro de pago este mes`,
          property: property.name,
        });
      }
    }

    // Vacacional sin reservas este mes
    if (property.status === 'vacacional') {
      const thisMonthBookings = (property.bookings || []).filter(b => {
        const s = new Date(b.startDate);
        return s.getFullYear() === currentYear && s.getMonth() === currentMonth;
      });
      if (thisMonthBookings.length === 0) {
        alerts.push({
          type: 'info',
          text: `${property.name} — sin reservas este mes`,
          property: property.name,
        });
      }
    }

    // Gastos recurrentes variables pendientes de importe
    const propertyExpenses = supabaseExpenses.filter(e => String(e.property_id) === String(property.id));
    propertyExpenses
      .filter(e => e.type === 'recurrente_variable' && e.frequency !== 'manual' && e.active !== false && !e.amount)
      .forEach(e => {
        const isDue = getExpensesForMonth([e], currentYear, currentMonth).length > 0;
        if (isDue) {
          alerts.push({
            type: 'warning',
            text: `${property.name} — "${e.name}": pendiente de introducir importe`,
            property: property.name,
          });
        }
      });

    // Rentabilidad negativa
    const income = getMonthlyIncome(property);
    const expenses = getMonthlyExpenses(property, supabaseExpenses);
    if (expenses > 0 && income < expenses) {
      alerts.push({
        type: 'danger',
        text: `${property.name} — gastos superan ingresos este mes (${(expenses - income).toFixed(0)} € de pérdida)`,
        property: property.name,
      });
    }

  });

  return alerts;
}

function generateTips(properties, supabaseExpenses = []) {
  const tips = [];
  if (properties.length === 0) return tips;

  // Inmueble menos rentable
  const withIncome = properties
    .map(p => ({ p, net: getMonthlyIncome(p) - getMonthlyExpenses(p, supabaseExpenses) }))
    .filter(({ p }) => p.status !== 'vacio' && p.status !== 'uso_propio');

  if (withIncome.length > 1) {
    const worst = withIncome.sort((a, b) => a.net - b.net)[0];
    if (worst.net !== 0) {
      tips.push(`La rentabilidad más baja este mes es la de ${worst.p.name} (${worst.net >= 0 ? '+' : ''}${worst.net.toFixed(0)} € neto).`);
    }
  }

  // Vacacional con baja ocupación
  const vacacionales = properties.filter(p => p.status === 'vacacional');
  vacacionales.forEach(p => {
    const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    const nextBookings = (p.bookings || []).filter(b => {
      const s = new Date(b.startDate);
      return s.getFullYear() === nextYear && s.getMonth() === nextMonth;
    });
    if (nextBookings.length === 0) {
      const monthName = new Date(nextYear, nextMonth).toLocaleDateString('es-ES', { month: 'long' });
      tips.push(`${p.name} no tiene reservas para ${monthName}. Puede ser buen momento para publicar disponibilidad.`);
    }
  });

  // Muchos gastos
  properties.forEach(p => {
    const expenses = getMonthlyExpenses(p, supabaseExpenses);
    const income = getMonthlyIncome(p);
    if (income > 0 && expenses / income > 0.4) {
      tips.push(`Los gastos de ${p.name} representan el ${Math.round(expenses / income * 100)}% de los ingresos. Puede que haya margen de optimización.`);
    }
  });

  return tips.slice(0, 3);
}

// ─────────────────────────────────────────────
// Vista adjunto incidencia (URL de Supabase Storage)
// ─────────────────────────────────────────────
function IncidentAttachmentView({ attachmentUrl }) {
  if (!attachmentUrl) return null;
  const isImage = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(attachmentUrl);

  if (isImage) {
    return (
      <div style={{ marginTop: 8 }}>
        <img
          src={attachmentUrl}
          alt="Adjunto"
          onClick={() => window.open(attachmentUrl, '_blank')}
          style={{ maxWidth: '100%', maxHeight: '160px', borderRadius: 8, cursor: 'pointer', objectFit: 'cover', display: 'block' }}
        />
      </div>
    );
  }

  return (
    <a
      href={attachmentUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{ marginTop: 8, background: 'rgba(0,0,0,0.06)', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M14 2v6h6" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span style={{ fontSize: 12, color: '#555' }}>Ver archivo adjunto</span>
    </a>
  );
}

// ─────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────
function GeneralPanel({ properties, userEmail, onNavigateToProperties, onOpenSettings, avatarUrl, avatarValid, onAvatarLoad, onAvatarError }) {
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showRentabilityModal, setShowRentabilityModal] = useState(false);
  const [supabasePayments, setSupabasePayments] = useState([]);
  const [supabaseIncidents, setSupabaseIncidents] = useState([]);
  const [supabaseExpenses, setSupabaseExpenses] = useState([]);

  useEffect(() => {
    const propertyIds = properties.map(p => String(p.id));
    if (propertyIds.length === 0) return;
    supabase
      .from('payments')
      .select('property_id, tenant_id, room_id, status')
      .in('property_id', propertyIds)
      .eq('year', currentYear)
      .eq('month', currentMonth)
      .then(({ data }) => { if (data) setSupabasePayments(data); });
    supabase
      .from('expenses')
      .select('*')
      .in('property_id', propertyIds)
      .then(({ data }) => { if (data) setSupabaseExpenses(data); });
  }, [properties]);

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

  const handleResolveIncident = async (incidentId) => {
    await supabase.from('incidents').update({ status: 'resolved' }).eq('id', incidentId);
    setSupabaseIncidents(prev => prev.filter(i => i.id !== incidentId));
  };

  const totalIncome = properties.reduce((sum, p) => sum + getMonthlyIncome(p), 0);
  const totalExpenses = properties.reduce((sum, p) => sum + getMonthlyExpenses(p, supabaseExpenses), 0);
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

  const monthName = now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const alerts = generateAlerts(properties, supabasePayments, supabaseExpenses);
  const tips = generateTips(properties, supabaseExpenses);

  const usoPropioProperties = properties.filter(p => p.status === 'uso_propio');

  // Datos por propiedad para el ranking (uso_propio excluido del resumen financiero)
  const propertyStats = properties
    .filter(p => p.status !== 'uso_propio')
    .map(p => ({
      name: p.name,
      status: p.status,
      income: getMonthlyIncome(p),
      expenses: getMonthlyExpenses(p, supabaseExpenses),
      net: getMonthlyIncome(p) - getMonthlyExpenses(p, supabaseExpenses),
    })).sort((a, b) => b.net - a.net);

  return (
    <div className="dashboard-container" style={{ paddingBottom: '80px' }}>
      {/* Header */}
      <div className="dashboard-header">
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

      {showReportModal && (
        <ReportModal properties={properties} onClose={() => setShowReportModal(false)} />
      )}
      {showRentabilityModal && (
        <RentabilityModal
          properties={properties}
          supabaseExpenses={supabaseExpenses}
          onClose={() => setShowRentabilityModal(false)}
        />
      )}

      <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Mes */}
        <p style={{ margin: 0, fontSize: '13px', color: '#aaa', textTransform: 'capitalize', textAlign: 'center' }}>{monthName}</p>

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

        {/* Incidencias */}
        {supabaseIncidents.length > 0 && (
          <div style={{ background: 'white', borderRadius: '20px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', borderLeft: '4px solid #F44336' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '15px', fontWeight: 600, color: '#C62828', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="#C62828" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="12" y1="9" x2="12" y2="13" stroke="#C62828" strokeWidth="2" strokeLinecap="round"/>
                <line x1="12" y1="17" x2="12.01" y2="17" stroke="#C62828" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Incidencias
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {supabaseIncidents.map((incident) => (
                <div key={incident.id} style={{ padding: '10px 12px', borderRadius: '12px', background: '#FBE9E7' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ flexShrink: 0, width: '10px', height: '10px', marginTop: '6px', background: '#F44336', borderRadius: '50%' }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: '0 0 2px', fontSize: '13px', color: '#333', lineHeight: '1.4' }}>
                        <strong>{incident.property_name}</strong> — {incident.tenant_name}
                      </p>
                      <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#555', lineHeight: '1.4' }}>
                        {incident.description.length > 80 ? incident.description.slice(0, 80) + '...' : incident.description}
                      </p>
                      <p style={{ margin: 0, fontSize: '11px', color: '#aaa' }}>
                        {new Date(incident.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <button
                      onClick={() => handleResolveIncident(incident.id)}
                      style={{ flexShrink: 0, fontSize: '11px', fontWeight: 600, background: '#4CAF50', color: 'white', border: 'none', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer' }}
                    >
                      Resolver
                    </button>
                  </div>
                  {incident.attachment_url && (
                    <div style={{ paddingLeft: '20px', marginTop: 4 }}>
                      <IncidentAttachmentView attachmentUrl={incident.attachment_url} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Alertas */}
        {alerts.filter(a => !a.incident).length > 0 && (
          <div style={{ background: 'white', borderRadius: '20px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '15px', fontWeight: 600, color: '#111' }}>Alertas</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {alerts.filter(a => !a.incident).map((alert, i) => (
                <div key={i} style={{
                  padding: '10px 12px', borderRadius: '12px',
                  background: alert.type === 'danger' ? '#FBE9E7' : alert.type === 'warning' ? '#FFF8E1' : '#F3F4F6',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ flexShrink: 0, width: '10px', height: '10px', marginTop: '3px',
                      background: alert.type === 'danger' ? '#F44336' : alert.type === 'warning' ? '#FFA726' : '#BDBDBD',
                      borderRadius: '50%'
                    }} />
                    <p style={{ margin: 0, fontSize: '13px', color: '#333', lineHeight: '1.4' }}>{alert.text}</p>
                  </div>
                </div>
              ))}
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
                  {propertyStats.map((stat, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 14px', borderRadius: '12px', background: '#F9F9F9',
                      cursor: 'pointer'
                    }} onClick={onNavigateToProperties}>
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
                      <span style={{
                        fontSize: '15px', fontWeight: 700,
                        color: stat.net >= 0 ? '#2E7D32' : '#C62828'
                      }}>
                        {stat.net >= 0 ? '+' : ''}{stat.net.toFixed(0)} €
                      </span>
                    </div>
                  ))}
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

        {/* Consejos */}
        {tips.length > 0 && (
          <div style={{ background: 'white', borderRadius: '20px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '15px', fontWeight: 600, color: '#111' }}>Consejos</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {tips.map((tip, i) => (
                <div key={i} style={{
                  padding: '12px 14px', borderRadius: '12px',
                  background: '#F0F7FF', borderLeft: '3px solid #2196F3'
                }}>
                  <p style={{ margin: 0, fontSize: '13px', color: '#333', lineHeight: '1.5' }}>{tip}</p>
                </div>
              ))}
            </div>
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
        doc.text('Documento informativo generado por Domora. No constituye asesoramiento fiscal ni tiene validez legal ante la Agencia Tributaria.', 14, 291);
        doc.addPage(); y = 20;
      };
      const checkSpace = (needed) => { if (y + needed > 280) addPage(); };

      const drawHeader = () => {
        doc.setFillColor(17, 17, 17);
        doc.rect(0, 0, pageW, 38, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18); doc.setFont('helvetica', 'bold');
        doc.text('Domora', 14, 16);
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
      doc.text('Documento informativo generado por Domora. No constituye asesoramiento fiscal ni tiene validez legal ante la Agencia Tributaria.', 14, 291);

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
function RentabilityModal({ properties, supabaseExpenses, onClose }) {
  const [selectedPropertyId, setSelectedPropertyId] = useState(
    properties.length > 0 ? String(properties[0].id) : ''
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
      doc.text('Domora', 14, 16);
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
      doc.text('Documento informativo generado por Domora. No constituye asesoramiento financiero.', 14, 291);

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