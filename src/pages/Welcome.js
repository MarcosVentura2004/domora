import logo from '../logo.svg';
import './Welcome.css';

function Welcome({ onSelectUserType }) {
  return (
    <div className="welcome-container">
      <div className="welcome-content">

        <div className="welcome-logo">
          <img src={logo} alt="Domio" style={{ width: '72px', height: '72px', objectFit: 'contain' }} />
        </div>

        <h1 className="welcome-app-name">Domio</h1>
        <p className="welcome-tagline">Gestiona tus alquileres sin complicaciones.</p>

        <div className="welcome-cards">

          <button className="welcome-card" onClick={() => onSelectUserType('propietario')}>
            <div className="welcome-card-icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Edificio principal */}
                <rect x="10" y="20" width="28" height="24" rx="2" stroke="#3B6CF8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                {/* Tejado */}
                <path d="M7 22L24 8L41 22" stroke="#3B6CF8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                {/* Puerta */}
                <rect x="20" y="32" width="8" height="12" rx="1.5" stroke="#3B6CF8" strokeWidth="1.6"/>
                {/* Ventana izquierda */}
                <rect x="12" y="24" width="7" height="6" rx="1" stroke="#3B6CF8" strokeWidth="1.5"/>
                {/* Ventana derecha */}
                <rect x="29" y="24" width="7" height="6" rx="1" stroke="#3B6CF8" strokeWidth="1.5"/>
              </svg>
            </div>
            <span className="welcome-card-label">Propietario / Gestor</span>
          </button>

          <button className="welcome-card" onClick={() => onSelectUserType('inquilino')}>
            <div className="welcome-card-icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Cabeza */}
                <circle cx="20" cy="14" r="6.5" stroke="#3B6CF8" strokeWidth="1.8"/>
                {/* Cuerpo */}
                <path d="M7 42c0-7.18 5.82-13 13-13s13 5.82 13 42" stroke="#3B6CF8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M7 42c0-7.18 5.82-13 13-13s13 5.82 13 13" stroke="#3B6CF8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                {/* Llave — aro */}
                <circle cx="38" cy="32" r="5" stroke="#3B6CF8" strokeWidth="1.8"/>
                {/* Llave — vastago */}
                <path d="M38 37V44" stroke="#3B6CF8" strokeWidth="1.8" strokeLinecap="round"/>
                {/* Llave — dientes */}
                <path d="M38 40.5H41" stroke="#3B6CF8" strokeWidth="1.8" strokeLinecap="round"/>
                <path d="M38 43H40" stroke="#3B6CF8" strokeWidth="1.8" strokeLinecap="round"/>
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
