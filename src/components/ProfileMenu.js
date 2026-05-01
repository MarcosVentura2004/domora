import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import './ProfileMenu.css';

function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  return digits.match(/.{1,3}/g)?.join(' ') ?? '';
}

export default function ProfileMenu({ userEmail, role, onSwitchRole, onLogout, onClose }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [showCreateLandlordModal, setShowCreateLandlordModal] = useState(false);
  const [creatingLandlord, setCreatingLandlord] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.user_metadata) {
        setName(user.user_metadata.name || '');
        setPhone(formatPhone(user.user_metadata.phone || ''));
      }
    });
  }, []);

  const initials = (name || userEmail || '?')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const handleSave = async (e) => {
    e.preventDefault();
    await supabase.auth.updateUser({
      data: { name: name.trim(), phone: phone.trim() },
    });
    setEditing(false);
  };

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
      name: name || userEmail,
      plan: 'free',
    });
    setCreatingLandlord(false);
    setShowCreateLandlordModal(false);
    onSwitchRole('landlord');
  };

  return (
    <>
      {/* Overlay transparente para cerrar al tocar fuera */}
      <div className="profile-overlay" onClick={onClose} />

      <div className="profile-panel">
        {/* Cabecera cuenta */}
        <div className="profile-panel-header">
          <div className="profile-avatar">{initials}</div>
          <div className="profile-panel-info">
            <span className="profile-panel-name">{name || 'Mi cuenta'}</span>
            <span className="profile-panel-email">{userEmail}</span>
            {phone && (
              <span className="profile-panel-phone">{phone}</span>
            )}
          </div>
        </div>

        <div className="profile-panel-divider" />

        {/* Editar cuenta */}
        {editing ? (
          <form onSubmit={handleSave} className="profile-edit-form">
            <label className="profile-edit-label">Nombre</label>
            <input
              className="profile-edit-input"
              type="text"
              placeholder="Tu nombre"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
            <label className="profile-edit-label">Teléfono</label>
            <input
              className="profile-edit-input"
              type="tel"
              placeholder="+34 600 000 000"
              value={phone}
              onChange={e => setPhone(formatPhone(e.target.value))}
            />
            <div className="profile-edit-actions">
              <button type="button" className="profile-edit-cancel" onClick={() => setEditing(false)}>
                Cancelar
              </button>
              <button type="submit" className="profile-edit-save">
                Guardar
              </button>
            </div>
          </form>
        ) : (
          <>
            <button className="profile-panel-item" onClick={() => setEditing(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="#444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="#444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Editar cuenta
            </button>

            <button className="profile-panel-item profile-panel-item-disabled" onClick={() => {}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="3" stroke="#aaa" strokeWidth="2"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="#aaa" strokeWidth="2"/>
              </svg>
              <span style={{ color: '#bbb' }}>Ajustes</span>
              <span className="profile-panel-badge">Próximamente</span>
            </button>

            <div className="profile-panel-divider" />

            <button
              className="profile-panel-item"
              onClick={role === 'tenant' ? handleSwitchToLandlord : onSwitchRole}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="#444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="9" cy="7" r="4" stroke="#444" strokeWidth="2"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="#444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="#444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {role === 'landlord' ? 'Cambiar a inquilino' : 'Cambiar a propietario'}
            </button>

            <div className="profile-panel-divider" />

            <button className="profile-panel-item profile-panel-item-danger" onClick={onLogout}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="#d32f2f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <polyline points="16 17 21 12 16 7" stroke="#d32f2f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="21" y1="12" x2="9" y2="12" stroke="#d32f2f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Cerrar sesión
            </button>
          </>
        )}
      </div>

      {/* Modal — Crear cuenta de propietario */}
      {showCreateLandlordModal && (
        <div
          className="profile-overlay"
          style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200 }}
          onClick={() => !creatingLandlord && setShowCreateLandlordModal(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: '20px 20px 0 0',
              padding: '28px 24px 36px',
              width: '100%',
              maxWidth: 480,
            }}
          >
            <p style={{ margin: '0 0 10px', fontSize: '17px', fontWeight: 700, color: '#111' }}>
              Crear cuenta de propietario
            </p>
            <p style={{ margin: '0 0 24px', fontSize: '14px', color: '#555', lineHeight: 1.5 }}>
              No tienes cuenta de propietario. ¿Quieres crear una ahora?
            </p>
            <button
              onClick={handleCreateLandlordAccount}
              disabled={creatingLandlord}
              style={{
                width: '100%', padding: '14px', borderRadius: '12px',
                background: '#111', color: 'white', border: 'none',
                fontSize: '15px', fontWeight: 600, cursor: 'pointer',
                marginBottom: 10, opacity: creatingLandlord ? 0.6 : 1,
              }}
            >
              {creatingLandlord ? 'Creando…' : 'Crear cuenta'}
            </button>
            {!creatingLandlord && (
              <button
                onClick={() => setShowCreateLandlordModal(false)}
                style={{
                  width: '100%', padding: '14px', borderRadius: '12px',
                  background: '#f5f5f5', color: '#111', border: 'none',
                  fontSize: '15px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
