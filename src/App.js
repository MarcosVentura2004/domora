import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import Landing from './pages/Landing';
import Welcome from './pages/Welcome';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import GestorDashboard from './pages/GestorDashboard';
import CodeEntry from './pages/CodeEntry';
import InquilinoHome from './pages/InquilinoHome';
import TenantWelcome from './pages/TenantWelcome';
import Planes from './pages/Planes';
import ResetPassword from './pages/ResetPassword';
import GestorInvite from './pages/GestorInvite';
import GestorInviteLandlord from './pages/GestorInviteLandlord';
import Calendario from './pages/Calendario';
import PoliticaDePrivacidad from './pages/PoliticaDePrivacidad';
import TerminosDeServicio from './pages/TerminosDeServicio';
import AvisoLegal from './pages/AvisoLegal';
import EliminarCuenta from './pages/EliminarCuenta';
import './App.css';

function App() {
  const initialPage = window.location.pathname === '/planes'
    ? 'planes'
    : window.location.pathname === '/reset-password'
    ? 'reset-password'
    : window.location.pathname === '/gestor-invite'
    ? 'gestor-invite'
    : window.location.pathname === '/gestor-invite-landlord'
    ? 'gestor-invite-landlord'
    : window.location.pathname === '/politica-de-privacidad'
    ? 'politica-de-privacidad'
    : window.location.pathname === '/terminos-de-servicio'
    ? 'terminos-de-servicio'
    : window.location.pathname === '/aviso-legal'
    ? 'aviso-legal'
    : window.location.pathname === '/eliminar-cuenta'
    ? 'eliminar-cuenta'
    : 'landing';
  const [currentPage, rawSetPage] = useState(initialPage);
  const currentPageRef = useRef(initialPage);
  const setPage = (page) => { currentPageRef.current = page; rawSetPage(page); };
  const [userType, setUserType] = useState(null); // 'propietario' o 'inquilino'
  const [userEmail, setUserEmail] = useState(null);
  const [tenantCodes, setTenantCodes] = useState([]);
  const [authInitialStep, setAuthInitialStep] = useState('login');
  const [tenantWelcomeData, setTenantWelcomeData] = useState(null);
  const [tenantWelcomeCode, setTenantWelcomeCode] = useState(null);
  // Modal retroactivo para usuarios existentes sin terms_accepted_at
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [modalTermsAccepted, setModalTermsAccepted] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const pendingUserRef = useRef(null);
  const pendingUserTypeRef = useRef(null); // 'propietario' | 'gestor'

  // Paginas que gestionan su propia autenticacion — el listener global no debe
  // redirigirlas bajo ninguna circunstancia.
  const PUBLIC_PAGES = ['planes', 'reset-password', 'gestor-invite', 'gestor-invite-landlord', 'politica-de-privacidad', 'terminos-de-servicio', 'aviso-legal', 'eliminar-cuenta'];

  // Restore session on mount
  useEffect(() => {
    if (PUBLIC_PAGES.includes(currentPageRef.current)) return;

    // Inquilinos no tienen cuenta Supabase — restaurar desde localStorage
    if (localStorage.getItem('userType') === 'inquilino') {
      setUserType('inquilino');
      const saved = JSON.parse(localStorage.getItem('inquilino_codes') || '[]');
      setTenantCodes(saved);
      setPage(saved.length > 0 ? 'inquilino-home' : 'code-entry');
      return;
    }

    const routeAuthenticatedUser = async (user) => {
      // Doble guarda: si entre callbacks el usuario navegó a una página pública, no redirigir.
      if (PUBLIC_PAGES.includes(currentPageRef.current)) return;

      setUserEmail(user.email);

      const { data: accessData } = await supabase
        .from('property_access')
        .select('id')
        .eq('gestor_email', user.email)
        .limit(1);

      const isGestor = accessData && accessData.length > 0;
      if (isGestor) {
        setUserType('gestor');
        localStorage.setItem('userType', 'gestor');
        setPage('gestor-dashboard');

        const { data: gestorData } = await supabase
          .from('gestores')
          .select('terms_accepted_at')
          .eq('email', user.email)
          .maybeSingle();
        if (!gestorData?.terms_accepted_at) {
          pendingUserRef.current = user;
          pendingUserTypeRef.current = 'gestor';
          setShowTermsModal(true);
        }
      } else {
        // Si no existe fila en landlords, la cuenta fue eliminada: redirigir a welcome
        const { data: landlordData } = await supabase
          .from('landlords')
          .select('id, terms_accepted_at')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!landlordData) {
          await supabase.auth.signOut();
          localStorage.removeItem('userType');
          setUserType(null);
          setUserEmail(null);
          setPage('welcome');
          return;
        }

        setUserType('propietario');
        localStorage.setItem('userType', 'propietario');
        setPage('dashboard');

        if (!landlordData.terms_accepted_at) {
          pendingUserRef.current = user;
          pendingUserTypeRef.current = 'propietario';
          setShowTermsModal(true);
        }
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[getSession] user:', session?.user?.email ?? null, '| currentPage:', currentPageRef.current);
      if (PUBLIC_PAGES.includes(currentPageRef.current)) return;
      if (session?.user && currentPageRef.current !== 'auth') {
        console.log('[getSession] → calling routeAuthenticatedUser');
        routeAuthenticatedUser(session.user);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[onAuthStateChange] event:', event, '| user:', session?.user?.email ?? null, '| currentPage:', currentPageRef.current);

      // Si estamos en una página pública, ignorar todos los eventos de auth.
      if (PUBLIC_PAGES.includes(currentPageRef.current)) return;

      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user && currentPageRef.current !== 'auth') {
        // Crear fila en landlords si el login es via Google OAuth y no existe aún
        if (event === 'SIGNED_IN' && session.user.app_metadata?.provider === 'google') {
          const { data: existingLandlord } = await supabase
            .from('landlords')
            .select('id')
            .eq('user_id', session.user.id)
            .single();

          if (!existingLandlord) {
            await supabase
              .from('landlords')
              .insert({ user_id: session.user.id });
          }
        }
        console.log('[onAuthStateChange] → calling routeAuthenticatedUser');
        routeAuthenticatedUser(session.user);
      } else if (event === 'SIGNED_OUT') {
        setPage('welcome');
        setUserType(null);
        setUserEmail(null);
        setTenantCodes([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectUserType = (type) => {
    setUserType(type);
    if (type === 'inquilino') {
      localStorage.setItem('userType', 'inquilino');
      setPage('code-entry');
    } else {
      setPage('auth');
    }
  };

  const handleLogin = async (user) => {
    setUserEmail(user.email);

    const { data: accessData } = await supabase
      .from('property_access')
      .select('id')
      .eq('gestor_email', user.email)
      .limit(1);

    if (accessData && accessData.length > 0) {
      setUserType('gestor');
      localStorage.setItem('userType', 'gestor');
      setPage('gestor-dashboard');
      return;
    }

    // Si no existe fila en landlords, la cuenta fue eliminada: redirigir a welcome
    const { data: landlordData } = await supabase
      .from('landlords')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!landlordData) {
      await supabase.auth.signOut();
      localStorage.removeItem('userType');
      setUserType(null);
      setUserEmail(null);
      setPage('welcome');
      return;
    }

    setUserType('propietario');
    localStorage.setItem('userType', 'propietario');
    setPage('dashboard');
  };

  const handleCodeValid = (code, codeData, termsAcceptedAt) => {
    const updated = tenantCodes.includes(code) ? tenantCodes : [...tenantCodes, code];
    setTenantCodes(updated);
    localStorage.setItem('inquilino_codes', JSON.stringify(updated));

    if (!termsAcceptedAt) {
      // Primera vez: mostrar pantalla de bienvenida con consent
      setTenantWelcomeData(codeData);
      setTenantWelcomeCode(code);
      setPage('tenant-welcome');
    } else {
      setPage('inquilino-home');
    }
  };

  const handleCodesUpdate = (codes) => {
    setTenantCodes(codes);
    localStorage.setItem('inquilino_codes', JSON.stringify(codes));
  };

  const handleModalAccept = async () => {
    if (!modalTermsAccepted) return;
    setModalLoading(true);
    const user = pendingUserRef.current;
    const userType = pendingUserTypeRef.current;
    if (user) {
      const ts = new Date().toISOString();
      if (userType === 'gestor') {
        await supabase
          .from('gestores')
          .update({ terms_accepted_at: ts })
          .eq('email', user.email);
      } else {
        const { data: updated } = await supabase
          .from('landlords')
          .update({ terms_accepted_at: ts })
          .eq('user_id', user.id)
          .select('id');
        if (!updated || updated.length === 0) {
          await supabase.from('landlords').insert({
            user_id: user.id,
            email: user.email,
            terms_accepted_at: ts,
          });
        }
      }
    }
    setModalLoading(false);
    setShowTermsModal(false);
    setModalTermsAccepted(false);
    pendingUserRef.current = null;
    pendingUserTypeRef.current = null;
  };

  const handleLogout = async () => {
    if (userType === 'propietario' || userType === 'gestor') {
      await supabase.auth.signOut();
    }
    localStorage.removeItem('userType');
    localStorage.removeItem('inquilino_codes');
    setPage('welcome');
    setUserType(null);
    setUserEmail(null);
    setTenantCodes([]);
  };

  const handleSwitchRole = async () => {
    const newType = userType === 'propietario' ? 'inquilino' : 'propietario';
    setUserType(newType);
    localStorage.setItem('userType', newType);
    if (newType === 'inquilino') {
      const saved = JSON.parse(localStorage.getItem('inquilino_codes') || '[]');
      setTenantCodes(saved);
      setPage(saved.length > 0 ? 'inquilino-home' : 'code-entry');
    } else {
      await supabase.auth.updateUser({ data: { userType: 'propietario' } });
      setPage('dashboard');
    }
  };

  return (
    <div className="App">
      {currentPage === 'landing' && (
        <Landing
          onGetStarted={() => setPage('welcome')}
          onLogin={() => { setAuthInitialStep('login'); setPage('auth'); }}
        />
      )}

      {currentPage === 'welcome' && (
        <Welcome onSelectUserType={handleSelectUserType} onBack={() => setPage('landing')} />
      )}

      {currentPage === 'auth' && (
        <Auth
          onLogin={handleLogin}
          onBack={() => setPage('welcome')}
          initialStep={authInitialStep}
        />
      )}

      {currentPage === 'dashboard' && (
        <Dashboard
          userEmail={userEmail}
          onLogout={handleLogout}
          onSwitchRole={handleSwitchRole}
          onNavigate={(page) => setPage(page)}
        />
      )}

      {currentPage === 'calendario' && (
        <Calendario
          userEmail={userEmail}
          onBack={() => setPage('dashboard')}
        />
      )}

      {currentPage === 'gestor-dashboard' && (
        <GestorDashboard
          userEmail={userEmail}
          onLogout={handleLogout}
          onNavigate={(page) => setPage(page)}
        />
      )}

      {currentPage === 'code-entry' && (
        <CodeEntry
          onCodeValid={handleCodeValid}
          onBack={() => setPage('welcome')}
        />
      )}

      {currentPage === 'tenant-welcome' && (
        <TenantWelcome
          tenantData={tenantWelcomeData}
          tenantCode={tenantWelcomeCode}
          onAccepted={() => setPage('inquilino-home')}
        />
      )}

      {currentPage === 'inquilino-home' && (
        <InquilinoHome
          userEmail={userEmail}
          tenantCodes={tenantCodes}
          onLogout={handleLogout}
          onCodesUpdate={handleCodesUpdate}
          onSwitchRole={handleSwitchRole}
          onGoToAuth={(step) => { setAuthInitialStep(step || 'login'); setPage('auth'); }}
        />
      )}

      {currentPage === 'planes' && (
        <Planes />
      )}

      {currentPage === 'politica-de-privacidad' && <PoliticaDePrivacidad />}
      {currentPage === 'terminos-de-servicio' && <TerminosDeServicio />}
      {currentPage === 'aviso-legal' && <AvisoLegal />}
      {currentPage === 'eliminar-cuenta' && <EliminarCuenta />}

      {currentPage === 'reset-password' && (
        <ResetPassword onSuccess={() => setPage('welcome')} />
      )}

      {currentPage === 'gestor-invite' && (
        <GestorInvite
          onAccepted={(user) => {
            setUserEmail(user.email);
            setUserType('gestor');
            localStorage.setItem('userType', 'gestor');
            setPage('gestor-dashboard');
          }}
        />
      )}

      {currentPage === 'gestor-invite-landlord' && (
        <GestorInviteLandlord
          onAccepted={(user) => {
            setUserEmail(user.email);
            setUserType('propietario');
            localStorage.setItem('userType', 'propietario');
            setPage('dashboard');
          }}
        />
      )}

      {showTermsModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px',
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '20px',
            padding: '32px 28px',
            width: '100%',
            maxWidth: '400px',
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#111', margin: '0 0 12px' }}>
              Hemos actualizado nuestros términos
            </h2>
            <p style={{ fontSize: '14px', color: '#555', lineHeight: '1.6', margin: '0 0 24px' }}>
              Para seguir usando Domio necesitamos que aceptes nuestros{' '}
              <a href="/terminos-de-servicio" target="_blank" rel="noreferrer" style={{ color: '#111', textDecoration: 'underline' }}>Términos y Condiciones</a>
              {' '}y nuestra{' '}
              <a href="/politica-de-privacidad" target="_blank" rel="noreferrer" style={{ color: '#111', textDecoration: 'underline' }}>Política de privacidad</a>
              {' '}actualizados.
            </p>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', marginBottom: '24px' }}>
              <input
                type="checkbox"
                checked={modalTermsAccepted}
                onChange={(e) => setModalTermsAccepted(e.target.checked)}
                style={{ marginTop: '3px', flexShrink: 0, width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '13px', color: '#444', lineHeight: '1.5' }}>
                He leído y acepto los{' '}
                <a href="/terminos-de-servicio" target="_blank" rel="noreferrer" style={{ color: '#111', textDecoration: 'underline' }}>Términos y Condiciones</a>
                {' '}y la{' '}
                <a href="/politica-de-privacidad" target="_blank" rel="noreferrer" style={{ color: '#111', textDecoration: 'underline' }}>Política de privacidad</a>
              </span>
            </label>
            <button
              onClick={handleModalAccept}
              disabled={!modalTermsAccepted || modalLoading}
              style={{
                width: '100%',
                padding: '14px',
                background: '#111',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: modalTermsAccepted && !modalLoading ? 'pointer' : 'not-allowed',
                opacity: modalTermsAccepted && !modalLoading ? 1 : 0.45,
                transition: 'opacity 0.15s ease',
              }}
            >
              {modalLoading ? 'Guardando…' : 'Aceptar y continuar'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
