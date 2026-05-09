import { useState, useEffect, useRef } from 'react';
import './Dashboard.css';
import { supabase } from '../supabaseClient';
import PropertyDetail from './PropertyDetail';
import VacationalDetail from './VacationalDetail';
import GeneralPanel from './GeneralPanel';
import ChatConversation from './ChatConversation';
import Settings from './Settings';
import Dashboard from './Dashboard';
import { getFile } from '../utils/fileStorage';

// ── Iconos de estado ───────────────────────────────────────────────────────
function getPropertyIcon(status, size = 48) {
  const s = size;
  if (status === 'alquilado') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9 21V12h6v9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
  if (status === 'por_habitaciones') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="12" y1="12" x2="12" y2="21" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="5.5" y1="16.5" x2="18.5" y2="16.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
  if (status === 'vacacional') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M12 3.5V2M12 16v-3.5M18.5 9H20M4 9h1.5M16.9 5.1l1-1M6.1 14.9l1-1M16.9 12.9l1 1M6.1 7.1l1 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M3 20h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M7 20c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
  if (status === 'vacio') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3 2.5"/>
      <path d="M10.5 21v-4.5a1.5 1.5 0 0 1 3 0V21" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
  if (status === 'uso_propio') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="12" cy="13" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M8.5 21c0-1.9 1.6-3.5 3.5-3.5s3.5 1.6 3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="13" height="18" rx="1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16 8h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="7" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="7" y1="12" x2="11" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="7" y1="16" x2="11" y2="16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

// ── Avatar de propietario con fallback a iniciales ─────────────────────────
function LandlordAvatar({ email, name, avatarUrl, size = 56 }) {
  const [failed, setFailed] = useState(false);
  const label = name && name !== email ? name : email;
  const initials = label.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';

  if (avatarUrl && !failed) {
    return (
      <img
        src={avatarUrl}
        alt={label}
        onError={() => setFailed(true)}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: '#EBEBEB', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontSize: Math.round(size * 0.33),
      fontWeight: 700, color: '#555', letterSpacing: '-0.5px',
    }}>
      {initials}
    </div>
  );
}

const CATEGORIES = [
  {
    key: 'en_alquiler',
    title: 'En alquiler',
    statuses: ['alquilado', 'por_habitaciones', 'vacacional'],
    representativeStatus: 'alquilado',
    color: '#16A34A',
    bgColor: '#F0FDF4',
  },
  {
    key: 'vacias',
    title: 'Vacias',
    statuses: ['vacio'],
    representativeStatus: 'vacio',
    color: '#DC2626',
    bgColor: '#FEF2F2',
  },
  {
    key: 'uso_propio',
    title: 'Uso propio',
    statuses: ['uso_propio'],
    representativeStatus: 'uso_propio',
    color: '#2563EB',
    bgColor: '#EFF6FF',
  },
  {
    key: 'otros',
    title: 'Otros',
    statuses: ['otros'],
    representativeStatus: 'otros',
    color: '#7C3AED',
    bgColor: '#F5F3FF',
  },
];

// ── Helpers de tenants ─────────────────────────────────────────────────────
function getGestorTenants(properties, accessMap) {
  const list = [];
  properties.forEach(prop => {
    const landlordEmail = prop.landlord_email || accessMap[prop.id]?.landlordEmail || '';
    const isGroupEligible = prop.status === 'por_habitaciones' || prop.isSharedProperty;
    if (isGroupEligible) {
      const names = prop.status === 'por_habitaciones'
        ? (prop.rooms || []).filter(r => r.tenant?.name).map(r => r.tenant.name)
        : (prop.tenants || []).map(t => t.name).filter(Boolean);
      list.push({
        key: `${prop.id}_group`,
        landlordEmail,
        propertyId: prop.id,
        propertyName: prop.name,
        tenantName: `Inquilinos · ${prop.name}`,
        tenantSubtitle: names.join(', ') || 'Sin inquilinos',
        tenantId: null,
        roomId: null,
        isGroup: true,
      });
    }
    if (prop.status === 'alquilado' || prop.status === 'otros') {
      (prop.tenants || []).forEach(t => {
        list.push({
          key: `${prop.id}_${t.id}`,
          landlordEmail,
          propertyId: prop.id,
          propertyName: prop.name,
          tenantName: t.name,
          tenantId: t.id,
          roomId: null,
        });
      });
    }
    if (prop.status === 'por_habitaciones') {
      (prop.rooms || []).filter(r => r.tenant).forEach(room => {
        list.push({
          key: `${prop.id}_${room.id}`,
          landlordEmail,
          propertyId: prop.id,
          propertyName: prop.name,
          tenantName: room.tenant.name || '',
          tenantId: room.tenant.id || room.id,
          roomId: room.id,
        });
      });
    }
  });
  return list;
}

