import React, { useEffect, useState } from 'react';
import './Landing.css';

// ─── SVG Icons ───────────────────────────────────────────────────────────────

const LogoIcon = () => (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
    <path d="M2 10L11 3L20 10V19C20 19.55 19.55 20 19 20H14V15H8V20H3C2.45 20 2 19.55 2 19V10Z"
      stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" fill="none"/>
  </svg>
);

const ChartIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <rect x="2" y="12" width="3.5" height="6" rx="1"/>
    <rect x="8.25" y="7" width="3.5" height="11" rx="1"/>
    <rect x="14.5" y="3" width="3.5" height="15" rx="1"/>
  </svg>
);

const PersonIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <circle cx="10" cy="7" r="3.5"/>
    <path d="M2.5 18.5c0-4 3.4-7 7.5-7s7.5 3 7.5 7"/>
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

function Landing({ onGetStarted, onLogin }) {
  const [scrolled, setScrolled] = useState(false);
  useScrollReveal();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="landing">

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
            <button className="l-nav__login" onClick={onLogin}>Iniciar sesión</button>
            <button className="l-nav__cta" onClick={onGetStarted}>Empieza gratis</button>
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
            <button className="btn-primary btn-lg" onClick={onGetStarted}>
              Empieza gratis <ArrowRight />
            </button>
            <button className="btn-ghost btn-lg" onClick={() => scrollTo('como-funciona')}>
              Ver cómo funciona
            </button>
          </div>
          <div className="l-hero__trust sr sr4">
            <span className="l-trust-line" />
            Sin tarjeta · Cancela cuando quieras
            <span className="l-trust-line" />
          </div>
          <div className="l-hero__phones sr sr5">
            <HeroPhones />
          </div>
        </div>
      </section>

      {/* ── Características ── */}
      <section id="caracteristicas" className="l-section l-section--white">
        <div className="l-wrap l-text-center">
          <div className="l-label sr">CARACTERÍSTICAS</div>
          <h2 className="l-title sr sr1">Todo lo que necesitas para<br />ser propietario, sin Excel.</h2>
          <p className="l-subtitle l-subtitle--centered sr sr2">
            Una sola app para cobrar, gestionar inquilinos, resolver incidencias y entender de verdad cuánto ganas.
          </p>
          <div className="l-feat-grid">
            {[
              { icon: <ChartIcon />, bg: '#EFF6FF', color: '#2563EB', title: 'Dashboard financiero', desc: 'Ingresos, gastos y neto de cada mes. Edita meses pasados y mira el resultado de cada inmueble.' },
              { icon: <PersonIcon />, bg: '#F0FDF4', color: '#16A34A', title: 'Inquilinos sin registro', desc: 'Generas un código de 6 caracteres y tu inquilino entra en trydomio.com. Sin descargas, sin contraseñas. Y chateas con él desde la propia app.' },
              { icon: <CardIcon />, bg: '#FFF7ED', color: '#EA580C', title: 'Pagos inteligentes', desc: 'El inquilino confirma el pago, tú lo validas. Acepta pagos parciales hasta completar el total.' },
              { icon: <ReceiptIcon />, bg: '#FEFCE8', color: '#CA8A04', title: 'Gastos e incidencias', desc: 'Registra gastos por categoría y abre incidencias con seguimiento. Adjunta facturas y fotos.' },
              { icon: <PercentIcon />, bg: '#F0FDF4', color: '#16A34A', title: 'Rentabilidad real', desc: 'ROI, cashflow, payback y equity. Calculadora de hipoteca y semáforo verde/amarillo/rojo por inmueble.' },
              { icon: <CompareIcon />, bg: '#EFF6FF', color: '#2563EB', title: 'Comparador de inmuebles', desc: 'Pon dos pisos lado a lado en cualquier período y descubre cuál rinde más.' },
            ].map((f, i) => (
              <div key={i} className={`l-feat-card sr sr${(i % 3) + 1}`} style={{textAlign:'left'}}>
                <div className="l-feat-icon" style={{ background: f.bg, color: f.color }}>{f.icon}</div>
                <h3 className="l-feat-title">{f.title}</h3>
                <p className="l-feat-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Cómo funciona ── */}
      <section id="como-funciona" className="l-section l-section--gray">
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
              { n: '02', title: 'Invita a tus inquilinos', desc: 'Generas un código de 6 caracteres y lo mandas por WhatsApp. Entran en trydomio.com, sin registro ni app.' },
              { n: '03', title: 'Cobra y declara tranquilo', desc: 'Pagos confirmados desde el móvil, gastos categorizados y reporte fiscal en PDF listo para Hacienda al cierre del año.' },
            ].map((s, i) => (
              <div key={i} className={`l-step-card sr sr${i + 1}`}>
                <div className="l-step-num">{s.n}</div>
                <h3 className="l-step-title">{s.title}</h3>
                <p className="l-step-desc">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Gastos ── */}
      <section id="gastos" className="l-section l-section--white">
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
      <section id="tipos" className="l-section l-section--gray">
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
              <div key={i} className={`l-type-card sr sr${(i % 2) + 1}`}>
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
      <section id="gestores" className="l-section l-section--white">
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
              <div className="l-manager-cta sr sr3">
                <button className="btn-primary" onClick={() => scrollTo('planes')}>
                  Ver plan Business <ArrowRight />
                </button>
                <p className="l-price-note">Desde 29,99€/mes · Sin contratos</p>
              </div>
            </div>
            <div className="l-split__visual sr sr2">
              <div className="l-gestor-mock">
                <div className="l-mock-header">
                  <div className="l-mock-dots">
                    <span style={{background:'#FF5F57'}}/>
                    <span style={{background:'#FEBC2E'}}/>
                    <span style={{background:'#28C840'}}/>
                  </div>
                  <span className="l-mock-title">Panel del gestor · Domio</span>
                </div>
                <div className="l-mock-tabs">
                  <span className="l-mock-tab active">Mis propiedades (32)</span>
                  <span className="l-mock-tab">Clientes (13)</span>
                </div>
                {[
                  { initials: 'CM', color: '#EFF6FF', tc: '#2563EB', name: 'Carlos Méndez', sub: 'Gestor', amount: '3.240 €' },
                  { initials: 'MG', color: '#F0FDF4', tc: '#16A34A', name: 'María García', sub: '4 pisos', amount: '1.580 €' },
                  { initials: 'AS', color: '#FFF7ED', tc: '#EA580C', name: 'Ana Soto', sub: '3 pisos', amount: '4.910 €' },
                  { initials: 'LR', color: '#F5F3FF', tc: '#7C3AED', name: 'Luis Romero', sub: '1 piso', amount: '20 €' },
                ].map((c, i) => (
                  <div key={i} className="l-mock-row">
                    <div className="l-mock-avatar" style={{background: c.color, color: c.tc}}>{c.initials}</div>
                    <div className="l-mock-info">
                      <div className="l-mock-name">{c.name}</div>
                      <div className="l-mock-sub">{c.sub}</div>
                    </div>
                    <div className="l-mock-amount">{c.amount}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Sobre nosotros ── */}
      <section id="sobre-nosotros" className="l-section l-section--gray">
        <div className="l-wrap">
          <div className="l-about-grid">
            <div className="l-about-text">
              <div className="l-label sr">SOBRE NOSOTROS</div>
              <p className="l-about-body sr sr1"><strong>Somos Marcos y Gael.</strong></p>
              <p className="l-about-body sr sr1">
                Nos conocimos hace tres años en Cambridge y ahora vivimos en Madrid, una ciudad en la que ambos
                hemos decidido seguir creciendo profesionalmente y construir nuestros proyectos. Entre los dos
                estudiamos Negocios Internacionales, Economía y Finanzas, y mientras Gael hace prácticas en una
                inmobiliaria, empezamos a ver algo que nos sorprendió bastante: en pleno 2026, gestionar un
                alquiler sigue siendo caótico.
              </p>
              <p className="l-about-body sr sr2">
                En nuestro entorno veíamos constantemente los mismos problemas: Excels interminables, documentos
                perdidos, mensajes que se mezclaban y demasiadas cosas que controlar para algo que debería ser
                mucho más simple. Y las herramientas que existían nos parecían complicadas, impersonales o
                pensadas para grandes empresas.
              </p>
              <p className="l-about-body sr sr2">
                Ahí fue cuando nació Domio. No queríamos crear "otro software inmobiliario". Queríamos hacer
                una herramienta que cualquiera pudiera entender desde el primer minuto. Algo limpio, simple y
                pensado para propietarios que quieren tener todo organizado sin complicarse la vida.
              </p>
              <p className="l-about-body sr sr3">
                Estamos empezando, sí. Pero creemos que gestionar un alquiler no debería sentirse como tener
                otro trabajo encima. Y eso es exactamente lo que estamos intentando construir.
              </p>
              <div className="l-founders sr sr3">
                <div className="l-founder" style={{background:'#EFF6FF',color:'#2563EB'}}>M</div>
                <div className="l-founder" style={{background:'#F0FDF4',color:'#16A34A'}}>G</div>
                <span>Marcos y Gael · Madrid</span>
              </div>
            </div>
            <div className="l-about-card sr sr2">
              <div className="l-info-card">
                <div className="l-info-label">DOMIO EN CORTO</div>
                <div className="l-info-row">
                  <div className="l-info-value">MADRID</div>
                  <div className="l-info-meta">Dónde lo construimos</div>
                </div>
                <div className="l-info-row">
                  <div className="l-info-value">2026</div>
                  <div className="l-info-meta">Año de lanzamiento</div>
                </div>
                <div className="l-info-row" style={{borderBottom:'none'}}>
                  <div className="l-info-value">BETA</div>
                  <div className="l-info-meta">Estado actual</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Planes ── */}
      <section id="planes" className="l-section l-section--white">
        <div className="l-wrap l-text-center">
          <div className="l-label sr">PLANES</div>
          <h2 className="l-title sr sr1">Empieza gratis. Crece sin sorpresas.</h2>
          <p className="l-subtitle l-subtitle--centered sr sr2">
            Sin permanencia, sin comisiones por cobro. Tú decides cuánto vas a usar Domio.
          </p>
          <div className="l-pricing-grid">
            {/* Free */}
            <div className="l-plan sr sr1">
              <div className="l-plan__name">Free</div>
              <div className="l-plan__price"><span className="l-plan__amount">0€</span><span className="l-plan__period">/siempre</span></div>
              <div className="l-plan__desc">Para empezar con tu primer piso</div>
              <ul className="l-plan__features">
                <li><CheckCircle />Hasta 1 inmueble</li>
                <li><CheckCircle />Inquilinos con código</li>
                <li><CheckCircle />Pagos y chat</li>
                <li><CheckCircle />Gastos básicos</li>
              </ul>
              <button className="l-plan__btn l-plan__btn--outline" onClick={onGetStarted}>Empezar gratis</button>
            </div>
            {/* Pro */}
            <div className="l-plan sr sr2">
              <div className="l-plan__name">Pro</div>
              <div className="l-plan__price"><span className="l-plan__amount">9,99€</span><span className="l-plan__period">/mes</span></div>
              <div className="l-plan__desc">Para propietarios con varios pisos</div>
              <ul className="l-plan__features">
                <li><CheckCircle />Inmuebles ilimitados</li>
                <li><CheckCircle />Reporte fiscal (PDF + Excel)</li>
                <li><CheckCircle />Datos de inversión y rentabilidad</li>
                <li><CheckCircle />Comparador de inmuebles</li>
                <li><CheckCircle />Navegación por meses pasados</li>
              </ul>
              <button className="l-plan__btn l-plan__btn--outline" onClick={onGetStarted}>Probar Pro</button>
            </div>
            {/* Pro+ */}
            <div className="l-plan l-plan--featured sr sr3">
              <div className="l-plan__badge">Más popular</div>
              <div className="l-plan__name">Pro+</div>
              <div className="l-plan__price"><span className="l-plan__amount">14,99€</span><span className="l-plan__period">/mes</span></div>
              <div className="l-plan__desc">Para quien delega en un gestor</div>
              <ul className="l-plan__features">
                <li><CheckCircle />Todo lo de Pro</li>
                <li><CheckCircle />Invitación a gestores</li>
                <li><CheckCircle />Permisos granulares</li>
                <li><CheckCircle />Soporte prioritario</li>
              </ul>
              <button className="l-plan__btn l-plan__btn--blue" onClick={onGetStarted}>Probar Pro+</button>
            </div>
            {/* Business */}
            <div className="l-plan sr sr4">
              <div className="l-plan__name">Business</div>
              <div className="l-plan__price"><span className="l-plan__amount">29,99€</span><span className="l-plan__period">/mes</span></div>
              <div className="l-plan__desc">Para gestores profesionales con cartera</div>
              <ul className="l-plan__features">
                <li><CheckCircle />Todo lo de Pro+</li>
                <li><CheckCircle />Cartera de propietarios</li>
                <li><CheckCircle />Perfil profesional público</li>
                <li><CheckCircle />Dashboard de gestor</li>
              </ul>
              <button className="l-plan__btn l-plan__btn--outline" onClick={onGetStarted}>Hablar con ventas</button>
            </div>
          </div>
          <p className="l-pricing-note sr">
            Todos los planes incluyen acceso web, app y soporte por email en soporte@trydomio.com
          </p>
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
            Crea tu cuenta en 2 minutos y mete tu primer inmueble. Si no te enamora,
            te ayudamos a exportarlo todo y cerramos sin drama.
          </p>
          <div className="l-final-btns sr sr2">
            <button className="btn-primary btn-lg" onClick={onGetStarted}>
              Empieza gratis <ArrowRight />
            </button>
            <button className="btn-ghost-light btn-lg" onClick={onLogin}>
              Habla con nosotros
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="l-footer">
        <div className="l-footer__inner">
          <div className="l-footer__brand">
            <div className="l-footer__logo">
              <LogoIcon />
              <span>domio</span>
            </div>
            <p>La app para propietarios particulares en España.<br />Hecha en Madrid, con cariño.</p>
          </div>
          <div className="l-footer__links">
            <div className="l-footer__col">
              <div className="l-footer__col-title">PRODUCTO</div>
              <button onClick={() => scrollTo('caracteristicas')}>Características</button>
              <button onClick={() => scrollTo('como-funciona')}>Cómo funciona</button>
              <button onClick={() => scrollTo('planes')}>Planes</button>
              <button>Cambios</button>
            </div>
            <div className="l-footer__col">
              <div className="l-footer__col-title">EMPRESA</div>
              <button onClick={() => scrollTo('sobre-nosotros')}>Sobre nosotros</button>
              <button>Blog</button>
              <button>Contacto</button>
              <button>Trabaja con nosotros</button>
            </div>
            <div className="l-footer__col">
              <div className="l-footer__col-title">SOPORTE</div>
              <button>Centro de ayuda</button>
              <button>Estado del servicio</button>
              <button>Guía fiscal</button>
              <a href="mailto:soporte@trydomio.com">soporte@trydomio.com</a>
            </div>
          </div>
        </div>
        <div className="l-footer__bottom">
          <span>© 2025 Domio · Hecho en Madrid</span>
          <div>
            <a href="/politica-de-privacidad">Política de privacidad</a>
            <a href="/terminos-de-servicio">Términos</a>
            <a href="/aviso-legal">Aviso legal</a>
          </div>
        </div>
      </footer>

    </div>
  );
}

export default Landing;
