import React, { useState, useEffect, useRef } from 'react';
import './PropertyDocuments.css';
import { supabase } from '../supabaseClient';

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

function getPublicUrl(storagePath) {
  if (!storagePath) return null;
  return supabase.storage.from('documents').getPublicUrl(storagePath).data.publicUrl;
}

function PropertyDocuments({ property, room, landlordEmail, onBack, onUpdate }) {
  const [documents, setDocuments] = useState([]);
  const [showAddDocument, setShowAddDocument] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const query = supabase
      .from('documents')
      .select('*')
      .eq('property_id', String(property.id))
      .order('created_at', { ascending: false });
    if (room) {
      query.eq('room_id', String(room.id));
    }
    query.then(({ data }) => {
      setDocuments(data || []);
      setLoading(false);
    });
  }, [property.id, room?.id]);

  const handleAddDocument = async ({ name, description, file }) => {
    const storagePath = file
      ? `${property.id}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`
      : null;

    if (file && storagePath) {
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, file);
      if (uploadError) {
        alert('Error subiendo el archivo. Inténtalo de nuevo.');
        return;
      }
    }

    const { data: newDoc, error: dbError } = await supabase
      .from('documents')
      .insert({
        property_id: String(property.id),
        room_id: room ? String(room.id) : null,
        landlord_email: landlordEmail,
        name,
        description: description || null,
        file_name: file?.name || null,
        file_type: file?.type || null,
        file_size: file?.size || null,
        storage_path: storagePath || '',
        uploaded_by: 'landlord',
        shared_with_tenant: false,
      })
      .select()
      .single();

    if (dbError) {
      alert('Error guardando el documento.');
      return;
    }

    setDocuments(prev => [newDoc, ...prev]);
    setShowAddDocument(false);
  };

  const handleShareDocument = async (docId) => {
    const doc = documents.find(d => d.id === docId);
    const newValue = !doc.shared_with_tenant;
    await supabase.from('documents').update({ shared_with_tenant: newValue }).eq('id', docId);
    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, shared_with_tenant: newValue } : d));
  };

  const handleDeleteDocument = async (docId) => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar este documento?')) return;
    const doc = documents.find(d => d.id === docId);
    if (doc.storage_path) {
      await supabase.storage.from('documents').remove([doc.storage_path]);
    }
    await supabase.from('documents').delete().eq('id', docId);
    setDocuments(prev => prev.filter(d => d.id !== docId));
  };

  const handleOpenDocument = (doc) => {
    const url = getPublicUrl(doc.storage_path);
    if (url) window.open(url, '_blank');
  };

  const landlordDocs = documents.filter(d => d.uploaded_by === 'landlord');
  const tenantDocs = documents.filter(d => d.uploaded_by === 'tenant');

  return (
    <div className="documents-container">
      <div className="documents-header">
        <button className="back-button" onClick={onBack}>←</button>
        <h1 className="documents-title">{room ? `Docs - ${room.name}` : 'Documentos'}</h1>
        <button className="add-document-button" onClick={() => setShowAddDocument(true)}>+</button>
      </div>

      <div className="documents-list">
        {loading && <p style={{ textAlign: 'center', color: '#aaa', padding: 24 }}>Cargando…</p>}

        {/* Docs del propietario */}
        {!loading && landlordDocs.length === 0 && tenantDocs.length === 0 && (
          <div className="empty-documents">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <p>No hay documentos añadidos</p>
            <button className="add-first-document" onClick={() => setShowAddDocument(true)}>
              Añadir primer documento
            </button>
          </div>
        )}

        {!loading && landlordDocs.map(document => (
          <div key={document.id} className="document-card" onClick={() => handleOpenDocument(document)}>
            <div className="document-icon-wrapper">
              <FileIcon fileType={document.file_type} size={22} />
            </div>
            <div className="document-info">
              <h3 className="document-name">{document.name}</h3>
              {document.description && <p className="document-description">{document.description}</p>}
              <div className="document-meta">
                {document.file_name && <span className="document-filename">{document.file_name}</span>}
                {document.file_size && <span className="document-size">{formatFileSize(document.file_size)}</span>}
              </div>
            </div>
            <div className="document-actions" onClick={e => e.stopPropagation()}>
              <button
                className={`share-document-btn ${document.shared_with_tenant ? 'shared' : ''}`}
                onClick={() => handleShareDocument(document.id)}
                title={document.shared_with_tenant ? 'Dejar de compartir con inquilino' : 'Compartir con inquilino'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="2"/>
                  <circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
                  <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="2"/>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" stroke="currentColor" strokeWidth="2"/>
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" stroke="currentColor" strokeWidth="2"/>
                </svg>
              </button>
              <button className="delete-document" onClick={() => handleDeleteDocument(document.id)}>×</button>
            </div>
          </div>
        ))}

        {/* Docs compartidos por el inquilino */}
        {!loading && tenantDocs.length > 0 && (
          <>
            <p className="docs-section-label">Documentos del inquilino</p>
            {tenantDocs.map(document => (
              <div key={document.id} className="document-card tenant-doc" onClick={() => handleOpenDocument(document)}>
                <div className="document-icon-wrapper">
                  <FileIcon fileType={document.file_type} size={22} />
                </div>
                <div className="document-info">
                  <h3 className="document-name">{document.name}</h3>
                  {document.description && <p className="document-description">{document.description}</p>}
                  <div className="document-meta">
                    {document.file_name && <span className="document-filename">{document.file_name}</span>}
                    {document.file_size && <span className="document-size">{formatFileSize(document.file_size)}</span>}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {showAddDocument && (
        <AddDocumentModal onClose={() => setShowAddDocument(false)} onAdd={handleAddDocument} />
      )}
    </div>
  );
}

function AddDocumentModal({ onClose, onAdd }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    if (!name) setName(file.name.replace(/\.[^/.]+$/, ''));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      await onAdd({ name, description, file: selectedFile || null });
    } catch (err) {
      console.error('Error añadiendo documento:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Añadir documento</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Archivo (opcional)</label>
            <div className="file-upload-area" onClick={() => fileInputRef.current.click()}>
              {selectedFile ? (
                <div className="file-selected">
                  <FileIcon fileType={selectedFile.type} size={24} />
                  <div>
                    <p className="file-selected-name">{selectedFile.name}</p>
                    <p className="file-selected-size">{formatFileSize(selectedFile.size)}</p>
                  </div>
                  <button type="button" className="file-remove" onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}>×</button>
                </div>
              ) : (
                <div className="file-upload-placeholder">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="17 8 12 3 7 8" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <line x1="12" y1="3" x2="12" y2="15" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <p>Toca para seleccionar un archivo</p>
                  <span>PDF, imagen, Word, Excel...</span>
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="*/*" style={{ display: 'none' }} onChange={handleFileChange} />
          </div>
          <div className="form-group">
            <label>Nombre del documento</label>
            <input type="text" placeholder="Ej: Contrato de alquiler, Seguro del hogar..." value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Descripción (opcional)</label>
            <textarea placeholder="Ej: Renovado el 15/01/2024" value={description} onChange={(e) => setDescription(e.target.value)} rows="3" />
          </div>
          <button type="submit" className="submit-button" disabled={loading || !name.trim()}>
            {loading ? 'Subiendo...' : 'Añadir documento'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default PropertyDocuments;
