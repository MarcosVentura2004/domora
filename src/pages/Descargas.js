import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  listDownloads,
  getDownloadBlob,
  getShareLink,
  deleteDownload,
  deleteAllDownloads,
  triggerDeviceDownload,
  extensionOf,
} from '../utils/downloads';
import './Descargas.css';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'pdf', label: 'PDF' },
  { id: 'excel', label: 'Excel' },
  { id: 'image', label: 'Imágenes' },
  { id: 'other', label: 'Otros' },
];

function kindOf(item) {
  const ext = extensionOf(item.file_name);
  const mime = item.mime_type || '';
  if (mime === 'application/pdf') return 'pdf';
  if (['xlsx', 'xls', 'csv'].includes(ext) || mime.includes('spreadsheet') || mime.includes('excel')) return 'excel';
  // Raster formats only: SVG can carry scripts, so it is never previewed.
  if (['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mime)) return 'image';
  if (ext === 'zip') return 'zip';
  if (['doc', 'docx'].includes(ext) || mime.includes('word')) return 'word';
  return 'other';
}

const KIND_STYLE = {
  pdf:   { label: 'PDF', bg: '#fef2f2', color: '#dc2626' },
  excel: { label: 'XLS', bg: '#f0fdf4', color: '#16a34a' },
  image: { label: 'IMG', bg: '#eff6ff', color: '#2563eb' },
  zip:   { label: 'ZIP', bg: '#f5f3ff', color: '#7c3aed' },
  word:  { label: 'DOC', bg: '#eff6ff', color: '#1d4ed8' },
  other: { label: 'FILE', bg: '#f4f4f5', color: '#52525b' },
};

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

function formatDate(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Hoy, ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Ayer, ${time}`;
  const sameYear = d.getFullYear() === today.getFullYear();
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}`;
}

function FileBadge({ kind, large }) {
  const s = KIND_STYLE[kind] || KIND_STYLE.other;
  return (
    <div className={`dl-badge${large ? ' dl-badge--large' : ''}`} style={{ background: s.bg, color: s.color }}>
      <svg width={large ? 30 : 20} height={large ? 30 : 20} viewBox="0 0 24 24" fill="none">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
        <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
      </svg>
      <span className="dl-badge-label">{s.label}</span>
    </div>
  );
}

// ── Preview sheet ─────────────────────────────────────────────────────────────
function PreviewSheet({ item, onClose, onDeleted }) {
  const kind = kindOf(item);
  const canPreview = kind === 'pdf' || kind === 'image';

  const [blob, setBlob] = useState(null);
  const [objectUrl, setObjectUrl] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(''); // share | whatsapp | download | delete
  const [notice, setNotice] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let url = null;
    let cancelled = false;
    getDownloadBlob(item)
      .then(b => {
        if (cancelled) return;
        setBlob(b);
        url = URL.createObjectURL(b);
        setObjectUrl(url);
      })
      .catch(() => { if (!cancelled) setLoadError('No se pudo cargar el archivo.'); });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [item]);

  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const fileForShare = () => new File([blob], item.file_name, { type: blob.type || item.mime_type });
  const canShareFile = () => {
    try {
      return !!blob && typeof navigator.canShare === 'function' && navigator.canShare({ files: [fileForShare()] });
    } catch {
      return false;
    }
  };

  const shareLinkText = url =>
    `Te comparto el documento "${item.file_name}":\n${url}\n\n(Enlace válido durante 7 dias)`;

  // Native share sheet with the actual file (WhatsApp, Archivos, Mail...).
  // Falls back to a temporary link where file sharing isn't supported (most desktops).
  const handleShare = async () => {
    setNotice('');
    if (canShareFile()) {
      try {
        await navigator.share({ files: [fileForShare()], title: item.file_name });
      } catch (err) {
        if (err?.name !== 'AbortError') setNotice('No se pudo compartir el archivo.');
      }
      return;
    }
    setBusy('share');
    try {
      const url = await getShareLink(item);
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: item.file_name, text: shareLinkText(url) }).catch(() => {});
      } else {
        await navigator.clipboard.writeText(url);
        setNotice('Enlace copiado. Es válido durante 7 dias.');
      }
    } catch {
      setNotice('No se pudo crear el enlace para compartir.');
    } finally {
      setBusy('');
    }
  };

  const handleWhatsApp = async () => {
    setNotice('');
    // On phones the share sheet sends the real file and WhatsApp is one tap away.
    if (canShareFile()) {
      try {
        await navigator.share({ files: [fileForShare()], title: item.file_name });
      } catch (err) {
        if (err?.name !== 'AbortError') setNotice('No se pudo compartir el archivo.');
      }
      return;
    }
    // Desktop: WhatsApp can't receive files via URL, send a temporary link instead.
    // Open the window synchronously so popup blockers allow it.
    const win = window.open('', '_blank');
    setBusy('whatsapp');
    try {
      const url = await getShareLink(item);
      const waUrl = `https://wa.me/?text=${encodeURIComponent(shareLinkText(url))}`;
      if (win) { win.opener = null; win.location.href = waUrl; } else { window.location.href = waUrl; }
    } catch {
      if (win) win.close();
      setNotice('No se pudo crear el enlace para WhatsApp.');
    } finally {
      setBusy('');
    }
  };

  const handleDownload = () => {
    if (blob) triggerDeviceDownload(blob, item.file_name);
  };

  const handleOpen = () => {
    if (objectUrl) window.open(objectUrl, '_blank', 'noopener');
  };

  const handleDelete = async () => {
    setBusy('delete');
    try {
      await deleteDownload(item);
      onDeleted(item.id);
    } catch {
      setBusy('');
      setConfirmDelete(false);
      setNotice('No se pudo eliminar. Inténtalo de nuevo.');
    }
  };

  const meta = [item.source, item.property_name, formatSize(item.size_bytes)].filter(Boolean).join(' · ');

  return (
    <div className="dl-overlay" onClick={onClose}>
      <div className="dl-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label={item.file_name}>
        <div className="dl-sheet-header">
          <div className="dl-sheet-title-wrap">
            <p className="dl-sheet-title">{item.file_name}</p>
            {meta && <p className="dl-sheet-meta">{meta}</p>}
          </div>
          <button className="dl-icon-btn" onClick={onClose} aria-label="Cerrar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="dl-preview">
          {loadError ? (
            <p className="dl-preview-msg dl-preview-msg--error">{loadError}</p>
          ) : !objectUrl ? (
            <div className="dl-preview-msg"><span className="dl-spinner" /> Cargando vista previa…</div>
          ) : kind === 'pdf' ? (
            <iframe className="dl-preview-pdf" src={objectUrl} title={item.file_name} />
          ) : kind === 'image' ? (
            <img className="dl-preview-img" src={objectUrl} alt={item.file_name} />
          ) : (
            <div className="dl-preview-none">
              <FileBadge kind={kind} large />
              <p>Vista previa no disponible para este tipo de archivo.</p>
              <span>Descárgalo o compártelo para abrirlo.</span>
            </div>
          )}
          {canPreview && objectUrl && (
            <button className="dl-open-btn" onClick={handleOpen}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M15 3h6v6M10 14L21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Abrir en pantalla completa
            </button>
          )}
        </div>

        {notice && <p className="dl-notice">{notice}</p>}

        {confirmDelete ? (
          <div className="dl-confirm">
            <p>¿Eliminar este archivo de Descargas?</p>
            <div className="dl-confirm-actions">
              <button className="dl-btn dl-btn--secondary" onClick={() => setConfirmDelete(false)} disabled={busy === 'delete'}>
                Cancelar
              </button>
              <button className="dl-btn dl-btn--danger" onClick={handleDelete} disabled={busy === 'delete'}>
                {busy === 'delete' ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        ) : (
          <div className="dl-actions">
            <button className="dl-action" onClick={handleShare} disabled={!blob || !!busy}>
              <span className="dl-action-icon dl-action-icon--dark">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
              {busy === 'share' ? 'Creando…' : 'Compartir'}
            </button>
            <button className="dl-action" onClick={handleWhatsApp} disabled={!blob || !!busy}>
              <span className="dl-action-icon dl-action-icon--wa">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12.05 21.8h-.01a9.86 9.86 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.9-9.88 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.89 9.88zm8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.17-3.48-8.41z"/>
                </svg>
              </span>
              {busy === 'whatsapp' ? 'Creando…' : 'WhatsApp'}
            </button>
            <button className="dl-action" onClick={handleDownload} disabled={!blob || !!busy}>
              <span className="dl-action-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
              Descargar
            </button>
            <button className="dl-action dl-action--danger" onClick={() => setConfirmDelete(true)} disabled={!!busy}>
              <span className="dl-action-icon dl-action-icon--danger">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
              Eliminar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Descargas({ onBack }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await listDownloads());
    } catch {
      setError('No se pudieron cargar tus descargas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    if (filter === 'all') return items;
    if (filter === 'other') return items.filter(i => !['pdf', 'excel', 'image'].includes(kindOf(i)));
    return items.filter(i => kindOf(i) === filter);
  }, [items, filter]);

  const handleDeleted = useCallback(id => {
    setItems(prev => prev.filter(i => i.id !== id));
    setSelected(null);
  }, []);

  const handleCloseSheet = useCallback(() => setSelected(null), []);

  const handleClearAll = async () => {
    setClearing(true);
    try {
      await deleteAllDownloads();
      setItems([]);
      setConfirmClear(false);
    } catch {
      setError('No se pudieron borrar todas las descargas.');
      await load();
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="dl-root">
      <div className="dl-header">
        <button className="dl-back-btn" onClick={onBack} aria-label="Volver">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="#111" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className="dl-title">Descargas</span>
      </div>

      <div className="dl-body">
        {items.length > 0 && (
          <div className="dl-filters">
            {FILTERS.map(f => (
              <button
                key={f.id}
                className={`dl-filter${filter === f.id ? ' dl-filter--active' : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="dl-state"><span className="dl-spinner" /> Cargando…</div>
        ) : error ? (
          <div className="dl-state dl-state--error">
            {error}
            <button className="dl-link-btn" onClick={load}>Reintentar</button>
          </div>
        ) : items.length === 0 ? (
          <div className="dl-empty">
            <div className="dl-empty-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="#111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="dl-empty-title">Aún no tienes descargas</p>
            <p className="dl-empty-text">
              Los documentos e informes que descargues de tus pisos, habitaciones y alquileres aparecerán aquí
              para verlos y compartirlos cuando quieras.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="dl-state">No hay archivos de este tipo.</div>
        ) : (
          <div className="dl-list">
            {visible.map(item => {
              const kind = kindOf(item);
              const sub = [item.property_name || item.source, formatDate(item.created_at), formatSize(item.size_bytes)]
                .filter(Boolean).join(' · ');
              return (
                <button key={item.id} className="dl-row" onClick={() => setSelected(item)}>
                  <FileBadge kind={kind} />
                  <div className="dl-row-content">
                    <p className="dl-row-title">{item.file_name}</p>
                    <p className="dl-row-sub">{sub}</p>
                  </div>
                  <svg className="dl-row-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
              );
            })}
          </div>
        )}

        {!loading && items.length > 0 && (
          <div className="dl-footer">
            {confirmClear ? (
              <div className="dl-clear-confirm">
                <span>¿Borrar todas las descargas guardadas?</span>
                <button className="dl-link-btn" onClick={() => setConfirmClear(false)} disabled={clearing}>Cancelar</button>
                <button className="dl-link-btn dl-link-btn--danger" onClick={handleClearAll} disabled={clearing}>
                  {clearing ? 'Borrando…' : 'Borrar todo'}
                </button>
              </div>
            ) : (
              <>
                <p className="dl-footer-note">
                  Se guardan en tu cuenta y puedes verlas desde cualquier dispositivo.
                </p>
                <button className="dl-link-btn dl-link-btn--danger" onClick={() => setConfirmClear(true)}>
                  Borrar todas las descargas
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {selected && (
        <PreviewSheet item={selected} onClose={handleCloseSheet} onDeleted={handleDeleted} />
      )}
    </div>
  );
}
