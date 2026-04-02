import React, { useState } from 'react';

async function exportToExcel({ catData, getSubcats, totalByMonth, yearTotal, year, propertyName, MONTH_NAMES, CATEGORY_LABELS }) {
  const XLSX = await import('xlsx');
  const header = ['Categoría', ...MONTH_NAMES, 'Total'];
  const rows = [header];
  catData.forEach(({ cat, byMonth, total }) => {
    rows.push([CATEGORY_LABELS[cat] || cat, ...byMonth.map(v => v > 0 ? parseFloat(v.toFixed(2)) : ''), parseFloat(total.toFixed(2))]);
    getSubcats(cat).forEach(({ sub, byMonth: sbm, total: st }) => {
      rows.push([`  ${sub}`, ...sbm.map(v => v > 0 ? parseFloat(v.toFixed(2)) : ''), parseFloat(st.toFixed(2))]);
    });
  });
  rows.push(['Total', ...totalByMonth.map(v => v > 0 ? parseFloat(v.toFixed(2)) : ''), parseFloat(yearTotal.toFixed(2))]);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Gastos ${year}`);
  XLSX.writeFile(wb, `gastos_${propertyName || 'propiedad'}_${year}.xlsx`);
}

async function exportToPDF({ catData, getSubcats, totalByMonth, yearTotal, year, propertyName, MONTH_NAMES, CATEGORY_LABELS }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const colW = 54, firstColW = 110, rowH = 16, startX = 20, startY = 50;
  doc.setFontSize(13);
  doc.text(`Gastos ${year}${propertyName ? ` — ${propertyName}` : ''}`, startX, 30);
  doc.setFontSize(8);
  const headers = ['Categoría', ...MONTH_NAMES, 'Total'];
  let x = startX;
  doc.setFont(undefined, 'bold');
  headers.forEach((h, i) => {
    doc.text(h, x + (i === 0 ? 0 : 2), startY);
    x += i === 0 ? firstColW : colW;
  });
  let y = startY + rowH;
  doc.setFont(undefined, 'normal');
  const drawRow = (cells, isBold = false, indent = false) => {
    if (isBold) doc.setFont(undefined, 'bold');
    let cx = startX;
    cells.forEach((c, i) => {
      const label = c !== '' && c != null ? String(c) : '—';
      doc.text(label, cx + (i === 0 ? (indent ? 12 : 0) : 2), y);
      cx += i === 0 ? firstColW : colW;
    });
    if (isBold) doc.setFont(undefined, 'normal');
    y += rowH;
    if (y > 560) { doc.addPage(); y = 30; }
  };
  catData.forEach(({ cat, byMonth, total }) => {
    drawRow([CATEGORY_LABELS[cat] || cat, ...byMonth.map(v => v > 0 ? v.toFixed(0) : ''), total.toFixed(0)]);
    getSubcats(cat).forEach(({ sub, byMonth: sbm, total: st }) => {
      drawRow([sub, ...sbm.map(v => v > 0 ? v.toFixed(0) : ''), st.toFixed(0)], false, true);
    });
  });
  drawRow(['Total', ...totalByMonth.map(v => v > 0 ? v.toFixed(0) : ''), yearTotal.toFixed(0)], true);
  doc.save(`gastos_${propertyName || 'propiedad'}_${year}.pdf`);
}

const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

const CATEGORY_COLORS = {
  comunidad:    '#2196F3',
  suministros:  '#FF9800',
  seguros:      '#9C27B0',
  reparaciones: '#F44336',
  impuestos:    '#607D8B',
  gestion:      '#009688',
  hipoteca:     '#795548',
  otros:        '#9E9E9E',
};

const CATEGORY_LABELS = {
  comunidad:    'Comunidad',
  suministros:  'Suministros',
  seguros:      'Seguros',
  reparaciones: 'Reparaciones',
  impuestos:    'Impuestos',
  gestion:      'Gestión',
  hipoteca:     'Hipoteca/Préstamo',
  otros:        'Otros',
};

// Mapeo de categorías antiguas → nuevas
const REMAP = {
  ibi:          'impuestos',
  seguro:       'seguros',
  amortizacion: 'otros',
  comunidad:    'comunidad', // ya era correcto pero etiqueta diferente
};

function normCat(cat) {
  return REMAP[cat] || cat || 'otros';
}

function getExpensesForMonth(expenses, year, month) {
  return expenses.filter(e => {
    if (e.active === false) return false;
    const start = new Date((e.start_date || e.createdAt) + (e.start_date ? 'T12:00:00' : ''));
    const sy = start.getFullYear(), sm = start.getMonth();
    if (year < sy || (year === sy && month < sm)) return false;
    if (e.type === 'puntual' || e.frequency === 'unico') return year === sy && month === sm;
    if (e.frequency === 'manual') return true;
    const monthsDiff = (year - sy) * 12 + (month - sm);
    const step = e.frequency === 'trimestral' ? 3 : e.frequency === 'anual' ? 12 : e.frequency === 'custom' ? (e.custom_frequency_months || 1) : 1;
    if (monthsDiff % step !== 0) return false;
    if (e.type === 'recurrente_temporal') {
      const idx = monthsDiff / step;
      if (idx >= (e.duration_payments || 0)) return false;
    }
    return true;
  });
}

function expVal(e) {
  const pct = e.expense_percentage != null ? e.expense_percentage : 100;
  return (Number(e.amount) || 0) * pct / 100;
}

function TableContent({ catData, totalByMonth, yearTotal, expanded, toggleExpand, getSubcats }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ borderBottom: '2px solid #eee' }}>
          <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#555', minWidth: 110, position: 'sticky', left: 0, background: 'white' }}>
            Categoría
          </th>
          {MONTH_NAMES.map(mn => (
            <th key={mn} style={{ padding: '10px 5px', textAlign: 'right', fontWeight: 500, color: '#aaa', minWidth: 38 }}>{mn}</th>
          ))}
          <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#555', minWidth: 56 }}>Total</th>
        </tr>
      </thead>
      <tbody>
        {catData.map(({ cat, byMonth, total }) => {
          const isExp = expanded.has(cat);
          const subcats = getSubcats(cat);
          return (
            <React.Fragment key={cat}>
              <tr
                style={{ borderBottom: '1px solid #f5f5f5', cursor: subcats.length ? 'pointer' : 'default', background: isExp ? '#fafafa' : 'white' }}
                onClick={() => subcats.length && toggleExpand(cat)}
              >
                <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', fontWeight: 500, color: '#111', position: 'sticky', left: 0, background: isExp ? '#fafafa' : 'white' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: CATEGORY_COLORS[cat] || '#9E9E9E', flexShrink: 0 }} />
                    {CATEGORY_LABELS[cat] || cat}
                    {subcats.length > 0 && <span style={{ fontSize: 10, color: '#bbb' }}>{isExp ? '▼' : '›'}</span>}
                  </div>
                </td>
                {byMonth.map((v, i) => (
                  <td key={i} style={{ padding: '10px 5px', textAlign: 'right', color: v > 0 ? '#555' : '#ddd' }}>
                    {v > 0 ? v.toFixed(0) : '—'}
                  </td>
                ))}
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#F44336' }}>
                  {total.toFixed(0)} €
                </td>
              </tr>
              {isExp && subcats.map(({ sub, byMonth: sbm, total: st }) => (
                <tr key={sub} style={{ borderBottom: '1px solid #f5f5f5', background: '#fafafa' }}>
                  <td style={{ padding: '8px 12px 8px 28px', color: '#888', fontSize: 11, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#fafafa' }}>
                    {sub}
                  </td>
                  {sbm.map((v, i) => (
                    <td key={i} style={{ padding: '8px 5px', textAlign: 'right', color: v > 0 ? '#999' : '#eee', fontSize: 11 }}>
                      {v > 0 ? v.toFixed(0) : '—'}
                    </td>
                  ))}
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500, color: '#888', fontSize: 11 }}>
                    {st.toFixed(0)} €
                  </td>
                </tr>
              ))}
            </React.Fragment>
          );
        })}
        <tr style={{ borderTop: '2px solid #eee', background: '#f9f9f9' }}>
          <td style={{ padding: '10px 12px', fontWeight: 700, color: '#111', position: 'sticky', left: 0, background: '#f9f9f9' }}>Total</td>
          {totalByMonth.map((v, i) => (
            <td key={i} style={{ padding: '10px 5px', textAlign: 'right', fontWeight: 600, color: v > 0 ? '#F44336' : '#ddd' }}>
              {v > 0 ? v.toFixed(0) : '—'}
            </td>
          ))}
          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#F44336' }}>
            {yearTotal.toFixed(0)} €
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export default function ExpenseSummary({ expenses, onBack, propertyName, getMonthlyIncome }) {
  const now = new Date();
  const minYear = expenses.length > 0
    ? Math.min(...expenses.map(e => {
        const d = e.start_date || e.createdAt || '';
        return new Date(d.includes('T') ? d : d + 'T12:00:00').getFullYear();
      }))
    : now.getFullYear();

  const [year, setYear] = useState(now.getFullYear());
  const [expanded, setExpanded] = useState(new Set());
  const [tableFullscreen, setTableFullscreen] = useState(false);

  const months = Array.from({ length: 12 }, (_, m) => m);
  const isPastOrCurrent = (m) =>
    year < now.getFullYear() || (year === now.getFullYear() && m <= now.getMonth());

  // Gastos activos de cada mes (solo meses pasados/actual)
  const monthExpenses = months.map(m => isPastOrCurrent(m) ? getExpensesForMonth(expenses, year, m) : []);
  const totalByMonth = monthExpenses.map(exps => exps.reduce((s, e) => s + expVal(e), 0));
  const yearTotal = totalByMonth.reduce((s, v) => s + v, 0);
  const monthAvg = yearTotal / (now.getMonth() + 1 < 12 && year === now.getFullYear() ? now.getMonth() + 1 : 12);

  // Ingresos opcionales (solo meses pasados/actual)
  const incomeByMonth = getMonthlyIncome
    ? months.map(m => isPastOrCurrent(m) ? getMonthlyIncome(year, m) : 0)
    : null;
  const yearIncome = incomeByMonth ? incomeByMonth.reduce((s, v) => s + v, 0) : null;
  const yearNet = yearIncome !== null ? yearIncome - yearTotal : null;

  // Categorías con datos este año
  const catKeys = Object.keys(CATEGORY_LABELS);
  const catData = catKeys.map(cat => {
    const byMonth = months.map((_, i) =>
      monthExpenses[i]
        .filter(e => normCat(e.category) === cat)
        .reduce((s, e) => s + expVal(e), 0)
    );
    return { cat, byMonth, total: byMonth.reduce((s, v) => s + v, 0) };
  }).filter(d => d.total > 0);

  // Subcategorías para una categoría
  const getSubcats = (cat) => {
    const subs = [...new Set(
      expenses
        .filter(e => normCat(e.category) === cat && e.subcategory)
        .map(e => e.subcategory)
    )];
    return subs.map(sub => {
      const byMonth = months.map((_, i) =>
        monthExpenses[i]
          .filter(e => normCat(e.category) === cat && e.subcategory === sub)
          .reduce((s, e) => s + expVal(e), 0)
      );
      return { sub, byMonth, total: byMonth.reduce((s, v) => s + v, 0) };
    }).filter(d => d.total > 0);
  };

  // Gráfico de barras
  const CHART_H = 120, BAR_W = 18, GAP = 6;
  const maxBar = Math.max(...totalByMonth, 0.01);

  const toggleExpand = (cat) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  return (
    <div className="property-detail-container">
      {/* Header */}
      <div className="detail-header">
        <button className="back-button" onClick={onBack}>←</button>
        <h1 className="detail-title">Resumen de gastos</h1>
      </div>

      {/* Selector de año */}
      <div className="month-navigator">
        <button className="month-nav-btn" onClick={() => setYear(y => y - 1)} disabled={year <= minYear}>‹</button>
        <span className="month-label">{year}</span>
        <button className="month-nav-btn" onClick={() => setYear(y => y + 1)} disabled={year >= now.getFullYear()}>›</button>
      </div>

      {/* 3 métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, padding: '0 16px 16px' }}>
        {[
          { label: 'Total anual',    value: yearTotal > 0 ? `-${yearTotal.toFixed(0)} €`   : '—',  color: '#F44336' },
          { label: 'Media mensual',  value: monthAvg > 0  ? `-${monthAvg.toFixed(0)} €/mes` : '—', color: '#FF9800' },
          {
            label: 'Neto',
            value: yearNet !== null ? `${yearNet >= 0 ? '+' : ''}${yearNet.toFixed(0)} €` : '—',
            color: yearNet !== null ? (yearNet >= 0 ? '#4CAF50' : '#F44336') : '#aaa',
          },
        ].map(m => (
          <div key={m.label} style={{ background: '#f9f9f9', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#aaa', marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: m.color, wordBreak: 'break-word' }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Gráfico */}
      {catData.length > 0 && (
        <div className="info-card">
          <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600 }}>Gastos por mes</h3>
          <div style={{ overflowX: 'auto' }}>
            <svg
              width={months.length * (BAR_W + GAP) + 20}
              height={CHART_H + 28}
              style={{ display: 'block' }}
            >
              {months.map((m, i) => {
                const x = 10 + i * (BAR_W + GAP);
                let yOff = CHART_H;
                return (
                  <g key={m}>
                    {catData.map(({ cat, byMonth }) => {
                      const val = byMonth[i];
                      if (!val) return null;
                      const h = (val / maxBar) * CHART_H;
                      yOff -= h;
                      const y = yOff;
                      return (
                        <rect key={cat} x={x} y={y} width={BAR_W} height={h}
                          fill={CATEGORY_COLORS[cat] || '#9E9E9E'} rx={2} />
                      );
                    })}
                    <text x={x + BAR_W / 2} y={CHART_H + 18} textAnchor="middle" fontSize={9} fill="#aaa">
                      {MONTH_NAMES[m]}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          {/* Leyenda */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 10 }}>
            {catData.map(({ cat }) => (
              <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#555' }}>
                <div style={{ width: 9, height: 9, borderRadius: 2, background: CATEGORY_COLORS[cat] || '#9E9E9E', flexShrink: 0 }} />
                {CATEGORY_LABELS[cat] || cat}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabla */}
      {tableFullscreen && (
        <div style={{ position: 'fixed', inset: 0, background: 'white', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #eee' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Tabla de gastos {year}</span>
            <button onClick={() => setTableFullscreen(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#555', lineHeight: 1 }}>✕</button>
          </div>
          <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>
            <TableContent catData={catData} totalByMonth={totalByMonth} yearTotal={yearTotal} expanded={expanded} toggleExpand={toggleExpand} getSubcats={getSubcats} />
          </div>
        </div>
      )}
      <div className="info-card" style={{ padding: 0, overflowX: 'auto' }}>
        {catData.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#aaa', padding: 24, fontSize: 13 }}>Sin gastos en {year}</p>
        ) : (
          <>
          <div style={{ display: 'flex', gap: 8, padding: '10px 12px 0', justifyContent: 'flex-end' }}>
            <button onClick={() => setTableFullscreen(true)} style={{ background: 'none', border: '1px solid #ddd', borderRadius: 8, padding: '5px 10px', fontSize: 11, cursor: 'pointer', color: '#555', display: 'flex', alignItems: 'center', gap: 4 }}>
              ⤢ Pantalla completa
            </button>
            <button onClick={() => exportToExcel({ catData, getSubcats, totalByMonth, yearTotal, year, propertyName, MONTH_NAMES, CATEGORY_LABELS })} style={{ background: 'none', border: '1px solid #ddd', borderRadius: 8, padding: '5px 10px', fontSize: 11, cursor: 'pointer', color: '#555', display: 'flex', alignItems: 'center', gap: 4 }}>
              ↓ Excel
            </button>
            <button onClick={() => exportToPDF({ catData, getSubcats, totalByMonth, yearTotal, year, propertyName, MONTH_NAMES, CATEGORY_LABELS })} style={{ background: 'none', border: '1px solid #ddd', borderRadius: 8, padding: '5px 10px', fontSize: 11, cursor: 'pointer', color: '#555', display: 'flex', alignItems: 'center', gap: 4 }}>
              ↓ PDF
            </button>
          </div>
          <TableContent catData={catData} totalByMonth={totalByMonth} yearTotal={yearTotal} expanded={expanded} toggleExpand={toggleExpand} getSubcats={getSubcats} />
          </>
        )}
      </div>
    </div>
  );
}
