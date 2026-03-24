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
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const savedType = localStorage.getItem('userType');
        if (savedType) {
          const email = session.user.email;
          setUserEmail(email);
          setUserType(savedType);
          if (savedType === 'inquilino') {
            const { data } = await supabase
              .from('inquilinos')
              .select('tenant_code')
              .eq('email', email.toLowerCase());
            if (data && data.length > 0) {
              const codes = data.map(r => r.tenant_code);
              setTenantCodes(codes);
              setCurrentPage('inquilino-home');
            } else {
              setCurrentPage('not-a-tenant');
            }
          } else {
            setCurrentPage('dashboard');
          }
        }
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
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
    setCurrentPage('auth');
  };

  const handleLogin = async (user) => {
    const email = user.email;
    setUserEmail(email);
    localStorage.setItem('userType', userType);

    if (userType === 'inquilino') {
      const { data, error } = await supabase
        .from('inquilinos')
        .select('tenant_code')
        .eq('email', email.toLowerCase());

      if (error || !data || data.length === 0) {
        setCurrentPage('not-a-tenant');
        return;
      }

      const codes = data.map(r => r.tenant_code);
      setTenantCodes(codes);
      localStorage.setItem(`inquilino_codes_${email}`, JSON.stringify(codes));
      setCurrentPage('inquilino-home');
    } else {
      setCurrentPage('dashboard');
    }
  };

  const handleCodeValid = (code) => {
    const updated = tenantCodes.includes(code) ? tenantCodes : [...tenantCodes, code];
    setTenantCodes(updated);
    localStorage.setItem(`inquilino_codes_${userEmail}`, JSON.stringify(updated));
    setCurrentPage('inquilino-home');
  };

  const handleCodesUpdate = (codes) => {
    setTenantCodes(codes);
    localStorage.setItem(`inquilino_codes_${userEmail}`, JSON.stringify(codes));
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('userType');
    setCurrentPage('welcome');
    setUserType(null);
    setUserEmail(null);
    setTenantCodes([]);
  };

  const handleSwitchRole = () => {
    const newType = userType === 'propietario' ? 'inquilino' : 'propietario';
    setUserType(newType);
    localStorage.setItem('userType', newType);
    if (newType === 'inquilino') {
      const saved = JSON.parse(localStorage.getItem(`inquilino_codes_${userEmail}`) || '[]');
      setTenantCodes(saved);
      setCurrentPage(saved.length > 0 ? 'inquilino-home' : 'code-entry');
    } else {
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

      {currentPage === 'not-a-tenant' && (
        <div className="not-tenant-screen">
          <h2>Acceso no permitido</h2>
          <p>Tu email no está registrado como inquilino en ninguna propiedad.</p>
          <p>Pide a tu propietario que te añada con tu email.</p>
          <button onClick={handleLogout}>Volver al inicio</button>
        </div>
      )}
    </div>
  );
}

export default App;
