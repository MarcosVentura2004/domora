import React, { useEffect, useState } from 'react';
import './Landing.css';
import { supabase } from '../supabaseClient';

// ─── Access Code ─────────────────────────────────────────────────────────────

const ACCESS_CODE = 'PRUEBA';

// ─── SVG Icons ───────────────────────────────────────────────────────────────


const ChartIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <rect x="2" y="12" width="3.5" height="6" rx="1"/>
    <rect x="8.25" y="7" width="3.5" height="11" rx="1"/>
    <rect x="14.5" y="3" width="3.5" height="15" rx="1"/>
  </svg>
);

const FileDocIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <path d="M4 2h8l5 5v11a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"/>
    <path d="M12 2v5h5"/>
    <path d="M6.5 10.5h7M6.5 13.5h5"/>
  </svg>
);

const CardIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <rect x="1.5" y="4.5" width="17" height="11" rx="2"/>
    <path d="M1.5 8.5h17"/>
    <rect x="4" y="12" width="4" height="1.5" rx="0.5" fill="currentColor" stroke="none"/>
  </svg>
);

const ReceiptIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <path d="M5 2v16l2.5-1.5 2.5 1.5 2.5-1.5L15 18V2H5z"/>
    <path d="M8 7.5h4M8 11h3"/>
  </svg>
);

const PercentIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <circle cx="6.5" cy="6.5" r="2.5"/>
    <circle cx="13.5" cy="13.5" r="2.5"/>
    <path d="M4 16L16 4"/>
  </svg>
);

const CompareIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <rect x="1.5" y="4" width="6.5" height="12" rx="1.5"/>
    <rect x="12" y="4" width="6.5" height="12" rx="1.5"/>
    <path d="M10 10h0" strokeWidth="2.5"/>
  </svg>
);

const HomeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M1.5 8.5L9 2.5L16.5 8.5"/>
    <path d="M3 8v7.5a1 1 0 001 1h10a1 1 0 001-1V8"/>
    <rect x="6.5" y="11" width="5" height="5.5" rx="0.5"/>
  </svg>
);

const GridIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="1.5" y="1.5" width="6" height="6" rx="1"/>
    <rect x="10.5" y="1.5" width="6" height="6" rx="1"/>
    <rect x="1.5" y="10.5" width="6" height="6" rx="1"/>
    <rect x="10.5" y="10.5" width="6" height="6" rx="1"/>
  </svg>
);

const CalIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <rect x="1.5" y="3.5" width="15" height="13" rx="2"/>
    <path d="M5.5 1.5v4M12.5 1.5v4"/>
    <path d="M1.5 8h15"/>
    <rect x="4.5" y="11" width="2.5" height="2.5" rx="0.4" fill="currentColor" stroke="none"/>
  </svg>
);

const BuildingIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <rect x="1.5" y="3.5" width="15" height="13" rx="1.5"/>
    <path d="M6 3.5V2M12 3.5V2"/>
    <rect x="4.5" y="8" width="2.5" height="2.5" rx="0.4" fill="currentColor" stroke="none"/>
    <rect x="11" y="8" width="2.5" height="2.5" rx="0.4" fill="currentColor" stroke="none"/>
  </svg>
);

const CheckCircle = () => (
  <svg width="17" height="17" viewBox="0 0 17 17" fill="none" style={{flexShrink:0, marginTop:'2px'}}>
    <circle cx="8.5" cy="8.5" r="8.5" fill="#2563EB" fillOpacity="0.12"/>
    <path d="M5.5 8.5l2.5 2.5 3.5-4" stroke="#2563EB" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const ArrowRight = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M2.5 7.5h10M9 4l3.5 3.5L9 11"/>
  </svg>
);

const ChevronLeftIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4l-5 5 5 5"/>
  </svg>
);

// ─── Mobile Card Thumbnails ───────────────────────────────────────────────────

