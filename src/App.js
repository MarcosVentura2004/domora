import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import Welcome from './pages/Welcome';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import GestorDashboard from './pages/GestorDashboard';
import CodeEntry from './pages/CodeEntry';
import InquilinoHome from './pages/InquilinoHome';
import Planes from './pages/Planes';
import './App.css';

function App() {
  const initialPage = window.location.pathname === '/planes' ? 'planes' : 'welcome';
  const [currentPage, rawSetPage] = useState(initialPage);
  const currentPageRef = useRef(initialPage);
  const setPage = (page) => { currentPageRef.current = page; rawSetPage(page); };
  const [userType, setUserType] = useState(null); // 'propietario' o 'inquilino'
  const [userEmail, setUserEmail] = useState(null);
  const [tenantCodes, setTenantCodes] = useState([]);
  const [authInitialStep, setAuthInitialStep] = useState('login');

  // Restore session on mount
  useEffect(() => {
    // Paginas publicas que nunca deben ser redirigidas por logica de sesion
    if (currentPageRef.current === 'planes') return;

    // Inquilinos no tienen cuenta Supabase — restaurar desde localStorage
    if (localStorage.getItem('userType') === 'inquilino') {
      setUserType('inquilino');
      const saved = JSON.parse(localStorage.getItem('inquilino_codes') || '[]');
      setTenantCodes(saved);
      setPage(saved.length > 0 ? 'inquilino-home' : 'code-entry');
      return;
    }

    const restoreFromUser = async (user) => {
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
      } else {
        setUserType('propietario');
        localStorage.setItem('userType', 'propietario');
        setPage('dashboard');
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && currentPageRef.current !== 'auth') restoreFromUser(session.user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // INITIAL_SESSION se dispara al montar junto a getSession — ignorarlo para evitar
      // doble llamada a restoreFromUser. Solo reaccionar a SIGNED_IN real (post-login).
      if (event === 'INITIAL_SESSION') return;
      if (event === 'SIGNED_IN' && session?.user && currentPageRef.current !== 'auth') {
        restoreFromUser(session.user);
      } else if (event === 'SIGNED_OUT') {
        setPage('welcome');
        setUserType(null);
        setUserEmail(null);
        setTenantCodes([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

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
    } else {
      setUserType('propietario');
      localStorage.setItem('userType', 'propietario');
      await supabase.auth.updateUser({ data: { userType: 'propietario' } });
      setPage('dashboard');
    }
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

    </div>
  );
}

export default App;
