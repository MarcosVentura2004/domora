import './Welcome.css';

function Welcome({ onSelectUserType }) {
  return (
    <div className="welcome-container">
      <div className="welcome-content">

        <div className="welcome-logo">
          <svg width="72" height="88" viewBox="0 0 72 88" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="36" cy="6" r="3.5" fill="#111" />
            <rect x="16" y="16" width="40" height="5" rx="2.5" fill="#111" />
            <rect x="10" y="26" width="52" height="5" rx="2.5" fill="#111" />
            <rect x="4" y="38" width="64" height="5" rx="2.5" fill="#111" />
            <rect x="4" y="48" width="64" height="5" rx="2.5" fill="#111" />
            <rect x="4" y="58" width="28" height="5" rx="2.5" fill="#111" />
            <rect x="40" y="58" width="28" height="5" rx="2.5" fill="#111" />
            <rect x="4" y="66" width="28" height="5" rx="2.5" fill="#111" />
            <rect x="40" y="66" width="28" height="5" rx="2.5" fill="#111" />
            <rect x="4" y="76" width="64" height="5" rx="2.5" fill="#3B6CF8" />
            <rect x="4" y="84" width="64" height="4" rx="2" fill="#3B6CF8" />
          </svg>
        </div>

        <h1 className="welcome-app-name">Domio</h1>
        <p className="welcome-tagline">Gestiona tus alquileres sin complicaciones.</p>

        <div className="welcome-cards">
          <button className="welcome-card" onClick={() => onSelectUserType('propietario')}>
            <div className="welcome-card-image">
              <svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 19L22 7L38 19" stroke="#3B6CF8" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
                <rect x="9" y="18" width="26" height="22" rx="2" stroke="#3B6CF8" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
                <rect x="18" y="29" width="8" height="11" rx="1.5" stroke="#3B6CF8" strokeWidth="1.6"/>
                <rect x="11" y="22" width="7" height="5" rx="1" stroke="#3B6CF8" strokeWidth="1.5"/>
                <rect x="26" y="22" width="7" height="5" rx="1" stroke="#3B6CF8" strokeWidth="1.5"/>
              </svg>
            </div>
            <span className="welcome-card-label">Propietario / Gestor</span>
          </button>

          <button className="welcome-card" onClick={() => onSelectUserType('inquilino')}>
            <div className="welcome-card-image">
              <svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="22" cy="14" r="7" stroke="#111" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M8 40c0-7.732 6.268-14 14-14s14 6.268 14 14" stroke="#111" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="34" cy="33" r="4" stroke="#3B6CF8" strokeWidth="1.6"/>
                <path d="M37 30.5L40.5 27" stroke="#3B6CF8" strokeWidth="1.6" strokeLinecap="round"/>
                <path d="M39 29l1.5-1.5" stroke="#3B6CF8" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="welcome-card-label">Inquilino</span>
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
