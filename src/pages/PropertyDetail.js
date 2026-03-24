import React, { useState } from 'react';
import './PropertyDetail.css';
import PropertyDocuments from './PropertyDocuments';
import RoomDetail from './RoomDetail';
import ChatConversation, { getUnreadCount } from './ChatConversation';
import { supabase } from '../supabaseClient';

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
  return expenses.filter(expense => {
    const created = new Date(expense.createdAt);
    const createdYear = created.getFullYear();
    const createdMonth = created.getMonth();
    if (year < createdYear || (year === createdYear && month < createdMonth)) return false;
    if (expense.frequency === 'unico') return sameMonthYear(expense.createdAt, year, month);
    return true;
  });
}

function exportToExcel(propertyName, historyMonths, accumulated) {
  import('xlsx').then(XLSX => {
    const data = historyMonths.map(item => ({
      'Mes': formatMonthYear(item.year, item.month),
      'Estado': item.income > 0 ? 'Alquilado' : 'Vacío',
      'Ingresos (€)': item.income,
      'Gastos (€)': -item.expenses,
      'Neto (€)': item.net,
    }));
    data.push({
      'Mes': '',
      'Estado': '',
      'Ingresos (€)': '',
      'Gastos (€)': 'Ganancia acumulada',
      'Neto (€)': accumulated,
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Historial');
    ws['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
    XLSX.writeFile(wb, `historial_${propertyName.replace(/\s+/g, '_')}.xlsx`);
  });
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

function saveTenantCode(code, landlordEmail, propertyId, tenantId, roomId = null) {
  const codes = JSON.parse(localStorage.getItem('tenant_codes') || '{}');
  codes[code] = { landlordEmail, propertyId, tenantId, roomId };
  localStorage.setItem('tenant_codes', JSON.stringify(codes));
}

function PropertyDetail({ property, onBack, onUpdate, landlordEmail }) {
  const [expenses, setExpenses] = useState(property.expenses || []);
  const [showExpenses, setShowExpenses] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [tenants, setTenants] = useState(property.tenants || []);
  const [showAddTenant, setShowAddTenant] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);
  const [rooms, setRooms] = useState(property.rooms || []);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [viewingRoomId, setViewingRoomId] = useState(null); // ✅ CAMBIADO: guardamos solo el ID
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const [codeModal, setCodeModal] = useState(null); // { name, code }
  const [showHistory, setShowHistory] = useState(false);
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);
  const [confirmingTenant, setConfirmingTenant] = useState(null); // { id, name, amount }
  const [chatWithTenant, setChatWithTenant] = useState(null); // { tenantId, tenantName, roomId }

  const [paymentConfig, setPaymentConfig] = useState(property.paymentConfig || {
    startDay: 1,
    endDay: 5,
    limitDay: 5
  });
  const [payments, setPayments] = useState(property.payments || []);

  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());

  const createdAt = property.createdAt ? new Date(property.createdAt) : new Date(now.getFullYear(), now.getMonth(), 1);
  const minYear = createdAt.getFullYear();
  const minMonth = createdAt.getMonth();

  const isCurrentMonthFuture = isFutureMonth(currentYear, currentMonth);
  const isAtMinMonth = currentYear === minYear && currentMonth === minMonth;
  const isAtCurrentMonth = currentYear === now.getFullYear() && currentMonth === now.getMonth();

  // ✅ NUEVO: manejador de update que también sincroniza rooms localmente
  const handleUpdate = (updatedProperty) => {
    if (updatedProperty.rooms) {
      setRooms(updatedProperty.rooms);
    }
    if (updatedProperty.expenses) {
      setExpenses(updatedProperty.expenses);
    }
    if (updatedProperty.payments) {
      setPayments(updatedProperty.payments);
    }
    onUpdate(updatedProperty);
  };

  const getTenantPaymentStatus = (tenantId) => {
    if (tenants.length === 0 || property.status !== 'alquilado') return null;
    
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

  const handleConfirmPayment = (tenantId, customAmount) => {
    const tenant = tenants.find(t => t.id === tenantId);
    const amount = customAmount !== undefined ? customAmount : tenant?.amount;
    const updatedPayments = payments.map(p => 
      p.year === currentYear && p.month === currentMonth && p.tenantId === tenantId
        ? { ...p, status: 'confirmed', confirmedAt: new Date().toISOString(), amount, tenantName: tenant?.name }
        : p
    );
    setPayments(updatedPayments);
    onUpdate({ ...property, payments: updatedPayments });
  };

  const handleConfirmWithAmount = (tenantId, amount) => {
    const tenant = tenants.find(t => t.id === tenantId);
    // Si ya existe un pago pendiente, confirmarlo; si no, crear uno nuevo
    const existingPayment = payments.find(p =>
      p.year === currentYear && p.month === currentMonth && p.tenantId === tenantId
    );
    let updatedPayments;
    if (existingPayment) {
      updatedPayments = payments.map(p =>
        p.year === currentYear && p.month === currentMonth && p.tenantId === tenantId
          ? { ...p, status: 'confirmed', confirmedAt: new Date().toISOString(), amount, tenantName: tenant?.name }
          : p
      );
    } else {
      const newPayment = {
        year: currentYear,
        month: currentMonth,
        tenantId,
        status: 'confirmed',
        markedAt: new Date().toISOString(),
        confirmedAt: new Date().toISOString(),
        amount,
        tenantName: tenant?.name
      };
      updatedPayments = [...payments, newPayment];
    }
    setPayments(updatedPayments);
    onUpdate({ ...property, payments: updatedPayments });
    setConfirmingTenant(null);
  };

  const handleRejectPayment = (tenantId) => {
    const updatedPayments = payments.filter(p => 
      !(p.year === currentYear && p.month === currentMonth && p.tenantId === tenantId)
    );
    setPayments(updatedPayments);
    onUpdate({ ...property, payments: updatedPayments });
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

  const visibleExpenses = getExpensesForMonth(expenses, currentYear, currentMonth);
  
  const totalExpenses = visibleExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const myExpenses = visibleExpenses.reduce((sum, exp) => {
    const percentage = exp.expensePercentage || property.ownershipPercentage || 100;
    return sum + (exp.amount * percentage / 100);
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
      
      const totalExpenses = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
      
      const myExpenses = monthExpenses.reduce((sum, e) => {
        const percentage = e.expensePercentage || ownershipPercentage;
        return sum + (e.amount * percentage / 100);
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

  const handleAddExpense = (newExpense) => {
    const updatedExpenses = [...expenses, { ...newExpense, id: Date.now(), createdAt: new Date().toISOString() }];
    setExpenses(updatedExpenses);
    onUpdate({ ...property, expenses: updatedExpenses });
    setShowAddExpense(false);
  };

  const handleDeleteExpense = (expenseId) => {
    const updatedExpenses = expenses.filter(exp => exp.id !== expenseId);
    setExpenses(updatedExpenses);
    onUpdate({ ...property, expenses: updatedExpenses });
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

    // Guardar en Supabase si se proporcionó email
    if (tenantData.email && landlordEmail) {
      await supabase.from('inquilinos').insert({
        email: tenantData.email.toLowerCase().trim(),
        landlord_email: landlordEmail,
        property_id: property.id,
        tenant_id: newTenant.id,
        tenant_code: code,
        tenant_name: tenantData.name,
        property_name: property.name,
        rent: newTenant.amount || property.price,
        payment_config: property.paymentConfig || { startDay: 1, endDay: 5 },
        room_id: null,
      });
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

  return (
    <div className="property-detail-container">

      {/* Header */}
      <div className="detail-header">
        <button className="back-button" onClick={onBack}>←</button>
        <h1 className="detail-title">{property.name}</h1>
        <button className="detail-options" onClick={() => setShowOptionsMenu(!showOptionsMenu)}>⋮</button>
        {showOptionsMenu && (
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
                <div className="income-sublabel" style={{ color: netIncome < 0 && monthlyIncome === 0 ? '#F44336' : '#999' }}>
                  {netIncome < 0 && monthlyIncome === 0 ? 'Pago sin confirmar' : 'Neto'}
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
                 property.status === 'por_habitaciones' ? 'Por habitaciones' : 'Vacío'}
              </span>
            </div>
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
            <button className="add-tenant-button" onClick={() => setShowAddRoom(true)}>
              + Añadir habitación
            </button>
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
      {property.status === 'alquilado' && (tenants.length > 0 || payments.some(p => p.year === currentYear && p.month === currentMonth && p.status === 'confirmed')) && (
        <div className="info-card payment-card">
          <div className="card-header">
            <h3>Pago del alquiler</h3>
          </div>
          
          <div className="payment-content">
            <div className="tenants-payment-grid">
              {tenants.map(tenant => {
                const tenantStatus = getTenantPaymentStatus(tenant.id);
                const tenantPayment = payments.find(p => 
                  p.year === currentYear && 
                  p.month === currentMonth && 
                  p.tenantId === tenant.id
                );
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

                    {tenantStatus === 'pending_confirmation' && tenantPayment && (
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

                    {tenantStatus === 'paid' && tenantPayment && (
                      <div className="tenant-payment-actions">
                        <p className="payment-confirmed-text">
                          ✓ {tenantPayment.amount !== undefined ? `${tenantPayment.amount} €` : `${tenant.amount} €`}
                          {tenantPayment.amount !== undefined && tenantPayment.amount !== tenant.amount && (
                            <span style={{ fontSize: '11px', color: '#aaa', marginLeft: '4px' }}>(base: {tenant.amount} €)</span>
                          )}
                          {' · '}{new Date(tenantPayment.confirmedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                        </p>
                        <button className="payment-cancel-link" onClick={() => handleCancelPayment(tenant.id)}>
                          Cancelar
                        </button>
                      </div>
                    )}

                    {(tenantStatus === 'pending' || tenantStatus === 'overdue' || tenantStatus === 'not_yet') && (
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
          <h3>Gastos mensuales</h3>
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

      {/* Inquilinos */}
      {property.status === 'alquilado' && (
        <div className="info-card tenant-card">
          <div className="card-header">
            <h3>Inquilinos</h3>
            {(tenants.length === 0 || property.isSharedProperty) && (
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
                      {getUnreadCount(landlordEmail, property.id, null, tenant.id, 'landlord') > 0 && (
                        <span style={{
                          position: 'absolute', top: -4, right: -4,
                          background: '#e74c3c', color: 'white',
                          borderRadius: '50%', width: 16, height: 16,
                          fontSize: 10, fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {getUnreadCount(landlordEmail, property.id, null, tenant.id, 'landlord')}
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
                      : property.status === 'alquilado' ? 'Alquilado' : 'Vacío'}
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

      {/* Modals */}
      {showAddExpense && <AddExpenseModal onClose={() => setShowAddExpense(false)} onAdd={handleAddExpense} ownershipPercentage={property.ownershipPercentage || 100} />}
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

function AddExpenseModal({ onClose, onAdd, ownershipPercentage }) {
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState('mensual');
  const [expensePercentage, setExpensePercentage] = useState(ownershipPercentage?.toString() || '100');

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
    onAdd({
      name: description ? `${categoryLabel} — ${description}` : categoryLabel,
      category,
      description,
      amount: monthlyAmount,
      originalAmount: parseFloat(amount),
      frequency,
      expensePercentage: parseFloat(expensePercentage)
    });
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

  const getMyPart = () => {
    if (!amount || !expensePercentage) return null;
    const monthly = frequency === 'anual' ? parseFloat(amount) / 12 :
                    frequency === 'trimestral' ? parseFloat(amount) / 3 :
                    parseFloat(amount);
    return (monthly * parseFloat(expensePercentage) / 100).toFixed(2);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h2>Añadir gasto</h2><button className="modal-close" onClick={onClose}>×</button></div>
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
          <div className="form-group">
            <label>Mi porcentaje de este gasto (%)</label>
            <input type="number" placeholder="100" min="0" max="100" value={expensePercentage} onChange={(e) => setExpensePercentage(e.target.value)} required />
            {getMyPart() && (
              <p className="monthly-equivalent">Mi parte: {getMyPart()} €/mes</p>
            )}
          </div>
          <button type="submit" className="submit-button">Añadir gasto</button>
        </form>
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
            <label>Email del inquilino</label>
            <input type="email" placeholder="laura@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Teléfono</label>
            <input type="tel" placeholder="622 280 559" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </div>
          {isFirstTenant && (
            <div className="form-group">
              <label>¿Es un piso compartido?</label>
              <div className="shared-options">
                <button type="button" className={`shared-option ${!isShared ? 'selected' : ''}`} onClick={() => setIsShared(false)}>No, inquilino único</button>
                <button type="button" className={`shared-option ${isShared ? 'selected' : ''}`} onClick={() => setIsShared(true)}>Sí, piso compartido</button>
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
  const [phone, setPhone] = useState(tenant.phone);
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
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
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
  const [price, setPrice] = useState(property.price.toString());
  const [status, setStatus] = useState(property.status);
  const [ownershipPercentage, setOwnershipPercentage] = useState(property.ownershipPercentage?.toString() || '100');
  
  const handleSubmit = (e) => { 
    e.preventDefault(); 
    onSave({ name, price: parseInt(price), status, ownershipPercentage: parseFloat(ownershipPercentage) }); 
  };
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h2>Editar propiedad</h2><button className="modal-close" onClick={onClose}>×</button></div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nombre/Dirección</label>
            <input type="text" placeholder="Ej: Calle Mayor 12 · 2°B" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Precio mensual (€)</label>
            <input type="number" placeholder="850" value={price} onChange={(e) => setPrice(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Mi porcentaje de propiedad (%)</label>
            <input type="number" placeholder="100" min="1" max="100" value={ownershipPercentage} onChange={(e) => setOwnershipPercentage(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Estado</label>
            <div className="status-options">
              {['vacio', 'alquilado'].map(s => (
                <button key={s} type="button" className={`status-option ${status === s ? 'selected' : ''}`} onClick={() => setStatus(s)}>
                  <span className={`status-dot ${s}`}></span>
                  {s === 'vacio' ? 'Vacío' : 'Alquilado'}
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
            <input type="tel" placeholder="622 280 559" value={phone} onChange={(e) => setPhone(e.target.value)} required />
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