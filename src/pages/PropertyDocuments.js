import React, { useState, useEffect, useRef, useCallback } from 'react';
import './PropertyDocuments.css';
import { supabase } from '../supabaseClient';

// ─── SVG icons ────────────────────────────────────────────────────────────────

function FolderIcon({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
        fill="#FFF3E0"
        stroke="#F5A623"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FileIcon({ mimeType, size = 36 }) {
  if (mimeType?.includes('pdf')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
          fill="#FFEBEE" stroke="#e74c3c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M14 2v6h6" stroke="#e74c3c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <text x="6" y="19" fontSize="5.5" fill="#e74c3c" fontWeight="bold">PDF</text>
      </svg>
    );
  }
  if (mimeType?.includes('image')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="2" fill="#E8F5E9" stroke="#27ae60" strokeWidth="1.5"/>
        <circle cx="8.5" cy="8.5" r="1.5" stroke="#27ae60" strokeWidth="1.5"/>
        <polyline points="21 15 16 10 5 21" stroke="#27ae60" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  }
  if (mimeType?.includes('word') || mimeType?.includes('document') || mimeType?.includes('msword')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
          fill="#E3F2FD" stroke="#2980b9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M14 2v6h6" stroke="#2980b9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <line x1="8" y1="13" x2="16" y2="13" stroke="#2980b9" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="8" y1="17" x2="16" y2="17" stroke="#2980b9" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );
  }
  if (mimeType?.includes('sheet') || mimeType?.includes('excel') || mimeType?.includes('csv')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
          fill="#E8F5E9" stroke="#16a085" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M14 2v6h6" stroke="#16a085" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <line x1="8" y1="13" x2="16" y2="13" stroke="#16a085" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="8" y1="17" x2="12" y2="17" stroke="#16a085" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        fill="#F5F5F5" stroke="#888" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 2v6h6" stroke="#888" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getDirectChildren(allFolders, currentPath) {
  return allFolders.filter(f => {
    if (!currentPath) return !f.path.includes('/');
    const prefix = currentPath + '/';
    if (!f.path.startsWith(prefix)) return false;
    return !f.path.slice(prefix.length).includes('/');
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────

function PropertyDocuments({ landlordEmail, onBack }) {
  const [currentPath, setCurrentPath] = useState(''); // relative to landlordEmail/
  const [allFolders, setAllFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const menuRef = useRef(null);

  const storagePath = currentPath
    ? `${landlordEmail}/${currentPath}`
    : landlordEmail;

  const loadContents = useCallback(async () => {
    setLoading(true);
    try {
      // Load all folders for this landlord
      const { data: foldersData } = await supabase
        .from('folders')
        .select('*')
        .eq('landlord_email', landlordEmail)
        .order('name', { ascending: true });
      setAllFolders(foldersData || []);

      // List files from storage at current path
      const { data: storageItems, error } = await supabase.storage
        .from('documentos')
        .list(storagePath, { limit: 200, sortBy: { column: 'name', order: 'asc' } });

      if (error) {
        setFiles([]);
      } else {
        // Files have a non-null id; virtual folder entries have id === null
        const realFiles = (storageItems || []).filter(item => item.id !== null);
        setFiles(realFiles);
      }
    } catch (err) {
      console.error('[PropertyDocuments] loadContents error:', err);
    }
    setLoading(false);
  }, [landlordEmail, storagePath]);

  useEffect(() => {
    loadContents();
  }, [loadContents]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return;
    const handler = e => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  // ── Navigation ───────────────────────────────────────────────────────────────

  const breadcrumbs = ['Inicio', ...currentPath.split('/').filter(Boolean)];

  const navigateToBreadcrumb = idx => {
    if (idx === 0) {
      setCurrentPath('');
    } else {
      const parts = currentPath.split('/').filter(Boolean);
      setCurrentPath(parts.slice(0, idx).join('/'));
    }
  };

  const handleFolderClick = folder => setCurrentPath(folder.path);

  const handleFileClick = file => {
    const filePath = `${storagePath}/${file.name}`;
    const { data } = supabase.storage.from('documentos').getPublicUrl(filePath);
    if (data?.publicUrl) window.open(data.publicUrl, '_blank');
  };

  // ── Mutations ────────────────────────────────────────────────────────────────

  const handleCreateFolder = async name => {
    const newPath = currentPath ? `${currentPath}/${name}` : name;
    const { error } = await supabase.from('folders').insert({
      landlord_email: landlordEmail,
      path: newPath,
      name,
    });
    if (error) {
      alert(`Error creando carpeta: ${error.message}`);
      return;
    }
    await loadContents();
    setShowNewFolderModal(false);
  };

  const handleUploadFile = async file => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uploadPath = `${storagePath}/${Date.now()}_${safeName}`;
    const { error } = await supabase.storage
      .from('documentos')
      .upload(uploadPath, file, { upsert: false });
    if (error) {
      if (
        error.message?.includes('Bucket not found') ||
        error.statusCode === 404 ||
        error.error === 'Bucket not found'
      ) {
        alert(
          'El bucket "documentos" no existe en Supabase Storage.\n\n' +
          'Cómo crearlo:\n' +
          '1. Ve al dashboard de Supabase\n' +
          '2. Storage → New Bucket\n' +
          '3. Nombre: "documentos"\n' +
          '4. Activa "Public bucket"\n' +
          '5. Haz clic en "Create bucket"'
        );
      } else {
        alert(`Error subiendo archivo: ${error.message}`);
      }
      return;
    }
    await loadContents();
    setShowUploadModal(false);
  };

  const handleDeleteFile = async (file, e) => {
    e.stopPropagation();
    if (!window.confirm(`¿Eliminar "${file.name}"?`)) return;
    await supabase.storage.from('documentos').remove([`${storagePath}/${file.name}`]);
    await loadContents();
  };

  const handleDeleteFolder = async (folder, e) => {
    e.stopPropagation();
    if (!window.confirm(`¿Eliminar la carpeta "${folder.name}" y todo su contenido?`)) return;
    const fullPath = `${landlordEmail}/${folder.path}`;
    const { data: items } = await supabase.storage
      .from('documentos')
      .list(fullPath, { limit: 1000 });
    if (items?.length > 0) {
      await supabase.storage
        .from('documentos')
        .remove(items.map(i => `${fullPath}/${i.name}`));
    }
    // Delete this folder and all sub-folders from DB
    await supabase
      .from('folders')
      .delete()
      .eq('landlord_email', landlordEmail)
      .or(`path.eq.${folder.path},path.like.${folder.path}/%`);
    await loadContents();
  };

  const handleShareFile = async (file, e) => {
    e.stopPropagation();
    const { data } = supabase.storage
      .from('documentos')
      .getPublicUrl(`${storagePath}/${file.name}`);
    if (data?.publicUrl) {
      try {
        await navigator.clipboard.writeText(data.publicUrl);
        alert('Enlace copiado al portapapeles');
      } catch {
        prompt('Copia el enlace:', data.publicUrl);
      }
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  const visibleFolders = getDirectChildren(allFolders, currentPath);

  return (
    <div className="finder-container">
      {/* Header */}
      <div className="finder-header">
        <button className="finder-back-btn" onClick={onBack} aria-label="Volver">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 5l-7 7 7 7"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h1 className="finder-title">Documentos</h1>
        <div className="finder-add-wrapper" ref={menuRef}>
          <button className="finder-add-btn" onClick={() => setShowMenu(v => !v)} aria-label="Añadir">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </button>
          {showMenu && (
            <div className="finder-add-menu">
              <button onClick={() => { setShowMenu(false); setShowNewFolderModal(true); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                    stroke="#F5A623" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="12" y1="11" x2="12" y2="17" stroke="#F5A623" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="9" y1="14" x2="15" y2="14" stroke="#F5A623" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                Nueva carpeta
              </button>
              <button onClick={() => { setShowMenu(false); setShowUploadModal(true); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
                    stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <polyline points="17 8 12 3 7 8" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="12" y1="3" x2="12" y2="15" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Subir archivo
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="finder-breadcrumb">
        {breadcrumbs.map((crumb, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="breadcrumb-chevron">
                <polyline points="9 18 15 12 9 6" stroke="#bbb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            <button
              className={`breadcrumb-item${idx === breadcrumbs.length - 1 ? ' active' : ''}`}
              onClick={() => navigateToBreadcrumb(idx)}
            >
              {crumb}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* Content */}
      <div className="finder-content">
        {loading ? (
          <div className="finder-loading">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="finder-spinner">
              <circle cx="12" cy="12" r="10" stroke="#eee" strokeWidth="3"/>
              <path d="M12 2a10 10 0 0 1 10 10" stroke="#333" strokeWidth="3" strokeLinecap="round"/>
            </svg>
          </div>
        ) : visibleFolders.length === 0 && files.length === 0 ? (
          <div className="finder-empty">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                fill="#F5F5F5" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <p>Esta carpeta está vacía</p>
            <button className="finder-empty-cta" onClick={() => setShowMenu(true)}>
              Añadir contenido
            </button>
          </div>
        ) : (
          <div className="finder-list">
            {/* Carpetas */}
            {visibleFolders.map(folder => (
              <div
                key={folder.id}
                className="finder-item finder-folder"
                onClick={() => handleFolderClick(folder)}
              >
                <div className="finder-item-icon">
                  <FolderIcon size={36} />
                </div>
                <div className="finder-item-info">
                  <span className="finder-item-name">{folder.name}</span>
                </div>
                <button
                  className="finder-action-btn finder-action-delete"
                  onClick={e => handleDeleteFolder(folder, e)}
                  title="Eliminar carpeta"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" className="finder-chevron">
                  <polyline points="9 18 15 12 9 6" stroke="#ccc" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            ))}

            {/* Archivos */}
            {files.map(file => (
              <div
                key={file.id || file.name}
                className="finder-item finder-file"
                onClick={() => handleFileClick(file)}
              >
                <div className="finder-item-icon">
                  <FileIcon mimeType={file.metadata?.mimetype} size={36} />
                </div>
                <div className="finder-item-info">
                  <span className="finder-item-name">{file.name}</span>
                  {file.metadata?.size !== undefined && (
                    <span className="finder-item-meta">{formatFileSize(file.metadata.size)}</span>
                  )}
                </div>
                <div className="finder-file-actions" onClick={e => e.stopPropagation()}>
                  <button
                    className="finder-action-btn finder-action-share"
                    onClick={e => handleShareFile(file, e)}
                    title="Copiar enlace"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="2"/>
                      <circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
                      <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="2"/>
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" stroke="currentColor" strokeWidth="2"/>
                      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                  </button>
                  <button
                    className="finder-action-btn finder-action-delete"
                    onClick={e => handleDeleteFile(file, e)}
                    title="Eliminar archivo"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showNewFolderModal && (
        <NewFolderModal
          onClose={() => setShowNewFolderModal(false)}
          onCreate={handleCreateFolder}
        />
      )}
      {showUploadModal && (
        <UploadFileModal
          onClose={() => setShowUploadModal(false)}
          onUpload={handleUploadFile}
        />
      )}
    </div>
  );
}

// ─── New Folder Modal ─────────────────────────────────────────────────────────

function NewFolderModal({ onClose, onCreate }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    await onCreate(name.trim());
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Nueva carpeta</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nombre</label>
            <input
              type="text"
              placeholder="Ej: Contratos, Facturas, Seguros…"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <button type="submit" className="submit-button" disabled={loading || !name.trim()}>
            {loading ? 'Creando…' : 'Crear carpeta'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Upload File Modal ────────────────────────────────────────────────────────

function UploadFileModal({ onClose, onUpload }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    await onUpload(file);
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Subir archivo</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <div className="file-upload-area" onClick={() => fileInputRef.current.click()}>
              {file ? (
                <div className="file-selected">
                  <FileIcon mimeType={file.type} size={28} />
                  <div>
                    <p className="file-selected-name">{file.name}</p>
                    <p className="file-selected-size">{formatFileSize(file.size)}</p>
                  </div>
                  <button
                    type="button"
                    className="file-remove"
                    onClick={e => { e.stopPropagation(); setFile(null); }}
                  >×</button>
                </div>
              ) : (
                <div className="file-upload-placeholder">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
                      stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="17 8 12 3 7 8" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <line x1="12" y1="3" x2="12" y2="15" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <p>Toca para seleccionar un archivo</p>
                  <span>PDF, imagen, Word, Excel…</span>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="*/*"
              style={{ display: 'none' }}
              onChange={e => setFile(e.target.files[0] || null)}
            />
          </div>
          <button type="submit" className="submit-button" disabled={loading || !file}>
            {loading ? 'Subiendo…' : 'Subir archivo'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default PropertyDocuments;
