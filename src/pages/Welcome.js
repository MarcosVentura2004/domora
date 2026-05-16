import './Welcome.css';

function Welcome({ onSelectUserType, onBack }) {
  return (
    <div className="welcome-container">
      {onBack && (
        <button
          onClick={onBack}
          style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            color: '#888',
            padding: '8px 10px',
            borderRadius: '10px',
            transition: 'color 0.15s, background 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#111'; e.currentTarget.style.background = '#f3f4f6'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#888'; e.currentTarget.style.background = 'none'; }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4L6 9L11 14"/>
          </svg>
          Volver
        </button>
      )}
      <div className="welcome-content">

        <div className="welcome-logo">
          <img src="/images/house-logo.png" alt="Domio" style={{ width: '80px', height: '80px', objectFit: 'contain' }} />
        </div>

        <h1 className="welcome-app-name">Domio</h1>
        <p className="welcome-tagline">Gestiona tus alquileres sin complicaciones.</p>

        <div style={{
          display: 'flex',
          flexDirection: 'row',
          gap: '14px',
          width: '100%',
          marginBottom: '36px',
        }}>

          <button
            onClick={() => onSelectUserType('propietario')}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '14px',
              padding: '28px 12px 24px',
              background: '#ffffff',
              border: '1.5px solid #eee',
              borderRadius: '18px',
              cursor: 'pointer',
              boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
              transition: 'border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease',
              minHeight: '140px',
            }}
            className="welcome-card"
          >
            <img
              src="/images/propietario-icon.png"
              alt="Propietario"
              style={{ width: '90px', height: '90px', objectFit: 'contain' }}
            />
            <span style={{
              fontSize: '15px',
              fontWeight: '700',
              color: '#111',
              letterSpacing: '-0.2px',
              lineHeight: '1.3',
              textAlign: 'center',
            }}>
              Propietario / Gestor
            </span>
          </button>

          <button
            onClick={() => onSelectUserType('inquilino')}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '14px',
              padding: '28px 12px 24px',
              background: '#ffffff',
              border: '1.5px solid #eee',
              borderRadius: '18px',
              cursor: 'pointer',
              boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
              transition: 'border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease',
              minHeight: '140px',
            }}
            className="welcome-card"
          >
            <img
              src="/images/inquilino-icon.png"
              alt="Inquilino"
              style={{ width: '90px', height: '90px', objectFit: 'contain' }}
            />
            <span style={{
              fontSize: '15px',
              fontWeight: '700',
              color: '#111',
              letterSpacing: '-0.2px',
              lineHeight: '1.3',
              textAlign: 'center',
            }}>
              Inquilino
            </span>
          </button>

        </div>

        <div className="welcome-footer">
          <p className="welcome-footer-note">Puedes cambiar esto más adelante.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px', marginTop: '8px' }}>
            <a href="/politica-de-privacidad" target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: '#999', textDecoration: 'none' }}
              onMouseEnter={e => e.target.style.color = '#666'} onMouseLeave={e => e.target.style.color = '#999'}>
              Política de privacidad
            </a>
            <span style={{ fontSize: '12px', color: '#ccc' }}>·</span>
            <a href="/terminos-de-servicio" target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: '#999', textDecoration: 'none' }}
              onMouseEnter={e => e.target.style.color = '#666'} onMouseLeave={e => e.target.style.color = '#999'}>
              Términos de servicio
            </a>
            <span style={{ fontSize: '12px', color: '#ccc' }}>·</span>
            <a href="/aviso-legal" target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: '#999', textDecoration: 'none' }}
              onMouseEnter={e => e.target.style.color = '#666'} onMouseLeave={e => e.target.style.color = '#999'}>
              Aviso legal
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}

export default Welcome;
