import React, { useState, useRef } from 'react';
import './PropertyDocuments.css';
import { saveFile, getFile, deleteFile } from '../utils/fileStorage';

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

function loadDocuments(landlordEmail, property, room) {
  // Always read fresh from localStorage so tenant-uploaded docs are visible
  const storedProperties = JSON.parse(localStorage.getItem(`properties_${landlordEmail}`) || '[]');
  const freshProperty = storedProperties.find(p => p.id === property.id) || property;
  if (room) {
    const freshRoom = (freshProperty.rooms || []).find(r => r.id === room.id) || room;
    return freshRoom.documents || [];
  }
  const propertyDocs = freshProperty.documents || [];
  const roomDocs = (freshProperty.rooms || []).flatMap(r =>
    (r.documents || []).map(d => ({ ...d, roomName: r.name }))
  );
  return [...propertyDocs, ...roomDocs];
}

function PropertyDocuments({ property, room, landlordEmail, onBack, onUpdate }) {
  const [documents, setDocuments] = useState(() => loadDocuments(landlordEmail, property, room));
  const [showAddDocument, setShowAddDocument] = useState(false);

  const handleAddDocument = async (newDocument) => {
    const id = Date.now();
    const { dataUrl, ...docMeta } = newDocument;
    const newDoc = { ...docMeta, id };

    // Save metadata to localStorage FIRST (synchronous, always works)
    let updatedDocs, updatedForOnUpdate;
    if (room) {
      const currentRoomDocs = loadDocuments(landlordEmail, property, room);
      updatedDocs = [...currentRoomDocs, newDoc];
      const updatedRoom = { ...room, documents: updatedDocs };
      const updatedRooms = (property.rooms || []).map(r => r.id === room.id ? updatedRoom : r);
      const updatedPropertyDocs = [...(property.documents || []), { ...newDoc, roomName: room.name }];
      setDocuments(updatedDocs);
      updatedForOnUpdate = { ...property, rooms: updatedRooms, documents: updatedPropertyDocs };
    } else {
      const storedProperties = JSON.parse(localStorage.getItem(`properties_${landlordEmail}`) || '[]');
      const freshProperty = storedProperties.find(p => p.id === property.id) || property;
      const currentPropertyDocs = freshProperty.documents || [];
      updatedDocs = [...currentPropertyDocs, newDoc];
      const allRoomDocs = (freshProperty.rooms || []).flatMap(r =>
        (r.documents || []).map(d => ({ ...d, roomName: r.name }))
      );
      setDocuments([...updatedDocs, ...allRoomDocs]);
      updatedForOnUpdate = { ...property, documents: updatedDocs };
    }
    onUpdate(updatedForOnUpdate);
    setShowAddDocument(false);

    // Save file to IndexedDB after (async, best-effort)
    if (dataUrl) {
      try { await saveFile(id, dataUrl); } catch (err) { console.error('Error guardando archivo:', err); }
    }
  };

  const handleShareDocument = (docId) => {
    const isShared = documents.find(d => d.id === docId)?.sharedWithTenant;
    if (room) {
      const updatedRoomDocs = (room.documents || []).map(d =>
        d.id === docId ? { ...d, sharedWithTenant: !isShared } : d
      );
      const updatedRoom = { ...room, documents: updatedRoomDocs };
      const updatedRooms = (property.rooms || []).map(r => r.id === room.id ? updatedRoom : r);
      const updatedPropertyDocs = (property.documents || []).map(d =>
        d.id === docId ? { ...d, sharedWithTenant: !isShared } : d
      );
      setDocuments(updatedRoomDocs);
      onUpdate({ ...property, rooms: updatedRooms, documents: updatedPropertyDocs });
    } else {
      const updatedDocs = (property.documents || []).map(d =>
        d.id === docId ? { ...d, sharedWithTenant: !isShared } : d
      );
      onUpdate({ ...property, documents: updatedDocs });
      setDocuments([
        ...updatedDocs,
        ...(property.rooms || []).flatMap(r => (r.documents || []).map(d => ({ ...d, roomName: r.name })))
      ]);
    }
  };

  const handleDeleteDocument = (documentId) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar este documento?')) {
      if (room) {
        const updatedRoomDocs = (room.documents || []).filter(doc => doc.id !== documentId);
        const updatedRoom = { ...room, documents: updatedRoomDocs };
        const updatedRooms = (property.rooms || []).map(r => r.id === room.id ? updatedRoom : r);
        const updatedPropertyDocs = (property.documents || []).filter(doc => doc.id !== documentId);
        setDocuments(updatedRoomDocs);
        onUpdate({ ...property, rooms: updatedRooms, documents: updatedPropertyDocs });
      } else {
        const updatedDocs = (property.documents || []).filter(doc => doc.id !== documentId);
        setDocuments([...updatedDocs, ...(property.rooms || []).flatMap(r => (r.documents || []).map(d => ({ ...d, roomName: r.name })))]);
        onUpdate({ ...property, documents: updatedDocs });
      }
      deleteFile(documentId);
    }
  };

  const handleOpenDocument = async (doc) => {
    const dataUrl = await getFile(doc.id);
    if (dataUrl) {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = doc.fileName || doc.name;
      a.click();
    }
  };

  const landlordDocs = documents.filter(d => !d.uploadedByTenant && !d.sharedByTenant);
  const tenantDocs = documents.filter(d => d.sharedByTenant);

  return (
    <div className="documents-container">
      <div className="documents-header">
        <button className="back-button" onClick={onBack}>←</button>
        <h1 className="documents-title">{room ? `Docs - ${room.name}` : 'Documentos'}</h1>
        <button className="add-document-button" onClick={() => setShowAddDocument(true)}>+</button>
      </div>

      <div className="documents-list">
        {/* Docs del propietario */}
        {landlordDocs.length === 0 ? (
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
        ) : (
          landlordDocs.map(document => (
            <div key={document.id} className="document-card" onClick={() => handleOpenDocument(document)}>
              <div className="document-icon-wrapper">
                <FileIcon fileType={document.fileType} size={22} />
              </div>
              <div className="document-info">
                <h3 className="document-name">{document.name}</h3>
                {document.description && <p className="document-description">{document.description}</p>}
                <div className="document-meta">
                  {document.fileName && <span className="document-filename">{document.fileName}</span>}
                  {document.fileSize && <span className="document-size">{formatFileSize(document.fileSize)}</span>}
                </div>
                {document.roomName && <span className="document-room-tag">{document.roomName}</span>}
              </div>
              <div className="document-actions" onClick={e => e.stopPropagation()}>
                <button
                  className={`share-document-btn ${document.sharedWithTenant ? 'shared' : ''}`}
                  onClick={() => handleShareDocument(document.id)}
                  title={document.sharedWithTenant ? 'Dejar de compartir con inquilino' : 'Compartir con inquilino'}
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
          ))
        )}

        {/* Docs compartidos por el inquilino */}
        {tenantDocs.length > 0 && (
          <>
            <p className="docs-section-label">Documentos del inquilino</p>
            {tenantDocs.map(document => (
              <div key={document.id} className="document-card tenant-doc" onClick={() => handleOpenDocument(document)}>
                <div className="document-icon-wrapper">
                  <FileIcon fileType={document.fileType} size={22} />
                </div>
                <div className="document-info">
                  <h3 className="document-name">{document.name}</h3>
                  {document.description && <p className="document-description">{document.description}</p>}
                  <div className="document-meta">
                    {document.fileName && <span className="document-filename">{document.fileName}</span>}
                    {document.fileSize && <span className="document-size">{formatFileSize(document.fileSize)}</span>}
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
    setLoading(true);
    try {
      if (selectedFile) {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(selectedFile);
        });
        onAdd({ name, description, fileName: selectedFile.name, fileType: selectedFile.type, fileSize: selectedFile.size, dataUrl });
      } else {
        onAdd({ name, description });
      }
    } catch (err) {
      console.error('Error leyendo archivo:', err);
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
          <button type="submit" className="submit-button" disabled={loading}>
            {loading ? 'Guardando...' : 'Añadir documento'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default PropertyDocuments;
