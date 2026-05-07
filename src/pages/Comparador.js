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

const SUMINISTROS_SUBCATEGORIES = [
  { key: 'luz',      label: 'Luz' },
  { key: 'agua',     label: 'Agua' },
  { key: 'gas',      label: 'Gas' },
  { key: 'internet', label: 'Internet' },
];

// ─── Constantes de periodo ────────────────────────────────────────────────────
const _now = new Date();
const THIS_YEAR  = _now.getFullYear();
const THIS_MONTH = _now.getMonth();

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

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

  const expensesBySubcategory = {};
  activeForMonth.forEach(e => {
    if (e.category === 'suministros' && e.subcategory) {
      const pct = e.expense_percentage != null ? e.expense_percentage : (property.ownershipPercentage || 100);
      const subKey = e.subcategory.toLowerCase().trim();
      expensesBySubcategory[subKey] = (expensesBySubcategory[subKey] || 0) + getMonthlyEquivalentLocal(e) * pct / 100;
    }
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
    totalExpenses, expensesByCategory, expensesBySubcategory,
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

function MetricRow({ label, value, valueClass, isSubcat }) {
  return (
    <div className={`comparador-row${isSubcat ? ' comparador-row-subcat' : ''}`}>
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

// ─── Generador de análisis ─────────────────────────────────────────────────────

function roiLabel(r) {
  return r >= 8 ? 'Bueno' : r >= 4 ? 'Moderado' : 'Bajo';
}

function generateAnalysis(colData1, colData2) {
  if (!colData1?.property || !colData2?.property) return null;

  const samePeriod =
    String(colData1.property.id) === String(colData2.property.id) &&
    colData1.selYear === colData2.selYear &&
    colData1.selMonth === colData2.selMonth;

  if (samePeriod) return { type: 'same_period' };

  const m1 = computeMetrics(
    colData1.property, colData1.payments, colData1.expenses, colData1.selYear, colData1.selMonth
  );
  const m2 = computeMetrics(
    colData2.property, colData2.payments, colData2.expenses, colData2.selYear, colData2.selMonth
  );
  if (!m1 || !m2) return null;

  const sameProp = String(colData1.property.id) === String(colData2.property.id);
  const prop1Name = colData1.property.name || colData1.property.address || 'Inmueble A';
  const prop2Name = colData2.property.name || colData2.property.address || 'Inmueble B';
  const ref1 = sameProp ? `${MONTH_NAMES[colData1.selMonth]} ${colData1.selYear}` : prop1Name;
  const ref2 = sameProp ? `${MONTH_NAMES[colData2.selMonth]} ${colData2.selYear}` : prop2Name;

  const sections = [];

  // — Ingresos —
  const inc1 = m1.totalIncome, inc2 = m2.totalIncome;
  if (inc1 > 0 || inc2 > 0) {
    let text;
    if (Math.abs(inc2 - inc1) < 0.5) {
      text = `Se mantienen estables en ambos períodos (${fmt(inc1)}).`;
    } else if (inc1 > 0 && inc2 > 0) {
      const diff = inc2 - inc1;
      const pct = Math.abs((diff / inc1) * 100).toFixed(0);
      const dir = diff > 0 ? 'superiores' : 'inferiores';
      const higher = diff > 0 ? ref2 : ref1;
      const lower  = diff > 0 ? ref1  : ref2;
      const hiAmt  = fmt(diff > 0 ? inc2 : inc1);
      const loAmt  = fmt(diff > 0 ? inc1 : inc2);
      text = `${higher} registra ${hiAmt}, un ${pct}% ${dir} a ${lower} (${loAmt}).`;
    } else if (inc2 > 0) {
      text = `${ref2} registra ${fmt(inc2)}; ${ref1} no registra ingresos en ese período.`;
    } else {
      text = `${ref1} registra ${fmt(inc1)}; ${ref2} no registra ingresos en ese período.`;
    }
    sections.push({ label: 'Ingresos', text });
  }

  // — Gastos totales —
  const exp1 = m1.totalExpenses, exp2 = m2.totalExpenses;
  if (exp1 > 0 || exp2 > 0) {
    let text;
    if (Math.abs(exp2 - exp1) < 0.5) {
      text = `Idénticos en ambos períodos (${fmt(exp1)}).`;
    } else {
      const diff = exp2 - exp1;
      const pct  = exp1 > 0.5 ? ` (${diff > 0 ? '+' : '-'}${Math.abs(diff / exp1 * 100).toFixed(0)}%)` : '';
      const dir  = diff > 0 ? 'más altos' : 'más bajos';
      text = `Los gastos en ${ref2} (${fmt(exp2)}) son ${fmt(Math.abs(diff))} ${dir} que en ${ref1} (${fmt(exp1)})${pct}.`;
    }
    sections.push({ label: 'Gastos totales', text });
  }

  // — Desglose por categoría —
  const allCats = new Set([
    ...Object.keys(m1.expensesByCategory),
    ...Object.keys(m2.expensesByCategory),
  ]);

  const catDiffs = [];
  const stableCats = [];

  allCats.forEach(cat => {
    const v1 = m1.expensesByCategory[cat] || 0;
    const v2 = m2.expensesByCategory[cat] || 0;
    const diff = v2 - v1;
    if (Math.abs(diff) > 0.5) {
      catDiffs.push({ cat, v1, v2, diff });
    } else if (v1 > 0.5 && v2 > 0.5) {
      stableCats.push(cat);
    }
  });

  catDiffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  if (catDiffs.length > 0 || stableCats.length > 0) {
    const sentences = catDiffs.slice(0, 5).map(({ cat, v1, diff }) => {
      const label = EXPENSE_CATEGORIES.find(c => c.key === cat)?.label || cat;
      const verb  = diff > 0 ? 'aumentaron' : 'bajaron';
      const inRef = diff > 0 ? ref2 : ref1;
      const pct   = v1 > 0.5 ? ` (${diff > 0 ? '+' : '-'}${Math.abs(diff / v1 * 100).toFixed(0)}%)` : '';
      return `${label} ${verb} ${fmt(Math.abs(diff))}${pct} en ${inRef} respecto al otro período.`;
    });

    if (stableCats.length > 0) {
      const labels = stableCats
        .slice(0, 3)
        .map(cat => {
          const found = EXPENSE_CATEGORIES.find(c => c.key === cat);
          return found ? found.label : cat;
        });
      const plural = labels.length > 1;
      const joined = labels.length === 1
        ? labels[0]
        : labels.slice(0, -1).join(', ') + ' y ' + labels[labels.length - 1];
      sentences.push(
        `${joined} se mantiene${plural ? 'n' : ''} estable${plural ? 's' : ''} en ambos períodos.`
      );
    }

    sections.push({ label: 'Desglose por categoría', text: sentences.join(' ') });
  }

  // — Cashflow neto —
  const cf1 = m1.cashflowNeto, cf2 = m2.cashflowNeto;
  if (Math.abs(cf1) > 0.5 || Math.abs(cf2) > 0.5) {
    let text;
    if (Math.abs(cf2 - cf1) < 0.5) {
      text = `Idéntico en ambos períodos (${cf1 >= 0 ? '+' : ''}${fmt(cf1)}).`;
    } else {
      const diff = cf2 - cf1;
      const verb = diff > 0 ? 'mejoró' : 'empeoró';
      const pct  = Math.abs(cf1) > 0.5
        ? ` — variación del ${Math.abs(diff / Math.abs(cf1) * 100).toFixed(0)}%`
        : '';
      text = `El cashflow ${verb} en ${ref2} (${cf2 >= 0 ? '+' : ''}${fmt(cf2)}) frente a ${ref1} (${cf1 >= 0 ? '+' : ''}${fmt(cf1)})${pct}.`;
    }
    sections.push({ label: 'Cashflow neto', text });
  }

  // — ROI —
  const roi1 = m1.roiAnual, roi2 = m2.roiAnual;
  if (roi1 !== null || roi2 !== null) {
    let text;
    if (roi1 !== null && roi2 !== null) {
      const l1 = roiLabel(roi1), l2 = roiLabel(roi2);
      if (l1 !== l2) {
        text = `Cambió de categoría: de ${l1} (${roi1.toFixed(1)}%) en ${ref1} a ${l2} (${roi2.toFixed(1)}%) en ${ref2}.`;
      } else {
        text = `Se mantiene en categoría ${l1} en ambos períodos (${roi1.toFixed(1)}% → ${roi2.toFixed(1)}%).`;
      }
    } else if (roi2 !== null) {
      text = `${ref2} muestra un ROI de ${roi2.toFixed(1)}% (${roiLabel(roi2)}); ${ref1} no tiene datos de inversión suficientes.`;
    } else {
      text = `${ref1} muestra un ROI de ${roi1.toFixed(1)}% (${roiLabel(roi1)}); ${ref2} no tiene datos de inversión suficientes.`;
    }
    sections.push({ label: 'ROI', text });
  }

  // — Ocupación —
  const oc1 = m1.tenantsActive, oc2 = m2.tenantsActive;
  if (oc1 > 0 || oc2 > 0) {
    let text;
    if (oc1 === oc2) {
      text = `Se mantiene igual en ambos períodos (${oc1} inquilino${oc1 !== 1 ? 's' : ''} activo${oc1 !== 1 ? 's' : ''}).`;
    } else {
      const diff = oc2 - oc1;
      const verb = diff > 0 ? 'mejoró' : 'bajó';
      text = `La ocupación ${verb} en ${ref2} (${oc2} inquilino${oc2 !== 1 ? 's' : ''}) frente a ${ref1} (${oc1} inquilino${oc1 !== 1 ? 's' : ''}).`;
    }
    sections.push({ label: 'Ocupación', text });
  }

  // — Conclusión —
  if (Math.abs(cf2 - cf1) > 0.5) {
    const winner = cf2 > cf1 ? ref2 : ref1;
    const loser  = cf2 > cf1 ? ref1 : ref2;
    let mainReason = null;
    if (catDiffs.length > 0) {
      const { cat, diff } = catDiffs[0];
      const label = (EXPENSE_CATEGORIES.find(c => c.key === cat)?.label || cat).toLowerCase();
      mainReason = `${diff > 0 ? 'mayores' : 'menores'} gastos en ${label}`;
    } else if (Math.abs(inc2 - inc1) > 0.5) {
      mainReason = `${inc2 > inc1 ? 'mayores' : 'menores'} ingresos en ${inc2 > inc1 ? ref2 : ref1}`;
    }
    const text = `${winner} presenta mejor rentabilidad que ${loser}${mainReason ? `, principalmente por ${mainReason}` : ''}.`;
    sections.push({ label: 'Conclusión', text });
  } else if (sections.length > 0) {
    sections.push({ label: 'Conclusión', text: 'Ambos períodos presentan una rentabilidad similar.' });
  }

  return { type: 'analysis', sections };
}

// ─── Sección de análisis (colapsable) ────────────────────────────────────────

function AnalysisSection({ colData1, colData2 }) {
  const [open, setOpen] = useState(false);
  const result    = generateAnalysis(colData1, colData2);
  const canAnalyze = colData1?.property && colData2?.property;

  return (
    <div className="comparador-analysis-footer">
      {open && (
        <div className="comparador-analysis-panel">
          {result?.type === 'same_period' ? (
            <p className="comparador-analysis-empty">
              Selecciona dos períodos diferentes para ver el análisis.
            </p>
          ) : result?.type === 'analysis' ? (
            result.sections.map((s, i) => (
              <p key={i} className="comparador-analysis-para">
                <span className="comparador-analysis-label">{s.label}:</span>{' '}
                {s.text}
              </p>
            ))
          ) : (
            <p className="comparador-analysis-empty">
              Selecciona dos períodos para ver el análisis.
            </p>
          )}
        </div>
      )}
      <div className="comparador-analysis-btn-row">
        <button
          className={`comparador-analysis-toggle${!canAnalyze ? ' comparador-analysis-toggle--disabled' : ''}`}
          onClick={() => { if (canAnalyze) setOpen(o => !o); }}
        >
          {open ? 'Ocultar análisis' : 'Ver análisis de diferencias'}
        </button>
      </div>
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
              <React.Fragment key={c.key}>
                <MetricRow
                  label={c.label}
                  value={fmt(metrics.expensesByCategory[c.key])}
                  valueClass="neutral"
                />
                {c.key === 'suministros' &&
                  SUMINISTROS_SUBCATEGORIES
                    .filter(s => (metrics.expensesBySubcategory[s.key] || 0) > 0)
                    .map(s => (
                      <MetricRow
                        key={s.key}
                        label={s.label}
                        value={fmt(metrics.expensesBySubcategory[s.key])}
                        valueClass="neutral"
                        isSubcat
                      />
                    ))
                }
              </React.Fragment>
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
