import { useState } from 'react';
import { supabase } from '../supabaseClient';
import './CodeEntry.css';

function CodeEntry({ onCodeValid, onBack }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const normalized = code.trim().toUpperCase();
    setLoading(true);
    setError('');

    const { data, error: dbError } = await supabase
      .from('inquilinos')
      .select('landlord_email, property_id, tenant_id, tenant_code')
      .eq('tenant_code', normalized)
      .single();

    setLoading(false);

    if (dbError || !data) {
      setError('Código no válido. Comprueba que lo has introducido correctamente.');
      return;
    }

    // Guardar también en localStorage para compatibilidad con el resto de la app
    const codes = JSON.parse(localStorage.getItem('tenant_codes') || '{}');
    codes[normalized] = {
      landlordEmail: data.landlord_email,
      propertyId: data.property_id,
      tenantId: data.tenant_id,
    };
    localStorage.setItem('tenant_codes', JSON.stringify(codes));

    onCodeValid(normalized, codes[normalized]);
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
          <button type="submit" className="code-submit-btn" disabled={loading || code.trim().length < 4}>
            {loading ? 'Verificando…' : 'Acceder'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default CodeEntry;
