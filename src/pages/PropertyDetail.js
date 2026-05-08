import React, { useState, useEffect, useRef } from 'react';
import './PropertyDetail.css';
import PropertyDocuments from './PropertyDocuments';
import RoomDetail from './RoomDetail';
import ChatConversation from './ChatConversation';
import { supabase } from '../supabaseClient';
import ExpenseSummary from './ExpenseSummary';
import { InvestmentForm } from '../components/InvestmentForm';
import MonthNavigator from '../components/MonthNavigator';

function isFutureMonth(year, month) {
  const now = new Date();
  return year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth());
}

function sameMonthYear(date, year, month) {
  const d = new Date(date);
  return d.getFullYear() === year && d.getMonth() === month;
}

function formatMonthYear(year, month) {
  const date = new Date(year, month, 1);
  return date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    .replace(/^\w/, c => c.toUpperCase());
}

function getExpensesForMonth(expenses, year, month) {
  return expenses.filter(e => {
    // Gastos únicos: usar exclusivamente start_date (fecha elegida por el usuario), nunca created_at
    const isUnico = e.type === 'puntual' || e.type === 'unico' || e.frequency === 'unico';
    if (isUnico) {
      if (!e.start_date) return false;
      const d = new Date(e.start_date.substring(0, 10) + 'T12:00:00');
      return d.getFullYear() === year && d.getMonth() === month;
    }
    // Gastos recurrentes: start_date marca el inicio de la recurrencia
    const dateStr = e.start_date
      ? (e.start_date.substring(0, 10) + 'T12:00:00')
      : (e.created_at ? (e.created_at.substring(0, 10) + 'T12:00:00') : '');
    const start = new Date(dateStr);
    if (isNaN(start.getTime())) return false;
    const sy = start.getFullYear(), sm = start.getMonth();
    if (year < sy || (year === sy && month < sm)) return false;
    if (e.frequency === 'manual') return true;
    const monthsDiff = (year - sy) * 12 + (month - sm);
    const step = e.frequency === 'trimestral' ? 3 : e.frequency === 'anual' ? 12 : e.frequency === 'custom' ? (e.custom_frequency_months || 1) : 1;
    if (monthsDiff % step !== 0) return false;
    if (e.type === 'recurrente_temporal') {
      const paymentIndex = monthsDiff / step;
      if (paymentIndex >= (e.duration_payments || 0)) return false;
    }
    if (e.skipped_months && Array.isArray(e.skipped_months)) {
      const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
      if (e.skipped_months.includes(monthStr)) return false;
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

function calcPaymentsMade(expense) {
  if (!expense.start_date) return expense.payments_made || 0;
  const start = new Date(expense.start_date.substring(0, 10) + 'T12:00:00');
  const now = new Date();
  const sy = start.getFullYear(), sm = start.getMonth();
  const ny = now.getFullYear(), nm = now.getMonth();
  const step = expense.frequency === 'trimestral' ? 3 : expense.frequency === 'anual' ? 12 : expense.frequency === 'custom' ? (expense.custom_frequency_months || 1) : 1;
  const skipped = expense.skipped_months || [];
  let made = 0;
  let y = sy, m = sm;
  while (y < ny || (y === ny && m <= nm)) {
    const diff = (y - sy) * 12 + (m - sm);
    if (diff % step === 0) {
      const monthStr = `${y}-${String(m + 1).padStart(2, '0')}`;
      if (!skipped.includes(monthStr)) made++;
    }
    if (m === 11) { m = 0; y++; } else { m++; }
  }
  return made;
}

async function exportToExcel(propertyName, historyMonths, accumulated) {
  const ExcelJSMod = await import('exceljs');
  const ExcelJS = ExcelJSMod.default || ExcelJSMod;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Historial', { views: [{ showGridLines: false }] });
  const euro = '#,##0.00 "€"';
  const mkFill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

  // Título
  const tRow = ws.addRow([`HISTORIAL — ${propertyName}`]); tRow.height = 30;
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

  // Cabecera columnas
  const hRow = ws.addRow(['Mes', 'Estado', 'Ingresos', 'Gastos', 'Neto']); hRow.height = 20;
  hRow.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.fill = mkFill('FFF0F0F0');
    cell.font = { bold: true, color: { argb: 'FF555555' }, size: 9 };
    cell.alignment = { horizontal: col === 1 ? 'left' : 'center', vertical: 'middle' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
  });

  // Filas de datos
  historyMonths.forEach((item, idx) => {
    const occupied = item.income > 0;
    const net = item.net;
    const bg = mkFill(idx % 2 === 0 ? 'FFFFFFFF' : 'FFF9F9F9');
    const bdr = { bottom: { style: 'thin', color: { argb: 'FFF0F0F0' } } };
    const r = ws.addRow([formatMonthYear(item.year, item.month), occupied ? 'Alquilado' : 'Vacío', item.income, -item.expenses, net]);
    r.height = 20;
    for (let c = 1; c <= 5; c++) {
      r.getCell(c).fill = bg;
      r.getCell(c).alignment = { horizontal: c >= 3 ? 'right' : 'left', vertical: 'middle' };
      r.getCell(c).border = bdr;
    }
    r.getCell(2).font = { color: { argb: occupied ? 'FF2E7D32' : 'FF999999' }, size: 9 };
    r.getCell(3).font = { color: { argb: 'FF2E7D32' } }; r.getCell(3).numFmt = euro;
    r.getCell(4).font = { color: { argb: 'FFC62828' } }; r.getCell(4).numFmt = euro;
    r.getCell(5).font = { bold: true, color: { argb: net >= 0 ? 'FF2E7D32' : 'FFC62828' } }; r.getCell(5).numFmt = euro;
  });

  ws.addRow([]).height = 6;

  // Fila ganancia acumulada
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

  [20, 12, 14, 14, 14].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `historial_${propertyName.replace(/\s+/g, '_')}.xlsx`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportToPDF(propertyName, historyMonths, accumulated) {
  import('jspdf').then(({ jsPDF }) => {
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(`Historial — ${propertyName}`, 14, 20);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150);
    doc.text(`Exportado el ${new Date().toLocaleDateString('es-ES')}`, 14, 28);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(150);
    const headers = ['MES', 'ESTADO', 'INGRESOS', 'GASTOS', 'NETO'];
    const colX = [14, 70, 110, 140, 170];
    let y = 42;

    headers.forEach((h, i) => doc.text(h, colX[i], y));

    doc.setDrawColor(220);
    doc.line(14, y + 3, 196, y + 3);
    y += 12;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    historyMonths.forEach(item => {
      doc.setTextColor(50);
      doc.text(formatMonthYear(item.year, item.month), colX[0], y);
      doc.text(item.income > 0 ? 'Alquilado' : 'Vacío', colX[1], y);

      doc.setTextColor(76, 175, 80);
      doc.text(`+${item.income.toFixed(0)} €`, colX[2], y);

      doc.setTextColor(244, 67, 54);
      doc.text(`-${item.expenses.toFixed(0)} €`, colX[3], y);

      if (item.net >= 0) {
        doc.setTextColor(76, 175, 80);
        doc.text(`+${item.net.toFixed(0)} €`, colX[4], y);
      } else {
        doc.setTextColor(244, 67, 54);
        doc.text(`${item.net.toFixed(0)} €`, colX[4], y);
      }

      doc.setDrawColor(240);
      doc.line(14, y + 3, 196, y + 3);
      y += 10;
    });

    y += 4;
    doc.setDrawColor(50);
    doc.line(14, y, 196, y);
    y += 8;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(50);
    doc.text('Ganancia neta acumulada', colX[0], y);

    if (accumulated >= 0) {
      doc.setTextColor(76, 175, 80);
      doc.text(`+${accumulated.toFixed(0)} €`, colX[4], y);
    } else {
      doc.setTextColor(244, 67, 54);
      doc.text(`${accumulated.toFixed(0)} €`, colX[4], y);
    }

    doc.save(`historial_${propertyName.replace(/\s+/g, '_')}.pdf`);
  });
}

function generateTenantCode() {
  const digits = Math.floor(1000 + Math.random() * 9000).toString();
  const letters = String.fromCharCode(
    65 + Math.floor(Math.random() * 26),
    65 + Math.floor(Math.random() * 26)
  );
  return digits + letters;
}

// Formatea un número de teléfono español: "622280559" → "622 280 559"
function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  return digits.match(/.{1,3}/g)?.join(' ') ?? '';
}

function saveTenantCode(code, landlordEmail, propertyId, tenantId, roomId = null) {
  const codes = JSON.parse(localStorage.getItem('tenant_codes') || '{}');
  codes[code] = { landlordEmail, propertyId, tenantId, roomId };
  localStorage.setItem('tenant_codes', JSON.stringify(codes));
}

function ExpenseMenu({ expenseId, openMenuId, setOpenMenuId, onEdit, onDelete }) {
  const isOpen = openMenuId === expenseId;
  const btnRef = React.useRef(null);
  const menuRef = React.useRef(null);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e) => {
      if (!menuRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isOpen, setOpenMenuId]);

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        onClick={(e) => { e.stopPropagation(); setOpenMenuId(isOpen ? null : expenseId); }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', color: '#aaa', lineHeight: 1, display: 'flex', alignItems: 'center' }}
        aria-label="Opciones del gasto"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>
      {isOpen && (
        <div
          ref={menuRef}
          style={{
            position: 'absolute', right: 0, top: '100%', zIndex: 200,
            background: 'white', borderRadius: 10,
            boxShadow: '0 4px 16px rgba(0,0,0,0.13)',
            border: '1px solid #eee', minWidth: 120, overflow: 'hidden',
            // evita que se salga de la pantalla en móvil
            maxWidth: 'calc(100vw - 16px)',
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', color: '#333' }}
          >
            Editar
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); onDelete(); }}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', color: '#F44336' }}
          >
            Eliminar
          </button>
        </div>
      )}
    </div>
  );
}

