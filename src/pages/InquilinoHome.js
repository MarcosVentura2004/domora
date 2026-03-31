import { useState, useEffect } from 'react';
import './InquilinoHome.css';
import CodeEntry from './CodeEntry';
import InquilinoDetail from './InquilinoDetail';
import ChatConversation, { getUnreadCount } from './ChatConversation';
import ProfileMenu from '../components/ProfileMenu';
import { supabase } from '../supabaseClient';

export default function InquilinoHome({ userEmail, tenantCodes, onLogout, onCodesUpdate, onSwitchRole }) {
  const [rentals, setRentals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddCode, setShowAddCode] = useState(false);
  const [viewingRental, setViewingRental] = useState(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [chatForRental, setChatForRental] = useState(null);

  // Construye los alquileres desde localStorage y verifica en Supabase si siguen activos
  useEffect(() => {
    if (!tenantCodes.length) {
      setRentals([]);
      setLoading(false);
      return;
    }

    const allCodes = JSON.parse(localStorage.getItem('tenant_codes') || '{}');

    const built = tenantCodes.map(code => {
      const meta = allCodes[code];
      if (!meta) return null;

      const props = JSON.parse(localStorage.getItem(`properties_${meta.landlordEmail}`) || '[]');
      const prop = props.find(p => String(p.id) === String(meta.propertyId));

      // Si no hay datos en localStorage usamos placeholders para mostrar la tarjeta expirada
      const address = prop?.name || code;
      let tenantName = '';
      let rent = prop?.price || 0;

      if (prop) {
        if (meta.roomId) {
          const room = (prop.rooms || []).find(r => String(r.id) === String(meta.roomId));
          rent = room?.price || prop.price;
          tenantName = room?.tenant?.name || '';
        } else {
          const tenant = (prop.tenants || []).find(t => String(t.id) === String(meta.tenantId));
          rent = tenant?.amount || prop.price;
          tenantName = tenant?.name || '';
        }
      }

      return {
        code,
        type: meta.roomId ? 'room' : 'alquilado',
        address,
        rent,
        tenantName,
        paymentConfig: prop?.paymentConfig || { startDay: 1, endDay: 5 },
        landlordEmail: meta.landlordEmail,
        propertyId: meta.propertyId,
        roomId: meta.roomId || null,
        tenantId: meta.tenantId,
        expired: false, // se actualiza tras verificar en Supabase
      };
    }).filter(Boolean);

    setRentals(built);
    setLoading(false);

    // Verificar en Supabase si cada código sigue activo
    built.forEach(async (rental) => {
      const { data, error } = await supabase.rpc('find_property_by_tenant_code', { p_code: rental.code });
      console.log('[InquilinoHome] RPC result for code', rental.code, '→ data:', data, '| error:', error);
      if (!data) {
        setRentals(prev =>
          prev.map(r => r.code === rental.code ? { ...r, expired: true } : r)
        );
      }
    });
  }, [tenantCodes]);

  const handleCodeValid = (code) => {
    if (!tenantCodes.includes(code)) {
      onCodesUpdate([...tenantCodes, code]);
    }
    setShowAddCode(false);
  };

  if (showAddCode) {
    return <CodeEntry onCodeValid={handleCodeValid} onBack={() => setShowAddCode(false)} />;
  }

  if (chatForRental) {
    return (
      <ChatConversation
        landlordEmail={chatForRental.landlordEmail}
        propertyId={chatForRental.propertyId}
        roomId={chatForRental.roomId}
        tenantId={chatForRental.tenantId}
        tenantName={chatForRental.tenantName}
        propertyName={chatForRental.address}
        currentRole="tenant"
        onBack={() => setChatForRental(null)}
      />
    );
  }

  if (viewingRental) {
    return (
      <InquilinoDetail
        rental={viewingRental}
        userEmail={userEmail}
        onBack={() => setViewingRental(null)}
      />
    );
  }

  const tenantName = rentals[0]?.tenantName || '';

  return (
    <div className="inquilino-home">
      {/* Header */}
      <div className="inquilino-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' }}>
          <button className="inquilino-profile-btn" onClick={() => setShowProfileMenu(!showProfileMenu)}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="16" fill="#E5E5E5"/>
              <path d="M16 16c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="#666"/>
            </svg>
          </button>
          <div>
            <h1 className="inquilino-greeting">Hola, {tenantName.split(' ')[0] || 'inquilino'}</h1>
            <p className="inquilino-subheading">Mis Alquileres</p>
          </div>
          {showProfileMenu && (
            <ProfileMenu
              userEmail={userEmail}
              role="tenant"
              onSwitchRole={onSwitchRole}
              onLogout={onLogout}
              onClose={() => setShowProfileMenu(false)}
            />
          )}
        </div>
      </div>

      {/* Rental cards */}
      <div className="inquilino-cards">
        {loading && (
          <div className="inquilino-empty">
            <p>Cargando tus alquileres…</p>
          </div>
        )}

        {!loading && rentals.length === 0 && (
          <div className="inquilino-empty">
            <p>Todavía no tienes ningún alquiler vinculado.</p>
            <p>Pulsa el botón para añadir tu código.</p>
          </div>
        )}

        {!loading && rentals.map((data) => {
          if (data.expired) {
            return (
              <div key={data.code} className="rental-card rental-card-expired">
                <div className="rental-card-main">
                  <div className="rental-address" style={{ color: '#bbb' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="#ccc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <polyline points="9 22 9 12 15 12 15 22" stroke="#ccc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>{data.address}</span>
                  </div>
                  <p className="rental-price" style={{ color: '#ccc' }}>{data.rent} €/mes</p>
                </div>
                <div className="rental-card-footer">
                  <span className="payment-badge expired">Contrato finalizado</span>
                </div>
              </div>
            );
          }

          const unread = getUnreadCount(data.landlordEmail, data.propertyId, data.roomId, data.tenantId, 'tenant');
          return (
            <div key={data.code} className="rental-card" style={{ cursor: 'default' }}>
              <div style={{ display: 'flex', alignItems: 'stretch' }}>
                <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setViewingRental(data)}>
                  <div className="rental-card-main">
                    <div className="rental-address">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <polyline points="9 22 9 12 15 12 15 22" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span>{data.address}</span>
                    </div>
                    <p className="rental-price">{data.rent} €/mes</p>
                  </div>
                  <div className="rental-card-footer">
                    <span className="payment-badge pending">
                      Pago pendiente ({data.paymentConfig.startDay}–{data.paymentConfig.endDay})
                    </span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <polyline points="9 18 15 12 9 6" stroke="#bbb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
                <button
                  onClick={() => setChatForRental(data)}
                  style={{
                    background: 'none', border: 'none', borderLeft: '1px solid #f0f0f0',
                    padding: '0 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}
                >
                  <div style={{ position: 'relative' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke={unread > 0 ? '#e74c3c' : '#aaa'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {unread > 0 && (
                      <span style={{
                        position: 'absolute', top: -5, right: -5,
                        background: '#e74c3c', color: 'white',
                        borderRadius: '50%', width: 16, height: 16,
                        fontSize: 10, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {unread}
                      </span>
                    )}
                  </div>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add rental button */}
      <button className="add-rental-btn" onClick={() => setShowAddCode(true)}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <line x1="12" y1="5" x2="12" y2="19" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="5" y1="12" x2="19" y2="12" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
        Añadir alquiler
      </button>
    </div>
  );
}
