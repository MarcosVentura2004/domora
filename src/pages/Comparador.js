import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import './Comparador.css';

// ─── Categorías de gasto (igual que PropertyDetail) ───────────────────────────
const EXPENSE_CATEGORIES = [
  { key: 'comunidad',    label: 'Comunidad' },
  { key: 'suministros',  label: 'Suministros' },
  { key: 'seguros',      label: 'Seguros' },
  { key: 'reparaciones', label: 'Reparaciones' },
  { key: 'impuestos',    label: 'Impuestos' },
  { key: 'gestion',      label: 'Gestión' },
  { key: 'hipoteca',     label: 'Hipoteca/Préstamo' },
  { key: 'otros',        label: 'Otros' },
];

// ─── Helpers duplicados de GeneralPanel ───────────────────────────────────────

function getMonthlyEquivalentLocal(expense) {
  const amt = Number(expense.amount) || 0;
  if (expense.frequency === 'trimestral') return amt / 3;
  if (expense.frequency === 'anual') return amt / 12;
  if (expense.frequency === 'custom') return amt / (expense.custom_frequency_months || 1);
  return amt;
}

function getExpensesForMonth(expenses, year, month) {
  return expenses.filter(e => {
    if (e.active === false) return false;
    const start = new Date((e.start_date || e.createdAt) + (e.start_date ? 'T12:00:00' : ''));
    const sy = start.getFullYear(), sm = start.getMonth();
    if (year < sy || (year === sy && month < sm)) return false;
    if (e.type === 'puntual' || e.frequency === 'unico') return year === sy && month === sm;
    const monthsDiff = (year - sy) * 12 + (month - sm);
    const step =
      e.frequency === 'trimestral' ? 3 :
      e.frequency === 'anual' ? 12 :
      e.frequency === 'custom' ? (e.custom_frequency_months || 1) : 1;
    if (monthsDiff % step !== 0) return false;
    if (e.type === 'recurrente_temporal') {
      const paymentIndex = monthsDiff / step;
      if (paymentIndex >= (e.duration_payments || 0)) return false;
    }
    return true;
  });
}

// ─── Generador de opciones mes/año (24 meses anteriores + mes actual) ─────────

function generateMonthOptions() {
  const options = [];
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();
  for (let i = 0; i < 25; i++) {
    options.push({
      year,
      month,
      label: new Date(year, month, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
    });
    if (month === 0) { month = 11; year--; } else { month--; }
  }
  return options;
}

const MONTH_OPTIONS = generateMonthOptions();

// ─── Cálculo de métricas para una columna ────────────────────────────────────

function computeMetrics(property, payments, allExpenses, year, month) {
  if (!property) return null;

  const ownership = (property.ownershipPercentage || 100) / 100;

  // — INGRESOS —
  const confirmedPayments = payments.filter(p => (p.status || '').trim() === 'confirmed');
  const pendingPayments   = payments.filter(p => (p.status || '').trim() === 'pending');

  const totalIncome = confirmedPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0) * ownership;

  // Número de tenants/rooms que deben pagar (para calcular pendientes)
  let expectedCount = 0;
  if (property.status === 'alquilado' || property.status === 'otros') {
    expectedCount = (property.tenants || []).length;
  } else if (property.status === 'por_habitaciones') {
    expectedCount = (property.rooms || []).filter(r => r.tenant).length;
  }
  const confirmedCount = confirmedPayments.filter(p => !p.room_id || property.status === 'por_habitaciones').length;
  const pendingCount   = Math.max(0, expectedCount - confirmedCount);
  const pendingAmount  = pendingPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0) * ownership;

  // — GASTOS —
  const propExpenses = allExpenses.filter(e => String(e.property_id) === String(property.id));
  const activeForMonth = getExpensesForMonth(propExpenses, year, month);

  const totalExpenses = activeForMonth.reduce((sum, e) => {
    const pct = e.expense_percentage != null ? e.expense_percentage : (property.ownershipPercentage || 100);
    return sum + getMonthlyEquivalentLocal(e) * pct / 100;
  }, 0);

  const expensesByCategory = {};
  activeForMonth.forEach(e => {
    const cat = e.category || 'otros';
    const pct = e.expense_percentage != null ? e.expense_percentage : (property.ownershipPercentage || 100);
    expensesByCategory[cat] = (expensesByCategory[cat] || 0) + getMonthlyEquivalentLocal(e) * pct / 100;
  });

  // — RENTABILIDAD —
  const inv = property.investmentData || {};
  const initialInvestment =
    parseFloat(inv.initialInvestment) ||
    ((parseFloat(inv.purchasePrice) || 0) + (parseFloat(inv.acquisitionCosts) || 0));
  const hasInvestment = initialInvestment > 0;

  const mortgageInExpenses = activeForMonth.some(e => e.category === 'hipoteca');
  const mortgage = mortgageInExpenses ? 0 : (parseFloat(inv.monthlyMortgage) || 0);

  const cashflowNeto = totalIncome - totalExpenses - mortgage;
  const roiAnual = hasInvestment ? (cashflowNeto * 12 / initialInvestment) * 100 : null;
  const payback  = hasInvestment && cashflowNeto * 12 > 0 ? initialInvestment / (cashflowNeto * 12) : null;

  // — OCUPACIÓN —
  let tenantsActive = 0;
  let roomsOccupied = 0;
  let roomsTotal    = 0;

  if (property.status === 'alquilado' || property.status === 'otros') {
    tenantsActive = (property.tenants || []).length;
  } else if (property.status === 'por_habitaciones') {
    const rooms = property.rooms || [];
    roomsTotal    = rooms.length;
    roomsOccupied = rooms.filter(r => r.tenant).length;
    tenantsActive = roomsOccupied;
  } else if (property.status === 'vacacional') {
    // bookings activos en el mes seleccionado
    tenantsActive = (property.bookings || []).filter(b => {
      const s = new Date(b.startDate);
      return b.status === 'confirmed' && s.getFullYear() === year && s.getMonth() === month;
    }).length;
  }

  return {
    totalIncome,
    confirmedCount,
    pendingCount,
    pendingAmount,
    totalExpenses,
    expensesByCategory,
    hasInvestment,
    cashflowNeto,
    roiAnual,
    payback,
    tenantsActive,
    roomsOccupied,
    roomsTotal,
    isPorHabitaciones: property.status === 'por_habitaciones',
  };
}

