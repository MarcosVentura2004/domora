import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// Bottom sheet (centered dialog on desktop) with the gestor's public invite link,
// so landlords can grant access to their properties. Used from GestorDashboard and Ajustes.
export default function ShareGestorProfile({ userEmail, onClose }) {
  const [shareLink, setShareLink] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 540px)').matches);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 540px)');
    const onChange = e => setIsDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadLink() {
      const { data: gestorRow, error: fetchError } = await supabase
        .from('gestores')
        .select('invite_token')
        .eq('email', userEmail)
        .single();

      if (fetchError) {
        if (!cancelled) { setError('No se pudo generar el enlace. Inténtalo de nuevo.'); setLoading(false); }
        return;
      }

      let token = gestorRow?.invite_token;
      if (!token) {
        token = crypto.randomUUID();
        const { error: updateError } = await supabase
          .from('gestores')
          .update({ invite_token: token })
          .eq('email', userEmail);
        if (updateError) {
          if (!cancelled) { setError('No se pudo generar el enlace. Inténtalo de nuevo.'); setLoading(false); }
          return;
        }
      }

      if (!cancelled) {
        setShareLink(`https://trydomio.com/gestor-invite-landlord?token=${token}`);
        setLoading(false);
      }
    }
    loadLink();
    return () => { cancelled = true; };
  }, [userEmail]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2100,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: isDesktop ? 'center' : 'flex-end', justifyContent: 'center',
        padding: isDesktop ? 20 : 0,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Compartir perfil"
        style={{
          background: 'white',
          borderRadius: isDesktop ? 20 : '20px 20px 0 0',
          padding: isDesktop ? '24px' : '24px 20px 36px',
          width: '100%', maxWidth: 480, boxSizing: 'border-box',
          boxShadow: isDesktop ? '0 12px 40px rgba(0,0,0,0.16)' : 'none',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#111' }}>Añadir clientes</p>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4, display: 'flex' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {error ? (
          <p style={{ margin: '0 0 8px', fontSize: 13, color: '#c0392b', textAlign: 'center' }}>{error}</p>
        ) : (
          <p style={{ margin: '0 0 16px', fontSize: 13, color: '#555', lineHeight: 1.5 }}>
            Comparte tu perfil con propietarios. Desde el enlace podrán darte acceso a sus propiedades y aparecerán en tu cartera.
          </p>
        )}

        {loading && (
          <p style={{ margin: '8px 0', fontSize: 13, color: '#aaa', textAlign: 'center' }}>Generando enlace…</p>
        )}

        {shareLink && (
          <>
            <div style={{
              background: '#f5f5f5', borderRadius: 10, padding: '12px 14px',
              fontSize: 13, color: '#333', wordBreak: 'break-all',
              marginBottom: 16, border: '1px solid #e5e5e5', lineHeight: 1.5,
            }}>
              {shareLink}
            </div>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(shareLink).catch(() => {});
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2000);
              }}
              style={{
                width: '100%', padding: '14px', borderRadius: 12,
                background: linkCopied ? '#16a34a' : '#111',
                color: 'white', border: 'none', fontSize: 15, fontWeight: 600,
                cursor: 'pointer', marginBottom: 10, transition: 'background 0.2s',
              }}
            >
              {linkCopied ? 'Enlace copiado' : 'Copiar enlace'}
            </button>
            <button
              onClick={() => {
                const msg = encodeURIComponent(`Hola, puedes darme acceso a tus propiedades en Domio desde este enlace: ${shareLink}`);
                window.open(`https://wa.me/?text=${msg}`, '_blank', 'noopener');
              }}
              style={{
                width: '100%', padding: '14px', borderRadius: 12, marginBottom: 10,
                background: '#25D366', color: 'white',
                border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.857L.057 23.882a.5.5 0 0 0 .615.612l6.162-1.51A11.94 11.94 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.9 0-3.7-.504-5.25-1.385l-.372-.217-3.865.947.982-3.773-.237-.389A9.961 9.961 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
              </svg>
              Enviar por WhatsApp
            </button>
            {typeof navigator.share === 'function' && (
              <button
                onClick={() => {
                  navigator.share({ title: 'Gestor en Domio', url: shareLink }).catch(() => {});
                }}
                style={{
                  width: '100%', padding: '14px', borderRadius: 12,
                  background: 'white', color: '#111',
                  border: '1px solid #e5e5e5',
                  fontSize: 15, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Compartir
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
