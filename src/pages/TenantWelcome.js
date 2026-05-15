import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

function TenantWelcome({ tenantData, tenantCode, onAccepted }) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsError, setTermsError] = useState('');
  const [loading, setLoading] = useState(false);
  const [landlordName, setLandlordName] = useState('');

  useEffect(() => {
    if (!tenantData?.landlordEmail) return;
    supabase
      .from('landlords')
      .select('name')
      .eq('email', tenantData.landlordEmail)
      .single()
      .then(({ data }) => {
        if (data?.name) setLandlordName(data.name);
      });
  }, [tenantData]);

  const handleEnter = async () => {
    if (!termsAccepted) {
      setTermsError('Debes aceptar los términos para continuar.');
      return;
    }
    setLoading(true);
    await supabase.rpc('accept_inquilino_terms', { p_code: tenantCode });
    setLoading(false);
    onAccepted();
  };

  const landlordDisplay = landlordName || tenantData?.landlordEmail || 'tu propietario';

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 20px',
      background: '#fafafa',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        background: '#fff',
        borderRadius: '20px',
        padding: '36px 28px 32px',
        boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
        textAlign: 'center',
      }}>
        <img
          src="/images/house-logo.png"
          alt="Domio"
          style={{ width: '60px', height: '60px', objectFit: 'contain', marginBottom: '16px' }}
        />

        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#111', margin: '0 0 16px' }}>
          Bienvenido a Domio
        </h1>

        <p style={{ fontSize: '15px', color: '#555', lineHeight: '1.6', margin: '0 0 28px' }}>
          <strong>{landlordDisplay}</strong> te ha dado acceso a tu portal personal. Aquí podrás consultar tus pagos, contrato, documentos e incidencias, y comunicarte directamente con él.
        </p>

        <div style={{ textAlign: 'left', marginBottom: '24px' }}>
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

        <button
          onClick={handleEnter}
          disabled={loading || !termsAccepted}
          style={{
            width: '100%',
            padding: '14px',
            background: '#111',
            color: '#fff',
            border: 'none',
            borderRadius: '12px',
            fontSize: '15px',
            fontWeight: '600',
            cursor: termsAccepted && !loading ? 'pointer' : 'not-allowed',
            opacity: termsAccepted && !loading ? 1 : 0.45,
            transition: 'opacity 0.15s ease',
          }}
        >
          {loading ? 'Entrando…' : 'Entrar a mi portal'}
        </button>
      </div>
    </div>
  );
}

export default TenantWelcome;
