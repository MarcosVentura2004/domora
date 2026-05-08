import React, { useState, useEffect, useRef } from 'react';
import './PropertyDetail.css';
import PropertyDocuments from './PropertyDocuments';
import ChatConversation from './ChatConversation';
import { supabase } from '../supabaseClient';
import ExpenseSummary from './ExpenseSummary';
import MonthNavigator from '../components/MonthNavigator';

async function exportRoomToExcel(roomName, historyMonths, accumulated) {
  const ExcelJSMod = await import('exceljs');
  const ExcelJS = ExcelJSMod.default || ExcelJSMod;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Historial', { views: [{ showGridLines: false }] });
  const euro = '#,##0.00 "€"';
  const mkFill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

  const tRow = ws.addRow([`HISTORIAL HABITACIÓN — ${roomName}`]); tRow.height = 30;
  ws.mergeCells(1, 1, 1, 4);
  tRow.getCell(1).fill = mkFill('FF111111');
  tRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 13 };
  tRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

  const dRow = ws.addRow([`Exportado el ${new Date().toLocaleDateString('es-ES')}`]); dRow.height = 17;
  ws.mergeCells(2, 1, 2, 4);
  dRow.getCell(1).fill = mkFill('FF111111');
  dRow.getCell(1).font = { size: 8, italic: true, color: { argb: 'FFAAAAAA' } };
  dRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

  ws.addRow([]).height = 6;

  const hRow = ws.addRow(['Mes', 'Ingresos', 'Gastos', 'Neto']); hRow.height = 20;
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
    const r = ws.addRow([formatMonthYear(item.year, item.month), item.income, -item.expenses, net]);
    r.height = 20;
    for (let c = 1; c <= 4; c++) {
      r.getCell(c).fill = bg;
      r.getCell(c).alignment = { horizontal: c >= 2 ? 'right' : 'left', vertical: 'middle' };
      r.getCell(c).border = bdr;
    }
    r.getCell(2).font = { color: { argb: 'FF2E7D32' } }; r.getCell(2).numFmt = euro;
    r.getCell(3).font = { color: { argb: 'FFC62828' } }; r.getCell(3).numFmt = euro;
    r.getCell(4).font = { bold: true, color: { argb: net >= 0 ? 'FF2E7D32' : 'FFC62828' } }; r.getCell(4).numFmt = euro;
  });

  ws.addRow([]).height = 6;
  const accRowNum = ws.rowCount + 1;
  const accRow = ws.addRow(['Ganancia acumulada', '', '', accumulated]); accRow.height = 26;
  ws.mergeCells(accRowNum, 1, accRowNum, 3);
  for (let c = 1; c <= 4; c++) {
    accRow.getCell(c).fill = mkFill('FF111111');
    accRow.getCell(c).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    accRow.getCell(c).alignment = { horizontal: c === 1 ? 'left' : 'right', vertical: 'middle' };
  }
  accRow.getCell(4).font = { bold: true, size: 12, color: { argb: accumulated >= 0 ? 'FF90EE90' : 'FFFF8080' } };
  accRow.getCell(4).numFmt = euro;

  [20, 14, 14, 14].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `historial_${roomName.replace(/\s+/g, '_')}.xlsx`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportRoomToPDF(roomName, historyMonths, accumulated) {
  import('jspdf').then(({ jsPDF }) => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(`Historial — ${roomName}`, 14, 20);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150);
    doc.text(`Exportado el ${new Date().toLocaleDateString('es-ES')}`, 14, 28);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(150);
    const headers = ['MES', 'INGRESOS', 'GASTOS', 'NETO'];
    const colX = [14, 90, 130, 165];
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
      doc.setTextColor(76, 175, 80);
      doc.text(item.income > 0 ? `+${item.income.toFixed(0)} €` : '—', colX[1], y);
      doc.setTextColor(244, 67, 54);
      doc.text(item.expenses > 0 ? `-${item.expenses.toFixed(0)} €` : '—', colX[2], y);
      item.net >= 0 ? doc.setTextColor(76, 175, 80) : doc.setTextColor(244, 67, 54);
      doc.text(`${item.net >= 0 ? '+' : ''}${item.net.toFixed(0)} €`, colX[3], y);
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
    accumulated >= 0 ? doc.setTextColor(76, 175, 80) : doc.setTextColor(244, 67, 54);
    doc.text(`${accumulated >= 0 ? '+' : ''}${accumulated.toFixed(0)} €`, colX[3], y);
    doc.save(`historial_${roomName.replace(/\s+/g, '_')}.pdf`);
  });
}


