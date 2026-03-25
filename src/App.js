import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Welcome from './pages/Welcome';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import CodeEntry from './pages/CodeEntry';
import InquilinoHome from './pages/InquilinoHome';
import './App.css';

function App() {
  const [currentPage, setCurrentPage] = useState('welcome');
  const [userType, setUserType] = useState(null); // 'propietario' o 'inquilino'
  const [userEmail, setUserEmail] = useState(null);
  const [tenantCodes, setTenantCodes] = useState([]);

  // Restore session on mount
  useEffect(() => {
    // Inquilinos no tienen cuenta Supabase — restaurar desde localStorage
    if (localStorage.getItem('userType') === 'inquilino') {
      setUserType('inquilino');
      const saved = JSON.parse(localStorage.getItem('inquilino_codes') || '[]');
      setTenantCodes(saved);
      setCurrentPage(saved.length > 0 ? 'inquilino-home' : 'code-entry');
      return;
    }

    const restoreFromUser = (user) => {
      setUserEmail(user.email);
      setUserType('propietario');
      localStorage.setItem('userType', 'propietario');
      setCurrentPage('dashboard');
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) restoreFromUser(session.user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        restoreFromUser(session.user);
      } else if (event === 'SIGNED_OUT') {
        setCurrentPage('welcome');
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
      setCurrentPage('code-entry');
    } else {
      setCurrentPage('auth');
    }
  };

  const handleLogin = async (user) => {
    setUserEmail(user.email);
    localStorage.setItem('userType', 'propietario');
    await supabase.auth.updateUser({ data: { userType: 'propietario' } });
    setCurrentPage('dashboard');
  };

  const handleCodeValid = (code) => {
    const updated = tenantCodes.includes(code) ? tenantCodes : [...tenantCodes, code];
    setTenantCodes(updated);
    localStorage.setItem('inquilino_codes', JSON.stringify(updated));
    setCurrentPage('inquilino-home');
  };

  const handleCodesUpdate = (codes) => {
    setTenantCodes(codes);
    localStorage.setItem('inquilino_codes', JSON.stringify(codes));
  };

  const handleLogout = async () => {
    if (userType === 'propietario') {
      await supabase.auth.signOut();
    }
    localStorage.removeItem('userType');
    localStorage.removeItem('inquilino_codes');
    setCurrentPage('welcome');
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
      setCurrentPage(saved.length > 0 ? 'inquilino-home' : 'code-entry');
    } else {
      await supabase.auth.updateUser({ data: { userType: 'propietario' } });
      setCurrentPage('dashboard');
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
          onBack={() => setCurrentPage('welcome')}
        />
      )}

      {currentPage === 'dashboard' && (
        <Dashboard
          userEmail={userEmail}
          onLogout={handleLogout}
          onSwitchRole={handleSwitchRole}
        />
      )}

      {currentPage === 'code-entry' && (
        <CodeEntry
          onCodeValid={handleCodeValid}
          onBack={() => setCurrentPage('welcome')}
        />
      )}

      {currentPage === 'inquilino-home' && (
        <InquilinoHome
          userEmail={userEmail}
          tenantCodes={tenantCodes}
          onLogout={handleLogout}
          onCodesUpdate={handleCodesUpdate}
          onSwitchRole={handleSwitchRole}
        />
      )}


    </div>
  );
}

export default App;
