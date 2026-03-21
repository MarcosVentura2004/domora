
import './Welcome.css';

function Welcome({ onSelectUserType }) {
  return (
    <div className="welcome-container">
      <div className="welcome-content">
        <div className="logo">
          <img src="/images/house-logo.png" alt="Logo" className="house-icon" />
        </div>

        <h1 className="app-name">Domora</h1>
        <p className="tagline">Gestiona tus alquileres sin complicaciones.</p>

        <div className="user-type-cards">
          <button className="user-card" onClick={() => onSelectUserType('propietario')}>
            <div className="card-icon">
              <img src="/images/propietario-icon.png" alt="Propietario" />
            </div>
            <h3>Propietario</h3>
          </button>

          <button className="user-card" onClick={() => onSelectUserType('inquilino')}>
            <div className="card-icon">
              <img src="/images/inquilino-icon.png" alt="Inquilino" />
            </div>
            <h3>Inquilino</h3>
          </button>
        </div>

        <div className="footer">
          <p className="footer-note">Puedes cambiar esto más adelante.</p>
          <a href="/privacy" className="privacy-link">Política de Privacidad</a>
        </div>
      </div>
    </div>
  );
}

export default Welcome;
