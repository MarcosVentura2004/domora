import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import './Comparador.css';

// ─── Categorías de gasto ───────────────────────────────────────────────────────
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

// ─── Constantes de periodo ────────────────────────────────────────────────────
const _now = new Date();
const THIS_YEAR  = _now.getFullYear();
const THIS_MONTH = _now.getMonth();

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const MONTH_NAMES_LOWER = MONTH_NAMES.map(m => m.toLowerCase());

const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => THIS_YEAR - i);

// ─── Helpers de cálculo ───────────────────────────────────────────────────────

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
      e.frequency === 'anual'      ? 12 :
      e.frequency === 'custom'     ? (e.custom_frequency_months || 1) : 1;
    if (monthsDiff % step !== 0) return false;
    if (e.type === 'recurrente_temporal') {
      const paymentIndex = monthsDiff / step;
      if (paymentIndex >= (e.duration_payments || 0)) return false;
    }
    return true;
  });
}

function computeMetrics(property, payments, allExpenses, year, month) {
  if (!property) return null;

  const ownership = (property.ownershipPercentage || 100) / 100;

  const confirmedPayments = payments.filter(p => (p.status || '').trim() === 'confirmed');
  const pendingPayments   = payments.filter(p => (p.status || '').trim() === 'pending');

  const totalIncome = confirmedPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0) * ownership;

  let expectedCount = 0;
  if (property.status === 'alquilado' || property.status === 'otros') {
    expectedCount = (property.tenants || []).length;
  } else if (property.status === 'por_habitaciones') {
    expectedCount = (property.rooms || []).filter(r => r.tenant).length;
  }
  const confirmedCount = confirmedPayments.filter(p => !p.room_id || property.status === 'por_habitaciones').length;
  const pendingCount   = Math.max(0, expectedCount - confirmedCount);
  const pendingAmount  = pendingPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0) * ownership;

  const propExpenses   = allExpenses.filter(e => String(e.property_id) === String(property.id));
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

  const inv = property.investmentData || {};
  const initialInvestment =
    parseFloat(inv.initialInvestment) ||
    ((parseFloat(inv.purchasePrice) || 0) + (parseFloat(inv.acquisitionCosts) || 0));
  const hasInvestment = initialInvestment > 0;

  const mortgageInExpenses = activeForMonth.some(e => e.category === 'hipoteca');
  const mortgage     = mortgageInExpenses ? 0 : (parseFloat(inv.monthlyMortgage) || 0);
  const cashflowNeto = totalIncome - totalExpenses - mortgage;
  const roiAnual     = hasInvestment ? (cashflowNeto * 12 / initialInvestment) * 100 : null;
  const payback      = hasInvestment && cashflowNeto * 12 > 0 ? initialInvestment / (cashflowNeto * 12) : null;

  let tenantsActive = 0, roomsOccupied = 0, roomsTotal = 0;
  if (property.status === 'alquilado' || property.status === 'otros') {
    tenantsActive = (property.tenants || []).length;
  } else if (property.status === 'por_habitaciones') {
    const rooms = property.rooms || [];
    roomsTotal    = rooms.length;
    roomsOccupied = rooms.filter(r => r.tenant).length;
    tenantsActive = roomsOccupied;
  } else if (property.status === 'vacacional') {
    tenantsActive = (property.bookings || []).filter(b => {
      const s = new Date(b.startDate);
      return b.status === 'confirmed' && s.getFullYear() === year && s.getMonth() === month;
    }).length;
  }

  return {
    totalIncome, confirmedCount, pendingCount, pendingAmount,
    totalExpenses, expensesByCategory,
    hasInvestment, cashflowNeto, roiAnual, payback,
    tenantsActive, roomsOccupied, roomsTotal,
    isPorHabitaciones: property.status === 'por_habitaciones',
  };
}

// ─── Helpers de formato ───────────────────────────────────────────────────────

function fmt(amount) {
  return amount.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
}

function roiBadge(roiAnual) {
  const tier  = roiAnual >= 8 ? 'green' : roiAnual >= 4 ? 'yellow' : 'red';
  const label = roiAnual >= 8 ? 'Bueno' : roiAnual >= 4 ? 'Moderado' : 'Bajo';
  return (
    <span className={`comparador-roi-badge ${tier}`}>
      <span className="comparador-roi-dot" />
      {label} · {roiAnual.toFixed(1)}%
    </span>
  );
}

// ─── Componentes UI pequeños ──────────────────────────────────────────────────

function MetricRow({ label, value, valueClass }) {
  return (
    <div className="comparador-row">
      <span className="comparador-row-label">{label}</span>
      <span className={`comparador-row-value${valueClass ? ' ' + valueClass : ''}`}>{value}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="comparador-section-card">
      <div className="comparador-section-header">{title}</div>
      {children}
    </div>
  );
}

