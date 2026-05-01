import './Welcome.css';

function Welcome({ onSelectUserType }) {
  return (
    <div className="welcome-container">
      <div className="welcome-content">

        <div className="welcome-logo">
          <svg width="72" height="88" viewBox="0 0 72 88" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* dot */}
            <circle cx="36" cy="6" r="3.5" fill="#111" />
            {/* title lines */}
            <rect x="16" y="16" width="40" height="5" rx="2.5" fill="#111" />
            <rect x="10" y="26" width="52" height="5" rx="2.5" fill="#111" />
            {/* body lines */}
            <rect x="4" y="38" width="64" height="5" rx="2.5" fill="#111" />
            <rect x="4" y="48" width="64" height="5" rx="2.5" fill="#111" />
            {/* two-column rows */}
            <rect x="4" y="58" width="28" height="5" rx="2.5" fill="#111" />
            <rect x="40" y="58" width="28" height="5" rx="2.5" fill="#111" />
            <rect x="4" y="66" width="28" height="5" rx="2.5" fill="#111" />
            <rect x="40" y="66" width="28" height="5" rx="2.5" fill="#111" />
            {/* blue accent lines */}
            <rect x="4" y="76" width="64" height="5" rx="2.5" fill="#3B6CF8" />
            <rect x="4" y="84" width="64" height="4" rx="2" fill="#3B6CF8" />
          </svg>
        </div>

        <h1 className="welcome-app-name">Domio</h1>
        <p className="welcome-tagline">Gestiona tus alquileres sin complicaciones.</p>

        <div className="welcome-cards">
          <button className="welcome-card" onClick={() => onSelectUserType('propietario')}>
            <div className="welcome-card-image">
              <img src="/images/propietario-icon.png" alt="Propietario" />
            </div>
            <span className="welcome-card-label">Propietario</span>
          </button>

          <button className="welcome-card" onClick={() => onSelectUserType('inquilino')}>
            <div className="welcome-card-image">
              <img src="/images/inquilino-icon.png" alt="Inquilino" />
            </div>
            <span className="welcome-card-label">Inquilino</span>
          </button>
        </div>

        <div className="welcome-footer">
          <p className="welcome-footer-note">Puedes cambiar esto más adelante.</p>
          <a href="/privacy" className="welcome-privacy-link">Política de Privacidad</a>
        </div>

      </div>
    </div>
  );
}

export default Welcome;
