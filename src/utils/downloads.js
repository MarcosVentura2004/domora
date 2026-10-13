import { supabase } from '../supabaseClient';

// Every file the user downloads is also kept in their account so it shows up
// in Ajustes > Descargas. Storage layout: descargas/<user_id>/<download_id>/<file>
const BUCKET = 'descargas';
const TABLE = 'descargas';

const MIME_BY_EXT = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  zip: 'application/zip',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  txt: 'text/plain',
  csv: 'text/csv',
};

export function extensionOf(fileName = '') {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase();
}

// Content type comes only from this extension allowlist, never from blob.type:
// files can originate from other users (chat attachments) and an SVG/HTML blob
// rendered from a same-origin blob: URL would run scripts with the user's session.
const SAFE_TYPES = new Set(Object.values(MIME_BY_EXT));

function mimeFor(fileName) {
  return MIME_BY_EXT[extensionOf(fileName)] || 'application/octet-stream';
}

// Storage keys reject accents and most symbols.
function storageSafeName(fileName) {
  const clean = fileName
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(-120);
  return clean || 'archivo';
}

// Saves a blob to the device (same behaviour the app always had).
export function triggerDeviceDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoking synchronously can cancel the download in Safari/Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function recordDownload(blob, fileName, { source, propertyName } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  // Tenants have no Supabase account: nothing to record.
  if (!user) return;

  const id = crypto.randomUUID();
  const mimeType = mimeFor(fileName);
  const storagePath = `${user.id}/${id}/${storageSafeName(fileName)}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, blob, { contentType: mimeType, upsert: false });
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.from(TABLE).insert({
    id,
    user_id: user.id,
    file_name: fileName,
    storage_path: storagePath,
    mime_type: mimeType,
    size_bytes: blob.size,
    source: source || null,
    property_name: propertyName || null,
  });
  if (insertError) {
    // Don't leave orphan files behind.
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw insertError;
  }
}

// Download to the device and keep a copy in Ajustes > Descargas.
// Recording happens in the background and never blocks or breaks the download.
export function saveDownload(blob, fileName, meta) {
  triggerDeviceDownload(blob, fileName);
  recordDownload(blob, fileName, meta).catch(err => {
    console.warn('[descargas] No se pudo guardar la copia:', err);
  });
}

export async function listDownloads() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, file_name, storage_path, mime_type, size_bytes, source, property_name, created_at')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  return data || [];
}

export async function getDownloadBlob(item) {
  const { data, error } = await supabase.storage.from(BUCKET).download(item.storage_path);
  if (error || !data) throw error || new Error('Archivo no encontrado');
  // Always re-wrap with an allowlisted type so nothing renders as HTML/SVG.
  const type = SAFE_TYPES.has(item.mime_type) ? item.mime_type : 'application/octet-stream';
  return new Blob([data], { type });
}

export async function getShareLink(item, seconds = 7 * 24 * 60 * 60) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(item.storage_path, seconds);
  if (error || !data?.signedUrl) throw error || new Error('No se pudo crear el enlace');
  return data.signedUrl;
}

export async function deleteDownload(item) {
  const { error: removeError } = await supabase.storage.from(BUCKET).remove([item.storage_path]);
  if (removeError) throw removeError;
  const { error } = await supabase.from(TABLE).delete().eq('id', item.id);
  if (error) throw error;
}

// Used by "Borrar todo" and when the account is deleted (GDPR).
export async function deleteAllDownloads() {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return;

  const { data: rows, error } = await supabase
    .from(TABLE)
    .select('storage_path')
    .eq('user_id', user.id);
  if (error) throw error;

  const paths = (rows || []).map(r => r.storage_path);
  for (let i = 0; i < paths.length; i += 100) {
    const { error: removeError } = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100));
    if (removeError) throw removeError;
  }

  const { error: deleteError } = await supabase.from(TABLE).delete().eq('user_id', user.id);
  if (deleteError) throw deleteError;
}