// ─── Análisis de diferencias ──────────────────────────────────────────────────

function generateAnalysisText(colData1, colData2) {
  if (!colData1?.property || !colData2?.property) return null;

  const m1 = computeMetrics(
    colData1.property, colData1.payments, colData1.expenses, colData1.selYear, colData1.selMonth
  );
  const m2 = computeMetrics(
    colData2.property, colData2.payments, colData2.expenses, colData2.selYear, colData2.selMonth
  );
  if (!m1 || !m2) return null;

  const period1  = `${MONTH_NAMES_LOWER[colData1.selMonth]} ${colData1.selYear}`;
  const period2  = `${MONTH_NAMES_LOWER[colData2.selMonth]} ${colData2.selYear}`;
  const sameProp = String(colData1.property.id) === String(colData2.property.id);

  const refLeft  = sameProp ? `en ${period1}` : 'en la columna izquierda';
  const refRight = sameProp ? `en ${period2}` : 'en la columna derecha';

  const parts = [];

  // — Ingresos —
  const incDiff = m2.totalIncome - m1.totalIncome;
  if (m1.totalIncome > 0 && m2.totalIncome > 0) {
    if (Math.abs(incDiff) < 0.5) {
      parts.push('Los ingresos son idénticos en ambas columnas.');
    } else {
      const incPct = Math.abs(incDiff / m1.totalIncome * 100).toFixed(0);
      const dir    = incDiff > 0 ? 'superiores' : 'inferiores';
      const high   = incDiff > 0 ? refRight : refLeft;
      const low    = incDiff > 0 ? refLeft  : refRight;
      const highAmt = fmt(incDiff > 0 ? m2.totalIncome : m1.totalIncome);
      const lowAmt  = fmt(incDiff > 0 ? m1.totalIncome : m2.totalIncome);
      parts.push(
        `Los ingresos ${high} (${highAmt}) son un ${incPct}% ${dir} a los de ${low} (${lowAmt}).`
      );
    }
  } else if (m1.totalIncome === 0 && m2.totalIncome === 0) {
    parts.push('Ninguna de las dos columnas registra ingresos en el período seleccionado.');
  } else if (m2.totalIncome > 0) {
    parts.push(`${refRight.charAt(0).toUpperCase() + refRight.slice(1)} hay ${fmt(m2.totalIncome)} de ingresos; ${refLeft} no se registra ninguno.`);
  } else {
    parts.push(`${refLeft.charAt(0).toUpperCase() + refLeft.slice(1)} hay ${fmt(m1.totalIncome)} de ingresos; ${refRight} no se registra ninguno.`);
  }

  // — Gastos —
  const expDiff = m2.totalExpenses - m1.totalExpenses;
  if (m1.totalExpenses > 0 || m2.totalExpenses > 0) {
    if (Math.abs(expDiff) < 0.5) {
      parts.push('Los gastos son idénticos en ambas columnas.');
    } else {
      const allCats = new Set([
        ...Object.keys(m1.expensesByCategory),
        ...Object.keys(m2.expensesByCategory),
      ]);
      let maxDiffCat = null, maxDiffVal = 0;
      allCats.forEach(cat => {
        const d = Math.abs((m2.expensesByCategory[cat] || 0) - (m1.expensesByCategory[cat] || 0));
        if (d > maxDiffVal) { maxDiffVal = d; maxDiffCat = cat; }
      });
      const catLabel = maxDiffCat
        ? (EXPENSE_CATEGORIES.find(c => c.key === maxDiffCat)?.label?.toLowerCase() || maxDiffCat)
        : null;
      const col = expDiff > 0 ? refRight : refLeft;
      let expMsg = `Los gastos son ${fmt(Math.abs(expDiff))} ${expDiff > 0 ? 'mayores' : 'menores'} ${col}`;
      if (catLabel && maxDiffVal > 1) expMsg += `, principalmente por ${catLabel}`;
      parts.push(expMsg + '.');
    }
  }

  // — Cashflow —
  const cashDiff = m2.cashflowNeto - m1.cashflowNeto;
  if (Math.abs(m1.cashflowNeto) > 0.5 || Math.abs(m2.cashflowNeto) > 0.5) {
    if (Math.abs(cashDiff) < 0.5) {
      parts.push('El cashflow neto es idéntico en ambas columnas.');
    } else if (Math.abs(m1.cashflowNeto) > 0.5) {
      const cashPct = Math.abs(cashDiff / Math.abs(m1.cashflowNeto) * 100).toFixed(0);
      const verb    = cashDiff > 0 ? 'mejora' : 'empeora';
      parts.push(`El cashflow neto ${verb} un ${cashPct}% ${refRight} (${fmt(m2.cashflowNeto)}).`);
    } else {
      parts.push(`El cashflow neto ${refRight} es de ${fmt(m2.cashflowNeto)}.`);
    }
  }

  return parts.length > 0 ? parts.join(' ') : null;
}

