import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useInvestmentData } from '../hooks/useInvestmentData';

// ─── Pure mortgage calculator (French amortization formula) ───────────────────
// M = C × [r(1+r)^n] / [(1+r)^n - 1]
// Returns null when inputs are insufficient to calculate.
export function computeMortgage(loanCapital, annualRatePercent, years, startDateStr) {
  const K = parseFloat(loanCapital) || 0;
  const annualRate = parseFloat(annualRatePercent) || 0;
  const nYears = parseFloat(years) || 0;
  if (!K || !nYears || !startDateStr) return null;
  const r = (annualRate / 100) / 12;
  const n = Math.round(nYears * 12);
  const P = r === 0 ? K / n : K * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
  const now = new Date();
  const start = new Date(startDateStr);
  const t = Math.max(
    0,
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
  );
  const K_t = r === 0
    ? Math.max(0, K - P * t)
    : Math.max(0, K * Math.pow(1 + r, t) - P * (Math.pow(1 + r, t) - 1) / r);
  const monthlyInterest = K_t * r;
  const monthlyAmortization = Math.max(0, P - monthlyInterest);
  return { monthlyPayment: P, remainingCapital: K_t, monthlyAmortization, monthlyInterest, monthsElapsed: t };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getMonthlyEquivalent(expense) {
  const amt = Number(expense.amount) || 0;
  if (expense.frequency === 'trimestral') return amt / 3;
  if (expense.frequency === 'anual') return amt / 12;
  if (expense.frequency === 'custom') return amt / (expense.custom_frequency_months || 1);
  return amt;
}

function semaphore(value, lo, hi) {
  if (value === null || value === undefined) return { color: '#999', bg: '#F5F5F5', label: null };
  if (value < lo) return { color: '#C62828', bg: '#FBE9E7', label: 'Bajo' };
  if (value < hi) return { color: '#F57F17', bg: '#FFF8E1', label: 'Moderado' };
  return { color: '#2E7D32', bg: '#F1F8E9', label: 'Bueno' };
}

function cashflowSem(value) {
  if (value === null || value === undefined) return { color: '#999', bg: '#F5F5F5' };
  return value >= 0
    ? { color: '#2E7D32', bg: '#F1F8E9' }
    : { color: '#C62828', bg: '#FBE9E7' };
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function InfoTooltip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 4 }}>
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onFocus={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onBlur={() => setShow(false)}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 1 }}
        aria-label="Más información"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" stroke="#bbb" strokeWidth="1.2"/>
          <rect x="7.3" y="7" width="1.4" height="5" rx="0.7" fill="#bbb"/>
          <circle cx="8" cy="5" r="0.9" fill="#bbb"/>
        </svg>
      </button>
      {show && (
        <span style={{
          position: 'absolute', left: '50%', bottom: 'calc(100% + 6px)',
          transform: 'translateX(-50%)',
          background: '#333', color: 'white', fontSize: '12px', padding: '7px 10px',
          borderRadius: '8px', width: '200px', zIndex: 200,
          lineHeight: 1.5, pointerEvents: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}>
          {text}
        </span>
      )}
    </span>
  );
}

