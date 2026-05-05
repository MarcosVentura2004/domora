import './Welcome.css';

function Welcome({ onSelectUserType }) {
  return (
    <div className="welcome-container">
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
          <p className="welcome-footer-note">Puedes cambiar esto mas adelante.</p>
          <a href="/privacy" className="welcome-privacy-link">Politica de Privacidad</a>
        </div>

      </div>
    </div>
  );
}

export default Welcome;
