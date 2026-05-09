import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import './Auth.css';

function GestorInvite({ onAccepted }) {
  const token = new URLSearchParams(window.location.search).get('token');

  const [loadState, setLoadState] = useState('loading'); // loading | invalid | accepted | wrong-user | ready
  const [invite, setInvite] = useState(null);
  const [authMode, setAuthMode] = useState('login'); // login | register
  const [alreadyLoggedIn, setAlreadyLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setLoadState('invalid'); return; }

    async function init() {
      // Comprobar si ya hay sesión activa
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setAlreadyLoggedIn(true);
        setCurrentUser(session.user);
        setEmail(session.user.email);
      }

      // Cargar la invitación por token
      const { data, error: fetchError } = await supabase
        .from('gestor_invites')
        .select('*')
        .eq('token', token)
        .single();

      if (fetchError || !data) { setLoadState('invalid'); return; }

      setInvite(data);

      if (session?.user) {
        // Si el email de sesión no coincide con el de la invitación, bloquear.
        if (session.user.email.toLowerCase() !== data.gestor_email.toLowerCase()) {
          setLoadState('wrong-user');
          return;
        }
      } else {
        setEmail(data.gestor_email);
      }

      setLoadState(data.status === 'accepted' ? 'accepted' : 'ready');
    }

    init();
  }, [token]);

  const acceptInvite = async (user) => {
    await supabase
      .from('gestor_invites')
      .update({ status: 'accepted' })
      .eq('token', token);

    setDone(true);
    setTimeout(() => onAccepted(user), 1600);
  };

  const handleAcceptDirect = async () => {
    setLoading(true);
    setError('');
    await acceptInvite(currentUser);
    setLoading(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authError) { setError('Correo o contraseña incorrectos.'); return; }
    await acceptInvite(data.user);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
    if (password !== confirmPassword) { setError('Las contraseñas no coinciden.'); return; }
    setLoading(true);
    setError('');
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (signUpError) { setError(signUpError.message); return; }
    if (!data.session) {
      // Supabase requiere confirmación de email antes de tener sesión
      setError('Revisa tu correo para confirmar la cuenta y luego inicia sesion aqui para aceptar la invitacion.');
      setAuthMode('login');
      setPassword('');
      setConfirmPassword('');
      return;
    }
    await acceptInvite(data.user);
  };

  // ── Pantallas de estado ──

  if (loadState === 'loading') {
    return (
      <div className="auth-container">
        <div className="auth-content">
          <h1 className="auth-logo">Domio</h1>
          <div className="auth-form">
            <p className="auth-subtitle">Cargando invitacion…</p>
          </div>
        </div>
      </div>
    );
  }

  if (loadState === 'invalid') {
    return (
      <div className="auth-container">
        <div className="auth-content">
          <h1 className="auth-logo">Domio</h1>
          <div className="auth-form">
            <h2>Enlace no valido</h2>
            <p className="auth-subtitle">
              Este enlace de invitacion no existe o ha expirado.<br/>
              Pide al propietario que te envie una nueva invitacion.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loadState === 'wrong-user') {
    const handleSignOut = async () => {
      await supabase.auth.signOut();
      window.location.reload();
    };
    return (
      <div className="auth-container">
        <div className="auth-content">
          <h1 className="auth-logo">Domio</h1>
          <div className="auth-form">
            <h2>Cuenta incorrecta</h2>
            <p className="auth-subtitle">
              Esta invitacion es para{' '}
              <strong>{invite?.gestor_email}</strong>.<br/>
              Cierra sesion e inicia con esa cuenta para aceptarla.
            </p>
            <button className="continue-button" onClick={handleSignOut}>
              Cerrar sesion
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loadState === 'accepted') {
    return (
      <div className="auth-container">
        <div className="auth-content">
          <h1 className="auth-logo">Domio</h1>
          <div className="auth-form">
            <h2>Invitacion ya aceptada</h2>
            <p className="auth-subtitle">
              Esta invitacion ya fue aceptada anteriormente.<br/>
              Inicia sesion para acceder a tu panel de gestor.
            </p>
            <button
              className="continue-button"
              style={{ marginTop: 8 }}
              onClick={() => window.location.href = 'https://trydomio.com'}
            >
              Ir a trydomio.com
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Estado "ready" ──

  const propLabel = invite.property_count === 1 ? 'propiedad' : 'propiedades';

  if (done) {
    return (
      <div className="auth-container">
        <div className="auth-content">
          <h1 className="auth-logo">Domio</h1>
          <div className="auth-form" style={{ textAlign: 'center' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', background: '#f0fdf4',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M20 6L9 17l-5-5" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2>Invitacion aceptada</h2>
            <p className="auth-subtitle">Redirigiendo a tu panel…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-content">
        <h1 className="auth-logo">Domio</h1>

        <div className="auth-form">
          {/* Cabecera de la invitación */}
          <div style={{
            background: '#f8f8f8', borderRadius: 12, padding: '16px 20px',
            marginBottom: 28, border: '1px solid #eee',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
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
                  {invite.landlord_name || invite.landlord_email}
                </p>
                <p style={{ margin: 0, fontSize: 13, color: '#888' }}>
                  te invita como gestor
                </p>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: '#555' }}>
              Tendras acceso a{' '}
              <strong>{invite.property_count} {propLabel}</strong>.
            </p>
          </div>

          {error && <p className="auth-error">{error}</p>}

          {/* Si ya tiene sesión activa */}
          {alreadyLoggedIn ? (
            <>
              <h2>Aceptar invitacion</h2>
              <p className="auth-subtitle">
                Conectado como <strong>{currentUser?.email}</strong>
              </p>
              <button
                className="continue-button"
                onClick={handleAcceptDirect}
                disabled={loading}
              >
                {loading ? 'Aceptando…' : 'Aceptar invitacion'}
              </button>
            </>
          ) : (
            <>
              {/* Tabs login / registro */}
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
                  <input
                    type="email"
                    className="auth-input"
                    placeholder="correo@ejemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                  <input
                    type="password"
                    className="auth-input"
                    placeholder="Contrasena"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button type="submit" className="continue-button" disabled={loading}>
                    {loading ? 'Entrando…' : 'Iniciar sesion y aceptar'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRegister}>
                  <input
                    type="email"
                    className="auth-input"
                    placeholder="correo@ejemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                  <input
                    type="password"
                    className="auth-input"
                    placeholder="Contrasena (minimo 8 caracteres)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength="8"
                    required
                  />
                  <input
                    type="password"
                    className="auth-input"
                    placeholder="Confirmar contrasena"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength="8"
                    required
                  />
                  <button type="submit" className="continue-button" disabled={loading}>
                    {loading ? 'Creando cuenta…' : 'Crear cuenta y aceptar'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default GestorInvite;
