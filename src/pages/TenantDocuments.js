import React, { useState, useEffect, useRef, useCallback } from 'react';
import './PropertyDocuments.css';
import './TenantDocuments.css';
import { supabase } from '../supabaseClient';

// ─── SVG icons ────────────────────────────────────────────────────────────────

function FolderIcon({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
        fill="#FFE0B2" stroke="#FB8C00" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

function SharedFolderIcon({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
        fill="#E3F2FD" stroke="#1E88E5" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

function FileIcon({ mimeType, size = 32 }) {
  if (mimeType?.includes('pdf')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
          fill="#FFEBEE" stroke="#E53935" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M14 2v6h6" stroke="#E53935" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <text x="5.5" y="19" fontSize="5.5" fill="#E53935" fontWeight="bold">PDF</text>
      </svg>
    );
  }
  if (mimeType?.includes('image')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="2" fill="#E8F5E9" stroke="#43A047" strokeWidth="1.5"/>
        <circle cx="8.5" cy="8.5" r="1.5" stroke="#43A047" strokeWidth="1.5"/>
        <polyline points="21 15 16 10 5 21" stroke="#43A047" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  }
  if (mimeType?.includes('word') || mimeType?.includes('document') || mimeType?.includes('msword')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
          fill="#E3F2FD" stroke="#1E88E5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M14 2v6h6" stroke="#1E88E5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <line x1="8" y1="13" x2="16" y2="13" stroke="#1E88E5" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="8" y1="17" x2="16" y2="17" stroke="#1E88E5" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );
  }
  if (mimeType?.includes('sheet') || mimeType?.includes('excel') || mimeType?.includes('csv')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
          fill="#E8F5E9" stroke="#00897B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M14 2v6h6" stroke="#00897B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <line x1="8" y1="13" x2="16" y2="13" stroke="#00897B" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="8" y1="17" x2="12" y2="17" stroke="#00897B" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        fill="#F5F5F5" stroke="#9E9E9E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 2v6h6" stroke="#9E9E9E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="5"  r="1.8" fill="currentColor"/>
      <circle cx="12" cy="12" r="1.8" fill="currentColor"/>
      <circle cx="12" cy="19" r="1.8" fill="currentColor"/>
    </svg>
  );
}

function NativeShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="16 6 12 2 8 6"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="12" y1="2" x2="12" y2="15"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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
    return f.path.startsWith(prefix) && !f.path.slice(prefix.length).includes('/');
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TenantDocuments({ rental, onBack }) {
  const { landlordEmail, propertyId, tenantId } = rental;

  // Navigation state
  const [currentPath, setCurrentPath] = useState('');
  // null = own context; object = inside a shared landlord folder
  const [sharedFolderRoot, setSharedFolderRoot] = useState(null);

  // Data state
  const [allOwnFolders, setAllOwnFolders] = useState([]);
  const [sharedFolders, setSharedFolders] = useState([]); // from shared_folders table
  const [sharedStorageSubfolders, setSharedStorageSubfolders] = useState([]); // virtual folders from storage in shared context
  const [files, setFiles] = useState([]);
  const [sharedFiles, setSharedFiles] = useState([]); // from shared_files table

  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [moveTarget, setMoveTarget] = useState(null);
  const [zippingFolderId, setZippingFolderId] = useState(null);

  const menuRef = useRef(null);

  const tenantStorageRoot = `${landlordEmail}/${propertyId}/inquilino/${tenantId}`;

  // Active storage path for listing files
  const ownStoragePath = currentPath ? `${tenantStorageRoot}/${currentPath}` : tenantStorageRoot;
  const sharedStoragePath = sharedFolderRoot
    ? (currentPath ? `${landlordEmail}/${propertyId}/${currentPath}` : `${landlordEmail}/${propertyId}/${sharedFolderRoot.path}`)
    : null;
  const activeStoragePath = sharedFolderRoot ? sharedStoragePath : ownStoragePath;

  // ── Data loading ─────────────────────────────────────────────────────────────

  const loadContents = useCallback(async () => {
    setLoading(true);
    try {
      if (sharedFolderRoot === null) {
        // Own context: load own folders, shared_folders table, files, shared_files
        const [ownFoldersRes, sharedFoldersRes, storageRes, sharedFilesRes] = await Promise.all([
          supabase.from('folders').select('*')
            .eq('landlord_email', landlordEmail)
            .eq('property_id', propertyId)
            .eq('tenant_id', String(tenantId))
            .order('name'),
          supabase.from('shared_folders').select('*')
            .eq('landlord_email', landlordEmail)
            .eq('property_id', propertyId)
            .eq('shared_with_tenant', true),
          supabase.storage.from('documentos').list(ownStoragePath, { limit: 200, sortBy: { column: 'name', order: 'asc' } }),
          currentPath === ''
            ? supabase.from('shared_files').select('*')
                .eq('landlord_email', landlordEmail)
                .eq('shared_with_tenant', true)
            : Promise.resolve({ data: [] }),
        ]);
        setAllOwnFolders(ownFoldersRes.data || []);
        setSharedFolders(sharedFoldersRes.data || []);
        setFiles((storageRes.data || []).filter(item => item.id !== null));
        setSharedFiles(sharedFilesRes.data || []);
      } else {
        // Shared context: storage listing only — subfolders come from items with id === null
        const { data: storageData } = await supabase.storage.from('documentos').list(sharedStoragePath, { limit: 200, sortBy: { column: 'name', order: 'asc' } });
        setFiles((storageData || []).filter(item => item.id !== null));
        setSharedStorageSubfolders((storageData || []).filter(item => item.id === null));
      }
    } catch (err) {
      console.error('[TenantDocuments] loadContents error:', err);
    }
    setLoading(false);
  }, [landlordEmail, propertyId, tenantId, currentPath, sharedFolderRoot, ownStoragePath, sharedStoragePath]);

  useEffect(() => { loadContents(); }, [loadContents]);

  // Close "+" menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  // Close context menus on outside click
  useEffect(() => {
    if (!openMenuId) return;
    const handler = () => setOpenMenuId(null);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenuId]);

  // ── Breadcrumbs ───────────────────────────────────────────────────────────────

  const breadcrumbs = (() => {
    if (sharedFolderRoot === null) {
      const parts = currentPath ? currentPath.split('/').filter(Boolean) : [];
      return [
        { label: 'Mis documentos', onClick: () => setCurrentPath('') },
        ...parts.map((part, i) => ({
          label: part,
          onClick: () => setCurrentPath(parts.slice(0, i + 1).join('/')),
        })),
      ];
    } else {
      const subPath = currentPath.slice(sharedFolderRoot.path.length).replace(/^\//, '');
      const subParts = subPath ? subPath.split('/').filter(Boolean) : [];
      return [
        { label: 'Mis documentos', onClick: () => { setSharedFolderRoot(null); setCurrentPath(''); } },
        {
          label: sharedFolderRoot.name,
          isShared: true,
          onClick: () => setCurrentPath(sharedFolderRoot.path),
        },
        ...subParts.map((part, i) => ({
          label: part,
          onClick: () => setCurrentPath(sharedFolderRoot.path + '/' + subParts.slice(0, i + 1).join('/')),
        })),
      ];
    }
  })();

  // ── Own folder CRUD ───────────────────────────────────────────────────────────

  const handleCreateFolder = async name => {
    const newPath = currentPath ? `${currentPath}/${name}` : name;
    const { error } = await supabase.from('folders').insert({
      landlord_email: landlordEmail,
      property_id: propertyId,
      tenant_id: String(tenantId),
      path: newPath,
      name,
    });
    if (error) { alert(`Error creando carpeta: ${error.message}`); return; }
    await loadContents();
    setShowNewFolderModal(false);
  };

  const handleUploadFile = async file => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uploadPath = `${ownStoragePath}/${Date.now()}_${safeName}`;
    const { error } = await supabase.storage.from('documentos').upload(uploadPath, file, { upsert: false });
    if (error) { alert(`Error subiendo archivo: ${error.message}`); return; }
    await loadContents();
    setShowUploadModal(false);
  };

  const handleDeleteFile = async file => {
    if (!window.confirm(`¿Eliminar "${file.name}"?`)) return;
    await supabase.storage.from('documentos').remove([`${ownStoragePath}/${file.name}`]);
    setOpenMenuId(null);
    await loadContents();
  };

  const handleDeleteFolder = async folder => {
    if (!window.confirm(`¿Eliminar la carpeta "${folder.name}" y todo su contenido?`)) return;
    const fullPath = `${tenantStorageRoot}/${folder.path}`;
    const { data: items } = await supabase.storage.from('documentos').list(fullPath, { limit: 1000 });
    if (items?.length > 0) {
      await supabase.storage.from('documentos').remove(items.map(i => `${fullPath}/${i.name}`));
    }
    await supabase.from('folders').delete()
      .eq('tenant_id', String(tenantId))
      .or(`path.eq.${folder.path},path.like.${folder.path}/%`);
    setOpenMenuId(null);
    await loadContents();
  };

  const handleRenameFolder = async (folder, newName) => {
    const pathParts = folder.path.split('/');
    pathParts[pathParts.length - 1] = newName;
    const newFolderPath = pathParts.join('/');
    if (newFolderPath === folder.path) { setRenameTarget(null); return; }

    const oldStorage = `${tenantStorageRoot}/${folder.path}`;
    const newStorage = `${tenantStorageRoot}/${newFolderPath}`;

    const { data: items } = await supabase.storage.from('documentos').list(oldStorage, { limit: 1000 });
    for (const item of (items || []).filter(i => i.id !== null)) {
      const { data: blob } = await supabase.storage.from('documentos').download(`${oldStorage}/${item.name}`);
      if (blob) {
        await supabase.storage.from('documentos').upload(`${newStorage}/${item.name}`, blob, { upsert: false, contentType: blob.type || 'application/octet-stream' });
        await supabase.storage.from('documentos').remove([`${oldStorage}/${item.name}`]);
      }
    }

    const { error } = await supabase.from('folders')
      .update({ name: newName, path: newFolderPath })
      .eq('id', folder.id);
    if (error) { alert(`Error renombrando: ${error.message}`); return; }

    const subfolders = allOwnFolders.filter(f => f.path.startsWith(folder.path + '/'));
    for (const sub of subfolders) {
      const newSubPath = newFolderPath + sub.path.slice(folder.path.length);
      const oldSubStorage = `${tenantStorageRoot}/${sub.path}`;
      const newSubStorage = `${tenantStorageRoot}/${newSubPath}`;
      const { data: subItems } = await supabase.storage.from('documentos').list(oldSubStorage, { limit: 1000 });
      for (const item of (subItems || []).filter(i => i.id !== null)) {
        const { data: blob } = await supabase.storage.from('documentos').download(`${oldSubStorage}/${item.name}`);
        if (blob) {
          await supabase.storage.from('documentos').upload(`${newSubStorage}/${item.name}`, blob, { upsert: false, contentType: blob.type || 'application/octet-stream' });
          await supabase.storage.from('documentos').remove([`${oldSubStorage}/${item.name}`]);
        }
      }
      await supabase.from('folders').update({ path: newSubPath }).eq('id', sub.id);
    }

    setRenameTarget(null);
    await loadContents();
  };

  const handleRenameFile = async (file, newName) => {
    if (newName === file.name) { setRenameTarget(null); return; }
    const oldPath = `${ownStoragePath}/${file.name}`;
    const newPath = `${ownStoragePath}/${newName}`;
    const { data: blob, error: dlErr } = await supabase.storage.from('documentos').download(oldPath);
    if (dlErr) { alert(`Error renombrando: ${dlErr.message}`); return; }
    const { error: upErr } = await supabase.storage.from('documentos').upload(newPath, blob, {
      upsert: false, contentType: blob.type || file.metadata?.mimetype || 'application/octet-stream',
    });
    if (upErr) { alert(`Error renombrando: ${upErr.message}`); return; }
    await supabase.storage.from('documentos').remove([oldPath]);
    setRenameTarget(null);
    await loadContents();
  };

  const handleMoveFile = async (file, destFolderPath) => {
    const oldPath = `${ownStoragePath}/${file.name}`;
    const destStorage = destFolderPath ? `${tenantStorageRoot}/${destFolderPath}` : tenantStorageRoot;
    const newPath = `${destStorage}/${file.name}`;
    if (oldPath === newPath) { setMoveTarget(null); return; }
    const { data: blob, error: dlErr } = await supabase.storage.from('documentos').download(oldPath);
    if (dlErr) { alert(`Error moviendo: ${dlErr.message}`); return; }
    const { error: upErr } = await supabase.storage.from('documentos').upload(newPath, blob, {
      upsert: false, contentType: blob.type || file.metadata?.mimetype || 'application/octet-stream',
    });
    if (upErr) { alert(`Error moviendo: ${upErr.message}`); return; }
    await supabase.storage.from('documentos').remove([oldPath]);
    setMoveTarget(null);
    await loadContents();
  };

  const handleMoveFolder = async (folder, destFolderPath) => {
    const newFolderPath = destFolderPath ? `${destFolderPath}/${folder.name}` : folder.name;
    if (newFolderPath === folder.path || newFolderPath.startsWith(folder.path + '/')) {
      alert('No puedes mover una carpeta dentro de sí misma.');
      return;
    }
    const oldStorage = `${tenantStorageRoot}/${folder.path}`;
    const newStorage = `${tenantStorageRoot}/${newFolderPath}`;
    const { data: items } = await supabase.storage.from('documentos').list(oldStorage, { limit: 1000 });
    for (const item of (items || []).filter(i => i.id !== null)) {
      const { data: blob } = await supabase.storage.from('documentos').download(`${oldStorage}/${item.name}`);
      if (blob) {
        await supabase.storage.from('documentos').upload(`${newStorage}/${item.name}`, blob, { upsert: false, contentType: blob.type || 'application/octet-stream' });
        await supabase.storage.from('documentos').remove([`${oldStorage}/${item.name}`]);
      }
    }
    const { error } = await supabase.from('folders').update({ path: newFolderPath }).eq('id', folder.id);
    if (error) { alert(`Error moviendo carpeta: ${error.message}`); return; }
    const subfolders = allOwnFolders.filter(f => f.path.startsWith(folder.path + '/'));
    for (const sub of subfolders) {
      const newSubPath = newFolderPath + sub.path.slice(folder.path.length);
      const oldSubStorage = `${tenantStorageRoot}/${sub.path}`;
      const newSubStorage = `${tenantStorageRoot}/${newSubPath}`;
      const { data: subItems } = await supabase.storage.from('documentos').list(oldSubStorage, { limit: 1000 });
      for (const item of (subItems || []).filter(i => i.id !== null)) {
        const { data: blob } = await supabase.storage.from('documentos').download(`${oldSubStorage}/${item.name}`);
        if (blob) {
          await supabase.storage.from('documentos').upload(`${newSubStorage}/${item.name}`, blob, { upsert: false, contentType: blob.type || 'application/octet-stream' });
          await supabase.storage.from('documentos').remove([`${oldSubStorage}/${item.name}`]);
        }
      }
      await supabase.from('folders').update({ path: newSubPath }).eq('id', sub.id);
    }
    setMoveTarget(null);
    await loadContents();
  };

  // ── Native share / download ───────────────────────────────────────────────────

  const handleNativeShareFile = async (fileName, filePath, mimeType) => {
    const { data: blob, error } = await supabase.storage.from('documentos').download(filePath);
    if (error || !blob) { alert('Error descargando el archivo.'); return; }
    const fileToShare = new File([blob], fileName, { type: mimeType || blob.type || 'application/octet-stream' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [fileToShare] })) {
      try { await navigator.share({ files: [fileToShare], title: fileName }); }
      catch (err) { if (err?.name !== 'AbortError') console.error('[share]', err); }
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fileName; a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleNativeShareFolder = async (folder, folderStoragePath, e) => {
    e.stopPropagation();
    if (zippingFolderId === folder.id) return;
    setZippingFolderId(folder.id);
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();

      const addToZip = async (zipPath, storageDir) => {
        const { data: items } = await supabase.storage.from('documentos').list(storageDir, { limit: 1000 });
        for (const item of (items || []).filter(i => i.id !== null)) {
          const { data: b } = await supabase.storage.from('documentos').download(`${storageDir}/${item.name}`);
          if (b) zip.file(`${zipPath}/${item.name}`, b);
        }
        for (const item of (items || []).filter(i => i.id === null)) {
          await addToZip(`${zipPath}/${item.name}`, `${storageDir}/${item.name}`);
        }
      };

      await addToZip(folder.name, folderStoragePath);
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipFile = new File([zipBlob], `${folder.name}.zip`, { type: 'application/zip' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [zipFile] })) {
        await navigator.share({ files: [zipFile], title: `${folder.name}.zip` });
      } else {
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url; a.download = `${folder.name}.zip`; a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      if (err?.name !== 'AbortError') { console.error('[zip share]', err); alert('Error al comprimir la carpeta.'); }
    } finally {
      setZippingFolderId(null);
    }
  };

  // ── Context menu helper ───────────────────────────────────────────────────────

  const ItemMenu = ({ menuId, onRename, onMove, onDelete }) => (
    <div className="item-menu-wrapper">
      <button
        className="finder-action-btn finder-action-dots"
        onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); setOpenMenuId(prev => prev === menuId ? null : menuId); }}
        title="Más opciones"
      >
        <DotsIcon />
      </button>
      {openMenuId === menuId && (
        <div className="item-context-menu" onMouseDown={e => e.stopPropagation()}>
          <button onClick={() => { setOpenMenuId(null); onRename(); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Renombrar
          </button>
          <button onClick={() => { setOpenMenuId(null); onMove(); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M5 12h14M12 5l7 7-7 7"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Mover
          </button>
          <button className="ctx-delete" onClick={() => { setOpenMenuId(null); onDelete(); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Eliminar
          </button>
        </div>
      )}
    </div>
  );

  // ── Derived render values ─────────────────────────────────────────────────────

  // Own context: own folders at current level
  const visibleOwnFolders = sharedFolderRoot === null
    ? getDirectChildren(allOwnFolders, currentPath)
    : [];

  // Own context, root only: shared landlord folders from shared_folders table
  const visibleTopSharedFolders = sharedFolderRoot === null && currentPath === ''
    ? sharedFolders
    : [];

  // Shared context: subfolders from storage listing (items with id === null)
  const visibleSharedSubfolders = sharedFolderRoot !== null
    ? sharedStorageSubfolders
    : [];

  const isReadOnly = sharedFolderRoot !== null;
  const canAdd = !isReadOnly;

  // ── Render ───────────────────────────────────────────────────────────────────

  const allVisibleFolders = isReadOnly ? visibleSharedSubfolders : visibleOwnFolders;
  const allVisibleSharedFoldersAtRoot = visibleTopSharedFolders;

  return (
    <div className="finder-container">
      {/* Header */}
      <div className="finder-header">
        <button className="finder-back-btn" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h1 className="finder-title">Mis documentos</h1>
        {canAdd && (
          <div className="finder-add-wrapper" ref={menuRef}>
            <button className="finder-add-btn" onClick={() => setShowMenu(v => !v)}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </button>
            {showMenu && (
              <div className="finder-add-menu">
                <button onClick={() => { setShowMenu(false); setShowNewFolderModal(true); }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                      stroke="#FB8C00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <line x1="12" y1="11" x2="12" y2="17" stroke="#FB8C00" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="9" y1="14" x2="15" y2="14" stroke="#FB8C00" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  Nueva carpeta
                </button>
                <button onClick={() => { setShowMenu(false); setShowUploadModal(true); }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
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
        )}
        {!canAdd && <div style={{ width: 40 }} />}
      </div>

      {/* Breadcrumb */}
      <div className="finder-breadcrumb">
        {breadcrumbs.map((crumb, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <polyline points="9 18 15 12 9 6" stroke="#C7C7CC" strokeWidth="2.2"
                  strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            <button
              className={`breadcrumb-item${idx === breadcrumbs.length - 1 ? ' active' : ''}${crumb.isShared ? ' td-breadcrumb-shared' : ''}`}
              onClick={crumb.onClick}
            >
              {crumb.label}
              {crumb.isShared && (
                <span className="td-shared-badge-inline">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </span>
              )}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* Content */}
      <div className="finder-content">
        {loading ? (
          <div className="finder-loading">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="finder-spinner">
              <circle cx="12" cy="12" r="10" stroke="#E5E5EA" strokeWidth="3"/>
              <path d="M12 2a10 10 0 0 1 10 10" stroke="#555" strokeWidth="3" strokeLinecap="round"/>
            </svg>
          </div>
        ) : allVisibleFolders.length === 0 && allVisibleSharedFoldersAtRoot.length === 0 && files.length === 0 && sharedFiles.length === 0 ? (
          <div className="finder-empty">
            <div className="finder-empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                  fill="#F5F5F5" stroke="#D1D1D6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="finder-empty-text">Esta carpeta está vacía</p>
            {canAdd && (
              <button className="finder-empty-cta" onClick={() => setShowMenu(true)}>
                Añadir contenido
              </button>
            )}
          </div>
        ) : (
          <div className="finder-list">
            {/* Carpetas propias + compartidas en raíz */}
            {(allVisibleFolders.length > 0 || allVisibleSharedFoldersAtRoot.length > 0) && (
              <>
                <p className="finder-section-label">Carpetas</p>
                <div className="folder-grid">

                  {/* Carpetas propias */}
                  {allVisibleFolders.map(folder => {
                    const folderStoragePath = `${tenantStorageRoot}/${folder.path}`;
                    return (
                      <div key={folder.id} className="folder-card"
                        onClick={() => setCurrentPath(folder.path)}>
                        <div className="folder-card-icon"><FolderIcon size={44} /></div>
                        <span className="folder-card-name">{folder.name}</span>
                        <div className="folder-card-actions" onClick={e => e.stopPropagation()}>
                          <button
                            className="finder-action-btn"
                            onClick={e => handleNativeShareFolder(folder, folderStoragePath, e)}
                            disabled={zippingFolderId === folder.id}
                            title={navigator.share ? 'Compartir carpeta' : 'Descargar carpeta como ZIP'}
                          >
                            {zippingFolderId === folder.id
                              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="finder-spinner"><circle cx="12" cy="12" r="10" stroke="#E5E5EA" strokeWidth="3"/><path d="M12 2a10 10 0 0 1 10 10" stroke="#555" strokeWidth="3" strokeLinecap="round"/></svg>
                              : <NativeShareIcon />
                            }
                          </button>
                          <ItemMenu
                            menuId={`own-folder-${folder.id}`}
                            onRename={() => setRenameTarget({ type: 'folder', item: folder })}
                            onMove={() => setMoveTarget({ type: 'folder', item: folder })}
                            onDelete={() => handleDeleteFolder(folder)}
                          />
                        </div>
                      </div>
                    );
                  })}

                  {/* Carpetas compartidas por el propietario (solo en raíz del contexto propio) */}
                  {allVisibleSharedFoldersAtRoot.map(sf => {
                    const folderStoragePath = `${landlordEmail}/${propertyId}/${sf.folder_path}`;
                    return (
                      <div key={`shared-${sf.id}`} className="folder-card"
                        onClick={() => { setSharedFolderRoot({ id: sf.folder_id, name: sf.folder_name, path: sf.folder_path }); setCurrentPath(sf.folder_path); }}>
                        <div className="folder-card-icon"><SharedFolderIcon size={44} /></div>
                        <span className="folder-card-name">{sf.folder_name}</span>
                        <div className="td-shared-badge">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                            <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2.5"/>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                          </svg>
                          Compartida
                        </div>
                        <div className="folder-card-actions" onClick={e => e.stopPropagation()}>
                          <button
                            className="finder-action-btn"
                            onClick={e => handleNativeShareFolder({ name: sf.folder_name, id: sf.id }, folderStoragePath, e)}
                            disabled={zippingFolderId === sf.id}
                            title={navigator.share ? 'Compartir carpeta' : 'Descargar carpeta como ZIP'}
                          >
                            {zippingFolderId === sf.id
                              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="finder-spinner"><circle cx="12" cy="12" r="10" stroke="#E5E5EA" strokeWidth="3"/><path d="M12 2a10 10 0 0 1 10 10" stroke="#555" strokeWidth="3" strokeLinecap="round"/></svg>
                              : <NativeShareIcon />
                            }
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Subcarpetas dentro del contexto compartido — derivadas del listado de Storage */}
                  {isReadOnly && visibleSharedSubfolders.map(item => {
                    const itemPath = `${currentPath}/${item.name}`;
                    const folderStoragePath = `${sharedStoragePath}/${item.name}`;
                    const zippingKey = `${currentPath}/${item.name}`;
                    return (
                      <div key={`rsub-${item.name}`} className="folder-card"
                        onClick={() => setCurrentPath(itemPath)}>
                        <div className="folder-card-icon"><SharedFolderIcon size={44} /></div>
                        <span className="folder-card-name">{item.name}</span>
                        <div className="folder-card-actions" onClick={e => e.stopPropagation()}>
                          <button
                            className="finder-action-btn"
                            onClick={e => handleNativeShareFolder({ name: item.name, id: zippingKey }, folderStoragePath, e)}
                            disabled={zippingFolderId === zippingKey}
                            title={navigator.share ? 'Compartir carpeta' : 'Descargar carpeta como ZIP'}
                          >
                            {zippingFolderId === zippingKey
                              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="finder-spinner"><circle cx="12" cy="12" r="10" stroke="#E5E5EA" strokeWidth="3"/><path d="M12 2a10 10 0 0 1 10 10" stroke="#555" strokeWidth="3" strokeLinecap="round"/></svg>
                              : <NativeShareIcon />
                            }
                          </button>
                        </div>
                      </div>
                    );
                  })}

                </div>
              </>
            )}

            {/* Archivos */}
            {(files.length > 0 || (sharedFiles.length > 0 && currentPath === '' && !isReadOnly)) && (
              <>
                <p className="finder-section-label">Archivos</p>
                <div className="file-cards">

                  {/* Archivos propios / archivos en carpeta compartida */}
                  {files.map(file => {
                    const filePath = `${activeStoragePath}/${file.name}`;
                    return (
                      <div key={file.id || file.name} className="file-card"
                        onClick={() => {
                          const { data } = supabase.storage.from('documentos').getPublicUrl(filePath);
                          if (data?.publicUrl) window.open(data.publicUrl, '_blank');
                        }}>
                        <div className="file-card-icon">
                          <FileIcon mimeType={file.metadata?.mimetype} size={36} />
                        </div>
                        <div className="file-card-info">
                          <span className="file-card-name">{file.name}</span>
                          <span className="file-card-meta">
                            {file.metadata?.size ? formatFileSize(file.metadata.size) : '—'}
                            {isReadOnly && <span className="finder-shared-badge">Compartido</span>}
                          </span>
                        </div>
                        <div className="file-card-actions" onClick={e => e.stopPropagation()}>
                          <button
                            className="finder-action-btn"
                            onClick={e => { e.stopPropagation(); handleNativeShareFile(file.name, filePath, file.metadata?.mimetype); }}
                            title={navigator.share ? 'Compartir' : 'Descargar'}
                          >
                            <NativeShareIcon />
                          </button>
                          {!isReadOnly && (
                            <ItemMenu
                              menuId={`file-${file.id || file.name}`}
                              onRename={() => setRenameTarget({ type: 'file', item: file })}
                              onMove={() => setMoveTarget({ type: 'file', item: file })}
                              onDelete={() => handleDeleteFile(file)}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Archivos compartidos individualmente (solo en raíz, contexto propio) */}
                  {!isReadOnly && currentPath === '' && sharedFiles.map(sf => {
                    const fileName = sf.file_name || sf.storage_path.split('/').pop();
                    return (
                      <div key={`sf-${sf.id}`} className="file-card"
                        onClick={() => {
                          const { data } = supabase.storage.from('documentos').getPublicUrl(sf.storage_path);
                          if (data?.publicUrl) window.open(data.publicUrl, '_blank');
                        }}>
                        <div className="file-card-icon">
                          <FileIcon mimeType={sf.file_type} size={36} />
                        </div>
                        <div className="file-card-info">
                          <span className="file-card-name">{fileName}</span>
                          <span className="file-card-meta">
                            {sf.file_size ? formatFileSize(sf.file_size) : '—'}
                            <span className="finder-shared-badge">Compartido</span>
                          </span>
                        </div>
                        <div className="file-card-actions" onClick={e => e.stopPropagation()}>
                          <button
                            className="finder-action-btn"
                            onClick={e => { e.stopPropagation(); handleNativeShareFile(fileName, sf.storage_path, sf.file_type); }}
                            title={navigator.share ? 'Compartir' : 'Descargar'}
                          >
                            <NativeShareIcon />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showNewFolderModal && (
        <NewFolderModal onClose={() => setShowNewFolderModal(false)} onCreate={handleCreateFolder} />
      )}
      {showUploadModal && (
        <UploadFileModal onClose={() => setShowUploadModal(false)} onUpload={handleUploadFile} />
      )}
      {renameTarget && (
        <RenameModal
          currentName={renameTarget.item.name}
          onClose={() => setRenameTarget(null)}
          onRename={newName =>
            renameTarget.type === 'folder'
              ? handleRenameFolder(renameTarget.item, newName)
              : handleRenameFile(renameTarget.item, newName)
          }
        />
      )}
      {moveTarget && (
        <FolderPickerModal
          allFolders={allOwnFolders}
          excludePath={moveTarget.type === 'folder' ? moveTarget.item.path : null}
          onClose={() => setMoveTarget(null)}
          onPick={destPath =>
            moveTarget.type === 'folder'
              ? handleMoveFolder(moveTarget.item, destPath)
              : handleMoveFile(moveTarget.item, destPath)
          }
        />
      )}
    </div>
  );
}

// ─── Modals (same as PropertyDocuments) ──────────────────────────────────────

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
            <input type="text" placeholder="Ej: Contratos, Nóminas…"
              value={name} onChange={e => setName(e.target.value)} autoFocus required />
          </div>
          <button type="submit" className="submit-button" disabled={loading || !name.trim()}>
            {loading ? 'Creando…' : 'Crear carpeta'}
          </button>
        </form>
      </div>
    </div>
  );
}

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
                  <div>
                    <p className="file-selected-name">{file.name}</p>
                    <p className="file-selected-size">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button type="button" className="file-remove"
                    onClick={e => { e.stopPropagation(); setFile(null); }}>×</button>
                </div>
              ) : (
                <div className="file-upload-placeholder">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#BDBDBD" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="17 8 12 3 7 8" stroke="#BDBDBD" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <line x1="12" y1="3" x2="12" y2="15" stroke="#BDBDBD" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <p>Toca para seleccionar un archivo</p>
                  <span>PDF, imagen, Word, Excel…</span>
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="*/*"
              style={{ display: 'none' }} onChange={e => setFile(e.target.files[0] || null)} />
          </div>
          <button type="submit" className="submit-button" disabled={loading || !file}>
            {loading ? 'Subiendo…' : 'Subir archivo'}
          </button>
        </form>
      </div>
    </div>
  );
}

function RenameModal({ currentName, onClose, onRename }) {
  const [name, setName] = useState(currentName);
  const [loading, setLoading] = useState(false);
  const handleSubmit = async e => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    await onRename(name.trim());
    setLoading(false);
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Renombrar</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nuevo nombre</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} autoFocus required />
          </div>
          <button type="submit" className="submit-button"
            disabled={loading || !name.trim() || name.trim() === currentName}>
            {loading ? 'Renombrando…' : 'Renombrar'}
          </button>
        </form>
      </div>
    </div>
  );
}

function FolderPickerModal({ allFolders, excludePath, onClose, onPick }) {
  const [selected, setSelected] = useState(null);
  const available = excludePath
    ? allFolders.filter(f => f.path !== excludePath && !f.path.startsWith(excludePath + '/'))
    : allFolders;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Mover a</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="folder-picker-list">
          <div
            className={`folder-picker-item${selected === null ? ' selected' : ''}`}
            onClick={() => setSelected(null)}
          >
            <FolderIcon size={20} />
            <span>Raíz (inicio)</span>
          </div>
          {available.map(folder => {
            const depth = folder.path.split('/').length - 1;
            return (
              <div
                key={folder.id}
                className={`folder-picker-item${selected === folder.path ? ' selected' : ''}`}
                style={{ paddingLeft: 14 + depth * 16 }}
                onClick={() => setSelected(folder.path)}
              >
                <FolderIcon size={20} />
                <span>{folder.name}</span>
              </div>
            );
          })}
        </div>
        <button className="submit-button" onClick={() => { onPick(selected); onClose(); }}>
          Mover aquí
        </button>
      </div>
    </div>
  );
}
