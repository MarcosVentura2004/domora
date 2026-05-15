import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import './Auth.css';

function GestorHeader({ gestor }) {
  return (
    <div style={{
      background: '#f8f8f8', borderRadius: 12, padding: '16px 20px',
      marginBottom: 24, border: '1px solid #eee',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%', background: '#111',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="12" cy="7" r="4" stroke="white" strokeWidth="2"/>
          </svg>
        </div>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#111' }}>
            {gestor?.nombre || gestor?.email}
          </p>
          <p style={{ margin: 0, fontSize: 13, color: '#888' }}>quiere gestionar tus propiedades</p>
        </div>
      </div>
    </div>
  );
}

export default function GestorInviteLandlord({ onAccepted }) {
  const token = new URLSearchParams(window.location.search).get('token');

  // loadState: loading | invalid | ready | configure | no-properties | done
  const [loadState, setLoadState] = useState('loading');
  const [gestor, setGestor] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [landlordProperties, setLandlordProperties] = useState([]);

  // Auth
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState('');

  // Configure
  const [selectedPropertyIds, setSelectedPropertyIds] = useState(new Set());
  const [permission, setPermission] = useState('lectura');
  const [canMessage, setCanMessage] = useState(true);
  const [configLoading, setConfigLoading] = useState(false);

  useEffect(() => {
    if (!token) { setLoadState('invalid'); return; }
    async function init() {
      const { data: gestorData, error: fetchError } = await supabase
        .from('gestores')
        .select('email, nombre')
        .eq('invite_token', token)
        .single();
      if (fetchError || !gestorData) { setLoadState('invalid'); return; }
      setGestor(gestorData);

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await afterAuth(session.user, gestorData);
      } else {
        setLoadState('ready');
      }
    }
    init();
  }, [token]); // eslint-disable-line

  const afterAuth = async (user, gestorData) => {
    setCurrentUser(user);
    const g = gestorData;

    const { data: props } = await supabase
      .from('properties')
      .select('id, data')
      .eq('landlord_email', user.email);

    if (props && props.length > 0) {
      const propList = props.map(r => ({ id: r.id, name: r.data?.name || r.id }));
      setLandlordProperties(propList);

      // Pre-marcar propiedades ya compartidas con este gestor y restaurar sus permisos
      const { data: existingAccess } = await supabase
        .from('property_access')
        .select('property_id, permisos, can_message')
        .eq('gestor_email', g.email)
        .eq('landlord_email', user.email);
      setSelectedPropertyIds(new Set((existingAccess || []).map(r => r.property_id)));
      if (existingAccess && existingAccess.length > 0) {
        setPermission(existingAccess[0].permisos || 'lectura');
        setCanMessage(existingAccess[0].can_message !== false);
      }

      setLoadState('configure');
    } else {
      // Sin propiedades — guardar solicitud pendiente
      const { error: requestError } = await supabase.from('gestor_requests').upsert(
        { gestor_email: g.email, landlord_email: user.email, status: 'pending' },
        { onConflict: 'gestor_email,landlord_email' }
      );
      if (requestError) {
        console.warn('[gestor_requests] Error guardando solicitud pendiente:', requestError);
      }
      setLoadState('no-properties');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthLoading(true); setError('');
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setAuthLoading(false);
    if (authError) { setError('Correo o contraseña incorrectos.'); return; }
    await afterAuth(data.user, gestor);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
    if (password !== confirmPassword) { setError('Las contraseñas no coinciden.'); return; }
    setAuthLoading(true); setError('');
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    setAuthLoading(false);
    if (signUpError) { setError(signUpError.message); return; }
    if (!data.session) {
      setError('Revisa tu correo para confirmar la cuenta y luego inicia sesion aqui.');
      setAuthMode('login'); setPassword(''); setConfirmPassword('');
      return;
    }
    await afterAuth(data.user, gestor);
  };

  const handleConfirmAccess = async () => {
    if (selectedPropertyIds.size === 0 || !gestor || !currentUser) return;
    setConfigLoading(true);
    const rows = [...selectedPropertyIds].map(pid => ({
      gestor_email: gestor.email,
      landlord_email: currentUser.email,
      property_id: pid,
      permisos: permission,
      can_message: canMessage,
    }));
    const { error: upsertError } = await supabase.from('property_access').upsert(rows, { onConflict: 'gestor_email,property_id' });
    if (upsertError) {
      setConfigLoading(false);
      setError('No se pudo guardar el acceso. Inténtalo de nuevo.');
      return;
    }
    // Mark the gestor_request as accepted so it no longer shows as pending in Settings
    await supabase.from('gestor_requests')
      .update({ status: 'accepted' })
      .eq('gestor_email', gestor.email)
      .eq('landlord_email', currentUser.email);
    setConfigLoading(false);
    setLoadState('done');
    setTimeout(() => onAccepted(currentUser), 1600);
  };

  if (loadState === 'loading') return (
    <div className="auth-container"><div className="auth-content">
      <h1 className="auth-logo">Domio</h1>
      <div className="auth-form"><p className="auth-subtitle">Cargando…</p></div>
    </div></div>
  );

  if (loadState === 'invalid') return (
    <div className="auth-container"><div className="auth-content">
      <h1 className="auth-logo">Domio</h1>
      <div className="auth-form">
        <h2>Enlace no válido</h2>
        <p className="auth-subtitle">
          Este enlace no existe o ha expirado. Pide al gestor que te envie uno nuevo.
        </p>
      </div>
    </div></div>
  );

  if (loadState === 'no-properties') return (
    <div className="auth-container"><div className="auth-content">
      <h1 className="auth-logo">Domio</h1>
      <div className="auth-form" style={{ textAlign: 'center' }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', background: '#f0f9ff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h2>Primero añade tus propiedades</h2>
        <p className="auth-subtitle">
          Para dar acceso a <strong>{gestor?.nombre || gestor?.email}</strong> necesitas tener
          propiedades en tu cuenta. Añádelas desde tu panel y luego en{' '}
          <strong>Ajustes &gt; Gestores</strong> encontraras la solicitud pendiente.
        </p>
        <button
          className="continue-button"
          style={{ marginTop: 8 }}
          onClick={() => { if (currentUser) onAccepted(currentUser); }}
        >
          Ir a mi panel
        </button>
      </div>
    </div></div>
  );

  if (loadState === 'done') return (
    <div className="auth-container"><div className="auth-content">
      <h1 className="auth-logo">Domio</h1>
      <div className="auth-form" style={{ textAlign: 'center' }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', background: '#f0fdf4',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M20 6L9 17l-5-5" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h2>Acceso concedido</h2>
        <p className="auth-subtitle">Redirigiendo a tu panel…</p>
      </div>
    </div></div>
  );

  if (loadState === 'configure') return (
    <div className="auth-container"><div className="auth-content">
      <h1 className="auth-logo">Domio</h1>
      <div className="auth-form" style={{ maxHeight: '82vh', overflowY: 'auto' }}>
        <GestorHeader gestor={gestor} />

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 8 }}>
            Propiedades con acceso
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {landlordProperties.map(prop => {
              const checked = selectedPropertyIds.has(prop.id);
              return (
                <button
                  key={prop.id}
                  type="button"
                  onClick={() => {
                    const next = new Set(selectedPropertyIds);
                    if (checked) next.delete(prop.id); else next.add(prop.id);
                    setSelectedPropertyIds(next);
                  }}
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
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{prop.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 8 }}>
            Permisos
          </label>
          <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e5e5' }}>
            {[{ value: 'lectura', label: 'Solo lectura' }, { value: 'gestion', label: 'Gestion completa' }].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPermission(opt.value)}
                style={{
                  flex: 1, padding: '10px 4px', border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600,
                  background: permission === opt.value ? '#111' : 'white',
                  color: permission === opt.value ? 'white' : '#555',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 8 }}>
            Puede ver mensajes
          </label>
          <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e5e5' }}>
            {[{ value: true, label: 'Si' }, { value: false, label: 'No' }].map(opt => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => setCanMessage(opt.value)}
                style={{
                  flex: 1, padding: '10px 4px', border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600,
                  background: canMessage === opt.value ? '#111' : 'white',
                  color: canMessage === opt.value ? 'white' : '#555',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <button
          className="continue-button"
          onClick={handleConfirmAccess}
          disabled={configLoading || selectedPropertyIds.size === 0}
        >
          {configLoading ? 'Guardando…' : 'Dar acceso'}
        </button>
      </div>
    </div></div>
  );

  // Estado ready — formulario de autenticacion
  return (
    <div className="auth-container"><div className="auth-content">
      <h1 className="auth-logo">Domio</h1>
      <div className="auth-form">
        <GestorHeader gestor={gestor} />

        {error && <p className="auth-error">{error}</p>}

        <div className="register-tabs" style={{ marginBottom: 24 }}>
          <button
            type="button"
            className={`register-tab${authMode === 'login' ? ' active' : ''}`}
            onClick={() => { setError(''); setAuthMode('login'); }}
          >
            Iniciar sesion
          </button>
          <button
            type="button"
            className={`register-tab${authMode === 'register' ? ' active' : ''}`}
            onClick={() => { setError(''); setAuthMode('register'); }}
          >
            Crear cuenta
          </button>
        </div>

        {authMode === 'login' ? (
          <form onSubmit={handleLogin}>
            <input type="email" className="auth-input" placeholder="correo@ejemplo.com"
              value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
            <input type="password" className="auth-input" placeholder="Contraseña"
              value={password} onChange={e => setPassword(e.target.value)} required />
            <button type="submit" className="continue-button" disabled={authLoading}>
              {authLoading ? 'Entrando…' : 'Iniciar sesion'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister}>
            <input type="email" className="auth-input" placeholder="correo@ejemplo.com"
              value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
            <input type="password" className="auth-input" placeholder="Contraseña (mínimo 8 caracteres)"
              value={password} onChange={e => setPassword(e.target.value)} minLength="8" required />
            <input type="password" className="auth-input" placeholder="Confirmar contraseña"
              value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} minLength="8" required />
            <button type="submit" className="continue-button" disabled={authLoading}>
              {authLoading ? 'Creando cuenta…' : 'Crear cuenta'}
            </button>
          </form>
        )}
      </div>
    </div></div>
  );
}
