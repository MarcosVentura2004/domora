import './Planes.css';

const CheckIcon = () => (
  <svg
    className="plan-check-icon"
    width="18"
    height="18"
    viewBox="0 0 18 18"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <circle cx="9" cy="9" r="9" fill="#3B6CF8" fillOpacity="0.1" />
    <path
      d="M5.5 9.25L7.75 11.5L12.5 6.5"
      stroke="#3B6CF8"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PLANS = [
  {
    id: 'pro',
    name: 'Domio Pro',
    price: '9,99',
    featured: false,
    badge: null,
    features: [
      'Hasta 10 inmuebles',
      'Pagos, incidencias y documentos',
      'Chat con inquilinos',
      'Reporte fiscal',
    ],
    ctaUrl: 'https://buy.stripe.com/test_6oU6oHfsIblmf706ZT1Nu00',
  },
  {
    id: 'pro-plus',
    name: 'Domio Pro+',
    price: '14,99',
    featured: true,
    badge: 'Mas popular',
    features: [
      'Todo lo de Pro',
      'Inmuebles ilimitados',
      'Comparador de rendimiento entre inmuebles',
    ],
    ctaUrl: 'https://buy.stripe.com/test_14AaEXa8oblm5wqdoh1Nu01',
  },
  {
    id: 'business',
    name: 'Domio Business',
    price: '29,99',
    featured: false,
    badge: null,
    features: [
      'Todo lo de Pro+',
      'Gestion de carteras de clientes',
      'Para gestores profesionales',
    ],
    ctaUrl: 'https://buy.stripe.com/test_00w28rbcsdtubUOgAt1Nu02',
  },
];

function PlanCard({ plan }) {
  return (
    <div className={`plan-card${plan.featured ? ' plan-featured' : ''}`}>
      {plan.badge && (
        <span className="plan-badge">{plan.badge}</span>
      )}

      <h2 className="plan-name">{plan.name}</h2>

      <div className="plan-price">
        <span className="plan-price-amount">{plan.price}€</span>
        <span className="plan-price-period">/mes</span>
      </div>

      <ul className="plan-features">
        {plan.features.map((feature) => (
          <li key={feature} className="plan-feature-item">
            <CheckIcon />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <a
        href={plan.ctaUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`plan-cta${plan.featured ? ' plan-cta-featured' : ' plan-cta-default'}`}
      >
        Empezar
      </a>
    </div>
  );
}

function Planes() {
  return (
    <div className="planes-page">
      <header className="planes-header">
        <img
          src="/images/house-logo.png"
          alt="Domio"
          className="planes-header-logo"
        />
        <span className="planes-header-name">Domio</span>
      </header>

      <section className="planes-hero">
        <h1 className="planes-hero-title">Elige tu plan</h1>
        <p className="planes-hero-subtitle">
          Gestiona tus inmuebles sin complicaciones
        </p>
      </section>

      <main className="planes-grid">
        {PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </main>

      <footer className="planes-footer">
        <p className="planes-footer-note">Puedes cancelar en cualquier momento</p>
        <a href="/" className="planes-footer-link">
          Volver a Domio
        </a>
      </footer>
    </div>
  );
}

export default Planes;