// ─── Helpers de formato ────────────────────────────────────────────────────────

function fmt(amount) {
  return amount.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
}

function roiBadge(roiAnual) {
  // Semáforo: verde ≥8%, amarillo 4–8%, rojo <4%
  const tier = roiAnual >= 8 ? 'green' : roiAnual >= 4 ? 'yellow' : 'red';
  const label = roiAnual >= 8 ? 'Bueno' : roiAnual >= 4 ? 'Moderado' : 'Bajo';
  return (
    <span className={`comparador-roi-badge ${tier}`}>
      <span className="comparador-roi-dot" />
      {label} · {roiAnual.toFixed(1)}%
    </span>
  );
}

// ─── Fila de métrica ──────────────────────────────────────────────────────────

function MetricRow({ label, value, valueClass }) {
  return (
    <div className="comparador-row">
      <span className="comparador-row-label">{label}</span>
      <span className={`comparador-row-value${valueClass ? ' ' + valueClass : ''}`}>{value}</span>
    </div>
  );
}

// ─── Sección con título ───────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div className="comparador-section-card">
      <div className="comparador-section-header">{title}</div>
      {children}
    </div>
  );
}

// ─── Columna independiente ────────────────────────────────────────────────────

function ComparadorColumn({ properties }) {
  const now = new Date();
  const [propId,   setPropId]   = useState(properties.length > 0 ? String(properties[0].id) : '');
  const [selYear,  setSelYear]  = useState(now.getFullYear());
  const [selMonth, setSelMonth] = useState(now.getMonth());
  const [payments,  setPayments]  = useState([]);
  const [expenses,  setExpenses]  = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [loading,   setLoading]   = useState(false);

  const property = properties.find(p => String(p.id) === propId) || null;

  // Seleccionar mes desde el combo único (value = "year-month")
  const handleMonthChange = (val) => {
    const [y, m] = val.split('-').map(Number);
    setSelYear(y);
    setSelMonth(m);
  };

  useEffect(() => {
    if (!propId) return;
    setLoading(true);
    setPayments([]);
    setExpenses([]);
    setIncidents([]);

    Promise.all([
      supabase
        .from('payments')
        .select('property_id, room_id, status, amount, year, month')
        .eq('property_id', propId)
        .eq('year', selYear)
        .eq('month', selMonth),
      supabase
        .from('expenses')
        .select('*')
        .eq('property_id', propId),
      supabase
        .from('incidents')
        .select('id, description, status, created_at')
        .eq('property_id', propId)
        .eq('status', 'open'),
    ]).then(([pmtRes, expRes, incRes]) => {
      if (pmtRes.data) setPayments(pmtRes.data);
      if (expRes.data) setExpenses(expRes.data);
      if (incRes.data) {
        // Filtrar incidencias abiertas creadas en el mes seleccionado
        setIncidents(incRes.data.filter(i => {
          const d = new Date(i.created_at);
          return d.getFullYear() === selYear && d.getMonth() === selMonth;
        }));
      }
      setLoading(false);
    });
  }, [propId, selYear, selMonth]);

  const metrics = property ? computeMetrics(property, payments, expenses, selYear, selMonth) : null;

  const currentMonthValue = `${selYear}-${selMonth}`;

  return (
    <div className="comparador-column">

      {/* ── Selectors ── */}
      <div className="comparador-selector-card">
        <div>
          <p className="comparador-selector-label">Inmueble</p>
          <select
            className="comparador-select"
            value={propId}
            onChange={e => setPropId(e.target.value)}
          >
            {properties.map(p => (
              <option key={p.id} value={String(p.id)}>{p.name || p.address || `Inmueble ${p.id}`}</option>
            ))}
          </select>
        </div>
        <div>
          <p className="comparador-selector-label">Mes</p>
          <select
            className="comparador-select"
            value={currentMonthValue}
            onChange={e => handleMonthChange(e.target.value)}
          >
            {MONTH_OPTIONS.map(o => (
              <option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`}>
                {o.label.charAt(0).toUpperCase() + o.label.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && <div className="comparador-loading">Cargando datos...</div>}

      {/* ── No property ── */}
      {!property && !loading && (
        <div className="comparador-placeholder">Selecciona un inmueble</div>
      )}

      {/* ── Metrics ── */}
      {metrics && !loading && (
        <>
          {/* INGRESOS */}
          <Section title="Ingresos">
            <MetricRow label="Ingresos del mes" value={fmt(metrics.totalIncome)} />
            <MetricRow
              label="Pagos confirmados"
              value={metrics.confirmedCount > 0 ? `${metrics.confirmedCount} pago${metrics.confirmedCount !== 1 ? 's' : ''}` : '—'}
            />
            <MetricRow
              label="Pagos pendientes"
              value={
                metrics.pendingCount > 0
                  ? `${metrics.pendingCount} pendiente${metrics.pendingCount !== 1 ? 's' : ''}`
                  : '—'
              }
              valueClass={metrics.pendingCount > 0 ? 'negative' : 'neutral'}
            />
          </Section>

          {/* GASTOS */}
          <Section title="Gastos">
            <MetricRow label="Total del mes" value={fmt(metrics.totalExpenses)} />
            {EXPENSE_CATEGORIES.filter(c => metrics.expensesByCategory[c.key] > 0).map(c => (
              <MetricRow
                key={c.key}
                label={c.label}
                value={fmt(metrics.expensesByCategory[c.key])}
                valueClass="neutral"
              />
            ))}
            {Object.keys(metrics.expensesByCategory).length === 0 && (
              <div className="comparador-empty">Sin gastos este mes</div>
            )}
          </Section>

          {/* RENTABILIDAD (solo si hay datos de inversión) */}
          {metrics.hasInvestment && (
            <Section title="Rentabilidad">
              <MetricRow
                label="Cashflow neto"
                value={`${metrics.cashflowNeto >= 0 ? '+' : ''}${fmt(metrics.cashflowNeto)}`}
                valueClass={metrics.cashflowNeto >= 0 ? 'positive' : 'negative'}
              />
              {metrics.roiAnual !== null && (
                <div className="comparador-row">
                  <span className="comparador-row-label">ROI anual</span>
                  {roiBadge(metrics.roiAnual)}
                </div>
              )}
              {metrics.payback !== null ? (
                <MetricRow label="Payback" value={`${metrics.payback.toFixed(1)} años`} />
              ) : (
                <MetricRow label="Payback" value="—" valueClass="neutral" />
              )}
            </Section>
          )}

          {/* OCUPACIÓN */}
          <Section title="Ocupación">
            <MetricRow
              label="Inquilinos activos"
              value={metrics.tenantsActive > 0 ? String(metrics.tenantsActive) : '—'}
            />
            {metrics.isPorHabitaciones && (
              <MetricRow
                label="Habitaciones"
                value={`${metrics.roomsOccupied} / ${metrics.roomsTotal}`}
              />
            )}
          </Section>

          {/* INCIDENCIAS */}
          <Section title="Incidencias">
            <MetricRow
              label="Abiertas este mes"
              value={incidents.length > 0 ? String(incidents.length) : '—'}
              valueClass={incidents.length > 0 ? 'negative' : 'neutral'}
            />
          </Section>
        </>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

function Comparador({ properties, onBack }) {
  const rentableProperties = properties.filter(p => p.status !== 'uso_propio');

  return (
    <div className="comparador-page">
      <div className="comparador-header">
        <button className="comparador-back-btn" onClick={onBack}>
          <svg width="9" height="15" viewBox="0 0 9 15" fill="none">
            <path d="M8 1L1 7.5L8 14" stroke="#007aff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Volver
        </button>
        <span className="comparador-title">Comparar inmuebles</span>
      </div>

      {rentableProperties.length === 0 ? (
        <div className="comparador-placeholder">No hay inmuebles disponibles para comparar.</div>
      ) : (
        <div className="comparador-columns-wrapper">
          <div className="comparador-columns">
            <ComparadorColumn properties={rentableProperties} />
            <ComparadorColumn properties={rentableProperties} />
          </div>
        </div>
      )}
    </div>
  );
}

export default Comparador;
