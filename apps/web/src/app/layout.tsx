// ══════════════════════════════════════
// Origineo — Root Layout
// ══════════════════════════════════════

import type { Metadata } from 'next';
import '../styles/globals.css';
import SessionGate from '@/components/auth/SessionGate';

export const metadata: Metadata = {
  title: 'Origineo — Arbre Généalogique',
  description:
    'Application web d\'arbre généalogique interactive. Explorez votre histoire familiale avec Origineo.',
  keywords: ['généalogie', 'arbre généalogique', 'famille', 'ancêtres', 'GEDCOM'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <div id="app-root">
          <Sidebar />
          <main className="main-content">
            <SessionGate>{children}</SessionGate>
          </main>
        </div>
      </body>
    </html>
  );
}

// ─── Sidebar Navigation ──────────────────────
function Sidebar() {
  return (
    <nav className="sidebar" id="main-sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span className="logo-icon">🌳</span>
          <span className="logo-text">Origineo</span>
        </div>
      </div>

      <div className="sidebar-nav">
        <a href="/" className="nav-link" id="nav-tree">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
          <span>Arbre</span>
        </a>
        <a href="/search" className="nav-link" id="nav-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <span>Recherche</span>
        </a>
        <a href="/admin" className="nav-link" id="nav-admin">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
          </svg>
          <span>Admin</span>
        </a>
      </div>

      <div className="sidebar-footer">
        <span className="version-tag">v0.1.0</span>
      </div>

      <style>{`
        #app-root {
          display: flex;
          min-height: 100vh;
        }

        .sidebar {
          width: 240px;
          min-height: 100vh;
          background: var(--color-bg-secondary);
          border-right: 1px solid var(--color-border);
          display: flex;
          flex-direction: column;
          position: fixed;
          left: 0;
          top: 0;
          bottom: 0;
          z-index: 50;
        }

        .sidebar-header {
          padding: var(--space-6);
          border-bottom: 1px solid var(--color-border-subtle);
        }

        .sidebar-logo {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }

        .logo-icon {
          font-size: 1.75rem;
          filter: drop-shadow(0 0 8px hsla(140, 70%, 50%, 0.4));
        }

        .logo-text {
          font-family: var(--font-display);
          font-size: var(--text-xl);
          font-weight: 800;
          background: var(--gradient-primary);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          letter-spacing: -0.02em;
        }

        .sidebar-nav {
          flex: 1;
          padding: var(--space-4);
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }

        .nav-link {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3) var(--space-4);
          border-radius: var(--radius-lg);
          color: var(--color-text-secondary);
          font-size: var(--text-sm);
          font-weight: 500;
          transition: all var(--transition-fast);
          text-decoration: none;
        }

        .nav-link:hover {
          background: var(--color-bg-hover);
          color: var(--color-text-primary);
        }

        .nav-link.active {
          background: var(--color-accent-subtle);
          color: var(--color-accent);
        }

        .sidebar-footer {
          padding: var(--space-4) var(--space-6);
          border-top: 1px solid var(--color-border-subtle);
        }

        .version-tag {
          font-size: var(--text-xs);
          color: var(--color-text-muted);
          font-family: var(--font-mono);
        }

        .main-content {
          margin-left: 240px;
          flex: 1;
          min-height: 100vh;
        }
      `}</style>
    </nav>
  );
}