function ThumbCaracteristicas() {
  const chips = [
    { bg: '#EFF6FF', dot: '#2563EB' }, { bg: '#FFF7ED', dot: '#EA580C' },
    { bg: '#FEFCE8', dot: '#CA8A04' }, { bg: '#F0FDF4', dot: '#16A34A' },
    { bg: '#FFF1F2', dot: '#E11D48' }, { bg: '#EFF6FF', dot: '#6366F1' },
  ];
  return (
    <div style={{ width:'100%', height:'100%', background:'linear-gradient(to bottom,#EFF6FF 0%,#BFDBFE 100%)', display:'flex', alignItems:'center', justifyContent:'center', padding:'0 20px' }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, width:'100%', maxWidth:230 }}>
        {chips.map((c, i) => (
          <div key={i} style={{ background:c.bg, borderRadius:10, padding:'10px 8px', border:'1px solid rgba(0,0,0,0.05)' }}>
            <div style={{ width:12, height:12, borderRadius:3, background:c.dot, marginBottom:5 }} />
            <div style={{ width:'100%', height:4, borderRadius:2, background:'rgba(0,0,0,0.09)' }} />
            <div style={{ width:'68%', height:4, borderRadius:2, background:'rgba(0,0,0,0.05)', marginTop:4 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ThumbComoFunciona() {
  return (
    <div style={{ width:'100%', height:'100%', background:'linear-gradient(to bottom,#EEF2FF 0%,#C7D2FE 100%)', display:'flex', alignItems:'center', justifyContent:'center', gap:0 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        {['01','02','03'].map((n, i) => (
          <React.Fragment key={n}>
            <div style={{ width:48, height:48, borderRadius:'50%', background: i===1 ? '#6366F1' : 'white', border:'2px solid '+(i===1?'#6366F1':'#C7D2FE'), display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, color: i===1?'white':'#6366F1', boxShadow: i===1?'0 4px 14px rgba(99,102,241,0.35)':'none', letterSpacing:'-0.02em' }}>
              {n}
            </div>
            {i < 2 && (
              <svg width="18" height="10" viewBox="0 0 18 10" fill="none">
                <path d="M1 5h12M10 2l3 3-3 3" stroke="#A5B4FC" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function ThumbGastos() {
  const bars = [55, 80, 42, 68, 95, 58, 44];
  return (
    <div style={{ width:'100%', height:'100%', background:'linear-gradient(to bottom,#FEFCE8 0%,#FDE68A 100%)', display:'flex', alignItems:'flex-end', justifyContent:'center', padding:'18px 28px 0', gap:6 }}>
      {bars.map((h, i) => (
        <div key={i} style={{ flex:1, height:`${h}%`, borderRadius:'5px 5px 0 0', background: i===4 ? '#CA8A04' : `rgba(202,138,4,${0.2+i*0.07})`, maxWidth:26 }} />
      ))}
    </div>
  );
}

function ThumbTipos() {
  const types = [
    { icon: <HomeIcon />,     bg:'#EFF6FF', color:'#2563EB', label:'Residencial' },
    { icon: <GridIcon />,     bg:'#FEFCE8', color:'#CA8A04', label:'Habitaciones' },
    { icon: <CalIcon />,      bg:'#FFF1F2', color:'#E11D48', label:'Vacacional'  },
    { icon: <BuildingIcon />, bg:'#FFF7ED', color:'#EA580C', label:'Local'       },
  ];
  return (
    <div style={{ width:'100%', height:'100%', background:'linear-gradient(to bottom,#F8FAFC 0%,#EEF2FF 100%)', display:'flex', alignItems:'center', justifyContent:'center', padding:'0 16px', gap:8 }}>
      {types.map((t, i) => (
        <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
          <div style={{ width:38, height:38, borderRadius:10, background:t.bg, color:t.color, display:'flex', alignItems:'center', justifyContent:'center', border:'1px solid rgba(0,0,0,0.05)', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
            {t.icon}
          </div>
          <span style={{ fontSize:9, fontWeight:600, color:'#94A3B8', textAlign:'center', lineHeight:1.2 }}>{t.label}</span>
        </div>
      ))}
    </div>
  );
}

function ThumbGestores() {
  const rows = [
    { init:'M', bg:'#EFF6FF', color:'#2563EB', w:60 },
    { init:'L', bg:'#F0FDF4', color:'#16A34A', w:75 },
    { init:'A', bg:'#FFF7ED', color:'#EA580C', w:50 },
  ];
  return (
    <div style={{ width:'100%', height:'100%', background:'linear-gradient(to bottom,#F0FDF4 0%,#DCFCE7 100%)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'10px 18px', gap:7 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ width:'100%', background:'white', borderRadius:10, padding:'8px 11px', display:'flex', alignItems:'center', gap:9, border:'1px solid rgba(0,0,0,0.05)', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ width:26, height:26, borderRadius:'50%', background:r.bg, color:r.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, flexShrink:0 }}>{r.init}</div>
          <div style={{ flex:1 }}>
            <div style={{ width:`${r.w}%`, height:5, borderRadius:2.5, background:'#E2E8F0' }} />
            <div style={{ width:`${r.w-18}%`, height:4, borderRadius:2, background:'#F1F5F9', marginTop:4 }} />
          </div>
          <div style={{ width:30, height:13, borderRadius:4, background:r.bg }} />
        </div>
      ))}
    </div>
  );
}

function ThumbSobreNosotros() {
  return (
    <div style={{ width:'100%', height:'100%', background:'linear-gradient(to bottom,#FFF7ED 0%,#FFEDD5 100%)', display:'flex', alignItems:'center', justifyContent:'center', gap:20 }}>
      {[{l:'M',bg:'#FFF7ED',c:'#EA580C',name:'Marcos'},{l:'G',bg:'#F0FDF4',c:'#16A34A',name:'Gael'}].map((a,i) => (
        <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
          <div style={{ width:56, height:56, borderRadius:'50%', background:a.bg, border:`2.5px solid ${a.c}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, fontWeight:800, color:a.c, boxShadow:'0 4px 16px rgba(0,0,0,0.08)' }}>{a.l}</div>
          <span style={{ fontSize:11, color:'#94A3B8', fontWeight:500 }}>{a.name}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Mobile Section Navigator ─────────────────────────────────────────────────

const MOB_NAV_SECTIONS = [
  { id: 'caracteristicas', label: 'CARACTERÍSTICAS',  title: 'Todo lo que necesitas',   desc: 'Dashboard, pagos, gastos, rentabilidad y más.',        thumb: ThumbCaracteristicas },
  { id: 'como-funciona',   label: 'CÓMO FUNCIONA',    title: 'En tres pasos sencillos', desc: 'Añade inmuebles, invita inquilinos y cobra tranquilo.', thumb: ThumbComoFunciona   },
  { id: 'gastos',          label: 'GASTOS',            title: 'Cada euro registrado',    desc: 'Hipoteca, IBI, seguros y reparaciones por categoría.', thumb: ThumbGastos         },
  { id: 'tipos',           label: 'TIPOS DE ALQUILER', title: 'Un flujo para cada caso', desc: 'Residencial, habitaciones, vacacional o local.',        thumb: ThumbTipos          },
  { id: 'gestores',        label: 'PARA GESTORES',     title: '¿Llevas pisos de otros?', desc: 'Un dashboard para toda tu cartera de clientes.',       thumb: ThumbGestores       },
  { id: 'sobre-nosotros',  label: 'SOBRE NOSOTROS',    title: 'Somos Marcos y Gael',     desc: 'Dos amigos que construyeron Domio en Madrid.',         thumb: ThumbSobreNosotros  },
];

function MobileCardNav({ onOpen }) {
  return (
    <div className="l-mob-nav">
      {MOB_NAV_SECTIONS.map((s) => {
        const Thumb = s.thumb;
        return (
          <button key={s.id} className="l-mob-card sr" onClick={() => onOpen(s.id)}>
            <div className="l-mob-card__thumb">
              <Thumb />
            </div>
            <div className="l-mob-card__body">
              <div className="l-mob-card__text">
                <span className="l-mob-card__label">{s.label}</span>
                <p className="l-mob-card__title">{s.title}</p>
                <p className="l-mob-card__desc">{s.desc}</p>
              </div>
              <div className="l-mob-card__arrow" aria-hidden="true"><ArrowRight /></div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function MobBackBar({ title, onBack }) {
  return (
    <div className="l-mob-back-bar">
      <button className="l-mob-back-btn" onClick={onBack}>
        <ChevronLeftIcon /><span>Volver</span>
      </button>
      <span className="l-mob-back-title">{title}</span>
      <div className="l-mob-back-spacer" aria-hidden="true" />
    </div>
  );
}

// ─── Waitlist Modal ───────────────────────────────────────────────────────────

function WaitlistModal({ onClose }) {
  const [email, setEmail]     = useState('');
  const [status, setStatus]   = useState('idle'); // idle | loading | success | error | duplicate
  const [errorMsg, setErrorMsg] = useState('');

  const isValidEmail = (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);

  const handleSubmit = async () => {
    if (!isValidEmail(email)) {
      setErrorMsg('Introduce un correo válido.');
      setStatus('error');
      return;
    }

    setStatus('loading');

    const { error } = await supabase
      .from('waitlist')
      .insert({ email: email.trim().toLowerCase() });

    if (!error) {
      setStatus('success');
      return;
    }

    // Unique constraint violation → already registered
    if (error.code === '23505') {
      setStatus('duplicate');
      return;
    }

    setErrorMsg('Algo salió mal. Inténtalo de nuevo.');
    setStatus('error');
  };

  const handleChange = (e) => {
    setEmail(e.target.value);
    if (status === 'error') { setStatus('idle'); setErrorMsg(''); }
    if (status === 'duplicate') setStatus('idle');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && status !== 'loading' && status !== 'success') handleSubmit();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.modal} onClick={e => e.stopPropagation()}>

        {status === 'success' ? (
          <>
            <div style={modalStyles.successIcon}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <circle cx="14" cy="14" r="14" fill="#DCFCE7"/>
                <path d="M8 14l4 4 8-8" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 style={modalStyles.title}>Apuntado.</h2>
            <p style={modalStyles.sub}>
              Te avisamos en cuanto Domio esté disponible para todos. Gracias por el apoyo.
            </p>
            <button style={modalStyles.btnPrimary} onClick={onClose}>Cerrar</button>
          </>
        ) : (
          <>
            <div style={modalStyles.icon}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.8" strokeLinecap="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            </div>
            <h2 style={modalStyles.title}>Únete a la lista de espera</h2>
            <p style={modalStyles.sub}>
              Domio está en fase de acceso privado. Déjanos tu correo y te avisamos cuando abramos para todos.
            </p>
            <input
              style={{
                ...modalStyles.input,
                ...(status === 'error' ? modalStyles.inputError : {}),
              }}
              type="email"
              value={email}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="tu@correo.com"
              autoFocus
              autoComplete="email"
              disabled={status === 'loading'}
            />
            {status === 'error' && (
              <p style={modalStyles.errorMsg}>{errorMsg}</p>
            )}
            {status === 'duplicate' && (
              <p style={modalStyles.duplicateMsg}>Este correo ya está en la lista.</p>
            )}
            <button
              style={{
                ...modalStyles.btnPrimary,
                ...(status === 'loading' ? modalStyles.btnLoading : {}),
              }}
              onClick={handleSubmit}
              disabled={status === 'loading'}
            >
              {status === 'loading' ? 'Enviando...' : 'Apuntarme'}
            </button>
            <button style={modalStyles.btnCancel} onClick={onClose}>
              Cancelar
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Access Code Modal ────────────────────────────────────────────────────────

function AccessModal({ onClose, onSuccess }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = () => {
    if (code.trim().toUpperCase() === ACCESS_CODE) {
      onSuccess();
    } else {
      setError(true);
    }
  };

  const handleChange = (e) => {
    setCode(e.target.value);
    if (error) setError(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSubmit();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.modal} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.icon}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.8" strokeLinecap="round">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
        </div>
        <h2 style={modalStyles.title}>Acceso privado</h2>
        <p style={modalStyles.sub}>Introduce tu código de acceso para continuar.</p>
        <input
          style={{ ...modalStyles.input, ...(error ? modalStyles.inputError : {}) }}
          type="text"
          value={code}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Código de acceso"
          autoFocus
          autoComplete="off"
          spellCheck={false}
        />
        {error && (
          <p style={modalStyles.errorMsg}>Código no válido</p>
        )}
        <button style={modalStyles.btnPrimary} onClick={handleSubmit}>
          Acceder
        </button>
        <button style={modalStyles.btnCancel} onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── Shared Modal Styles ──────────────────────────────────────────────────────

const modalStyles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.5)',
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '16px',
  },
  modal: {
    background: '#fff',
    borderRadius: '16px',
    padding: '36px 32px 28px',
    width: '100%',
    maxWidth: '380px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
  },
  icon: {
    width: '52px',
    height: '52px',
    borderRadius: '14px',
    background: '#EFF6FF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px',
  },
  successIcon: {
    width: '56px',
    height: '56px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px',
  },
  title: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#0F172A',
    margin: '0 0 8px',
    textAlign: 'center',
  },
  sub: {
    fontSize: '14px',
    color: '#64748B',
    margin: '0 0 20px',
    textAlign: 'center',
    lineHeight: '1.55',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    border: '1.5px solid #E2E8F0',
    borderRadius: '10px',
    padding: '11px 14px',
    fontSize: '15px',
    color: '#0F172A',
    outline: 'none',
    marginBottom: '8px',
    transition: 'border-color 0.15s',
  },
  inputError: {
    borderColor: '#EF4444',
  },
  errorMsg: {
    fontSize: '13px',
    color: '#EF4444',
    margin: '0 0 12px',
    alignSelf: 'flex-start',
  },
  duplicateMsg: {
    fontSize: '13px',
    color: '#CA8A04',
    margin: '0 0 12px',
    alignSelf: 'flex-start',
  },
  btnPrimary: {
    width: '100%',
    background: '#2563EB',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    padding: '12px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '8px',
    marginBottom: '10px',
  },
  btnLoading: {
    opacity: 0.7,
    cursor: 'not-allowed',
  },
  btnCancel: {
    background: 'none',
    border: 'none',
    color: '#64748B',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '4px 8px',
  },
};

// ─── Scroll Reveal Hook ──────────────────────────────────────────────────────

function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('sr-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    );
    const targets = document.querySelectorAll('.sr');
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

// ─── Phone Mockups ───────────────────────────────────────────────────────────

function PhoneMockup({ src, alt }) {
  return (
    <div className="phone-mockup">
      <img src={src} alt={alt} className="phone-mockup__screen" />
    </div>
  );
}

const HERO_PHONES = [
  { src: '/images/hero-propiedades.png', alt: 'Propiedades' },
  { src: '/images/hero-velazquez.png',   alt: 'Calle Velzquez' },
  { src: '/images/hero-resumen.png',     alt: 'Resumen' },
];

function HeroPhones() {
  const [scrollY, setScrollY] = useState(0);
  const mobileRef = React.useRef(null);

  React.useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Snap to the center phone (index 1) on mount so both neighbors peek on either side.
  // Math: with track padding = (100vw - slideWidth) / 2, snap scrollLeft = slideWidth + gap
  React.useEffect(() => {
    const el = mobileRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      const slide = el.querySelector('.l-phones-slide');
      if (!slide) return;
      el.scrollLeft = slide.offsetWidth + 12; // slide-0-width + gap → centers slide 1
    });
  }, []);

  const sideParallax   = `translateY(${scrollY * 0.06}px)`;
  const centerParallax = `translateY(${scrollY * 0.03}px)`;

  return (
    <>
      {/* Desktop: 3 phones side by side with parallax */}
      <div className="l-phones--desktop">
        <div className="l-phone-wrap l-phone-wrap--side" style={{ transform: `scale(0.93) translateY(28px) ${sideParallax}` }}>
          <PhoneMockup {...HERO_PHONES[0]} />
        </div>
        <div className="l-phone-wrap l-phone-wrap--center" style={{ transform: centerParallax }}>
          <PhoneMockup {...HERO_PHONES[1]} />
        </div>
        <div className="l-phone-wrap l-phone-wrap--side" style={{ transform: `scale(0.93) translateY(28px) ${sideParallax}` }}>
          <PhoneMockup {...HERO_PHONES[2]} />
        </div>
      </div>

      {/* Mobile: scroll-snap centered peek — center phone visible, others peek both sides */}
      <div className="l-phones--mobile" ref={mobileRef}>
        <div className="l-phones-track">
          {HERO_PHONES.map((p, i) => (
            <div key={i} className="l-phones-slide">
              <PhoneMockup {...p} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ─── Gastos Carousel ─────────────────────────────────────────────────────────

const GASTOS_SLIDES = [
  { src: '/images/gastos-resumen.png',  alt: 'Resumen de gastos' },
  { src: '/images/gastos-detalle.png',  alt: 'Detalle de gastos' },
];

function GastosCarousel() {
  const [active,   setActive]   = useState(0);
  const [lightbox, setLightbox] = useState(null); // null | slide index
  const startX = React.useRef(null);

  const openLightbox  = (i) => setLightbox(i);
  const closeLightbox = ()  => setLightbox(null);

  const onTouchStart = (e) => { startX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (startX.current === null) return;
    const diff = startX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) {
      setActive(prev => diff > 0
        ? Math.min(prev + 1, GASTOS_SLIDES.length - 1)
        : Math.max(prev - 1, 0));
    }
    startX.current = null;
  };

  return (
    <>
      {/* Lightbox — tap outside the image to close */}
      {lightbox !== null && (
        <div className="gastos-lightbox" onClick={closeLightbox}>
          <img
            src={GASTOS_SLIDES[lightbox].src}
            alt={GASTOS_SLIDES[lightbox].alt}
            className="gastos-lightbox__img"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* Desktop: both images stacked, full width */}
      <div className="gastos-stack">
        {GASTOS_SLIDES.map((s, i) => (
          <img
            key={i} src={s.src} alt={s.alt}
            className="gastos-img gastos-img--zoomable"
            onClick={() => openLightbox(i)}
          />
        ))}
      </div>

      {/* Mobile: swipeable carousel with dots */}
      <div className="gastos-carousel" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div
          className="gastos-track"
          style={{ transform: `translateX(-${active * 100}%)` }}
        >
          {GASTOS_SLIDES.map((s, i) => (
            <div key={i} className="gastos-slide">
              <img
                src={s.src} alt={s.alt}
                className="gastos-img gastos-img--zoomable"
                onClick={() => openLightbox(i)}
              />
            </div>
          ))}
        </div>
        <div className="gastos-dots">
          {GASTOS_SLIDES.map((_, i) => (
            <button
              key={i}
              className={`gastos-dot${i === active ? ' gastos-dot--active' : ''}`}
              onClick={() => setActive(i)}
              aria-label={`Ver ${GASTOS_SLIDES[i].alt}`}
            />
          ))}
        </div>
      </div>
    </>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

function Landing({ onLogin }) {
  const [scrolled,          setScrolled]          = useState(false);
  const [scrollProgress,    setScrollProgress]    = useState(0);
  const [showWaitlist,      setShowWaitlist]      = useState(false);
  const [showAccess,        setShowAccess]        = useState(false);
  const [mobileSectionOpen, setMobileSectionOpen] = useState(null);
  useScrollReveal();

  // Body-scroll lock + instant sr-visible when a section opens on mobile
  useEffect(() => {
    if (mobileSectionOpen) {
      if (window.innerWidth <= 768) document.body.style.overflow = 'hidden';
      const el = document.getElementById(mobileSectionOpen);
      if (el) {
        el.querySelectorAll('.sr').forEach(n => n.classList.add('sr-visible'));
        el.scrollTo(0, 0);
      }
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileSectionOpen]);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 24);
      const total = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(total > 0 ? (window.scrollY / total) * 100 : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleLoginClick   = () => setShowAccess(true);
  const handleAccessClose  = () => setShowAccess(false);
  const handleAccessSuccess = () => { setShowAccess(false); onLogin(); };

  const handleWaitlistOpen  = () => setShowWaitlist(true);
  const handleWaitlistClose = () => setShowWaitlist(false);

  return (
    <div className="landing">

      {/* ── Scroll progress bar ── */}
      <div className="l-progress" style={{ width: `${scrollProgress}%` }} aria-hidden="true" />

      {/* ── Waitlist Modal ── */}
      {showWaitlist && <WaitlistModal onClose={handleWaitlistClose} />}

      {/* ── Access Code Modal ── */}
      {showAccess && <AccessModal onClose={handleAccessClose} onSuccess={handleAccessSuccess} />}

      {/* ── Nav ── */}
      <nav className={`l-nav${scrolled ? ' l-nav--scrolled' : ''}`}>
        <div className="l-nav__inner">
          <button className="l-nav__logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <img src="/images/house-logo.png" alt="" className="l-nav__logo-img" aria-hidden="true" />
            <span>domio</span>
          </button>
          <div className="l-nav__links">
            <button onClick={() => scrollTo('caracteristicas')}>Características</button>
            <button onClick={() => scrollTo('como-funciona')}>Cómo funciona</button>
            <button onClick={() => scrollTo('sobre-nosotros')}>Sobre nosotros</button>
            <button onClick={() => scrollTo('planes')}>Planes</button>
          </div>
          <div className="l-nav__actions">
            <button className="l-nav__login" onClick={handleLoginClick}>Iniciar sesión</button>
            <button className="l-nav__cta" onClick={handleWaitlistOpen}>Apúntate</button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="l-hero">
        {/* Animated gradient blobs */}
        <div className="l-hero__bg" aria-hidden="true">
          <div className="l-hero__blob l-hero__blob--1" />
          <div className="l-hero__blob l-hero__blob--2" />
          <div className="l-hero__blob l-hero__blob--3" />
        </div>
        <div className="l-wrap">
          <div className="l-hero__badge sr">
            <span className="l-hero__dot" />
            Hecho para propietarios en España
          </div>
          <h1 className="l-hero__title sr sr1">
            Gestiona tus alquileres<br />
            <span className="c-blue">sin complicaciones</span>
          </h1>
          <p className="l-hero__sub sr sr2">
            Domio centraliza pagos, inquilinos, gastos, incidencias y rentabilidad real.
            Sabes exactamente cuánto ganas con cada piso, sin abrir Excel.
          </p>
          <div className="l-hero__ctas sr sr3">
            <button className="btn-primary btn-lg l-hero__cta-main" onClick={handleWaitlistOpen}>
              Apúntate <ArrowRight />
            </button>
          </div>
          <div className="l-hero__phones sr sr4">
            <HeroPhones />
          </div>
        </div>
        {/* Scroll hint — absolute al fondo del hero, desaparece al hacer scroll */}
        <div
          className={`l-scroll-hint${scrolled ? ' l-scroll-hint--hidden' : ''}`}
          aria-hidden="true"
          onClick={() => scrollTo('caracteristicas')}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 8l7 7 7-7"/>
          </svg>
        </div>
      </section>

      {/* ── Mobile Section Navigator (hidden on desktop) ── */}
      <MobileCardNav onOpen={setMobileSectionOpen} />

      {/* ── Características ── */}
      <section id="caracteristicas" className={`l-section l-section--white l-section--mob${mobileSectionOpen === 'caracteristicas' ? ' is-mob-open' : ''}`}>
        {mobileSectionOpen === 'caracteristicas' && <MobBackBar title="Características" onBack={() => setMobileSectionOpen(null)} />}
        <div className="l-wrap l-text-center">
          <div className="l-label sr">CARACTERÍSTICAS</div>
          <h2 className="l-title sr sr1">Todo lo que necesitas para<br />ser propietario, sin Excel.</h2>
          <p className="l-subtitle l-subtitle--centered sr sr2">
            Una sola app para cobrar, gestionar inquilinos, resolver incidencias y entender de verdad cuánto ganas.
          </p>
          <div className="l-feat-grid">
            {[
              { icon: <ChartIcon />, bg: '#EFF6FF', color: '#2563EB', title: 'Dashboard financiero', desc: 'Ingresos, gastos y neto de cada mes. Edita meses pasados y mira el resultado de cada inmueble.' },
              { icon: <FileDocIcon />, bg: '#FFF7ED', color: '#EA580C', title: 'Reporte fiscal', desc: 'Exporta todos tus ingresos y gastos en PDF o Excel listo para tu gestor. Declaración de IRPF sin complicaciones.' },
              { icon: <CardIcon />, bg: '#FFF7ED', color: '#EA580C', title: 'Pagos inteligentes', desc: 'El inquilino confirma el pago, tú lo validas. Acepta pagos parciales hasta completar el total.' },
              { icon: <ReceiptIcon />, bg: '#FEFCE8', color: '#CA8A04', title: 'Gastos e incidencias', desc: 'Registra gastos por categoría y abre incidencias con seguimiento. Adjunta facturas y fotos.' },
              { icon: <PercentIcon />, bg: '#F0FDF4', color: '#16A34A', title: 'Rentabilidad real', desc: 'ROI, cashflow, payback y equity. Calculadora de hipoteca y semáforo verde/amarillo/rojo por inmueble.' },
              { icon: <CompareIcon />, bg: '#EFF6FF', color: '#2563EB', title: 'Comparador de inmuebles', desc: 'Pon dos pisos lado a lado en cualquier período y descubre cuál rinde más.' },
            ].map((f, i) => {
              const dir = i % 3 === 0 ? 'sr-left' : i % 3 === 2 ? 'sr-right' : '';
              return (
              <div key={i} className={`l-feat-card sr ${dir} sr${(i % 3) + 1}`} style={{textAlign:'left'}}>
                <div className="l-feat-icon" style={{ background: f.bg, color: f.color }}>{f.icon}</div>
                <h3 className="l-feat-title">{f.title}</h3>
                <p className="l-feat-desc">{f.desc}</p>
              </div>
            ); })}
          </div>
        </div>
      </section>

      {/* ── Cómo funciona ── */}
      <section id="como-funciona" className={`l-section l-section--gray l-section--mob${mobileSectionOpen === 'como-funciona' ? ' is-mob-open' : ''}`}>
        {mobileSectionOpen === 'como-funciona' && <MobBackBar title="Cómo funciona" onBack={() => setMobileSectionOpen(null)} />}
        <div className="l-wrap l-text-center">
          <div className="l-label sr">CÓMO FUNCIONA</div>
          <h2 className="l-title sr sr1">
            Ten tus pisos al día.<br />
            <span className="c-blue">Declara sin estrés.</span>
          </h2>
          <p className="l-subtitle l-subtitle--centered sr sr2">
            Tres pasos para dejar atrás el Excel, los hilos de WhatsApp y las carpetas de Drive.
          </p>
          <div className="l-steps-grid">
            {[
              { n: '01', title: 'Añade tus inmuebles', desc: 'Dirección, fotos, renta, fianza, contrato y datos de compra. Residencial, por habitaciones, vacacional o local — cada tipo con su flujo.' },
              { n: '02', title: 'Invita a tus inquilinos', optional: true, desc: 'Generas un código de 6 caracteres y lo mandas por WhatsApp. Entran en trydomio.com o desde la app.' },
              { n: '03', title: 'Cobra y declara tranquilo', desc: 'Confirma pagos desde el móvil, gastos categorizados y reporte fiscal en PDF listo para Hacienda al cierre del año.' },
            ].map((s, i) => {
              const dir = i === 0 ? 'sr-left' : i === 2 ? 'sr-right' : 'sr-scale';
              return (
              <div key={i} className={`l-step-card sr ${dir} sr${i + 1}`}>
                <div className="l-step-num">{s.n}</div>
                <h3 className="l-step-title">
                  {s.title}
                  {s.optional && <span className="l-step-optional">opcional</span>}
                </h3>
                <p className="l-step-desc">{s.desc}</p>
              </div>
            ); })}
          </div>
        </div>
      </section>

      {/* ── Gastos ── */}
      <section id="gastos" className={`l-section l-section--white l-section--mob${mobileSectionOpen === 'gastos' ? ' is-mob-open' : ''}`}>
        {mobileSectionOpen === 'gastos' && <MobBackBar title="Gastos" onBack={() => setMobileSectionOpen(null)} />}
        <div className="l-wrap">
          <div className="l-gastos-header">
            <div className="l-label sr">GASTOS</div>
            <h2 className="l-title sr sr1">
              Cada euro que sale,<br />
              <span className="c-blue">registrado.</span>
            </h2>
            <p className="l-subtitle sr sr2">
              Hipoteca, comunidad, seguros, reparaciones, IBI, gestoría. Domio los agrupa por categoría,
              calcula totales y te dice qué piso te cuesta más cada mes.
            </p>
            <ul className="l-checklist sr sr3">
              {[
                'Categorías predefinidas y personalizables',
                'Frecuencia mensual, anual o puntual',
                'Adjunta facturas con la cámara desde el móvil',
                'Filtra por inmueble, mes o categoría',
              ].map((item, i) => (
                <li key={i}><CheckCircle />{item}</li>
              ))}
            </ul>
            <p className="l-note sr sr4">
              Y cuando llega abril, exporta todo a PDF o Excel listo para tu gestor.
            </p>
          </div>
          <div className="l-gastos-visual sr sr2">
            <GastosCarousel />
          </div>
        </div>
      </section>

      {/* ── Tipos de inmueble ── */}
      <section id="tipos" className={`l-section l-section--gray l-section--mob${mobileSectionOpen === 'tipos' ? ' is-mob-open' : ''}`}>
        {mobileSectionOpen === 'tipos' && <MobBackBar title="Tipos de alquiler" onBack={() => setMobileSectionOpen(null)} />}
        <div className="l-wrap l-text-center">
          <div className="l-label sr">PARA CADA TIPO DE ALQUILER</div>
          <h2 className="l-title sr sr1">Un flujo para cada inmueble.</h2>
          <p className="l-subtitle l-subtitle--centered sr sr2">
            Domio se adapta a lo que alquilas — no al revés.
          </p>
          <div className="l-types-grid">
            {[
              { icon: <HomeIcon />, bg: '#EFF6FF', color: '#2563EB', title: 'Residencial', desc: 'Alquiler tradicional con un inquilino o pareja por contrato.' },
              { icon: <GridIcon />, bg: '#FEFCE8', color: '#CA8A04', title: 'Por habitaciones', desc: 'Inquilinos independientes, pagos individuales, mismo piso.' },
              { icon: <CalIcon />, bg: '#FFF1F2', color: '#E11D48', title: 'Vacacional', desc: 'Calendario de reservas, rotación rápida, ingresos por noche.' },
              { icon: <BuildingIcon />, bg: '#FFF7ED', color: '#EA580C', title: 'Locales y oficinas', desc: 'IVA 21% y retención IRPF 19% calculados automáticamente.' },
            ].map((t, i) => (
              <div key={i} className={`l-type-card sr ${i % 2 === 0 ? 'sr-left' : 'sr-right'} sr${Math.floor(i / 2) + 1}`}>
                <div className="l-type-icon" style={{ background: t.bg, color: t.color }}>{t.icon}</div>
                <div>
                  <h3 className="l-type-title">{t.title}</h3>
                  <p className="l-type-desc">{t.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Gestores ── */}
      <section id="gestores" className={`l-section l-section--white l-section--mob${mobileSectionOpen === 'gestores' ? ' is-mob-open' : ''}`}>
        {mobileSectionOpen === 'gestores' && <MobBackBar title="Para gestores" onBack={() => setMobileSectionOpen(null)} />}
        <div className="l-wrap">
          <div className="l-split">
            <div className="l-split__text">
              <h2 className="l-title sr">
                ¿Llevas pisos de otros?<br />
                <span className="c-blue">Domio también es tuyo.</span>
              </h2>
              <p className="l-subtitle sr sr1">
                Si gestionas inmuebles de varios propietarios, tienes un plan pensado para ti.
                Una cartera, un dashboard, un solo lugar para todo.
              </p>
              <ul className="l-checklist sr sr2">
                {[
                  'Dashboard propio con dos vistas: tus propiedades y las de tus clientes',
                  'Permisos granulares por propietario',
                  'Chat directo con propietarios e inquilinos',
                  'Perfil profesional público para captar nuevos clientes',
                ].map((item, i) => (
                  <li key={i}><CheckCircle />{item}</li>
                ))}
              </ul>
            </div>
            <div className="l-split__visual sr sr-right sr2">
              <img src="/images/dashboard-gestor.png" alt="Dashboard del gestor" className="l-gestor-img" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Sobre nosotros ── */}
      <section id="sobre-nosotros" className={`l-section l-section--gray l-section--mob${mobileSectionOpen === 'sobre-nosotros' ? ' is-mob-open' : ''}`}>
        {mobileSectionOpen === 'sobre-nosotros' && <MobBackBar title="Sobre nosotros" onBack={() => setMobileSectionOpen(null)} />}
        <div className="l-wrap">
          <div className="l-about-grid">
            <div className="l-about-img sr sr-left">
              <img src="/images/gael-marcos.png" alt="Marcos y Gael" />
            </div>
            <div className="l-about-text">
              <div className="l-label sr">SOBRE NOSOTROS</div>
              <p className="l-about-body sr sr1"><strong>Somos Marcos y Gael.</strong></p>
              <p className="l-about-body sr sr1">
                Nos conocimos hace tres años siendo estudiantes y, desde entonces, siempre hemos compartido la misma
                forma de ver las cosas: creemos que la tecnología debería hacer la vida más simple, no más complicada.
              </p>
              <p className="l-about-body sr sr2">
                Mientras estudiábamos Negocios Internacionales, Economía y Finanzas, empezamos a ver un problema que
                se repetía constantemente: gestionar un alquiler seguía siendo caótico. Excels interminables, documentos
                perdidos, mensajes mezclados y demasiadas cosas que controlar para algo que debería ser mucho más sencillo.
              </p>
              <p className="l-about-body sr sr2">
                Ahí nació Domio.
              </p>
              <p className="l-about-body sr sr2">
                No queríamos crear "otro software inmobiliario". Queríamos construir una herramienta simple, limpia e
                intuitiva; una plataforma pensada para propietarios que quieren tenerlo todo organizado sin perder tiempo
                ni complicarse la vida.
              </p>
              <p className="l-about-body sr sr3">
                Estamos empezando, sí. Pero creemos que gestionar un alquiler no debería sentirse como tener otro trabajo encima.
              </p>
              <div className="l-founders sr sr3">
                <div className="l-founder" style={{background:'#EFF6FF',color:'#2563EB'}}>M</div>
                <div className="l-founder" style={{background:'#F0FDF4',color:'#16A34A'}}>G</div>
                <span>Marcos y Gael · Madrid</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Planes ── */}
      <section id="planes" className="l-section l-section--white">
        <div className="l-wrap l-text-center">
          <div className="l-label sr">PLANES</div>
          <h2 className="l-title sr sr1">Precios pensados para propietarios.</h2>
          <p className="l-subtitle l-subtitle--centered sr sr2">
            Estamos ultimando los detalles. Serás el primero en saberlo.
          </p>
          <div className="l-plans-soon sr sr3">
            <div className="l-plans-soon__icon">
              <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="#2563EB" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="13" cy="13" r="11"/>
                <path d="M13 7v6l4 2"/>
              </svg>
            </div>
            <p className="l-plans-soon__text">
              Los planes estarán disponibles próximamente.<br />
              Apúntate y te avisamos cuando lancemos.
            </p>
            <button className="btn-primary" onClick={handleWaitlistOpen}>
              Apúntate <ArrowRight />
            </button>
          </div>
        </div>
      </section>

      {/* ── CTA Final ── */}
      <section className="l-final-cta">
        <div className="l-wrap l-text-center">
          <h2 className="l-final-title sr">
            Deja el Excel.<br />
            <span className="c-blue-light">Empieza a cobrar bien.</span>
          </h2>
          <p className="l-final-sub sr sr1">
            Añade tu primer inmueble y empieza a tenerlo todo organizado.
            Si no te convence, exportas todo y cerramos sin drama.
          </p>
          <div className="l-final-btns sr sr2">
            <button className="btn-primary btn-lg" onClick={handleWaitlistOpen}>
              Apúntate <ArrowRight />
            </button>
            <button className="btn-ghost-light btn-lg" onClick={handleLoginClick}>
              Habla con nosotros
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="l-footer">
        <div className="l-footer__simple">
          <div className="l-footer__logo">
            <img src="/images/house-logo.png" alt="domio" className="l-footer__logo-img" />
            <span>domio</span>
          </div>
          <p className="l-footer__tagline">La app para propietarios en España · Hecha en Madrid</p>
          <div className="l-footer__bottom-links">
            <a href="/politica-de-privacidad">Política de privacidad</a>
            <a href="/terminos-de-servicio">Términos</a>
            <a href="mailto:domioapp.sl@gmail.com">domioapp.sl@gmail.com</a>
          </div>
          <span className="l-footer__copy">© 2025 Domio</span>
        </div>
      </footer>

    </div>
  );
}

export default Landing;
