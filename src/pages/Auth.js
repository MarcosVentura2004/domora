import React, { useState } from 'react';
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

// steps: 'email' | 'password' | 'create-password' | 'verify'
function Auth({ onLogin, onBack }) {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('+34');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fullPhone = phone.trim() ? `${countryCode} ${phone.trim()}` : '';

  const resetToEmail = () => {
    setStep('email');
    setEmail('');
    setCountryCode('+34');
    setPhone('');
    setPassword('');
    setConfirmPassword('');
    setVerificationCode('');
    setError('');
  };

  const handleEmailSubmit = (e) => {
    e.preventDefault();
    setError('');
    setStep('password');
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authError) {
      if (authError.message.includes('Email not confirmed')) {
        setError('Confirma tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.');
      } else {
        setError('Correo o contraseña incorrectos.');
      }
      return;
    }
    onLogin(data.user);
  };

  const handleCreatePasswordSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    setLoading(true);
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { phone: fullPhone || null },
      },
    });
    setLoading(false);
    if (authError) {
      if (authError.message.includes('already registered') || authError.message.includes('User already registered')) {
        setError('Este correo ya está registrado. Inicia sesión.');
        setStep('password');
        setPassword('');
        setConfirmPassword('');
      } else {
        setError(authError.message);
      }
      return;
    }
    setStep('verify');
  };

  const handleVerificationSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { data, error: authError } = await supabase.auth.verifyOtp({
      email,
      token: verificationCode,
      type: 'signup',
    });
    setLoading(false);
    if (authError) {
      setError('Código incorrecto o expirado. Inténtalo de nuevo.');
      return;
    }
    onLogin(data.user);
  };

  const handleResendOtp = async () => {
    setError('');
    const { error: authError } = await supabase.auth.resend({ type: 'signup', email });
    if (authError) {
      setError('No se pudo reenviar el código. Inténtalo más tarde.');
    } else {
      setError('');
      alert(`Código reenviado a ${email}`);
    }
  };

  const handleGoogleLogin = () => alert('Google login - Por implementar');
  const handleAppleLogin = () => alert('Apple login - Por implementar');

  return (
    <div className="auth-container">
      <div className="auth-content">
        <button className="back-arrow" onClick={step === 'email' ? onBack : resetToEmail}>
          ← Volver
        </button>
        <h1 className="auth-logo">Domora</h1>

        <div className="auth-form">

          {error && <p className="auth-error">{error}</p>}

          {/* PASO 1: Email + teléfono opcional */}
          {step === 'email' && (
            <>
              <h2>Crear cuenta</h2>
              <p className="auth-subtitle">Introduce tu correo para continuar</p>

              <form onSubmit={handleEmailSubmit}>
                <input
                  type="email"
                  className="auth-input"
                  placeholder="correo@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
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
                    placeholder="Teléfono (opcional)"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
                <button type="submit" className="continue-button">
                  Continuar
                </button>
              </form>

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

          {/* PASO 2a: Iniciar sesión */}
          {step === 'password' && (
            <>
              <h2>Iniciar sesión</h2>
              <p className="auth-subtitle">Bienvenido de nuevo a <strong>{email}</strong></p>
              <form onSubmit={handlePasswordSubmit}>
                <input
                  type="password"
                  className="auth-input"
                  placeholder="Contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                />
                <button type="submit" className="continue-button" disabled={loading}>
                  {loading ? 'Entrando…' : 'Iniciar sesión'}
                </button>
              </form>
              <p className="auth-switch">
                ¿No tienes cuenta?{' '}
                <button
                  className="auth-link-btn"
                  onClick={() => { setPassword(''); setError(''); setStep('create-password'); }}
                >
                  Crear cuenta
                </button>
              </p>
            </>
          )}

          {/* PASO 2b: Crear contraseña (registro) */}
          {step === 'create-password' && (
            <>
              <h2>Crear cuenta</h2>
              <p className="auth-subtitle">Elige una contraseña segura para <strong>{email}</strong></p>
              <form onSubmit={handleCreatePasswordSubmit}>
                <input
                  type="password"
                  className="auth-input"
                  placeholder="Contraseña (mínimo 8 caracteres)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength="8"
                  required
                  autoFocus
                />
                <input
                  type="password"
                  className="auth-input"
                  placeholder="Repetir contraseña"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength="8"
                  required
                />
                <button type="submit" className="continue-button" disabled={loading}>
                  {loading ? 'Creando cuenta…' : 'Crear cuenta'}
                </button>
              </form>
              <p className="auth-switch">
                ¿Ya tienes cuenta?{' '}
                <button
                  className="auth-link-btn"
                  onClick={() => { setPassword(''); setConfirmPassword(''); setError(''); setStep('password'); }}
                >
                  Iniciar sesión
                </button>
              </p>
            </>
          )}

          {/* PASO 3: Verificar código OTP */}
          {step === 'verify' && (
            <>
              <h2>Verifica tu correo</h2>
              <p className="auth-subtitle">
                Hemos enviado un código de 6 dígitos a <strong>{email}</strong>
              </p>
              <form onSubmit={handleVerificationSubmit}>
                <input
                  type="text"
                  className="auth-input verification-input"
                  placeholder="123456"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength="6"
                  required
                  autoFocus
                />
                <button type="submit" className="continue-button" disabled={loading}>
                  {loading ? 'Verificando…' : 'Verificar'}
                </button>
              </form>
              <button className="resend-button" onClick={handleResendOtp}>
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
