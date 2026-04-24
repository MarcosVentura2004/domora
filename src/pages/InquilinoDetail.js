import { useState, useEffect, useRef } from 'react';
import './InquilinoDetail.css';
import ChatConversation from './ChatConversation';
import { supabase } from '../supabaseClient';

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function getPublicUrl(storagePath, fromSharedFiles = false) {
  if (!storagePath) return null;
  // shared_files usa bucket "documentos"; documents legacy usa "documents"
  const bucket = fromSharedFiles ? 'documentos' : 'documents';
  return supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
}

function FileIcon({ fileType, size = 20 }) {
  const s = size;
  if (fileType && fileType.includes('pdf')) {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#e74c3c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M14 2v6h6" stroke="#e74c3c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <text x="6" y="19" fontSize="6" fill="#e74c3c" fontWeight="bold">PDF</text>
      </svg>
    );
  }
  if (fileType && fileType.includes('image')) {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="#27ae60" strokeWidth="2"/>
        <circle cx="8.5" cy="8.5" r="1.5" stroke="#27ae60" strokeWidth="2"/>
        <polyline points="21 15 16 10 5 21" stroke="#27ae60" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  }
  if (fileType && (fileType.includes('word') || fileType.includes('document'))) {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#2980b9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M14 2v6h6" stroke="#2980b9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <line x1="8" y1="13" x2="16" y2="13" stroke="#2980b9" strokeWidth="2" strokeLinecap="round"/>
        <line x1="8" y1="17" x2="16" y2="17" stroke="#2980b9" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    );
  }
  if (fileType && (fileType.includes('sheet') || fileType.includes('excel') || fileType.includes('csv'))) {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#16a085" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M14 2v6h6" stroke="#16a085" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <line x1="8" y1="13" x2="16" y2="13" stroke="#16a085" strokeWidth="2" strokeLinecap="round"/>
        <line x1="8" y1="17" x2="12" y2="17" stroke="#16a085" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    );
  }
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 2v6h6" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
  const [showDocs, setShowDocs] = useState(false);
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [docs, setDocs] = useState([]);
  const [supabasePayment, setSupabasePayment] = useState(null);
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
        .select('status, amount')
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

    // Historial completo
    const query = supabase
      .from('payments')
      .select('year, month, status, amount')
      .order('year', { ascending: false })
      .order('month', { ascending: false });
    if (rental.roomId) {
      query.eq('room_id', rental.roomId);
    } else {
      query.eq('tenant_id', rental.tenantId);
    }
    query.then(({ data }) => { if (data) setPaymentHistory(data); });

    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [rental.code, rental.roomId, rental.tenantId]);

  const isPaid = supabasePayment?.status === 'confirmed';
  const isSent = !isPaid && supabasePayment?.status === 'pending';
  const canConfirm = !isPaid && !isSent;

  const historyPayments = paymentHistory;

  const landlordDocs = docs.filter(d => d.uploaded_by === 'landlord' && d.shared_with_tenant);
  const myDocs = docs.filter(d => d.uploaded_by === 'tenant');

  const handleConfirmPayment = async () => {
    if (supabasePayment) {
      alert('Ya has enviado el pago este mes.');
      return;
    }
    const now = new Date();
    const { data, error } = await supabase.rpc('mark_payment_pending', {
      p_code: rental.code,
      p_year: now.getFullYear(),
      p_month: now.getMonth(),
      p_amount: rental.rent,
    });
    if (error || data?.error) {
      alert('Ya has enviado el pago este mes.');
      return;
    }
    setSupabasePayment({ status: 'pending' });
  };

  // Cargar documentos desde Supabase (tabla documents + shared_files globales)
  useEffect(() => {
    const query = supabase
      .from('documents')
      .select('*')
      .eq('property_id', String(rental.propertyId))
      .order('created_at', { ascending: false });
    if (rental.roomId) query.eq('room_id', String(rental.roomId));
    query.then(({ data }) => { if (data) setDocs(data); });

    // También cargar archivos compartidos globalmente desde shared_files
    supabase
      .from('shared_files')
      .select('*')
      .eq('landlord_email', rental.landlordEmail)
      .eq('shared_with_tenant', true)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const mapped = data.map(sf => ({
            id: sf.id,
            name: sf.file_name || sf.storage_path.split('/').pop(),
            file_name: sf.file_name,
            file_type: sf.file_type,
            file_size: sf.file_size,
            storage_path: sf.storage_path,
            uploaded_by: 'landlord',
            shared_with_tenant: true,
            _from_shared_files: true,
          }));
          setDocs(prev => {
            const existing = new Set(prev.map(d => d.storage_path));
            return [...prev, ...mapped.filter(m => !existing.has(m.storage_path))];
          });
        }
      });
  }, [rental.propertyId, rental.roomId, rental.landlordEmail]);

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

  const handleAddDoc = async ({ name, file, shareWithLandlord }) => {
    const storagePath = file
      ? `${rental.propertyId}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`
      : null;

    if (file && storagePath) {
      const { error: uploadError } = await supabase.storage.from('documents').upload(storagePath, file);
      if (uploadError) { alert('Error subiendo el archivo.'); return; }
    }

    const { data: newDoc, error: dbError } = await supabase
      .from('documents')
      .insert({
        property_id: String(rental.propertyId),
        room_id: rental.roomId ? String(rental.roomId) : null,
        landlord_email: rental.landlordEmail,
        name,
        file_name: file?.name || null,
        file_type: file?.type || null,
        file_size: file?.size || null,
        storage_path: storagePath || '',
        uploaded_by: 'tenant',
        tenant_id: String(rental.tenantId),
        shared_by_tenant: shareWithLandlord,
        shared_with_tenant: false,
      })
      .select()
      .single();

    if (dbError) {
      console.error('[InquilinoDetail] insert error:', dbError);
      alert(`Error guardando el documento: ${dbError.message}`);
      return;
    }
    setDocs(prev => [...prev, newDoc]);
    setShowAddDoc(false);
  };

  const handleDownloadDoc = (doc) => {
    const url = getPublicUrl(doc.storage_path, doc._from_shared_files);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.file_name || doc.name;
    a.target = '_blank';
    a.click();
  };

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
            {isPaid && <span className="payment-badge paid">Pago confirmado por el propietario</span>}
            {isSent && <span className="payment-badge sent">Pago enviado — esperando confirmación</span>}
            {canConfirm && (
              <span className="payment-badge pending">
                Pago pendiente (días {rental.paymentConfig.startDay}–{rental.paymentConfig.endDay})
              </span>
            )}
          </div>
        </div>

        {/* Confirmar pago */}
        <button
          className={`inquilino-action-btn primary${!canConfirm ? ' disabled' : ''}`}
          onClick={handleConfirmPayment}
          disabled={!canConfirm}
        >
          {isPaid ? '✓ Pago confirmado' : isSent ? 'Pago enviado al propietario' : 'Confirmar pago'}
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
                  <span className={`history-status ${p.status === 'confirmed' ? 'paid' : 'sent'}`}>
                    {p.status === 'confirmed' ? 'Confirmado' : 'Enviado'}
                  </span>
                  <span className="history-amount">{p.amount ?? rental.rent} €</span>
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
        <div className="inquilino-docs-card" onClick={() => setShowDocs(!showDocs)} style={{ cursor: 'pointer' }}>
          <span className="docs-label">Documentos</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {(landlordDocs.length + myDocs.length) > 0 && (
              <span className="docs-count">{landlordDocs.length + myDocs.length}</span>
            )}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <polyline points={showDocs ? '18 15 12 9 6 15' : '6 9 12 15 18 9'} stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>

        {showDocs && (
          <div className="inquilino-docs-section">
            {/* Del propietario */}
            {landlordDocs.length > 0 && (
              <>
                <p className="docs-section-label">Del propietario</p>
                {landlordDocs.map(doc => (
                  <div key={doc.id} className="inquilino-doc-row" onClick={() => handleDownloadDoc(doc)}>
                    <FileIcon fileType={doc.file_type} size={20} />
                    <div className="doc-info">
                      <p className="doc-name">{doc.name}</p>
                      {doc.file_size && <p className="doc-meta">{formatFileSize(doc.file_size)}</p>}
                    </div>
                    {doc.file_name && (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#aaa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <polyline points="7 10 12 15 17 10" stroke="#aaa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <line x1="12" y1="15" x2="12" y2="3" stroke="#aaa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                ))}
              </>
            )}

            {/* Mis documentos */}
            <p className="docs-section-label">Mis documentos</p>
            {myDocs.length === 0 && (
              <p className="docs-empty">No has subido ningún documento todavía.</p>
            )}
            {myDocs.map(doc => (
              <div key={doc.id} className="inquilino-doc-row" onClick={() => handleDownloadDoc(doc)}>
                <FileIcon fileType={doc.file_type} size={20} />
                <div className="doc-info">
                  <p className="doc-name">{doc.name}</p>
                  {doc.file_size && <p className="doc-meta">{formatFileSize(doc.file_size)}</p>}
                </div>
                {doc.shared_by_tenant && <span className="doc-shared-badge">Compartido</span>}
              </div>
            ))}

            <button className="inquilino-add-doc-btn" onClick={() => setShowAddDoc(true)}>
              + Añadir documento
            </button>

            {landlordDocs.length === 0 && myDocs.length === 0 && (
              <p className="docs-empty" style={{ textAlign: 'center', color: '#bbb' }}>
                El propietario aún no ha compartido ningún documento contigo.
              </p>
            )}
          </div>
        )}
      </div>

      {showAddDoc && <AddDocModal onClose={() => setShowAddDoc(false)} onAdd={handleAddDoc} />}
    </div>
  );
}

function AddDocModal({ onClose, onAdd }) {
  const [name, setName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    if (!name) setName(file.name.replace(/\.[^/.]+$/, ''));
  };

  const handleAdd = async (shareWithLandlord) => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await onAdd({ name, file: selectedFile || null, shareWithLandlord });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Añadir documento</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div>
          <div className="form-group">
            <label>Archivo</label>
            <div className="file-upload-area" onClick={() => fileRef.current.click()}>
              {selectedFile ? (
                <div className="file-selected">
                  <span>{selectedFile.name}</span>
                  <button type="button" className="file-remove" onClick={e => { e.stopPropagation(); setSelectedFile(null); }}>×</button>
                </div>
              ) : (
                <div className="file-upload-placeholder">
                  <p>Toca para seleccionar un archivo</p>
                  <span>PDF, imagen, Word, Excel...</span>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="*/*" style={{ display: 'none' }} onChange={handleFile} />
          </div>
          <div className="form-group">
            <label>Nombre</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Nómina enero" required />
          </div>
          <button
            type="button"
            className="submit-button"
            style={{ marginBottom: 8 }}
            disabled={loading || !name.trim()}
            onClick={() => handleAdd(false)}
          >
            {loading ? 'Guardando...' : 'Añadir solo'}
          </button>
          <button
            type="button"
            className="submit-button"
            disabled={loading || !name.trim()}
            onClick={() => handleAdd(true)}
          >
            {loading ? 'Guardando...' : 'Añadir y compartir con propietario'}
          </button>
        </div>
      </div>
    </div>
  );
}
