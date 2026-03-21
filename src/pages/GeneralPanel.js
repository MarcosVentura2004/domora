import React, { useState, useEffect } from 'react';
import './Dashboard.css';
import { getFile } from '../utils/fileStorage';
import ProfileMenu from '../components/ProfileMenu';

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
  if (property.status === 'alquilado') {
    return (property.payments || [])
      .filter(p => p.year === currentYear && p.month === currentMonth && p.status === 'confirmed' && !p.roomId)
      .reduce((sum, p) => sum + (p.amount || 0), 0) * ownership;
  }
  return 0;
}

function getMonthlyExpenses(property) {
  const expenses = property.expenses || [];
  return expenses.reduce((sum, e) => {
    const created = new Date(e.createdAt);
    const cy = created.getFullYear(), cm = created.getMonth();
    if (currentYear < cy || (currentYear === cy && currentMonth < cm)) return sum;
    if (e.frequency === 'unico' && !(currentYear === cy && currentMonth === cm)) return sum;
    const pct = e.expensePercentage || (property.ownershipPercentage || 100);
    return sum + (e.amount * pct / 100);
  }, 0);
}

function generateAlerts(properties) {
  const alerts = [];

  properties.forEach(property => {
    const ownership = (property.ownershipPercentage || 100) / 100;

    // Pagos pendientes de confirmar
    if (property.status === 'alquilado' || property.status === 'por_habitaciones') {
      const pending = (property.payments || []).filter(
        p => p.year === currentYear && p.month === currentMonth && p.status === 'pending'
      );
      if (pending.length > 0) {
        alerts.push({
          type: 'warning',
          text: `${property.name} — ${pending.length} pago${pending.length > 1 ? 's' : ''} pendiente${pending.length > 1 ? 's' : ''} de confirmar`,
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

    // Sin pagos este mes (alquilado con inquilino)
    if (property.status === 'alquilado' && (property.tenants || []).length > 0) {
      const hasPayment = (property.payments || []).some(
        p => p.year === currentYear && p.month === currentMonth
      );
      if (!hasPayment) {
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

    // Rentabilidad negativa
    const income = getMonthlyIncome(property);
    const expenses = getMonthlyExpenses(property);
    if (expenses > 0 && income < expenses) {
      alerts.push({
        type: 'danger',
        text: `${property.name} — gastos superan ingresos este mes (${(expenses - income).toFixed(0)} € de pérdida)`,
        property: property.name,
      });
    }

    // Incidencias abiertas reportadas por inquilinos
    (property.incidents || []).filter(i => i.status === 'open').forEach(incident => {
      const desc = incident.description
        ? (incident.description.length > 60 ? incident.description.slice(0, 60) + '...' : incident.description)
        : '';
      const hasAttachment = !!incident.attachment;
      const attachmentNote = hasAttachment ? (incident.attachment.fileType?.startsWith('image/') ? ' 📷' : ' 📎') : '';
      alerts.push({
        type: 'danger',
        text: `⚠ Incidencia en ${property.name} (${incident.tenantName})${desc ? `: "${desc}"` : ''}${attachmentNote}`,
        property: property.name,
        incident,
      });
    });
  });

  return alerts;
}

function generateTips(properties) {
  const tips = [];
  if (properties.length === 0) return tips;

  // Inmueble menos rentable
  const withIncome = properties
    .map(p => ({ p, net: getMonthlyIncome(p) - getMonthlyExpenses(p) }))
    .filter(({ p }) => p.status !== 'vacio');

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
    const expenses = getMonthlyExpenses(p);
    const income = getMonthlyIncome(p);
    if (income > 0 && expenses / income > 0.4) {
      tips.push(`Los gastos de ${p.name} representan el ${Math.round(expenses / income * 100)}% de los ingresos. Puede que haya margen de optimización.`);
    }
  });

  return tips.slice(0, 3);
}

// ─────────────────────────────────────────────
// Vista adjunto incidencia
// ─────────────────────────────────────────────
function IncidentAttachmentView({ attachment }) {
  const [dataUrl, setDataUrl] = useState(null);

  useEffect(() => {
    getFile(attachment.id).then(url => setDataUrl(url)).catch(() => {});
  }, [attachment.id]);

  const isImage = attachment.fileType?.startsWith('image/');

  const handleDownload = () => {
    if (dataUrl) {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = attachment.fileName;
      a.click();
    }
  };

  if (isImage) {
    return (
      <div style={{ marginTop: 8 }}>
        {dataUrl
          ? <img src={dataUrl} alt={attachment.fileName} onClick={handleDownload} style={{ maxWidth: '100%', maxHeight: '160px', borderRadius: 8, cursor: 'pointer', objectFit: 'cover', display: 'block' }} />
          : <div style={{ height: 60, background: 'rgba(0,0,0,0.06)', borderRadius: 8 }} />
        }
      </div>
    );
  }

  return (
    <button onClick={handleDownload} style={{ marginTop: 8, background: 'rgba(0,0,0,0.06)', border: 'none', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', width: '100%' }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M14 2v6h6" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span style={{ fontSize: 12, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachment.fileName}</span>
    </button>
  );
}

// ─────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────
function GeneralPanel({ properties, userEmail, onLogout, onNavigateToProperties, onSwitchRole }) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  const totalIncome = properties.reduce((sum, p) => sum + getMonthlyIncome(p), 0);
  const totalExpenses = properties.reduce((sum, p) => sum + getMonthlyExpenses(p), 0);
  const totalNet = totalIncome - totalExpenses;

  const occupied = properties.filter(p =>
    p.status === 'alquilado' ||
    (p.status === 'por_habitaciones' && (p.rooms || []).some(r => r.tenant)) ||
    (p.status === 'vacacional' && (p.bookings || []).some(b => {
      const s = new Date(b.startDate), e = new Date(b.endDate);
      return b.status === 'confirmed' && s <= now && e >= now;
    }))
  ).length;

  const monthName = now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  // Re-read from localStorage to catch incidents added by tenants after page load
  const freshProperties = JSON.parse(localStorage.getItem(`properties_${userEmail}`) || '[]');
  const alerts = generateAlerts(freshProperties);
  const tips = generateTips(properties);

  // Datos por propiedad para el ranking
  const propertyStats = properties.map(p => ({
    name: p.name,
    status: p.status,
    income: getMonthlyIncome(p),
    expenses: getMonthlyExpenses(p),
    net: getMonthlyIncome(p) - getMonthlyExpenses(p),
  })).sort((a, b) => b.net - a.net);

  return (
    <div className="dashboard-container" style={{ paddingBottom: '80px' }}>
      {/* Header */}
      <div className="dashboard-header">
        <button className="profile-button" onClick={() => setShowProfileMenu(!showProfileMenu)}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="16" fill="#E5E5E5"/>
            <path d="M16 16c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="#666"/>
          </svg>
        </button>
        <span style={{ fontWeight: 600, fontSize: '17px', color: '#111' }}>Resumen</span>
        <div style={{ position: 'relative' }}>
          <button className="options-button" onClick={() => { setShowOptionsMenu(!showOptionsMenu); setShowProfileMenu(false); }}>⋮</button>
          {showOptionsMenu && (
            <div className="options-menu" style={{ right: 0, left: 'auto' }}>
              <button className="option-item" onClick={() => { setShowReportModal(true); setShowOptionsMenu(false); }}>
                Reporte anual
              </button>
            </div>
          )}
        </div>
        {showProfileMenu && (
          <ProfileMenu
            userEmail={userEmail}
            role="landlord"
            onSwitchRole={onSwitchRole}
            onLogout={onLogout}
            onClose={() => setShowProfileMenu(false)}
          />
        )}
      </div>

      {showReportModal && (
        <ReportModal properties={properties} onClose={() => setShowReportModal(false)} />
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
        {alerts.filter(a => a.incident).length > 0 && (
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
              {alerts.filter(a => a.incident).map((alert, i) => (
                <div key={i} style={{ padding: '10px 12px', borderRadius: '12px', background: '#FBE9E7' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ flexShrink: 0, width: '10px', height: '10px', marginTop: '3px', background: '#F44336', borderRadius: '50%' }} />
                    <p style={{ margin: 0, fontSize: '13px', color: '#333', lineHeight: '1.4' }}>{alert.text}</p>
                  </div>
                  {alert.incident?.attachment && (
                    <div style={{ paddingLeft: '20px' }}>
                      <IncidentAttachmentView attachment={alert.incident.attachment} />
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
        {propertyStats.length > 0 && (
          <div style={{ background: 'white', borderRadius: '20px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '15px', fontWeight: 600, color: '#111' }}>Inmuebles este mes</h3>
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
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [ownerName, setOwnerName] = useState('');
  const [ownerNif, setOwnerNif] = useState('');
  // tipo fiscal por propiedad: 'vivienda' | 'turistico'
  const [fiscalTypes, setFiscalTypes] = useState(() =>
    Object.fromEntries(properties.map(p => [p.id, p.status === 'vacacional' ? 'turistico' : 'vivienda']))
  );

  const years = [];
  const minYear = properties.reduce((min, p) => {
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
      } else if (property.status === 'alquilado') {
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
      properties.forEach(property => {
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
      const allData = properties.map(p => ({ p, d: getYearlyData(p) }));
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
      doc.text(`${properties.length} inmueble${properties.length !== 1 ? 's' : ''}`, 20, y + 33);
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
        const typeLabel = property.status === 'alquilado' ? 'Alquilado' : property.status === 'por_habitaciones' ? 'Por habitaciones' : property.status === 'vacacional' ? 'Vacacional' : 'Vacío';
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
          {properties.length > 0 && (
            <div className="form-group">
              <label>Tipo fiscal por inmueble</label>
              {properties.map(p => (
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

export default GeneralPanel;