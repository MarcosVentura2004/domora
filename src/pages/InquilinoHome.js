import { useState, useEffect } from 'react';
import './InquilinoHome.css';
import CodeEntry from './CodeEntry';
import InquilinoDetail from './InquilinoDetail';
import ChatConversation from './ChatConversation';
import ProfileMenu from '../components/ProfileMenu';
import { supabase } from '../supabaseClient';

export default function InquilinoHome({ userEmail, tenantCodes, onLogout, onCodesUpdate, onSwitchRole, onGoToAuth }) {
  const [rentals, setRentals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddCode, setShowAddCode] = useState(false);
  const [viewingRental, setViewingRental] = useState(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [chatForRental, setChatForRental] = useState(null);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [avatarUrl, setAvatarUrl] = useState(null);

  // Primer código activo, usado para la foto de perfil
  const firstCode = tenantCodes[0] || null;

  // Cargar avatar directamente desde Supabase Storage
  useEffect(() => {
    if (!firstCode) return;
    const path = `inquilino-${firstCode}.jpg`;
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
    if (urlData?.publicUrl) {
      const url = urlData.publicUrl + '?t=' + Date.now();
      const img = new window.Image();
      img.onload = () => setAvatarUrl(url);
      img.onerror = () => {};
      img.src = url;
    }
  }, [firstCode]);

  useEffect(() => {
    const active = rentals.filter(r => !r.expired);
    if (!active.length) return;

    const queries = active.flatMap(r => {
      let q = supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('landlord_email', r.landlordEmail)
        .eq('property_id', r.propertyId)
        .eq('sender', 'landlord')
        .eq('read_by_tenant', false)
        .eq('is_group_message', false);
      if (r.roomId) {
        q = q.eq('room_id', r.roomId);
      } else {
        q = q.is('room_id', null).eq('tenant_id', r.tenantId);
      }
      const privateQ = q.then(({ count }) => [r.code, count || 0]);

      const groupQ = r.hasGroupChat
        ? supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('landlord_email', r.landlordEmail)
            .eq('property_id', r.propertyId)
            .eq('is_group_message', true)
            .eq('sender', 'landlord')
            .eq('read_by_tenant', false)
            .then(({ count }) => [`${r.code}_group`, count || 0])
        : Promise.resolve([`${r.code}_group`, 0]);

      return [privateQ, groupQ];
    });

    Promise.all(queries).then(results => setUnreadCounts(Object.fromEntries(results)));
  }, [rentals]); // eslint-disable-line

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
        hasGroupChat: !!(prop?.isSharedProperty || prop?.status === 'por_habitaciones'),
        expired: false,
      };
    }).filter(Boolean);

    setRentals(built);
    setLoading(false);

    const now = new Date();

    built.forEach(async (rental) => {
      const { data } = await supabase.rpc('find_property_by_tenant_code', { p_code: rental.code });
      if (!data) {
        setRentals(prev =>
          prev.map(r => r.code === rental.code ? { ...r, expired: true } : r)
        );
        return;
      }
      const col = rental.roomId ? 'room_id' : 'tenant_id';
      const val = rental.roomId || rental.tenantId;
      const { data: payment } = await supabase
        .from('payments')
        .select('status')
        .eq(col, val)
        .eq('year', now.getFullYear())
        .eq('month', now.getMonth())
        .maybeSingle();
      if (payment) {
        setRentals(prev =>
          prev.map(r => r.code === rental.code ? { ...r, paymentStatus: payment.status } : r)
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
  const avatarInitial = (tenantName || userEmail || 'I').charAt(0).toUpperCase();

  return (
    <div className="inquilino-home">
      {/* Header */}
      <div className="inquilino-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' }}>
          <button
            className="inquilino-profile-btn"
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: '#E5E5E5',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', fontWeight: 700, color: '#666',
              }}>
                {avatarInitial}
              </div>
            )}
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
              tenantCode={firstCode}
              currentAvatarUrl={avatarUrl}
              onAvatarUpdate={setAvatarUrl}
              onGoToAuth={onGoToAuth}
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

          const unread = (unreadCounts[data.code] || 0) + (unreadCounts[`${data.code}_group`] || 0);
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
                    {data.paymentStatus === 'confirmed' && (
                      <span className="payment-badge paid">Pago confirmado</span>
                    )}
                    {data.paymentStatus === 'pending' && (
                      <span className="payment-badge sent">Pago enviado — pendiente de confirmar</span>
                    )}
                    {!data.paymentStatus && (
                      <span className="payment-badge pending">
                        Pago pendiente ({data.paymentConfig.startDay}–{data.paymentConfig.endDay})
                      </span>
                    )}
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

/*
  SQL para añadir el campo avatar_url a la tabla inquilinos (ejecutar manualmente en Supabase):

  ALTER TABLE inquilinos ADD COLUMN IF NOT EXISTS avatar_url TEXT;
*/
