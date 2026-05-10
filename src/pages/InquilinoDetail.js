import { useState, useEffect, useRef } from 'react';
import './InquilinoDetail.css';
import ChatConversation from './ChatConversation';
import TenantDocuments from './TenantDocuments';
import { supabase } from '../supabaseClient';

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export default function InquilinoDetail({ rental, onBack }) {
  const [showHistory, setShowHistory] = useState(false);
  const [showIncident, setShowIncident] = useState(false);
  const [incidentText, setIncidentText] = useState('');
  const [incidentFile, setIncidentFile] = useState(null); // { id, dataUrl, fileName, fileType, fileSize }
  const [sendingIncident, setSendingIncident] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showGroupChat, setShowGroupChat] = useState(false);
  const [hasGroupChat, setHasGroupChat] = useState(false);

  useEffect(() => {
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('landlord_email', rental.landlordEmail)
      .eq('property_id', rental.propertyId)
      .eq('is_group_message', true)
      .then(({ count }) => { if (count > 0) setHasGroupChat(true); });
  }, [rental.landlordEmail, rental.propertyId]); // eslint-disable-line
  const incidentFileRef = useRef(null);
  const [showTenantDocs, setShowTenantDocs] = useState(false);
  const [supabasePayment, setSupabasePayment] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmountInput, setPaymentAmountInput] = useState('');
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [showIncidents, setShowIncidents] = useState(false);

  useEffect(() => {
    const now = new Date();

    const fetchCurrentPayment = () => {
      const col = rental.roomId ? 'room_id' : 'tenant_id';
      const val = rental.roomId || rental.tenantId;
      supabase
        .from('payments')
        .select('status, amount, partial_amount, pending_amount')
        .eq(col, val)
        .eq('year', now.getFullYear())
        .eq('month', now.getMonth())
        .maybeSingle()
        .then(({ data }) => {
          // Solo sobreescribir si el servidor devuelve datos reales;
          // no resetear a null si ya tenemos un estado local (evita parpadeo por RLS/red)
          if (data) setSupabasePayment(data);
        });
    };

    fetchCurrentPayment();

    // Refetch al volver a la pestaña (el propietario puede haber confirmado mientras tanto)
    const onVisibility = () => { if (document.visibilityState === 'visible') fetchCurrentPayment(); };
    document.addEventListener('visibilitychange', onVisibility);

    // Polling cada 15s para ver si el propietario ha confirmado o rechazado
    const pollInterval = setInterval(fetchCurrentPayment, 15000);

    // Historial completo
    const query = supabase
      .from('payments')
      .select('year, month, status, amount, partial_amount, pending_amount')
      .order('year', { ascending: false })
      .order('month', { ascending: false });
    if (rental.roomId) {
      query.eq('room_id', rental.roomId);
    } else {
      query.eq('tenant_id', rental.tenantId);
    }
    query.then(({ data }) => { if (data) setPaymentHistory(data); });

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(pollInterval);
    };
  }, [rental.code, rental.roomId, rental.tenantId]);

  const isPaid     = supabasePayment?.status === 'confirmed';
  const isPartial  = supabasePayment?.status === 'partial';
  const isSent     = !isPaid && !isPartial && supabasePayment?.status === 'pending';
  const canConfirm = !isPaid && !isSent;

  const historyPayments = paymentHistory;

  const handleConfirmPayment = () => {
    if (isSent) {
      alert('Ya has enviado el pago este mes.');
      return;
    }
    const alreadyReceived = isPartial && supabasePayment?.partial_amount
      ? supabasePayment.partial_amount
      : 0;
    const remaining = Math.max(0, rental.rent - alreadyReceived);
    setPaymentAmountInput(String(remaining || rental.rent));
    setShowPaymentModal(true);
  };

  const handleSubmitPaymentAmount = async () => {
    const amount = parseFloat(paymentAmountInput.replace(',', '.'));
    if (!amount || amount <= 0) return;

    const now = new Date();

    const { data, error } = await supabase.rpc('mark_payment_pending', {
      p_code: rental.code,
      p_year: now.getFullYear(),
      p_month: now.getMonth(),
      p_amount: amount,
    });
    if (error || data?.error) {
      alert('Error al enviar el pago. Inténtalo de nuevo.');
      return;
    }
    setShowPaymentModal(false);
    setSupabasePayment(prev => ({
      ...(prev || {}),
      status: 'pending',
      pending_amount: amount,
    }));
  };


  // Cargar incidencias del inquilino desde Supabase
  useEffect(() => {
    const query = supabase
      .from('incidents')
      .select('id, description, status, created_at, attachment_url')
      .eq('property_id', String(rental.propertyId))
      .eq('tenant_id', String(rental.tenantId))
      .order('created_at', { ascending: false });
    if (rental.roomId) query.eq('room_id', String(rental.roomId));
    query.then(({ data }) => { if (data) setIncidents(data); });
  }, [rental.propertyId, rental.tenantId, rental.roomId]);

  const handleSendIncident = async () => {
    if (!incidentText.trim() && !incidentFile) return;
    if (sendingIncident) return;
    setSendingIncident(true);
    const { landlordEmail, propertyId, tenantId, roomId, tenantName, address } = rental;

    // 1. Subir adjunto a Supabase Storage (si existe)
    let attachmentUrl = null;
    if (incidentFile) {
      const ext = incidentFile.fileName.split('.').pop();
      const path = `${propertyId}/${Date.now()}.${ext}`;
      const blob = await fetch(incidentFile.dataUrl).then(r => r.blob());
      const { error: uploadError } = await supabase.storage
        .from('incident-attachments')
        .upload(path, blob, { contentType: incidentFile.fileType });
      if (uploadError) {
        console.error('[InquilinoDetail] upload error:', uploadError);
        alert('Error subiendo el archivo adjunto.');
        setSendingIncident(false);
        return;
      }
      attachmentUrl = supabase.storage.from('incident-attachments').getPublicUrl(path).data.publicUrl;
    }

    // 2. Insertar incidencia en Supabase
    const { error: dbError } = await supabase.from('incidents').insert({
      property_id: String(propertyId),
      landlord_email: landlordEmail,
      tenant_id: String(tenantId),
      tenant_name: tenantName,
      room_id: roomId ? String(roomId) : null,
      description: incidentText.trim(),
      property_name: address,
      status: 'open',
      attachment_url: attachmentUrl,
    });

    if (dbError) {
      console.error('[InquilinoDetail] insert incident error:', dbError);
      alert(`Error guardando la incidencia: ${dbError.message}`);
      setSendingIncident(false);
      return;
    }

    // 3. Mensaje automático en el chat
    await supabase.from('messages').insert({
      property_id: String(propertyId),
      room_id: roomId ? String(roomId) : null,
      tenant_id: roomId ? null : String(tenantId),
      landlord_email: landlordEmail,
      sender: 'tenant',
      sender_id: String(tenantId),
      content: `🔧 Nueva incidencia: ${incidentText.trim()}`,
      is_group_message: false,
      read_by_landlord: false,
      read_by_tenant: true,
    });

    const newIncident = {
      id: Date.now(),
      description: incidentText.trim(),
      status: 'open',
      created_at: new Date().toISOString(),
      attachment_url: attachmentUrl,
    };
    setIncidents(prev => [newIncident, ...prev]);
    setIncidentText('');
    setIncidentFile(null);
    setShowIncident(false);
    setShowIncidents(true);
    setSendingIncident(false);
  };

  if (showTenantDocs) {
    return (
      <TenantDocuments
        rental={rental}
        onBack={() => setShowTenantDocs(false)}
      />
    );
  }

  if (showChat) {
    return (
      <ChatConversation
        landlordEmail={rental.landlordEmail}
        propertyId={rental.propertyId}
        roomId={rental.roomId}
        tenantId={rental.tenantId}
        tenantName={rental.tenantName}
        propertyName={rental.address}
        currentRole="tenant"
        onBack={() => setShowChat(false)}
      />
    );
  }

  if (showGroupChat) {
    return (
      <ChatConversation
        landlordEmail={rental.landlordEmail}
        propertyId={rental.propertyId}
        roomId={null}
        tenantId={rental.tenantId}
        tenantName={rental.tenantName}
        propertyName={rental.address}
        currentRole="tenant"
        isGroup={true}
        onBack={() => setShowGroupChat(false)}
      />
    );
  }


  return (
    <div className="inquilino-detail">
      <div className="inquilino-detail-header">
        <button className="back-button" onClick={onBack}>←</button>
        <h1 className="detail-title" style={{ fontSize: '16px' }}>{rental.address}</h1>
        <div style={{ width: 40 }} />
      </div>

      <div className="inquilino-detail-body">
        {/* Importe */}
        <div className="inquilino-rent-card">
          <p className="inquilino-rent-amount">{rental.rent} €</p>
          <p className="inquilino-rent-label">al mes</p>
          <div className="inquilino-payment-status">
            {isPaid    && <span className="payment-badge paid">Pago confirmado por el propietario</span>}
            {isPartial && (
              <span className="payment-badge partial">
                {supabasePayment?.partial_amount != null
                  ? `${Number(supabasePayment.partial_amount).toFixed(2)}€ confirmados — quedan ${Math.max(0, rental.rent - supabasePayment.partial_amount).toFixed(2)}€`
                  : 'Pago parcial confirmado por el propietario'}
              </span>
            )}
            {isSent    && <span className="payment-badge sent">Pago enviado — esperando confirmación</span>}
            {canConfirm && !isPartial && (
              <span className="payment-badge pending">
                Pago pendiente (días {rental.paymentConfig.startDay}–{rental.paymentConfig.endDay})
              </span>
            )}
          </div>
        </div>

        {/* Confirmar pago */}
        <button
          className={`inquilino-action-btn primary${(!canConfirm) ? ' disabled' : ''}`}
          onClick={handleConfirmPayment}
          disabled={!canConfirm}
        >
          {isPaid     ? '✓ Pago confirmado'
           : isPartial ? `Enviar resto (${Math.max(0, rental.rent - (supabasePayment?.partial_amount || 0)).toFixed(2)}€)`
           : isSent    ? 'Pago enviado al propietario'
           : 'Confirmar pago'}
        </button>

        {/* Historial */}
        <button className="inquilino-action-btn secondary" onClick={() => setShowHistory(!showHistory)}>
          Historial de pagos
        </button>
        {showHistory && (
          <div className="inquilino-history">
            {historyPayments.length === 0
              ? <p className="history-empty">Sin historial todavía.</p>
              : historyPayments.map((p, i) => (
                <div key={i} className="history-row">
                  <span className="history-month">{MONTH_NAMES[p.month]} {p.year}</span>
                  <span className={`history-status ${
                    p.status === 'confirmed' ? 'paid'
                    : p.status === 'partial' ? 'partial'
                    : 'sent'
                  }`}>
                    {p.status === 'confirmed' ? 'Confirmado'
                     : p.status === 'partial' ? 'Parcial'
                     : 'Enviado'}
                  </span>
                  <span className="history-amount">
                    {p.status === 'partial'
                      ? `${p.partial_amount ?? p.amount ?? rental.rent} €`
                      : `${p.amount ?? rental.rent} €`}
                  </span>
                </div>
              ))
            }
          </div>
        )}

        {/* Acciones */}
        <div className="inquilino-actions-row">
          <button className="inquilino-action-box" onClick={() => setShowIncident(!showIncident)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Reportar incidencia</span>
          </button>
          <button className="inquilino-action-box" onClick={() => setShowChat(true)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Chat con el propietario</span>
          </button>
          {hasGroupChat && (
            <button className="inquilino-action-box" onClick={() => setShowGroupChat(true)}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="9" cy="7" r="4" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Chat del bloque</span>
            </button>
          )}
        </div>

        {showIncident && (
          <div className="incident-box">
            <textarea
              className="incident-textarea"
              placeholder="Describe el problema (gotera, avería, etc.)..."
              value={incidentText}
              onChange={(e) => setIncidentText(e.target.value)}
              rows={4}
            />

            {/* Adjunto */}
            <input
              ref={incidentFileRef}
              type="file"
              accept="image/*,application/pdf,.doc,.docx"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const dataUrl = await new Promise((res, rej) => {
                  const reader = new FileReader();
                  reader.onload = () => res(reader.result);
                  reader.onerror = rej;
                  reader.readAsDataURL(file);
                });
                setIncidentFile({ id: Date.now(), dataUrl, fileName: file.name, fileType: file.type, fileSize: file.size });
                e.target.value = '';
              }}
            />

            {incidentFile ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#f5f5f5', borderRadius: 10, marginBottom: 8 }}>
                {incidentFile.fileType?.startsWith('image/') ? (
                  <img src={incidentFile.dataUrl} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover' }} />
                ) : (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14 2v6h6" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
                <span style={{ flex: 1, fontSize: 13, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{incidentFile.fileName}</span>
                <button onClick={() => setIncidentFile(null)} style={{ background: 'none', border: 'none', fontSize: 18, color: '#aaa', cursor: 'pointer', lineHeight: 1 }}>×</button>
              </div>
            ) : (
              <button
                type="button"
                className="inquilino-action-btn secondary"
                onClick={() => incidentFileRef.current.click()}
                style={{ marginBottom: 8 }}
              >
                📎 Adjuntar foto o archivo
              </button>
            )}

            <button
              className="inquilino-action-btn primary"
              onClick={handleSendIncident}
              disabled={sendingIncident || (!incidentText.trim() && !incidentFile)}
            >
              {sendingIncident ? 'Enviando…' : 'Enviar incidencia'}
            </button>
          </div>
        )}

        {/* Historial de incidencias */}
        <div className="inquilino-docs-card" onClick={() => setShowIncidents(!showIncidents)} style={{ cursor: 'pointer' }}>
          <span className="docs-label">Mis incidencias</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {incidents.length > 0 && (
              <span className="docs-count">{incidents.length}</span>
            )}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <polyline points={showIncidents ? '18 15 12 9 6 15' : '6 9 12 15 18 9'} stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>

        {showIncidents && (
          <div className="inquilino-docs-section">
            {incidents.length === 0 ? (
              <p className="docs-empty">No has reportado ninguna incidencia todavía.</p>
            ) : (
              incidents.map(inc => {
                const statusMap = {
                  open:        { label: 'Pendiente',   cls: 'incident-status-open' },
                  in_progress: { label: 'En proceso',  cls: 'incident-status-progress' },
                  resolved:    { label: 'Resuelta',    cls: 'incident-status-resolved' },
                };
                const { label, cls } = statusMap[inc.status] || statusMap.open;
                const fecha = new Date(inc.created_at).toLocaleDateString('es-ES', {
                  day: '2-digit', month: 'short', year: 'numeric',
                });
                return (
                  <div key={inc.id} className="incident-history-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="incident-history-desc">{inc.description}</p>
                      <p className="incident-history-date">{fecha}</p>
                    </div>
                    <span className={`incident-status-badge ${cls}`}>{label}</span>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Documentos */}
        <div className="inquilino-docs-card" onClick={() => setShowTenantDocs(true)} style={{ cursor: 'pointer' }}>
          <span className="docs-label">Documentos</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <polyline points="9 18 15 12 9 6" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      </div>

      {showPaymentModal && (
        <div className="modal-overlay" onClick={() => setShowPaymentModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Confirmar pago</h2>
              <button className="modal-close" onClick={() => setShowPaymentModal(false)}>×</button>
            </div>
            <div className="form-group">
              <label>Importe enviado (€)</label>
              <input
                type="number"
                value={paymentAmountInput}
                onChange={(e) => setPaymentAmountInput(e.target.value)}
                step="0.01"
                min="0"
                autoFocus
              />
              {parseFloat(paymentAmountInput) < rental.rent && parseFloat(paymentAmountInput) > 0 && (
                <p style={{ marginTop: '8px', fontSize: '13px', color: '#888' }}>
                  Importe total: {rental.rent} € — se registrará como pago parcial
                </p>
              )}
            </div>
            <button
              className="submit-button"
              onClick={handleSubmitPaymentAmount}
            >
              Confirmar pago
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
