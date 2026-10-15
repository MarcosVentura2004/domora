import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const styles = {
  page: { minHeight: '100vh', background: '#fff', display: 'flex', flexDirection: 'column' },
  header: { borderBottom: '1px solid #eee', padding: '0 16px', height: '56px', display: 'flex', alignItems: 'center', gap: '8px', position: 'sticky', top: 0, background: '#fff', zIndex: 10 },
  back: { background: 'none', border: 'none', padding: '8px', margin: '0 0 0 -8px', cursor: 'pointer', color: '#111', display: 'flex', alignItems: 'center', borderRadius: '10px' },
  logo: { display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', color: '#111', fontWeight: '700', fontSize: '17px' },
  logoImg: { width: '28px', height: '28px', objectFit: 'contain' },
  content: { flex: 1, maxWidth: '720px', width: '100%', margin: '0 auto', padding: '48px 24px 80px' },
  footer: { borderTop: '1px solid #eee', padding: '20px 24px', textAlign: 'center', color: '#999', fontSize: '13px' },
};

const markdownComponents = {
  h1: ({ children }) => <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#111', margin: '0 0 8px', lineHeight: '1.3' }}>{children}</h1>,
  h2: ({ children }) => <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#111', margin: '40px 0 12px', lineHeight: '1.4' }}>{children}</h2>,
  h3: ({ children }) => <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111', margin: '28px 0 8px' }}>{children}</h3>,
  p: ({ children }) => <p style={{ fontSize: '15px', color: '#444', lineHeight: '1.75', margin: '0 0 16px' }}>{children}</p>,
  a: ({ href, children }) => <a href={href} style={{ color: '#2563eb', textDecoration: 'underline' }} target="_blank" rel="noreferrer">{children}</a>,
  ul: ({ children }) => <ul style={{ margin: '0 0 16px', paddingLeft: '24px' }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ margin: '0 0 16px', paddingLeft: '24px' }}>{children}</ol>,
  li: ({ children }) => <li style={{ fontSize: '15px', color: '#444', lineHeight: '1.75', marginBottom: '4px' }}>{children}</li>,
  blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid #ddd', margin: '0 0 16px', padding: '12px 16px', background: '#f9f9f9', borderRadius: '0 6px 6px 0' }}>{children}</blockquote>,
  strong: ({ children }) => <strong style={{ fontWeight: '600', color: '#222' }}>{children}</strong>,
  hr: () => <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '32px 0' }} />,
};

// Back: return to where the user came from (welcome / auth), else to the home screen
function goBack() {
  const cameFromApp = document.referrer && new URL(document.referrer).origin === window.location.origin;
  if (cameFromApp && window.history.length > 1) {
    window.history.back();
  } else if (window.opener) {
    window.close();
    setTimeout(() => { window.location.href = '/'; }, 150);
  } else {
    window.location.href = '/';
  }
}

export default function LegalPage({ content }) {
  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <button type="button" onClick={goBack} style={styles.back} aria-label="Volver">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <a href="/" style={styles.logo}>
          <img src="/images/house-logo.png?v=2" alt="" style={styles.logoImg} />
          Domio
        </a>
      </header>
      <main style={styles.content}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {content}
        </ReactMarkdown>
      </main>
      <footer style={styles.footer}>© 2025 Domio</footer>
    </div>
  );
}
