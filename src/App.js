import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import Welcome from './pages/Welcome';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import GestorDashboard from './pages/GestorDashboard';
import CodeEntry from './pages/CodeEntry';
import InquilinoHome from './pages/InquilinoHome';
import Planes from './pages/Planes';
import ResetPassword from './pages/ResetPassword';
import GestorInvite from './pages/GestorInvite';
import './App.css';

function App() {
  const initialPage = window.location.pathname === '/planes'
    ? 'planes'
    : window.location.pathname === '/reset-password'
    ? 'reset-password'
    : window.location.pathname === '/gestor-invite'
    ? 'gestor-invite'
    : 'welcome';
  const [currentPage, rawSetPage] = useState(initialPage);
  const currentPageRef = useRef(initialPage);
  const setPage = (page) => { currentPageRef.current = page; rawSetPage(page); };
  const [userType, setUserType] = useState(null); // 'propietario' o 'inquilino'
  const [userEmail, setUserEmail] = useState(null);
  const [tenantCodes, setTenantCodes] = useState([]);
  const [authInitialStep, setAuthInitialStep] = useState('login');

  // Paginas que gestionan su propia autenticacion — el listener global no debe
  // redirigirlas bajo ninguna circunstancia.
  const PUBLIC_PAGES = ['planes', 'reset-password', 'gestor-invite'];

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

      if (accessData && accessData.length > 0) {
        setUserType('gestor');
        localStorage.setItem('userType', 'gestor');
        setPage('gestor-dashboard');
        return;
      }

      setUserType('propietario');
      localStorage.setItem('userType', 'propietario');
      setPage('dashboard');
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

    setUserType('propietario');
    localStorage.setItem('userType', 'propietario');
    setPage('dashboard');
  };

  const handleCodeValid = (code) => {
    const updated = tenantCodes.includes(code) ? tenantCodes : [...tenantCodes, code];
    setTenantCodes(updated);
    localStorage.setItem('inquilino_codes', JSON.stringify(updated));
    setPage('inquilino-home');
  };

  const handleCodesUpdate = (codes) => {
    setTenantCodes(codes);
    localStorage.setItem('inquilino_codes', JSON.stringify(codes));
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
      {currentPage === 'welcome' && (
        <Welcome onSelectUserType={handleSelectUserType} />
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
        />
      )}

      {currentPage === 'gestor-dashboard' && (
        <GestorDashboard
          userEmail={userEmail}
          onLogout={handleLogout}
        />
      )}

      {currentPage === 'code-entry' && (
        <CodeEntry
          onCodeValid={handleCodeValid}
          onBack={() => setPage('welcome')}
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

    </div>
  );
}

export default App;
