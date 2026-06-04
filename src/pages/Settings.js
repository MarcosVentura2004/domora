import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { saveFile, getFile } from '../utils/fileStorage';
import './Settings.css';

async function sendGestorInviteEmail({ gestorEmail, gestorName, landlordName, propertyCount, inviteToken }, supabaseClient) {
  const { error } = await supabaseClient.functions.invoke('send-gestor-invite', {
    body: { gestorEmail, gestorName, landlordName, propertyCount, inviteToken },
  });
  if (error) console.warn('[send-gestor-invite] Error:', error);
}

function formatPhone(raw) {
  const digits = (raw || '').replace(/\D/g, '').slice(0, 9);
  return digits.match(/.{1,3}/g)?.join(' ') ?? '';
}

export default function Settings({ userEmail, onLogout, onSwitchRole, onBack, role = 'landlord' }) {
  // ── Perfil ──────────────────────────────────────────────
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileEmail, setProfileEmail] = useState(userEmail || '');
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
  const [showCreateLandlordModal, setShowCreateLandlordModal] = useState(false);
  const [creatingLandlord, setCreatingLandlord] = useState(false);

  // ── Seguridad ────────────────────────────────────────────
  const [passwordSending, setPasswordSending] = useState(false);
  const [passwordSent, setPasswordSent] = useState(false);

  // ── Eliminar cuenta ──────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);

  // ── Sugerencias ──────────────────────────────────────────
  const [showSuggestionModal, setShowSuggestionModal] = useState(false);
  const [suggestionText, setSuggestionText] = useState('');
  const [suggestionSending, setSuggestionSending] = useState(false);
  const [suggestionSent, setSuggestionSent] = useState(false);

  // ── Gestores ─────────────────────────────────────────────
  const [gestores, setGestores] = useState([]);
  const [ownerProperties, setOwnerProperties] = useState([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [invitePropertyIds, setInvitePropertyIds] = useState(new Set());
  const [invitePermission, setInvitePermission] = useState('lectura');
  const [inviteCanMessage, setInviteCanMessage] = useState(true);
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSent, setInviteSent] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const [revokingEmail, setRevokingEmail] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [showConfigureModal, setShowConfigureModal] = useState(false);
  const [configureTarget, setConfigureTarget] = useState(null); // { email, name }
  const [configurePropIds, setConfigurePropIds] = useState(new Set());
  const [configurePermission, setConfigurePermission] = useState('lectura');
  const [configureCanMessage, setConfigureCanMessage] = useState(true);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState('');

  // ── Carga gestores ────────────────────────────────────────
  const loadGestores = async () => {
    const { data: propsData } = await supabase
      .from('properties')
      .select('id, data')
      .eq('landlord_email', userEmail);
    setOwnerProperties((propsData || []).map(r => ({ id: r.id, name: r.data?.name || r.id })));

    const { data: accessRows } = await supabase
      .from('property_access')
      .select('gestor_email, property_id, permisos, can_message')
      .eq('landlord_email', userEmail);

    if (!accessRows || accessRows.length === 0) {
      setGestores([]);
    } else {
      const emails = [...new Set(accessRows.map(r => r.gestor_email))];
      const { data: gestorRows } = await supabase
        .from('gestores')
        .select('email, nombre')
        .in('email', emails);
      const nameMap = Object.fromEntries((gestorRows || []).map(g => [g.email, g.nombre]));
      const grouped = emails.map(email => {
        const firstRow = accessRows.find(r => r.gestor_email === email);
        return {
          email,
          name: nameMap[email] || email,
          permisos: firstRow?.permisos || 'lectura',
          canMessage: firstRow?.can_message !== false,
          propertyIds: accessRows.filter(r => r.gestor_email === email).map(r => r.property_id),
        };
      });
      setGestores(grouped);
    }

    // Solicitudes pendientes de gestores que compartieron enlace
    const { data: requestRows } = await supabase
      .from('gestor_requests')
      .select('gestor_email')
      .eq('landlord_email', userEmail)
      .eq('status', 'pending');

    if (!requestRows || requestRows.length === 0) {
      setPendingRequests([]);
      return;
    }

    const requestEmails = requestRows.map(r => r.gestor_email);
    const { data: requestGestorRows } = await supabase
      .from('gestores')
      .select('email, nombre')
      .in('email', requestEmails);
    const requestNameMap = Object.fromEntries(
      (requestGestorRows || []).map(g => [g.email, g.nombre])
    );
    const uniqueRequestEmails = [...new Set(requestRows.map(r => r.gestor_email))];
    setPendingRequests(uniqueRequestEmails.map(email => ({
      email,
      name: requestNameMap[email] || email,
    })));
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
      await supabase.from('gestores').upsert(
        { email: inviteEmail.trim().toLowerCase(), nombre: inviteName.trim() },
        { onConflict: 'email' }
      );

      const rows = [...invitePropertyIds].map(pid => ({
        gestor_email: inviteEmail.trim().toLowerCase(),
        landlord_email: userEmail,
        property_id: pid,
        permisos: invitePermission,
        can_message: inviteCanMessage,
      }));
      await supabase.from('property_access').upsert(rows, { onConflict: 'gestor_email,property_id' });

      const landlordRow = await supabase.from('landlords').select('name').eq('email', userEmail).single();
      const landlordName = landlordRow?.data?.name || userEmail;

      // Generar token de invitación y guardarlo en gestor_invites
      const inviteToken = crypto.randomUUID();
      setInviteLink(`https://trydomio.com/gestor-invite?token=${inviteToken}`);
      const { error: insertError } = await supabase.from('gestor_invites').insert({
        token: inviteToken,
        landlord_email: userEmail,
        gestor_email: inviteEmail.trim().toLowerCase(),
        landlord_name: landlordName,
        property_count: invitePropertyIds.size,
        status: 'pending',
      });

      if (insertError) {
        console.error('[gestor_invites] Error guardando invitacion:', insertError);
        setInviteError('No se pudo guardar la invitacion. Verifica los permisos de la tabla gestor_invites.');
        return;
      }

      await sendGestorInviteEmail({
        gestorEmail: inviteEmail.trim().toLowerCase(),
        gestorName: inviteName.trim(),
        landlordName,
        propertyCount: invitePropertyIds.size,
        inviteToken,
      }, supabase);

      setInviteSent(true);
      setTimeout(() => {
        setShowInviteModal(false);
        setInviteEmail('');
        setInviteName('');
        setInvitePropertyIds(new Set());
        setInvitePermission('lectura');
        setInviteCanMessage(true);
        setInviteSent(false);
        setInviteLink('');
        setInviteLinkCopied(false);
        loadGestores();
      }, 1800);
    } catch (err) {
      setInviteError('Error al enviar la invitacion. Intentalo de nuevo.');
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

  const handleConfirmPending = async () => {
    if (!configureTarget || configurePropIds.size === 0) return;
    setConfigLoading(true);
    setConfigError('');
    const rows = [...configurePropIds].map(pid => ({
      gestor_email: configureTarget.email,
      landlord_email: userEmail,
      property_id: pid,
      permisos: configurePermission,
      can_message: configureCanMessage,
    }));
    const { error: upsertError } = await supabase
      .from('property_access')
      .upsert(rows, { onConflict: 'gestor_email,property_id' });
    if (upsertError) {
      setConfigLoading(false);
      setConfigError('No se pudo guardar el acceso. Intentalo de nuevo.');
      return;
    }
    const { error: updateError } = await supabase
      .from('gestor_requests')
      .update({ status: 'accepted' })
      .eq('gestor_email', configureTarget.email)
      .eq('landlord_email', userEmail);
    if (updateError) {
      setConfigLoading(false);
      setConfigError('Acceso concedido, pero hubo un error al actualizar el estado. Recarga la pagina.');
      return;
    }
    setConfigLoading(false);
    setShowConfigureModal(false);
    setConfigureTarget(null);
    setConfigurePropIds(new Set());
    setConfigurePermission('lectura');
    setConfigureCanMessage(true);
    setConfigError('');
    loadGestores();
  };

  // ── Handler cambio a propietario ──────────────────────────
  const handleSwitchToLandlord = async () => {
    const { data } = await supabase
      .from('landlords')
      .select('email')
      .eq('email', userEmail)
      .single();
    if (data) {
      onSwitchRole('landlord');
    } else {
      setShowCreateLandlordModal(true);
    }
  };

  const handleCreateLandlordAccount = async () => {
    setCreatingLandlord(true);
    await supabase.from('landlords').insert({
      email: userEmail,
      name: profileName || userEmail,
      plan: 'free',
    });
    setCreatingLandlord(false);
    setShowCreateLandlordModal(false);
    onSwitchRole('landlord');
  };

  // ── Carga inicial ─────────────────────────────────────────
  useEffect(() => {
    if (role === 'landlord') loadGestores();
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.user_metadata) {
        setProfileName(user.user_metadata.name || '');
        setProfilePhone(formatPhone(user.user_metadata.phone || ''));
      }

      if (role === 'gestor') {
        const { data: gestor } = await supabase
          .from('gestores')
          .select('nombre')
          .eq('email', userEmail)
          .maybeSingle();
        if (gestor?.nombre) setProfileName(gestor.nombre);
      } else if (role === 'landlord') {
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
      }

      const localAvatar = await getFile(`avatar_${userEmail}`).catch(() => null);
      if (localAvatar) {
        setAvatarSrc(localAvatar);
      } else {
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
  }, [userEmail]); // eslint-disable-line

  // ── Handlers ──────────────────────────────────────────────
  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setPhotoUploading(true);

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = ev => resolve(ev.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    await saveFile(`avatar_${userEmail}`, dataUrl).catch(() => {});
    setAvatarSrc(dataUrl);

    const { error } = await supabase.storage
      .from('avatars')
      .upload(`${userEmail}/avatar`, file, { upsert: true, contentType: file.type });

    if (error) {
      console.warn('Supabase Storage no disponible, avatar guardado solo en local:', error.message);
    } else {
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(`${userEmail}/avatar`);
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

    const updatePayload = { data: { name: profileName.trim(), phone: profilePhone.trim() } };
    if (emailChanged) updatePayload.email = emailTrimmed;
    await supabase.auth.updateUser(updatePayload);

    if (role === 'gestor') {
      await supabase.from('gestores').upsert(
        { email: userEmail, nombre: profileName.trim() },
        { onConflict: 'email' }
      );
    } else {
      await supabase.from('landlords').upsert(
        { email: userEmail, name: profileName.trim(), phone: profilePhone.trim() },
        { onConflict: 'email' }
      );
    }

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
    await supabase.auth.resetPasswordForEmail(userEmail, {
      redirectTo: 'https://trydomio.com/reset-password',
    });
    setPasswordSending(false);
    setPasswordSent(true);
  };

  const handleSendSuggestion = async () => {
    if (!suggestionText.trim()) return;
    setSuggestionSending(true);
    await supabase.from('suggestions').insert({
      user_email: userEmail,
      text: suggestionText.trim(),
    });
    setSuggestionSending(false);
    setSuggestionSent(true);
  };

  const handleDeleteAccount = async () => {
    if (deleteText !== 'ELIMINAR' || deleting) return;
    setDeleting(true);
    try {
      await supabase.from('properties').delete().eq('landlord_email', userEmail);
      await supabase.from('messages').delete().eq('landlord_email', userEmail);
      await supabase.from('payments').delete().eq('landlord_email', userEmail);
      await supabase.from('incidents').delete().eq('landlord_email', userEmail);
      await supabase.from('landlords').delete().eq('email', userEmail);
      await supabase.rpc('delete_user_account').catch(() => null);
    } catch (err) {
      console.error('Error eliminando cuenta:', err);
    }
    await supabase.auth.signOut();
    onLogout();
  };

  // ── Calculo de iniciales para avatar ─────────────────────
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
            SECCION 1 — Perfil
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
                <label className="settings-input-label">Correo electronico</label>
                <input
                  className="settings-input"
                  type="email"
                  placeholder="tu@email.com"
                  value={profileEmail}
                  onChange={e => { setProfileEmail(e.target.value); setEmailChangeSent(false); }}
                />
                {profileEmail.trim().toLowerCase() !== userEmail && profileEmail.trim() && (
                  <p style={{ margin: '5px 0 0', fontSize: '12px', color: '#8e8e93', lineHeight: 1.4 }}>
                    Se enviara un enlace de verificacion al nuevo correo para confirmar el cambio.
                  </p>
                )}
              </div>
              <div>
                <label className="settings-input-label">Telefono</label>
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
                Enlace de verificacion enviado a {profileEmail.trim()}. Confirma el cambio desde tu nuevo correo.
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
            SECCION 2 — Cambiar rol (todos los roles)
        ════════════════════════════════════════ */}
        <div>
          <p className="settings-section-label">Rol</p>
          <div className="settings-card">
            {/* Propietario */}
            {role === 'landlord' ? (
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
            ) : (
              <button
                className="settings-card-row"
                style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                onClick={handleSwitchToLandlord}
              >
                <div className="settings-row-icon" style={{ background: '#f0f0f0' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M9 21V12h6v9" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="settings-row-content">
                  <p className="settings-row-title">Propietario</p>
                  <p className="settings-row-subtitle">Gestiona tus propiedades</p>
                </div>
                <svg className="settings-row-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            )}

            {/* Inquilino */}
            {role === 'tenant' ? (
              <div className="settings-card-row">
                <div className="settings-row-icon" style={{ background: '#f0f0f0' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="12" cy="7" r="4" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="settings-row-content">
                  <p className="settings-row-title">Inquilino</p>
                  <p className="settings-row-subtitle">Rol actual</p>
                </div>
                <svg className="settings-row-check" width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17l-5-5" stroke="#34c759" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            ) : (
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
                  <p className="settings-row-subtitle">Introduce tu codigo de acceso</p>
                </div>
                <svg className="settings-row-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* ════════════════════════════════════════
            SECCION 2b — Gestores (solo propietario)
        ════════════════════════════════════════ */}
        {role === 'landlord' && <div>
          <p className="settings-section-label">Gestores</p>
          <div className="settings-card">

            {pendingRequests.map(req => (
              <div key={req.email} className="settings-card-row" style={{ alignItems: 'flex-start' }}>
                <div className="settings-row-icon" style={{ background: '#fff7ed' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="12" cy="7" r="4" stroke="#ea580c" strokeWidth="2"/>
                  </svg>
                </div>
                <div className="settings-row-content" style={{ flex: 1 }}>
                  <p className="settings-row-title">{req.name}</p>
                  <p className="settings-row-subtitle">{req.email}</p>
                  <span style={{
                    display: 'inline-block', marginTop: 3,
                    background: '#fff7ed', color: '#ea580c',
                    fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                    border: '1px solid #fed7aa',
                  }}>
                    Pendiente
                  </span>
                </div>
                <button
                  onClick={() => {
                    setConfigureTarget(req);
                    setConfigurePropIds(new Set());
                    setConfigurePermission('lectura');
                    setConfigureCanMessage(true);
                    setConfigError('');
                    setShowConfigureModal(true);
                  }}
                  style={{
                    background: '#111', border: 'none', borderRadius: 8,
                    color: 'white', fontSize: 12, fontWeight: 600,
                    padding: '5px 12px', cursor: 'pointer', flexShrink: 0, marginTop: 2,
                  }}
                >
                  Configurar
                </button>
              </div>
            ))}
            {pendingRequests.length > 0 && gestores.length > 0 && (
              <div style={{ height: 1, background: '#f0f0f0', margin: '0 16px' }} />
            )}

            {gestores.length === 0 && pendingRequests.length === 0 ? (
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
                        {g.permisos === 'gestion' ? 'Gestion completa' : 'Solo lectura'}
                      </span>
                      {' · '}
                      <span style={{ color: g.canMessage ? '#16a34a' : '#e74c3c' }}>
                        Mensajes: {g.canMessage ? 'Si' : 'No'}
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

            {gestores.length > 0 && <div style={{ height: 1, background: '#f0f0f0', margin: '0 16px' }} />}

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
        </div>}

        {/* ════════════════════════════════════════
            SECCION 3 — Plan (propietario y gestor)
        ════════════════════════════════════════ */}
        {role !== 'tenant' && <div>
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
                  <p className="settings-row-title">{plan === 'pro' ? 'Plan Pro' : 'Plan Standard'}</p>
                  {plan === 'pro' && (
                    <span className="settings-plan-badge pro">PRO</span>
                  )}
                </div>
                {plan === 'pro' && (
                  <p className="settings-row-subtitle">Plan Pro activo · Sin limites</p>
                )}
              </div>
            </div>

            {plan === 'free' && (
              <button
                className="settings-save-btn"
                onClick={() => window.open('https://trydomio.com/planes', '_blank')}
              >
                Ver planes
              </button>
            )}
          </div>
        </div>}

        {/* ════════════════════════════════════════
            SECCION 4 — Seguridad
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
                <p className="settings-row-title">Cambiar contrasena</p>
                <p className="settings-row-subtitle">Recibiras un enlace en tu email</p>
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
            SECCION 5 — Tutoriales
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
                <p className="settings-row-title" style={{ color: '#aaa' }}>Videos de ayuda</p>
                <p className="settings-row-subtitle">Guias paso a paso para empezar</p>
              </div>
              <span className="settings-row-badge">Proximamente</span>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════
            SECCION 5b — Sugerencias
        ════════════════════════════════════════ */}
        <div>
          <p className="settings-section-label">Sugerencias</p>
          <div className="settings-card">
            <button
              className="settings-card-row"
              style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              onClick={() => { setShowSuggestionModal(true); setSuggestionText(''); setSuggestionSent(false); }}
            >
              <div className="settings-row-icon" style={{ background: '#f0f0f0' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="settings-row-content">
                <p className="settings-row-title">Enviar sugerencia</p>
                <p className="settings-row-subtitle">Cuentanos que podemos mejorar</p>
              </div>
              <svg className="settings-row-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* ════════════════════════════════════════
            SECCION 6 — Contacto
        ════════════════════════════════════════ */}
        <div>
          <p className="settings-section-label">Contacto y soporte</p>
          <div className="settings-card">
            <a href="mailto:domioapp.sl@gmail.com" style={{ textDecoration: 'none' }}>
              <div className="settings-card-row" style={{ cursor: 'pointer' }}>
                <div className="settings-row-icon" style={{ background: '#f0f0f0' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="22,6 12,13 2,6" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="settings-row-content">
                  <p className="settings-row-title">Email de soporte</p>
                  <p className="settings-row-subtitle">domioapp.sl@gmail.com</p>
                </div>
                <svg className="settings-row-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
            </a>
            <a href="https://wa.me/34626280539?text=Hola%2C%20necesito%20ayuda%20con%20Domio" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
              <div className="settings-card-row" style={{ cursor: 'pointer' }}>
                <div className="settings-row-icon" style={{ background: '#f0f0f0' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="settings-row-content">
                  <p className="settings-row-title">Enviar mensaje</p>
                  <p className="settings-row-subtitle">Escribenos por WhatsApp</p>
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
            SECCION 7 — Cerrar sesion
            SECCION 8 — Eliminar cuenta
        ════════════════════════════════════════ */}
        <div className="settings-danger-section">
          <button className="settings-logout-btn" onClick={onLogout}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="#ff3b30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="16 17 21 12 16 7" stroke="#ff3b30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="21" y1="12" x2="9" y2="12" stroke="#ff3b30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Cerrar sesion
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
                <p style={{ margin: 0, fontWeight: 700, color: '#111' }}>Invitacion enviada</p>
                <p style={{ margin: '6px 0 16px', fontSize: '13px', color: '#888' }}>Email enviado a {inviteEmail}</p>
                {inviteLink && (
                  <>
                    <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#555', textAlign: 'left' }}>
                      También puedes enviarle el enlace directamente:
                    </p>
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText(inviteLink).catch(() => {});
                        setInviteLinkCopied(true);
                        setTimeout(() => setInviteLinkCopied(false), 2000);
                      }}
                      style={{
                        width: '100%', padding: '13px', borderRadius: 12, marginBottom: 8,
                        background: inviteLinkCopied ? '#16a34a' : '#111',
                        color: 'white', border: 'none', fontSize: '14px', fontWeight: 600,
                        cursor: 'pointer', transition: 'background 0.2s',
                      }}
                    >
                      {inviteLinkCopied ? 'Enlace copiado' : 'Copiar enlace'}
                    </button>
                    <button
                      onClick={() => {
                        const msg = encodeURIComponent(`Hola, te invito a gestionar mis propiedades en Domio. Acepta aqui: ${inviteLink}`);
                        window.open(`https://wa.me/?text=${msg}`, '_blank', 'noopener');
                      }}
                      style={{
                        width: '100%', padding: '13px', borderRadius: 12, marginBottom: 8,
                        background: '#25D366', color: 'white',
                        border: 'none', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                        <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.857L.057 23.882a.5.5 0 0 0 .615.612l6.162-1.51A11.94 11.94 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.9 0-3.7-.504-5.25-1.385l-.372-.217-3.865.947.982-3.773-.237-.389A9.961 9.961 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                      </svg>
                      Enviar por WhatsApp
                    </button>
                    {typeof navigator.share === 'function' && (
                      <button
                        onClick={() => {
                          navigator.share({ title: 'Invitacion a Domio', url: inviteLink }).catch(() => {});
                        }}
                        style={{
                          width: '100%', padding: '13px', borderRadius: 12,
                          background: 'white', color: '#111',
                          border: '1px solid #e5e5e5',
                          fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        Compartir
                      </button>
                    )}
                  </>
                )}
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
                    <p style={{ fontSize: '13px', color: '#aaa', margin: 0 }}>No tienes propiedades aun.</p>
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
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#555', display: 'block', marginBottom: 8 }}>Permisos</label>
                  <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e5e5' }}>
                    {[
                      { value: 'lectura', label: 'Solo lectura' },
                      { value: 'gestion', label: 'Gestion completa' },
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

                {/* Puede ver mensajes */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#555', display: 'block', marginBottom: 8 }}>Puede ver mensajes</label>
                  <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e5e5' }}>
                    {[
                      { value: true, label: 'Si' },
                      { value: false, label: 'No' },
                    ].map(opt => (
                      <button
                        key={String(opt.value)}
                        type="button"
                        onClick={() => setInviteCanMessage(opt.value)}
                        disabled={inviteSending}
                        style={{
                          flex: 1, padding: '10px 4px', border: 'none', cursor: 'pointer',
                          fontSize: '12px', fontWeight: 600,
                          background: inviteCanMessage === opt.value ? '#111' : 'white',
                          color: inviteCanMessage === opt.value ? 'white' : '#555',
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
                  ) : 'Enviar invitacion'}
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
          MODAL — Configurar solicitud pendiente
      ════════════════════════════════════════ */}
      {showConfigureModal && configureTarget && (
        <div
          className="settings-modal-overlay"
          onClick={() => !configLoading && setShowConfigureModal(false)}
        >
          <div
            className="settings-modal"
            onClick={e => e.stopPropagation()}
            style={{ maxHeight: '90vh', overflowY: 'auto' }}
          >
            <p className="settings-modal-title">Dar acceso a {configureTarget.name}</p>

            {configError && (
              <p style={{ color: '#c0392b', fontSize: '13px', margin: '0 0 12px', textAlign: 'center' }}>{configError}</p>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#555', display: 'block', marginBottom: 8 }}>Propiedades con acceso</label>
              {ownerProperties.length === 0 ? (
                <p style={{ fontSize: '13px', color: '#aaa', margin: 0 }}>No tienes propiedades aun.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {ownerProperties.map(prop => {
                    const checked = configurePropIds.has(prop.id);
                    return (
                      <button
                        key={prop.id}
                        type="button"
                        onClick={() => {
                          const next = new Set(configurePropIds);
                          if (checked) next.delete(prop.id); else next.add(prop.id);
                          setConfigurePropIds(next);
                        }}
                        disabled={configLoading}
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

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#555', display: 'block', marginBottom: 8 }}>Permisos</label>
              <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e5e5' }}>
                {[{ value: 'lectura', label: 'Solo lectura' }, { value: 'gestion', label: 'Gestión completa' }].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setConfigurePermission(opt.value)}
                    disabled={configLoading}
                    style={{
                      flex: 1, padding: '10px 4px', border: 'none', cursor: 'pointer',
                      fontSize: '12px', fontWeight: 600,
                      background: configurePermission === opt.value ? '#111' : 'white',
                      color: configurePermission === opt.value ? 'white' : '#555',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#555', display: 'block', marginBottom: 8 }}>Puede ver mensajes</label>
              <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e5e5' }}>
                {[{ value: true, label: 'Sí' }, { value: false, label: 'No' }].map(opt => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => setConfigureCanMessage(opt.value)}
                    disabled={configLoading}
                    style={{
                      flex: 1, padding: '10px 4px', border: 'none', cursor: 'pointer',
                      fontSize: '12px', fontWeight: 600,
                      background: configureCanMessage === opt.value ? '#111' : 'white',
                      color: configureCanMessage === opt.value ? 'white' : '#555',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              className="settings-modal-btn-primary"
              onClick={handleConfirmPending}
              disabled={configLoading || configurePropIds.size === 0 || ownerProperties.length === 0}
            >
              {configLoading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <div className="settings-spinner" />
                  Guardando…
                </span>
              ) : 'Dar acceso'}
            </button>
            {!configLoading && (
              <button
                className="settings-modal-btn-cancel"
                onClick={() => setShowConfigureModal(false)}
              >
                Cancelar
              </button>
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
              Seras redirigido a la pantalla de entrada de codigo.
              Introduce el codigo de 6 caracteres que te ha proporcionado tu propietario.
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
          MODAL — Crear cuenta de propietario
      ════════════════════════════════════════ */}
      {showCreateLandlordModal && (
        <div className="settings-modal-overlay" onClick={() => !creatingLandlord && setShowCreateLandlordModal(false)}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <p className="settings-modal-title">Crear cuenta de propietario</p>
            <p className="settings-modal-desc">
              No tienes cuenta de propietario. Quieres crear una ahora?
            </p>
            <button
              className="settings-modal-btn-primary"
              onClick={handleCreateLandlordAccount}
              disabled={creatingLandlord}
            >
              {creatingLandlord ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <div className="settings-spinner" />
                  Creando…
                </span>
              ) : 'Crear cuenta'}
            </button>
            {!creatingLandlord && (
              <button
                className="settings-modal-btn-cancel"
                onClick={() => setShowCreateLandlordModal(false)}
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          MODAL — Sugerencias
      ════════════════════════════════════════ */}
      {showSuggestionModal && (
        <div className="settings-modal-overlay" onClick={() => !suggestionSending && setShowSuggestionModal(false)}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <p className="settings-modal-title">Enviar sugerencia</p>

            {suggestionSent ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p style={{ margin: 0, fontWeight: 700, color: '#111' }}>Gracias por tu sugerencia</p>
                <p style={{ margin: '6px 0 20px', fontSize: '13px', color: '#888' }}>La tendremos en cuenta para mejorar Domora.</p>
                <button className="settings-modal-btn-cancel" onClick={() => setShowSuggestionModal(false)}>
                  Cerrar
                </button>
              </div>
            ) : (
              <>
                <p className="settings-modal-desc">
                  Cuentanos que funcionalidad echais en falta, que podria funcionar mejor o cualquier idea que se te ocurra.
                </p>
                <textarea
                  className="settings-modal-input"
                  placeholder="Escribe aqui tu sugerencia..."
                  value={suggestionText}
                  onChange={e => setSuggestionText(e.target.value)}
                  disabled={suggestionSending}
                  rows={5}
                  style={{ resize: 'none', lineHeight: 1.5 }}
                />
                <button
                  className="settings-modal-btn-primary"
                  onClick={handleSendSuggestion}
                  disabled={suggestionSending || !suggestionText.trim()}
                >
                  {suggestionSending ? (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <div className="settings-spinner" />
                      Enviando…
                    </span>
                  ) : 'Enviar sugerencia'}
                </button>
                {!suggestionSending && (
                  <button className="settings-modal-btn-cancel" onClick={() => setShowSuggestionModal(false)}>
                    Cancelar
                  </button>
                )}
              </>
            )}
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
              Esta accion es <strong>irreversible</strong>. Se eliminaran todas tus propiedades,
              inquilinos, pagos e incidencias. Para confirmar, escribe <strong>ELIMINAR</strong> a continuacion.
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

/*
  ── SQL para ejecutar en Supabase SQL Editor ──────────────────────────────────

  Anadir el campo can_message a la tabla property_access:

  ALTER TABLE public.property_access
    ADD COLUMN IF NOT EXISTS can_message boolean NOT NULL DEFAULT true;

  Este campo controla si el gestor puede ver y usar la seccion de Mensajes.
  El valor por defecto es true para mantener compatibilidad con registros existentes.

  Tabla para sugerencias de usuarios:

  CREATE TABLE IF NOT EXISTS public.suggestions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_email text NOT NULL,
    text text NOT NULL,
    created_at timestamptz DEFAULT now()
  );

  ALTER TABLE public.suggestions ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "usuarios pueden insertar sus sugerencias"
    ON public.suggestions FOR INSERT
    WITH CHECK (user_email = auth.jwt() ->> 'email');
*/