// ── Componente principal ───────────────────────────────────────────────────
export default function GestorDashboard({ userEmail, onLogout }) {
  const [gestorName, setGestorName] = useState('');
  const [accessMap, setAccessMap] = useState({}); // { [property_id]: { permisos, landlordEmail, canMessage } }
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Seleccion de propietario ─────────────────────────────────────────────
  const [landlordsList, setLandlordsList] = useState([]); // [{ email, name, avatarUrl, propertyCount, canMessage }]
  const [selectedLandlord, setSelectedLandlord] = useState(null);

  const [activeTab, setActiveTab] = useState('general');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [viewingEntry, setViewingEntry] = useState(null);
  const [chatWith, setChatWith] = useState(null);
  const [tenantMeta, setTenantMeta] = useState({});
  const [landlordDirectMeta, setLandlordDirectMeta] = useState({}); // { [landlordEmail]: { unread, lastTs, lastContent } }
  const [metaTick, setMetaTick] = useState(0);

  const [hasOwnProperties, setHasOwnProperties] = useState(null);
  const [mainTab, setMainTab] = useState('gestion');

  const [gestorAvatarUrl, setGestorAvatarUrl] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const tabHeaderRef = useRef(null);
  const [tabHeaderHeight, setTabHeaderHeight] = useState(106);

  const [showPropertySearch, setShowPropertySearch] = useState(false);
  const [propertySearch, setPropertySearch] = useState('');
  const [showChatSearch, setShowChatSearch] = useState(false);
  const [chatSearch, setChatSearch] = useState('');

  const switchTab = (tab) => {
    setActiveTab(tab);
    setSelectedCategory(null);
    setShowPropertySearch(false);
    setPropertySearch('');
    setShowChatSearch(false);
    setChatSearch('');
  };

  const handleBackToLandlords = () => {
    setSelectedLandlord(null);
    setSelectedCategory(null);
    setViewingEntry(null);
    setChatWith(null);
    setShowPropertySearch(false);
    setPropertySearch('');
    setShowChatSearch(false);
    setChatSearch('');
    setActiveTab('general');
  };

  const switchMainTab = (tab) => {
    setMainTab(tab);
    setSelectedLandlord(null);
    setViewingEntry(null);
    setChatWith(null);
    setSelectedCategory(null);
    setActiveTab('general');
  };

  useEffect(() => {
    if (!tabHeaderRef.current) return;
    const observer = new ResizeObserver(() => {
      if (tabHeaderRef.current) setTabHeaderHeight(tabHeaderRef.current.offsetHeight);
    });
    observer.observe(tabHeaderRef.current);
    setTabHeaderHeight(tabHeaderRef.current.offsetHeight);
    return () => observer.disconnect();
  }, [hasOwnProperties, mainTab]);

  // ── Carga inicial ────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true);

      const { data: gestorRow } = await supabase
        .from('gestores')
        .select('nombre')
        .eq('email', userEmail)
        .maybeSingle();
      setGestorName(gestorRow?.nombre || userEmail);

      const localAvatar = await getFile(`avatar_${userEmail}`).catch(() => null);
      if (localAvatar) {
        setGestorAvatarUrl(localAvatar);
      } else {
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(`${userEmail}/avatar`);
        if (urlData?.publicUrl) setGestorAvatarUrl(urlData.publicUrl + '?t=1');
      }

      const { data: ownPropsData } = await supabase
        .from('properties')
        .select('id')
        .eq('landlord_email', userEmail)
        .limit(1);
      setHasOwnProperties((ownPropsData || []).length > 0);

      const { data: accessRows, error } = await supabase
        .from('property_access')
        .select('property_id, landlord_email, permisos, can_message')
        .eq('gestor_email', userEmail);

      if (error || !accessRows || accessRows.length === 0) {
        setAccessMap({});
        setProperties([]);
        setLandlordsList([]);
        setLoading(false);
        return;
      }

      const map = {};
      accessRows.forEach(r => {
        map[r.property_id] = {
          permisos: r.permisos,
          landlordEmail: r.landlord_email,
          canMessage: r.can_message !== false,
        };
      });
      setAccessMap(map);

      // ── Construir lista de propietarios unicos con canMessage ───────────
      const uniqueEmails = [...new Set(accessRows.map(r => r.landlord_email))];

      const { data: landlordRows } = await supabase
        .from('landlords')
        .select('email, name')
        .in('email', uniqueEmails);

      const landlordNameMap = {};
      (landlordRows || []).forEach(l => { landlordNameMap[l.email] = l.name; });

      const list = uniqueEmails.map(email => {
        const { data: urlData } = supabase.storage
          .from('avatars')
          .getPublicUrl(`${email}/avatar`);
        const canMessage = accessRows
          .filter(r => r.landlord_email === email)
          .some(r => r.can_message !== false);
        return {
          email,
          name: landlordNameMap[email] || email,
          avatarUrl: urlData?.publicUrl || null,
          propertyCount: accessRows.filter(r => r.landlord_email === email).length,
          canMessage,
        };
      });
      setLandlordsList(list);

      const ids = accessRows.map(r => r.property_id);
      const { data: propRows } = await supabase
        .from('properties')
        .select('id, landlord_email, data')
        .in('id', ids);

      const props = (propRows || [])
        .map(r => r.data ? { ...r.data, landlord_email: r.landlord_email } : null)
        .filter(Boolean);
      setProperties(props);
      setLoading(false);
    }
    load();
  }, [userEmail]);

  // ── Carga unread counts de inquilinos ────────────────────────────────────
  useEffect(() => {
    const ids = Object.keys(accessMap);
    if (ids.length === 0) return;
    supabase
      .from('messages')
      .select('property_id, room_id, tenant_id, sender, read_by_landlord, content, created_at, is_group_message')
      .in('property_id', ids)
      .then(({ data }) => {
        if (!data) return;
        const meta = {};
        getGestorTenants(properties, accessMap).forEach(t => {
          const convMsgs = data.filter(m =>
            t.isGroup
              ? m.property_id === t.propertyId && m.is_group_message
              : t.roomId
                ? m.property_id === t.propertyId && m.room_id === t.roomId && !m.is_group_message
                : m.property_id === t.propertyId && !m.room_id && m.tenant_id === t.tenantId && !m.is_group_message
          );
          const unread = convMsgs.filter(m => m.sender === 'tenant' && !m.read_by_landlord).length;
          const last = convMsgs[convMsgs.length - 1];
          meta[t.key] = { unread, lastTs: last?.created_at || '', lastContent: last?.content || '' };
        });
        setTenantMeta(meta);
      });
  }, [properties, accessMap, metaTick]); // eslint-disable-line

  // ── Carga unread counts de mensajes directos con propietarios ────────────
  useEffect(() => {
    if (!userEmail || landlordsList.length === 0) return;
    supabase
      .from('messages')
      .select('sender_id, recipient_id, content, created_at, read_by_tenant, is_direct_message')
      .eq('is_direct_message', true)
      .or(`sender_id.eq.${userEmail},recipient_id.eq.${userEmail}`)
      .then(({ data }) => {
        if (!data) return;
        const meta = {};
        landlordsList.forEach(l => {
          const convMsgs = data.filter(m =>
            (m.sender_id === userEmail && m.recipient_id === l.email) ||
            (m.sender_id === l.email && m.recipient_id === userEmail)
          );
          const unread = convMsgs.filter(m => m.sender_id === l.email && !m.read_by_tenant).length;
          const last = convMsgs[convMsgs.length - 1];
          meta[l.email] = { unread, lastTs: last?.created_at || '', lastContent: last?.content || '' };
        });
        setLandlordDirectMeta(meta);
      });
  }, [landlordsList, userEmail, metaTick]); // eslint-disable-line

  // ── Actualizar propiedad ─────────────────────────────────────────────────
  const handleUpdateProperty = async (updatedProperty) => {
    if (updatedProperty.deleted) return;
    const landlordEmail = accessMap[updatedProperty.id]?.landlordEmail;
    const { error } = await supabase.from('properties').upsert({
      id: updatedProperty.id,
      landlord_email: landlordEmail,
      data: updatedProperty,
      updated_at: new Date().toISOString(),
    });
    if (error) console.error('Error guardando propiedad:', error);
    setProperties(prev => prev.map(p => p.id === updatedProperty.id ? updatedProperty : p));
    setViewingEntry(prev => prev ? { ...prev, property: updatedProperty } : null);
  };

  // ── Ajustes del gestor ───────────────────────────────────────────────────
  if (showSettings) {
    return (
      <Settings
        userEmail={userEmail}
        onBack={() => setShowSettings(false)}
        onLogout={onLogout}
        role="gestor"
      />
    );
  }

  // ── Vista de detalle de propiedad ────────────────────────────────────────
  if (viewingEntry) {
    const { property, permisos, landlordEmail } = viewingEntry;
    const isReadOnly = permisos === 'lectura';
    if (property.status === 'vacacional') {
      return (
        <VacationalDetail
          property={property}
          onBack={() => setViewingEntry(null)}
          onUpdate={isReadOnly ? () => {} : handleUpdateProperty}
          landlordEmail={landlordEmail}
          readOnly={isReadOnly}
        />
      );
    }
    return (
      <PropertyDetail
        property={property}
        onBack={() => setViewingEntry(null)}
        onUpdate={isReadOnly ? () => {} : handleUpdateProperty}
        landlordEmail={landlordEmail}
        readOnly={isReadOnly}
      />
    );
  }

  // ── Pantalla de carga ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f7f8fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#aaa' }}>
          <div style={{
            width: 32, height: 32, border: '3px solid #e5e5e5', borderTopColor: '#111',
            borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
          }} />
          Cargando…
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Modo "Mis propiedades" ────────────────────────────────────────────────
  if (mainTab === 'mis_propiedades') {
    return (
      <div>
        <div
          ref={tabHeaderRef}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2000,
            background: 'white', borderBottom: '1px solid #f0f0f0',
          }}
        >
          <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111', lineHeight: 1.2 }}>{gestorName || userEmail}</p>
              <p style={{ margin: 0, fontSize: 12, color: '#aaa', lineHeight: 1.2 }}>Gestor</p>
            </div>
            <button
              onClick={() => setShowSettings(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
              aria-label="Ajustes"
            >
              <LandlordAvatar email={userEmail} name={gestorName} avatarUrl={gestorAvatarUrl} size={36} />
            </button>
          </div>
          <div style={{ display: 'flex', borderTop: '1px solid #f0f0f0' }}>
            <button
              onClick={() => switchMainTab('mis_propiedades')}
              style={{
                flex: 1, padding: '10px 0', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 700, color: '#111',
                borderBottom: '2px solid #111',
              }}
            >
              Mis propiedades
            </button>
            <button
              onClick={() => switchMainTab('gestion')}
              style={{
                flex: 1, padding: '10px 0', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 500, color: '#aaa',
                borderBottom: '2px solid transparent',
              }}
            >
              Gestion
            </button>
          </div>
        </div>
        <div style={{
          position: 'fixed', top: tabHeaderHeight, left: 0, right: 0, bottom: 0,
          overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch',
        }}>
          <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
            <Dashboard userEmail={userEmail} onLogout={onLogout} onSwitchRole={() => {}} hideHeader={true} chatHideAvatar={true} />
          </div>
        </div>
      </div>
    );
  }

  // ── Pantalla de seleccion de propietario ─────────────────────────────────
  if (!selectedLandlord) {
    return (
      <div style={{ minHeight: '100vh', background: '#f7f8fa' }}>
        <div style={{
          background: 'white',
          borderBottom: '1px solid #f0f0f0',
          position: 'sticky', top: 0, zIndex: 100,
        }}>
          <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111', lineHeight: 1.2 }}>
                {gestorName || userEmail}
              </p>
              <p style={{ margin: 0, fontSize: 12, color: '#aaa', lineHeight: 1.2 }}>Gestor</p>
            </div>
            <button
              onClick={() => setShowSettings(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
              aria-label="Ajustes"
            >
              <LandlordAvatar email={userEmail} name={gestorName} avatarUrl={gestorAvatarUrl} size={38} />
            </button>
          </div>
          <div style={{ display: 'flex', borderTop: '1px solid #f0f0f0' }}>
            <button
              onClick={() => switchMainTab('mis_propiedades')}
              style={{
                flex: 1, padding: '10px 0', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 500, color: '#aaa',
                borderBottom: '2px solid transparent',
              }}
            >
              Mis propiedades
            </button>
            <button
              onClick={() => switchMainTab('gestion')}
              style={{
                flex: 1, padding: '10px 0', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 700, color: '#111',
                borderBottom: '2px solid #111',
              }}
            >
              Gestion
            </button>
          </div>
        </div>

        <div style={{ padding: '28px 20px 8px' }}>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111', letterSpacing: '-0.4px' }}>
            Propietarios
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#aaa' }}>
            Selecciona el propietario que quieres gestionar
          </p>
        </div>

        {landlordsList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 30px' }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%', background: '#f0f0f0',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="#bbb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="9" cy="7" r="4" stroke="#bbb" strokeWidth="2"/>
              </svg>
            </div>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#333' }}>Sin propietarios asignados</p>
            <p style={{ margin: '8px 0 0', fontSize: 14, color: '#aaa', lineHeight: 1.5 }}>
              Aun no tienes acceso a propiedades de ningun propietario.
            </p>
          </div>
        ) : (
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {landlordsList.map(landlord => (
              <button
                key={landlord.email}
                onClick={() => setSelectedLandlord(landlord)}
                style={{
                  width: '100%', background: 'white', border: 'none', borderRadius: 16,
                  padding: '16px', display: 'flex', alignItems: 'center', gap: 14,
                  cursor: 'pointer', textAlign: 'left',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                }}
              >
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <LandlordAvatar
                    email={landlord.email}
                    name={landlord.name}
                    avatarUrl={landlord.avatarUrl}
                    size={52}
                  />
                  {(landlordDirectMeta[landlord.email]?.unread || 0) > 0 && (
                    <span style={{
                      position: 'absolute', top: 0, right: 0,
                      background: '#e74c3c', color: 'white',
                      borderRadius: '50%', width: 18, height: 18,
                      fontSize: 11, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '2px solid white',
                    }}>
                      {landlordDirectMeta[landlord.email].unread}
                    </span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {landlord.name !== landlord.email ? landlord.name : landlord.email}
                  </p>
                  {landlord.name !== landlord.email && (
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {landlord.email}
                    </p>
                  )}
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>
                    {landlord.propertyCount} {landlord.propertyCount === 1 ? 'propiedad' : 'propiedades'}
                  </p>
                </div>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: '#ccc' }}>
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            ))}
          </div>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Dashboard filtrado por propietario seleccionado ──────────────────────
  const filteredProperties = properties.filter(p => p.landlord_email === selectedLandlord.email);
  const tenants = getGestorTenants(filteredProperties, accessMap);

  // Determinar si el gestor puede ver mensajes del propietario seleccionado
  const canMessageSelectedLandlord = selectedLandlord.canMessage === true;

  // Unread total: inquilinos + mensaje directo con el propietario
  const tenantUnread = Object.values(tenantMeta).reduce((sum, m) => sum + (m.unread || 0), 0);
  const landlordDirectUnread = canMessageSelectedLandlord
    ? (landlordDirectMeta[selectedLandlord.email]?.unread || 0)
    : 0;
  const totalUnread = tenantUnread + landlordDirectUnread;

  const BackButton = () => (
    <button
      onClick={handleBackToLandlords}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '4px 0', color: '#111', fontSize: 14, fontWeight: 500,
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      Volver
    </button>
  );

  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>

      {/* ── Tab: Resumen ── */}
      {activeTab === 'general' && (
        <>
          <div style={{
            background: 'white', borderBottom: '1px solid #f0f0f0',
            padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10,
            position: 'sticky', top: 0, zIndex: 200,
          }}>
            <BackButton />
            <div style={{ flex: 1 }} />
            <LandlordAvatar
              email={selectedLandlord.email}
              name={selectedLandlord.name}
              avatarUrl={selectedLandlord.avatarUrl}
              size={28}
            />
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#111', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedLandlord.name !== selectedLandlord.email ? selectedLandlord.name : selectedLandlord.email}
            </p>
          </div>
          <GeneralPanel
            properties={filteredProperties}
            userEmail={userEmail}
            onNavigateToProperties={() => switchTab('properties')}
            onOpenSettings={onLogout}
            avatarUrl={null}
            avatarValid={false}
            onAvatarLoad={() => {}}
            onAvatarError={() => {}}
            hideAvatar={true}
          />
        </>
      )}

      {/* ── Tab: Propiedades ── */}
      {activeTab === 'properties' && (
        <div className="dashboard-container" style={{ paddingBottom: '80px' }}>

          {selectedCategory === null ? (
            <>
              <div className="dashboard-header">
                <BackButton />
                <span style={{ fontWeight: 600, fontSize: '17px', color: '#111' }}>Propiedades</span>
                <button
                  onClick={() => { setShowPropertySearch(!showPropertySearch); setPropertySearch(''); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center', color: '#555' }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
                    <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>

              <div style={{ padding: '0 20px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <LandlordAvatar
                  email={selectedLandlord.email}
                  name={selectedLandlord.name}
                  avatarUrl={selectedLandlord.avatarUrl}
                  size={22}
                />
                <p style={{ margin: 0, fontSize: 12, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedLandlord.name !== selectedLandlord.email ? selectedLandlord.name : selectedLandlord.email}
                </p>
              </div>

              {showPropertySearch && (
                <>
                  <div
                    onClick={() => { setShowPropertySearch(false); setPropertySearch(''); }}
                    style={{ position: 'fixed', inset: 0, zIndex: 90 }}
                  />
                  <div style={{ padding: '10px 20px', background: 'white', borderBottom: '1px solid #f0f0f0', position: 'relative', zIndex: 91 }}>
                    <div style={{ position: 'relative', maxWidth: '600px', margin: '0 auto' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}>
                        <circle cx="11" cy="11" r="7" stroke="#aaa" strokeWidth="2"/>
                        <path d="M20 20l-3-3" stroke="#aaa" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                      <input
                        autoFocus
                        type="text"
                        placeholder="Buscar en todas las propiedades..."
                        value={propertySearch}
                        onChange={e => setPropertySearch(e.target.value)}
                        style={{
                          width: '100%', padding: '10px 12px 10px 36px', border: '1px solid #e5e5e5',
                          borderRadius: '10px', fontSize: '15px', boxSizing: 'border-box', outline: 'none',
                          background: '#f7f7f7',
                        }}
                      />
                    </div>
                  </div>
                </>
              )}

              {propertySearch.trim() ? (
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {(() => {
                    const results = filteredProperties.filter(p =>
                      p.name.toLowerCase().includes(propertySearch.toLowerCase())
                    );
                    if (results.length === 0) {
                      return <div className="empty-state"><p>Sin resultados</p></div>;
                    }
                    return results.map(property => {
                      const cat = CATEGORIES.find(c => c.statuses.includes(property.status));
                      const statusLabel =
                        property.status === 'alquilado'       ? 'Alquilado' :
                        property.status === 'por_habitaciones' ? 'Por habitaciones' :
                        property.status === 'vacacional'       ? 'Vacacional' :
                        property.status === 'otros'            ? (property.customType || 'Otros') :
                        property.status === 'uso_propio'       ? 'Uso propio' : 'Vacio';
                      const priceLabel =
                        property.status === 'vacacional'
                          ? `${(property.bookings || []).filter(b => {
                              const now = new Date();
                              return b.status === 'confirmed' &&
                                new Date(b.startDate).getMonth() === now.getMonth() &&
                                new Date(b.startDate).getFullYear() === now.getFullYear();
                            }).length} reservas este mes`
                          : property.status === 'uso_propio' ? 'Uso propio'
                          : `${property.price} euros/mes`;
                      const { permisos, landlordEmail } = accessMap[property.id] || {};
                      return (
                        <div
                          key={property.id}
                          className="property-card"
                          onClick={() => setViewingEntry({ property, permisos, landlordEmail })}
                          style={{ cursor: 'pointer' }}
                        >
                          <div className="property-info">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                              <div style={{
                                width: 38, height: 38, borderRadius: '10px', flexShrink: 0,
                                background: cat?.bgColor || '#F0F1F3',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: cat?.color || '#555',
                              }}>
                                {getPropertyIcon(property.status, 20)}
                              </div>
                              <h3 className="property-name" style={{ margin: 0 }}>{property.name}</h3>
                            </div>
                            <div className="property-status">
                              <span className={`status-dot ${property.status}`}></span>
                              <span className="status-text">{statusLabel}</span>
                            </div>
                            <p className="property-price">{priceLabel}</p>
                          </div>
                          <button className="property-arrow" onClick={() => setViewingEntry({ property, permisos, landlordEmail })}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                              <path d="M9 6l6 6-6 6" stroke="#bbb" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                          </button>
                        </div>
                      );
                    });
                  })()}
                </div>
              ) : (
                <div className="category-grid-wrapper">
                  {filteredProperties.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '80px 30px' }}>
                      <div style={{
                        width: 72, height: 72, borderRadius: '50%', background: '#f0f0f0',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
                      }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" stroke="#bbb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M9 21V12h6v9" stroke="#bbb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#333' }}>Sin propiedades asignadas</p>
                      <p style={{ margin: '8px 0 0', fontSize: 14, color: '#aaa', lineHeight: 1.5 }}>
                        El propietario aun no te ha dado acceso a ninguna propiedad.
                      </p>
                    </div>
                  ) : (
                    <div className="category-grid">
                      {CATEGORIES.map(cat => {
                        const count = filteredProperties.filter(p => cat.statuses.includes(p.status)).length;
                        return (
                          <button
                            key={cat.key}
                            className="category-card"
                            style={{ opacity: count === 0 ? 0.42 : 1 }}
                            onClick={() => setSelectedCategory(cat)}
                          >
                            <div className="category-card-icon" style={{ color: cat.color, background: cat.bgColor }}>
                              {getPropertyIcon(cat.representativeStatus)}
                            </div>
                            <p className="category-card-title">{cat.title}</p>
                            <p className="category-card-count">
                              {count} {count === 1 ? 'propiedad' : 'propiedades'}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="dashboard-header">
                <button
                  onClick={() => setSelectedCategory(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px 4px 0', display: 'flex', alignItems: 'center', color: '#111' }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <span style={{ fontWeight: 600, fontSize: '17px', color: '#111' }}>{selectedCategory.title}</span>
                <div style={{ width: 60 }} />
              </div>

              {(() => {
                const catProperties = filteredProperties.filter(p => selectedCategory.statuses.includes(p.status));
                if (catProperties.length === 0) {
                  return (
                    <div className="empty-state">
                      <p>No hay propiedades asignadas en esta categoria</p>
                    </div>
                  );
                }
                return (
                  <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {catProperties.map(property => {
                      const statusLabel =
                        property.status === 'alquilado'       ? 'Alquilado' :
                        property.status === 'por_habitaciones' ? 'Por habitaciones' :
                        property.status === 'vacacional'       ? 'Vacacional' :
                        property.status === 'otros'            ? (property.customType || 'Otros') :
                        property.status === 'uso_propio'       ? 'Uso propio' : 'Vacio';
                      const priceLabel =
                        property.status === 'vacacional'
                          ? `${(property.bookings || []).filter(b => {
                              const now = new Date();
                              return b.status === 'confirmed' &&
                                new Date(b.startDate).getMonth() === now.getMonth() &&
                                new Date(b.startDate).getFullYear() === now.getFullYear();
                            }).length} reservas este mes`
                          : property.status === 'uso_propio' ? 'Uso propio'
                          : `${property.price} euros/mes`;
                      const { permisos, landlordEmail } = accessMap[property.id] || {};
                      return (
                        <div
                          key={property.id}
                          className="property-card"
                          onClick={() => setViewingEntry({ property, permisos, landlordEmail })}
                          style={{ cursor: 'pointer' }}
                        >
                          <div className="property-info">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                              <div style={{
                                width: 38, height: 38, borderRadius: '10px', flexShrink: 0,
                                background: selectedCategory.bgColor,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: selectedCategory.color,
                              }}>
                                {getPropertyIcon(property.status, 20)}
                              </div>
                              <h3 className="property-name" style={{ margin: 0 }}>{property.name}</h3>
                            </div>
                            <div className="property-status">
                              <span className={`status-dot ${property.status}`}></span>
                              <span className="status-text">{statusLabel}</span>
                            </div>
                            <p className="property-price">{priceLabel}</p>
                          </div>
                          <button
                            className="property-arrow"
                            onClick={e => { e.stopPropagation(); setViewingEntry({ property, permisos, landlordEmail }); }}
                          >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                              <path d="M9 6l6 6-6 6" stroke="#999" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* ── Tab: Mensajes — lista ── */}
      {activeTab === 'chat' && !chatWith && canMessageSelectedLandlord && (() => {
        const filteredTenants = chatSearch
          ? tenants.filter(t =>
              t.tenantName.toLowerCase().includes(chatSearch.toLowerCase()) ||
              t.propertyName.toLowerCase().includes(chatSearch.toLowerCase())
            )
          : tenants;

        const directMeta = landlordDirectMeta[selectedLandlord.email] || { unread: 0, lastTs: '', lastContent: '' };

        return (
          <div style={{ minHeight: '100vh', background: '#f7f8fa', paddingBottom: '80px' }}>
            {/* Header */}
            <div style={{
              background: 'white', padding: '12px 20px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              position: 'sticky', top: 0, zIndex: 100,
              borderBottom: '1px solid #f0f0f0',
            }}>
              <BackButton />
              <span style={{ fontWeight: 700, fontSize: '15px', color: '#111', letterSpacing: '-0.3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '220px' }}>
                Mensajes
              </span>
              <button
                onClick={() => { setShowChatSearch(!showChatSearch); setChatSearch(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center', color: '#555' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
                  <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Barra busqueda */}
            {showChatSearch && (
              <>
                <div
                  onClick={() => { setShowChatSearch(false); setChatSearch(''); }}
                  style={{ position: 'fixed', inset: 0, zIndex: 90 }}
                />
                <div style={{ padding: '10px 16px', background: 'white', borderBottom: '1px solid #f0f0f0', position: 'relative', zIndex: 91 }}>
                  <div style={{ position: 'relative' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}>
                      <circle cx="11" cy="11" r="7" stroke="#aaa" strokeWidth="2"/>
                      <path d="M20 20l-3-3" stroke="#aaa" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    <input
                      autoFocus
                      type="text"
                      placeholder="Buscar conversacion..."
                      value={chatSearch}
                      onChange={e => setChatSearch(e.target.value)}
                      style={{
                        width: '100%', padding: '10px 12px 10px 36px', border: '1px solid #e5e5e5',
                        borderRadius: '10px', fontSize: '15px', boxSizing: 'border-box', outline: 'none',
                        background: '#f7f7f7',
                      }}
                    />
                  </div>
                </div>
              </>
            )}

            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>

              {/* Seccion: Propietario (chat directo) */}
              <p style={{ margin: '4px 0 6px', fontSize: 11, fontWeight: 700, color: '#aaa', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                Propietario
              </p>
              {(() => {
                const landlord = selectedLandlord;
                const initials = landlord.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                return (
                  <button
                    onClick={() => setChatWith({
                      isDirectChat: true,
                      landlordEmail: landlord.email,
                      otherEmail: landlord.email,
                      otherName: landlord.name !== landlord.email ? landlord.name : landlord.email,
                      key: `direct_${landlord.email}`,
                    })}
                    style={{
                      width: '100%', background: 'white', border: 'none', borderRadius: '16px',
                      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px',
                      cursor: 'pointer', textAlign: 'left',
                      boxShadow: directMeta.unread > 0 ? '0 2px 12px rgba(0,0,0,0.08)' : '0 1px 4px rgba(0,0,0,0.05)',
                    }}
                  >
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <LandlordAvatar email={landlord.email} name={landlord.name} avatarUrl={landlord.avatarUrl} size={48} />
                      {directMeta.unread > 0 && (
                        <span style={{
                          position: 'absolute', top: 0, right: 0,
                          background: '#e74c3c', color: 'white',
                          borderRadius: '50%', width: 18, height: 18,
                          fontSize: 11, fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {directMeta.unread}
                        </span>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: '15px', color: '#111' }}>
                          {landlord.name !== landlord.email ? landlord.name : landlord.email}
                        </p>
                        {directMeta.lastTs && (
                          <span style={{ fontSize: '11px', color: '#bbb', flexShrink: 0, fontWeight: 500 }}>
                            {new Date(directMeta.lastTs).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}
                          </span>
                        )}
                      </div>
                      <p style={{ margin: 0, fontSize: '12px', color: '#888' }}>Propietario</p>
                      {directMeta.lastContent && (
                        <p style={{ margin: '2px 0 0', fontSize: '13px', color: directMeta.unread > 0 ? '#333' : '#aaa', fontWeight: directMeta.unread > 0 ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {directMeta.lastContent}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })()}

              {/* Seccion: Inquilinos */}
              {filteredTenants.length > 0 && (
                <>
                  <p style={{ margin: '8px 0 6px', fontSize: 11, fontWeight: 700, color: '#aaa', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                    Inquilinos
                  </p>
                  {[...filteredTenants]
                    .map(t => ({ ...t, ...(tenantMeta[t.key] || { unread: 0, lastTs: '', lastContent: '' }) }))
                    .sort((a, b) => b.lastTs.localeCompare(a.lastTs))
                    .map(t => {
                      const initials = t.tenantName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                      const avatarColors = ['#E8F0FE', '#FCE8D5', '#E6F4EA', '#FDE8E8', '#EDE7F6'];
                      const avatarTextColors = ['#3B6FE0', '#D2691E', '#2E7D32', '#C62828', '#6B3FA0'];
                      const colorIdx = t.tenantName.charCodeAt(0) % avatarColors.length;
                      return (
                        <button
                          key={t.key}
                          onClick={() => setChatWith(t)}
                          style={{
                            width: '100%', background: t.isGroup ? '#f9f9f9' : 'white',
                            border: t.isGroup ? '1px solid #e5e5e5' : 'none', borderRadius: '16px',
                            padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px',
                            cursor: 'pointer', textAlign: 'left',
                            boxShadow: t.unread > 0 ? '0 2px 12px rgba(0,0,0,0.08)' : '0 1px 4px rgba(0,0,0,0.05)',
                          }}
                        >
                          <div style={{ position: 'relative', flexShrink: 0 }}>
                            {t.isGroup ? (
                              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  <circle cx="9" cy="7" r="4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </div>
                            ) : (
                              <div style={{
                                width: '48px', height: '48px', borderRadius: '50%',
                                background: avatarColors[colorIdx],
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '16px', fontWeight: 700, color: avatarTextColors[colorIdx],
                              }}>
                                {initials}
                              </div>
                            )}
                            {t.unread > 0 && (
                              <span style={{
                                position: 'absolute', top: 0, right: 0,
                                background: '#e74c3c', color: 'white',
                                borderRadius: '50%', width: 18, height: 18,
                                fontSize: 11, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {t.unread}
                              </span>
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                              <p style={{ margin: 0, fontWeight: 700, fontSize: '15px', color: '#111' }}>{t.tenantName}</p>
                              {t.lastTs && (
                                <span style={{ fontSize: '11px', color: '#bbb', flexShrink: 0, fontWeight: 500 }}>
                                  {new Date(t.lastTs).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}
                                </span>
                              )}
                            </div>
                            <p style={{ margin: 0, fontSize: '12px', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {t.isGroup ? t.tenantSubtitle : t.propertyName}
                            </p>
                            {t.lastContent && (
                              <p style={{ margin: '2px 0 0', fontSize: '13px', color: t.unread > 0 ? '#333' : '#aaa', fontWeight: t.unread > 0 ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {t.lastContent}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                </>
              )}

              {filteredTenants.length === 0 && (
                <p style={{ textAlign: 'center', color: '#bbb', fontSize: 13, margin: '24px 0' }}>
                  No hay inquilinos activos en las propiedades asignadas.
                </p>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Tab: Mensajes — conversacion ── */}
      {activeTab === 'chat' && chatWith && (
        <ChatConversation
          isDirectChat={chatWith.isDirectChat || false}
          landlordEmail={chatWith.landlordEmail}
          propertyId={chatWith.propertyId}
          roomId={chatWith.roomId}
          tenantId={chatWith.tenantId}
          tenantName={chatWith.tenantName}
          propertyName={chatWith.propertyName}
          otherEmail={chatWith.otherEmail}
          otherName={chatWith.otherName}
          currentRole={chatWith.isDirectChat ? 'gestor' : 'landlord'}
          isGroup={chatWith.isGroup || false}
          onBack={() => { setChatWith(null); setMetaTick(t => t + 1); }}
          currentUserEmail={userEmail}
          hideAvatar={true}
        />
      )}

      {/* ── Bottom navigation ── */}
      {!(activeTab === 'chat' && chatWith) && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, height: '64px',
          background: 'white', borderTop: '1px solid #EEEEEE',
          display: 'flex', alignItems: 'center', justifyContent: 'space-around',
          zIndex: 1000, paddingBottom: 'env(safe-area-inset-bottom)',
        }}>
          {/* Resumen */}
          <button onClick={() => switchTab('general')} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
            background: 'none', border: 'none', cursor: 'pointer', padding: '8px 20px',
            color: activeTab === 'general' ? '#111' : '#aaa',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2"/>
              <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2"/>
              <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2"/>
              <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2"/>
            </svg>
            <span style={{ fontSize: '10px', fontWeight: activeTab === 'general' ? 600 : 400 }}>Resumen</span>
          </button>

          {/* Propiedades */}
          <button onClick={() => switchTab('properties')} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
            background: 'none', border: 'none', cursor: 'pointer', padding: '8px 20px',
            color: activeTab === 'properties' ? '#111' : '#aaa',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M9 21V12h6v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{ fontSize: '10px', fontWeight: activeTab === 'properties' ? 600 : 400 }}>Propiedades</span>
          </button>

          {/* Mensajes — solo visible si can_message = true */}
          {canMessageSelectedLandlord && (
            <button onClick={() => switchTab('chat')} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
              background: 'none', border: 'none', cursor: 'pointer', padding: '8px 20px',
              color: activeTab === 'chat' ? '#111' : '#aaa', position: 'relative',
            }}>
              <div style={{ position: 'relative' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {totalUnread > 0 && (
                  <span style={{
                    position: 'absolute', top: -4, right: -6,
                    background: '#e74c3c', color: 'white',
                    borderRadius: '50%', minWidth: 16, height: 16,
                    fontSize: 10, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 3px',
                  }}>
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </span>
                )}
              </div>
              <span style={{ fontSize: '10px', fontWeight: activeTab === 'chat' ? 600 : 400 }}>Mensajes</span>
            </button>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
