import React, { useState, useEffect } from 'react';
import './PropertyDetail.css';
import { supabase } from '../supabaseClient';

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
    if (e.active === false) return false;
    const start = new Date((e.start_date || e.createdAt) + (e.start_date ? 'T12:00:00' : ''));
    const sy = start.getFullYear(), sm = start.getMonth();
    if (year < sy || (year === sy && month < sm)) return false;
    if (e.type === 'puntual' || e.frequency === 'unico') return year === sy && month === sm;
    const monthsDiff = (year - sy) * 12 + (month - sm);
    const step = e.frequency === 'trimestral' ? 3 : e.frequency === 'anual' ? 12 : 1;
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
  return amt;
}

function exportVacationalToExcel(name, historyMonths, accumulated) {
  import('xlsx').then(XLSX => {
    const data = historyMonths.map(item => ({
      'Mes': formatMonthYear(item.year, item.month),
      'Reservas': item.bookings,
      'Ingresos (€)': item.income,
      'Gastos (€)': -item.expenses,
      'Neto (€)': item.net,
    }));
    data.push({ 'Mes': '', 'Reservas': '', 'Ingresos (€)': '', 'Gastos (€)': 'Ganancia acumulada', 'Neto (€)': accumulated });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Historial');
    ws['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
    XLSX.writeFile(wb, `historial_${name.replace(/\s+/g, '_')}.xlsx`);
  });
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
function VacationalDetail({ property, onBack, onUpdate, landlordEmail }) {
  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [expenses, setExpenses] = useState([]);
  const [bookings, setBookings] = useState(property.bookings || []);

  React.useEffect(() => { setBookings(property.bookings || []); }, [property.bookings]);

  useEffect(() => {
    supabase
      .from('expenses')
      .select('*')
      .eq('property_id', String(property.id))
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setExpenses(data); });
  }, [property.id]);
  const [showAddBooking, setShowAddBooking] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showExpenses, setShowExpenses] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editingBooking, setEditingBooking] = useState(null);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showEditProperty, setShowEditProperty] = useState(false);

  const createdAt = property.createdAt ? new Date(property.createdAt) : new Date(now.getFullYear(), now.getMonth(), 1);
  const minYear = createdAt.getFullYear(), minMonth = createdAt.getMonth();
  const isAtMinMonth = currentYear === minYear && currentMonth === minMonth;
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
  const myExpenses = visibleExpenses.reduce((sum, e) => sum + getMonthlyEquivalent(e) * (property.ownershipPercentage || 100) / 100, 0);

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
      const exp = getExpensesForMonth(expenses, y, m).reduce((sum, e) => sum + getMonthlyEquivalent(e) * (property.ownershipPercentage || 100) / 100, 0);
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

  return (
    <div className="property-detail-container">
      {/* Header */}
      <div className="detail-header">
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
          </div>
        )}
      </div>

      {/* Month navigator */}
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
          <button className="payment-btn confirm small" style={{ flex: 'none', padding: '8px 14px' }}
            onClick={() => { setEditingBooking(null); setShowAddBooking(true); }}>
            + Reserva
          </button>
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
                position: 'relative', cursor: booking ? 'pointer' : 'default',
                fontWeight: isToday ? 700 : 400,
                color: booking ? platformColor(booking.platform) : '#333',
              }}
                onClick={() => booking && setEditingBooking(booking)}
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
                }} onClick={() => { setEditingBooking(booking); setShowAddBooking(true); }}>
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
          <div className="expenses-total">
            <span>{myExpenses.toFixed(2)} €/mes</span>
            <span className="arrow">{showExpenses ? '▼' : '›'}</span>
          </div>
        </div>
        {showExpenses && (
          <div className="expenses-detail">
            {visibleExpenses.length === 0 ? (
              <p className="no-expenses">No hay gastos añadidos</p>
            ) : visibleExpenses.map(exp => {
              const isPendingVariable = exp.type === 'recurrente_variable' && !exp.amount;
              const monthly = getMonthlyEquivalent(exp);
              const freqLabel = { trimestral: 'Trimestral', anual: 'Anual', unico: 'Único', mensual: null }[exp.frequency] || null;
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
                    </div>
                    {isPendingVariable && (
                      <PendingVariableInput expenseId={exp.id} onSave={handleUpdateVariableAmount} />
                    )}
                  </div>
                  <div className="expense-actions" style={{ gap: 6 }}>
                    <span style={{ color: isPendingVariable ? '#FFA726' : undefined }}>
                      {isPendingVariable ? '— €' : `${monthly.toFixed(2)} €/mes`}
                    </span>
                    {exp.type !== 'puntual' && (
                      <button
                        className="delete-expense"
                        style={{ background: exp.active === false ? '#E8F5E9' : '#FFF8E1', color: exp.active === false ? '#388E3C' : '#F57F17', borderRadius: 6, padding: '2px 7px', fontSize: 11 }}
                        onClick={() => handleTogglePause(exp.id, exp.active !== false)}
                      >
                        {exp.active === false ? '▶' : '⏸'}
                      </button>
                    )}
                    <button className="delete-expense" onClick={() => handleDeleteExpense(exp.id)}>×</button>
                  </div>
                </div>
              );
            })}
            {visibleExpenses.length > 0 && (
              <div className="expense-item total"><strong>Equiv. mensual</strong><strong>{myExpenses.toFixed(2)} €</strong></div>
            )}
            <button className="add-expense-button" onClick={() => setShowAddExpense(true)}>+ Añadir gasto</button>
          </div>
        )}
        {!showExpenses && (
          <button className="add-expense-button" onClick={() => setShowAddExpense(true)}>+ Añadir gasto</button>
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
        <AddExpenseModal onClose={() => setShowAddExpense(false)} onAdd={handleAddExpense} />
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

const EXPENSE_TYPES = [
  { key: 'puntual', label: 'Puntual', desc: 'Un pago único' },
  { key: 'recurrente_fijo', label: 'Recurrente fijo', desc: 'Mismo importe, se repite indefinidamente' },
  { key: 'recurrente_variable', label: 'Recurrente variable', desc: 'Introduces el importe cada vez que llega' },
  { key: 'recurrente_temporal', label: 'Recurrente temporal', desc: 'Mismo importe durante X pagos y para' },
];

function AddExpenseModal({ onClose, onAdd }) {
  const today = new Date().toISOString().split('T')[0];
  const [type, setType] = useState('recurrente_fijo');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState('mensual');
  const [durationPayments, setDurationPayments] = useState('');
  const [startDate, setStartDate] = useState(today);

  const needsFrequency = type !== 'puntual';
  const needsAmount = type !== 'recurrente_variable';
  const needsDuration = type === 'recurrente_temporal';
  const freqStep = frequency === 'trimestral' ? 3 : frequency === 'anual' ? 12 : 1;
  const monthlyEquiv = amount && needsAmount ? (parseFloat(amount) / freqStep).toFixed(2) : null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const categoryLabel = EXPENSE_CATEGORIES.find(c => c.key === category)?.label || category;
    onAdd({
      name: description ? `${categoryLabel} — ${description}` : categoryLabel,
      category, description, type,
      frequency: type === 'puntual' ? 'unico' : frequency,
      amount: needsAmount && amount ? parseFloat(amount) : null,
      duration_payments: needsDuration && durationPayments ? parseInt(durationPayments) : null,
      start_date: startDate,
      active: true,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2>Añadir gasto</h2><button className="modal-close" onClick={onClose}>×</button></div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Tipo de gasto</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {EXPENSE_TYPES.map(t => (
                <button key={t.key} type="button" onClick={() => setType(t.key)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '10px 14px', borderRadius: 10, border: `2px solid ${type === t.key ? '#111' : '#e0e0e0'}`, background: type === t.key ? '#f5f5f5' : 'white', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>{t.label}</span>
                  <span style={{ fontSize: 12, color: '#aaa' }}>{t.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>Categoría</label>
            <select value={category} onChange={e => setCategory(e.target.value)} required
              style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #ddd', fontSize: '15px', background: 'white', color: category ? '#111' : '#aaa' }}>
              <option value="" disabled>Selecciona una categoría</option>
              {EXPENSE_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Descripción (opcional)</label>
            <input type="text" placeholder="Ej: recibo gas, fontanero..." value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          {needsFrequency && (
            <div className="form-group">
              <label>Frecuencia</label>
              <div className="frequency-options">
                {['mensual', 'trimestral', 'anual'].map(f => (
                  <button key={f} type="button" className={`frequency-option ${frequency === f ? 'selected' : ''}`} onClick={() => setFrequency(f)}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {needsAmount && (
            <div className="form-group">
              <label>Importe por {type === 'puntual' ? 'pago' : { mensual: 'mes', trimestral: 'trimestre', anual: 'año' }[frequency]} (€)</label>
              <input type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required step="0.01" min="0.01" />
              {monthlyEquiv && frequency !== 'mensual' && (
                <p className="monthly-equivalent">Equivalente mensual: {monthlyEquiv} €/mes</p>
              )}
            </div>
          )}
          {!needsAmount && (
            <p style={{ fontSize: 13, color: '#888', background: '#FFF8E1', borderRadius: 8, padding: '10px 12px', margin: '0 0 16px' }}>
              ℹ El importe se introduce cada vez que llega la factura. Recibirás un aviso cuando toque.
            </p>
          )}
          {needsDuration && (
            <div className="form-group">
              <label>Duración (número de pagos)</label>
              <input type="number" placeholder="Ej: 12" value={durationPayments} onChange={e => setDurationPayments(e.target.value)} required min="1" />
              {durationPayments && (
                <p className="monthly-equivalent">Para en {durationPayments} {frequency === 'mensual' ? 'meses' : frequency === 'trimestral' ? 'trimestres' : 'años'}</p>
              )}
            </div>
          )}
          <div className="form-group">
            <label>Fecha de inicio</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
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