function AnalysisSection({ colData1, colData2 }) {
  const text = generateAnalysisText(colData1, colData2);
  return (
    <div className="comparador-analysis-section">
      <div className="comparador-analysis-title">Análisis de diferencias</div>
      {text ? (
        <p className="comparador-analysis-text">{text}</p>
      ) : (
        <p className="comparador-analysis-empty">Selecciona dos períodos para ver el análisis.</p>
      )}
    </div>
  );
}

// ─── Columna independiente ────────────────────────────────────────────────────

function ComparadorColumn({ properties, onDataChange }) {
  const [propId,    setPropId]    = useState(properties.length > 0 ? String(properties[0].id) : '');
  const [selYear,   setSelYear]   = useState(THIS_YEAR);
  const [selMonth,  setSelMonth]  = useState(THIS_MONTH);
  const [payments,  setPayments]  = useState([]);
  const [expenses,  setExpenses]  = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [loading,   setLoading]   = useState(false);

  const property = properties.find(p => String(p.id) === propId) || null;

  useEffect(() => {
    if (!propId) return;
    setLoading(true);
    setPayments([]);
    setExpenses([]);
    setIncidents([]);

    const currentProperty = properties.find(p => String(p.id) === propId) || null;

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
      const newPayments  = pmtRes.data || [];
      const newExpenses  = expRes.data || [];
      const newIncidents = (incRes.data || []).filter(i => {
        const d = new Date(i.created_at);
        return d.getFullYear() === selYear && d.getMonth() === selMonth;
      });

      setPayments(newPayments);
      setExpenses(newExpenses);
      setIncidents(newIncidents);
      setLoading(false);

      if (onDataChange) {
        onDataChange({
          property: currentProperty,
          payments:  newPayments,
          expenses:  newExpenses,
          incidents: newIncidents,
          selYear,
          selMonth,
        });
      }
    });
  }, [propId, selYear, selMonth]); // eslint-disable-line

  const metrics = property ? computeMetrics(property, payments, expenses, selYear, selMonth) : null;

  return (
    <div className="comparador-column">

      {/* ── Selectores ── */}
      <div className="comparador-selector-card">
        <div>
          <p className="comparador-selector-label">Inmueble</p>
          <select
            className="comparador-select"
            value={propId}
            onChange={e => setPropId(e.target.value)}
          >
            {properties.map(p => (
              <option key={p.id} value={String(p.id)}>
                {p.name || p.address || `Inmueble ${p.id}`}
              </option>
            ))}
          </select>
        </div>
        <div className="comparador-period-row">
          <div>
            <p className="comparador-selector-label">Mes</p>
            <select
              className="comparador-select"
              value={selMonth}
              onChange={e => setSelMonth(Number(e.target.value))}
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={idx} value={idx}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <p className="comparador-selector-label">Año</p>
            <select
              className="comparador-select"
              value={selYear}
              onChange={e => setSelYear(Number(e.target.value))}
            >
              {YEAR_OPTIONS.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Cargando ── */}
      {loading && <div className="comparador-loading">Cargando datos...</div>}

      {/* ── Sin inmueble ── */}
      {!property && !loading && (
        <div className="comparador-placeholder-col">Selecciona un inmueble</div>
      )}

      {/* ── Métricas ── */}
      {metrics && !loading && (
        <>
          <Section title="Ingresos">
            <MetricRow label="Ingresos del mes" value={fmt(metrics.totalIncome)} />
            <MetricRow
              label="Pagos confirmados"
              value={metrics.confirmedCount > 0
                ? `${metrics.confirmedCount} pago${metrics.confirmedCount !== 1 ? 's' : ''}`
                : '—'}
            />
            <MetricRow
              label="Pagos pendientes"
              value={metrics.pendingCount > 0
                ? `${metrics.pendingCount} pendiente${metrics.pendingCount !== 1 ? 's' : ''}`
                : '—'}
              valueClass={metrics.pendingCount > 0 ? 'negative' : 'neutral'}
            />
          </Section>

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
  const [colData1, setColData1] = useState(null);
  const [colData2, setColData2] = useState(null);

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
        <div className="comparador-content">
          <div className="comparador-columns-wrapper">
            <div className="comparador-columns">
              <ComparadorColumn properties={rentableProperties} onDataChange={setColData1} />
              <ComparadorColumn properties={rentableProperties} onDataChange={setColData2} />
            </div>
          </div>
          <AnalysisSection colData1={colData1} colData2={colData2} />
        </div>
      )}
    </div>
  );
}

export default Comparador;
