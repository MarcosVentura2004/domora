import { useState, useEffect, useRef } from 'react';
import './InquilinoDetail.css';
import { saveFile, getFile } from '../utils/fileStorage';
import ChatConversation from './ChatConversation';
import { supabase } from '../supabaseClient';

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function getProperty(rental) {
  const properties = JSON.parse(localStorage.getItem(`properties_${rental.landlordEmail}`) || '[]');
  return properties.find(p => p.id === rental.propertyId) || null;
}


function getDocs(rental) {
  const property = getProperty(rental);
  if (!property) return [];
  if (rental.roomId) {
    return (property.rooms || []).find(r => r.id === rental.roomId)?.documents || [];
  }
  return property.documents || [];
}

function saveDocs(rental, updatedDocs) {
  const { landlordEmail, propertyId, roomId } = rental;
  const properties = JSON.parse(localStorage.getItem(`properties_${landlordEmail}`) || '[]');
  const idx = properties.findIndex(p => p.id === propertyId);
  if (idx === -1) return;

  if (roomId) {
    const room = (properties[idx].rooms || []).find(r => r.id === roomId);
    const roomName = room?.name || '';
    properties[idx].rooms = (properties[idx].rooms || []).map(r =>
      r.id === roomId ? { ...r, documents: updatedDocs } : r
    );
    // Sync shared tenant docs to property-level (both old sharedByTenant and new uploadedByTenant)
    const sharedTenantDocs = updatedDocs
      .filter(d => d.sharedByTenant)
      .map(d => ({ ...d, roomName }));
    properties[idx].documents = [
      ...(properties[idx].documents || []).filter(d => !d.uploadedByTenant && !d.sharedByTenant),
      ...sharedTenantDocs,
    ];
  } else {
    // Keep landlord docs, replace all tenant docs with updated ones
    const landlordDocs = (properties[idx].documents || []).filter(d => !d.uploadedByTenant && !d.sharedByTenant);
    const tenantDocs = updatedDocs.filter(d => d.uploadedByTenant || d.sharedByTenant);
    properties[idx].documents = [...landlordDocs, ...tenantDocs];
  }
  localStorage.setItem(`properties_${landlordEmail}`, JSON.stringify(properties));
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
  const [showChat, setShowChat] = useState(false);
  const incidentFileRef = useRef(null);
  const [showDocs, setShowDocs] = useState(false);
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [, setDocsVersion] = useState(0);
  const [supabasePayment, setSupabasePayment] = useState(null);
  const [paymentHistory, setPaymentHistory] = useState([]);

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
        .then(({ data }) => setSupabasePayment(data ?? null));
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

  const allDocs = getDocs(rental);
  const landlordDocs = allDocs.filter(d => d.sharedWithTenant && !d.sharedByTenant && !d.uploadedByTenant);
  const myDocs = allDocs.filter(d => d.uploadedByTenant || d.sharedByTenant);

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

  const handleSendIncident = async () => {
    if (!incidentText.trim() && !incidentFile) return;
    const { landlordEmail, propertyId, tenantId, roomId, tenantName, address } = rental;
    const properties = JSON.parse(localStorage.getItem(`properties_${landlordEmail}`) || '[]');
    const idx = properties.findIndex(p => p.id === propertyId);
    if (idx !== -1) {
      let attachment = null;
      if (incidentFile) {
        const { dataUrl, ...meta } = incidentFile;
        try { await saveFile(meta.id, dataUrl); } catch (e) { console.error(e); }
        attachment = meta;
      }
      const incident = {
        id: Date.now(),
        tenantName,
        tenantId,
        roomId: roomId || null,
        description: incidentText.trim(),
        propertyName: address,
        timestamp: new Date().toISOString(),
        status: 'open',
        ...(attachment && { attachment }),
      };
      properties[idx].incidents = [...(properties[idx].incidents || []), incident];
      localStorage.setItem(`properties_${landlordEmail}`, JSON.stringify(properties));
    }
    setIncidentText('');
    setIncidentFile(null);
    setShowIncident(false);
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

  const handleAddDoc = async (newDoc, shareWithLandlord) => {
    const id = Date.now();
    const { dataUrl, ...docMeta } = newDoc;

    // Save metadata to localStorage first (synchronous — always persists)
    const current = getDocs(rental);
    const updated = [...current, { ...docMeta, id, uploadedByTenant: true, sharedByTenant: shareWithLandlord }];
    saveDocs(rental, updated);
    setDocsVersion(v => v + 1);
    setShowAddDoc(false);

    // Save file to IndexedDB after (async, best-effort)
    if (dataUrl) {
      try { await saveFile(id, dataUrl); } catch (err) { console.error('Error guardando archivo:', err); }
    }
  };

  const handleDownloadDoc = async (doc) => {
    const dataUrl = await getFile(doc.id);
    if (dataUrl) {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = doc.fileName || doc.name;
      a.click();
    }
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
              disabled={!incidentText.trim() && !incidentFile}
            >
              Enviar incidencia
            </button>
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
                    <FileIcon fileType={doc.fileType} size={20} />
                    <div className="doc-info">
                      <p className="doc-name">{doc.name}</p>
                      {doc.fileSize && <p className="doc-meta">{formatFileSize(doc.fileSize)}</p>}
                    </div>
                    {doc.fileName && (
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
                <FileIcon fileType={doc.fileType} size={20} />
                <div className="doc-info">
                  <p className="doc-name">{doc.name}</p>
                  {doc.fileSize && <p className="doc-meta">{formatFileSize(doc.fileSize)}</p>}
                </div>
                {doc.sharedByTenant && <span className="doc-shared-badge">Compartido</span>}
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

      {showAddDoc && <AddDocModal onClose={() => setShowAddDoc(false)} onAdd={(doc, share) => handleAddDoc(doc, share)} />}
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

  const buildDoc = async () => {
    if (selectedFile) {
      const dataUrl = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result);
        reader.onerror = rej;
        reader.readAsDataURL(selectedFile);
      });
      return { name, fileName: selectedFile.name, fileType: selectedFile.type, fileSize: selectedFile.size, dataUrl };
    }
    return { name };
  };

  const handleAdd = async (share) => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const doc = await buildDoc();
      onAdd(doc, share);
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
