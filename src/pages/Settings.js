import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { saveFile, getFile } from '../utils/fileStorage';
import './Settings.css';

async function sendGestorInviteEmail({ gestorEmail, gestorName, landlordName, propertyCount }, supabaseClient) {
  const { error } = await supabaseClient.functions.invoke('send-gestor-invite', {
    body: { gestorEmail, gestorName, landlordName, propertyCount },
  });
  if (error) console.warn('[send-gestor-invite] Error:', error);
}

function formatPhone(raw) {
  const digits = (raw || '').replace(/\D/g, '').slice(0, 9);
  return digits.match(/.{1,3}/g)?.join(' ') ?? '';
}

export default function Settings({ userEmail, onLogout, onSwitchRole, onBack }) {
  // ── Perfil ──────────────────────────────────────────────
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileEmail, setProfileEmail] = useState(userEmail || '');
  // avatarSrc: puede ser un blob: local o una URL de Supabase
  const [avatarSrc, setAvatarSrc] = useState(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [emailChangeSent, setEmailChangeSent] = useState(false);
  const fileInputRef = useRef(null);

  // ── Plan ────────────────────────────────────────────────
  const [plan, setPlan] = useState('free');

  // ── Rol ─────────────────────────────────────────────────
  const [showRoleModal, setShowRoleModal] = useState(false);

  // ── Seguridad ────────────────────────────────────────────
  const [passwordSending, setPasswordSending] = useState(false);
  const [passwordSent, setPasswordSent] = useState(false);

  // ── Eliminar cuenta ──────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);

  // ── Gestores ─────────────────────────────────────────────
  const [gestores, setGestores] = useState([]);       // [{ email, name, permisos, properties: [id] }]
  const [ownerProperties, setOwnerProperties] = useState([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [invitePropertyIds, setInvitePropertyIds] = useState(new Set());
  const [invitePermission, setInvitePermission] = useState('lectura');
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSent, setInviteSent] = useState(false);
  const [revokingEmail, setRevokingEmail] = useState(null);

  // ── Carga gestores ────────────────────────────────────────
  const loadGestores = async () => {
    // Propiedades del propietario
    const { data: propsData } = await supabase
      .from('properties')
      .select('id, data')
      .eq('landlord_email', userEmail);
    setOwnerProperties((propsData || []).map(r => ({ id: r.id, name: r.data?.name || r.id })));

    // Accesos concedidos
    const { data: accessRows } = await supabase
      .from('property_access')
      .select('gestor_email, property_id, permisos')
      .eq('landlord_email', userEmail);
    if (!accessRows || accessRows.length === 0) { setGestores([]); return; }

    // Nombres de gestores
    const emails = [...new Set(accessRows.map(r => r.gestor_email))];
    const { data: gestorRows } = await supabase
      .from('gestores')
      .select('email, name')
      .in('email', emails);
    const nameMap = Object.fromEntries((gestorRows || []).map(g => [g.email, g.name]));

    // Agrupar por gestor
    const grouped = emails.map(email => ({
      email,
      name: nameMap[email] || email,
      permisos: accessRows.find(r => r.gestor_email === email)?.permisos || 'lectura',
      propertyIds: accessRows.filter(r => r.gestor_email === email).map(r => r.property_id),
    }));
    setGestores(grouped);
  };

  // ── Handlers gestores ─────────────────────────────────────
  const handleInvite = async () => {
    if (!inviteEmail.trim() || !inviteName.trim() || invitePropertyIds.size === 0) {
      setInviteError('Completa todos los campos y selecciona al menos una propiedad.');
      return;
    }
    setInviteSending(true);
    setInviteError('');
    try {
      // 1. Insertar / actualizar en tabla gestores
      await supabase.from('gestores').upsert(
        { email: inviteEmail.trim().toLowerCase(), name: inviteName.trim() },
        { onConflict: 'email' }
      );

      // 2. Insertar registros en property_access (uno por propiedad)
      const rows = [...invitePropertyIds].map(pid => ({
        gestor_email: inviteEmail.trim().toLowerCase(),
        landlord_email: userEmail,
        property_id: pid,
        permisos: invitePermission,
      }));
      await supabase.from('property_access').upsert(rows, { onConflict: 'gestor_email,property_id' });

      // 3. Enviar email de invitación
      const landlordRow = await supabase.from('landlords').select('name').eq('email', userEmail).single();
      const landlordName = landlordRow?.data?.name || userEmail;
      await sendGestorInviteEmail({
        gestorEmail: inviteEmail.trim().toLowerCase(),
        gestorName: inviteName.trim(),
        landlordName,
        propertyCount: invitePropertyIds.size,
      }, supabase);

      setInviteSent(true);
      setTimeout(() => {
        setShowInviteModal(false);
        setInviteEmail('');
        setInviteName('');
        setInvitePropertyIds(new Set());
        setInvitePermission('lectura');
        setInviteSent(false);
        loadGestores();
      }, 1800);
    } catch (err) {
      setInviteError('Error al enviar la invitación. Inténtalo de nuevo.');
    } finally {
      setInviteSending(false);
    }
  };

  const handleRevoke = async (gestorEmail) => {
    setRevokingEmail(gestorEmail);
    await supabase
      .from('property_access')
      .delete()
      .eq('gestor_email', gestorEmail)
      .eq('landlord_email', userEmail);
    setRevokingEmail(null);
    loadGestores();
  };

  // ── Carga inicial ─────────────────────────────────────────
  useEffect(() => {
    loadGestores();
    async function load() {
      // Datos del usuario autenticado
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.user_metadata) {
        setProfileName(user.user_metadata.name || '');
        setProfilePhone(formatPhone(user.user_metadata.phone || ''));
      }

      // Datos de la tabla landlords (plan, nombre, teléfono)
      const { data: landlord } = await supabase
        .from('landlords')
        .select('name, phone, plan')
        .eq('email', userEmail)
        .single();

      if (landlord) {
        if (landlord.name) setProfileName(landlord.name);
        if (landlord.phone) setProfilePhone(formatPhone(landlord.phone));
        setPlan(landlord.plan || 'free');
      }

      // Avatar: primero IndexedDB (local, siempre disponible)
      const localAvatar = await getFile(`avatar_${userEmail}`).catch(() => null);
      if (localAvatar) {
        setAvatarSrc(localAvatar);
      } else {
        // Si no hay local, intentar desde Supabase Storage
        const { data: urlData } = supabase.storage
          .from('avatars')
          .getPublicUrl(`${userEmail}/avatar`);
        if (urlData?.publicUrl) {
          const testImg = new window.Image();
          testImg.onload = () => setAvatarSrc(urlData.publicUrl + '?t=' + Date.now());
          testImg.onerror = () => {};
          testImg.src = urlData.publicUrl + '?t=' + Date.now();
        }
      }
    }
    load();
  }, [userEmail]);

  // ── Handlers ──────────────────────────────────────────────
  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setPhotoUploading(true);

    // 1. Convertir a dataURL y guardar en IndexedDB — funciona siempre, sin bucket
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = ev => resolve(ev.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    await saveFile(`avatar_${userEmail}`, dataUrl).catch(() => {});
    setAvatarSrc(dataUrl); // se ve de inmediato

    // 2. Intentar subir también a Supabase Storage (para verlo en otros dispositivos)
    const { error } = await supabase.storage
      .from('avatars')
      .upload(`${userEmail}/avatar`, file, { upsert: true, contentType: file.type });

    if (error) {
      // Fallo silencioso — ya está guardado en local, el usuario ve la foto
      console.warn('Supabase Storage no disponible, avatar guardado solo en local:', error.message);
    } else {
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(`${userEmail}/avatar`);
      // Actualizar IndexedDB con la URL remota para futuros dispositivos
      await saveFile(`avatar_${userEmail}`, urlData.publicUrl + '?t=' + Date.now()).catch(() => {});
      setAvatarSrc(urlData.publicUrl + '?t=' + Date.now());
    }

    setPhotoUploading(false);
    e.target.value = '';
  };

  const handleSaveProfile = async () => {
    setProfileSaving(true);
    const emailTrimmed = profileEmail.trim().toLowerCase();
    const emailChanged = emailTrimmed && emailTrimmed !== userEmail;

    // Actualizar nombre, teléfono y (si cambia) email en Supabase Auth
    const updatePayload = { data: { name: profileName.trim(), phone: profilePhone.trim() } };
    if (emailChanged) updatePayload.email = emailTrimmed;
    await supabase.auth.updateUser(updatePayload);

    // Actualizar tabla landlords
    await supabase.from('landlords').upsert(
      { email: userEmail, name: profileName.trim(), phone: profilePhone.trim() },
      { onConflict: 'email' }
    );

    setProfileSaving(false);
    if (emailChanged) {
      setEmailChangeSent(true);
    } else {
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    }
  };

  const handlePasswordReset = async () => {
    setPasswordSending(true);
    await supabase.auth.resetPasswordForEmail(userEmail);
    setPasswordSending(false);
    setPasswordSent(true);
  };

  const handleDeleteAccount = async () => {
    if (deleteText !== 'ELIMINAR' || deleting) return;
    setDeleting(true);
    try {
      // Eliminar datos del usuario
      await supabase.from('properties').delete().eq('landlord_email', userEmail);
      await supabase.from('messages').delete().eq('landlord_email', userEmail);
      await supabase.from('payments').delete().eq('landlord_email', userEmail);
      await supabase.from('incidents').delete().eq('landlord_email', userEmail);
      await supabase.from('landlords').delete().eq('email', userEmail);
      // Intentar eliminar cuenta vía RPC (requiere función en Supabase)
      await supabase.rpc('delete_user_account').catch(() => null);
    } catch (err) {
      console.error('Error eliminando cuenta:', err);
    }
    await supabase.auth.signOut();
    onLogout();
  };

  // ── Cálculo de iniciales para avatar ─────────────────────
  const initials = (profileName || userEmail || '?')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="settings-root">
      {/* ── Cabecera ── */}
      <div className="settings-header">
        <button className="settings-back-btn" onClick={onBack} aria-label="Volver">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="#111" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className="settings-title">Ajustes</span>
      </div>

      <div className="settings-body">

        {/* ════════════════════════════════════════
            SECCIÓN 1 — Perfil
        ════════════════════════════════════════ */}
        <div>
          <p className="settings-section-label">Perfil</p>
          <div className="settings-card">
            {/* Avatar */}
            <div className="settings-profile-header">
              <button
                className="settings-avatar-wrap"
                onClick={() => !photoUploading && fileInputRef.current?.click()}
                style={{ background: 'none', border: 'none', padding: 0 }}
                aria-label="Cambiar foto de perfil"
              >
                {avatarSrc ? (
                  <img src={avatarSrc} alt="Avatar" className="settings-avatar" />
                ) : (
                  <div className="settings-avatar-placeholder">{initials}</div>
                )}
                {photoUploading && (
                  <div className="settings-avatar-loading">
                    <div className="settings-spinner" />
                  </div>
                )}
                <div className="settings-avatar-edit-badge">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path d="M12 20h9" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </button>
            </div>

            {/* Campos */}
            <div className="settings-input-group">
              <div>
                <label className="settings-input-label">Nombre</label>
                <input
                  className="settings-input"
                  type="text"
                  placeholder="Tu nombre"
                  value={profileName}
                  onChange={e => setProfileName(e.target.value)}
                />
              </div>
              <div>
                <label className="settings-input-label">Correo electrónico</label>
                <input
                  className="settings-input"
                  type="email"
                  placeholder="tu@email.com"
                  value={profileEmail}
                  onChange={e => { setProfileEmail(e.target.value); setEmailChangeSent(false); }}
                />
                {profileEmail.trim().toLowerCase() !== userEmail && profileEmail.trim() && (
                  <p style={{ margin: '5px 0 0', fontSize: '12px', color: '#8e8e93', lineHeight: 1.4 }}>
                    Se enviará un enlace de verificación al nuevo correo para confirmar el cambio.
                  </p>
                )}
              </div>
              <div>
                <label className="settings-input-label">Teléfono</label>
                <input
                  className="settings-input"
                  type="tel"
                  placeholder="600 000 000"
                  value={profilePhone}
                  onChange={e => setProfilePhone(formatPhone(e.target.value))}
                />
              </div>
            </div>

            {emailChangeSent && (
              <div className="settings-confirm-msg" style={{ margin: '0 16px 16px', borderRadius: '10px', border: 'none' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17l-5-5" stroke="#27ae60" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Enlace de verificación enviado a {profileEmail.trim()}. Confirma el cambio desde tu nuevo correo.
              </div>
            )}

            <button
              className={`settings-save-btn${profileSaved ? ' saved' : ''}`}
              onClick={handleSaveProfile}
              disabled={profileSaving}
            >
              {profileSaving ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <div className="settings-spinner" />
                  Guardando…
                </span>
              ) : profileSaved ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Guardado
                </span>
              ) : 'Guardar cambios'}
            </button>
          </div>
        </div>

        {/* Input oculto para subir foto */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handlePhotoChange}
        />

        {/* ════════════════════════════════════════
            SECCIÓN 2 — Cambiar rol
        ════════════════════════════════════════ */}
        <div>
          <p className="settings-section-label">Rol</p>
          <div className="settings-card">
            {/* Propietario — activo */}
            <div className="settings-card-row">
              <div className="settings-row-icon" style={{ background: '#f0f0f0' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M9 21V12h6v9" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="settings-row-content">
                <p className="settings-row-title">Propietario</p>
                <p className="settings-row-subtitle">Rol actual</p>
              </div>
              <svg className="settings-row-check" width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M20 6L9 17l-5-5" stroke="#34c759" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            {/* Inquilino */}
            <button
              className="settings-card-row"
              style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              onClick={() => setShowRoleModal(true)}
            >
              <div className="settings-row-icon" style={{ background: '#f0f0f0' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="12" cy="7" r="4" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="settings-row-content">
                <p className="settings-row-title">Inquilino</p>
                <p className="settings-row-subtitle">Introduce tu código de acceso</p>
              </div>
              <svg className="settings-row-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>

            {/* Gestor — deshabilitado */}
            <div className="settings-card-row settings-role-disabled">
              <div className="settings-row-icon" style={{ background: '#f0f0f0' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <rect x="2" y="7" width="20" height="14" rx="2" stroke="#aaa" strokeWidth="2"/>
                  <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" stroke="#aaa" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M12 12v4M10 14h4" stroke="#aaa" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="settings-row-content">
                <p className="settings-row-title" style={{ color: '#aaa' }}>Gestor</p>
              </div>
              <span className="settings-row-badge">Próximamente</span>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════
            SECCIÓN 2b — Gestores
        ════════════════════════════════════════ */}
        <div>
          <p className="settings-section-label">Gestores</p>
          <div className="settings-card">

            {/* Lista de gestores actuales */}
            {gestores.length === 0 ? (
              <div className="settings-card-row" style={{ opacity: 0.5, pointerEvents: 'none' }}>
                <div className="settings-row-icon" style={{ background: '#f0f0f0' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <rect x="2" y="7" width="20" height="14" rx="2" stroke="#aaa" strokeWidth="2"/>
                    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" stroke="#aaa" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <div className="settings-row-content">
                  <p className="settings-row-title" style={{ color: '#aaa' }}>Sin gestores</p>
                  <p className="settings-row-subtitle">Invita a alguien para delegar</p>
                </div>
              </div>
            ) : (
              gestores.map(g => (
                <div key={g.email} className="settings-card-row" style={{ alignItems: 'flex-start' }}>
                  <div className="settings-row-icon" style={{ background: '#f0f0f0' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <circle cx="12" cy="7" r="4" stroke="#555" strokeWidth="2"/>
                    </svg>
                  </div>
                  <div className="settings-row-content" style={{ flex: 1 }}>
                    <p className="settings-row-title">{g.name}</p>
                    <p className="settings-row-subtitle">{g.email}</p>
                    <p className="settings-row-subtitle" style={{ marginTop: 2 }}>
                      {g.propertyIds.length} {g.propertyIds.length === 1 ? 'propiedad' : 'propiedades'} ·{' '}
                      <span style={{ color: g.permisos === 'gestion' ? '#16a34a' : '#555' }}>
                        {g.permisos === 'gestion' ? 'Gestión completa' : 'Solo lectura'}
                      </span>
                    </p>
                  </div>
                  <button
                    onClick={() => handleRevoke(g.email)}
                    disabled={revokingEmail === g.email}
                    style={{
                      background: 'none', border: '1px solid #ffcdd2', borderRadius: '8px',
                      color: '#c0392b', fontSize: '12px', fontWeight: 600, padding: '5px 10px',
                      cursor: 'pointer', flexShrink: 0, marginTop: 2,
                      opacity: revokingEmail === g.email ? 0.5 : 1,
                    }}
                  >
                    {revokingEmail === g.email ? 'Revocando…' : 'Revocar'}
                  </button>
                </div>
              ))
            )}

            {/* Separador */}
            {gestores.length > 0 && <div style={{ height: 1, background: '#f0f0f0', margin: '0 16px' }} />}

            {/* Botón invitar */}
            <button
              className="settings-card-row"
              style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              onClick={() => { setShowInviteModal(true); setInviteError(''); setInviteSent(false); }}
            >
              <div className="settings-row-icon" style={{ background: '#111' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="9" cy="7" r="4" stroke="white" strokeWidth="2"/>
                  <line x1="19" y1="8" x2="19" y2="14" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="16" y1="11" x2="22" y2="11" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="settings-row-content">
                <p className="settings-row-title">Invitar gestor</p>
                <p className="settings-row-subtitle">Da acceso a alguien de confianza</p>
              </div>
              <svg className="settings-row-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* ════════════════════════════════════════
            SECCIÓN 3 — Plan
        ════════════════════════════════════════ */}
        <div>
          <p className="settings-section-label">Plan</p>
          <div className="settings-card">
            <div className="settings-card-row" style={{ alignItems: 'flex-start', paddingBottom: plan === 'pro' ? 14 : 10 }}>
              <div className="settings-row-icon" style={{ background: plan === 'pro' ? '#111' : '#f0f0f0' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" stroke={plan === 'pro' ? 'white' : '#555'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="settings-row-content">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <p className="settings-row-title">{plan === 'pro' ? 'Plan Pro' : 'Plan Gratuito'}</p>
                  <span className={`settings-plan-badge ${plan}`}>
                    {plan === 'pro' ? 'PRO' : 'FREE'}
                  </span>
                </div>
                {plan === 'pro' && (
                  <p className="settings-row-subtitle">Plan Pro activo · Sin límites</p>
                )}
              </div>
            </div>

            {plan === 'free' && (
              <>
                <div className="settings-plan-limits">
                  <div className="settings-plan-limit-row">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="#aaa" strokeWidth="2"/>
                      <path d="M12 8v4M12 16h.01" stroke="#aaa" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    Máximo 1 propiedad
                  </div>
                  <div className="settings-plan-limit-row">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="#aaa" strokeWidth="2"/>
                      <path d="M12 8v4M12 16h.01" stroke="#aaa" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    Funciones avanzadas no disponibles
                  </div>
                </div>
                <button className="settings-upgrade-btn">
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="white"/>
                    </svg>
                    Mejorar a Pro
                  </span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* ════════════════════════════════════════
            SECCIÓN 4 — Seguridad
        ════════════════════════════════════════ */}
        <div>
          <p className="settings-section-label">Seguridad</p>
          <div className="settings-card">
            <button
              className="settings-card-row"
              style={{ width: '100%', background: 'none', border: 'none', cursor: passwordSent ? 'default' : 'pointer', textAlign: 'left' }}
              onClick={!passwordSent ? handlePasswordReset : undefined}
              disabled={passwordSending}
            >
              <div className="settings-row-icon" style={{ background: '#f0f0f0' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="11" width="18" height="11" rx="2" stroke="#555" strokeWidth="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#555" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="settings-row-content">
                <p className="settings-row-title">Cambiar contraseña</p>
                <p className="settings-row-subtitle">Recibirás un enlace en tu email</p>
              </div>
              {passwordSending ? (
                <div className="settings-spinner" style={{ borderColor: 'rgba(0,0,0,0.15)', borderTopColor: '#333' }} />
              ) : (
                <svg className="settings-row-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              )}
            </button>
            {passwordSent && (
              <div className="settings-confirm-msg">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17l-5-5" stroke="#27ae60" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Correo enviado a {userEmail}
              </div>
            )}
          </div>
        </div>

        {/* ════════════════════════════════════════
            SECCIÓN 5 — Tutoriales
        ════════════════════════════════════════ */}
        <div>
          <p className="settings-section-label">Tutoriales</p>
          <div className="settings-card">
            <div className="settings-card-row settings-role-disabled">
              <div className="settings-row-icon" style={{ background: '#f0f0f0' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="#aaa" strokeWidth="2"/>
                  <polygon points="10 8 16 12 10 16 10 8" stroke="#aaa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="#aaa"/>
                </svg>
              </div>
              <div className="settings-row-content">
                <p className="settings-row-title" style={{ color: '#aaa' }}>Vídeos de ayuda</p>
                <p className="settings-row-subtitle">Guías paso a paso para empezar</p>
              </div>
              <span className="settings-row-badge">Próximamente</span>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════
            SECCIÓN 6 — Contacto
        ════════════════════════════════════════ */}
        <div>
          <p className="settings-section-label">Contacto y soporte</p>
          <div className="settings-card">
            <div className="settings-card-row">
              <div className="settings-row-icon" style={{ background: '#f0f0f0' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <polyline points="22,6 12,13 2,6" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="settings-row-content">
                <p className="settings-row-title">Email de soporte</p>
                <p className="settings-row-subtitle">soporte@trydomio.com</p>
              </div>
            </div>
            <a
              href="mailto:soporte@trydomio.com"
              style={{ textDecoration: 'none' }}
            >
              <div className="settings-card-row" style={{ cursor: 'pointer' }}>
                <div className="settings-row-icon" style={{ background: '#f0f0f0' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="settings-row-content">
                  <p className="settings-row-title">Enviar mensaje</p>
                </div>
                <svg className="settings-row-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
            </a>
          </div>
        </div>

        {/* ════════════════════════════════════════
            SEPARADOR
        ════════════════════════════════════════ */}
        <div style={{ height: 1, background: '#e5e5e5', margin: '0 4px' }} />

        {/* ════════════════════════════════════════
            SECCIÓN 7 — Cerrar sesión
            SECCIÓN 8 — Eliminar cuenta
        ════════════════════════════════════════ */}
        <div className="settings-danger-section">
          <button className="settings-logout-btn" onClick={onLogout}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="#ff3b30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="16 17 21 12 16 7" stroke="#ff3b30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="21" y1="12" x2="9" y2="12" stroke="#ff3b30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Cerrar sesión
          </button>

          <button className="settings-delete-btn" onClick={() => setShowDeleteModal(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <polyline points="3 6 5 6 21 6" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M10 11v6M14 11v6" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Eliminar cuenta
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════
          MODAL — Invitar gestor
      ════════════════════════════════════════ */}
      {showInviteModal && (
        <div className="settings-modal-overlay" onClick={() => !inviteSending && setShowInviteModal(false)}>
          <div className="settings-modal" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <p className="settings-modal-title">Invitar gestor</p>

            {inviteSent ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p style={{ margin: 0, fontWeight: 700, color: '#111' }}>Invitación enviada</p>
                <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#888' }}>Se ha notificado a {inviteEmail}</p>
              </div>
            ) : (
              <>
                {/* Email */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#555', display: 'block', marginBottom: 5 }}>Email del gestor</label>
                  <input
                    className="settings-modal-input"
                    type="email"
                    placeholder="gestor@ejemplo.com"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    disabled={inviteSending}
                  />
                </div>

                {/* Nombre */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#555', display: 'block', marginBottom: 5 }}>Nombre del gestor</label>
                  <input
                    className="settings-modal-input"
                    type="text"
                    placeholder="Nombre completo"
                    value={inviteName}
                    onChange={e => setInviteName(e.target.value)}
                    disabled={inviteSending}
                  />
                </div>

                {/* Propiedades */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#555', display: 'block', marginBottom: 8 }}>Propiedades con acceso</label>
                  {ownerProperties.length === 0 ? (
                    <p style={{ fontSize: '13px', color: '#aaa', margin: 0 }}>No tienes propiedades aún.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {ownerProperties.map(prop => {
                        const checked = invitePropertyIds.has(prop.id);
                        return (
                          <button
                            key={prop.id}
                            type="button"
                            onClick={() => {
                              const next = new Set(invitePropertyIds);
                              if (checked) next.delete(prop.id); else next.add(prop.id);
                              setInvitePropertyIds(next);
                            }}
                            disabled={inviteSending}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              background: checked ? '#f0f0f0' : 'white',
                              border: `1px solid ${checked ? '#ccc' : '#e5e5e5'}`,
                              borderRadius: 10, padding: '9px 12px', cursor: 'pointer', textAlign: 'left',
                            }}
                          >
                            <div style={{
                              width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                              border: `2px solid ${checked ? '#111' : '#ccc'}`,
                              background: checked ? '#111' : 'white',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {checked && (
                                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                  <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </div>
                            <span style={{ fontSize: '13px', fontWeight: 500, color: '#111' }}>{prop.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Permisos */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#555', display: 'block', marginBottom: 8 }}>Permisos</label>
                  <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e5e5' }}>
                    {[
                      { value: 'lectura', label: 'Solo lectura' },
                      { value: 'gestion', label: 'Gestión completa' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setInvitePermission(opt.value)}
                        disabled={inviteSending}
                        style={{
                          flex: 1, padding: '10px 4px', border: 'none', cursor: 'pointer',
                          fontSize: '12px', fontWeight: 600,
                          background: invitePermission === opt.value ? '#111' : 'white',
                          color: invitePermission === opt.value ? 'white' : '#555',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {inviteError && (
                  <p style={{ color: '#c0392b', fontSize: '13px', margin: '0 0 12px', textAlign: 'center' }}>{inviteError}</p>
                )}

                <button
                  className="settings-modal-btn-primary"
                  onClick={handleInvite}
                  disabled={inviteSending || ownerProperties.length === 0}
                >
                  {inviteSending ? (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <div className="settings-spinner" />
                      Enviando…
                    </span>
                  ) : 'Enviar invitación'}
                </button>
                {!inviteSending && (
                  <button className="settings-modal-btn-cancel" onClick={() => setShowInviteModal(false)}>
                    Cancelar
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          MODAL — Cambiar a inquilino
      ════════════════════════════════════════ */}
      {showRoleModal && (
        <div className="settings-modal-overlay" onClick={() => setShowRoleModal(false)}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <p className="settings-modal-title">Cambiar a inquilino</p>
            <p className="settings-modal-desc">
              Serás redirigido a la pantalla de entrada de código.
              Introduce el código de 6 caracteres que te ha proporcionado tu propietario.
            </p>
            <button
              className="settings-modal-btn-primary"
              onClick={() => { setShowRoleModal(false); onSwitchRole(); }}
            >
              Continuar
            </button>
            <button
              className="settings-modal-btn-cancel"
              onClick={() => setShowRoleModal(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          MODAL — Eliminar cuenta
      ════════════════════════════════════════ */}
      {showDeleteModal && (
        <div className="settings-modal-overlay" onClick={() => !deleting && setShowDeleteModal(false)}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <p className="settings-modal-title">Eliminar cuenta</p>
            <p className="settings-modal-desc">
              Esta acción es <strong>irreversible</strong>. Se eliminarán todas tus propiedades,
              inquilinos, pagos e incidencias. Para confirmar, escribe <strong>ELIMINAR</strong> a continuación.
            </p>
            <input
              className="settings-modal-input delete-input"
              type="text"
              placeholder="Escribe ELIMINAR"
              value={deleteText}
              onChange={e => setDeleteText(e.target.value)}
              disabled={deleting}
            />
            <button
              className="settings-modal-btn-primary danger"
              onClick={handleDeleteAccount}
              disabled={deleteText !== 'ELIMINAR' || deleting}
            >
              {deleting ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <div className="settings-spinner" />
                  Eliminando…
                </span>
              ) : 'Eliminar cuenta definitivamente'}
            </button>
            {!deleting && (
              <button
                className="settings-modal-btn-cancel"
                onClick={() => { setShowDeleteModal(false); setDeleteText(''); }}
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
