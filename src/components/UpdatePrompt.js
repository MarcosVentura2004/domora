import React, { useEffect, useState } from 'react';
import { subscribeToUpdates, applyUpdate } from '../serviceWorkerRegistration';
import './UpdatePrompt.css';

export default function UpdatePrompt() {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => subscribeToUpdates(setHasUpdate), []);

  if (!hasUpdate || dismissed) return null;

  const handleUpdate = () => {
    setUpdating(true);
    applyUpdate();
  };

  return (
    <div className="update-prompt" role="status" aria-live="polite">
      <svg className="update-prompt-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="update-prompt-text">Hay una nueva versión disponible</span>
      <button className="update-prompt-btn" onClick={handleUpdate} disabled={updating}>
        {updating ? 'Actualizando…' : 'Actualizar'}
      </button>
      <button className="update-prompt-close" onClick={() => setDismissed(true)} aria-label="Cerrar aviso">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
