import React, { useState, useEffect } from 'react';
import './PropertyDetail.css';
import { supabase } from '../supabaseClient';
import ExpenseSummary from './ExpenseSummary';
import MonthNavigator from '../components/MonthNavigator';

function isFutureMonth(year, month) {
  const now = new Date();
  return year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth());
}

function formatMonthYear(year, month) {
  const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return `${monthNames[month]} de ${year}`;
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay(); // 0=domingo
}

function getExpensesForMonth(expenses, year, month) {
  return expenses.filter(e => {
    const start = new Date((e.start_date || e.createdAt) + (e.start_date ? 'T12:00:00' : ''));
    const sy = start.getFullYear(), sm = start.getMonth();
    if (year < sy || (year === sy && month < sm)) return false;
    if (e.type === 'puntual' || e.frequency === 'unico') return year === sy && month === sm;
    if (e.frequency === 'manual') return true;
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

function getMonthlyEquivalent(expense) {
  const amt = Number(expense.amount) || 0;
  if (expense.frequency === 'trimestral') return amt / 3;
  if (expense.frequency === 'anual') return amt / 12;
  if (expense.frequency === 'custom') return amt / (expense.custom_frequency_months || 1);
  return amt;
}

async function exportVacationalToExcel(name, historyMonths, accumulated) {
  const ExcelJSMod = await import('exceljs');
  const ExcelJS = ExcelJSMod.default || ExcelJSMod;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Historial', { views: [{ showGridLines: false }] });
  const euro = '#,##0.00 "€"';
  const mkFill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

  const tRow = ws.addRow([`HISTORIAL VACACIONAL — ${name}`]); tRow.height = 30;
  ws.mergeCells(1, 1, 1, 5);
  tRow.getCell(1).fill = mkFill('FF111111');
  tRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 13 };
  tRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

  const dRow = ws.addRow([`Exportado el ${new Date().toLocaleDateString('es-ES')}`]); dRow.height = 17;
  ws.mergeCells(2, 1, 2, 5);
  dRow.getCell(1).fill = mkFill('FF111111');
  dRow.getCell(1).font = { size: 8, italic: true, color: { argb: 'FFAAAAAA' } };
  dRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

  ws.addRow([]).height = 6;

  const hRow = ws.addRow(['Mes', 'Reservas', 'Ingresos', 'Gastos', 'Neto']); hRow.height = 20;
  hRow.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.fill = mkFill('FFF0F0F0');
    cell.font = { bold: true, color: { argb: 'FF555555' }, size: 9 };
    cell.alignment = { horizontal: col === 1 ? 'left' : 'center', vertical: 'middle' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
  });

  historyMonths.forEach((item, idx) => {
    const net = item.net;
    const bg = mkFill(idx % 2 === 0 ? 'FFFFFFFF' : 'FFF9F9F9');
    const bdr = { bottom: { style: 'thin', color: { argb: 'FFF0F0F0' } } };
    const r = ws.addRow([formatMonthYear(item.year, item.month), item.bookings, item.income, -item.expenses, net]);
    r.height = 20;
    for (let c = 1; c <= 5; c++) {
      r.getCell(c).fill = bg;
      r.getCell(c).alignment = { horizontal: c >= 3 ? 'right' : (c === 2 ? 'center' : 'left'), vertical: 'middle' };
      r.getCell(c).border = bdr;
    }
    r.getCell(2).font = { color: { argb: item.bookings > 0 ? 'FF1565C0' : 'FF999999' }, bold: item.bookings > 0 };
    r.getCell(3).font = { color: { argb: 'FF2E7D32' } }; r.getCell(3).numFmt = euro;
    r.getCell(4).font = { color: { argb: 'FFC62828' } }; r.getCell(4).numFmt = euro;
    r.getCell(5).font = { bold: true, color: { argb: net >= 0 ? 'FF2E7D32' : 'FFC62828' } }; r.getCell(5).numFmt = euro;
  });

  ws.addRow([]).height = 6;
  const accRowNum = ws.rowCount + 1;
  const accRow = ws.addRow(['', 'Ganancia acumulada', '', '', accumulated]); accRow.height = 26;
  ws.mergeCells(accRowNum, 2, accRowNum, 4);
  for (let c = 1; c <= 5; c++) {
    accRow.getCell(c).fill = mkFill('FF111111');
    accRow.getCell(c).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    accRow.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' };
  }
  accRow.getCell(5).font = { bold: true, size: 12, color: { argb: accumulated >= 0 ? 'FF90EE90' : 'FFFF8080' } };
  accRow.getCell(5).numFmt = euro;
  accRow.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };

  [20, 10, 14, 14, 14].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `historial_${name.replace(/\s+/g, '_')}.xlsx`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportVacationalToPDF(name, historyMonths, accumulated) {
  import('jspdf').then(({ jsPDF }) => {
    const doc = new jsPDF();
    doc.setFontSize(18); doc.setFont('helvetica', 'bold');
    doc.text(`Historial — ${name}`, 14, 20);
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(150);
    doc.text(`Exportado el ${new Date().toLocaleDateString('es-ES')}`, 14, 28);
    const headers = ['MES', 'RESERVAS', 'INGRESOS', 'GASTOS', 'NETO'];
    const colX = [14, 70, 105, 140, 170];
    let y = 42;
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(150);
    headers.forEach((h, i) => doc.text(h, colX[i], y));
    doc.setDrawColor(220); doc.line(14, y + 3, 196, y + 3); y += 12;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    historyMonths.forEach(item => {
      doc.setTextColor(50); doc.text(formatMonthYear(item.year, item.month), colX[0], y);
      doc.text(`${item.bookings}`, colX[1], y);
      doc.setTextColor(76, 175, 80); doc.text(`+${item.income.toFixed(0)} €`, colX[2], y);
      doc.setTextColor(244, 67, 54); doc.text(`-${item.expenses.toFixed(0)} €`, colX[3], y);
      item.net >= 0 ? doc.setTextColor(76, 175, 80) : doc.setTextColor(244, 67, 54);
      doc.text(`${item.net >= 0 ? '+' : ''}${item.net.toFixed(0)} €`, colX[4], y);
      doc.setDrawColor(240); doc.line(14, y + 3, 196, y + 3); y += 10;
    });
    y += 4; doc.setDrawColor(50); doc.line(14, y, 196, y); y += 8;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(50);
    doc.text('Ganancia neta acumulada', colX[0], y);
    accumulated >= 0 ? doc.setTextColor(76, 175, 80) : doc.setTextColor(244, 67, 54);
    doc.text(`${accumulated >= 0 ? '+' : ''}${accumulated.toFixed(0)} €`, colX[4], y);
    doc.save(`historial_${name.replace(/\s+/g, '_')}.pdf`);
  });
}

// ─────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────
function VacationalDetail({ property, onBack, onUpdate, landlordEmail, readOnly = false }) { // eslint-disable-line no-unused-vars
  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [expenses, setExpenses] = useState([]);
  const [bookings, setBookings] = useState(property.bookings || []);
  const [investmentData, setInvestmentData] = useState({
    purchasePrice: '',
    acquisitionCosts: '',
    ownershipPercentage: '',
    monthlyMortgage: '',
    monthlyAmortization: '',
  });
  const [showInvestmentSection, setShowInvestmentSection] = useState(false);
  const [investmentEditing, setInvestmentEditing] = useState(false);
  const [investmentSaving, setInvestmentSaving] = useState(false);
  const [roiPayments, setRoiPayments] = useState([]);

  React.useEffect(() => { setBookings(property.bookings || []); }, [property.bookings]);

  useEffect(() => {
    supabase
      .from('expenses')
      .select('*')
      .eq('property_id', String(property.id))
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setExpenses(data); });
  }, [property.id]);

  useEffect(() => {
    if (property.investmentData) {
      setInvestmentData({
        purchasePrice: property.investmentData.purchasePrice ?? '',
        acquisitionCosts: property.investmentData.acquisitionCosts ?? '',
        ownershipPercentage: property.investmentData.ownershipPercentage ?? '',
        monthlyMortgage: property.investmentData.monthlyMortgage ?? '',
        monthlyAmortization: property.investmentData.monthlyAmortization ?? '',
      });
    }
  }, [property.id]); // eslint-disable-line

  useEffect(() => {
    supabase
      .from('payments')
      .select('year, month, amount, status')
      .eq('property_id', String(property.id))
      .eq('status', 'confirmed')
      .then(({ data }) => { if (data) setRoiPayments(data); });
  }, [property.id]);
  const [showAddBooking, setShowAddBooking] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showExpenseSummary, setShowExpenseSummary] = useState(false);
  const [showExpenses, setShowExpenses] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editingBooking, setEditingBooking] = useState(null);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const optionsMenuRef = React.useRef(null);
  React.useEffect(() => {
    if (!showOptionsMenu) return;
    const handleOutside = (e) => {
      if (!optionsMenuRef.current?.contains(e.target)) {
        setShowOptionsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showOptionsMenu]);
  const [showEditProperty, setShowEditProperty] = useState(false);

  const createdAt = property.createdAt ? new Date(property.createdAt) : new Date(now.getFullYear(), now.getMonth(), 1);
  const [minYear, setMinYear] = useState(createdAt.getFullYear());
  const [minMonth, setMinMonth] = useState(createdAt.getMonth());

  useEffect(() => {
    const fallbackYear = createdAt.getFullYear();
    const fallbackMonth = createdAt.getMonth();
    Promise.all([
      supabase.from('payments').select('year, month')
        .eq('property_id', String(property.id)).eq('status', 'confirmed')
        .order('year', { ascending: true }).order('month', { ascending: true }).limit(1),
      supabase.from('expenses').select('start_date, created_at')
        .eq('property_id', String(property.id))
        .order('created_at', { ascending: true }).limit(1),
    ]).then(([paymentsRes, expensesRes]) => {
      let yr = fallbackYear, mo = fallbackMonth;
      const p = paymentsRes.data?.[0];
      if (p && (p.year < yr || (p.year === yr && p.month < mo))) { yr = p.year; mo = p.month; }
      const e = expensesRes.data?.[0];
      if (e) {
        const dateStr = e.start_date || e.created_at;
        if (dateStr) {
          const d = new Date(dateStr.substring(0, 10) + 'T12:00:00');
          if (!isNaN(d.getTime())) {
            const ey = d.getFullYear(), em = d.getMonth();
            if (ey < yr || (ey === yr && em < mo)) { yr = ey; mo = em; }
          }
        }
      }
      setMinYear(yr);
      setMinMonth(mo);
    });
  }, [property.id]); // eslint-disable-line

  const isAtMinMonth = currentYear === minYear && currentMonth === minMonth;
  const isAtCurrentMonth = currentYear === now.getFullYear() && currentMonth === now.getMonth();
  const [isEditMode, setIsEditMode] = useState(false);
  const [isEditMonthPickerOpen, setIsEditMonthPickerOpen] = useState(false);
  const canEdit = !readOnly && (isAtCurrentMonth || isEditMode);
  const isCurrentMonthFuture = isFutureMonth(currentYear, currentMonth);
  const ownershipMultiplier = (property.ownershipPercentage || 100) / 100;

  const goToPrevMonth = () => {
    if (isAtMinMonth) return;
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
  };
  const goToNextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
  };

  useEffect(() => {
    setIsEditMode(false);
  }, [currentYear, currentMonth]);

  // Reservas del mes actual
  const monthBookings = bookings.filter(b => {
    const start = new Date(b.startDate);
    const end = new Date(b.endDate);
    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0);
    return start <= monthEnd && end >= monthStart;
  });

  const monthIncome = monthBookings
    .filter(b => b.status === 'confirmed')
    .reduce((sum, b) => sum + (b.amount || 0), 0) * ownershipMultiplier;

  const visibleExpenses = getExpensesForMonth(expenses, currentYear, currentMonth);
  const ownershipPct = property.ownershipPercentage || 100;
  const myExpenses = visibleExpenses.reduce((sum, e) => {
    if (e.active === false) return sum;
    const pct = e.expense_percentage != null ? e.expense_percentage : ownershipPct;
    return sum + getMonthlyEquivalent(e) * pct / 100;
  }, 0);

  const netIncome = isCurrentMonthFuture ? null : monthIncome - myExpenses;

  // Gauge fill
  const maxRef = property.price || 1000;
  const gaugeFill = netIncome !== null && netIncome > 0 ? Math.min(netIncome / maxRef, 1) : 0;

  const handleAddBooking = (bookingData) => {
    const updated = editingBooking
      ? bookings.map(b => b.id === editingBooking.id ? { ...bookingData, id: b.id } : b)
      : [...bookings, { ...bookingData, id: Date.now().toString() }];
    setBookings(updated);
    onUpdate({ ...property, bookings: updated });
    setShowAddBooking(false);
    setEditingBooking(null);
  };

  const handleDeleteBooking = (id) => {
    if (window.confirm('¿Eliminar esta reserva?')) {
      const updated = bookings.filter(b => b.id !== id);
      setBookings(updated);
      onUpdate({ ...property, bookings: updated });
    }
  };

  const handleAddExpense = async (expenseData) => {
    const { data, error } = await supabase
      .from('expenses')
      .insert({ property_id: String(property.id), landlord_email: landlordEmail, ...expenseData })
      .select()
      .single();
    if (error) { alert(`Error guardando el gasto: ${error.message}`); return; }
    setExpenses(prev => [data, ...prev]);
    setShowAddExpense(false);
  };

  const handleDeleteExpense = async (id) => {
    await supabase.from('expenses').delete().eq('id', id);
    setExpenses(prev => prev.filter(e => e.id !== id));
  };

  const handleTogglePause = async (id, currentActive) => {
    await supabase.from('expenses').update({ active: !currentActive }).eq('id', id);
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, active: !currentActive } : e));
  };

  const handleUpdateVariableAmount = async (id, newAmount) => {
    await supabase.from('expenses').update({ amount: parseFloat(newAmount) }).eq('id', id);
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, amount: parseFloat(newAmount) } : e));
  };

  const handleSaveInvestmentData = async () => {
    setInvestmentSaving(true);
    const updatedProperty = { ...property, investmentData };
    await supabase
      .from('properties')
      .update({
        data: updatedProperty,
        updated_at: new Date().toISOString(),
        purchase_price: parseFloat(investmentData.purchasePrice) || null,
        acquisition_costs: parseFloat(investmentData.acquisitionCosts) || null,
        ownership_percentage: parseFloat(investmentData.ownershipPercentage) || null,
        monthly_mortgage: parseFloat(investmentData.monthlyMortgage) || null,
        monthly_amortization: parseFloat(investmentData.monthlyAmortization) || null,
      })
      .eq('id', property.id);
    onUpdate(updatedProperty);
    setInvestmentSaving(false);
    setInvestmentEditing(false);
  };

  const getHistoryMonths = () => {
    const months = [];
    let y = minYear, m = minMonth;
    while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth())) {
      const mb = bookings.filter(b => {
        const s = new Date(b.startDate), e = new Date(b.endDate);
        const ms = new Date(y, m, 1), me = new Date(y, m + 1, 0);
        return s <= me && e >= ms && b.status === 'confirmed';
      });
      const income = mb.reduce((sum, b) => sum + (b.amount || 0), 0) * ownershipMultiplier;
      const exp = getExpensesForMonth(expenses, y, m).reduce((sum, e) => {
        if (e.active === false) return sum;
        const pct = e.expense_percentage != null ? e.expense_percentage : (property.ownershipPercentage || 100);
        return sum + getMonthlyEquivalent(e) * pct / 100;
      }, 0);
      months.push({ year: y, month: m, income, expenses: exp, net: income - exp, bookings: mb.length });
      if (m === 11) { m = 0; y++; } else m++;
    }
    return months.reverse();
  };

  // Calendario
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = (getFirstDayOfMonth(currentYear, currentMonth) + 6) % 7; // lunes=0

  const getBookingForDay = (day) => {
    return bookings.filter(b => {
      const start = new Date(b.startDate);
      const end = new Date(b.endDate);
      const d = new Date(currentYear, currentMonth, day);
      return d >= new Date(start.getFullYear(), start.getMonth(), start.getDate()) &&
             d <= new Date(end.getFullYear(), end.getMonth(), end.getDate());
    });
  };

  const platformColor = (platform) => {
    const map = { airbnb: '#FF5A5F', booking: '#003580', directo: '#4CAF50', otro: '#9C27B0' };
    return map[platform] || '#666';
  };

  // ─── Datos de inversión — cálculo ROI ───
  const invOwnershipPct = parseFloat(investmentData.ownershipPercentage) || property.ownershipPercentage || 100;
  const invOwnership = invOwnershipPct / 100;
  const totalInvestment = (parseFloat(investmentData.purchasePrice) || 0) + (parseFloat(investmentData.acquisitionCosts) || 0);
  const hasInvestmentData = totalInvestment > 0;
  const invMortgage = parseFloat(investmentData.monthlyMortgage) || 0;
  const invAmortization = parseFloat(investmentData.monthlyAmortization) || 0;

  const invMonthlyExpenses = expenses
    .filter(e => e.active !== false)
    .reduce((sum, e) => {
      const pct = e.expense_percentage != null ? e.expense_percentage : invOwnershipPct;
      return sum + getMonthlyEquivalent(e) * pct / 100;
    }, 0);

  const mortgageInExpenses = expenses.some(e => e.active !== false && e.category === 'hipoteca');

  // Ingresos configurados para vacacional: precio mensual de referencia o promedio histórico
  const invConfiguredIncome = (property.price || 0) * invOwnership;
  const invCashflowBruto = invConfiguredIncome - invMortgage;

  const invNow = new Date();
  const invNowYear = invNow.getFullYear();
  const invNowMonth = invNow.getMonth();
  const invLast6 = [];
  let invFy = invNowYear, invFm = invNowMonth;
  for (let i = 0; i < 6; i++) {
    invLast6.push({ year: invFy, month: invFm });
    if (invFm === 0) { invFm = 11; invFy--; } else { invFm--; }
  }
  const invMonthsWithData = invLast6.filter(({ year, month }) =>
    roiPayments.some(p => p.year === year && p.month === month)
  );
  const invAvgConfirmedIncome = invMonthsWithData.length > 0
    ? invMonthsWithData.reduce((total, { year, month }) => {
        return total + roiPayments
          .filter(p => p.year === year && p.month === month)
          .reduce((s, p) => s + (Number(p.amount) || 0), 0);
      }, 0) / invMonthsWithData.length * invOwnership
    : null;

  // Si no hay pagos confirmados, usar ingresos de reservas de los últimos 6 meses
  const invAvgBookingIncome = (() => {
    const monthsWithBookings = invLast6.filter(({ year, month }) =>
      bookings.some(b => {
        const s = new Date(b.startDate);
        return b.status === 'confirmed' && s.getFullYear() === year && s.getMonth() === month;
      })
    );
    if (monthsWithBookings.length === 0) return null;
    return monthsWithBookings.reduce((total, { year, month }) => {
      return total + bookings
        .filter(b => {
          const s = new Date(b.startDate);
          return b.status === 'confirmed' && s.getFullYear() === year && s.getMonth() === month;
        })
        .reduce((s, b) => s + (b.amount || 0), 0);
    }, 0) / monthsWithBookings.length * invOwnership;
  })();

  const invEffectiveHistoricalIncome = invAvgConfirmedIncome ?? invAvgBookingIncome;
  const invCashflowNeto = invEffectiveHistoricalIncome !== null
    ? invEffectiveHistoricalIncome - invMonthlyExpenses - (mortgageInExpenses ? 0 : invMortgage)
    : null;
  const invHasHistorical = invCashflowNeto !== null;
  const invEffectiveCashflow = invHasHistorical ? invCashflowNeto : invCashflowBruto;
  const invBeneficioAnual = invEffectiveCashflow * 12;
  const invRoiAnual = totalInvestment > 0 ? (invBeneficioAnual / totalInvestment) * 100 : null;
  const invPayback = totalInvestment > 0 && invBeneficioAnual > 0 ? totalInvestment / invBeneficioAnual : null;
  const invStartDateRef = property.createdAt ? new Date(property.createdAt) : new Date();
  const invMonthsElapsed = Math.max(0,
    (invNowYear - invStartDateRef.getFullYear()) * 12 + (invNowMonth - invStartDateRef.getMonth())
  );
  const invEquityAcumulado = invEffectiveCashflow * invMonthsElapsed + invAmortization * invMonthsElapsed;
  const invRoiColor = invRoiAnual === null ? '#999'
    : invRoiAnual < 3 ? '#C62828' : invRoiAnual < 6 ? '#F57F17' : '#2E7D32';
  const invRoiBg = invRoiAnual === null ? '#F5F5F5'
    : invRoiAnual < 3 ? '#FBE9E7' : invRoiAnual < 6 ? '#FFF8E1' : '#F1F8E9';
  const invRoiLabel = invRoiAnual === null ? null
    : invRoiAnual < 3 ? 'Bajo' : invRoiAnual < 6 ? 'Moderado' : 'Bueno';

  if (showExpenseSummary) {
    const getMonthlyIncome = (yr, mo) =>
      (property.bookings || [])
        .filter(b => b.status === 'confirmed' && new Date(b.startDate).getFullYear() === yr && new Date(b.startDate).getMonth() === mo)
        .reduce((s, b) => s + (b.amount || 0), 0) * ((property.ownershipPercentage || 100) / 100);
    return (
      <ExpenseSummary
        expenses={expenses}
        onBack={() => setShowExpenseSummary(false)}
        propertyName={property.name}
        getMonthlyIncome={getMonthlyIncome}
      />
    );
  }

  return (
    <div className="property-detail-container">
      {/* Header */}
      <div className="detail-header" ref={optionsMenuRef}>
        <button className="back-button" onClick={onBack}>←</button>
        <h1 className="detail-title">{property.name}</h1>
        <button className="detail-options" onClick={() => setShowOptionsMenu(!showOptionsMenu)}>⋮</button>
        {showOptionsMenu && (
          <div className="detail-options-menu">
            <button className="detail-option-item" onClick={() => { setShowEditProperty(true); setShowOptionsMenu(false); }}>Editar propiedad</button>
            <button className="detail-option-item delete" onClick={() => {
              if (window.confirm('¿Eliminar esta propiedad?')) { onUpdate({ ...property, deleted: true }); onBack(); }
              setShowOptionsMenu(false);
            }}>Eliminar propiedad</button>
            <button className="detail-option-item" onClick={() => { setIsEditMonthPickerOpen(true); setShowOptionsMenu(false); }}>Editar mes pasado</button>
          </div>
        )}
      </div>

      {/* Month navigator */}
      <MonthNavigator
        year={currentYear}
        month={currentMonth}
        minYear={minYear}
        minMonth={minMonth}
        onPrev={goToPrevMonth}
        onNext={goToNextMonth}
        onJump={(yr, mo) => {
          setCurrentYear(yr);
          setCurrentMonth(mo);
          if (isEditMonthPickerOpen) {
            setIsEditMode(true);
            setIsEditMonthPickerOpen(false);
          }
        }}
        forcePickerOpen={isEditMonthPickerOpen}
        onPickerClose={() => setIsEditMonthPickerOpen(false)}
      />

      {/* Gauge */}
      <div className="profitability-section">
        <div className="gauge-chart">
          <svg width="360" height="220" viewBox="0 0 360 220">
            <path d="M 50 180 A 130 130 0 0 1 310 180" fill="none" stroke="#E0E0E0" strokeWidth="35" strokeLinecap="round"/>
            {!isCurrentMonthFuture && netIncome !== null && netIncome >= 0 && (
              <path d="M 50 180 A 130 130 0 0 1 310 180" fill="none" stroke="#4CAF50" strokeWidth="35" strokeLinecap="round"
                strokeDasharray="408" strokeDashoffset={408 - gaugeFill * 408}/>
            )}
            {!isCurrentMonthFuture && netIncome !== null && netIncome < 0 && (
              <path d="M 50 180 A 130 130 0 0 1 310 180" fill="none" stroke="#F44336" strokeWidth="35" strokeLinecap="round"/>
            )}
          </svg>
          <div className="gauge-center">
            {isCurrentMonthFuture ? (
              <><div className="net-income future">—</div><div className="income-sublabel">Mes futuro</div></>
            ) : (
              <>
                <div className="net-income">{netIncome >= 0 ? '+' : ''}{netIncome.toFixed(2)} €</div>
                <div className="income-label">/mes</div>
                <div className="income-sublabel">Neto</div>
              </>
            )}
          </div>
        </div>
        <p className="profitability-label">{isCurrentMonthFuture ? 'Sin datos todavía' : 'Rentabilidad mensual'}</p>
      </div>

      {/* Calendario */}
      <div className="info-card">
        <div className="card-header" style={{ marginBottom: '14px' }}>
          <h3>Calendario</h3>
          {canEdit && (
            <button className="payment-btn confirm small" style={{ flex: 'none', padding: '8px 14px' }}
              onClick={() => { setEditingBooking(null); setShowAddBooking(true); }}>
              + Reserva
            </button>
          )}
        </div>

        {/* Días semana */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
          {['L','M','X','J','V','S','D'].map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: '11px', fontWeight: 600, color: '#aaa', padding: '4px 0' }}>{d}</div>
          ))}
        </div>

        {/* Días del mes */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
          {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dayBookings = getBookingForDay(day);
            const isToday = currentYear === now.getFullYear() && currentMonth === now.getMonth() && day === now.getDate();
            const booking = dayBookings[0];
            return (
              <div key={day} style={{
                textAlign: 'center', padding: '6px 2px', borderRadius: '8px', fontSize: '13px',
                background: booking ? platformColor(booking.platform) + '22' : 'transparent',
                border: isToday ? '2px solid #2196F3' : '2px solid transparent',
                position: 'relative', cursor: booking && canEdit ? 'pointer' : 'default',
                fontWeight: isToday ? 700 : 400,
                color: booking ? platformColor(booking.platform) : '#333',
              }}
                onClick={() => { if (booking && canEdit) { setEditingBooking(booking); setShowAddBooking(true); } }}
              >
                {day}
                {booking && (
                  <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: platformColor(booking.platform), margin: '2px auto 0' }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Leyenda plataformas */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '14px', flexWrap: 'wrap' }}>
          {[['airbnb','#FF5A5F','Airbnb'], ['booking','#003580','Booking'], ['directo','#4CAF50','Directo'], ['otro','#9C27B0','Otro']].map(([key, color, label]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#666' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: color }} />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Reservas del mes */}
      <div className="info-card">
        <div className="card-header" style={{ marginBottom: monthBookings.length > 0 ? '14px' : '0' }}>
          <h3>Reservas de {new Date(currentYear, currentMonth).toLocaleDateString('es-ES', { month: 'long' })}</h3>
          <span style={{ fontSize: '13px', color: '#4CAF50', fontWeight: 600 }}>
            {monthBookings.filter(b => b.status === 'confirmed').reduce((s, b) => s + (b.amount || 0), 0).toFixed(0)} €
          </span>
        </div>

        {monthBookings.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#aaa', textAlign: 'center', padding: '12px 0', margin: 0 }}>
            No hay reservas este mes
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {monthBookings.map(booking => {
              const start = new Date(booking.startDate);
              const end = new Date(booking.endDate);
              const nights = Math.round((end - start) / (1000 * 60 * 60 * 24));
              const color = platformColor(booking.platform);
              return (
                <div key={booking.id} style={{
                  background: '#f9f9f9', borderRadius: '12px', padding: '12px 14px',
                  borderLeft: `3px solid ${color}`, cursor: 'pointer'
                }} onClick={() => { if (!canEdit) return; setEditingBooking(booking); setShowAddBooking(true); }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: '14px', color: '#111' }}>{booking.guestName}</p>
                      <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#888' }}>
                        {start.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} — {end.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} · {nights} noche{nights !== 1 ? 's' : ''}
                      </p>
                      {booking.guestPhone && (
                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#aaa' }}>{booking.guestPhone}</p>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: '15px', color: '#111' }}>{booking.amount} €</p>
                      <span style={{
                        fontSize: '11px', padding: '2px 8px', borderRadius: '10px', display: 'inline-block', marginTop: '3px',
                        background: booking.status === 'confirmed' ? '#E8F5E9' : booking.status === 'cancelled' ? '#FFEBEE' : '#FFF3E0',
                        color: booking.status === 'confirmed' ? '#388E3C' : booking.status === 'cancelled' ? '#C62828' : '#E65100',
                      }}>
                        {booking.status === 'confirmed' ? 'Confirmada' : booking.status === 'cancelled' ? 'Cancelada' : 'Pendiente'}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: color }} />
                    <span style={{ fontSize: '12px', color: '#888', textTransform: 'capitalize' }}>{booking.platform}</span>
                    {booking.notes && <span style={{ fontSize: '12px', color: '#aaa', marginLeft: '4px' }}>· {booking.notes}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Gastos */}
      <div className="info-card expenses-card">
        <div className="card-header clickable" onClick={() => setShowExpenses(!showExpenses)}>
          <h3>Gastos</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" onClick={e => { e.stopPropagation(); setShowExpenseSummary(true); }}
              style={{ fontSize: 11, padding: '3px 9px', borderRadius: 8, border: '1px solid #ddd', background: 'white', color: '#666', cursor: 'pointer' }}>
              Resumen
            </button>
            <span className="expenses-total" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{myExpenses.toFixed(2)} €/mes</span>
              <span className="arrow">{showExpenses ? '▼' : '›'}</span>
            </span>
          </div>
        </div>
        {showExpenses && (
          <div className="expenses-detail">
            {visibleExpenses.length === 0 ? (
              <p className="no-expenses">No hay gastos añadidos</p>
            ) : visibleExpenses.map(exp => {
              const isPendingVariable = exp.type === 'recurrente_variable' && exp.frequency !== 'manual' && !exp.amount;
              const monthly = getMonthlyEquivalent(exp);
              const freqLabel = { trimestral: 'Trimestral', anual: 'Anual', unico: 'Único', manual: 'Manual', custom: `Cada ${exp.custom_frequency_months}m`, mensual: null }[exp.frequency] || null;
              const typeLabel = { recurrente_fijo: 'Fijo', recurrente_variable: 'Variable', recurrente_temporal: 'Temporal', puntual: 'Único' }[exp.type] || null;
              return (
                <div key={exp.id} className="expense-item" style={{ opacity: exp.active === false ? 0.5 : 1 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span>{exp.name}</span>
                      {typeLabel && <span className={`frequency-badge ${exp.type}`} style={{ fontSize: 10 }}>{typeLabel}</span>}
                      {freqLabel && <span className={`frequency-badge ${exp.frequency}`}>{freqLabel}</span>}
                      {exp.type === 'recurrente_temporal' && exp.duration_payments && (
                        <span style={{ fontSize: 10, color: '#aaa' }}>({exp.payments_made || 0}/{exp.duration_payments} pagos)</span>
                      )}
                      {exp.active === false && <span style={{ fontSize: 10, color: '#aaa' }}>Pausado</span>}
                      {exp.expense_percentage != null && <span style={{ fontSize: 10, color: '#aaa' }}>{exp.expense_percentage}%</span>}
                    </div>
                    {isPendingVariable && (
                      <PendingVariableInput expenseId={exp.id} onSave={handleUpdateVariableAmount} />
                    )}
                  </div>
                  <div className="expense-actions" style={{ gap: 6 }}>
                    <span style={{ color: isPendingVariable ? '#FFA726' : undefined }}>
                      {isPendingVariable ? '— €' : `${monthly.toFixed(2)} €/mes`}
                    </span>
                    {canEdit && exp.type !== 'puntual' && (
                      <button
                        className="delete-expense"
                        style={{ background: exp.active === false ? '#E8F5E9' : '#FFF8E1', color: exp.active === false ? '#388E3C' : '#F57F17', borderRadius: 6, padding: '2px 7px', fontSize: 11 }}
                        onClick={() => handleTogglePause(exp.id, exp.active !== false)}
                      >
                        {exp.active === false ? '▶' : '⏸'}
                      </button>
                    )}
                    {canEdit && <button className="delete-expense" onClick={() => handleDeleteExpense(exp.id)}>×</button>}
                  </div>
                </div>
              );
            })}
            {visibleExpenses.length > 0 && (
              <div className="expense-item total"><strong>Equiv. mensual</strong><strong>{myExpenses.toFixed(2)} €</strong></div>
            )}
            {canEdit && <button className="add-expense-button" onClick={() => setShowAddExpense(true)}>+ Añadir gasto</button>}
          </div>
        )}
        {!showExpenses && (
          canEdit && <button className="add-expense-button" onClick={() => setShowAddExpense(true)}>+ Añadir gasto</button>
        )}
      </div>

      {/* Historial */}
      <div className="info-card history-card">
        <div className="card-header clickable" onClick={() => setShowHistory(!showHistory)}>
          <h3>Historial</h3>
          <span className="arrow">{showHistory ? '▼' : '›'}</span>
        </div>
        {showHistory && (() => {
          const historyMonths = getHistoryMonths();
          const accumulated = historyMonths.reduce((s, m) => s + m.net, 0);
          return (
            <div className="history-detail">
              <div className="export-buttons">
                <button className="export-btn excel" onClick={() => exportVacationalToExcel(property.name, historyMonths, accumulated)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Exportar Excel
                </button>
                <button className="export-btn pdf" onClick={() => exportVacationalToPDF(property.name, historyMonths, accumulated)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Exportar PDF
                </button>
              </div>
              <div className="history-table-header" style={{ gridTemplateColumns: '1fr 60px 70px 70px 70px' }}>
                <span>Mes</span><span>Reservas</span><span>Ingresos</span><span>Gastos</span><span>Neto</span>
              </div>
              {historyMonths.map(item => (
                <div key={`${item.year}-${item.month}`} className="history-row" style={{ gridTemplateColumns: '1fr 60px 70px 70px 70px' }}
                  onClick={() => { setCurrentYear(item.year); setCurrentMonth(item.month); setShowHistory(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                  <span className="history-month">{formatMonthYear(item.year, item.month)}</span>
                  <span style={{ color: '#666', textAlign: 'right' }}>{item.bookings}</span>
                  <span className="history-income">{item.income > 0 ? `+${item.income.toFixed(0)} €` : '—'}</span>
                  <span className="history-expenses">{item.expenses > 0 ? `-${item.expenses.toFixed(0)} €` : '—'}</span>
                  <span className={`history-net ${item.net >= 0 ? 'positive' : 'negative'}`}>{item.net >= 0 ? '+' : ''}{item.net.toFixed(0)} €</span>
                </div>
              ))}
              <div className="history-accumulated">
                <span>Ganancia neta acumulada</span>
                <span className={accumulated >= 0 ? 'positive' : 'negative'}>{accumulated >= 0 ? '+' : ''}{accumulated.toFixed(0)} €</span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Datos de inversión */}
      <div className="info-card">
        <div className="card-header clickable" onClick={() => setShowInvestmentSection(!showInvestmentSection)}>
          <h3>Datos de inversión</h3>
          <span className="arrow">{showInvestmentSection ? '▼' : '›'}</span>
        </div>

        {showInvestmentSection && (
          <div style={{ padding: '0 4px 4px' }}>
            {!hasInvestmentData && !investmentEditing ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <p style={{ color: '#aaa', fontSize: '14px', margin: '0 0 16px' }}>
                  Añade los datos de inversión para calcular ROI y payback
                </p>
                <button
                  onClick={() => setInvestmentEditing(true)}
                  style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid #ddd', background: 'white', fontSize: '14px', cursor: 'pointer', color: '#333' }}
                >
                  Añadir
                </button>
              </div>
            ) : investmentEditing ? (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                  {[
                    { label: 'Precio de compra (€)', key: 'purchasePrice', placeholder: '0' },
                    { label: 'Gastos de adquisición (€)', key: 'acquisitionCosts', placeholder: '0' },
                    { label: 'Porcentaje de propiedad (%)', key: 'ownershipPercentage', placeholder: '100' },
                    { label: 'Cuota hipoteca mensual (€)', key: 'monthlyMortgage', placeholder: 'Opcional' },
                    { label: 'Amortización mensual (€)', key: 'monthlyAmortization', placeholder: 'Opcional' },
                  ].map(({ label, key, placeholder }) => (
                    <div key={key}>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#555', marginBottom: '6px' }}>{label}</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder={placeholder}
                        value={investmentData[key]}
                        onChange={e => setInvestmentData(prev => ({ ...prev, [key]: e.target.value }))}
                        style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #ddd', fontSize: '15px', background: 'white', boxSizing: 'border-box' }}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleSaveInvestmentData}
                    disabled={investmentSaving}
                    style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: '#111', color: 'white', fontSize: '15px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    {investmentSaving ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button
                    onClick={() => setInvestmentEditing(false)}
                    style={{ padding: '12px 16px', borderRadius: '10px', border: '1px solid #ddd', background: 'white', fontSize: '15px', cursor: 'pointer', color: '#666' }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: invCashflowNeto !== null ? '1fr 1fr' : '1fr', gap: '10px', marginBottom: '16px' }}>
                  <div style={{ background: invCashflowBruto >= 0 ? '#F1F8E9' : '#FBE9E7', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                    <p style={{ margin: '0 0 4px', fontSize: '11px', color: '#888', fontWeight: 500 }}>Cashflow bruto/mes</p>
                    <p style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: invCashflowBruto >= 0 ? '#2E7D32' : '#C62828' }}>
                      {invCashflowBruto >= 0 ? '+' : ''}{invCashflowBruto.toFixed(0)} €
                    </p>
                  </div>
                  {invCashflowNeto !== null && (
                    <div style={{ background: invCashflowNeto >= 0 ? '#F1F8E9' : '#FBE9E7', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                      <p style={{ margin: '0 0 4px', fontSize: '11px', color: '#888', fontWeight: 500 }}>Cashflow neto/mes</p>
                      <p style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: invCashflowNeto >= 0 ? '#2E7D32' : '#C62828' }}>
                        {invCashflowNeto >= 0 ? '+' : ''}{invCashflowNeto.toFixed(0)} €
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#aaa' }}>
                        Promedio {invMonthsWithData.length || invLast6.filter(({ year, month }) => bookings.some(b => { const s = new Date(b.startDate); return b.status === 'confirmed' && s.getFullYear() === year && s.getMonth() === month; })).length} meses reales
                      </p>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <span style={{ fontSize: '13px', color: '#666' }}>Inversión total</span>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#111' }}>{totalInvestment.toFixed(0)} €</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <span style={{ fontSize: '13px', color: '#666' }}>
                      ROI anual {invHasHistorical ? '(neto)' : '(bruto)'}
                    </span>
                    <span style={{ background: invRoiBg, color: invRoiColor, padding: '4px 10px', borderRadius: '8px', fontSize: '13px', fontWeight: 700 }}>
                      {invRoiAnual !== null ? `${invRoiAnual.toFixed(2)}%` : '—'}
                      {invRoiLabel && <span style={{ marginLeft: '6px', fontSize: '11px', fontWeight: 500 }}>{invRoiLabel}</span>}
                    </span>
                  </div>
                  {invPayback !== null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <span style={{ fontSize: '13px', color: '#666' }}>
                        Payback {invHasHistorical ? '(neto)' : '(bruto)'}
                      </span>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#111' }}>{invPayback.toFixed(1)} años</span>
                    </div>
                  )}
                  {invMonthsElapsed > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <span style={{ fontSize: '13px', color: '#666' }}>Equity acumulado ({invMonthsElapsed} meses)</span>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: invEquityAcumulado >= 0 ? '#2E7D32' : '#C62828' }}>
                        {invEquityAcumulado >= 0 ? '+' : ''}{invEquityAcumulado.toFixed(0)} €
                      </span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setInvestmentEditing(true)}
                  style={{ fontSize: '13px', color: '#666', background: 'none', border: '1px solid #ddd', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer' }}
                >
                  Editar datos
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddBooking && (
        <BookingModal
          booking={editingBooking}
          onClose={() => { setShowAddBooking(false); setEditingBooking(null); }}
          onSave={handleAddBooking}
          onDelete={editingBooking ? () => { handleDeleteBooking(editingBooking.id); setShowAddBooking(false); setEditingBooking(null); } : null}
        />
      )}
      {showAddExpense && (
        <AddExpenseModal onClose={() => setShowAddExpense(false)} onAdd={handleAddExpense} defaultExpensePct={property.ownershipPercentage || 100} />
      )}
      {showEditProperty && (
        <EditVacationalModal
          property={property}
          onClose={() => setShowEditProperty(false)}
          onSave={(data) => { onUpdate({ ...property, ...data }); setShowEditProperty(false); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Modal añadir/editar reserva
// ─────────────────────────────────────────────
function BookingModal({ booking, onClose, onSave, onDelete }) {
  const [guestName, setGuestName] = useState(booking?.guestName || '');
  const [guestPhone, setGuestPhone] = useState(booking?.guestPhone || '');
  const [startDate, setStartDate] = useState(booking?.startDate || '');
  const [endDate, setEndDate] = useState(booking?.endDate || '');
  const [amount, setAmount] = useState(booking?.amount?.toString() || '');
  const [platform, setPlatform] = useState(booking?.platform || 'directo');
  const [status, setStatus] = useState(booking?.status || 'confirmed');
  const [notes, setNotes] = useState(booking?.notes || '');

  const nights = startDate && endDate
    ? Math.round((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24))
    : 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ guestName, guestPhone, startDate, endDate, amount: parseFloat(amount), platform, status, notes });
  };

  const platforms = [
    { key: 'airbnb', label: 'Airbnb', color: '#FF5A5F' },
    { key: 'booking', label: 'Booking', color: '#003580' },
    { key: 'directo', label: 'Directo', color: '#4CAF50' },
    { key: 'otro', label: 'Otro', color: '#9C27B0' },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{booking ? 'Editar reserva' : 'Nueva reserva'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nombre del huésped</label>
            <input type="text" placeholder="Ej: Carlos García" value={guestName} onChange={e => setGuestName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Teléfono (opcional)</label>
            <input type="tel" placeholder="Ej: 612 345 678" value={guestPhone} onChange={e => setGuestPhone(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label>Fecha entrada</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Fecha salida</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required />
            </div>
          </div>
          {nights > 0 && (
            <p style={{ fontSize: '12px', color: '#888', margin: '-8px 0 12px', textAlign: 'center' }}>
              {nights} noche{nights !== 1 ? 's' : ''}
            </p>
          )}
          <div className="form-group">
            <label>Importe total (€)</label>
            <input type="number" placeholder="0" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Plataforma</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {platforms.map(p => (
                <button key={p.key} type="button" onClick={() => setPlatform(p.key)}
                  style={{
                    padding: '10px 6px', border: `2px solid ${platform === p.key ? p.color : '#ddd'}`,
                    borderRadius: '10px', background: platform === p.key ? p.color + '15' : 'white',
                    cursor: 'pointer', fontSize: '13px', fontWeight: platform === p.key ? 700 : 400,
                    color: platform === p.key ? p.color : '#555'
                  }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>Estado</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {[['confirmed','Confirmada','#4CAF50'], ['pending','Pendiente','#FF9800'], ['cancelled','Cancelada','#F44336']].map(([key, label, color]) => (
                <button key={key} type="button" onClick={() => setStatus(key)}
                  style={{
                    padding: '10px', border: `2px solid ${status === key ? color : '#ddd'}`,
                    borderRadius: '10px', background: status === key ? color + '15' : 'white',
                    cursor: 'pointer', fontSize: '13px', fontWeight: status === key ? 700 : 400,
                    color: status === key ? color : '#555'
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>Notas (opcional)</label>
            <input type="text" placeholder="Ej: late check-in, mascotas..." value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className="modal-buttons">
            <button type="submit" className="submit-button">{booking ? 'Guardar cambios' : 'Añadir reserva'}</button>
            {onDelete && <button type="button" className="delete-button" onClick={onDelete}>Eliminar reserva</button>}
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Componentes de gastos
// ─────────────────────────────────────────────
function PendingVariableInput({ expenseId, onSave }) {
  const [value, setValue] = useState('');
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} style={{ marginTop: 4, fontSize: 11, background: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: 6, padding: '3px 8px', color: '#E65100', cursor: 'pointer' }}>
        ⚠ Introducir importe
      </button>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
      <input type="number" step="0.01" placeholder="0.00" value={value} onChange={e => setValue(e.target.value)}
        style={{ width: 80, fontSize: 13, padding: '3px 6px', borderRadius: 6, border: '1px solid #ddd' }} autoFocus />
      <button onClick={() => { if (value) { onSave(expenseId, value); setEditing(false); } }}
        style={{ fontSize: 11, background: '#4CAF50', color: 'white', border: 'none', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>
        Guardar
      </button>
      <button onClick={() => setEditing(false)} style={{ fontSize: 11, background: 'none', border: 'none', color: '#aaa', cursor: 'pointer' }}>×</button>
    </div>
  );
}

const EXPENSE_CATEGORIES = [
  { key: 'comunidad',    label: 'Comunidad',         subcategories: ['Cuota', 'Derrama', 'Otros'] },
  { key: 'suministros',  label: 'Suministros',        subcategories: ['Luz', 'Agua', 'Gas', 'Internet', 'Otros'] },
  { key: 'seguros',      label: 'Seguros',            subcategories: ['Hogar', 'Impago', 'Responsabilidad civil', 'Otros'] },
  { key: 'reparaciones', label: 'Reparaciones',       subcategories: ['Fontanería', 'Electricidad', 'Pintura', 'Electrodomésticos', 'Otros'] },
  { key: 'impuestos',    label: 'Impuestos',          subcategories: ['IBI', 'Basuras', 'Otros'] },
  { key: 'gestion',      label: 'Gestión',            subcategories: ['Agencia', 'Gestoría', 'Otros'] },
  { key: 'hipoteca',     label: 'Hipoteca/Préstamo',  subcategories: [] },
  { key: 'otros',        label: 'Otros',              subcategories: [] },
];

function AddExpenseModal({ onClose, onAdd, defaultExpensePct }) {
  const today = new Date().toISOString().split('T')[0];
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [repeats, setRepeats] = useState(false);
  const [frequency, setFrequency] = useState('mensual');
  const [customFreqMonths, setCustomFreqMonths] = useState('');
  const [durationType, setDurationType] = useState('indefinido');
  const [durationPayments, setDurationPayments] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [expensePct, setExpensePct] = useState(defaultExpensePct != null ? String(defaultExpensePct) : '');

  const handleCategoryChange = (val) => { setCategory(val); setSubcategory(''); };

  const hasAmount = amount !== '' && parseFloat(amount) > 0;
  const derivedType = !repeats
    ? 'puntual'
    : hasAmount
      ? (durationType === 'pagos' ? 'recurrente_temporal' : 'recurrente_fijo')
      : 'recurrente_variable';

  const freqStep = frequency === 'trimestral' ? 3 : frequency === 'anual' ? 12 : frequency === 'custom' ? (parseInt(customFreqMonths) || 1) : 1;
  const freqLabel = frequency === 'trimestral' ? 'trimestre' : frequency === 'anual' ? 'año' : frequency === 'custom' ? `${customFreqMonths || '?'} meses` : 'mes';
  const monthlyEquiv = amount && repeats && frequency !== 'mensual' ? (parseFloat(amount) / freqStep).toFixed(2) : null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const catObj = EXPENSE_CATEGORIES.find(c => c.key === category);
    const parts = [catObj?.label || category];
    if (subcategory) parts.push(subcategory);
    if (description) parts.push(description);
    onAdd({
      name: parts.join(' — '),
      category,
      subcategory: subcategory || null,
      description,
      type: derivedType,
      frequency: !repeats ? 'unico' : frequency,
      custom_frequency_months: frequency === 'custom' && repeats ? (parseInt(customFreqMonths) || null) : null,
      amount: hasAmount ? parseFloat(amount) : null,
      duration_payments: repeats && durationType === 'pagos' && durationPayments ? parseInt(durationPayments) : null,
      start_date: startDate,
      active: true,
      expense_percentage: expensePct ? parseFloat(expensePct) : null,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2>Añadir gasto</h2><button className="modal-close" onClick={onClose}>×</button></div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Categoría</label>
            <select value={category} onChange={e => handleCategoryChange(e.target.value)} required
              style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #ddd', fontSize: '15px', background: 'white', color: category ? '#111' : '#aaa' }}>
              <option value="" disabled>Selecciona una categoría</option>
              {EXPENSE_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          {category && (EXPENSE_CATEGORIES.find(c => c.key === category)?.subcategories?.length > 0) && (
            <div className="form-group">
              <label>Subcategoría</label>
              <div className="frequency-options" style={{ flexWrap: 'wrap' }}>
                {EXPENSE_CATEGORIES.find(c => c.key === category).subcategories.map(s => (
                  <button key={s} type="button"
                    className={`frequency-option ${subcategory === s ? 'selected' : ''}`}
                    onClick={() => setSubcategory(s === subcategory ? '' : s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="form-group">
            <label>¿Se repite?</label>
            <div className="frequency-options">
              <button type="button" className={`frequency-option ${!repeats ? 'selected' : ''}`} onClick={() => setRepeats(false)}>No</button>
              <button type="button" className={`frequency-option ${repeats ? 'selected' : ''}`} onClick={() => setRepeats(true)}>Sí</button>
            </div>
          </div>
          {repeats && (
            <>
              <div className="form-group">
                <label>Frecuencia</label>
                <div className="frequency-options">
                  {['mensual', 'trimestral', 'anual', 'custom'].map(f => (
                    <button key={f} type="button"
                      className={`frequency-option ${frequency === f ? 'selected' : ''}`}
                      onClick={() => setFrequency(f)}>
                      {f === 'mensual' ? 'Mensual' : f === 'trimestral' ? 'Trimestral' : f === 'anual' ? 'Anual' : 'Otra'}
                    </button>
                  ))}
                </div>
                {frequency === 'custom' && (
                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: '#555', whiteSpace: 'nowrap' }}>Cada</span>
                    <input type="number" min="1" placeholder="2" value={customFreqMonths}
                      onChange={e => setCustomFreqMonths(e.target.value)} required
                      style={{ width: 70, padding: '8px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, textAlign: 'center' }} />
                    <span style={{ fontSize: 13, color: '#555', whiteSpace: 'nowrap' }}>meses</span>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Duración</label>
                <div className="frequency-options">
                  <button type="button" className={`frequency-option ${durationType === 'indefinido' ? 'selected' : ''}`} onClick={() => setDurationType('indefinido')}>Indefinido</button>
                  <button type="button" className={`frequency-option ${durationType === 'pagos' ? 'selected' : ''}`} onClick={() => setDurationType('pagos')}>Nº de pagos</button>
                </div>
                {durationType === 'pagos' && (
                  <div style={{ marginTop: 10 }}>
                    <input type="number" min="1" placeholder="Ej: 12" value={durationPayments}
                      onChange={e => setDurationPayments(e.target.value)} required
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }} />
                    {durationPayments && (
                      <p className="monthly-equivalent">Para en {durationPayments} {frequency === 'trimestral' ? 'trimestres' : frequency === 'anual' ? 'años' : 'meses'}</p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
          <div className="form-group">
            <label>Importe por {!repeats ? 'pago' : freqLabel} (€){repeats ? ' — opcional si varía' : ''}</label>
            <input type="number" placeholder={repeats ? '0.00 (deja en blanco si varía)' : '0.00'}
              value={amount} onChange={e => setAmount(e.target.value)}
              required={!repeats} step="0.01" min="0" />
            {monthlyEquiv && <p className="monthly-equivalent">Equivalente mensual: {monthlyEquiv} €/mes</p>}
            {repeats && !hasAmount && <p style={{ fontSize: 12, color: '#888', marginTop: 6 }}>Introduces el importe cuando llega la factura.</p>}
          </div>
          <div className="form-group">
            <label>Fecha de inicio</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>% de titularidad (opcional)</label>
            <input type="number" placeholder={`${defaultExpensePct ?? 100}`} value={expensePct}
              onChange={e => setExpensePct(e.target.value)} step="0.01" min="0" max="100" />
            <p className="payment-range-note" style={{ marginTop: 6 }}>Déjalo en blanco para usar el % de la propiedad ({defaultExpensePct ?? 100}%)</p>
          </div>
          <div className="form-group">
            <label>Descripción (opcional)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="text" placeholder="Ej: recibo gas, fontanero..." value={description}
                onChange={e => setDescription(e.target.value)} style={{ flex: 1 }} />
              <button type="button" title="Adjuntar archivo (próximamente)"
                style={{ background: 'none', border: '1px solid #ddd', borderRadius: 8, padding: '10px', cursor: 'pointer', color: '#aaa', fontSize: 16, lineHeight: 1, flexShrink: 0 }}>
                📎
              </button>
            </div>
          </div>
          <button type="submit" className="submit-button">Añadir gasto</button>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Modal editar propiedad vacacional
// ─────────────────────────────────────────────
function EditVacationalModal({ property, onClose, onSave }) {
  const [name, setName] = useState(property.name);
  const [price, setPrice] = useState(property.price?.toString() || '');
  const [ownershipPercentage, setOwnershipPercentage] = useState(property.ownershipPercentage?.toString() || '100');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Editar propiedad</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={e => { e.preventDefault(); onSave({ name, price: parseFloat(price), ownershipPercentage: parseFloat(ownershipPercentage) }); }}>
          <div className="form-group">
            <label>Nombre/Dirección</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Ingresos de referencia (€/mes)</label>
            <input type="number" placeholder="1000" value={price} onChange={e => setPrice(e.target.value)} required />
            <p className="payment-range-note" style={{ marginTop: '8px' }}>Usado como referencia para el gauge de rentabilidad</p>
          </div>
          <div className="form-group">
            <label>Mi porcentaje de propiedad (%)</label>
            <input type="number" min="1" max="100" value={ownershipPercentage} onChange={e => setOwnershipPercentage(e.target.value)} required />
          </div>
          <button type="submit" className="submit-button">Guardar cambios</button>
        </form>
      </div>
    </div>
  );
}

export default VacationalDetail;