function SegmentedToggle({ value, onChange, options }) {
  return (
    <div style={{ display: 'flex', background: '#F0F0F0', borderRadius: '10px', padding: '3px', gap: '2px' }}>
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          style={{
            flex: 1, padding: '8px 10px', borderRadius: '8px', border: 'none',
            background: value === opt.value ? 'white' : 'transparent',
            color: value === opt.value ? '#111' : '#888',
            fontSize: '13px', fontWeight: value === opt.value ? 600 : 400,
            cursor: 'pointer', transition: 'all 0.15s',
            boxShadow: value === opt.value ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ToggleSwitch({ value, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      style={{
        width: '42px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
        background: value ? '#111' : '#E0E0E0', position: 'relative', transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: '3px',
        left: value ? '21px' : '3px',
        width: '18px', height: '18px', background: 'white', borderRadius: '50%',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        display: 'block',
      }}/>
    </button>
  );
}

function MetricCard({ label, value, sem, subtitle, fullWidth }) {
  return (
    <div style={{
      background: sem.bg, borderRadius: '14px', padding: '14px 12px', textAlign: 'center',
      ...(fullWidth ? { gridColumn: '1 / -1' } : {}),
    }}>
      <p style={{ margin: '0 0 4px', fontSize: '11px', color: '#888', fontWeight: 500 }}>{label}</p>
      <p style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: sem.color }}>
        {value ?? '—'}
      </p>
      {sem.label && (
        <p style={{ margin: '2px 0 0', fontSize: '11px', fontWeight: 600, color: sem.color }}>{sem.label}</p>
      )}
      {subtitle && <p style={{ margin: '3px 0 0', fontSize: '10px', color: '#aaa' }}>{subtitle}</p>}
    </div>
  );
}

function AddMortgageExpenseModal({ amount, propertyId, landlordEmail, defaultExpensePct, onClose }) {
  const today = new Date().toISOString().split('T')[0];
  const [durationType, setDurationType] = useState('indefinido');
  const [durationPayments, setDurationPayments] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await supabase.from('expenses').insert({
      property_id: String(propertyId),
      landlord_email: landlordEmail,
      name: 'Hipoteca/Préstamo',
      category: 'hipoteca',
      subcategory: null,
      description: '',
      type: durationType === 'pagos' ? 'recurrente_temporal' : 'recurrente_fijo',
      frequency: 'mensual',
      custom_frequency_months: null,
      amount: parseFloat(amount),
      duration_payments: durationType === 'pagos' && durationPayments ? parseInt(durationPayments) : null,
      start_date: startDate,
      active: true,
      expense_percentage: defaultExpensePct != null ? parseFloat(defaultExpensePct) : null,
    });
    setSaving(false);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Añadir hipoteca como gasto</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ background: '#F5F5F5', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px' }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#555' }}>
              Categoría: <strong>Hipoteca/Préstamo</strong>
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#555' }}>
              Importe: <strong>{amount} €/mes</strong>
            </p>
          </div>
          <div className="form-group">
            <label>Duración</label>
            <div className="frequency-options">
              <button
                type="button"
                className={`frequency-option ${durationType === 'indefinido' ? 'selected' : ''}`}
                onClick={() => setDurationType('indefinido')}
              >
                Indefinido
              </button>
              <button
                type="button"
                className={`frequency-option ${durationType === 'pagos' ? 'selected' : ''}`}
                onClick={() => setDurationType('pagos')}
              >
                N.º de pagos
              </button>
            </div>
            {durationType === 'pagos' && (
              <div style={{ marginTop: 10 }}>
                <input
                  type="number" min="1" placeholder="Ej: 360 (30 años)"
                  value={durationPayments}
                  onChange={e => setDurationPayments(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
            )}
          </div>
          <div className="form-group">
            <label>Fecha de inicio</label>
            <input
              type="date" value={startDate}
              onChange={e => setStartDate(e.target.value)}
              required
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
          <button type="submit" className="submit-button" disabled={saving}>
            {saving ? 'Guardando...' : 'Añadir gasto'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function InvestmentForm({ property, expenses = [], onUpdate, landlordEmail, onExpenseAdded }) {
  const {
    investmentData, setInvestmentData, saving, saved, setSaved, historyPayments, save,
  } = useInvestmentData(property);

  const [mortgageOpen, setMortgageOpen] = useState(false);
  const [showMortgagePrompt, setShowMortgagePrompt] = useState(false);
  const [pendingMortgageAmount, setPendingMortgageAmount] = useState(null);
  const [showAddMortgageExpense, setShowAddMortgageExpense] = useState(false);
  const [calcTriggered, setCalcTriggered] = useState(false);
  const [showMortgageChangePrompt, setShowMortgageChangePrompt] = useState(false);
  const [promptCalcAmount, setPromptCalcAmount] = useState(null);

  // ── Derived values ──────────────────────────────────────────────────────────
  const isHerencia = investmentData.acquisitionType === 'herencia_donacion';
  const purchasePrice = parseFloat(investmentData.purchasePrice) || 0;
  const effectiveDownPayment = isHerencia ? 0 : (parseFloat(investmentData.downPayment) || 0);
  const acquisitionCosts = parseFloat(investmentData.acquisitionCosts) || 0;
  const loanCapital = Math.max(0, purchasePrice - effectiveDownPayment);
  const initialInvestment = effectiveDownPayment + acquisitionCosts;

  // Mortgage detection in expenses
  const mortgageExpense = expenses.find(e => e.active !== false && e.category === 'hipoteca');
  const mortgageInExpenses = !!mortgageExpense;
  const detectedMortgageAmount = mortgageExpense ? getMonthlyEquivalent(mortgageExpense) : 0;

  // Mortgage calculation (whenever enabled)
  const mortgageCalc = investmentData.mortgageEnabled
    ? computeMortgage(loanCapital, investmentData.interestRate, investmentData.loanYears, investmentData.loanStartDate)
    : null;

  // Effective monthly mortgage: 0 if already in expenses (already counted in monthlyExpenses)
  const effectiveMortgage = mortgageInExpenses ? 0 : (mortgageCalc ? mortgageCalc.monthlyPayment : 0);

  // Configured income (same logic as gauge)
  const ownership = (property.ownershipPercentage || 100) / 100;
  const monthlyIncome = (() => {
    if (property.status === 'por_habitaciones') {
      return (property.rooms || []).reduce((sum, r) => sum + (Number(r.price) || 0), 0) * ownership;
    }
    if (property.status === 'alquilado' || property.status === 'otros') {
      const tenantsTotal = (property.tenants || []).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      return (tenantsTotal || Number(property.price) || 0) * ownership;
    }
    return 0;
  })();

  // Monthly expenses (normalized, all active)
  const ownershipPct = property.ownershipPercentage || 100;
  const monthlyExpenses = expenses
    .filter(e => e.active !== false)
    .reduce((sum, e) => {
      const pct = e.expense_percentage != null ? e.expense_percentage : ownershipPct;
      return sum + getMonthlyEquivalent(e) * pct / 100;
    }, 0);

  // Cashflow (configured income)
  const cashflowBruto = monthlyIncome - effectiveMortgage;
  const cashflowNeto = monthlyIncome - monthlyExpenses - effectiveMortgage;

  // Historical confirmed income (avg last 6 months)
  const now = new Date();
  const last6 = [];
  let fy = now.getFullYear(), fm = now.getMonth();
  for (let i = 0; i < 6; i++) {
    last6.push({ year: fy, month: fm });
    if (fm === 0) { fm = 11; fy--; } else { fm--; }
  }
  const monthsWithData = last6.filter(({ year, month }) =>
    historyPayments.some(p => p.year === year && p.month === month)
  );
  const avgConfirmedIncome = monthsWithData.length > 0
    ? monthsWithData.reduce((total, { year, month }) =>
        total + historyPayments
          .filter(p => p.year === year && p.month === month)
          .reduce((s, p) => s + (Number(p.amount) || 0), 0)
      , 0) / monthsWithData.length * ownership
    : null;

  const cashflowNetoHistorico = avgConfirmedIncome !== null
    ? avgConfirmedIncome - monthlyExpenses - effectiveMortgage
    : null;

  // Metrics
  const effectiveCashflowNeto = cashflowNetoHistorico ?? cashflowNeto;
  const rentabilidadBruta = purchasePrice > 0 ? (monthlyIncome * 12 / purchasePrice) * 100 : null;
  const roi = initialInvestment > 0
    ? (effectiveCashflowNeto * 12 / initialInvestment) * 100
    : null;
  const payback = initialInvestment > 0 && effectiveCashflowNeto * 12 > 0
    ? initialInvestment / (effectiveCashflowNeto * 12)
    : null;
  const remainingCapital = (mortgageCalc && !mortgageInExpenses)
    ? mortgageCalc.remainingCapital
    : (mortgageInExpenses ? null : loanCapital);
  const equity = purchasePrice > 0 && remainingCapital != null
    ? purchasePrice - remainingCapital
    : null;

  // Semaphores
  const paybackSem = payback === null
    ? { color: '#999', bg: '#F5F5F5', label: null }
    : payback < 12
      ? { color: '#2E7D32', bg: '#F1F8E9', label: 'Corto' }
      : payback < 20
        ? { color: '#F57F17', bg: '#FFF8E1', label: 'Moderado' }
        : { color: '#C62828', bg: '#FBE9E7', label: 'Largo' };

  // ── Shared styles ────────────────────────────────────────────────────────────
  const inputStyle = {
    width: '100%', padding: '12px', borderRadius: '10px',
    border: '1px solid #ddd', fontSize: '15px', background: 'white',
    boxSizing: 'border-box', outline: 'none',
  };
  const labelStyle = {
    display: 'flex', alignItems: 'center',
    fontSize: '13px', fontWeight: 500, color: '#555', marginBottom: '6px',
  };
  const euroSuffix = (
    <span style={{
      position: 'absolute', right: '12px', top: '50%',
      transform: 'translateY(-50%)', color: '#aaa', fontSize: '14px', pointerEvents: 'none',
    }}>€</span>
  );

  const update = (key, value) => {
    setInvestmentData(prev => ({ ...prev, [key]: value }));
    setSaved(false);
    if (['interestRate', 'rateType', 'loanYears', 'loanStartDate', 'purchasePrice', 'downPayment'].includes(key)) {
      setCalcTriggered(false);
      setShowMortgageChangePrompt(false);
    }
  };

  // ── Mortgage calculator button ─────────────────────────────────────────────────
  const handleCalculateMortgage = () => {
    setCalcTriggered(true);
    setShowMortgageChangePrompt(false);
    if (mortgageCalc && mortgageInExpenses) {
      const diff = Math.abs(mortgageCalc.monthlyPayment - detectedMortgageAmount);
      if (diff > 0.5) {
        setPromptCalcAmount(mortgageCalc.monthlyPayment.toFixed(0));
        setShowMortgageChangePrompt(true);
      }
    }
  };

  const handleUpdateMortgageExpense = async () => {
    if (!mortgageExpense || !promptCalcAmount) return;
    await supabase.from('expenses')
      .update({ amount: parseFloat(promptCalcAmount) })
      .eq('id', mortgageExpense.id);
    setShowMortgageChangePrompt(false);
    if (onExpenseAdded) onExpenseAdded();
  };

  // ── Save handler ──────────────────────────────────────────────────────────────
  const handleSave = async () => {
    await save(onUpdate, mortgageCalc);
    const mortgageAmount = mortgageCalc ? mortgageCalc.monthlyPayment : 0;
    if (mortgageAmount > 0 && !mortgageInExpenses && investmentData.mortgageEnabled) {
      setPendingMortgageAmount(mortgageAmount.toFixed(0));
      setShowMortgagePrompt(true);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Tipo de adquisición */}
      <div>
        <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 500, color: '#555' }}>
          Tipo de adquisición
        </p>
        <SegmentedToggle
          value={investmentData.acquisitionType}
          onChange={v => {
            setInvestmentData(prev => ({
              ...prev,
              acquisitionType: v,
              downPayment: v === 'herencia_donacion' ? '0' : prev.downPayment,
            }));
            setSaved(false);
          }}
          options={[
            { value: 'compra', label: 'Compra' },
            { value: 'herencia_donacion', label: 'Herencia / Donación' },
          ]}
        />
      </div>

      {/* Datos de inversión */}
      <div style={{
        background: '#F9F9F9', borderRadius: '16px', padding: '16px',
        display: 'flex', flexDirection: 'column', gap: '14px',
      }}>

        {/* Precio de compra */}
        <div>
          <label style={labelStyle}>
            Precio de compra
            <InfoTooltip text={
              isHerencia
                ? 'Valor de compra o valor de referencia catastral si es herencia/donación.'
                : 'Valor de compra del inmueble.'
            } />
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type="number" min="0" placeholder="Ej: 150000"
              style={{ ...inputStyle, paddingRight: '36px' }}
              value={investmentData.purchasePrice}
              onChange={e => update('purchasePrice', e.target.value)}
            />
            {euroSuffix}
          </div>
        </div>

        {/* Entrada (solo si no es herencia) */}
        {!isHerencia && (
          <div>
            <label style={labelStyle}>
              Entrada
              <InfoTooltip text="Lo que pagaste de tu bolsillo al vendedor. El capital del préstamo se calcula automáticamente: precio − entrada." />
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="number" min="0" placeholder="Ej: 30000"
                style={{ ...inputStyle, paddingRight: '36px' }}
                value={investmentData.downPayment}
                onChange={e => update('downPayment', e.target.value)}
              />
              {euroSuffix}
            </div>
            {loanCapital > 0 && (
              <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#888' }}>
                Capital del préstamo: <strong>{loanCapital.toLocaleString('es-ES')} €</strong>
              </p>
            )}
          </div>
        )}

        {/* Gastos de adquisición */}
        <div>
          <label style={labelStyle}>
            {isHerencia ? 'Gastos de herencia/donación' : 'Gastos de adquisición'}
            <InfoTooltip text={
              isHerencia
                ? 'Impuesto de Sucesiones o Donaciones, notaría, registro.'
                : 'ITP o AJD, notaría, registro, gestoría, tasación. Suele ser un 8–12% del precio.'
            } />
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type="number" min="0" placeholder="Ej: 12000"
              style={{ ...inputStyle, paddingRight: '36px' }}
              value={investmentData.acquisitionCosts}
              onChange={e => update('acquisitionCosts', e.target.value)}
            />
            {euroSuffix}
          </div>
        </div>
      </div>

      {/* Hipoteca (colapsable) */}
      <div style={{ border: '1px solid #eee', borderRadius: '16px', overflow: 'hidden' }}>

        {/* Header del colapsable */}
        <button
          type="button"
          onClick={() => setMortgageOpen(v => !v)}
          style={{
            width: '100%', padding: '14px 16px', background: 'white', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: '#111',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M3 9h18M9 21V9"/>
            </svg>
            Hipoteca
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {mortgageInExpenses && (
              <span style={{
                background: '#E8F5E9', color: '#2E7D32', fontSize: '12px', fontWeight: 600,
                padding: '3px 8px', borderRadius: '6px',
                display: 'flex', alignItems: 'center', gap: '4px',
              }}>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="#2E7D32" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Ya añadida a gastos
              </span>
            )}
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2"
              style={{ transform: mortgageOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
            >
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </span>
        </button>

        {/* Contenido colapsable */}
        {mortgageOpen && (
          <div style={{ padding: '0 16px 16px', background: 'white', display: 'flex', flexDirection: 'column', gap: '14px' }}>

            {/* Toggle activar/desactivar calculadora */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 0', borderTop: '1px solid #f0f0f0',
            }}>
              <span style={{ fontSize: '13px', color: '#555', fontWeight: 500 }}>
                Usar calculadora de hipoteca
              </span>
              <ToggleSwitch
                value={investmentData.mortgageEnabled}
                onChange={v => {
                  update('mortgageEnabled', v);
                  if (!v) { setCalcTriggered(false); setShowMortgageChangePrompt(false); }
                }}
              />
            </div>

            {investmentData.mortgageEnabled && (
              <>
                {/* Si la hipoteca ya está en gastos, mostrar cuota actual */}
                {mortgageInExpenses && (
                  <div style={{
                    background: '#E8F5E9', borderRadius: '12px', padding: '12px 14px',
                    display: 'flex', alignItems: 'center', gap: '10px',
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="#2E7D32" strokeWidth="1.5"/>
                      <path d="M8 12l3 3 5-5" stroke="#2E7D32" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <p style={{ margin: 0, fontSize: '13px', color: '#2E7D32', lineHeight: 1.4 }}>
                      <strong>Cuota actual registrada:</strong> {detectedMortgageAmount.toFixed(0)} €/mes
                    </p>
                  </div>
                )}

                {/* Tipo de interés */}
                <div>
                  <label style={labelStyle}>Tipo de interés (%)</label>
                  <SegmentedToggle
                    value={investmentData.rateType}
                    onChange={v => update('rateType', v)}
                    options={[
                      { value: 'fijo', label: 'Fijo' },
                      { value: 'variable', label: 'Variable' },
                    ]}
                  />
                  <div style={{ position: 'relative', marginTop: '8px' }}>
                    <input
                      type="number" min="0" step="0.01"
                      placeholder={investmentData.rateType === 'variable' ? 'Ej: 3.5 (Euribor + diferencial)' : 'Ej: 2.5'}
                      style={{ ...inputStyle, paddingRight: '36px' }}
                      value={investmentData.interestRate}
                      onChange={e => update('interestRate', e.target.value)}
                    />
                    <span style={{
                      position: 'absolute', right: '12px', top: '50%',
                      transform: 'translateY(-50%)', color: '#aaa', fontSize: '14px', pointerEvents: 'none',
                    }}>%</span>
                  </div>
                  {investmentData.rateType === 'variable' && (
                    <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#F57F17', lineHeight: 1.4 }}>
                      Cálculo aproximado — actualízalo cuando cambie tu cuota.
                    </p>
                  )}
                </div>

                {/* Años totales */}
                <div>
                  <label style={labelStyle}>Años totales</label>
                  <input
                    type="number" min="1" max="40" placeholder="Ej: 25"
                    style={inputStyle}
                    value={investmentData.loanYears}
                    onChange={e => update('loanYears', e.target.value)}
                  />
                </div>

                {/* Fecha de inicio */}
                <div>
                  <label style={labelStyle}>Fecha de inicio</label>
                  <input
                    type="date" style={inputStyle}
                    value={investmentData.loanStartDate}
                    onChange={e => update('loanStartDate', e.target.value)}
                  />
                </div>

                {/* Botón calcular */}
                <button
                  type="button"
                  onClick={handleCalculateMortgage}
                  disabled={!mortgageCalc}
                  style={{
                    padding: '12px', borderRadius: '12px', border: '1px solid #111',
                    background: 'white', color: '#111', fontSize: '14px', fontWeight: 600,
                    cursor: mortgageCalc ? 'pointer' : 'not-allowed',
                    opacity: mortgageCalc ? 1 : 0.4,
                    transition: 'all 0.15s',
                  }}
                >
                  Calcular hipoteca
                </button>

                {/* Resultados tras pulsar calcular */}
                {calcTriggered && mortgageCalc && (
                  <div style={{ background: '#F0F4FF', borderRadius: '12px', padding: '14px' }}>
                    {investmentData.rateType === 'variable' && (
                      <div style={{ background: '#FFF3E0', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px' }}>
                        <p style={{ margin: 0, fontSize: '12px', color: '#E65100', fontWeight: 500 }}>
                          Cálculo aproximado — tipo variable sujeto a revisión periódica
                        </p>
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      {[
                        { label: 'Cuota mensual', value: `${mortgageCalc.monthlyPayment.toFixed(0)} €`, tooltip: null },
                        { label: 'Capital pendiente', value: `${mortgageCalc.remainingCapital.toFixed(0)} €`, tooltip: null },
                        { label: 'Intereses este mes', value: `${mortgageCalc.monthlyInterest.toFixed(0)} €`, tooltip: null },
                        {
                          label: 'Amortización este mes',
                          value: `${mortgageCalc.monthlyAmortization.toFixed(0)} €`,
                          tooltip: 'La parte de la cuota que reduce tu deuda. Al principio es poca, al final es mucha.',
                        },
                      ].map(({ label, value, tooltip }) => (
                        <div key={label} style={{ background: 'white', borderRadius: '10px', padding: '11px', textAlign: 'center' }}>
                          <p style={{
                            margin: '0 0 3px', fontSize: '10px', color: '#888',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px',
                          }}>
                            {label}
                            {tooltip && <InfoTooltip text={tooltip} />}
                          </p>
                          <p style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#3949AB' }}>{value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Prompt: la cuota calculada difiere de la registrada */}
                    {showMortgageChangePrompt && (
                      <div style={{ marginTop: '12px', background: 'white', borderRadius: '10px', padding: '14px' }}>
                        <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#333', lineHeight: 1.5 }}>
                          La calculadora indica <strong>{promptCalcAmount} €/mes</strong>, pero tienes
                          registrado <strong>{detectedMortgageAmount.toFixed(0)} €/mes</strong>. ¿Deseas actualizar la cuota?
                        </p>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={handleUpdateMortgageExpense}
                            style={{
                              flex: 1, padding: '10px', borderRadius: '10px', border: 'none',
                              background: '#111', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                            }}
                          >
                            Sí, actualizar
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowMortgageChangePrompt(false)}
                            style={{
                              padding: '10px 16px', borderRadius: '10px', border: '1px solid #ddd',
                              background: 'white', fontSize: '13px', color: '#666', cursor: 'pointer',
                            }}
                          >
                            No, mantener
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Botón guardar */}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        style={{
          padding: '13px', borderRadius: '12px', border: 'none',
          background: saved ? '#4CAF50' : '#111',
          color: 'white', fontSize: '15px', fontWeight: 600, cursor: 'pointer',
          transition: 'background 0.2s',
        }}
      >
        {saving ? 'Guardando...' : saved ? 'Guardado' : 'Guardar datos de inversión'}
      </button>

      {/* Métricas calculadas */}
      {purchasePrice > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#111' }}>
            Métricas calculadas
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <MetricCard
              label="Cashflow bruto/mes"
              value={`${cashflowBruto >= 0 ? '+' : ''}${cashflowBruto.toFixed(0)} €`}
              sem={cashflowSem(cashflowBruto)}
              subtitle="Ingresos − hipoteca"
            />
            <MetricCard
              label="Cashflow neto/mes"
              value={`${effectiveCashflowNeto >= 0 ? '+' : ''}${effectiveCashflowNeto.toFixed(0)} €`}
              sem={cashflowSem(effectiveCashflowNeto)}
              subtitle={
                cashflowNetoHistorico !== null
                  ? `Promedio ${monthsWithData.length} meses reales`
                  : 'Ingresos − gastos − hipoteca'
              }
            />
            {rentabilidadBruta !== null && (
              <MetricCard
                label="Rentabilidad bruta"
                value={`${rentabilidadBruta.toFixed(1)}%`}
                sem={semaphore(rentabilidadBruta, 4, 7)}
              />
            )}
            {roi !== null && (
              <MetricCard
                label="ROI"
                value={`${roi.toFixed(1)}%`}
                sem={semaphore(roi, 3, 6)}
              />
            )}
            {payback !== null && (
              <MetricCard
                label="Payback"
                value={`${payback.toFixed(1)} años`}
                sem={paybackSem}
                subtitle={`${initialInvestment.toLocaleString('es-ES')} € inv.`}
              />
            )}
            {equity !== null && (
              <MetricCard
                label="Equity"
                value={`${equity >= 0 ? '+' : ''}${equity.toLocaleString('es-ES')} €`}
                sem={{ color: equity >= 0 ? '#2E7D32' : '#C62828', bg: equity >= 0 ? '#F1F8E9' : '#FBE9E7' }}
                subtitle="Precio − deuda pendiente"
                fullWidth={payback === null && rentabilidadBruta === null && roi === null}
              />
            )}
          </div>
          {property.has_vat === true && property.status === 'otros' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="7" stroke="#bbb" strokeWidth="1.2"/>
                <rect x="7.3" y="7" width="1.4" height="5" rx="0.7" fill="#bbb"/>
                <circle cx="8" cy="5" r="0.9" fill="#bbb"/>
              </svg>
              <span style={{ fontSize: 11, color: '#aaa' }}>Ingresos ajustados sin IVA (21%)</span>
            </div>
          )}
        </div>
      )}

      {/* Prompt: añadir hipoteca como gasto */}
      {showMortgagePrompt && (
        <div className="modal-overlay" onClick={() => setShowMortgagePrompt(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Hipoteca como gasto</h2>
              <button className="modal-close" onClick={() => setShowMortgagePrompt(false)}>×</button>
            </div>
            <p style={{ color: '#555', fontSize: '14px', margin: '0 0 20px', lineHeight: 1.5 }}>
              ¿Quieres añadir la hipoteca ({pendingMortgageAmount} €/mes) como gasto recurrente?
              Así aparecerá en el cashflow neto real.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => { setShowMortgagePrompt(false); setShowAddMortgageExpense(true); }}
                style={{
                  flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
                  background: '#111', color: 'white', fontSize: '15px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Sí, añadir
              </button>
              <button
                onClick={() => setShowMortgagePrompt(false)}
                style={{
                  padding: '12px 20px', borderRadius: '10px', border: '1px solid #ddd',
                  background: 'white', fontSize: '15px', color: '#666', cursor: 'pointer',
                }}
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: añadir hipoteca como gasto recurrente */}
      {showAddMortgageExpense && property && (
        <AddMortgageExpenseModal
          amount={pendingMortgageAmount}
          propertyId={property.id}
          landlordEmail={landlordEmail}
          defaultExpensePct={property.ownershipPercentage || 100}
          onClose={() => {
            setShowAddMortgageExpense(false);
            if (onExpenseAdded) onExpenseAdded();
          }}
        />
      )}
    </div>
  );
}
