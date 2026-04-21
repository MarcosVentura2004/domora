import { useState } from 'react';
import { supabase } from '../supabaseClient';
import './Auth.css';

const COUNTRY_CODES = [
  { code: '+34', flag: '🇪🇸', name: 'España' },
  { code: '+1',  flag: '🇺🇸', name: 'EE.UU.' },
  { code: '+44', flag: '🇬🇧', name: 'Reino Unido' },
  { code: '+33', flag: '🇫🇷', name: 'Francia' },
  { code: '+49', flag: '🇩🇪', name: 'Alemania' },
  { code: '+39', flag: '🇮🇹', name: 'Italia' },
  { code: '+351', flag: '🇵🇹', name: 'Portugal' },
  { code: '+52', flag: '🇲🇽', name: 'México' },
  { code: '+54', flag: '🇦🇷', name: 'Argentina' },
  { code: '+57', flag: '🇨🇴', name: 'Colombia' },
  { code: '+56', flag: '🇨🇱', name: 'Chile' },
  { code: '+1',  flag: '🇨🇦', name: 'Canadá' },
  { code: '+55', flag: '🇧🇷', name: 'Brasil' },
  { code: '+31', flag: '🇳🇱', name: 'Países Bajos' },
  { code: '+32', flag: '🇧🇪', name: 'Bélgica' },
  { code: '+41', flag: '🇨🇭', name: 'Suiza' },
  { code: '+971', flag: '🇦🇪', name: 'Emiratos' },
  { code: '+81', flag: '🇯🇵', name: 'Japón' },
  { code: '+86', flag: '🇨🇳', name: 'China' },
];

// steps: 'login' | 'register' | 'verify-email' | 'phone' | 'verify-phone'
function Auth({ onLogin, onBack }) {
  const [step, setStep] = useState('login');
  const [registerTab, setRegisterTab] = useState('email'); // 'email' | 'phone'
  const [phoneFrom, setPhoneFrom] = useState('phone');     // where to back from verify-phone
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('+34');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fullPhone = `${countryCode}${phone.trim()}`;

  const goTo = (s) => { setError(''); setOtp(''); setStep(s); };

  const backTarget = {
    'login': onBack,
    'register': () => goTo('login'),
    'verify-email': () => goTo('register'),
    'phone': () => goTo('login'),
    'verify-phone': () => goTo(phoneFrom),
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
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
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

  // TELÉFONO: enviar OTP por SMS
  const handlePhoneSubmit = async (e) => {
    e.preventDefault();
    if (!phone.trim()) {
      setError('Introduce tu número de teléfono.');
      return;
    }
    setLoading(true);
    setError('');
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone: fullPhone });
    setLoading(false);
    if (otpError) {
      setError(`No se pudo enviar el SMS: ${otpError.message}`);
      return;
    }
    goTo('verify-phone');
  };

  // VERIFICAR OTP de teléfono (SMS)
  const handleVerifyPhoneSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      phone: fullPhone,
      token: otp,
      type: 'sms',
    });
    setLoading(false);
    if (verifyError) {
      setError('Código incorrecto o expirado. Inténtalo de nuevo.');
      return;
    }
    onLogin(data.user);
  };

  const handleResendPhoneOtp = async () => {
    setError('');
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone: fullPhone });
    if (otpError) {
      setError(`No se pudo reenviar el SMS: ${otpError.message}`);
    } else {
      alert(`Nuevo código enviado a ${fullPhone}`);
    }
  };

  const handleGoogleLogin = () => alert('Google login - Por implementar');
  const handleAppleLogin = () => alert('Apple login - Por implementar');

  return (
    <div className="auth-container">
      <div className="auth-content">
        <button className="back-arrow" onClick={backTarget[step]}>
          ← Volver
        </button>
        <h1 className="auth-logo">Domora</h1>

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

              <button className="social-button" onClick={() => { setPhoneFrom('phone'); goTo('phone'); }}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.69A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
                </svg>
                Entrar con número de teléfono
              </button>

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

              <div className="register-tabs">
                <button
                  type="button"
                  className={`register-tab${registerTab === 'email' ? ' active' : ''}`}
                  onClick={() => { setError(''); setRegisterTab('email'); }}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                    <rect x="2" y="4" width="20" height="16" rx="2"/>
                    <path d="M2 7l10 7 10-7"/>
                  </svg>
                  Correo
                </button>
                <button
                  type="button"
                  className={`register-tab${registerTab === 'phone' ? ' active' : ''}`}
                  onClick={() => { setError(''); setRegisterTab('phone'); }}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.69A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
                  </svg>
                  Teléfono
                </button>
              </div>

              {registerTab === 'email' && (
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
                  <button type="submit" className="continue-button" disabled={loading}>
                    {loading ? 'Registrando…' : 'Crear cuenta'}
                  </button>
                </form>
              )}

              {registerTab === 'phone' && (
                <form onSubmit={(e) => { setPhoneFrom('register'); handlePhoneSubmit(e); }}>
                  <div className="phone-input-wrapper">
                    <select
                      className="phone-prefix-select"
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                    >
                      {COUNTRY_CODES.map((c, i) => (
                        <option key={i} value={c.code}>
                          {c.flag} {c.code}
                        </option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      className="phone-number-input"
                      placeholder="612 345 678"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                      required
                      autoFocus
                    />
                  </div>
                  <button type="submit" className="continue-button" disabled={loading || !phone.trim()}>
                    {loading ? 'Enviando SMS…' : 'Enviar código'}
                  </button>
                </form>
              )}

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

          {/* LOGIN CON TELÉFONO */}
          {step === 'phone' && (
            <>
              <h2>Entrar con teléfono</h2>
              <p className="auth-subtitle">Te enviaremos un código SMS para verificar tu número</p>

              <form onSubmit={handlePhoneSubmit}>
                <div className="phone-input-wrapper">
                  <select
                    className="phone-prefix-select"
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                  >
                    {COUNTRY_CODES.map((c, i) => (
                      <option key={i} value={c.code}>
                        {c.flag} {c.code}
                      </option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    className="phone-number-input"
                    placeholder="612 345 678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    required
                    autoFocus
                  />
                </div>
                <button type="submit" className="continue-button" disabled={loading || !phone.trim()}>
                  {loading ? 'Enviando SMS…' : 'Enviar código'}
                </button>
              </form>
            </>
          )}

          {/* VERIFICAR TELÉFONO (SMS OTP) */}
          {step === 'verify-phone' && (
            <>
              <h2>Introduce el código</h2>
              <p className="auth-subtitle">
                Hemos enviado un SMS con el código a <strong>{fullPhone}</strong>
              </p>
              <form onSubmit={handleVerifyPhoneSubmit}>
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
              <button className="resend-button" onClick={handleResendPhoneOtp}>
                Reenviar SMS
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  );
}

export default Auth;
