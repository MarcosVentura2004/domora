import React, { useEffect, useState } from 'react';
import { getInstallState, subscribeToInstall, promptInstall } from '../pwaInstall';

// "Instalar app" section for Ajustes. Uses the Settings.css classes.
// Hidden when the app is already installed or the browser can't install it.
export default function InstallAppSection() {
  const [state, setState] = useState(getInstallState);
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  useEffect(() => {
    const update = () => setState(getInstallState());
    const media = window.matchMedia('(display-mode: standalone)');
    media.addEventListener?.('change', update);
    const unsubscribe = subscribeToInstall(update);
    return () => {
      unsubscribe();
      media.removeEventListener?.('change', update);
    };
  }, []);

  if (state !== 'prompt' && state !== 'ios') return null;

  const handleClick = () => {
    if (state === 'ios') {
      setShowIOSHelp(true);
      return;
    }
    promptInstall().catch(() => {});
  };

  return (
    <div>
      <p className="settings-section-label">App</p>
      <div className="settings-card">
        <button
          className="settings-card-row"
          style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
          onClick={handleClick}
        >
          <div className="settings-row-icon" style={{ background: '#f0f0f0' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect x="6" y="2" width="12" height="20" rx="3" stroke="#555" strokeWidth="2" />
              <path d="M12 7v7M9 11l3 3 3-3" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="settings-row-content">
            <p className="settings-row-title">Instalar app</p>
            <p className="settings-row-subtitle">Abre Domio desde tu pantalla de inicio</p>
          </div>
          <svg className="settings-row-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {showIOSHelp && (
        <div className="settings-modal-overlay" onClick={() => setShowIOSHelp(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <p className="settings-modal-title">Instalar Domio</p>
            <p className="settings-modal-desc">Desde Safari, en dos pasos:</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="settings-row-icon" style={{ background: '#f0f0f0', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M12 3v12M8 7l4-4 4 4" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M8 11H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-2" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <p style={{ margin: 0, fontSize: 15, color: '#111' }}>
                  1. Toca <strong>Compartir</strong> en la barra del navegador
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="settings-row-icon" style={{ background: '#f0f0f0', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="18" height="18" rx="4" stroke="#2563EB" strokeWidth="2" />
                    <path d="M12 8v8M8 12h8" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <p style={{ margin: 0, fontSize: 15, color: '#111' }}>
                  2. Elige <strong>Añadir a pantalla de inicio</strong>
                </p>
              </div>
            </div>

            <button className="settings-modal-btn-cancel" onClick={() => setShowIOSHelp(false)}>
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
