import React, { useState, useEffect } from 'react';
import './Dashboard.css';
import PropertyDetail from './PropertyDetail';
import VacationalDetail from './VacationalDetail';
import GeneralPanel from './GeneralPanel';
import ChatConversation from './ChatConversation';
import ProfileMenu from '../components/ProfileMenu';
import { supabase } from '../supabaseClient';

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
    if (prop.status === 'alquilado') {
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

function Dashboard({ userEmail, onLogout, onSwitchRole }) {
  const [properties, setProperties] = useState(() => {
    const saved = localStorage.getItem(`properties_${userEmail}`);
    return saved ? JSON.parse(saved) : [];
  });
  const [loadingProperties, setLoadingProperties] = useState(true);
  const [activeTab, setActiveTab] = useState('general');

  const switchTab = (tab) => {
    setActiveTab(tab);
    setShowPropertySearch(false);
    setPropertySearch('');
    setShowChatSearch(false);
    setChatSearch('');
  };
  const [showAddModal, setShowAddModal] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
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
    setShowProfileMenu(false);
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
      setViewingProperty(updatedProperty);
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
    <div style={{ position: 'relative', minHeight: '100vh' }}>

      {/* Panel General */}
      {activeTab === 'general' && (
        <GeneralPanel
          properties={properties}
          userEmail={userEmail}
          onLogout={onLogout}
          onNavigateToProperties={() => switchTab('properties')}
          onSwitchRole={onSwitchRole}
        />
      )}

      {/* Panel Propiedades */}
      {activeTab === 'properties' && (
        <div className="dashboard-container" style={{ paddingBottom: '80px' }}>
          {/* Header */}
          <div className="dashboard-header">
            <button className="profile-button" onClick={() => setShowProfileMenu(!showProfileMenu)}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="16" fill="#E5E5E5"/>
                <path d="M16 16c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="#666"/>
              </svg>
            </button>
            <span style={{ fontWeight: 600, fontSize: '17px', color: '#111' }}>Propiedades</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => { setShowPropertySearch(!showPropertySearch); setPropertySearch(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center', color: '#555' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
                  <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
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

            {showProfileMenu && (
              <ProfileMenu
                userEmail={userEmail}
                role="landlord"
                onSwitchRole={onSwitchRole}
                onLogout={onLogout}
                onClose={() => setShowProfileMenu(false)}
              />
            )}
          </div>

          {/* Barra de búsqueda propiedades */}
          {showPropertySearch && (
            <>
              <div
                onClick={() => { setShowPropertySearch(false); setPropertySearch(''); }}
                style={{ position: 'fixed', inset: 0, zIndex: 90 }}
              />
              <div style={{ padding: '10px 20px', background: 'white', borderBottom: '1px solid #f0f0f0', position: 'relative', zIndex: 91 }}>
                <div style={{ position: 'relative', maxWidth: '600px', margin: '0 auto' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#aaa' }}>
                    <circle cx="11" cy="11" r="7" stroke="#aaa" strokeWidth="2"/>
                    <path d="M20 20l-3-3" stroke="#aaa" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  <input
                    autoFocus
                    type="text"
                    placeholder="Buscar inmueble..."
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

          {/* Lista de propiedades */}
          <div className="properties-list">
            {loadingProperties ? (
              <div className="empty-state">
                <p>Cargando propiedades…</p>
              </div>
            ) : properties.length === 0 ? (
              <div className="empty-state">
                <p>Aún no hay inmuebles añadidos</p>
                <button className="add-first-property" onClick={handleAddProperty}>
                  Añadir primera propiedad
                </button>
              </div>
            ) : (
              properties.filter(p => !propertySearch || p.name.toLowerCase().includes(propertySearch.toLowerCase())).map(property => (
                <div key={property.id} className="property-card">
                  <div className="property-info" onClick={() => handleViewProperty(property)}>
                    <h3 className="property-name">{property.name}</h3>
                    <div className="property-status">
                      <span className={`status-dot ${property.status}`}></span>
                      <span className="status-text">
                        {property.status === 'alquilado' ? 'Alquilado' :
                         property.status === 'por_habitaciones' ? 'Por habitaciones' :
                         property.status === 'vacacional' ? 'Vacacional' : 'Vacío'}
                      </span>
                    </div>
                    <p className="property-price">
                      {property.status === 'vacacional'
                        ? `${(property.bookings || []).filter(b => {
                            const now = new Date();
                            return b.status === 'confirmed' &&
                              new Date(b.startDate).getMonth() === now.getMonth() &&
                              new Date(b.startDate).getFullYear() === now.getFullYear();
                          }).length} reservas este mes`
                        : `${property.price} €/mes`}
                    </p>
                  </div>
                  <button className="property-arrow" onClick={() => handleViewProperty(property)}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M9 6l6 6-6 6" stroke="#999" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>

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

            {tenants.length === 0 ? (
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
              </div>
            )}
          </div>
        );
      })()}

      {activeTab === 'chat' && chatWith && (
        <ChatConversation
          landlordEmail={chatWith.landlordEmail}
          propertyId={chatWith.propertyId}
          roomId={chatWith.roomId}
          tenantId={chatWith.tenantId}
          tenantName={chatWith.tenantName}
          propertyName={chatWith.propertyName}
          currentRole="landlord"
          isGroup={chatWith.isGroup || false}
          onBack={() => { setChatWith(null); setMetaTick(t => t + 1); }}
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
          const totalUnread = Object.values(tenantMeta).reduce((sum, m) => sum + (m.unread || 0), 0);
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
function AddPropertyModal({ property, onClose, onSave, onDelete }) {
  const [name, setName] = useState(property?.name || '');
  const [status, setStatus] = useState(property?.status || 'vacio');
  const [saving, setSaving] = useState(false);
  const [paymentStartDay, setPaymentStartDay] = useState(property?.paymentConfig?.startDay?.toString() || '1');
  const [paymentEndDay, setPaymentEndDay] = useState(property?.paymentConfig?.endDay?.toString() || '5');
  const [ownershipPercentage, setOwnershipPercentage] = useState(property?.ownershipPercentage?.toString() || '100');

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

    if (status === 'alquilado') {
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

          {/* Precio mensual — solo si NO es por habitaciones */}
          {status !== 'por_habitaciones' && (
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
            </div>
          </div>

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

          {/* Rango de pago — solo si alquilado */}
          {status === 'alquilado' && (
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