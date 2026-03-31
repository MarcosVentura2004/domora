import React, { useState, useEffect } from 'react';
import './PropertyDetail.css';
import PropertyDocuments from './PropertyDocuments';
import ChatConversation from './ChatConversation';
import { supabase } from '../supabaseClient';

function exportRoomToExcel(roomName, historyMonths, accumulated) {
  import('xlsx').then(XLSX => {
    const data = historyMonths.map(item => ({
      'Mes': formatMonthYear(item.year, item.month),
      'Ingresos (€)': item.income,
      'Gastos (€)': -item.expenses,
      'Neto (€)': item.net,
    }));
    data.push({ 'Mes': '', 'Ingresos (€)': '', 'Gastos (€)': 'Ganancia acumulada', 'Neto (€)': accumulated });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Historial');
    ws['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
    XLSX.writeFile(wb, `historial_${roomName.replace(/\s+/g, '_')}.xlsx`);
  });
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
  return expenses.filter(expense => {
    const created = new Date(expense.createdAt);
    const createdYear = created.getFullYear();
    const createdMonth = created.getMonth();
    if (year < createdYear || (year === createdYear && month < createdMonth)) return false;
    if (expense.frequency === 'unico') return year === createdYear && month === createdMonth;
    return true;
  });
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

function RoomDetail({ room, property, onBack, onUpdate, landlordEmail }) {
  const [expenses, setExpenses] = useState(room.expenses || []);
  const [showExpenses, setShowExpenses] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showEditRoom, setShowEditRoom] = useState(false);
  const [showEditTenant, setShowEditTenant] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [codeModal, setCodeModal] = useState(null); // code string when open
  const [showDocuments, setShowDocuments] = useState(false);
  const [showAddTenant, setShowAddTenant] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);
  const [showExpenseHistory, setShowExpenseHistory] = useState(false);
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

  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());

  const createdAt = property.createdAt ? new Date(property.createdAt) : new Date(now.getFullYear(), now.getMonth(), 1);
  const minYear = createdAt.getFullYear();
  const minMonth = createdAt.getMonth();

  const isCurrentMonthFuture = isFutureMonth(currentYear, currentMonth);
  const isAtMinMonth = currentYear === minYear && currentMonth === minMonth;
  const isAtCurrentMonth = currentYear === now.getFullYear() && currentMonth === now.getMonth();

  const goToPrevMonth = () => {
    if (isAtMinMonth) return;
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else { setCurrentMonth(m => m - 1); }
  };

  const goToNextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else { setCurrentMonth(m => m + 1); }
  };

  const visibleExpenses = getExpensesForMonth(expenses, currentYear, currentMonth);
  const totalExpenses = visibleExpenses.reduce((sum, exp) => sum + exp.amount, 0);

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

  const handleAddExpense = (newExpense) => {
    const updatedExpense = { ...newExpense, id: Date.now(), createdAt: new Date().toISOString(), roomId: room.id };
    const updatedRoomExpenses = [...expenses, updatedExpense];
    setExpenses(updatedRoomExpenses);
    const updatedRoom = { ...room, expenses: updatedRoomExpenses };
    const updatedRooms = property.rooms.map(r => r.id === room.id ? updatedRoom : r);
    const updatedPropertyExpenses = [...(property.expenses || []), updatedExpense];
    onUpdate({
      ...property,
      rooms: updatedRooms,
      expenses: updatedPropertyExpenses
    });
    setShowAddExpense(false);
  };

  const handleDeleteExpense = (expenseId) => {
    const updatedRoomExpenses = expenses.filter(exp => exp.id !== expenseId);
    setExpenses(updatedRoomExpenses);
    const updatedRoom = { ...room, expenses: updatedRoomExpenses };
    const updatedRooms = property.rooms.map(r => r.id === room.id ? updatedRoom : r);
    const updatedPropertyExpenses = (property.expenses || []).filter(exp => exp.id !== expenseId);
    onUpdate({
      ...property,
      rooms: updatedRooms,
      expenses: updatedPropertyExpenses
    });
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

  const getPaymentStatus = () => {
    if (!room.tenant) return null;
    const today = new Date();
    const isCurrentMonthView = currentYear === today.getFullYear() && currentMonth === today.getMonth();
    if (!isCurrentMonthView) {
      if (currentPayment) {
        return currentPayment.status === 'confirmed' ? 'paid' : 'pending_confirmation';
      }
      return 'overdue';
    }
    if (currentPayment) {
      if (currentPayment.status === 'confirmed') return 'paid';
      if (currentPayment.status === 'pending') return 'pending_confirmation';
    }
    return 'pending';
  };

  const paymentStatus = getPaymentStatus();

  const handleConfirmPayment = (customAmount) => {
    const amount = customAmount !== undefined ? customAmount : room.price;
    const updatedPayments = payments.map(p =>
      p.year === currentYear && p.month === currentMonth && p.roomId === room.id
        ? { 
            ...p, 
            status: 'confirmed', 
            confirmedAt: new Date().toISOString(),
            amount,
            tenantName: room.tenant?.name || p.tenantName
          }
        : p
    );
    onUpdate({ ...property, payments: updatedPayments });
  };

  const handleRejectPayment = () => {
    const updatedPayments = payments.filter(p =>
      !(p.year === currentYear && p.month === currentMonth && p.roomId === room.id)
    );
    onUpdate({ ...property, payments: updatedPayments });
  };

  const handleCancelPayment = () => {
    if (window.confirm('¿Estás seguro de que quieres cancelar este pago confirmado?')) {
      handleRejectPayment();
    }
  };

  // Abre el modal de confirmar pago con importe editable
  const handleMarkAsPending = () => {
    setShowConfirmModal(true);
  };

  const handleConfirmWithAmount = (amount) => {
    const newPayment = {
      year: currentYear,
      month: currentMonth,
      roomId: room.id,
      status: 'confirmed',
      markedAt: new Date().toISOString(),
      confirmedAt: new Date().toISOString(),
      amount,
      tenantName: room.tenant?.name
    };
    const updatedPayments = [...payments, newPayment];
    onUpdate({ ...property, payments: updatedPayments });
    setShowConfirmModal(false);
  };

  if (showDocuments) {
    return <PropertyDocuments property={property} room={room} landlordEmail={landlordEmail} onBack={() => setShowDocuments(false)} onUpdate={onUpdate} />;
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
      <div className="detail-header">
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
      <div className="month-navigator">
        <button className="month-nav-btn" onClick={goToPrevMonth} disabled={isAtMinMonth}>‹</button>
        <span className="month-label">{formatMonthYear(currentYear, currentMonth)}</span>
        <button className="month-nav-btn" onClick={goToNextMonth}>›</button>
      </div>

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
                        <button className="payment-cancel-link" onClick={() => {
                          const updated = payments.filter(x => !(x.year === p.year && x.month === p.month && x.roomId === p.roomId && x.confirmedAt === p.confirmedAt));
                          onUpdate({ ...property, payments: updated });
                        }}>Cancelar</button>
                      </div>
                    ))}

                    {/* Pendiente de confirmar */}
                    {isPending && (
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
                    {!isPaid && !isPending && (
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
                      <button className="payment-cancel-link" onClick={() => {
                        const updated = payments.filter(x => !(x.year === p.year && x.month === p.month && x.roomId === p.roomId && x.confirmedAt === p.confirmedAt));
                        onUpdate({ ...property, payments: updated });
                      }}>Cancelar</button>
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
          <div className="expenses-total">
            <span>{totalExpenses.toFixed(2)} €</span>
            <span className="arrow">{showExpenses ? '▼' : '›'}</span>
          </div>
        </div>
        {showExpenses && (
          <div className="expenses-detail">
            {visibleExpenses.length === 0 ? (
              <p className="no-expenses">{isCurrentMonthFuture ? 'No hay datos para meses futuros' : 'No hay gastos añadidos'}</p>
            ) : (
              visibleExpenses.map(expense => (
                <div key={expense.id} className="expense-item">
                  <div>
                    <span>{expense.name}</span>
                    {expense.frequency && expense.frequency !== 'mensual' && (
                      <span className={`frequency-badge ${expense.frequency}`}>
                        {expense.frequency === 'trimestral' ? 'Trimestral' : expense.frequency === 'anual' ? 'Anual' : 'Único'}
                      </span>
                    )}
                  </div>
                  <div className="expense-actions">
                    <span>{expense.amount.toFixed(2)} €/mes</span>
                    {isAtCurrentMonth && (
                      <button className="delete-expense" onClick={() => handleDeleteExpense(expense.id)}>×</button>
                    )}
                  </div>
                </div>
              ))
            )}
            {visibleExpenses.length > 0 && (
              <div className="expense-item total"><strong>Total gastos</strong><strong>{totalExpenses.toFixed(2)} €</strong></div>
            )}
            {isAtCurrentMonth && (
              <button className="add-expense-button" onClick={() => setShowAddExpense(true)}>+ Añadir gasto</button>
            )}
          </div>
        )}
        {!showExpenses && isAtCurrentMonth && (
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
            const totalExp = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
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

      {showAddExpense && (
        <AddExpenseModal
          onClose={() => setShowAddExpense(false)}
          onAdd={handleAddExpense}
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

function AddExpenseModal({ onClose, onAdd }) {
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState('mensual');

  const CATEGORIES = [
    { key: 'ibi', label: 'IBI' },
    { key: 'comunidad', label: 'Comunidad de propietarios' },
    { key: 'seguro', label: 'Seguro del hogar' },
    { key: 'reparaciones', label: 'Reparaciones y conservación' },
    { key: 'suministros', label: 'Suministros' },
    { key: 'amortizacion', label: 'Amortización del inmueble' },
    { key: 'hipoteca', label: 'Intereses hipotecarios' },
    { key: 'gestion', label: 'Gastos de gestión' },
    { key: 'otros', label: 'Otros' },
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    let monthlyAmount;
    if (frequency === 'anual') monthlyAmount = parseFloat(amount) / 12;
    else if (frequency === 'trimestral') monthlyAmount = parseFloat(amount) / 3;
    else monthlyAmount = parseFloat(amount);
    const categoryLabel = CATEGORIES.find(c => c.key === category)?.label || category;
    onAdd({ name: description ? `${categoryLabel} — ${description}` : categoryLabel, category, description, amount: monthlyAmount, originalAmount: parseFloat(amount), frequency });
  };

  const getPlaceholder = () => ({ mensual: '50', trimestral: '150', anual: '600', unico: '300' }[frequency] || '50');
  const getMonthlyEquivalent = () => {
    if (!amount) return null;
    const value = parseFloat(amount);
    if (frequency === 'anual') return (value / 12).toFixed(2);
    if (frequency === 'trimestral') return (value / 3).toFixed(2);
    if (frequency === 'unico') return '(Gasto único)';
    return null;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Añadir gasto</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Categoría</label>
            <select value={category} onChange={e => setCategory(e.target.value)} required
              style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #ddd', fontSize: '15px', background: 'white', color: category ? '#111' : '#aaa' }}>
              <option value="" disabled>Selecciona una categoría</option>
              {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Descripción (opcional)</label>
            <input type="text" placeholder="Ej: recibo enero, factura fontanero..." value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Frecuencia</label>
            <div className="frequency-options">
              {['mensual', 'trimestral', 'anual', 'unico'].map(f => (
                <button key={f} type="button" className={`frequency-option ${frequency === f ? 'selected' : ''}`} onClick={() => setFrequency(f)}>
                  {f === 'unico' ? 'Único' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>Cantidad total (€)</label>
            <input type="number" placeholder={getPlaceholder()} value={amount} onChange={(e) => setAmount(e.target.value)} required step="0.01" />
            {getMonthlyEquivalent() && (
              <p className="monthly-equivalent">{frequency !== 'unico' ? `Equivalente mensual: ${getMonthlyEquivalent()} €/mes` : getMonthlyEquivalent()}</p>
            )}
          </div>
          <button type="submit" className="submit-button">Añadir gasto</button>
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