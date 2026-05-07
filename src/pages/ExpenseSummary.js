import React, { useState } from 'react';

// Devuelve los pagos individuales del año ordenados por fecha, solo los ya pagados (≤ hoy)
function buildPaymentRows(expenses, year, CATEGORY_LABELS) {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const payments = [];
  for (let m = 0; m < 12; m++) {
    getExpensesForMonth(expenses, year, m).forEach(e => {
      const startStr = e.start_date || e.createdAt || '';
      const start = new Date(startStr.includes('T') ? startStr : startStr + 'T12:00:00');
      const day = start.getDate();
      const lastDay = new Date(year, m + 1, 0).getDate();
      const d = Math.min(day, lastDay);
      const paymentDate = new Date(year, m, d);
      if (paymentDate > today) return; // omitir pagos futuros
      payments.push({
        sortKey: year * 10000 + (m + 1) * 100 + d,
        dateStr: `${String(d).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${year}`,
        cat: CATEGORY_LABELS[normCat(e.category)] || e.category || '',
        sub: e.subcategory || '',
        desc: e.description || e.name || '',
        amount: parseFloat(expVal(e).toFixed(2)),
      });
    });
  }
  payments.sort((a, b) => a.sortKey - b.sortKey);
  return payments;
}

async function exportToExcel({ catData, getSubcats, totalByMonth, yearTotal, year, propertyName, MONTH_NAMES, CATEGORY_LABELS, expenses }) {
  const ExcelJSMod = await import('exceljs');
  const ExcelJS = ExcelJSMod.default || ExcelJSMod;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Domio';
  const euro = '#,##0.00 "€"';
  const mkFill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const NC = MONTH_NAMES.length + 2; // Categoría + 12 meses + Total

  // ── HOJA 1: RESUMEN POR CATEGORÍA ──
  const ws1 = wb.addWorksheet(`Resumen ${year}`, { views: [{ showGridLines: false }] });

  // Título
  const tRow = ws1.addRow([`GASTOS ${year}${propertyName ? ` — ${propertyName}` : ''}`]); tRow.height = 30;
  ws1.mergeCells(1, 1, 1, NC);
  tRow.getCell(1).fill = mkFill('FF111111');
  tRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 13 };
  tRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

  const dRow = ws1.addRow([`Exportado el ${new Date().toLocaleDateString('es-ES')}`]); dRow.height = 17;
  ws1.mergeCells(2, 1, 2, NC);
  dRow.getCell(1).fill = mkFill('FF111111');
  dRow.getCell(1).font = { size: 8, italic: true, color: { argb: 'FFAAAAAA' } };
  dRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

  ws1.addRow([]).height = 6;

  // Cabecera de columnas (Categoría + meses + Total)
  const hRow = ws1.addRow(['Categoría', ...MONTH_NAMES, 'Total']); hRow.height = 22;
  hRow.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.fill = mkFill('FF2C2C2C');
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
    cell.alignment = { horizontal: col === 1 ? 'left' : 'center', vertical: 'middle' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF444444' } } };
  });

  // Filas de categorías y subcategorías
  catData.forEach(({ cat, byMonth, total }, catIdx) => {
    const catBg = catIdx % 2 === 0 ? 'FFF7F7F7' : 'FFFFFFFF';
    const catRow = ws1.addRow([CATEGORY_LABELS[cat] || cat, ...byMonth.map(v => v > 0 ? parseFloat(v.toFixed(2)) : null), parseFloat(total.toFixed(2))]);
    catRow.height = 20;
    catRow.getCell(1).fill = mkFill(catBg);
    catRow.getCell(1).font = { bold: true, color: { argb: 'FF222222' } };
    catRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    for (let c = 2; c <= NC; c++) {
      const cell = catRow.getCell(c);
      cell.fill = mkFill(catBg);
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFEEEEEE' } } };
      if (cell.value) {
        cell.numFmt = euro;
        cell.font = { color: { argb: c === NC ? 'FFC62828' : 'FF555555' }, bold: c === NC };
      } else {
        cell.value = null;
        cell.font = { color: { argb: 'FFDDDDDD' } };
        cell.value = '—';
      }
    }

    // Subcategorías
    getSubcats(cat).forEach(({ sub, byMonth: sbm, total: st }) => {
      const subRow = ws1.addRow([`    ${sub}`, ...sbm.map(v => v > 0 ? parseFloat(v.toFixed(2)) : null), parseFloat(st.toFixed(2))]);
      subRow.height = 17;
      subRow.getCell(1).fill = mkFill('FFFAFAFA');
      subRow.getCell(1).font = { color: { argb: 'FF666666' }, size: 8, italic: true };
      subRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
      for (let c = 2; c <= NC; c++) {
        const cell = subRow.getCell(c);
        cell.fill = mkFill('FFFAFAFA');
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFF5F5F5' } } };
        if (cell.value) {
          cell.numFmt = euro;
          cell.font = { color: { argb: c === NC ? 'FFAA2222' : 'FF888888' }, size: 8 };
        } else {
          cell.value = null;
        }
      }
    });
  });

  // Fila total
  const totRow = ws1.addRow(['TOTAL', ...totalByMonth.map(v => v > 0 ? parseFloat(v.toFixed(2)) : null), parseFloat(yearTotal.toFixed(2))]);
  totRow.height = 24;
  totRow.getCell(1).fill = mkFill('FF111111');
  totRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  totRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
  totRow.getCell(1).border = { top: { style: 'medium', color: { argb: 'FF000000' } } };
  for (let c = 2; c <= NC; c++) {
    const cell = totRow.getCell(c);
    cell.fill = mkFill('FF111111');
    cell.alignment = { horizontal: 'right', vertical: 'middle' };
    cell.border = { top: { style: 'medium', color: { argb: 'FF000000' } } };
    if (cell.value) {
      cell.numFmt = euro;
      cell.font = { bold: true, color: { argb: c === NC ? 'FFFF8080' : 'FFDDDDDD' } };
    } else {
      cell.value = null;
      cell.font = { color: { argb: 'FF333333' } };
    }
  }

  // Anchos de columna
  ws1.getColumn(1).width = 28;
  MONTH_NAMES.forEach((_, i) => { ws1.getColumn(i + 2).width = 10; });
  ws1.getColumn(NC).width = 12;

  // ── HOJA 2: DETALLE CRONOLÓGICO ──
  const ws2 = wb.addWorksheet(`Detalle ${year}`, { views: [{ showGridLines: false }] });
  const NC2 = 5;

  const t2Row = ws2.addRow([`DETALLE DE GASTOS ${year}${propertyName ? ` — ${propertyName}` : ''}`]); t2Row.height = 30;
  ws2.mergeCells(1, 1, 1, NC2);
  t2Row.getCell(1).fill = mkFill('FF111111');
  t2Row.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 13 };
  t2Row.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

  ws2.addRow([]).height = 6;

  const h2Row = ws2.addRow(['Fecha', 'Categoría', 'Subcategoría', 'Descripción', 'Importe']); h2Row.height = 20;
  h2Row.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.fill = mkFill('FFF0F0F0');
    cell.font = { bold: true, color: { argb: 'FF555555' }, size: 9 };
    cell.alignment = { horizontal: col >= 5 ? 'right' : (col === 1 ? 'center' : 'left'), vertical: 'middle' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
  });

  buildPaymentRows(expenses, year, CATEGORY_LABELS).forEach((p, idx) => {
    const bg = mkFill(idx % 2 === 0 ? 'FFFFFFFF' : 'FFFBE9E7');
    const r = ws2.addRow([p.dateStr, p.cat, p.sub || '—', p.desc || '—', p.amount]);
    r.height = 18;
    for (let c = 1; c <= NC2; c++) {
      r.getCell(c).fill = bg;
      r.getCell(c).alignment = { horizontal: c >= 5 ? 'right' : (c === 1 ? 'center' : 'left'), vertical: 'middle' };
      r.getCell(c).border = { bottom: { style: 'thin', color: { argb: 'FFF5F5F5' } } };
    }
    r.getCell(2).font = { color: { argb: 'FF555555' }, size: 9 };
    r.getCell(3).font = { color: { argb: 'FF888888' }, size: 8, italic: true };
    r.getCell(5).font = { bold: true, color: { argb: 'FFC62828' } };
    r.getCell(5).numFmt = euro;
  });

  ws2.addRow([]).height = 6;
  const totalPayments = buildPaymentRows(expenses, year, CATEGORY_LABELS).reduce((s, p) => s + p.amount, 0);
  const totR2 = ws2.addRow(['', 'TOTAL', '', '', totalPayments]); totR2.height = 24;
  ws2.mergeCells(ws2.rowCount, 2, ws2.rowCount, 4);
  for (let c = 1; c <= NC2; c++) {
    totR2.getCell(c).fill = mkFill('FF111111');
    totR2.getCell(c).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    totR2.getCell(c).alignment = { horizontal: c === 5 ? 'right' : 'center', vertical: 'middle' };
  }
  totR2.getCell(5).font = { bold: true, size: 12, color: { argb: 'FFFF8080' } };
  totR2.getCell(5).numFmt = euro;

  ws2.getColumn(1).width = 12;
  ws2.getColumn(2).width = 26;
  ws2.getColumn(3).width = 18;
  ws2.getColumn(4).width = 34;
  ws2.getColumn(5).width = 14;

  // Guardar
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `gastos_${propertyName || 'propiedad'}_${year}.xlsx`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function exportToPDF({ catData, getSubcats, totalByMonth, yearTotal, year, propertyName, MONTH_NAMES, CATEGORY_LABELS, expenses }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const colW = 54, firstColW = 110, rowH = 16, startX = 20, startY = 50;

  // ── Página 1: Resumen por categoría y mes ──────────────────────────────────
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

  // ── Página 2: Detalle con fecha exacta de cada pago ────────────────────────
  doc.addPage();
  doc.setFontSize(13);
  doc.text(`Detalle de pagos ${year}${propertyName ? ` — ${propertyName}` : ''}`, startX, 30);
  doc.setFontSize(8);

  const detailCols = [
    { label: 'Fecha',         w: 62 },
    { label: 'Categoría',     w: 90 },
    { label: 'Subcategoría',  w: 80 },
    { label: 'Descripción',   w: 190 },
    { label: 'Importe (€)',   w: 65 },
  ];
  let dy = startY;
  doc.setFont(undefined, 'bold');
  let dx = startX;
  detailCols.forEach(col => { doc.text(col.label, dx, dy); dx += col.w; });
  dy += rowH;
  doc.setFont(undefined, 'normal');

  buildPaymentRows(expenses, year, CATEGORY_LABELS).forEach(p => {
    if (dy > 560) { doc.addPage(); dy = 30; }
    dx = startX;
    [p.dateStr, p.cat, p.sub, p.desc, `${p.amount} €`].forEach((cell, i) => {
      doc.text(String(cell || '—'), dx, dy);
      dx += detailCols[i].w;
    });
    dy += rowH;
  });

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

// Total real que un gasto aporta durante el año completo (suma de todos sus pagos)
function expenseYearContribution(e, year) {
  let total = 0;
  for (let m = 0; m < 12; m++) {
    if (getExpensesForMonth([e], year, m).length > 0) total += expVal(e);
  }
  return total;
}

// Valor mensual prorrateado: redistribuye el total anual real en los 12 meses.
// Los gastos únicos/puntuales permanecen en su mes original.
function proratedExpenseMonthValue(e, year, month) {
  if (e.type === 'puntual' || e.frequency === 'unico') {
    return getExpensesForMonth([e], year, month).length > 0 ? expVal(e) : 0;
  }
  return expenseYearContribution(e, year) / 12;
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
  const [prorated, setProrated] = useState(false);

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

  // Subcategorías para una categoría (modo real)
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

  // ── Datos prorrateados ──────────────────────────────────────────────────────
  // Se muestran los 12 meses (sin filtro isPastOrCurrent) para que el total
  // anual coincida con el modo Real y la distribución sea uniforme.
  const proratedCatData = Object.keys(CATEGORY_LABELS).map(cat => {
    const byMonth = months.map((m) =>
      expenses
        .filter(e => e.active !== false && normCat(e.category) === cat)
        .reduce((s, e) => s + proratedExpenseMonthValue(e, year, m), 0)
    );
    return { cat, byMonth, total: byMonth.reduce((s, v) => s + v, 0) };
  }).filter(d => d.total > 0);

  const proratedTotalByMonth = months.map((m) =>
    expenses
      .filter(e => e.active !== false)
      .reduce((s, e) => s + proratedExpenseMonthValue(e, year, m), 0)
  );
  const proratedYearTotal = proratedTotalByMonth.reduce((s, v) => s + v, 0);
  const proratedMonthAvg = proratedYearTotal / 12;

  const getProratedSubcats = (cat) => {
    const subs = [...new Set(
      expenses.filter(e => normCat(e.category) === cat && e.subcategory).map(e => e.subcategory)
    )];
    return subs.map(sub => {
      const byMonth = months.map((m) =>
        expenses
          .filter(e => e.active !== false && normCat(e.category) === cat && e.subcategory === sub)
          .reduce((s, e) => s + proratedExpenseMonthValue(e, year, m), 0)
      );
      return { sub, byMonth, total: byMonth.reduce((s, v) => s + v, 0) };
    }).filter(d => d.total > 0);
  };

  // Datos activos según el modo seleccionado
  const activeCatData      = prorated ? proratedCatData      : catData;
  const activeTotalByMonth = prorated ? proratedTotalByMonth : totalByMonth;
  const activeYearTotal    = prorated ? proratedYearTotal    : yearTotal;
  const activeMonthAvg     = prorated ? proratedMonthAvg     : monthAvg;
  const activeGetSubcats   = prorated ? getProratedSubcats   : getSubcats;

  // Gráfico de barras
  const CHART_H = 120, BAR_W = 18, GAP = 6;
  const maxBar = Math.max(...activeTotalByMonth, 0.01);

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
          { label: 'Total anual',    value: activeYearTotal > 0 ? `-${activeYearTotal.toFixed(0)} €`   : '—',  color: '#F44336' },
          { label: 'Media mensual',  value: activeMonthAvg > 0  ? `-${activeMonthAvg.toFixed(0)} €/mes` : '—', color: '#FF9800' },
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
      {activeCatData.length > 0 && (
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
                    {activeCatData.map(({ cat, byMonth }) => {
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
            {activeCatData.map(({ cat }) => (
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
            <TableContent catData={activeCatData} totalByMonth={activeTotalByMonth} yearTotal={activeYearTotal} expanded={expanded} toggleExpand={toggleExpand} getSubcats={activeGetSubcats} />
          </div>
        </div>
      )}
      <div className="info-card" style={{ padding: 0, overflowX: 'auto' }}>
        {activeCatData.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#aaa', padding: 24, fontSize: 13 }}>Sin gastos en {year}</p>
        ) : (
          <>
          <div style={{ display: 'flex', gap: 8, padding: '10px 12px 0', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            {/* Toggle Prorrateado / Real */}
            <div style={{ display: 'flex', background: '#f0f0f0', borderRadius: 8, padding: 2, gap: 2 }}>
              {[{ label: 'Real', value: false }, { label: 'Prorrateado', value: true }].map(opt => (
                <button
                  key={opt.label}
                  onClick={() => setProrated(opt.value)}
                  style={{
                    background: prorated === opt.value ? 'white' : 'transparent',
                    border: 'none',
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontSize: 11,
                    fontWeight: prorated === opt.value ? 600 : 400,
                    color: prorated === opt.value ? '#333' : '#888',
                    cursor: 'pointer',
                    boxShadow: prorated === opt.value ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setTableFullscreen(true)} style={{ background: 'none', border: '1px solid #ddd', borderRadius: 8, padding: '5px 10px', fontSize: 11, cursor: 'pointer', color: '#555', display: 'flex', alignItems: 'center', gap: 4 }}>
                ⤢ Pantalla completa
              </button>
              <button onClick={() => exportToExcel({ catData: activeCatData, getSubcats: activeGetSubcats, totalByMonth: activeTotalByMonth, yearTotal: activeYearTotal, year, propertyName, MONTH_NAMES, CATEGORY_LABELS, expenses })} style={{ background: 'none', border: '1px solid #ddd', borderRadius: 8, padding: '5px 10px', fontSize: 11, cursor: 'pointer', color: '#555', display: 'flex', alignItems: 'center', gap: 4 }}>
                ↓ Excel
              </button>
              <button onClick={() => exportToPDF({ catData: activeCatData, getSubcats: activeGetSubcats, totalByMonth: activeTotalByMonth, yearTotal: activeYearTotal, year, propertyName, MONTH_NAMES, CATEGORY_LABELS, expenses })} style={{ background: 'none', border: '1px solid #ddd', borderRadius: 8, padding: '5px 10px', fontSize: 11, cursor: 'pointer', color: '#555', display: 'flex', alignItems: 'center', gap: 4 }}>
                ↓ PDF
              </button>
            </div>
          </div>
          <TableContent catData={activeCatData} totalByMonth={activeTotalByMonth} yearTotal={activeYearTotal} expanded={expanded} toggleExpand={toggleExpand} getSubcats={activeGetSubcats} />
          </>
        )}
      </div>
    </div>
  );
}