function isFutureMonth(year, month) {
  const now = new Date();
  return year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth());
}

function formatMonthYear(year, month) {
  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return `${monthNames[month]} de ${year}`;
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

function AddTenantToRoomModal({ onClose, onAdd, room }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [startDay, setStartDay] = useState(room?.paymentConfig?.startDay?.toString() || '1');
  const [endDay, setEndDay] = useState(room?.paymentConfig?.endDay?.toString() || '5');

  const handleSubmit = (e) => {
    e.preventDefault();
    onAdd({ name, phone }, { startDay: parseInt(startDay), endDay: parseInt(endDay), limitDay: parseInt(endDay) });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Asignar inquilino</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nombre completo</label>
            <input type="text" placeholder="Ej: Laura Martínez" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Teléfono</label>
            <input type="tel" placeholder="622 280 559" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Rango de días para pagar el alquiler</label>
            <div className="payment-range-inputs">
              <div className="payment-day-input">
                <label>Del día</label>
                <input type="number" min="1" max="28" value={startDay} onChange={(e) => setStartDay(e.target.value)} required />
              </div>
              <span className="range-separator">—</span>
              <div className="payment-day-input">
                <label>Al día</label>
                <input type="number" min="1" max="31" value={endDay} onChange={(e) => setEndDay(e.target.value)} required />
              </div>
            </div>
            <p className="payment-range-note">El inquilino deberá marcar el pago entre el día {startDay} y {endDay} de cada mes</p>
          </div>
          <button type="submit" className="submit-button">Asignar inquilino</button>
        </form>
      </div>
    </div>
  );
}

function generateTenantCode() {
  const digits = Math.floor(1000 + Math.random() * 9000).toString();
  const letters = String.fromCharCode(
    65 + Math.floor(Math.random() * 26),
    65 + Math.floor(Math.random() * 26)
  );
  return digits + letters;
}

function saveTenantCode(code, landlordEmail, propertyId, tenantId, roomId) {
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

function RoomDetail({ room, property, onBack, onUpdate, landlordEmail }) {
  const [expenses, setExpenses] = useState([]);
  const [showExpenses, setShowExpenses] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [openMenuExpenseId, setOpenMenuExpenseId] = useState(null);
  const [showExpenseSummary, setShowExpenseSummary] = useState(false);
  const [showEditRoom, setShowEditRoom] = useState(false);
  const [showEditTenant, setShowEditTenant] = useState(false);
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
  const [codeModal, setCodeModal] = useState(null); // code string when open
  const [showDocuments, setShowDocuments] = useState(false);
  const [showAddTenant, setShowAddTenant] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!room.tenant || !landlordEmail) return;
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('landlord_email', landlordEmail)
      .eq('property_id', property.id)
      .eq('room_id', room.id)
      .eq('sender', 'tenant')
      .eq('read_by_landlord', false)
      .then(({ count }) => setUnreadCount(count || 0));
  }, [room.id, room.tenant, property.id, landlordEmail]); // eslint-disable-line

  useEffect(() => {
    supabase
      .from('expenses')
      .select('*')
      .eq('property_id', String(property.id))
      .eq('room_id', String(room.id))
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setExpenses(data); });
  }, [property.id, room.id]);

  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());

  const createdAt = property.createdAt ? new Date(property.createdAt) : new Date(now.getFullYear() - 5, 0, 1);
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

  const isCurrentMonthFuture = isFutureMonth(currentYear, currentMonth);
  const isAtMinMonth = currentYear === minYear && currentMonth === minMonth;
  const isAtCurrentMonth = currentYear === now.getFullYear() && currentMonth === now.getMonth();
  const [isEditMode, setIsEditMode] = useState(false);
  const [isEditMonthPickerOpen, setIsEditMonthPickerOpen] = useState(false);
  const pendingEditMode = useRef(false);
  const canEdit = isAtCurrentMonth || isEditMode;

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

  const visibleExpenses = getExpensesForMonth(expenses, currentYear, currentMonth);
  const totalExpenses = visibleExpenses.reduce((sum, e) => {
    if (e.active === false) return sum;
    const pct = e.expense_percentage != null ? e.expense_percentage : (property.ownershipPercentage || 100);
    return sum + getMonthlyEquivalent(e) * pct / 100;
  }, 0);

  const payments = property.payments || [];

  // Todos los pagos confirmados de esta habitación en este mes (pueden ser varios si hubo cambio de inquilino)
  const confirmedPayments = payments.filter(p =>
    p.year === currentYear &&
    p.month === currentMonth &&
    p.roomId === room.id &&
    p.status === 'confirmed'
  );
  const currentPaymentConfirmed = confirmedPayments[confirmedPayments.length - 1]; // el más reciente para mostrar en card
  const currentPayment = payments.find(p =>
    p.year === currentYear &&
    p.month === currentMonth &&
    p.roomId === room.id
  );

  const ownershipPercentage = property.ownershipPercentage || 100;
  const ownershipMultiplier = ownershipPercentage / 100;
  // Suma de todos los pagos confirmados del mes
  const totalConfirmedAmount = confirmedPayments.reduce((sum, p) => sum + (p.amount ?? room.price), 0);
  const monthlyIncome = totalConfirmedAmount * ownershipMultiplier;
  const netIncome = isCurrentMonthFuture ? null : monthlyIncome - totalExpenses;

  const handleAddExpense = async (expenseData) => {
    const { data, error } = await supabase
      .from('expenses')
      .insert({ property_id: String(property.id), room_id: String(room.id), landlord_email: landlordEmail, ...expenseData })
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

  const handleUpdateVariableAmount = async (id, newAmount) => {
    await supabase.from('expenses').update({ amount: parseFloat(newAmount) }).eq('id', id);
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, amount: parseFloat(newAmount) } : e));
  };

  const handleSaveRoom = (updatedData) => {
    const updatedRoom = { ...room, ...updatedData };
    const updatedRooms = property.rooms.map(r => r.id === room.id ? updatedRoom : r);
    onUpdate({ ...property, rooms: updatedRooms });
    setShowEditRoom(false);
  };

  const handleSaveTenant = (tenantData, paymentConfig) => {
    const updatedRoom = { ...room, tenant: { ...room.tenant, ...tenantData }, paymentConfig };
    const updatedRooms = property.rooms.map(r => r.id === room.id ? updatedRoom : r);
    onUpdate({ ...property, rooms: updatedRooms });
    setShowEditTenant(false);
  };

  const handleAddTenant = (tenantData, paymentConfig) => {
    const code = generateTenantCode();
    const tenantId = Date.now().toString();
    const updatedRoom = {
      ...room,
      tenant: { ...tenantData, id: tenantId, tenantCode: code },
      status: 'ocupada',
      paymentConfig
    };
    if (landlordEmail) {
      saveTenantCode(code, landlordEmail, property.id, tenantId, room.id);
    }
    const updatedRooms = property.rooms.map(r => r.id === room.id ? updatedRoom : r);
    onUpdate({ ...property, rooms: updatedRooms });
    setShowAddTenant(false);
  };

  const handleRemoveTenant = () => {
    if (window.confirm('¿Eliminar inquilino de esta habitación?')) {
      // Conservar el nombre del inquilino en sus pagos antes de eliminarlo
      const updatedPayments = (property.payments || []).map(p =>
        p.roomId === room.id && !p.tenantName && room.tenant
          ? { ...p, tenantName: room.tenant.name }
          : p
      );
      const updatedRoom = { ...room, tenant: null, status: 'vacia' };
      const updatedRooms = property.rooms.map(r => r.id === room.id ? updatedRoom : r);
      onUpdate({ ...property, rooms: updatedRooms, payments: updatedPayments });
    }
  };

  const handleRejectPayment = () => {
    const updatedPayments = payments.filter(p =>
      !(p.year === currentYear && p.month === currentMonth && p.roomId === room.id)
    );
    onUpdate({ ...property, payments: updatedPayments });
  };

  // Abre el modal de confirmar pago con importe editable
  const handleMarkAsPending = () => {
    setShowConfirmModal(true);
  };

  const handleConfirmWithAmount = async (amount) => {
    const confirmedAt = new Date().toISOString();
    const newPayment = {
      year: currentYear,
      month: currentMonth,
      roomId: room.id,
      status: 'confirmed',
      markedAt: confirmedAt,
      confirmedAt,
      amount,
      tenantName: room.tenant?.name
    };
    const updatedPayments = [...payments, newPayment];
    onUpdate({ ...property, payments: updatedPayments });
    setShowConfirmModal(false);

    // Persistir en Supabase (upsert: update si existe, insert si no)
    const payload = {
      property_id: String(property.id),
      tenant_id: room.tenant?.id ? String(room.tenant.id) : null,
      room_id: String(room.id),
      year: currentYear,
      month: currentMonth,
      status: 'confirmed',
      confirmed_at: confirmedAt,
    };
    console.log('[RoomDetail handleConfirmWithAmount] Guardando en Supabase:', payload);

    const { data: updateData, count, error: updateError } = await supabase
      .from('payments')
      .update({ status: 'confirmed', confirmed_at: confirmedAt, amount })
      .eq('property_id', String(property.id))
      .eq('room_id', String(room.id))
      .eq('year', currentYear)
      .eq('month', currentMonth)
      .select('id, property_id, tenant_id, room_id, year, month, status, confirmed_at', { count: 'exact' });
    console.log('[RoomDetail handleConfirmWithAmount] Resultado UPDATE:', { rowsUpdated: count, data: updateData, error: updateError });

    if (!count) {
      console.log('[RoomDetail handleConfirmWithAmount] No existía fila — haciendo INSERT');
      const { data: insertData, error: insertError } = await supabase
        .from('payments')
        .insert({
          property_id: String(property.id),
          tenant_id: room.tenant?.id ? String(room.tenant.id) : null,
          room_id: String(room.id),
          year: currentYear,
          month: currentMonth,
          amount,
          status: 'confirmed',
          confirmed_at: confirmedAt,
          marked_at: confirmedAt,
          landlord_email: property.landlord_email || landlordEmail,
        })
        .select('id, property_id, tenant_id, room_id, year, month, status, confirmed_at');
      console.log('[RoomDetail handleConfirmWithAmount] Resultado INSERT:', { data: insertData, error: insertError });
    }

    // Verificación: leer el registro recién guardado
    const { data: verifyData, error: verifyError } = await supabase
      .from('payments')
      .select('id, property_id, tenant_id, room_id, year, month, status, confirmed_at')
      .eq('property_id', String(property.id))
      .eq('room_id', String(room.id))
      .eq('year', currentYear)
      .eq('month', currentMonth);
    console.log('[RoomDetail handleConfirmWithAmount] Verificación DB post-escritura:', { verifyData, verifyError });
  };

  if (showDocuments) {
    return <PropertyDocuments property={property} room={room} landlordEmail={landlordEmail} onBack={() => setShowDocuments(false)} onUpdate={onUpdate} />;
  }

  if (showExpenseSummary) {
    const getMonthlyIncome = (yr, mo) =>
      (property.payments || [])
        .filter(p => p.year === yr && p.month === mo && p.roomId === room.id && p.status === 'confirmed')
        .reduce((s, p) => s + (p.amount ?? room.price), 0) * ((property.ownershipPercentage || 100) / 100);
    return (
      <ExpenseSummary
        expenses={expenses}
        onBack={() => setShowExpenseSummary(false)}
        propertyName={`${property.name} — ${room.name}`}
        getMonthlyIncome={getMonthlyIncome}
      />
    );
  }

  if (showChat && room.tenant) {
    return (
      <ChatConversation
        landlordEmail={landlordEmail}
        propertyId={property.id}
        roomId={room.id}
        tenantId={room.tenant.id || room.id}
        tenantName={room.tenant.name}
        propertyName={`${property.name} — ${room.name}`}
        currentRole="landlord"
        onBack={() => setShowChat(false)}
      />
    );
  }

  return (
    <div className="property-detail-container">
      {/* Header */}
      <div className="detail-header" ref={optionsMenuRef}>
        <button className="back-button" onClick={onBack}>←</button>
        <h1 className="detail-title">{room.name}</h1>
        <button className="detail-options" onClick={() => setShowOptionsMenu(!showOptionsMenu)}>⋮</button>
        {showOptionsMenu && (
          <div className="detail-options-menu">
            <button className="detail-option-item" onClick={() => { setShowEditRoom(true); setShowOptionsMenu(false); }}>
              Editar
            </button>
            {room.tenant && (
              <button className="detail-option-item" onClick={() => {
                let code = room.tenant.tenantCode;
                if (!code) {
                  code = generateTenantCode();
                  const updatedRoom = { ...room, tenant: { ...room.tenant, tenantCode: code } };
                  const updatedRooms = property.rooms.map(r => r.id === room.id ? updatedRoom : r);
                  onUpdate({ ...property, rooms: updatedRooms });
                  if (landlordEmail) saveTenantCode(code, landlordEmail, property.id, room.tenant.id, room.id);
                }
                setCodeModal(code);
                setShowOptionsMenu(false);
              }}>
                Código del inquilino
              </button>
            )}
            <button className="detail-option-item delete" onClick={() => {
              if (window.confirm('¿Estás seguro de que quieres eliminar esta habitación?')) {
                const updatedRooms = property.rooms.filter(r => r.id !== room.id);
                onUpdate({ ...property, rooms: updatedRooms });
                onBack();
              }
              setShowOptionsMenu(false);
            }}>
              Eliminar
            </button>
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
              <p style={{ color: '#888', fontSize: '14px', margin: '0 0 20px' }}>Comparte este código con <strong>{room.tenant?.name}</strong></p>
              <div style={{ background: '#f5f5f5', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
                <p style={{ fontSize: '36px', fontWeight: '700', letterSpacing: '8px', margin: 0, color: '#111' }}>{codeModal}</p>
              </div>
              <button className="submit-button" onClick={() => { navigator.clipboard?.writeText(codeModal); }}>
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
                  strokeDasharray="408" strokeDashoffset={408 - (Math.min(netIncome / room.price, 1) * 408)}/>
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
                <div className="income-sublabel" style={{ color: netIncome < 0 ? '#F44336' : '#999' }}>
                  {netIncome < 0 && !currentPaymentConfirmed ? 'Pago sin confirmar' : 'Neto'}
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
              <span className={`status-dot ${room.tenant ? 'alquilado' : 'vacio'}`}></span>
              <span>{room.tenant ? 'Alquilada' : 'Vacía'}</span>
            </div>
          </div>
          <button className="card-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Inquilino */}
      <div className="info-card tenant-card">
        <div className="card-header">
          <h3>Inquilino</h3>
        </div>
        {room.tenant ? (
          <div className="tenant-item" onClick={() => setShowEditTenant(true)} style={{ cursor: 'pointer', marginTop: '8px' }}>
            <div className="tenant-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="12" cy="7" r="4" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="tenant-item-info">
              <p className="tenant-name">{room.tenant.name}</p>
              <p className="tenant-phone">{room.tenant.phone}</p>
            </div>
            <button className="tenant-chat-icon" onClick={(e) => { e.stopPropagation(); setShowChat(true); }}>
              <div style={{ position: 'relative', display: 'inline-flex' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute', top: -4, right: -4,
                    background: '#e74c3c', color: 'white',
                    borderRadius: '50%', width: 16, height: 16,
                    fontSize: 10, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {unreadCount}
                  </span>
                )}
              </div>
            </button>
          </div>
        ) : (
          <button className="add-tenant-button" onClick={() => setShowAddTenant(true)}>
            + Añadir inquilino
          </button>
        )}
      </div>

      {/* Pago del alquiler */}
      {(room.tenant || confirmedPayments.length > 0 || currentPayment) && (
        <div className="info-card payment-card">
          <div className="card-header">
            <h3>Pago del alquiler</h3>
          </div>

          <div className="payment-content">
            <div className="tenants-payment-grid">

              {/* Card del inquilino actual */}
              {room.tenant && (() => {
                const isPaid = confirmedPayments.length > 0;
                const isPending = !isPaid && currentPayment && currentPayment.status !== 'confirmed';
                const badgeColor = isPaid ? 'green' : isPending ? 'orange' : 'gray';
                const badgeIcon = isPaid ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke="#4CAF50" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : isPending ? (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="#FF9800" strokeWidth="2.5"/>
                  </svg>
                ) : (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="#9E9E9E" strokeWidth="2.5"/>
                  </svg>
                );

                return (
                  <div className="tenant-payment-card">
                    <div className="tenant-payment-header">
                      <div className="tenant-avatar">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <circle cx="12" cy="7" r="4" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div className="tenant-payment-info">
                        <p className="tenant-payment-amount" style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#111' }}>{room.price}€</p>
                      </div>
                      <span className={`payment-status-badge ${badgeColor} small`}>{badgeIcon}</span>
                    </div>

                    {/* Pagado */}
                    {isPaid && confirmedPayments.map((p, i) => (
                      <div key={i} className="tenant-payment-actions">
                        <p className="payment-confirmed-text">
                          ✓ {p.amount !== undefined ? `${p.amount} €` : `${room.price} €`}
                          {p.amount !== undefined && p.amount !== room.price && (
                            <span style={{ fontSize: '11px', color: '#aaa', marginLeft: '4px' }}>(base: {room.price} €)</span>
                          )}
                          {' · '}{new Date(p.confirmedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                        </p>
                        {canEdit && (
                          <button className="payment-cancel-link" onClick={() => {
                            const updated = payments.filter(x => !(x.year === p.year && x.month === p.month && x.roomId === p.roomId && x.confirmedAt === p.confirmedAt));
                            onUpdate({ ...property, payments: updated });
                          }}>Cancelar</button>
                        )}
                      </div>
                    ))}

                    {/* Pendiente de confirmar */}
                    {canEdit && isPending && (
                      <div className="tenant-payment-actions">
                        <button className="payment-btn confirm small" onClick={() => setShowConfirmModal(true)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <polyline points="20 6 9 17 4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Confirmar
                        </button>
                        <button className="payment-btn reject small" onClick={handleRejectPayment}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Rechazar
                        </button>
                      </div>
                    )}

                    {/* Sin pago */}
                    {canEdit && !isPaid && !isPending && (
                      <div className="tenant-payment-actions">
                        <button className="payment-btn confirm small full-width" onClick={handleMarkAsPending}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <polyline points="20 6 9 17 4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Confirmar pago
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Rango de días de pago */}
              {(room.paymentConfig || property.paymentConfig) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', paddingLeft: '2px' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke="#aaa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <line x1="16" y1="2" x2="16" y2="6" stroke="#aaa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <line x1="8" y1="2" x2="8" y2="6" stroke="#aaa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <line x1="3" y1="10" x2="21" y2="10" stroke="#aaa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span style={{ fontSize: '12px', color: '#aaa' }}>
                    {(() => { const pc = room.paymentConfig || property.paymentConfig; return `Rango de pago: ${pc.startDay}–${pc.endDay} ${new Date(currentYear, currentMonth).toLocaleDateString('es-ES', { month: 'short' })}`; })()}
                  </span>
                </div>
              )}

              {/* Pagos de ex-inquilinos */}
              {confirmedPayments
                .filter(p => !room.tenant || p.tenantName !== room.tenant.name)
                .map((p, i) => (
                  <div key={i} className="tenant-payment-card" style={{ marginTop: '8px' }}>
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
                      <span className="payment-status-badge green small">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                          <path d="M20 6L9 17l-5-5" stroke="#4CAF50" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                    </div>
                    <div className="tenant-payment-actions">
                      <p className="payment-confirmed-text">
                        ✓ {p.amount} € · {new Date(p.confirmedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                      </p>
                      {canEdit && (
                        <button className="payment-cancel-link" onClick={() => {
                          const updated = payments.filter(x => !(x.year === p.year && x.month === p.month && x.roomId === p.roomId && x.confirmedAt === p.confirmedAt));
                          onUpdate({ ...property, payments: updated });
                        }}>Cancelar</button>
                      )}
                    </div>
                  </div>
                ))
              }

            </div>
          </div>
        </div>
      )}

      {/* Gastos */}
      <div className="info-card expenses-card">
        <div className="card-header clickable" onClick={() => setShowExpenses(!showExpenses)}>
          <h3>Gastos de esta habitación</h3>
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
                      {exp.attachment_url && (
                        <a href={exp.attachment_url} target="_blank" rel="noreferrer" title="Ver adjunto" onClick={e => e.stopPropagation()} style={{ color: '#90CAF9', lineHeight: 1, display: 'flex', alignItems: 'center' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                          </svg>
                        </a>
                      )}
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
                    {canEdit && (
                      <ExpenseMenu
                        expenseId={exp.id}
                        openMenuId={openMenuExpenseId}
                        setOpenMenuId={setOpenMenuExpenseId}
                        onEdit={() => { setEditingExpense(exp); setOpenMenuExpenseId(null); }}
                        onDelete={() => handleDeleteExpense(exp.id)}
                      />
                    )}
                  </div>
                </div>
              );
            })}
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

      {/* Historial */}
      <div className="info-card history-card">
        <div className="card-header clickable" onClick={() => setShowPaymentHistory(!showPaymentHistory)}>
          <h3>Historial</h3>
          <span className="arrow">{showPaymentHistory ? '▼' : '›'}</span>
        </div>

        {showPaymentHistory && (() => {
          const roomPayments = payments.filter(p => p.roomId === room.id);
          const start = property.createdAt ? new Date(property.createdAt) : new Date(now.getFullYear(), now.getMonth(), 1);
          const ownershipMultiplier = (property.ownershipPercentage || 100) / 100;
          const historyMonths = [];
          let y = start.getFullYear();
          let m = start.getMonth();
          while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth())) {
            const monthExpenses = getExpensesForMonth(expenses, y, m);
            const totalExp = monthExpenses.reduce((sum, e) => {
              if (e.active === false) return sum;
              const pct = e.expense_percentage != null ? e.expense_percentage : (property.ownershipPercentage || 100);
              return sum + getMonthlyEquivalent(e) * pct / 100;
            }, 0);
            const confirmedPayment = roomPayments.find(p => p.year === y && p.month === m && p.status === 'confirmed');
            const income = confirmedPayment ? (confirmedPayment.amount ?? room.price) * ownershipMultiplier : 0;
            const net = income - totalExp;
            historyMonths.push({ year: y, month: m, income, expenses: totalExp, net, tenantName: confirmedPayment?.tenantName });
            if (m === 11) { m = 0; y++; } else { m++; }
          }
          const accumulated = historyMonths.reduce((sum, h) => sum + h.net, 0);

          return (
            <div className="history-detail">
              <div className="export-buttons">
                <button className="export-btn excel" onClick={() => exportRoomToExcel(room.name, historyMonths, accumulated)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Exportar Excel
                </button>
                <button className="export-btn pdf" onClick={() => exportRoomToPDF(room.name, historyMonths, accumulated)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Exportar PDF
                </button>
              </div>

              <div className="history-table-header" style={{ gridTemplateColumns: '1fr 70px 70px 70px' }}>
                <span>Mes</span>
                <span>Ingresos</span>
                <span>Gastos</span>
                <span>Neto</span>
              </div>

              {historyMonths.map((item) => (
                <div key={`${item.year}-${item.month}`} className="history-row" style={{ gridTemplateColumns: '1fr 70px 70px 70px' }}
                  onClick={() => { setCurrentYear(item.year); setCurrentMonth(item.month); setShowPaymentHistory(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                  <span className="history-month">{formatMonthYear(item.year, item.month)}</span>
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

      {/* Modals */}
      {showConfirmModal && (
        <ConfirmPaymentModal
          defaultAmount={room.price}
          tenantName={room.tenant?.name}
          onClose={() => setShowConfirmModal(false)}
          onConfirm={handleConfirmWithAmount}
        />
      )}

      {showAddTenant && (
        <AddTenantToRoomModal
          room={room}
          onClose={() => setShowAddTenant(false)}
          onAdd={handleAddTenant}
        />
      )}

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

      {showEditRoom && (
        <EditRoomModal
          room={room}
          onClose={() => setShowEditRoom(false)}
          onSave={handleSaveRoom}
          onRemoveTenant={handleRemoveTenant}
        />
      )}

      {showEditTenant && room.tenant && (
        <EditTenantModal
          tenant={room.tenant}
          room={room}
          onClose={() => setShowEditTenant(false)}
          onSave={handleSaveTenant}
          onRemove={() => { handleRemoveTenant(); setShowEditTenant(false); }}
        />
      )}

      {showPaymentHistory && false /* historial inline */}
    </div>
  );
}

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

function AddExpenseModal({ onClose, onAdd, onUpdate, defaultExpensePct, initialExpense, landlordEmail, propertyId }) {
  const today = new Date().toISOString().split('T')[0];
  const isEditing = !!initialExpense;
  const [category, setCategory] = useState(isEditing ? (initialExpense.category || '') : '');
  const [subcategory, setSubcategory] = useState(isEditing ? (initialExpense.subcategory || '') : '');
  const [description, setDescription] = useState(isEditing ? (initialExpense.description || '') : '');
  const [amount, setAmount] = useState(isEditing ? (initialExpense.amount != null ? String(initialExpense.amount) : '') : '');
  const [repeats, setRepeats] = useState(isEditing ? initialExpense.frequency !== 'unico' : false);
  const [frequency, setFrequency] = useState(isEditing ? (initialExpense.frequency === 'unico' ? 'mensual' : initialExpense.frequency) : 'mensual');
  const [customFreqMonths, setCustomFreqMonths] = useState(isEditing ? (initialExpense.custom_frequency_months ? String(initialExpense.custom_frequency_months) : '') : '');
  const [durationType, setDurationType] = useState(isEditing ? (initialExpense.duration_payments ? 'pagos' : 'indefinido') : 'indefinido');
  const [durationPayments, setDurationPayments] = useState(isEditing ? (initialExpense.duration_payments ? String(initialExpense.duration_payments) : '') : '');
  const [startDate, setStartDate] = useState(isEditing ? (initialExpense.start_date || today) : today);
  const [expensePct, setExpensePct] = useState(isEditing ? (initialExpense.expense_percentage != null ? String(initialExpense.expense_percentage) : '') : (defaultExpensePct != null ? String(defaultExpensePct) : ''));
  const fileInputRef = React.useRef(null);
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [attachmentUrl, setAttachmentUrl] = useState(isEditing ? (initialExpense.attachment_url || '') : '');
  const [uploading, setUploading] = useState(false);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    let finalAttachmentUrl = attachmentUrl;
    if (attachmentFile) {
      setUploading(true);
      try {
        await supabase.storage.createBucket('gastos', { public: true });
        const safeName = attachmentFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${landlordEmail}/${propertyId}/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage.from('gastos').upload(path, attachmentFile, { upsert: false });
        if (upErr) throw upErr;
        finalAttachmentUrl = supabase.storage.from('gastos').getPublicUrl(path).data.publicUrl;
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
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                style={{ display: 'none' }}
                onChange={e => { setAttachmentFile(e.target.files[0] || null); }}
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
    </div>
  );
}

function EditRoomModal({ room, onClose, onSave, onRemoveTenant }) {
  const [name, setName] = useState(room.name);
  const [price, setPrice] = useState(room.price.toString());

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ name, price: parseFloat(price) });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Editar habitación</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nombre de la habitación</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Precio mensual (€)</label>
            <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} required step="0.01" />
          </div>
          {room.tenant && (
            <div className="form-group">
              <label>Inquilino actual</label>
              <div className="current-tenant-info">
                <div>
                  <p className="tenant-name">{room.tenant.name}</p>
                  <p className="tenant-phone">{room.tenant.phone}</p>
                </div>
                <button type="button" className="delete-button" onClick={() => {
                  onRemoveTenant();
                  onClose();
                }}>
                  Quitar inquilino
                </button>
              </div>
            </div>
          )}
          <button type="submit" className="submit-button">Guardar cambios</button>
        </form>
      </div>
    </div>
  );
}

function EditTenantModal({ tenant, room, onClose, onSave, onRemove }) {
  const [name, setName] = useState(tenant.name);
  const [phone, setPhone] = useState(tenant.phone);
  const [startDay, setStartDay] = useState(room?.paymentConfig?.startDay?.toString() || '1');
  const [endDay, setEndDay] = useState(room?.paymentConfig?.endDay?.toString() || '5');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ name, phone }, { startDay: parseInt(startDay), endDay: parseInt(endDay), limitDay: parseInt(endDay) });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Editar inquilino</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nombre completo</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Teléfono</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Rango de días para pagar el alquiler</label>
            <div className="payment-range-inputs">
              <div className="payment-day-input">
                <label>Del día</label>
                <input type="number" min="1" max="28" value={startDay} onChange={(e) => setStartDay(e.target.value)} required />
              </div>
              <span className="range-separator">—</span>
              <div className="payment-day-input">
                <label>Al día</label>
                <input type="number" min="1" max="31" value={endDay} onChange={(e) => setEndDay(e.target.value)} required />
              </div>
            </div>
            <p className="payment-range-note">El inquilino deberá marcar el pago entre el día {startDay} y {endDay} de cada mes</p>
          </div>
          <div className="modal-buttons">
            <button type="submit" className="submit-button">Guardar cambios</button>
            <button type="button" className="delete-button" onClick={() => {
              if (window.confirm('¿Eliminar inquilino de esta habitación?')) onRemove();
            }}>Quitar inquilino</button>
          </div>
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
              <p className="payment-range-note" style={{ marginTop: '8px' }}>
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

export default RoomDetail;