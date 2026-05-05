import './Welcome.css';

function Welcome({ onSelectUserType }) {
  return (
    <div className="welcome-container">
      <div className="welcome-content">

        <div className="welcome-logo">
          <svg width="72" height="100" viewBox="0 0 72 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="36" cy="6" r="3.5" fill="#111" />
            <rect x="16" y="16" width="40" height="5" rx="2.5" fill="#111" />
            <rect x="10" y="26" width="52" height="5" rx="2.5" fill="#111" />
            <rect x="4"  y="38" width="64" height="5" rx="2.5" fill="#111" />
            <rect x="4"  y="48" width="64" height="5" rx="2.5" fill="#111" />
            <rect x="4"  y="58" width="28" height="5" rx="2.5" fill="#111" />
            <rect x="40" y="58" width="28" height="5" rx="2.5" fill="#111" />
            <rect x="4"  y="66" width="28" height="5" rx="2.5" fill="#111" />
            <rect x="40" y="66" width="28" height="5" rx="2.5" fill="#111" />
            <rect x="4"  y="74" width="28" height="5" rx="2.5" fill="#111" />
            <rect x="40" y="74" width="28" height="5" rx="2.5" fill="#111" />
            <rect x="4"  y="84" width="64" height="5" rx="2.5" fill="#3B6CF8" />
            <rect x="4"  y="93" width="64" height="4"  rx="2"   fill="#3B6CF8" />
          </svg>
        </div>

        <h1 className="welcome-app-name">Domio</h1>
        <p className="welcome-tagline">Gestiona tus alquileres sin complicaciones.</p>

        <div className="welcome-cards">

          <button className="welcome-card" onClick={() => onSelectUserType('propietario')}>
            <div style={{ width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="19" cy="14" r="7" stroke="#111" strokeWidth="2.2"/>
                <path d="M12 21C8 26 7 31 7 38" stroke="#111" strokeWidth="2.2" strokeLinecap="round"/>
                <path d="M26 21C30 25 32 28 32 32" stroke="#111" strokeWidth="2.2" strokeLinecap="round"/>
                <path d="M27 34L35 26L43 34" stroke="#3B6CF8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <rect x="27" y="34" width="16" height="10" stroke="#3B6CF8" strokeWidth="1.9"/>
                <path d="M32 44L32 39.5Q35 36.5 38 39.5L38 44" stroke="#3B6CF8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="welcome-card-label">Propietario / Gestor</span>
          </button>

          <button className="welcome-card" onClick={() => onSelectUserType('inquilino')}>
            <div style={{ width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="19" cy="14" r="7" stroke="#111" strokeWidth="2.2"/>
                <path d="M12 21C8 26 7 31 7 38" stroke="#111" strokeWidth="2.2" strokeLinecap="round"/>
                <path d="M26 21C30 25 32 28 32 32" stroke="#111" strokeWidth="2.2" strokeLinecap="round"/>
                <circle cx="37" cy="33" r="5.5" stroke="#3B6CF8" strokeWidth="2"/>
                <circle cx="37" cy="33" r="1.5" fill="#3B6CF8"/>
                <path d="M37 38.5L37 46" stroke="#3B6CF8" strokeWidth="2" strokeLinecap="round"/>
                <path d="M37 41.5L41 41.5" stroke="#3B6CF8" strokeWidth="2" strokeLinecap="round"/>
                <path d="M37 44.5L40 44.5" stroke="#3B6CF8" strokeWidth="2" strokeLinecap="round"/>
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
