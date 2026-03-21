import React, { useState } from 'react';
import './Auth.css';

function Auth({ onLogin, onBack }) {

  const [registeredEmails] = useState(() => {
    const saved = localStorage.getItem('registeredEmails');
    return saved ? JSON.parse(saved) : ['test@test.com'];
  });

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
    { code: '+34', flag: '🇨🇦', name: 'Canadá' },
    { code: '+55', flag: '🇧🇷', name: 'Brasil' },
    { code: '+31', flag: '🇳🇱', name: 'Países Bajos' },
    { code: '+32', flag: '🇧🇪', name: 'Bélgica' },
    { code: '+41', flag: '🇨🇭', name: 'Suiza' },
    { code: '+34', flag: '🇦🇱', name: 'Albania' },
    { code: '+971', flag: '🇦🇪', name: 'Emiratos' },
    { code: '+81', flag: '🇯🇵', name: 'Japón' },
    { code: '+86', flag: '🇨🇳', name: 'China' },
  ];

  // steps: 'email' | 'password' | 'choose-channel' | 'verify' | 'create-password'
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('+34');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isExistingUser, setIsExistingUser] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [channel, setChannel] = useState(null); // 'email' | 'sms'

  const fullPhone = phone.trim() ? `${countryCode} ${phone.trim()}` : '';

  const sendCode = (ch) => {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    setGeneratedCode(code);
    if (ch === 'sms') {
      alert(`Código enviado por SMS a ${fullPhone}: ${code}`);
    } else {
      alert(`Código enviado por correo a ${email}: ${code}`);
    }
  };

  const handleEmailSubmit = (e) => {
    e.preventDefault();
    const emailExists = registeredEmails.includes(email.toLowerCase());
    setIsExistingUser(emailExists);
    if (emailExists) {
      setStep('password');
    } else {
      setStep('choose-channel');
    }
  };

  const handleChooseChannel = (ch) => {
    setChannel(ch);
    sendCode(ch);
    setStep('verify');
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    onLogin({ email, password });
  };

  const handleVerificationSubmit = (e) => {
    e.preventDefault();
    if (verificationCode === generatedCode) {
      setStep('create-password');
    } else {
      alert('Código incorrecto. Inténtalo de nuevo.');
    }
  };

  const handleCreatePasswordSubmit = (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      alert('Las contraseñas no coinciden');
      return;
    }
    if (password.length < 8) {
      alert('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    const updatedEmails = [...registeredEmails, email.toLowerCase()];
    localStorage.setItem('registeredEmails', JSON.stringify(updatedEmails));
    if (phone.trim()) {
      const phones = JSON.parse(localStorage.getItem('user_phones') || '{}');
      phones[email.toLowerCase()] = fullPhone;
      localStorage.setItem('user_phones', JSON.stringify(phones));
    }
    onLogin({ email, password, isNewUser: true });
  };

  const handleGoogleLogin = () => alert('Google login - Por implementar');
  const handleAppleLogin = () => alert('Apple login - Por implementar');

  const resetToEmail = () => {
    setStep('email');
    setEmail('');
    setCountryCode('+34');
    setPhone('');
    setPassword('');
    setConfirmPassword('');
    setVerificationCode('');
    setChannel(null);
  };

  return (
    <div className="auth-container">
      <div className="auth-content">
        <button className="back-arrow" onClick={step === 'email' ? onBack : resetToEmail}>
          ← Volver
        </button>
        <h1 className="auth-logo">Domora</h1>

        <div className="auth-form">

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

          {/* PASO 2a: Iniciar sesión (usuario existente) */}
          {step === 'password' && isExistingUser && (
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
                <button type="submit" className="continue-button">
                  Iniciar sesión
                </button>
              </form>
            </>
          )}

          {/* PASO 2b: Elegir canal de verificación (usuario nuevo) */}
          {step === 'choose-channel' && (
            <>
              <h2>Verificar identidad</h2>
              <p className="auth-subtitle">¿Cómo quieres recibir el código?</p>

              <button className="channel-option" onClick={() => handleChooseChannel('email')}>
                <div className="channel-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="22,6 12,13 2,6" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="channel-info">
                  <span className="channel-label">Por correo</span>
                  <span className="channel-value">{email}</span>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <polyline points="9 18 15 12 9 6" stroke="#bbb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              <button
                className={`channel-option${!fullPhone ? ' channel-option-disabled' : ''}`}
                onClick={() => fullPhone && handleChooseChannel('sms')}
                disabled={!fullPhone}
              >
                <div className="channel-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" stroke={fullPhone ? '#333' : '#ccc'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <line x1="12" y1="18" x2="12.01" y2="18" stroke={fullPhone ? '#333' : '#ccc'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="channel-info">
                  <span className="channel-label" style={{ color: fullPhone ? '#111' : '#bbb' }}>Por SMS</span>
                  <span className="channel-value" style={{ color: phone.trim() ? '#666' : '#ccc' }}>
                    {fullPhone || 'Introduce un teléfono para usar esta opción'}
                  </span>
                </div>
                {fullPhone && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <polyline points="9 18 15 12 9 6" stroke="#bbb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            </>
          )}

          {/* PASO 3: Introducir código */}
          {step === 'verify' && (
            <>
              <h2>Introduce el código</h2>
              <p className="auth-subtitle">
                Hemos enviado un código de 4 dígitos{' '}
                {channel === 'sms' ? <>por SMS a <strong>{phone}</strong></> : <>a <strong>{email}</strong></>}
              </p>
              <form onSubmit={handleVerificationSubmit}>
                <input
                  type="text"
                  className="auth-input verification-input"
                  placeholder="1234"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  maxLength="4"
                  required
                  autoFocus
                />
                <button type="submit" className="continue-button">
                  Verificar
                </button>
              </form>
              <button className="resend-button" onClick={() => sendCode(channel)}>
                Reenviar código
              </button>
            </>
          )}

          {/* PASO 4: Crear contraseña */}
          {step === 'create-password' && (
            <>
              <h2>Crear contraseña</h2>
              <p className="auth-subtitle">Elige una contraseña segura para tu cuenta</p>
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
                <button type="submit" className="continue-button">
                  Crear cuenta
                </button>
              </form>
            </>
          )}

        </div>
      </div>
    </div>
  );
}

export default Auth;
