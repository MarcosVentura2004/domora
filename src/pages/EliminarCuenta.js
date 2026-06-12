import React from 'react';
import './EliminarCuenta.css';

const TrashIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);

const StepIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const MailIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>
);

const ShieldIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

const ClockIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>
);

const ListIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6"/>
    <line x1="8" y1="12" x2="21" y2="12"/>
    <line x1="8" y1="18" x2="21" y2="18"/>
    <line x1="3" y1="6" x2="3.01" y2="6"/>
    <line x1="3" y1="12" x2="3.01" y2="12"/>
    <line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
);

const STEPS = [
  'Abre Domio en trydomio.com e inicia sesión.',
  'Pulsa el icono de perfil o accede a Ajustes.',
  'Desplázate hasta el final de la pantalla.',
  'Pulsa "Eliminar cuenta" (en rojo, debajo de "Cerrar sesión").',
  'En el cuadro de confirmación escribe ELIMINAR y pulsa "Eliminar cuenta definitivamente".',
];

const DELETED_DATA = [
  'Cuenta de acceso y credenciales de autenticación',
  'Datos de perfil (nombre, teléfono, foto)',
  'Todas las propiedades y sus datos (dirección, fotos, contrato, fianza)',
  'Datos de inquilinos vinculados a tus propiedades',
  'Historial de cobros y pagos',
  'Mensajes e incidencias registradas',
  'Accesos concedidos a gestores',
];

const RETAINED_DATA = [
  'Registros fiscales o contables que la normativa española obligue a conservar (art. 30 Código de Comercio y legislación tributaria), durante el plazo legalmente exigido. Transcurrido dicho plazo, se eliminan de forma definitiva.',
];

export default function EliminarCuenta() {
  return (
    <div className="ec-page">
      <header className="ec-header">
        <a href="/" className="ec-logo">
          <img src="/images/house-logo.png" alt="" className="ec-logo-img" />
          Domio
        </a>
      </header>

      <main className="ec-main">
        <div className="ec-hero">
          <div className="ec-hero-icon">
            <TrashIcon />
          </div>
          <h1 className="ec-title">Eliminar tu cuenta de Domio</h1>
          <p className="ec-intro">
            Puedes eliminar tu cuenta de Domio (Domio Gestión) en cualquier momento. La eliminación es
            permanente e irreversible: todos tus datos se borran de nuestros servidores de forma inmediata
            si lo haces desde la propia app.
          </p>
        </div>

        <section className="ec-section">
          <div className="ec-section-header">
            <div className="ec-section-icon ec-section-icon--blue">
              <StepIcon />
            </div>
            <h2 className="ec-section-title">Método principal: desde la app</h2>
          </div>
          <p className="ec-section-desc">La forma más rápida. La eliminación es inmediata.</p>
          <ol className="ec-steps">
            {STEPS.map((step, i) => (
              <li key={i} className="ec-step">
                <span className="ec-step-num">{i + 1}</span>
                <span className="ec-step-text">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="ec-section">
          <div className="ec-section-header">
            <div className="ec-section-icon ec-section-icon--gray">
              <MailIcon />
            </div>
            <h2 className="ec-section-title">Alternativa: solicitud por email</h2>
          </div>
          <p className="ec-section-desc">
            Si no puedes acceder a la app, envía un correo desde la dirección con la que te registraste en Domio:
          </p>
          <div className="ec-email-card">
            <div className="ec-email-row">
              <span className="ec-email-label">Destinatario</span>
              <a href="mailto:domioapp.sl@gmail.com" className="ec-email-value">domioapp.sl@gmail.com</a>
            </div>
            <div className="ec-email-divider" />
            <div className="ec-email-row">
              <span className="ec-email-label">Asunto</span>
              <span className="ec-email-value ec-email-value--mono">Solicitud de eliminación de cuenta</span>
            </div>
          </div>
          <p className="ec-note">
            Procesaremos tu solicitud en un plazo máximo de 30 días desde su recepción.
          </p>
        </section>

        <section className="ec-section">
          <div className="ec-section-header">
            <div className="ec-section-icon ec-section-icon--red">
              <ListIcon />
            </div>
            <h2 className="ec-section-title">Qué datos se eliminan</h2>
          </div>
          <ul className="ec-list">
            {DELETED_DATA.map((item, i) => (
              <li key={i} className="ec-list-item">
                <span className="ec-list-dot" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="ec-section">
          <div className="ec-section-header">
            <div className="ec-section-icon ec-section-icon--green">
              <ShieldIcon />
            </div>
            <h2 className="ec-section-title">Qué datos se conservan</h2>
          </div>
          <ul className="ec-list">
            {RETAINED_DATA.map((item, i) => (
              <li key={i} className="ec-list-item">
                <span className="ec-list-dot ec-list-dot--green" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="ec-section">
          <div className="ec-section-header">
            <div className="ec-section-icon ec-section-icon--gray">
              <ClockIcon />
            </div>
            <h2 className="ec-section-title">Plazo de eliminación</h2>
          </div>
          <div className="ec-timing-grid">
            <div className="ec-timing-card">
              <span className="ec-timing-badge ec-timing-badge--instant">Inmediato</span>
              <p className="ec-timing-method">Eliminación desde la app</p>
            </div>
            <div className="ec-timing-card">
              <span className="ec-timing-badge ec-timing-badge--days">Máx. 30 días</span>
              <p className="ec-timing-method">Solicitud por email</p>
            </div>
          </div>
        </section>

        <div className="ec-contact">
          <p>
            ¿Tienes alguna pregunta?{' '}
            <a href="mailto:domioapp.sl@gmail.com" className="ec-contact-link">domioapp.sl@gmail.com</a>
          </p>
        </div>
      </main>

      <footer className="ec-footer">
        <a href="/politica-de-privacidad" className="ec-footer-link">Política de privacidad</a>
        <span className="ec-footer-sep">·</span>
        <a href="/terminos-de-servicio" className="ec-footer-link">Términos</a>
        <span className="ec-footer-sep">·</span>
        <span className="ec-footer-copy">© 2025 Domio</span>
      </footer>
    </div>
  );
}
