import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import './Auth.css';

function ResetPassword({ onSuccess }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  // Supabase inserts the recovery token into the URL hash.
  // We must wait for onAuthStateChange to fire PASSWORD_RECOVERY
  // before calling updateUser, otherwise there is no active session.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message || 'Error al actualizar la contraseña. Solicita un nuevo enlace.');
      return;
    }

    setDone(true);
    setTimeout(() => onSuccess(), 2000);
  };

  return (
    <div className="auth-container">
      <div className="auth-content">
        <h1 className="auth-logo">Domio</h1>

        <div className="auth-form">
          {error && <p className="auth-error">{error}</p>}

          {done ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', background: '#f0fdf4',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17l-5-5" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h2>Contrasena actualizada</h2>
              <p className="auth-subtitle">Redirigiendo a tu cuenta…</p>
            </div>
          ) : (
            <>
              <h2>Nueva contrasena</h2>
              <p className="auth-subtitle">Elige una contrasena segura para tu cuenta</p>

              {!sessionReady && (
                <p style={{ textAlign: 'center', color: '#888', fontSize: '14px', marginBottom: '16px' }}>
                  Validando enlace…
                </p>
              )}

              <form onSubmit={handleSubmit}>
                <input
                  type="password"
                  className="auth-input"
                  placeholder="Nueva contrasena (minimo 8 caracteres)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength="8"
                  required
                  autoFocus
                  disabled={!sessionReady || loading}
                />
                <input
                  type="password"
                  className="auth-input"
                  placeholder="Confirmar contrasena"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength="8"
                  required
                  disabled={!sessionReady || loading}
                />
                <button
                  type="submit"
                  className="continue-button"
                  disabled={!sessionReady || loading}
                >
                  {loading ? 'Guardando…' : 'Guardar contrasena'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ResetPassword;
