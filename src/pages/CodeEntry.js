import { useState } from 'react';
import './CodeEntry.css';

function CodeEntry({ onCodeValid, onBack }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const normalized = code.trim().toUpperCase();
    const codes = JSON.parse(localStorage.getItem('tenant_codes') || '{}');
    const entry = codes[normalized];
    if (!entry) {
      setError('Código no válido. Comprueba que lo has introducido correctamente.');
      return;
    }
    onCodeValid(normalized, entry);
  };

  return (
    <div className="code-entry-container">
      <button className="code-back-btn" onClick={onBack}>←</button>

      <div className="code-entry-content">
        <div className="code-entry-icon">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <h1 className="code-entry-title">Introduce tu código</h1>
        <p className="code-entry-subtitle">Tu propietario te habrá dado un código de 6 caracteres para acceder a tu alquiler.</p>

        <form onSubmit={handleSubmit} className="code-entry-form">
          <input
            className={`code-input ${error ? 'error' : ''}`}
            type="text"
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(''); }}
            placeholder="Ej: 6536CD"
            maxLength={6}
            autoComplete="off"
            autoFocus
          />
          {error && <p className="code-error">{error}</p>}
          <button type="submit" className="code-submit-btn" disabled={code.trim().length < 4}>
            Acceder
          </button>
        </form>
      </div>
    </div>
  );
}

export default CodeEntry;
