'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';

export default function SessionGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  const isAdminRoute = useMemo(() => pathname?.startsWith('/admin') ?? false, [pathname]);

  useEffect(() => {
    if (isAdminRoute) {
      setAllowed(true);
      return;
    }

    const token = window.localStorage.getItem('origineo_token');
    if (!token) {
      router.replace('/admin');
      setAllowed(false);
      return;
    }

    authApi.getProfile(token)
      .then(() => {
        setAllowed(true);
      })
      .catch(() => {
        window.localStorage.removeItem('origineo_token');
        router.replace('/admin');
        setAllowed(false);
      });
  }, [isAdminRoute, router]);

  if (isAdminRoute) {
    return <>{children}</>;
  }

  if (!allowed) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-8)',
        }}
      >
        <div className="glass-card" style={{ textAlign: 'center', minWidth: 260 }}>
          <div className="spinner" style={{ margin: '0 auto var(--space-3)' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>Vérification de session...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
