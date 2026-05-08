import { useState, useEffect } from 'react';
import './Dashboard.css';
import PropertyDetail from './PropertyDetail';
import VacationalDetail from './VacationalDetail';
import GeneralPanel from './GeneralPanel';
import Comparador from './Comparador';
import ChatConversation from './ChatConversation';
import Settings from './Settings';
import { supabase } from '../supabaseClient';
import { getFile } from '../utils/fileStorage';

function getAllTenants(properties, landlordEmail) {
  const list = [];
  properties.forEach(prop => {
    // Entrada de grupo para propiedades multi-inquilino o por habitaciones
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
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9 21V12h6v9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="19" cy="5" r="2" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M19 2.5V2M19 8V7.5M21.5 5H22M16 5h0.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
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
    title: 'Vacías',
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

function Dashboard({ userEmail, onLogout, onSwitchRole, hideHeader, chatHideAvatar }) {
  const [properties, setProperties] = useState(() => {
    const saved = localStorage.getItem(`properties_${userEmail}`);
    return saved ? JSON.parse(saved) : [];
  });
  const [loadingProperties, setLoadingProperties] = useState(true);
  const [activeTab, setActiveTab] = useState('general');

  const switchTab = (tab) => {
    setActiveTab(tab);
    setSelectedCategory(null);
    setShowPropertySearch(false);
    setPropertySearch('');
    setShowChatSearch(false);
    setChatSearch('');
  };
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatarValid, setAvatarValid] = useState(false);
  const [showPropertySearch, setShowPropertySearch] = useState(false);
  const [propertySearch, setPropertySearch] = useState('');
  const [showChatSearch, setShowChatSearch] = useState(false);
  const [chatSearch, setChatSearch] = useState('');
  const [editingProperty, setEditingProperty] = useState(null);
  const [viewingProperty, setViewingProperty] = useState(null);
  const [chatWith, setChatWith] = useState(null);
  // tenantMeta: { [key]: { unread: number, lastTs: string, lastContent: string } }
  const [tenantMeta, setTenantMeta] = useState({});
  const [metaTick, setMetaTick] = useState(0);
  // gestores: list of { email, name, canMessage }
  const [gestores, setGestores] = useState([]);
  // gestorMeta: { [email]: { unread: number, lastTs: string, lastContent: string } }
  const [gestorMeta, setGestorMeta] = useState({});

  // Broadcast state
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastSelected, setBroadcastSelected] = useState(new Set());
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastSending, setBroadcastSending] = useState(false);

  // Carga unread counts + última actividad de cada conversación (batch)
  useEffect(() => {
    if (!userEmail) return;
    supabase
      .from('messages')
      .select('property_id, room_id, tenant_id, sender, read_by_landlord, content, created_at, is_group_message')
      .eq('landlord_email', userEmail)
      .then(({ data }) => {
        if (!data) return;
        const meta = {};
        getAllTenants(properties, userEmail).forEach(t => {
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
  }, [properties, userEmail, metaTick]); // eslint-disable-line

  // Carga gestores asignados al propietario con can_message = true
  useEffect(() => {
    if (!userEmail) return;
    supabase
      .from('property_access')
      .select('gestor_email, can_message')
      .eq('landlord_email', userEmail)
      .then(({ data }) => {
        if (!data) return;
        // Agrupar por gestor_email, can_message = true si al menos una fila lo tiene
        const gestorMap = {};
        data.forEach(row => {
          if (!gestorMap[row.gestor_email]) {
            gestorMap[row.gestor_email] = { email: row.gestor_email, canMessage: row.can_message !== false };
          } else if (row.can_message !== false) {
            gestorMap[row.gestor_email].canMessage = true;
          }
        });
        const list = Object.values(gestorMap).filter(g => g.canMessage);
        // Cargar nombres desde tabla gestores
        if (list.length === 0) { setGestores([]); return; }
        supabase
          .from('gestores')
          .select('email, name')
          .in('email', list.map(g => g.email))
          .then(({ data: gestorData }) => {
            const nameMap = {};
            (gestorData || []).forEach(g => { nameMap[g.email] = g.name; });
            setGestores(list.map(g => ({ ...g, name: nameMap[g.email] || g.email })));
          });
      });
  }, [userEmail]); // eslint-disable-line

  // Carga unread counts de mensajes directos con gestores
  useEffect(() => {
    if (!userEmail || gestores.length === 0) return;
    supabase
      .from('messages')
      .select('sender_id, recipient_id, content, created_at, read_by_landlord, is_direct_message')
      .eq('landlord_email', userEmail)
      .eq('is_direct_message', true)
      .then(({ data }) => {
        if (!data) return;
        const meta = {};
        gestores.forEach(g => {
          const convMsgs = data.filter(m =>
            (m.sender_id === userEmail && m.recipient_id === g.email) ||
            (m.sender_id === g.email && m.recipient_id === userEmail)
          );
          const unread = convMsgs.filter(m => m.sender_id === g.email && !m.read_by_landlord).length;
          const last = convMsgs[convMsgs.length - 1];
          meta[g.email] = { unread, lastTs: last?.created_at || '', lastContent: last?.content || '' };
        });
        setGestorMeta(meta);
      });
  }, [gestores, userEmail, metaTick]); // eslint-disable-line

  // Carga avatar del propietario (IndexedDB primero, Supabase Storage como fallback)
  useEffect(() => {
    if (!userEmail) return;
    getFile(`avatar_${userEmail}`)
      .then(local => {
        if (local) {
          setAvatarUrl(local);
          setAvatarValid(true);
        } else {
          const { data } = supabase.storage.from('avatars').getPublicUrl(`${userEmail}/avatar`);
          if (data?.publicUrl) setAvatarUrl(data.publicUrl + '?t=1');
        }
      })
      .catch(() => {});
  }, [userEmail]);

  // Carga propiedades desde Supabase al iniciar sesión
  useEffect(() => {
    setLoadingProperties(true);
    supabase
      .from('properties')
      .select('id, data')
      .eq('landlord_email', userEmail)
      .then(({ data, error }) => {
        if (error) {
          console.error('Error cargando propiedades desde Supabase:', error);
          // Fallback a localStorage si Supabase falla
          const saved = localStorage.getItem(`properties_${userEmail}`);
          if (saved) setProperties(JSON.parse(saved));
        } else {
          const props = (data || []).map(row => row.data);
          setProperties(props);
          localStorage.setItem(`properties_${userEmail}`, JSON.stringify(props));
        }
        setLoadingProperties(false);
      });
  }, [userEmail]);

  const handleAddProperty = () => {
    setEditingProperty(null);
    setShowAddModal(true);
  };

  const handleViewProperty = (property) => {
    setViewingProperty(property);
  };

  const handleEditProperty = (property) => {
    setEditingProperty(property);
    setShowAddModal(true);
  };

  const syncToLocalStorage = (props) => {
    localStorage.setItem(`properties_${userEmail}`, JSON.stringify(props));
  };

  const handleUpdateProperty = async (updatedProperty) => {
    if (updatedProperty.deleted) {
      const { error } = await supabase.from('properties').delete().eq('id', updatedProperty.id);
      if (error) console.error('Error eliminando propiedad en Supabase:', error);
      const updated = properties.filter(p => p.id !== updatedProperty.id);
      setProperties(updated);
      syncToLocalStorage(updated);
      setViewingProperty(null);
    } else {
      const { error } = await supabase.from('properties').upsert({
        id: updatedProperty.id,
        landlord_email: userEmail,
        data: updatedProperty,
        updated_at: new Date().toISOString(),
      });
      if (error) console.error('Error guardando propiedad en Supabase:', error);
      const updated = properties.map(p => p.id === updatedProperty.id ? updatedProperty : p);
      setProperties(updated);
      syncToLocalStorage(updated);
      if (viewingProperty?.id === updatedProperty.id) {
        setViewingProperty(updatedProperty);
      }
    }
  };

  const handleDeleteProperty = async (propertyId) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar esta propiedad?')) {
      const { error } = await supabase.from('properties').delete().eq('id', propertyId);
      if (error) console.error('Error eliminando propiedad en Supabase:', error);
      const updated = properties.filter(p => p.id !== propertyId);
      setProperties(updated);
      syncToLocalStorage(updated);
    }
  };

  if (showSettings) {
    return (
      <Settings
        userEmail={userEmail}
        onBack={() => setShowSettings(false)}
        onLogout={onLogout}
        onSwitchRole={onSwitchRole}
      />
    );
  }

  if (viewingProperty) {
    if (viewingProperty.status === 'vacacional') {
      return (
        <VacationalDetail
          property={viewingProperty}
          onBack={() => setViewingProperty(null)}
          onUpdate={handleUpdateProperty}
          landlordEmail={userEmail}
        />
      );
    }
    return (
      <PropertyDetail
        property={viewingProperty}
        onBack={() => setViewingProperty(null)}
        onUpdate={handleUpdateProperty}
        landlordEmail={userEmail}
      />
    );
  }

  return (
    <div style={{ position: 'relative', minHeight: hideHeader ? '100%' : '100vh' }}>

      {/* Panel General */}
      {activeTab === 'general' && (
        <GeneralPanel
          properties={properties}
          userEmail={userEmail}
          onNavigateToProperties={() => switchTab('properties')}
          onOpenSettings={() => setShowSettings(true)}
          onOpenComparador={() => setActiveTab('comparador')}
          avatarUrl={avatarUrl}
          avatarValid={avatarValid}
          onAvatarLoad={() => setAvatarValid(true)}
          onAvatarError={() => setAvatarValid(false)}
          hideHeader={hideHeader}
          onUpdateProperty={handleUpdateProperty}
        />
      )}

      {/* Comparador de inmuebles */}
      {activeTab === 'comparador' && (
        <Comparador
          properties={properties}
          userEmail={userEmail}
          onBack={() => setActiveTab('general')}
        />
      )}

      {/* Panel Propiedades */}
      {activeTab === 'properties' && (
        <div className="dashboard-container" style={{ paddingBottom: '80px' }}>

          {selectedCategory === null ? (
            /* ── NIVEL 1: cuadrícula de categorías ── */
            <>
              {/* Header nivel 1 */}
              <div className="dashboard-header">
                {!hideHeader ? (
                  <button className="profile-button" onClick={() => setShowSettings(true)}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', position: 'relative', background: '#E5E5E5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {avatarUrl && (
                        <img
                          src={avatarUrl}
                          alt=""
                          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: avatarValid ? 'block' : 'none' }}
                          onLoad={() => setAvatarValid(true)}
                          onError={() => setAvatarValid(false)}
                        />
                      )}
                      {!avatarValid && (
                        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                          <circle cx="16" cy="16" r="16" fill="#E5E5E5"/>
                          <path d="M16 16c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="#666"/>
                        </svg>
                      )}
                    </div>
                  </button>
                ) : (
                  <div style={{ width: 32 }} />
                )}
                <span style={{ fontWeight: 600, fontSize: '17px', color: '#111' }}>Propiedades</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    onClick={handleAddProperty}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center', color: '#555' }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/>
                      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </button>
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
              </div>

              {/* Barra de búsqueda (nivel 1 — busca en todas las categorías) */}
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
                /* Resultados de búsqueda — lista plana, todas las categorías */
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {(() => {
                    const results = properties.filter(p =>
                      p.name.toLowerCase().includes(propertySearch.toLowerCase())
                    );
                    if (results.length === 0) {
                      return <div className="empty-state"><p>Sin resultados</p></div>;
                    }
                    return results.map(property => {
                      const cat = CATEGORIES.find(c => c.statuses.includes(property.status));
                      const statusLabel =
                        property.status === 'alquilado'        ? 'Alquilado' :
                        property.status === 'por_habitaciones'  ? 'Por habitaciones' :
                        property.status === 'vacacional'        ? 'Vacacional' :
                        property.status === 'otros'             ? (property.customType || 'Otros') :
                        property.status === 'uso_propio'        ? 'Uso propio' : 'Vacío';
                      const priceLabel =
                        property.status === 'vacacional'
                          ? `${(property.bookings || []).filter(b => {
                              const now = new Date();
                              return b.status === 'confirmed' &&
                                new Date(b.startDate).getMonth() === now.getMonth() &&
                                new Date(b.startDate).getFullYear() === now.getFullYear();
                            }).length} reservas este mes`
                          : property.status === 'uso_propio' ? 'Uso propio'
                          : `${property.price} €/mes`;
                      return (
                        <div key={property.id} className="property-card" onClick={() => handleViewProperty(property)} style={{ cursor: 'pointer' }}>
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
                          <button className="property-arrow" onClick={() => handleViewProperty(property)}>
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
                /* Cuadrícula 2×2 de categorías */
                <div className="category-grid-wrapper">
                  {loadingProperties ? (
                    <div className="empty-state"><p>Cargando propiedades…</p></div>
                  ) : (
                    <div className="category-grid">
                      {CATEGORIES.map(cat => {
                        const count = properties.filter(p => cat.statuses.includes(p.status)).length;
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
            /* ── NIVEL 2: lista de propiedades de la categoría ── */
            <>
              {/* Header nivel 2 */}
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
                <button
                  onClick={handleAddProperty}
                  style={{
                    background: '#111', color: 'white', border: 'none', borderRadius: '20px',
                    padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  + Añadir
                </button>
              </div>

              {/* Lista de propiedades de la categoría */}
              {(() => {
                const catProperties = properties.filter(p => selectedCategory.statuses.includes(p.status));
                if (catProperties.length === 0) {
                  return (
                    <div className="empty-state">
                      <p>No tienes propiedades en esta categoría</p>
                      <button className="add-first-property" onClick={handleAddProperty}>+ Añadir</button>
                    </div>
                  );
                }
                return (
                  <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {catProperties.map(property => {
                      const statusLabel =
                        property.status === 'alquilado'        ? 'Alquilado' :
                        property.status === 'por_habitaciones'  ? 'Por habitaciones' :
                        property.status === 'vacacional'        ? 'Vacacional' :
                        property.status === 'otros'             ? (property.customType || 'Otros') :
                        property.status === 'uso_propio'        ? 'Uso propio' : 'Vacío';
                      const priceLabel =
                        property.status === 'vacacional'
                          ? `${(property.bookings || []).filter(b => {
                              const now = new Date();
                              return b.status === 'confirmed' &&
                                new Date(b.startDate).getMonth() === now.getMonth() &&
                                new Date(b.startDate).getFullYear() === now.getFullYear();
                            }).length} reservas este mes`
                          : property.status === 'uso_propio' ? 'Uso propio'
                          : `${property.price} €/mes`;
                      return (
                        <div key={property.id} className="property-card" onClick={() => handleViewProperty(property)} style={{ cursor: 'pointer' }}>
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
                          <button className="property-arrow" onClick={e => { e.stopPropagation(); handleViewProperty(property); }}>
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

          {showAddModal && (
            <AddPropertyModal
              property={editingProperty}
              onClose={() => { setShowAddModal(false); setEditingProperty(null); }}
              onSave={async (propertyData) => {
                if (editingProperty) {
                  const updated = { ...propertyData, id: editingProperty.id };
                  const { error } = await supabase.from('properties').upsert({
                    id: updated.id,
                    landlord_email: userEmail,
                    data: updated,
                    updated_at: new Date().toISOString(),
                  });
                  if (error) console.error('Error actualizando propiedad en Supabase:', error);
                  const newProps = properties.map(p => p.id === editingProperty.id ? updated : p);
                  setProperties(newProps);
                  syncToLocalStorage(newProps);
                } else {
                  const { data: inserted, error } = await supabase.from('properties').insert({
                    landlord_email: userEmail,
                    data: propertyData,
                    updated_at: new Date().toISOString(),
                  }).select('id').single();
                  if (error) {
                    console.error('Error creando propiedad en Supabase:', error);
                  } else {
                    const newProp = { ...propertyData, id: inserted.id };
                    await supabase.from('properties').update({ data: newProp }).eq('id', inserted.id);
                    const newProps = [...properties, newProp];
                    setProperties(newProps);
                    syncToLocalStorage(newProps);
                  }
                }
                setShowAddModal(false);
                setEditingProperty(null);
              }}
              onDelete={editingProperty ? () => {
                handleDeleteProperty(editingProperty.id);
                setShowAddModal(false);
                setEditingProperty(null);
              } : null}
            />
          )}
        </div>
      )}

      {/* Panel Chat */}
      {activeTab === 'chat' && !chatWith && (() => {
        const tenants = getAllTenants(properties, userEmail);
        const filteredTenants = chatSearch
          ? tenants.filter(t =>
              t.tenantName.toLowerCase().includes(chatSearch.toLowerCase()) ||
              t.propertyName.toLowerCase().includes(chatSearch.toLowerCase())
            )
          : tenants;
        return (
          <div style={{ minHeight: '100vh', background: '#f7f8fa', paddingBottom: '80px' }}>
            {/* Header moderno */}
            <div style={{
              background: 'white', padding: '16px 20px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              position: 'sticky', top: 0, zIndex: 100,
              borderBottom: '1px solid #f0f0f0',
            }}>
              <span style={{ fontWeight: 700, fontSize: '20px', color: '#111', letterSpacing: '-0.3px' }}>Mensajes</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  onClick={() => {
                    setBroadcastSelected(new Set());
                    setBroadcastText('');
                    setShowBroadcast(true);
                  }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center', color: '#555' }}
                  title="Difusión"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M3 11l19-9-9 19-2-8-8-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
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
            </div>

            {/* Broadcast modal */}
            {showBroadcast && (() => {
              const individualTenants = getAllTenants(properties, userEmail).filter(t => !t.isGroup);
              const allSelected = individualTenants.length > 0 && broadcastSelected.size === individualTenants.length;

              const handleBroadcastSend = async () => {
                if (!broadcastText.trim() || broadcastSelected.size === 0) return;
                setBroadcastSending(true);
                try {
                  const targets = individualTenants.filter(t => broadcastSelected.has(t.key));
                  await Promise.all(targets.map(t =>
                    supabase.from('messages').insert({
                      property_id: t.propertyId,
                      room_id: t.roomId || null,
                      tenant_id: t.roomId ? null : t.tenantId,
                      landlord_email: userEmail,
                      sender: 'landlord',
                      sender_id: userEmail,
                      content: broadcastText.trim(),
                      attachment_url: null,
                      attachment_name: null,
                      attachment_type: null,
                      attachment_size: null,
                      is_group_message: false,
                      read_by_landlord: true,
                      read_by_tenant: false,
                    })
                  ));
                  setShowBroadcast(false);
                  setBroadcastText('');
                  setBroadcastSelected(new Set());
                  setMetaTick(x => x + 1);
                } catch (err) {
                  console.error('Error enviando difusión:', err);
                } finally {
                  setBroadcastSending(false);
                }
              };

              return (
                <div
                  onClick={() => setShowBroadcast(false)}
                  style={{
                    position: 'fixed', inset: 0, zIndex: 200,
                    background: 'rgba(0,0,0,0.45)',
                    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                  }}
                >
                  <div
                    onClick={e => e.stopPropagation()}
                    style={{
                      background: 'white', borderRadius: '20px 20px 0 0',
                      width: '100%', maxWidth: '600px',
                      maxHeight: '85vh', display: 'flex', flexDirection: 'column',
                      overflow: 'hidden',
                    }}
                  >
                    {/* ── Sección scrollable (header + lista) ── */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 12px' }}>
                      {/* Modal header */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                              <path d="M3 11l19-9-9 19-2-8-8-2z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                          <div>
                            <p style={{ margin: 0, fontWeight: 700, fontSize: '16px', color: '#111' }}>Difusión</p>
                            <p style={{ margin: 0, fontSize: '12px', color: '#aaa' }}>Envía un mensaje a varios inquilinos</p>
                          </div>
                        </div>
                        <button
                          onClick={() => setShowBroadcast(false)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: '#aaa', fontSize: '20px', lineHeight: 1 }}
                        >
                          ×
                        </button>
                      </div>

                      {/* Select all */}
                      {individualTenants.length > 0 && (
                        <button
                          onClick={() => {
                            if (allSelected) {
                              setBroadcastSelected(new Set());
                            } else {
                              setBroadcastSelected(new Set(individualTenants.map(t => t.key)));
                            }
                          }}
                          style={{
                            background: 'none', border: '1px solid #e5e5e5', borderRadius: '10px',
                            padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px',
                            cursor: 'pointer', marginBottom: '10px', width: '100%', textAlign: 'left',
                          }}
                        >
                          <div style={{
                            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                            border: `2px solid ${allSelected ? '#111' : '#ccc'}`,
                            background: allSelected ? '#111' : 'white',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {allSelected && (
                              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#111' }}>
                            Seleccionar todos ({individualTenants.length})
                          </span>
                        </button>
                      )}

                      {/* Tenant list */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {individualTenants.length === 0 ? (
                          <p style={{ textAlign: 'center', color: '#aaa', fontSize: '14px', marginTop: '20px' }}>
                            No hay inquilinos disponibles
                          </p>
                        ) : (
                          individualTenants.map(t => {
                            const checked = broadcastSelected.has(t.key);
                            const initials = t.tenantName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                            const avatarColors = ['#E8F0FE', '#FCE8D5', '#E6F4EA', '#FDE8E8', '#EDE7F6'];
                            const avatarTextColors = ['#3B6FE0', '#D2691E', '#2E7D32', '#C62828', '#6B3FA0'];
                            const colorIdx = t.tenantName.charCodeAt(0) % avatarColors.length;
                            return (
                              <button
                                key={t.key}
                                onClick={() => {
                                  const next = new Set(broadcastSelected);
                                  if (checked) next.delete(t.key); else next.add(t.key);
                                  setBroadcastSelected(next);
                                }}
                                style={{
                                  background: checked ? '#f0f0f0' : 'white',
                                  border: '1px solid #e5e5e5', borderRadius: '12px',
                                  padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px',
                                  cursor: 'pointer', width: '100%', textAlign: 'left',
                                }}
                              >
                                <div style={{
                                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                                  background: avatarColors[colorIdx],
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: '13px', fontWeight: 700, color: avatarTextColors[colorIdx],
                                }}>
                                  {initials}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#111' }}>{t.tenantName}</p>
                                  <p style={{ margin: 0, fontSize: '12px', color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.propertyName}</p>
                                </div>
                                <div style={{
                                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                                  border: `2px solid ${checked ? '#111' : '#ccc'}`,
                                  background: checked ? '#111' : 'white',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                  {checked && (
                                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                                      <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                  )}
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* ── Footer fijo (textarea + botón) ── */}
                    <div style={{
                      flexShrink: 0,
                      padding: '12px 20px',
                      paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
                      borderTop: '1px solid #f0f0f0',
                      background: 'white',
                    }}>
                      <textarea
                        value={broadcastText}
                        onChange={e => setBroadcastText(e.target.value)}
                        placeholder="Escribe tu mensaje..."
                        rows={2}
                        style={{
                          width: '100%', border: '1px solid #e5e5e5', borderRadius: '12px',
                          padding: '12px 14px', fontSize: '14px', resize: 'none',
                          outline: 'none', fontFamily: 'inherit', lineHeight: '1.4',
                          boxSizing: 'border-box', marginBottom: '10px',
                        }}
                      />
                      <button
                        onClick={handleBroadcastSend}
                        disabled={broadcastSending || !broadcastText.trim() || broadcastSelected.size === 0}
                        style={{
                          width: '100%', padding: '14px',
                          background: (!broadcastText.trim() || broadcastSelected.size === 0) ? '#e5e5e5' : '#111',
                          color: (!broadcastText.trim() || broadcastSelected.size === 0) ? '#aaa' : 'white',
                          border: 'none', borderRadius: '14px',
                          fontSize: '15px', fontWeight: 700, cursor: broadcastSending ? 'default' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M3 11l19-9-9 19-2-8-8-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        {broadcastSending
                          ? 'Enviando…'
                          : `Enviar a ${broadcastSelected.size > 0 ? broadcastSelected.size : ''} seleccionado${broadcastSelected.size !== 1 ? 's' : ''}`}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Barra búsqueda chat */}
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
                      placeholder="Buscar conversación..."
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

            {tenants.length === 0 && gestores.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 30px', gap: '16px', textAlign: 'center' }}>
                <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: '#F0F1F3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="#bbb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#333' }}>Sin conversaciones</p>
                <p style={{ margin: 0, fontSize: '14px', color: '#aaa', lineHeight: '1.6' }}>
                  Cuando añadas inquilinos a tus propiedades aparecerán aquí.
                </p>
              </div>
            ) : (
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filteredTenants.length > 0 && (
                  <>
                    {gestores.length > 0 && (
                      <p style={{ margin: '4px 0 2px', fontSize: '12px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Inquilinos</p>
                    )}
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
                                <div style={{
                                  width: '48px', height: '48px', borderRadius: '50%',
                                  background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
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
                              <p style={{ margin: 0, fontSize: '12px', color: '#888', fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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

                {gestores.length > 0 && (
                  <>
                    <p style={{ margin: filteredTenants.length > 0 ? '12px 0 2px' : '4px 0 2px', fontSize: '12px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Gestores</p>
                    {gestores
                      .map(g => ({ ...g, ...(gestorMeta[g.email] || { unread: 0, lastTs: '', lastContent: '' }) }))
                      .sort((a, b) => b.lastTs.localeCompare(a.lastTs))
                      .map(g => {
                        const initials = g.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                        const avatarColors = ['#E8F0FE', '#FCE8D5', '#E6F4EA', '#FDE8E8', '#EDE7F6'];
                        const avatarTextColors = ['#3B6FE0', '#D2691E', '#2E7D32', '#C62828', '#6B3FA0'];
                        const colorIdx = g.name.charCodeAt(0) % avatarColors.length;
                        return (
                          <button
                            key={g.email}
                            onClick={() => setChatWith({
                              isDirectChat: true,
                              landlordEmail: userEmail,
                              otherEmail: g.email,
                              otherName: g.name,
                              key: `direct_${g.email}`,
                            })}
                            style={{
                              width: '100%', background: 'white', border: 'none', borderRadius: '16px',
                              padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px',
                              cursor: 'pointer', textAlign: 'left',
                              boxShadow: g.unread > 0 ? '0 2px 12px rgba(0,0,0,0.08)' : '0 1px 4px rgba(0,0,0,0.05)',
                            }}
                          >
                            <div style={{ position: 'relative', flexShrink: 0 }}>
                              <div style={{
                                width: '48px', height: '48px', borderRadius: '50%',
                                background: avatarColors[colorIdx],
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '16px', fontWeight: 700, color: avatarTextColors[colorIdx],
                              }}>
                                {initials}
                              </div>
                              {g.unread > 0 && (
                                <span style={{
                                  position: 'absolute', top: 0, right: 0,
                                  background: '#e74c3c', color: 'white',
                                  borderRadius: '50%', width: 18, height: 18,
                                  fontSize: 11, fontWeight: 700,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                  {g.unread}
                                </span>
                              )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                                <p style={{ margin: 0, fontWeight: 700, fontSize: '15px', color: '#111' }}>{g.name}</p>
                                {g.lastTs && (
                                  <span style={{ fontSize: '11px', color: '#bbb', flexShrink: 0, fontWeight: 500 }}>
                                    {new Date(g.lastTs).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}
                                  </span>
                                )}
                              </div>
                              <p style={{ margin: 0, fontSize: '12px', color: '#888', fontWeight: 400 }}>Gestor</p>
                              {g.lastContent && (
                                <p style={{ margin: '2px 0 0', fontSize: '13px', color: g.unread > 0 ? '#333' : '#aaa', fontWeight: g.unread > 0 ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {g.lastContent}
                                </p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {activeTab === 'chat' && chatWith && (
        <ChatConversation
          landlordEmail={chatWith.landlordEmail}
          propertyId={chatWith.isDirectChat ? null : chatWith.propertyId}
          roomId={chatWith.isDirectChat ? null : chatWith.roomId}
          tenantId={chatWith.isDirectChat ? null : chatWith.tenantId}
          tenantName={chatWith.isDirectChat ? chatWith.otherName : chatWith.tenantName}
          propertyName={chatWith.isDirectChat ? null : chatWith.propertyName}
          currentRole="landlord"
          isGroup={chatWith.isGroup || false}
          isDirectChat={chatWith.isDirectChat || false}
          otherEmail={chatWith.isDirectChat ? chatWith.otherEmail : null}
          otherName={chatWith.isDirectChat ? chatWith.otherName : null}
          onBack={() => { setChatWith(null); setMetaTick(t => t + 1); }}
          hideAvatar={chatHideAvatar}
        />
      )}

      {/* Barra de navegación */}
      {!(activeTab === 'chat' && chatWith) && <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, height: '64px',
        background: 'white', borderTop: '1px solid #EEEEEE',
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        zIndex: 1000, paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {/* General */}
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

        {/* Chat */}
        {(() => {
          const totalUnread =
            Object.values(tenantMeta).reduce((sum, m) => sum + (m.unread || 0), 0) +
            Object.values(gestorMeta).reduce((sum, m) => sum + (m.unread || 0), 0);
          return (
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
          );
        })()}
      </div>}
    </div>
  );
}

// ─────────────────────────────────────────────
// Modal para añadir / editar propiedad
// ─────────────────────────────────────────────
function InfoTooltip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 4 }}>
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onFocus={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onBlur={() => setShow(false)}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 1 }}
        aria-label="Más información"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" stroke="#bbb" strokeWidth="1.2"/>
          <rect x="7.3" y="7" width="1.4" height="5" rx="0.7" fill="#bbb"/>
          <circle cx="8" cy="5" r="0.9" fill="#bbb"/>
        </svg>
      </button>
      {show && (
        <span style={{
          position: 'absolute', left: '50%', bottom: 'calc(100% + 6px)',
          transform: 'translateX(-50%)',
          background: '#333', color: 'white', fontSize: '12px', padding: '7px 10px',
          borderRadius: '8px', width: '200px', zIndex: 200,
          lineHeight: 1.5, pointerEvents: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}>
          {text}
        </span>
      )}
    </span>
  );
}

function AddPropertyModal({ property, onClose, onSave, onDelete }) {
  const [name, setName] = useState(property?.name || '');
  const [status, setStatus] = useState(property?.status || 'vacio');
  const [customType, setCustomType] = useState(property?.customType || '');
  const [saving, setSaving] = useState(false);
  const [paymentStartDay, setPaymentStartDay] = useState(property?.paymentConfig?.startDay?.toString() || '1');
  const [paymentEndDay, setPaymentEndDay] = useState(property?.paymentConfig?.endDay?.toString() || '5');
  const [ownershipPercentage, setOwnershipPercentage] = useState(property?.ownershipPercentage?.toString() || '100');
  const [hasVat, setHasVat] = useState(property?.has_vat ?? true);
  const [hasIrpfRetention, setHasIrpfRetention] = useState(property?.has_irpf_retention ?? false);

  // ── Habitaciones ──
  const [numberOfRooms, setNumberOfRooms] = useState('');
  // roomPrices: array de strings, uno por habitación
  const [roomPrices, setRoomPrices] = useState([]);

  // Cuando cambia el número de habitaciones, ajustar el array de precios
  const handleNumberOfRoomsChange = (val) => {
    setNumberOfRooms(val);
    const n = parseInt(val) || 0;
    setRoomPrices(prev => {
      const updated = [...prev];
      while (updated.length < n) updated.push('');
      return updated.slice(0, n);
    });
  };

  // Precio total calculado (suma de habitaciones o campo manual según estado)
  const [manualPrice, setManualPrice] = useState(property?.price?.toString() || '');

  const totalRoomPrice = roomPrices.reduce((sum, p) => sum + (parseFloat(p) || 0), 0);
  const effectivePrice = status === 'por_habitaciones' ? totalRoomPrice : parseFloat(manualPrice) || 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (saving) return;

    const propertyData = {
      name,
      price: effectivePrice,
      status,
      ...(status === 'otros' && { customType }),
      has_vat: status === 'otros' ? hasVat : false,
      has_irpf_retention: status === 'otros' ? hasIrpfRetention : false,
      ownershipPercentage: parseFloat(ownershipPercentage),
      createdAt: property?.createdAt || new Date().toISOString(),
      expenses: property?.expenses || [],
      payments: property?.payments || [],
      tenants: property?.tenants || [],
      rooms: property?.rooms || [],
      bookings: property?.bookings || [],
    };

    if (status === 'por_habitaciones' && !property) {
      const n = parseInt(numberOfRooms) || 0;
      const createdRooms = [];
      for (let i = 1; i <= n; i++) {
        createdRooms.push({
          id: `${Date.now()}-${i}`,
          name: `Habitación ${i}`,
          price: parseFloat(roomPrices[i - 1]) || 0,
          status: 'vacia',
          tenant: null,
          expenses: [],
        });
      }
      propertyData.rooms = createdRooms;
    }

    if (status === 'alquilado' || status === 'otros') {
      propertyData.paymentConfig = {
        startDay: parseInt(paymentStartDay),
        endDay: parseInt(paymentEndDay),
        limitDay: parseInt(paymentEndDay),
      };
    }

    setSaving(true);
    Promise.resolve(onSave(propertyData)).finally(() => setSaving(false));
  };

  const allRoomPricesFilled = roomPrices.length > 0 && roomPrices.every(p => parseFloat(p) > 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{property ? 'Editar propiedad' : 'Añadir propiedad'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Nombre */}
          <div className="form-group">
            <label>Nombre/Dirección</label>
            <input
              type="text"
              placeholder="Ej: Calle Mayor 12 · 2°B"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {/* Precio mensual — solo si NO es por habitaciones ni uso propio */}
          {status !== 'por_habitaciones' && status !== 'uso_propio' && (
            <div className="form-group">
              <label>{status === 'vacacional' ? 'Ingresos de referencia (€/mes)' : 'Precio mensual (€)'}</label>
              <input
                type="number"
                placeholder={status === 'vacacional' ? '1000' : '850'}
                value={manualPrice}
                onChange={(e) => setManualPrice(e.target.value)}
                required
              />
              {status === 'vacacional' && (
                <p className="payment-range-note" style={{ marginTop: '8px' }}>
                  Usado como referencia para el gauge de rentabilidad
                </p>
              )}
            </div>
          )}

          {/* Porcentaje de propiedad */}
          <div className="form-group">
            <label>Mi porcentaje de propiedad (%)</label>
            <input
              type="number"
              placeholder="100"
              min="1"
              max="100"
              value={ownershipPercentage}
              onChange={(e) => setOwnershipPercentage(e.target.value)}
              required
            />
            <p className="payment-range-note" style={{ marginTop: '8px' }}>
              Si eres el único propietario, deja 100%. Si compartes la propiedad, indica tu porcentaje (ej: 50%)
            </p>
          </div>

          {/* Estado */}
          <div className="form-group">
            <label>Estado</label>
            <div className="status-options-grid">
              <button
                type="button"
                className={`status-option ${status === 'vacio' ? 'selected' : ''}`}
                onClick={() => setStatus('vacio')}
              >
                <span className="status-dot vacio"></span>
                Vacío
              </button>
              <button
                type="button"
                className={`status-option ${status === 'alquilado' ? 'selected' : ''}`}
                onClick={() => setStatus('alquilado')}
              >
                <span className="status-dot alquilado"></span>
                Alquilado
              </button>
              <button
                type="button"
                className={`status-option ${status === 'por_habitaciones' ? 'selected' : ''}`}
                onClick={() => setStatus('por_habitaciones')}
              >
                <span className="status-dot por_habitaciones"></span>
                Por habitaciones
              </button>
              <button
                type="button"
                className={`status-option ${status === 'vacacional' ? 'selected' : ''}`}
                onClick={() => setStatus('vacacional')}
              >
                <span className="status-dot vacacional"></span>
                Vacacional
              </button>
              <button
                type="button"
                className={`status-option ${status === 'otros' ? 'selected' : ''}`}
                onClick={() => setStatus('otros')}
              >
                <span className="status-dot otros"></span>
                Otros
              </button>
              <button
                type="button"
                className={`status-option ${status === 'uso_propio' ? 'selected' : ''}`}
                onClick={() => setStatus('uso_propio')}
              >
                <span className="status-dot uso_propio"></span>
                Uso propio
              </button>
            </div>
          </div>

          {/* ── CAMPO TIPO PERSONALIZADO (solo para "Otros") ── */}
          {status === 'otros' && (
            <div className="form-group">
              <label>¿Qué tipo de espacio es?</label>
              <input
                type="text"
                placeholder="Ej: Local comercial, Trastero, Garaje…"
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                required
              />
              <p className="payment-range-note" style={{ marginTop: '8px' }}>
                Este texto aparecerá como descripción del inmueble
              </p>
            </div>
          )}

          {/* ── TOGGLES IVA / IRPF (solo para "Otros") ── */}
          {status === 'otros' && (
            <div className="form-group">
              {/* Toggle IVA */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span style={{ display: 'flex', alignItems: 'center', fontSize: '14px', color: '#333' }}>
                  ¿Este inmueble lleva IVA?
                  <InfoTooltip text="Locales, oficinas, naves, trasteros y parkings alquilados de forma independiente llevan IVA (21%)" />
                </span>
                <button
                  type="button"
                  onClick={() => setHasVat(v => !v)}
                  style={{
                    width: '44px', height: '24px', borderRadius: '12px', border: 'none',
                    background: hasVat ? '#111' : '#ddd', cursor: 'pointer', position: 'relative',
                    transition: 'background 0.2s', flexShrink: 0,
                  }}
                  aria-label={hasVat ? 'IVA activado' : 'IVA desactivado'}
                >
                  <span style={{
                    position: 'absolute', top: '3px',
                    left: hasVat ? '23px' : '3px',
                    width: '18px', height: '18px', borderRadius: '50%',
                    background: 'white', transition: 'left 0.2s',
                  }} />
                </button>
              </div>

              {/* Toggle retención IRPF */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
                <span style={{ display: 'flex', alignItems: 'center', fontSize: '14px', color: '#333' }}>
                  ¿El inquilino aplica retención IRPF?
                  <InfoTooltip text="Si tu inquilino es empresa o autónomo, aplicará una retención del 19% (modelo 115). Recibirás menos cada mes pero ya habrás pagado parte del IRPF" />
                </span>
                <button
                  type="button"
                  onClick={() => setHasIrpfRetention(v => !v)}
                  style={{
                    width: '44px', height: '24px', borderRadius: '12px', border: 'none',
                    background: hasIrpfRetention ? '#111' : '#ddd', cursor: 'pointer', position: 'relative',
                    transition: 'background 0.2s', flexShrink: 0,
                  }}
                  aria-label={hasIrpfRetention ? 'Retención IRPF activada' : 'Retención IRPF desactivada'}
                >
                  <span style={{
                    position: 'absolute', top: '3px',
                    left: hasIrpfRetention ? '23px' : '3px',
                    width: '18px', height: '18px', borderRadius: '50%',
                    background: 'white', transition: 'left 0.2s',
                  }} />
                </button>
              </div>
            </div>
          )}

          {/* ── SECCIÓN POR HABITACIONES ── */}
          {status === 'por_habitaciones' && !property && (
            <>
              {/* Número de habitaciones */}
              <div className="form-group">
                <label>¿Cuántas habitaciones tiene?</label>
                <input
                  type="number"
                  placeholder="3"
                  min="1"
                  max="20"
                  value={numberOfRooms}
                  onChange={(e) => handleNumberOfRoomsChange(e.target.value)}
                  required
                />
              </div>

              {/* Precio por habitación — aparece cuando hay número válido */}
              {parseInt(numberOfRooms) > 0 && (
                <div className="form-group">
                  <label>Precio de cada habitación (€/mes)</label>
                  <div className="room-prices-list">
                    {roomPrices.map((price, index) => (
                      <div key={index} className="room-price-row">
                        <span className="room-price-label">Habitación {index + 1}</span>
                        <input
                          type="number"
                          placeholder="350"
                          min="0"
                          value={price}
                          onChange={(e) => {
                            const updated = [...roomPrices];
                            updated[index] = e.target.value;
                            setRoomPrices(updated);
                          }}
                          required
                        />
                        <span className="room-price-currency">€</span>
                      </div>
                    ))}
                  </div>

                  {/* Total calculado */}
                  {totalRoomPrice > 0 && (
                    <div className="room-price-total">
                      <span>Total mensual</span>
                      <strong>{totalRoomPrice.toFixed(0)} €/mes</strong>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Rango de pago — solo si alquilado u otros */}
          {(status === 'alquilado' || status === 'otros') && (
            <div className="form-group">
              <label>Rango de días para pagar el alquiler</label>
              <div className="payment-range-inputs">
                <div className="payment-day-input">
                  <label>Del día</label>
                  <input
                    type="number"
                    min="1"
                    max="28"
                    value={paymentStartDay}
                    onChange={(e) => setPaymentStartDay(e.target.value)}
                    required
                  />
                </div>
                <span className="range-separator">—</span>
                <div className="payment-day-input">
                  <label>Al día</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={paymentEndDay}
                    onChange={(e) => setPaymentEndDay(e.target.value)}
                    required
                  />
                </div>
              </div>
              <p className="payment-range-note">
                El inquilino deberá marcar el pago entre el día {paymentStartDay} y {paymentEndDay} de cada mes
              </p>
            </div>
          )}

          <div className="modal-buttons">
            <button
              type="submit"
              className="submit-button"
              disabled={saving || (status === 'por_habitaciones' && !property && parseInt(numberOfRooms) > 0 && !allRoomPricesFilled)}
            >
              {saving ? 'Guardando…' : property ? 'Guardar cambios' : 'Añadir propiedad'}
            </button>

            {property && onDelete && (
              <button
                type="button"
                className="delete-button"
                onClick={onDelete}
              >
                Eliminar propiedad
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default Dashboard;