function PropertyDetail({ property, onBack, onUpdate, landlordEmail, readOnly = false }) {
  const [expenses, setExpenses] = useState([]);
  const [showExpenses, setShowExpenses] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [openMenuExpenseId, setOpenMenuExpenseId] = useState(null);
  const [showExpenseSummary, setShowExpenseSummary] = useState(false);
  const [tenants, setTenants] = useState(property.tenants || []);
  const [showAddTenant, setShowAddTenant] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);
  const [rooms, setRooms] = useState(property.rooms || []);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [viewingRoomId, setViewingRoomId] = useState(null); // ✅ CAMBIADO: guardamos solo el ID
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const optionsMenuRef = React.useRef(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const [codeModal, setCodeModal] = useState(null); // { name, code }
  const [showHistory, setShowHistory] = useState(false);
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);
  const [confirmingTenant, setConfirmingTenant] = useState(null); // { id, name, amount }
  const [chatWithTenant, setChatWithTenant] = useState(null); // { tenantId, tenantName, roomId }
  const [unreadCounts, setUnreadCounts] = useState({}); // { [tenantId]: number }
  const [showInvestmentSection, setShowInvestmentSection] = useState(false);
  const [deleteExpenseModal, setDeleteExpenseModal] = useState(null); // { expense }

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

  useEffect(() => {
    if (!tenants.length || (property.status !== 'alquilado' && property.status !== 'otros')) return;
    Promise.all(
      tenants.map(t =>
        supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('landlord_email', landlordEmail)
          .eq('property_id', property.id)
          .is('room_id', null)
          .eq('tenant_id', t.id)
          .eq('sender', 'tenant')
          .eq('read_by_landlord', false)
          .then(({ count }) => [t.id, count || 0])
      )
    ).then(results => setUnreadCounts(Object.fromEntries(results)));
  }, [tenants, property.id, landlordEmail, property.status]); // eslint-disable-line


  const [paymentConfig, setPaymentConfig] = useState(property.paymentConfig || {
    startDay: 1,
    endDay: 5,
    limitDay: 5
  });
  const [payments, setPayments] = useState(property.payments || []);
  const [pendingSupabasePayments, setPendingSupabasePayments] = useState([]);

  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());

  const fetchPaymentsForMonth = React.useCallback((yr, mo) => {
    supabase
      .from('payments')
      .select('tenant_id, room_id, status, amount, confirmed_at')
      .eq('property_id', String(property.id))
      .eq('year', yr)
      .eq('month', mo)
      .then(({ data }) => { if (data) setPendingSupabasePayments(data); });
  }, [property.id]); // eslint-disable-line

  useEffect(() => {
    fetchPaymentsForMonth(currentYear, currentMonth);
  }, [currentYear, currentMonth, fetchPaymentsForMonth]);

  useEffect(() => {
    if (viewingRoomId !== null) return; // re-fetch when returning from room view, not while inside it
    supabase
      .from('expenses')
      .select('*')
      .eq('property_id', String(property.id))
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setExpenses(data); });
  }, [property.id, viewingRoomId]); // eslint-disable-line

  const [isEditMode, setIsEditMode] = useState(false);
  const [isEditMonthPickerOpen, setIsEditMonthPickerOpen] = useState(false);
  const pendingEditMode = useRef(false);

  const minYear = 2020;
  const minMonth = 0;

  const isCurrentMonthFuture = isFutureMonth(currentYear, currentMonth);
  const isAtMinMonth = currentYear === minYear && currentMonth === minMonth;
  const isAtCurrentMonth = currentYear === now.getFullYear() && currentMonth === now.getMonth();
  const canEdit = !readOnly && (isAtCurrentMonth || isEditMode);

  // ✅ NUEVO: manejador de update que también sincroniza rooms localmente
  const handleUpdate = (updatedProperty) => {
    if (updatedProperty.rooms) {
      setRooms(updatedProperty.rooms);
    }

    if (updatedProperty.payments) {
      setPayments(updatedProperty.payments);
    }
    onUpdate(updatedProperty);
  };

  const getTenantPaymentStatus = (tenantId) => {
    if (tenants.length === 0 || (property.status !== 'alquilado' && property.status !== 'otros')) return null;

    const supabasePayment = pendingSupabasePayments.find(p => p.tenant_id === tenantId);
    if (supabasePayment?.status === 'confirmed') return 'paid';
    if (supabasePayment?.status === 'pending') return 'pending_confirmation';

    const currentPayment = payments.find(p =>
      p.year === currentYear &&
      p.month === currentMonth &&
      p.tenantId === tenantId
    );

    const today = new Date();
    const isCurrentMonthView = currentYear === today.getFullYear() && currentMonth === today.getMonth();
    
    if (!isCurrentMonthView) {
      if (currentPayment) {
        return currentPayment.status === 'confirmed' ? 'paid' : 'pending_confirmation';
      }
      return 'overdue';
    }

    const currentDay = today.getDate();
    
    if (currentPayment) {
      if (currentPayment.status === 'confirmed') return 'paid';
      if (currentPayment.status === 'pending') return 'pending_confirmation';
    }

    if (currentDay > paymentConfig.limitDay) return 'overdue';
    if (currentDay >= paymentConfig.startDay && currentDay <= paymentConfig.endDay) return 'pending';
    if (currentDay < paymentConfig.startDay) return 'not_yet';
    
    return 'pending';
  };

  const handleConfirmPayment = async (tenantId, customAmount) => {
    const tenant = tenants.find(t => t.id === tenantId);
    const amount = customAmount !== undefined ? customAmount : tenant?.amount;
    const confirmedAt = new Date().toISOString();
    const updatedPayments = payments.map(p =>
      p.year === currentYear && p.month === currentMonth && p.tenantId === tenantId
        ? { ...p, status: 'confirmed', confirmedAt, amount, tenantName: tenant?.name }
        : p
    );
    setPayments(updatedPayments);
    onUpdate({ ...property, payments: updatedPayments });

    const payload = {
      property_id: String(property.id),
      tenant_id: tenantId,
      room_id: null,
      year: currentYear,
      month: currentMonth,
      status: 'confirmed',
      confirmed_at: confirmedAt,
    };
    console.log('[handleConfirmPayment] Guardando en Supabase:', payload);

    const { data: updateData, count: updateCount, error: updateError } = await supabase
      .from('payments')
      .update({ status: 'confirmed', confirmed_at: confirmedAt, amount })
      .eq('property_id', String(property.id))
      .eq('tenant_id', tenantId)
      .eq('year', currentYear)
      .eq('month', currentMonth)
      .select('id, property_id, tenant_id, room_id, year, month, status, confirmed_at', { count: 'exact' });
    console.log('[handleConfirmPayment] Resultado UPDATE:', { rowsUpdated: updateCount, data: updateData, error: updateError });

    // Verificación: leer el registro recién guardado
    const { data: verifyData, error: verifyError } = await supabase
      .from('payments')
      .select('id, property_id, tenant_id, room_id, year, month, status, confirmed_at')
      .eq('property_id', String(property.id))
      .eq('tenant_id', tenantId)
      .eq('year', currentYear)
      .eq('month', currentMonth);
    console.log('[handleConfirmPayment] Verificación DB post-escritura:', { verifyData, verifyError });

    setPendingSupabasePayments(prev =>
      prev.map(p => p.tenant_id === tenantId ? { ...p, status: 'confirmed' } : p)
    );
  };

  const handleConfirmWithAmount = async (tenantId, amount) => {
    const tenant = tenants.find(t => t.id === tenantId);
    const confirmedAt = new Date().toISOString();

    // Actualizar estado local de Supabase (fuente de verdad para el UI)
    setPendingSupabasePayments(prev => {
      const exists = prev.find(p => p.tenant_id === tenantId);
      if (exists) {
        return prev.map(p => p.tenant_id === tenantId
          ? { ...p, status: 'confirmed', confirmed_at: confirmedAt, amount }
          : p
        );
      }
      return [...prev, { tenant_id: tenantId, room_id: null, status: 'confirmed', confirmed_at: confirmedAt, amount }];
    });

    // Actualizar localStorage
    const existingPayment = payments.find(p =>
      p.year === currentYear && p.month === currentMonth && p.tenantId === tenantId
    );
    let updatedPayments;
    if (existingPayment) {
      updatedPayments = payments.map(p =>
        p.year === currentYear && p.month === currentMonth && p.tenantId === tenantId
          ? { ...p, status: 'confirmed', confirmedAt, amount, tenantName: tenant?.name }
          : p
      );
    } else {
      updatedPayments = [...payments, {
        year: currentYear, month: currentMonth, tenantId,
        status: 'confirmed', confirmedAt, amount, tenantName: tenant?.name,
      }];
    }
    setPayments(updatedPayments);
    onUpdate({ ...property, payments: updatedPayments });
    setConfirmingTenant(null);

    // Persistir en Supabase (upsert: update si existe, insert si no)
    const payload = {
      property_id: String(property.id),
      tenant_id: tenantId,
      room_id: null,
      year: currentYear,
      month: currentMonth,
      status: 'confirmed',
      confirmed_at: confirmedAt,
    };
    console.log('[handleConfirmWithAmount] Guardando en Supabase:', payload);

    const { data: updateData, count, error: updateError } = await supabase
      .from('payments')
      .update({ status: 'confirmed', confirmed_at: confirmedAt, amount })
      .eq('property_id', String(property.id))
      .eq('tenant_id', tenantId)
      .eq('year', currentYear)
      .eq('month', currentMonth)
      .select('id, property_id, tenant_id, room_id, year, month, status, confirmed_at', { count: 'exact' });
    console.log('[handleConfirmWithAmount] Resultado UPDATE:', { rowsUpdated: count, data: updateData, error: updateError });

    if (!count) {
      console.log('[handleConfirmWithAmount] No existía fila — haciendo INSERT');
      const { data: insertData, error: insertError } = await supabase
        .from('payments')
        .insert({
          property_id: String(property.id),
          tenant_id: tenantId,
          room_id: null,
          year: currentYear,
          month: currentMonth,
          amount,
          status: 'confirmed',
          confirmed_at: confirmedAt,
          marked_at: confirmedAt,
          landlord_email: property.landlord_email || landlordEmail,
        })
        .select('id, property_id, tenant_id, room_id, year, month, status, confirmed_at');
      console.log('[handleConfirmWithAmount] Resultado INSERT:', { data: insertData, error: insertError });
    }

    // Verificación: leer el registro recién guardado
    const { data: verifyData, error: verifyError } = await supabase
      .from('payments')
      .select('id, property_id, tenant_id, room_id, year, month, status, confirmed_at')
      .eq('property_id', String(property.id))
      .eq('tenant_id', tenantId)
      .eq('year', currentYear)
      .eq('month', currentMonth);
    console.log('[handleConfirmWithAmount] Verificación DB post-escritura:', { verifyData, verifyError });
  };

  const handleRejectPayment = async (tenantId) => {
    const updatedPayments = payments.filter(p =>
      !(p.year === currentYear && p.month === currentMonth && p.tenantId === tenantId)
    );
    setPayments(updatedPayments);
    onUpdate({ ...property, payments: updatedPayments });
    await supabase
      .from('payments')
      .delete()
      .eq('property_id', String(property.id))
      .eq('tenant_id', tenantId)
      .eq('year', currentYear)
      .eq('month', currentMonth);
    setPendingSupabasePayments(prev => prev.filter(p => p.tenant_id !== tenantId));
  };

  const handleCancelPayment = (tenantId) => {
    if (window.confirm('¿Estás seguro de que quieres cancelar este pago confirmado?')) {
      handleRejectPayment(tenantId);
    }
  };


  const getPaymentStatusInfo = (status) => {
    const statusMap = {
      'paid': { label: 'Pagado', color: 'green', icon: '✓' },
      'pending_confirmation': { label: 'Por confirmar', color: 'orange', icon: '⏱' },
      'pending': { label: 'Pendiente', color: 'gray', icon: '○' },
      'overdue': { label: 'Retrasado', color: 'red', icon: '!' },
      'not_yet': { label: 'Pendiente', color: 'gray', icon: '○' }
    };
    return statusMap[status] || statusMap['pending'];
  };

  const goToPrevMonth = () => {
    if (isAtMinMonth) return;
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else { setCurrentMonth(m => m - 1); }
  };

  const goToNextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else { setCurrentMonth(m => m + 1); }
  };

  useEffect(() => {
    if (pendingEditMode.current) {
      pendingEditMode.current = false;
      setIsEditMode(true);
    } else {
      setIsEditMode(false);
    }
  }, [currentYear, currentMonth]);

  const visibleExpenses = getExpensesForMonth(expenses, currentYear, currentMonth).filter(e => e.active !== false);

  const ownershipPct = property.ownershipPercentage || 100;
  const totalExpenses = visibleExpenses.reduce((sum, exp) => {
    if (exp.active === false) return sum;
    return sum + getMonthlyEquivalent(exp);
  }, 0);
  const myExpenses = visibleExpenses.reduce((sum, exp) => {
    if (exp.active === false) return sum;
    const pct = exp.expense_percentage != null ? exp.expense_percentage : ownershipPct;
    return sum + getMonthlyEquivalent(exp) * pct / 100;
  }, 0);
  
  const ownershipPercentage = property.ownershipPercentage || 100;
  const ownershipMultiplier = ownershipPercentage / 100;
  
  let monthlyIncome = 0;
  
  if (property.status === 'por_habitaciones') {
    // Suma todos los pagos confirmados de todas las habitaciones (pueden ser múltiples por habitación)
    monthlyIncome = rooms.reduce((sum, room) => {
      const roomConfirmed = payments.filter(p =>
        p.year === currentYear &&
        p.month === currentMonth &&
        p.roomId === room.id &&
        p.status === 'confirmed'
      );
      return sum + roomConfirmed.reduce((s, p) => s + (p.amount ?? room.price), 0);
    }, 0) * ownershipMultiplier;
  } else {
    // Suma pagos de inquilinos activos
    const activeTotal = tenants.reduce((sum, tenant) => {
      const tenantConfirmed = payments.filter(p =>
        p.year === currentYear &&
        p.month === currentMonth &&
        p.tenantId === tenant.id &&
        p.status === 'confirmed'
      );
      return sum + tenantConfirmed.reduce((s, p) => s + (p.amount ?? tenant.amount), 0);
    }, 0);
    // Suma pagos de ex-inquilinos
    const orphanTotal = payments
      .filter(p => p.year === currentYear && p.month === currentMonth && p.status === 'confirmed' && p.tenantName && !tenants.find(t => t.id === p.tenantId))
      .reduce((sum, p) => sum + (p.amount ?? 0), 0);
    monthlyIncome = (activeTotal + orphanTotal) * ownershipMultiplier;
  }
  
  const netIncome = isCurrentMonthFuture ? null : monthlyIncome - myExpenses;

  const getHistoryMonths = () => {
    const months = [];
    const start = property.createdAt ? new Date(property.createdAt) : new Date(now.getFullYear(), now.getMonth(), 1);
    let y = start.getFullYear();
    let m = start.getMonth();
    
    const ownershipPercentage = property.ownershipPercentage || 100;
    const ownershipMultiplier = ownershipPercentage / 100;
    
    while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth())) {
      const monthExpenses = getExpensesForMonth(expenses, y, m);
      const myExpenses = monthExpenses.reduce((sum, e) => {
        if (e.active === false) return sum;
        const pct = e.expense_percentage != null ? e.expense_percentage : ownershipPercentage;
        return sum + getMonthlyEquivalent(e) * pct / 100;
      }, 0);
      
      let allPaymentsTotal = 0;

      if (property.status === 'por_habitaciones') {
        // Solo pagos por roomId para evitar doble conteo
        allPaymentsTotal = (property.rooms || []).reduce((sum, room) => {
          const rp = payments.filter(p => p.year === y && p.month === m && p.roomId === room.id && p.status === 'confirmed');
          return sum + rp.reduce((s, p) => s + (p.amount ?? room.price), 0);
        }, 0);
      } else {
        // Pagos de inquilinos activos
        const confirmedPaymentsTotal = tenants.reduce((sum, tenant) => {
          const tenantPayments = payments.filter(p =>
            p.year === y && p.month === m && p.tenantId === tenant.id && p.status === 'confirmed'
          );
          return sum + tenantPayments.reduce((s, p) => s + (p.amount ?? tenant.amount), 0);
        }, 0);
        // Pagos de ex-inquilinos
        const orphanPaymentsTotal = payments
          .filter(p => p.year === y && p.month === m && p.status === 'confirmed' && p.tenantName && !tenants.find(t => t.id === p.tenantId))
          .reduce((sum, p) => sum + (p.amount ?? 0), 0);
        allPaymentsTotal = confirmedPaymentsTotal + orphanPaymentsTotal;
      }
      const income = allPaymentsTotal > 0 ? allPaymentsTotal * ownershipMultiplier : 0;
      
      const net = income - myExpenses;
      months.push({ year: y, month: m, income, expenses: myExpenses, net });
      if (m === 11) { m = 0; y++; } else { m++; }
    }
    return months.reverse();
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

  const handleDeleteExpense = (expense) => {
    const isRecurring = expense.type === 'recurrente_fijo' || expense.type === 'recurrente_temporal';
    if (isRecurring) {
      setDeleteExpenseModal({ expense });
    } else {
      supabase.from('expenses').delete().eq('id', expense.id);
      setExpenses(prev => prev.filter(e => e.id !== expense.id));
    }
  };

  const handleSkipExpenseMonth = async (expenseId) => {
    const expense = expenses.find(e => e.id === expenseId);
    const step = expense?.frequency === 'trimestral' ? 3
      : expense?.frequency === 'anual' ? 12
      : expense?.frequency === 'custom' ? (expense?.custom_frequency_months || 1)
      : 1;
    const monthsToSkip = [];
    let y = currentYear, m = currentMonth;
    for (let i = 0; i < step; i++) {
      monthsToSkip.push(`${y}-${String(m + 1).padStart(2, '0')}`);
      if (m === 11) { m = 0; y++; } else { m++; }
    }
    const currentSkipped = expense?.skipped_months || [];
    const updatedSkipped = [...new Set([...currentSkipped, ...monthsToSkip])];
    await supabase.from('expenses').update({ skipped_months: updatedSkipped }).eq('id', expenseId);
    setExpenses(prev => prev.map(e => e.id === expenseId ? { ...e, skipped_months: updatedSkipped } : e));
    setDeleteExpenseModal(null);
  };

  const handleDeleteExpensePermanently = async (expenseId) => {
    await supabase.from('expenses').delete().eq('id', expenseId);
    setExpenses(prev => prev.filter(e => e.id !== expenseId));
    setDeleteExpenseModal(null);
  };

  const handleUpdateExpense = async (expenseId, expenseData) => {
    const { data, error } = await supabase
      .from('expenses')
      .update(expenseData)
      .eq('id', expenseId)
      .select()
      .single();
    if (error) { alert(`Error actualizando el gasto: ${error.message}`); return; }
    setExpenses(prev => prev.map(e => e.id === expenseId ? data : e));
    setEditingExpense(null);
  };

  const handleUpdateVariableAmount = async (expenseId, newAmount) => {
    await supabase.from('expenses').update({ amount: parseFloat(newAmount) }).eq('id', expenseId);
    setExpenses(prev => prev.map(e => e.id === expenseId ? { ...e, amount: parseFloat(newAmount) } : e));
  };

  const handleAddTenant = async (tenantData) => {
    const code = generateTenantCode();
    const newTenant = {
      ...tenantData,
      id: Date.now().toString(),
      amount: tenantData.isShared === false ? property.price : tenantData.amount,
      tenantCode: code
    };
    const updatedTenants = [...tenants, newTenant];

    if (landlordEmail) {
      saveTenantCode(code, landlordEmail, property.id, newTenant.id);
    }

    // Guardar en Supabase
    if (landlordEmail) {
      const { data: insertedTenant, error: supabaseError } = await supabase.from('inquilinos').insert({
        email: tenantData.email ? tenantData.email.toLowerCase().trim() : null,
        landlord_email: landlordEmail,
        property_id: property.id,
        tenant_id: newTenant.id,
        tenant_code: code,
        tenant_name: tenantData.name,
        property_name: property.name,
        monthly_rent: newTenant.amount || property.price,
        payment_config: property.paymentConfig || { startDay: 1, endDay: 5 },
        room_id: null,
      });
      console.log('INSERT INQUILINO:', insertedTenant, supabaseError);
      if (supabaseError) {
        console.error('Error al guardar inquilino en Supabase:', supabaseError);
      } else {
        console.log('Inquilino guardado en Supabase correctamente:', code);
      }
    } else {
      console.warn('No se guardó en Supabase: landlordEmail no disponible');
    }

    const propertyUpdate = {
      ...property,
      tenants: updatedTenants,
      isSharedProperty: tenantData.isShared !== undefined ? tenantData.isShared : property.isSharedProperty
    };

    setTenants(updatedTenants);
    onUpdate(propertyUpdate);
    setShowAddTenant(false);
  };

  const handleEditTenant = (tenantData) => {
    const updatedTenants = tenants.map(t => 
      t.id === editingTenant.id ? { ...tenantData, id: t.id } : t
    );
    setTenants(updatedTenants);
    onUpdate({ ...property, tenants: updatedTenants });
    setEditingTenant(null);
  };

  const handleDeleteTenant = (tenantId) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar este inquilino?')) {
      const tenant = tenants.find(t => t.id === tenantId);
      // Conservar nombre en pagos existentes
      const updatedPayments = payments.map(p =>
        p.tenantId === tenantId && !p.tenantName
          ? { ...p, tenantName: tenant?.name }
          : p
      );
      const updatedTenants = tenants.filter(t => t.id !== tenantId);
      setTenants(updatedTenants);
      setPayments(updatedPayments);
      onUpdate({ ...property, tenants: updatedTenants, payments: updatedPayments });
      setEditingTenant(null);
    }
  };

  const handleAddRoom = (roomData) => {
    const newRoom = {
      ...roomData,
      id: Date.now().toString(),
      status: 'vacia',
      tenant: null
    };
    const updatedRooms = [...rooms, newRoom];
    setRooms(updatedRooms);
    onUpdate({ ...property, rooms: updatedRooms });
    setShowAddRoom(false);
  };

  const handleEditRoom = (updatedRoom) => {
    const updatedRooms = rooms.map(r => r.id === updatedRoom.id ? updatedRoom : r);
    setRooms(updatedRooms);
    onUpdate({ ...property, rooms: updatedRooms });
    setEditingRoom(null);
  };

  const handleDeleteRoom = (roomId) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar esta habitación?')) {
      const updatedRooms = rooms.filter(r => r.id !== roomId);
      setRooms(updatedRooms);
      onUpdate({ ...property, rooms: updatedRooms });
      setEditingRoom(null);
    }
  };

  const handleAssignTenantToRoom = (roomId, tenantData) => {
    const updatedRooms = rooms.map(r => 
      r.id === roomId ? { ...r, tenant: tenantData, status: 'ocupada' } : r
    );
    setRooms(updatedRooms);
    onUpdate({ ...property, rooms: updatedRooms });
  };

  const handleRemoveTenantFromRoom = (roomId) => {
    const updatedRooms = rooms.map(r => 
      r.id === roomId ? { ...r, tenant: null, status: 'vacia' } : r
    );
    setRooms(updatedRooms);
    onUpdate({ ...property, rooms: updatedRooms });
  };

  if (showDocuments) {
    return <PropertyDocuments property={property} landlordEmail={landlordEmail} onBack={() => setShowDocuments(false)} onUpdate={onUpdate} />;
  }

  if (showExpenseSummary) {
    const getMonthlyIncome = (yr, mo) =>
      payments
        .filter(p => p.year === yr && p.month === mo && p.status === 'confirmed')
        .reduce((s, p) => s + (p.amount ?? 0), 0) * ((property.ownershipPercentage || 100) / 100);
    return (
      <ExpenseSummary
        expenses={expenses}
        onBack={() => setShowExpenseSummary(false)}
        propertyName={property.name}
        getMonthlyIncome={getMonthlyIncome}
      />
    );
  }

  if (showPaymentHistory) {
    return <PaymentHistory property={property} payments={payments} onBack={() => setShowPaymentHistory(false)} />;
  }

  if (chatWithTenant) {
    return (
      <ChatConversation
        landlordEmail={landlordEmail}
        propertyId={property.id}
        roomId={chatWithTenant.roomId}
        tenantId={chatWithTenant.tenantId}
        tenantName={chatWithTenant.tenantName}
        propertyName={property.name}
        currentRole="landlord"
        onBack={() => setChatWithTenant(null)}
      />
    );
  }

  // ✅ CORREGIDO: buscar la habitación actualizada por ID en el array rooms local
  if (viewingRoomId) {
    const currentRoom = rooms.find(r => r.id === viewingRoomId);
    if (currentRoom) {
      return (
        <RoomDetail
          room={currentRoom}
          property={{ ...property, rooms, payments }}
          onBack={() => setViewingRoomId(null)}
          onUpdate={handleUpdate}
          landlordEmail={landlordEmail}
        />
      );
    }
  }

  const handleExpenseAdded = () => {
    supabase
      .from('expenses')
      .select('*')
      .eq('property_id', String(property.id))
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setExpenses(data); });
  };

  return (
    <div className="property-detail-container">

      {/* Header */}
      <div className="detail-header" ref={optionsMenuRef}>
        <button className="back-button" onClick={onBack}>←</button>
        <h1 className="detail-title">{property.name}</h1>
        {!readOnly && <button className="detail-options" onClick={() => setShowOptionsMenu(!showOptionsMenu)}>⋮</button>}
        {!readOnly && showOptionsMenu && (
          <div className="detail-options-menu">
            <button onClick={() => { setShowEditModal(true); setShowOptionsMenu(false); }} className="detail-option-item">Editar propiedad</button>
            {tenants.map(t => (
              <button key={t.id} className="detail-option-item" onClick={() => {
                let code = t.tenantCode;
                if (!code) {
                  code = generateTenantCode();
                  const updatedTenants = tenants.map(x => x.id === t.id ? { ...x, tenantCode: code } : x);
                  setTenants(updatedTenants);
                  onUpdate({ ...property, tenants: updatedTenants });
                  if (landlordEmail) saveTenantCode(code, landlordEmail, property.id, t.id);
                }
                setCodeModal({ name: t.name, code });
                setShowOptionsMenu(false);
              }}>
                Código{tenants.length > 1 ? ` de ${t.name.split(' ')[0]}` : ' del inquilino'}
              </button>
            ))}
            <button onClick={() => {
              if (window.confirm('¿Estás seguro de que quieres eliminar esta propiedad?')) {
                onUpdate({ ...property, deleted: true }); onBack();
              }
              setShowOptionsMenu(false);
            }} className="detail-option-item delete">Eliminar propiedad</button>
            <button className="detail-option-item" onClick={() => { setIsEditMonthPickerOpen(true); setShowOptionsMenu(false); }}>Editar mes pasado</button>
          </div>
        )}
        {codeModal && (
          <div className="modal-overlay" onClick={() => setCodeModal(null)}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
              <div className="modal-header">
                <h2>Código del inquilino</h2>
                <button className="modal-close" onClick={() => setCodeModal(null)}>×</button>
              </div>
              <p style={{ color: '#888', fontSize: '14px', margin: '0 0 20px' }}>Comparte este código con <strong>{codeModal.name}</strong></p>
              <div style={{ background: '#f5f5f5', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
                <p style={{ fontSize: '36px', fontWeight: '700', letterSpacing: '8px', margin: 0, color: '#111' }}>{codeModal.code}</p>
              </div>
              <button className="submit-button" onClick={() => { navigator.clipboard?.writeText(codeModal.code); }}>
                Copiar código
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Month Navigator */}
      <MonthNavigator
        year={currentYear}
        month={currentMonth}
        minYear={minYear}
        minMonth={minMonth}
        onPrev={goToPrevMonth}
        onNext={goToNextMonth}
        onJump={(yr, mo) => {
          const n = new Date();
          const isPast = yr < n.getFullYear() || (yr === n.getFullYear() && mo < n.getMonth());
          if (isPast) pendingEditMode.current = true;
          setCurrentYear(yr);
          setCurrentMonth(mo);
          setIsEditMonthPickerOpen(false);
        }}
        forcePickerOpen={isEditMonthPickerOpen}
        onPickerClose={() => setIsEditMonthPickerOpen(false)}
      />

      {/* Gauge */}
      <div className="profitability-section">
        <div className="gauge-chart">
          <svg width="360" height="220" viewBox="0 0 360 220">
            <path d="M 50 180 A 130 130 0 0 1 310 180" fill="none" stroke="#E0E0E0" strokeWidth="35" strokeLinecap="round"/>
            {!isCurrentMonthFuture && netIncome !== null && (
              netIncome >= 0 ? (
                <path d="M 50 180 A 130 130 0 0 1 310 180" fill="none" stroke="#4CAF50" strokeWidth="35" strokeLinecap="round"
                  strokeDasharray="408" strokeDashoffset={408 - (Math.min(netIncome / property.price, 1) * 408)}/>
              ) : (
                <path d="M 50 180 A 130 130 0 0 1 310 180" fill="none" stroke="#F44336" strokeWidth="35" strokeLinecap="round"/>
              )
            )}
          </svg>
          <div className="gauge-center">
            {isCurrentMonthFuture ? (
              <><div className="net-income future">—</div><div className="income-sublabel">Mes futuro</div></>
            ) : (
              <>
                <div className="net-income">{netIncome >= 0 ? '+' : ''}{netIncome.toFixed(2)} €</div>
                <div className="income-label">/mes</div>
                <div className="income-sublabel" style={{ color: netIncome < 0 && monthlyIncome === 0 && property.status !== 'uso_propio' ? '#F44336' : '#999' }}>
                  {netIncome < 0 && monthlyIncome === 0 && property.status !== 'uso_propio' ? 'Pago sin confirmar' : 'Neto'}
                </div>
              </>
            )}
          </div>
        </div>
        <p className="profitability-label">{isCurrentMonthFuture ? 'Sin datos todavía' : 'Rentabilidad mensual estimada'}</p>
      </div>

      {/* Estado */}
      <div className="info-card status-card" onClick={() => setShowDocuments(true)} style={{ cursor: 'pointer' }}>
        <div className="card-header">
          <div>
            <h3>Estado</h3>
            <div className="status-info">
              <span className={`status-dot ${property.status}`}></span>
              <span>
                {property.status === 'alquilado' ? 'Alquilado' :
                 property.status === 'por_habitaciones' ? 'Por habitaciones' :
                 property.status === 'otros' ? (tenants.length > 0 ? 'Alquilado' : 'Vacío') : 'Vacío'}
              </span>
            </div>
            {property.status === 'otros' && property.customType && (
              <p className="contract-date">{property.customType}</p>
            )}
            {property.status === 'alquilado' && property.contractEnd && (
              <p className="contract-date">Contrato hasta {property.contractEnd}</p>
            )}
            {property.status === 'por_habitaciones' && rooms.length > 0 && (
              <p className="contract-date">{rooms.filter(r => r.status === 'ocupada').length}/{rooms.length} ocupadas</p>
            )}
          </div>
          <button className="card-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Habitaciones */}
      {property.status === 'por_habitaciones' && (
        <div className="info-card rooms-card">
          <div className="card-header">
            <h3>Habitaciones</h3>
            {canEdit && (
              <button className="add-tenant-button" onClick={() => setShowAddRoom(true)}>
                + Añadir habitación
              </button>
            )}
          </div>
          
          {rooms.length > 0 && (
            <div className="rooms-grid">
              {rooms.map(room => {
                const roomPayment = payments.find(p =>
                  p.year === currentYear && p.month === currentMonth && p.roomId === room.id
                );
                const paymentDot = roomPayment?.status === 'confirmed' ? 'green'
                  : roomPayment?.status === 'pending' ? 'orange'
                  : room.tenant ? 'gray' : null;

                return (
                  <div key={room.id} className="room-card" onClick={() => setViewingRoomId(room.id)}>
                    <div className="room-header">
                      <h4 className="room-name">{room.name}</h4>
                      {room.tenant && paymentDot && (
                        <span style={{
                          width: '26px', height: '26px', borderRadius: '50%', display: 'inline-flex',
                          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          background: paymentDot === 'green' ? '#E8F5E9' : '#F5F5F5',
                        }}>
                          {paymentDot === 'green' ? (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                              <path d="M20 6L9 17l-5-5" stroke="#4CAF50" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          ) : (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="9" stroke={paymentDot === 'orange' ? '#FF9800' : '#9E9E9E'} strokeWidth="2.5"/>
                            </svg>
                          )}
                        </span>
                      )}
                    </div>
                    <p className="room-price">{room.price}€/mes</p>
                    <div className="room-tenant" style={{ borderTop: 'none', paddingTop: 0, marginTop: '10px' }}>
                      <span style={{
                        width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
                        background: room.tenant ? '#4CAF50' : '#F44336', display: 'inline-block'
                      }}></span>
                      {room.tenant
                        ? <span className="room-tenant-name">{room.tenant.name}</span>
                        : <span style={{ fontSize: '12px', color: '#aaa', margin: 0 }}>Vacía</span>
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Pago del alquiler */}
      {(property.status === 'alquilado' || property.status === 'otros') && (tenants.length > 0 || payments.some(p => p.year === currentYear && p.month === currentMonth && p.status === 'confirmed')) && (
        <div className="info-card payment-card">
          <div className="card-header">
            <h3>Pago del alquiler</h3>
          </div>
          
          <div className="payment-content">
            <div className="tenants-payment-grid">
              {tenants.map(tenant => {
                const tenantStatus = getTenantPaymentStatus(tenant.id);
                const supabasePaymentForTenant = pendingSupabasePayments.find(p => p.tenant_id === tenant.id);
                const localPayment = payments.find(p =>
                  p.year === currentYear && p.month === currentMonth && p.tenantId === tenant.id
                );
                // Supabase es fuente de verdad; localStorage como fallback solo para datos históricos
                const tenantPayment = supabasePaymentForTenant
                  ? {
                      ...localPayment,
                      amount: supabasePaymentForTenant.amount ?? localPayment?.amount,
                      status: supabasePaymentForTenant.status,
                      confirmedAt: supabasePaymentForTenant.confirmed_at ?? localPayment?.confirmedAt,
                    }
                  : localPayment;
                const statusInfo = getPaymentStatusInfo(tenantStatus);
                
                return (
                  <div key={tenant.id} className="tenant-payment-card">
                    <div className="tenant-payment-header">
                      <div className="tenant-avatar">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <circle cx="12" cy="7" r="4" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div className="tenant-payment-info">
                        {tenants.length > 1 && <p className="tenant-payment-name">{tenant.name}</p>}
                        <p className="tenant-payment-amount" style={tenants.length === 1 ? { margin: 0, fontSize: '15px', fontWeight: 600, color: '#111' } : {}}>{tenant.amount}€</p>
                      </div>
                      <span className={`payment-status-badge ${statusInfo.color} small`}>
                        {statusInfo.icon}
                      </span>
                    </div>

                    {canEdit && tenantStatus === 'pending_confirmation' && (
                      <div className="tenant-payment-actions">
                        <button className="payment-btn confirm small" onClick={() => setConfirmingTenant({ id: tenant.id, name: tenant.name, amount: tenant.amount })}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <polyline points="20 6 9 17 4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Confirmar
                        </button>
                        <button className="payment-btn reject small" onClick={() => handleRejectPayment(tenant.id)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Rechazar
                        </button>
                      </div>
                    )}

                    {tenantStatus === 'paid' && (
                      <div className="tenant-payment-actions">
                        <p className="payment-confirmed-text">
                          ✓ {tenantPayment?.amount !== undefined ? `${tenantPayment.amount} €` : `${tenant.amount} €`}
                          {tenantPayment?.amount !== undefined && tenantPayment.amount !== tenant.amount && (
                            <span style={{ fontSize: '11px', color: '#aaa', marginLeft: '4px' }}>(base: {tenant.amount} €)</span>
                          )}
                          {tenantPayment?.confirmedAt && ' · '}{tenantPayment?.confirmedAt && new Date(tenantPayment.confirmedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                        </p>
                        {canEdit && (
                          <button className="payment-cancel-link" onClick={() => handleCancelPayment(tenant.id)}>
                            Cancelar
                          </button>
                        )}
                      </div>
                    )}

                    {canEdit && (tenantStatus === 'pending' || tenantStatus === 'overdue' || tenantStatus === 'not_yet') && (
                      <div className="tenant-payment-actions">
                        <button className="payment-btn confirm small full-width" onClick={() => setConfirmingTenant({ id: tenant.id, name: tenant.name, amount: tenant.amount })}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <polyline points="20 6 9 17 4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Confirmar pago
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pagos de ex-inquilinos que ya no están */}
            {payments
              .filter(p => p.year === currentYear && p.month === currentMonth && p.status === 'confirmed' && p.tenantName && !tenants.find(t => t.id === p.tenantId))
              .map(p => (
                <div key={p.tenantId || p.tenantName} className="tenant-payment-card" style={{ background: '#f9f9f9', marginTop: '8px' }}>
                  <div className="tenant-payment-header">
                    <div className="tenant-avatar">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="#bbb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <circle cx="12" cy="7" r="4" stroke="#bbb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div className="tenant-payment-info">
                      <p className="tenant-payment-name" style={{ color: '#888' }}>{p.tenantName}</p>
                      <p className="tenant-payment-amount">{p.amount} €</p>
                    </div>
                    <span className="payment-status-badge green small">✓</span>
                  </div>
                  <div className="tenant-payment-actions">
                    <p className="payment-confirmed-text">
                      ✓ {new Date(p.confirmedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                    </p>
                    <button className="payment-cancel-link" onClick={() => {
                      if (window.confirm('¿Eliminar este pago del historial?')) {
                        const updated = payments.filter(x => !(x.year === p.year && x.month === p.month && x.tenantId === p.tenantId && x.tenantName === p.tenantName));
                        setPayments(updated);
                        onUpdate({ ...property, payments: updated });
                      }
                    }}>Eliminar</button>
                  </div>
                </div>
              ))
            }

            <div className="payment-info-single" style={{ padding: '8px 12px', background: 'none', border: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke="#aaa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="16" y1="2" x2="16" y2="6" stroke="#aaa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="8" y1="2" x2="8" y2="6" stroke="#aaa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="3" y1="10" x2="21" y2="10" stroke="#aaa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span style={{ fontSize: '12px', color: '#aaa' }}>
                  Rango de pago: {paymentConfig.startDay}–{paymentConfig.endDay} {new Date(currentYear, currentMonth).toLocaleDateString('es-ES', { month: 'short' })}
                </span>
              </div>
            </div>

            <button className="payment-history-btn" onClick={() => setShowPaymentHistory(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <polyline points="23 4 23 10 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Historial de pagos
            </button>
          </div>
        </div>
      )}

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
              <span>{totalExpenses.toFixed(2)} €/mes</span>
              <span className="arrow">{showExpenses ? '▼' : '›'}</span>
            </span>
          </div>
        </div>
        {showExpenses && (
          <div className="expenses-detail">
            {visibleExpenses.length === 0 ? (
              <p className="no-expenses">{isCurrentMonthFuture ? 'No hay datos para meses futuros' : 'No hay gastos añadidos'}</p>
            ) : (
              visibleExpenses.map(expense => {
                // variable con frecuencia programada y sin importe → pendiente
                const isPendingVariable = expense.type === 'recurrente_variable'
                  && expense.frequency !== 'manual'
                  && !expense.amount;
                const monthly = getMonthlyEquivalent(expense);
                const expPct = expense.expense_percentage != null ? expense.expense_percentage : ownershipPct;
                const freqLabel = { trimestral: 'Trimestral', anual: 'Anual', unico: 'Único', manual: 'Manual', custom: `Cada ${expense.custom_frequency_months}m`, mensual: null }[expense.frequency] || null;
                const typeLabel = { recurrente_fijo: 'Fijo', recurrente_variable: 'Variable', recurrente_temporal: 'Temporal', puntual: 'Único' }[expense.type] || null;
                const sourceRoom = expense.room_id ? rooms.find(r => String(r.id) === String(expense.room_id)) : null;
                return (
                  <div key={expense.id} className="expense-item" style={{ opacity: expense.active === false ? 0.5 : 1 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span>{expense.name}</span>
                        {sourceRoom && (
                          <span style={{
                            fontSize: 10, background: '#E3F2FD', color: '#1565C0',
                            padding: '2px 6px', borderRadius: 8, fontWeight: 600, flexShrink: 0,
                          }}>
                            {sourceRoom.name}
                          </span>
                        )}
                        {expense.attachment_url && (
                          <a href={expense.attachment_url} target="_blank" rel="noreferrer" title="Ver adjunto" onClick={e => e.stopPropagation()} style={{ color: '#90CAF9', lineHeight: 1, display: 'flex', alignItems: 'center' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                            </svg>
                          </a>
                        )}
                        {typeLabel && <span className={`frequency-badge ${expense.type}`} style={{ fontSize: 10 }}>{typeLabel}</span>}
                        {freqLabel && expense.frequency !== 'unico' && <span className={`frequency-badge ${expense.frequency}`}>{freqLabel}</span>}
                        {expense.type === 'recurrente_temporal' && expense.duration_payments && (
                          <span style={{ fontSize: 10, color: '#aaa' }}>({calcPaymentsMade(expense)}/{expense.duration_payments} pagos)</span>
                        )}
                        {expPct !== ownershipPct && (
                          <span style={{ fontSize: 10, color: '#888' }}>{expPct}%</span>
                        )}
                        {expense.active === false && <span style={{ fontSize: 10, color: '#aaa' }}>Pausado</span>}
                      </div>
                      {isPendingVariable && (
                        <PendingVariableInput expenseId={expense.id} onSave={handleUpdateVariableAmount} />
                      )}
                    </div>
                    <div className="expense-actions" style={{ gap: 6 }}>
                      <span style={{ color: isPendingVariable ? '#FFA726' : undefined }}>
                        {isPendingVariable
                          ? '— €'
                          : expense.frequency === 'manual' && !expense.amount
                            ? '— €'
                            : `${monthly.toFixed(2)} €/mes`}
                      </span>
                      {expense.frequency === 'manual' && (
                        <PendingVariableInput expenseId={expense.id} onSave={handleUpdateVariableAmount} buttonLabel="+ Importe" />
                      )}
                      {canEdit && (
                        <ExpenseMenu
                          expenseId={expense.id}
                          openMenuId={openMenuExpenseId}
                          setOpenMenuId={setOpenMenuExpenseId}
                          onEdit={() => { setEditingExpense(expense); setOpenMenuExpenseId(null); }}
                          onDelete={() => handleDeleteExpense(expense)}
                        />
                      )}
                    </div>
                  </div>
                );
              })
            )}
            {visibleExpenses.length > 0 && (
              <div className="expense-item total"><strong>Equiv. mensual</strong><strong>{totalExpenses.toFixed(2)} €</strong></div>
            )}
            {canEdit && <button className="add-expense-button" onClick={() => setShowAddExpense(true)}>+ Añadir gasto</button>}
          </div>
        )}
        {!showExpenses && canEdit && (
          <button className="add-expense-button" onClick={() => setShowAddExpense(true)}>+ Añadir gasto</button>
        )}
      </div>

      {/* Inquilinos */}
      {(property.status === 'alquilado' || property.status === 'otros') && (
        <div className="info-card tenant-card">
          <div className="card-header">
            <h3>Inquilinos</h3>
            {canEdit && (tenants.length === 0 || property.isSharedProperty) && (
              <button className="add-tenant-button" onClick={() => setShowAddTenant(true)}>
                + Añadir inquilino
              </button>
            )}
          </div>
          
          {tenants.length > 0 && (
            <div className="tenants-list">
              {tenants.map(tenant => (
                <div key={tenant.id} className="tenant-item" onClick={() => setEditingTenant(tenant)}>
                  <div className="tenant-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <circle cx="12" cy="7" r="4" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div className="tenant-item-info">
                    <p className="tenant-name">{tenant.name}</p>
                    <p className="tenant-phone">{tenant.phone}</p>
                    {property.isSharedProperty && (
                      <p className="tenant-amount-small">{tenant.amount}€/mes</p>
                    )}
                  </div>
                  <button className="tenant-chat-icon" onClick={(e) => { e.stopPropagation(); setChatWithTenant({ tenantId: tenant.id, tenantName: tenant.name, roomId: null }); }}>
                    <div style={{ position: 'relative', display: 'inline-flex' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      {(unreadCounts[tenant.id] || 0) > 0 && (
                        <span style={{
                          position: 'absolute', top: -4, right: -4,
                          background: '#e74c3c', color: 'white',
                          borderRadius: '50%', width: 16, height: 16,
                          fontSize: 10, fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {unreadCounts[tenant.id]}
                        </span>
                      )}
                    </div>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Historial */}
      <div className="info-card history-card">
        <div className="card-header clickable" onClick={() => setShowHistory(!showHistory)}>
          <h3>Historial</h3>
          <span className="arrow">{showHistory ? '▼' : '›'}</span>
        </div>

        {showHistory && (() => {
          const historyMonths = getHistoryMonths();
          const accumulated = historyMonths.reduce((sum, m) => sum + m.net, 0);
          return (
            <div className="history-detail">
              <div className="export-buttons">
                <button className="export-btn excel" onClick={() => exportToExcel(property.name, historyMonths, accumulated)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Exportar Excel
                </button>
                <button className="export-btn pdf" onClick={() => exportToPDF(property.name, historyMonths, accumulated)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Exportar PDF
                </button>
              </div>

              <div className="history-table-header">
                <span>Mes</span>
                <span>Estado</span>
                <span>Ingresos</span>
                <span>Gastos</span>
                <span>Neto</span>
              </div>

              {historyMonths.map((item) => (
                <div key={`${item.year}-${item.month}`} className="history-row"
                  onClick={() => { setCurrentYear(item.year); setCurrentMonth(item.month); setShowHistory(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                  <span className="history-month">{formatMonthYear(item.year, item.month)}</span>
                  <span className={`history-status ${property.status}`}>
                    {property.status === 'por_habitaciones'
                      ? `${(property.rooms || []).filter(r => r.tenant).length}/${(property.rooms || []).length} hab.`
                      : property.status === 'alquilado' ? 'Alquilado'
                      : property.status === 'otros' ? (property.customType || 'Otros') : 'Vacío'}
                  </span>
                  <span className="history-income">+{item.income.toFixed(0)} €</span>
                  <span className="history-expenses">-{item.expenses.toFixed(0)} €</span>
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
          <div style={{ padding: '4px 4px 8px' }}>
            <InvestmentForm
              property={property}
              expenses={expenses}
              onUpdate={onUpdate}
              landlordEmail={landlordEmail}
              onExpenseAdded={handleExpenseAdded}
            />
          </div>
        )}
      </div>

      {/* Modals */}
      {(showAddExpense || editingExpense) && (
        <AddExpenseModal
          onClose={() => { setShowAddExpense(false); setEditingExpense(null); }}
          onAdd={handleAddExpense}
          onUpdate={handleUpdateExpense}
          defaultExpensePct={property.ownershipPercentage || 100}
          initialExpense={editingExpense}
          landlordEmail={landlordEmail}
          propertyId={property.id}
        />
      )}
      {showAddTenant && <AddTenantModal onClose={() => setShowAddTenant(false)} onAdd={handleAddTenant} isFirstTenant={tenants.length === 0} />}
      {showAddRoom && <AddRoomModal onClose={() => setShowAddRoom(false)} onAdd={handleAddRoom} />}
      {confirmingTenant && (
        <ConfirmPaymentModal
          defaultAmount={confirmingTenant.amount}
          tenantName={confirmingTenant.name}
          onClose={() => setConfirmingTenant(null)}
          onConfirm={(amount) => handleConfirmWithAmount(confirmingTenant.id, amount)}
        />
      )}
      {editingRoom && (
        <EditRoomModal 
          room={editingRoom}
          onClose={() => setEditingRoom(null)}
          onSave={handleEditRoom}
          onDelete={handleDeleteRoom}
          onAssignTenant={handleAssignTenantToRoom}
          onRemoveTenant={handleRemoveTenantFromRoom}
        />
      )}
      {showEditModal && (
        <EditPropertyModal property={property} onClose={() => setShowEditModal(false)}
          onSave={(updatedData) => { onUpdate({ ...property, ...updatedData }); setShowEditModal(false); }}/>
      )}
      {editingTenant && (
        <EditTenantModal
          tenant={editingTenant}
          paymentConfig={paymentConfig}
          onClose={() => setEditingTenant(null)}
          onSave={(updatedTenant, updatedConfig) => {
            handleEditTenant(updatedTenant);
            if (updatedConfig) {
              setPaymentConfig(updatedConfig);
              onUpdate({ ...property, paymentConfig: updatedConfig });
            }
          }}
          onDelete={handleDeleteTenant}
        />
      )}
      {deleteExpenseModal && (() => {
        const freq = deleteExpenseModal.expense.frequency;
        const customMonths = deleteExpenseModal.expense.custom_frequency_months || 1;
        const periodLabel = freq === 'anual' ? 'este año'
          : freq === 'trimestral' ? 'este trimestre'
          : freq === 'custom' && customMonths === 6 ? 'este semestre'
          : freq === 'custom' && customMonths === 2 ? 'este bimestre'
          : freq === 'custom' ? `estos ${customMonths} meses`
          : 'este mes';
        const buttonLabel = freq === 'anual' ? 'Solo este año'
          : freq === 'trimestral' ? 'Solo este trimestre'
          : freq === 'custom' && customMonths === 6 ? 'Solo este semestre'
          : freq === 'custom' && customMonths === 2 ? 'Solo este bimestre'
          : freq === 'custom' ? `Solo estos ${customMonths} meses`
          : 'Solo este mes';
        return (
          <div className="modal-overlay" onClick={() => setDeleteExpenseModal(null)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Eliminar gasto</h2>
                <button className="modal-close" onClick={() => setDeleteExpenseModal(null)}>×</button>
              </div>
              <p style={{ color: '#555', fontSize: '14px', margin: '0 0 20px', lineHeight: 1.5 }}>
                ¿Cómo quieres eliminar <strong>{deleteExpenseModal.expense.name}</strong>?
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  onClick={() => handleSkipExpenseMonth(deleteExpenseModal.expense.id)}
                  style={{ padding: '12px', borderRadius: '10px', border: '1px solid #ddd', background: 'white', fontSize: '15px', cursor: 'pointer', color: '#333', textAlign: 'left' }}
                >
                  <span style={{ display: 'block', fontWeight: 600 }}>{buttonLabel}</span>
                  <span style={{ display: 'block', fontSize: '12px', color: '#888', marginTop: 2 }}>
                    El gasto se omite {periodLabel} pero sigue activo los demás períodos
                  </span>
                </button>
                <button
                  onClick={() => handleDeleteExpensePermanently(deleteExpenseModal.expense.id)}
                  style={{ padding: '12px', borderRadius: '10px', border: 'none', background: '#F44336', fontSize: '15px', cursor: 'pointer', color: 'white', textAlign: 'left' }}
                >
                  <span style={{ display: 'block', fontWeight: 600 }}>Definitivamente</span>
                  <span style={{ display: 'block', fontSize: '12px', color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
                    Elimina el gasto de forma permanente
                  </span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function PaymentHistory({ property, payments, onBack }) {
  const formatMonthYear = (year, month) => {
    const date = new Date(year, month, 1);
    return date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
      .replace(/^\w/, c => c.toUpperCase());
  };

  const sortedPayments = [...payments].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });

  return (
    <div className="payment-history-container">
      <div className="detail-header">
        <button className="back-button" onClick={onBack}>←</button>
        <h1 className="detail-title">Historial de pagos</h1>
      </div>

      <div className="payment-history-list">
        {sortedPayments.length === 0 ? (
          <div className="no-payments">
            <p>No hay pagos registrados todavía</p>
          </div>
        ) : (
          sortedPayments.map((payment, index) => (
            <div key={index} className="payment-history-item">
              <div className="payment-month">
                <h3>{formatMonthYear(payment.year, payment.month)}</h3>
                <span className={`payment-status-badge ${payment.status === 'confirmed' ? 'green' : 'orange'}`}>
                  {payment.status === 'confirmed' ? '✓ Pagado' : '⏱ Pendiente'}
                </span>
              </div>
              <div className="payment-details">
                <div className="payment-detail-row">
                  <span className="detail-label">Marcado por inquilino:</span>
                  <span>{new Date(payment.markedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                </div>
                {payment.status === 'confirmed' && payment.confirmedAt && (
                  <div className="payment-detail-row">
                    <span className="detail-label">Confirmado:</span>
                    <span>{new Date(payment.confirmedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PendingVariableInput({ expenseId, onSave, buttonLabel }) {
  const [value, setValue] = useState('');
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} style={{ marginTop: 4, fontSize: 11, background: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: 6, padding: '3px 8px', color: '#E65100', cursor: 'pointer' }}>
        {buttonLabel || '⚠ Introducir importe'}
      </button>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
      <input
        type="number"
        step="0.01"
        placeholder="0.00"
        value={value}
        onChange={e => setValue(e.target.value)}
        style={{ width: 80, fontSize: 13, padding: '3px 6px', borderRadius: 6, border: '1px solid #ddd' }}
        autoFocus
      />
      <button
        onClick={() => { if (value) { onSave(expenseId, value); setEditing(false); } }}
        style={{ fontSize: 11, background: '#4CAF50', color: 'white', border: 'none', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}
      >
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


function AddExpenseModal({ onClose, onAdd, onUpdate, defaultExpensePct, initialExpense, defaultValues, landlordEmail, propertyId }) {
  const today = new Date().toISOString().split('T')[0];
  const isEditing = !!initialExpense;
  const [category, setCategory] = useState(isEditing ? (initialExpense.category || '') : (defaultValues?.category || ''));
  const [subcategory, setSubcategory] = useState(isEditing ? (initialExpense.subcategory || '') : '');
  const [description, setDescription] = useState(isEditing ? (initialExpense.description || '') : '');
  const [amount, setAmount] = useState(isEditing ? (initialExpense.amount != null ? String(initialExpense.amount) : '') : (defaultValues?.amount != null ? String(defaultValues.amount) : ''));
  const [repeats, setRepeats] = useState(isEditing ? initialExpense.frequency !== 'unico' : (defaultValues?.repeats ?? false));
  const [frequency, setFrequency] = useState(isEditing ? (initialExpense.frequency === 'unico' ? 'mensual' : initialExpense.frequency) : (defaultValues?.frequency || 'mensual'));
  const [customFreqMonths, setCustomFreqMonths] = useState(isEditing ? (initialExpense.custom_frequency_months ? String(initialExpense.custom_frequency_months) : '') : '');
  const [durationType, setDurationType] = useState(isEditing ? (initialExpense.duration_payments ? 'pagos' : 'indefinido') : 'indefinido');
  const [durationPayments, setDurationPayments] = useState(isEditing ? (initialExpense.duration_payments ? String(initialExpense.duration_payments) : '') : '');
  const [startDate, setStartDate] = useState(isEditing ? (initialExpense.start_date || today) : today);
  const [expensePct, setExpensePct] = useState(isEditing ? (initialExpense.expense_percentage != null ? String(initialExpense.expense_percentage) : '') : (defaultExpensePct != null ? String(defaultExpensePct) : ''));
  const fileInputRef = React.useRef(null);
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [attachmentUrl, setAttachmentUrl] = useState(isEditing ? (initialExpense.attachment_url || '') : '');
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [selectedFolderPath, setSelectedFolderPath] = useState(null); // null = no elegido, '' = raíz

  const handleCategoryChange = (val) => { setCategory(val); setSubcategory(''); };

  const handleFolderSelected = (folderPath) => {
    setAttachmentFile(pendingFile);
    setSelectedFolderPath(folderPath);
    setPendingFile(null);
    setShowFolderPicker(false);
  };

  const hasAmount = amount !== '' && parseFloat(amount) > 0;
  const derivedType = !repeats
    ? 'puntual'
    : hasAmount
      ? (durationType === 'pagos' ? 'recurrente_temporal' : 'recurrente_fijo')
      : 'recurrente_variable';

  const freqStep = frequency === 'trimestral' ? 3 : frequency === 'anual' ? 12 : frequency === 'custom' ? (parseInt(customFreqMonths) || 1) : 1;
  const freqLabel = frequency === 'trimestral' ? 'trimestre' : frequency === 'anual' ? 'año' : frequency === 'custom' ? `${customFreqMonths || '?'} meses` : 'mes';
  const monthlyEquiv = amount && repeats && frequency !== 'mensual' ? (parseFloat(amount) / freqStep).toFixed(2) : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    let finalAttachmentUrl = attachmentUrl;
    if (attachmentFile) {
      setUploading(true);
      try {
        const safeName = attachmentFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        // selectedFolderPath: null = picker no usado (fallback gastos), '' = raíz, 'X' = carpeta X
        const uploadPath = selectedFolderPath !== null
          ? `${landlordEmail}/${propertyId}${selectedFolderPath ? '/' + selectedFolderPath : ''}/${Date.now()}_${safeName}`
          : `${landlordEmail}/gastos/${propertyId}/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage.from('documentos').upload(uploadPath, attachmentFile, { upsert: false });
        if (upErr) {
          if (upErr.message?.includes('Bucket not found') || upErr.statusCode === 404 || upErr.error === 'Bucket not found') {
            throw new Error('El bucket "documentos" no existe en Supabase Storage.\n\nCómo crearlo:\n1. Ve al dashboard de Supabase\n2. Entra en Storage → New Bucket\n3. Nombre: "documentos"\n4. Activa "Public bucket"\n5. Haz clic en "Create bucket"');
          }
          throw upErr;
        }
        finalAttachmentUrl = supabase.storage.from('documentos').getPublicUrl(uploadPath).data.publicUrl;
      } catch (err) {
        alert(`Error subiendo el archivo: ${err.message}`);
        setUploading(false);
        return;
      }
      setUploading(false);
    }
    const catObj = EXPENSE_CATEGORIES.find(c => c.key === category);
    const parts = [catObj?.label || category];
    if (subcategory) parts.push(subcategory);
    if (description) parts.push(description);
    const expenseData = {
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
      attachment_url: finalAttachmentUrl || null,
    };
    if (isEditing) {
      onUpdate(initialExpense.id, expenseData);
    } else {
      onAdd(expenseData);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2>{isEditing ? 'Editar gasto' : 'Añadir gasto'}</h2><button className="modal-close" onClick={onClose}>×</button></div>
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
            <label>{!repeats ? 'Fecha del gasto' : 'Fecha de inicio'}</label>
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
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                style={{ display: 'none' }}
                onChange={e => {
                const file = e.target.files[0];
                if (!file) return;
                setPendingFile(file);
                setShowFolderPicker(true);
                e.target.value = '';
              }}
              />
              <button
                type="button"
                title="Adjuntar imagen o PDF"
                onClick={() => fileInputRef.current?.click()}
                style={{ background: attachmentFile ? '#E3F2FD' : 'none', border: '1px solid #ddd', borderRadius: 8, padding: '10px', cursor: 'pointer', color: attachmentFile ? '#1976D2' : '#aaa', lineHeight: 1, flexShrink: 0, display: 'flex', alignItems: 'center' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                </svg>
              </button>
            </div>
            {attachmentFile && (
              <p style={{ fontSize: 11, color: '#555', marginTop: 4 }}>📄 {attachmentFile.name}</p>
            )}
            {!attachmentFile && attachmentUrl && (
              <p style={{ fontSize: 11, marginTop: 4 }}>
                <a href={attachmentUrl} target="_blank" rel="noreferrer" style={{ color: '#2196F3' }}>Ver archivo adjunto actual</a>
                <button type="button" onClick={() => setAttachmentUrl('')} style={{ marginLeft: 8, fontSize: 10, background: 'none', border: 'none', color: '#aaa', cursor: 'pointer' }}>Quitar</button>
              </p>
            )}
            {uploading && <p style={{ fontSize: 11, color: '#888', marginTop: 4 }}>Subiendo archivo…</p>}
          </div>
          <button type="submit" className="submit-button" disabled={uploading}>{isEditing ? 'Guardar cambios' : 'Añadir gasto'}</button>
        </form>
      </div>
      {showFolderPicker && (
        <FolderPickerModal
          landlordEmail={landlordEmail}
          propertyId={propertyId}
          onClose={() => { setShowFolderPicker(false); setPendingFile(null); }}
          onConfirm={handleFolderSelected}
        />
      )}
    </div>
  );
}

function FolderPickerModal({ landlordEmail, propertyId, onClose, onConfirm }) {
  const [allFolders, setAllFolders] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [currentView, setCurrentView] = React.useState('');
  const [selectedPath, setSelectedPath] = React.useState('');
  const [showNewFolder, setShowNewFolder] = React.useState(false);
  const [newFolderName, setNewFolderName] = React.useState('');

  React.useEffect(() => {
    setLoading(true);
    supabase.from('folders').select('*')
      .eq('landlord_email', landlordEmail)
      .eq('property_id', propertyId)
      .then(({ data }) => { setAllFolders(data || []); setLoading(false); });
  }, [landlordEmail, propertyId]);

  const getDirectChildren = (parentPath) =>
    allFolders.filter(f => {
      if (!parentPath) return !f.path.includes('/');
      const prefix = parentPath + '/';
      return f.path.startsWith(prefix) && !f.path.slice(prefix.length).includes('/');
    });

  const breadcrumbs = ['Inicio', ...currentView.split('/').filter(Boolean)];

  const navigateTo = (idx) => {
    if (idx === 0) setCurrentView('');
    else {
      const parts = currentView.split('/').filter(Boolean);
      setCurrentView(parts.slice(0, idx).join('/'));
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const newPath = currentView ? `${currentView}/${newFolderName.trim()}` : newFolderName.trim();
    const { data, error } = await supabase.from('folders').insert({
      landlord_email: landlordEmail,
      property_id: propertyId,
      path: newPath,
      name: newFolderName.trim(),
    }).select().single();
    if (!error && data) {
      setAllFolders(prev => [...prev, data]);
      setSelectedPath(newPath);
    }
    setNewFolderName('');
    setShowNewFolder(false);
  };

  const directFolders = getDirectChildren(currentView);
  const confirmLabel = !selectedPath
    ? 'Guardar en la raíz'
    : `Guardar en "${allFolders.find(f => f.path === selectedPath)?.name || selectedPath}"`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content folder-picker-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>¿Dónde guardar?</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* Breadcrumb */}
        <div className="picker-breadcrumb">
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <span className="picker-sep">›</span>}
              <button
                className={`picker-crumb${idx === breadcrumbs.length - 1 ? ' active' : ''}`}
                onClick={() => navigateTo(idx)}
              >{crumb}</button>
            </React.Fragment>
          ))}
        </div>

        {/* Save here option */}
        <button
          className={`picker-here-btn${selectedPath === currentView ? ' selected' : ''}`}
          onClick={() => setSelectedPath(currentView)}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <polyline points="9 22 9 12 15 12 15 22"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Guardar aquí
          {selectedPath === currentView && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 'auto' }}>
              <polyline points="20 6 9 17 4 12" stroke="#4CAF50" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>

        {/* Folder list */}
        {loading ? (
          <p style={{ textAlign: 'center', color: '#aaa', padding: '16px 0' }}>Cargando carpetas…</p>
        ) : (
          <div className="picker-folder-list">
            {directFolders.map(f => (
              <div key={f.id} className={`picker-folder-row${selectedPath === f.path ? ' selected' : ''}`}>
                <button className="picker-folder-select" onClick={() => setSelectedPath(f.path)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                      fill="#FFF3E0" stroke="#F5A623" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>{f.name}</span>
                  {selectedPath === f.path && (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                      <polyline points="20 6 9 17 4 12" stroke="#4CAF50" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
                <button className="picker-enter-btn" onClick={() => setCurrentView(f.path)} title="Entrar en carpeta">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <polyline points="9 18 15 12 9 6" stroke="#bbb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            ))}

            {showNewFolder ? (
              <div className="picker-new-folder-row">
                <input
                  autoFocus
                  type="text"
                  placeholder="Nombre de carpeta"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleCreateFolder();
                    if (e.key === 'Escape') setShowNewFolder(false);
                  }}
                />
                <button onClick={handleCreateFolder}>OK</button>
                <button onClick={() => setShowNewFolder(false)}>×</button>
              </div>
            ) : (
              <button className="picker-add-folder-btn" onClick={() => setShowNewFolder(true)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                Nueva carpeta aquí
              </button>
            )}
          </div>
        )}

        <button className="submit-button" style={{ marginTop: 16 }} onClick={() => onConfirm(selectedPath)}>
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

function AddTenantModal({ onClose, onAdd, isFirstTenant }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [isShared, setIsShared] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isFirstTenant && !isShared) {
      onAdd({ name, email, phone, isShared: false });
    } else {
      onAdd({ name, email, phone, amount: parseFloat(amount), isShared: isFirstTenant ? true : undefined });
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h2>Añadir inquilino</h2><button className="modal-close" onClick={onClose}>×</button></div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nombre completo</label>
            <input type="text" placeholder="Ej: Laura Martínez" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Email del inquilino <span style={{ fontWeight: 400, color: '#999' }}>(opcional)</span></label>
            <input type="email" placeholder="laura@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Teléfono <span style={{ fontWeight: 400, color: '#999' }}>(opcional)</span></label>
            <input type="tel" placeholder="622 280 559" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} />
          </div>
          {isFirstTenant && (
            <div className="form-group">
              <label>¿Es compartido?</label>
              <div className="shared-options">
                <button type="button" className={`shared-option ${!isShared ? 'selected' : ''}`} onClick={() => setIsShared(false)}>No, inquilino único</button>
                <button type="button" className={`shared-option ${isShared ? 'selected' : ''}`} onClick={() => setIsShared(true)}>Sí, más de un inquilino</button>
              </div>
              {!isShared && (
                <p className="payment-range-note" style={{ marginTop: '8px' }}>El inquilino pagará el alquiler completo</p>
              )}
            </div>
          )}
          {(!isFirstTenant || isShared) && (
            <div className="form-group">
              <label>Cantidad que paga (€/mes)</label>
              <input type="number" placeholder="300" value={amount} onChange={(e) => setAmount(e.target.value)} required step="0.01" />
            </div>
          )}
          <button type="submit" className="submit-button">Añadir inquilino</button>
        </form>
      </div>
    </div>
  );
}

function EditTenantModal({ tenant, paymentConfig, onClose, onSave, onDelete }) {
  const [name, setName] = useState(tenant.name);
  const [phone, setPhone] = useState(formatPhone(tenant.phone || ''));
  const [amount, setAmount] = useState(tenant.amount?.toString() || '');
  const [paymentStartDay, setPaymentStartDay] = useState(paymentConfig?.startDay?.toString() || '1');
  const [paymentEndDay, setPaymentEndDay] = useState(paymentConfig?.endDay?.toString() || '5');
  
  const handleSubmit = (e) => { 
    e.preventDefault(); 
    if (paymentConfig) {
      onSave({
        ...tenant,
        name,
        phone,
        amount: parseFloat(amount)
      }, {
        startDay: parseInt(paymentStartDay),
        endDay: parseInt(paymentEndDay),
        limitDay: parseInt(paymentEndDay)
      });
    } else {
      onSave({ ...tenant, name, phone, amount: parseFloat(amount) });
    }
  };
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h2>Editar inquilino</h2><button className="modal-close" onClick={onClose}>×</button></div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nombre completo</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Teléfono</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} />
          </div>
          <div className="form-group">
            <label>Cantidad que paga (€/mes)</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required step="0.01" />
          </div>
          <div className="form-group">
            <label>Rango de días para pagar el alquiler</label>
            <div className="payment-range-inputs">
              <div className="payment-day-input">
                <label>Del día</label>
                <input type="number" min="1" max="28" value={paymentStartDay} onChange={(e) => setPaymentStartDay(e.target.value)} required />
              </div>
              <span className="range-separator">—</span>
              <div className="payment-day-input">
                <label>Al día</label>
                <input type="number" min="1" max="31" value={paymentEndDay} onChange={(e) => setPaymentEndDay(e.target.value)} required />
              </div>
            </div>
            <p className="payment-range-note">El inquilino deberá marcar el pago entre el día {paymentStartDay} y {paymentEndDay} de cada mes</p>
          </div>
          <div className="modal-buttons">
            <button type="submit" className="submit-button">Guardar cambios</button>
            <button type="button" className="delete-button" onClick={() => onDelete(tenant.id)}>Eliminar inquilino</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditPropertyModal({ property, onClose, onSave }) {
  const [name, setName] = useState(property.name);
  const [price, setPrice] = useState(
    (property.status === 'uso_propio' || property.status === 'vacio') ? '' : property.price.toString()
  );
  const [status, setStatus] = useState(property.status);
  const [ownershipPercentage, setOwnershipPercentage] = useState(property.ownershipPercentage?.toString() || '100');

  const showPrice = ['alquilado', 'por_habitaciones', 'vacacional', 'otros'].includes(status);

  const handleStatusChange = (newStatus) => {
    setStatus(newStatus);
    if (newStatus === 'uso_propio' || newStatus === 'vacio') {
      setPrice('');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      name,
      price: showPrice ? (parseInt(price) || 0) : 0,
      status,
      ownershipPercentage: parseFloat(ownershipPercentage),
    });
  };

  const STATUS_OPTIONS = [
    ['vacio', 'Vacío'],
    ['alquilado', 'Alquilado'],
    ['por_habitaciones', 'Por habitaciones'],
    ['vacacional', 'Vacacional'],
    ['otros', 'Otros'],
    ['uso_propio', 'Uso propio'],
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h2>Editar propiedad</h2><button className="modal-close" onClick={onClose}>×</button></div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nombre/Dirección</label>
            <input type="text" placeholder="Ej: Calle Mayor 12 · 2°B" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          {showPrice && (
            <div className="form-group">
              <label>Precio mensual (€)</label>
              <input type="number" placeholder="850" value={price} onChange={(e) => setPrice(e.target.value)} required />
            </div>
          )}
          <div className="form-group">
            <label>Mi porcentaje de propiedad (%)</label>
            <input type="number" placeholder="100" min="1" max="100" value={ownershipPercentage} onChange={(e) => setOwnershipPercentage(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Estado</label>
            <div className="status-options-grid">
              {STATUS_OPTIONS.map(([s, label]) => (
                <button key={s} type="button" className={`status-option ${status === s ? 'selected' : ''}`} onClick={() => handleStatusChange(s)}>
                  <span className={`status-dot ${s}`}></span>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <button type="submit" className="submit-button">Guardar cambios</button>
        </form>
      </div>
    </div>
  );
}

function AddRoomModal({ onClose, onAdd }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  
  const handleSubmit = (e) => {
    e.preventDefault();
    onAdd({ name, price: parseFloat(price) });
  };
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h2>Añadir habitación</h2><button className="modal-close" onClick={onClose}>×</button></div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nombre de la habitación</label>
            <input type="text" placeholder="Ej: Habitación 1, Suite principal..." value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Precio mensual (€)</label>
            <input type="number" placeholder="350" value={price} onChange={(e) => setPrice(e.target.value)} required step="0.01" />
          </div>
          <button type="submit" className="submit-button">Añadir habitación</button>
        </form>
      </div>
    </div>
  );
}

function EditRoomModal({ room, onClose, onSave, onDelete, onAssignTenant, onRemoveTenant }) {
  const [name, setName] = useState(room.name);
  const [price, setPrice] = useState(room.price.toString());
  const [showAddTenant, setShowAddTenant] = useState(false);
  
  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...room, name, price: parseFloat(price) });
  };
  
  const handleAddTenant = (tenantData) => {
    onAssignTenant(room.id, { ...tenantData, id: Date.now().toString() });
    setShowAddTenant(false);
    onClose();
  };
  
  return (
    <>
      {!showAddTenant ? (
        <div className="modal-overlay" onClick={onClose}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>Editar habitación</h2><button className="modal-close" onClick={onClose}>×</button></div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Nombre de la habitación</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Precio mensual (€)</label>
                <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} required step="0.01" />
              </div>
              {room.tenant ? (
                <div className="form-group">
                  <label>Inquilino actual</label>
                  <div className="current-tenant-info">
                    <div>
                      <p className="tenant-name">{room.tenant.name}</p>
                      <p className="tenant-phone">{room.tenant.phone}</p>
                    </div>
                    <button type="button" className="delete-button" onClick={() => {
                      if (window.confirm('¿Eliminar inquilino de esta habitación?')) {
                        onRemoveTenant(room.id);
                        onClose();
                      }
                    }}>
                      Quitar inquilino
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className="add-tenant-button" onClick={() => setShowAddTenant(true)} style={{marginBottom: '16px'}}>
                  + Asignar inquilino
                </button>
              )}
              <div className="modal-buttons">
                <button type="submit" className="submit-button">Guardar cambios</button>
                <button type="button" className="delete-button" onClick={() => onDelete(room.id)}>Eliminar habitación</button>
              </div>
            </form>
          </div>
        </div>
      ) : (
        <AddTenantToRoomModal onClose={() => setShowAddTenant(false)} onAdd={handleAddTenant} />
      )}
    </>
  );
}

function AddTenantToRoomModal({ onClose, onAdd }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  
  const handleSubmit = (e) => {
    e.preventDefault();
    onAdd({ name, phone });
  };
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h2>Asignar inquilino</h2><button className="modal-close" onClick={onClose}>×</button></div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nombre completo</label>
            <input type="text" placeholder="Ej: Laura Martínez" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Teléfono</label>
            <input type="tel" placeholder="622 280 559" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} />
          </div>
          <button type="submit" className="submit-button">Asignar inquilino</button>
        </form>
      </div>
    </div>
  );
}

function ConfirmPaymentModal({ defaultAmount, tenantName, onClose, onConfirm }) {
  const [amount, setAmount] = useState(defaultAmount?.toString() || '');

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfirm(parseFloat(amount));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Confirmar pago</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          {tenantName && (
            <p style={{ fontSize: '14px', color: '#666', marginBottom: '20px', marginTop: '-8px' }}>
              Inquilino: <strong>{tenantName}</strong>
            </p>
          )}
          <div className="form-group">
            <label>Importe recibido (€)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              step="0.01"
              min="0"
              required
              autoFocus
            />
            {parseFloat(amount) !== defaultAmount && parseFloat(amount) > 0 && (
              <p style={{ marginTop: '8px', fontSize: '13px', color: '#888' }}>
                Precio base: {defaultAmount} € — estás registrando un importe diferente
              </p>
            )}
          </div>
          <button type="submit" className="submit-button">
            Confirmar pago
          </button>
        </form>
      </div>
    </div>
  );
}

export default PropertyDetail;

/*
 * SQL para ejecutar en Supabase (opcional — los datos ya se persisten en la columna JSONB `data`
 * como `investmentData`. Estas columnas dedicadas permiten consultas analíticas directas):
 *
 * ALTER TABLE properties
 *   ADD COLUMN IF NOT EXISTS purchase_price        NUMERIC,
 *   ADD COLUMN IF NOT EXISTS acquisition_costs     NUMERIC,
 *   ADD COLUMN IF NOT EXISTS ownership_percentage  NUMERIC DEFAULT 100,
 *   ADD COLUMN IF NOT EXISTS monthly_mortgage      NUMERIC,
 *   ADD COLUMN IF NOT EXISTS monthly_amortization  NUMERIC;
 *
 * -- Para rellenar las columnas desde los datos JSONB existentes:
 * UPDATE properties
 * SET
 *   purchase_price        = (data->'investmentData'->>'purchasePrice')::NUMERIC,
 *   acquisition_costs     = (data->'investmentData'->>'acquisitionCosts')::NUMERIC,
 *   ownership_percentage  = COALESCE((data->'investmentData'->>'ownershipPercentage')::NUMERIC, 100),
 *   monthly_mortgage      = (data->'investmentData'->>'monthlyMortgage')::NUMERIC,
 *   monthly_amortization  = (data->'investmentData'->>'monthlyAmortization')::NUMERIC
 * WHERE data->'investmentData' IS NOT NULL;
 *
 * -- Campo skipped_months para omitir meses concretos en gastos recurrentes:
 * ALTER TABLE expenses
 *   ADD COLUMN IF NOT EXISTS skipped_months TEXT[] DEFAULT '{}';
 */