import { useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import './Auth.css';

// steps: 'login' | 'register' | 'verify-email'
function Auth({ onLogin, onBack, initialStep }) {
  const [step, setStep] = useState(initialStep || 'login');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsError, setTermsError] = useState('');
  const termsAcceptedAtRef = useRef(null);

  const goTo = (s) => { setError(''); setOtp(''); setTermsError(''); setStep(s); };

  const backTarget = {
    'login': onBack,
    'register': () => goTo('login'),
    'verify-email': () => goTo('register'),
  };

  // LOGIN: email + contraseña
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authError) {
      setError('Correo o contraseña incorrectos.');
      return;
    }
    onLogin(data.user);
  };

  // REGISTRO: email + contraseña + confirmar → envía OTP al email
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!termsAccepted) {
      setTermsError('Debes aceptar los términos para continuar.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    termsAcceptedAtRef.current = new Date().toISOString();
    setLoading(true);
    setError('');
    const { error: signUpError } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    goTo('verify-email');
  };

  // VERIFICAR OTP de email (tras registro)
  const handleVerifyEmailSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    });
    setLoading(false);
    if (verifyError) {
      setError('Código incorrecto o expirado. Inténtalo de nuevo.');
      return;
    }
    // Guardar aceptación de términos en la tabla landlords
    if (termsAcceptedAtRef.current && data.user) {
      await supabase.from('landlords').upsert({
        user_id: data.user.id,
        email: data.user.email,
        terms_accepted_at: termsAcceptedAtRef.current,
      }, { onConflict: 'user_id' });
    }
    onLogin(data.user);
  };

  const handleResendEmailOtp = async () => {
    setError('');
    const { error: resendError } = await supabase.auth.resend({ type: 'signup', email });
    if (resendError) {
      setError(`No se pudo reenviar el código: ${resendError.message}`);
    } else {
      alert(`Nuevo código enviado a ${email}`);
    }
  };

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'https://trydomio.com',
      },
    });
  };
  const handleAppleLogin = () => alert('Apple login - Por implementar');

  return (
    <div className="auth-container">
      <div className="auth-content">
        <button className="back-arrow" onClick={backTarget[step]}>
          ← Volver
        </button>
        <h1 className="auth-logo">Domio</h1>

        <div className="auth-form">
          {error && <p className="auth-error">{error}</p>}

          {/* INICIAR SESIÓN */}
          {step === 'login' && (
            <>
              <h2>Iniciar sesión</h2>
              <p className="auth-subtitle">Bienvenido de nuevo</p>

              <form onSubmit={handleLoginSubmit}>
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
                  placeholder="Contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button type="submit" className="continue-button" disabled={loading}>
                  {loading ? 'Entrando…' : 'Iniciar sesión'}
                </button>
              </form>

              <p className="auth-switch">
                ¿No tienes cuenta?{' '}
                <button className="auth-link-btn" onClick={() => goTo('register')}>
                  Crear cuenta
                </button>
              </p>

              <div className="divider"><span>o</span></div>

              <button className="social-button google" onClick={handleGoogleLogin}>
                <svg className="social-icon" viewBox="0 0 24 24" width="20" height="20">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continuar con Google
              </button>

              <button className="social-button apple" onClick={handleAppleLogin}>
                <svg className="social-icon" viewBox="0 0 24 24" width="20" height="20">
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" fill="#000"/>
                </svg>
                Continuar con Apple
              </button>

              <p className="terms">
                Al continuar aceptas nuestros{' '}
                <a href="#terms">Términos de servicio</a> y{' '}
                <a href="#privacy">Política de privacidad</a>
              </p>
            </>
          )}

          {/* CREAR CUENTA */}
          {step === 'register' && (
            <>
              <h2>Crear cuenta</h2>

              <form onSubmit={handleRegisterSubmit}>
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
                  placeholder="Contraseña (mínimo 8 caracteres)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength="8"
                  required
                />
                <input
                  type="password"
                  className="auth-input"
                  placeholder="Confirmar contraseña"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength="8"
                  required
                />
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) => { setTermsAccepted(e.target.checked); setTermsError(''); }}
                      style={{ marginTop: '3px', flexShrink: 0, width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '13px', color: '#444', lineHeight: '1.5' }}>
                      He leído y acepto los{' '}
                      <a href="/terminos-de-servicio" target="_blank" rel="noreferrer" style={{ color: '#111', textDecoration: 'underline' }}>
                        Términos y Condiciones
                      </a>
                      {' '}y la{' '}
                      <a href="/politica-de-privacidad" target="_blank" rel="noreferrer" style={{ color: '#111', textDecoration: 'underline' }}>
                        Política de privacidad
                      </a>
                    </span>
                  </label>
                  {termsError && (
                    <p style={{ color: '#e53e3e', fontSize: '12px', marginTop: '6px', marginLeft: '26px' }}>
                      {termsError}
                    </p>
                  )}
                </div>
                <button type="submit" className="continue-button" disabled={loading || !termsAccepted}
                  style={!termsAccepted ? { opacity: 0.45, cursor: 'not-allowed' } : {}}>
                  {loading ? 'Registrando…' : 'Crear cuenta'}
                </button>
              </form>

              <p className="auth-switch">
                ¿Ya tienes cuenta?{' '}
                <button className="auth-link-btn" onClick={() => goTo('login')}>
                  Iniciar sesión
                </button>
              </p>
            </>
          )}

          {/* VERIFICAR EMAIL (tras registro) */}
          {step === 'verify-email' && (
            <>
              <h2>Verifica tu correo</h2>
              <p className="auth-subtitle">
                Hemos enviado un código de 6 dígitos a <strong>{email}</strong>
              </p>
              <form onSubmit={handleVerifyEmailSubmit}>
                <input
                  type="text"
                  inputMode="numeric"
                  className="auth-input verification-input"
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength="6"
                  required
                  autoFocus
                />
                <button type="submit" className="continue-button" disabled={loading || otp.length < 6}>
                  {loading ? 'Verificando…' : 'Verificar'}
                </button>
              </form>
              <button className="resend-button" onClick={handleResendEmailOtp}>
                Reenviar código
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  );
}

export default Auth;
