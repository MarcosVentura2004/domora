import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import PropertyDetail from './PropertyDetail';
import VacationalDetail from './VacationalDetail';

// ── Iconos de estado (igual que Dashboard) ─────────────────────────────────
function PropertyIcon({ status, size = 20 }) {
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

const STATUS_META = {
  alquilado:       { label: 'Alquilado',        color: '#16A34A', bg: '#F0FDF4' },
  por_habitaciones:{ label: 'Por habitaciones',  color: '#16A34A', bg: '#F0FDF4' },
  vacacional:      { label: 'Vacacional',        color: '#EA580C', bg: '#FFF7ED' },
  vacio:           { label: 'Vacío',             color: '#DC2626', bg: '#FEF2F2' },
  uso_propio:      { label: 'Uso propio',        color: '#2563EB', bg: '#EFF6FF' },
  otros:           { label: 'Otros',             color: '#7C3AED', bg: '#F5F3FF' },
};

// ── Componente principal ───────────────────────────────────────────────────
export default function GestorDashboard({ userEmail, onLogout }) {
  const [gestorName, setGestorName] = useState('');
  const [groups, setGroups] = useState([]);   // [{ landlordEmail, properties: [{ property, permisos }] }]
  const [loading, setLoading] = useState(true);
  const [viewingEntry, setViewingEntry] = useState(null); // { property, permisos, landlordEmail }

  // ── Carga datos ──────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true);

      // Nombre del gestor
      const { data: gestorRow } = await supabase
        .from('gestores')
        .select('name')
        .eq('email', userEmail)
        .single();
      setGestorName(gestorRow?.name || userEmail);

      // Accesos asignados
      const { data: accessRows, error: accessError } = await supabase
        .from('property_access')
        .select('property_id, landlord_email, permisos')
        .eq('gestor_email', userEmail);

      if (accessError || !accessRows || accessRows.length === 0) {
        setGroups([]);
        setLoading(false);
        return;
      }

      // Cargar cada propiedad (requiere política RLS que lo permita — ver SQL al final)
      const propertyIds = [...new Set(accessRows.map(r => r.property_id))];
      const { data: propRows } = await supabase
        .from('properties')
        .select('id, data, landlord_email')
        .in('id', propertyIds);

      const propMap = Object.fromEntries((propRows || []).map(r => [r.id, r]));

      // Agrupar por propietario
      const landlords = [...new Set(accessRows.map(r => r.landlord_email))];
      const grouped = landlords.map(landlordEmail => ({
        landlordEmail,
        properties: accessRows
          .filter(r => r.landlord_email === landlordEmail)
          .map(r => {
            const row = propMap[r.property_id];
            return row ? { property: row.data, permisos: r.permisos } : null;
          })
          .filter(Boolean),
      })).filter(g => g.properties.length > 0);

      setGroups(grouped);
      setLoading(false);
    }
    load();
  }, [userEmail]);

  // ── Vista de detalle de propiedad ────────────────────────
  if (viewingEntry) {
    const { property, permisos, landlordEmail } = viewingEntry;
    const isReadOnly = permisos === 'lectura';

    if (property.status === 'vacacional') {
      return (
        <VacationalDetail
          property={property}
          onBack={() => setViewingEntry(null)}
          onUpdate={() => {}}
          landlordEmail={landlordEmail}
          readOnly={isReadOnly}
        />
      );
    }
    return (
      <PropertyDetail
        property={property}
        onBack={() => setViewingEntry(null)}
        onUpdate={() => {}}
        landlordEmail={landlordEmail}
        readOnly={isReadOnly}
      />
    );
  }

  // ── Pantalla principal del gestor ────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f7f8fa' }}>

      {/* Cabecera */}
      <div style={{
        background: 'white', padding: '20px 20px 16px',
        borderBottom: '1px solid #f0f0f0',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Avatar con iniciales */}
            <div style={{
              width: 40, height: 40, borderRadius: '50%', background: '#111',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, fontWeight: 700, color: 'white', flexShrink: 0,
            }}>
              {(gestorName || userEmail || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: '#111' }}>{gestorName || userEmail}</p>
              <p style={{ margin: 0, fontSize: 12, color: '#aaa' }}>Gestor</p>
            </div>
          </div>

          {/* Botón cerrar sesión */}
          <button
            onClick={onLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: '1px solid #fee2e2', borderRadius: 10,
              color: '#dc2626', fontSize: 13, fontWeight: 600,
              padding: '8px 12px', cursor: 'pointer',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="16 17 21 12 16 7" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="21" y1="12" x2="9" y2="12" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Salir
          </button>
        </div>

        <p style={{ margin: '14px 0 0', fontWeight: 700, fontSize: 20, color: '#111', letterSpacing: '-0.3px' }}>
          Propiedades asignadas
        </p>
      </div>

      {/* Contenido */}
      <div style={{ padding: '16px 16px 40px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#aaa' }}>
            <div style={{
              width: 32, height: 32, border: '3px solid #e5e5e5', borderTopColor: '#111',
              borderRadius: '50%', animation: 'spin 0.8s linear infinite',
              margin: '0 auto 12px',
            }} />
            Cargando propiedades…
          </div>
        ) : groups.length === 0 ? (
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
              El propietario aún no te ha dado acceso a ninguna propiedad.
            </p>
          </div>
        ) : (
          groups.map(group => (
            <div key={group.landlordEmail} style={{ marginBottom: 24 }}>
              {/* Cabecera del grupo (propietario) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', background: '#e5e5e5',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="12" cy="7" r="4" stroke="#666" strokeWidth="2"/>
                  </svg>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#888', letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                  {group.landlordEmail}
                </span>
              </div>

              {/* Tarjetas de propiedad */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {group.properties.map(({ property, permisos }) => {
                  const meta = STATUS_META[property.status] || STATUS_META['otros'];
                  const statusLabel =
                    property.status === 'otros' ? (property.customType || 'Otros') : meta.label;
                  const isReadOnly = permisos === 'lectura';

                  return (
                    <button
                      key={property.id}
                      onClick={() => setViewingEntry({ property, permisos, landlordEmail: group.landlordEmail })}
                      style={{
                        width: '100%', background: 'white', border: '1px solid #f0f0f0',
                        borderRadius: 16, padding: '14px 16px',
                        display: 'flex', alignItems: 'center', gap: 14,
                        cursor: 'pointer', textAlign: 'left',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                      }}
                    >
                      {/* Icono de estado */}
                      <div style={{
                        width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                        background: meta.bg, color: meta.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <PropertyIcon status={property.status} size={20} />
                      </div>

                      {/* Información */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {property.name}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                          <span style={{
                            display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                            background: meta.color, flexShrink: 0,
                          }} />
                          <span style={{ fontSize: 12, color: '#888' }}>{statusLabel}</span>
                        </div>
                      </div>

                      {/* Badge de permisos */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                          background: isReadOnly ? '#f0f0f0' : '#f0fdf4',
                          color: isReadOnly ? '#888' : '#16a34a',
                          letterSpacing: '0.2px', textTransform: 'uppercase',
                        }}>
                          {isReadOnly ? 'Lectura' : 'Gestión'}
                        </span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M9 6l6 6-6 6" stroke="#ccc" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Spinner keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
