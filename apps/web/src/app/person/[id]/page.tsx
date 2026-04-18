'use client';

// ══════════════════════════════════════
// Origineo — Person Detail Page
// ══════════════════════════════════════

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { personApi } from '@/lib/api';

export default function PersonPage() {
  const params = useParams();
  const personId = params?.id as string;

  const [person, setPerson] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!personId) return;

    async function load() {
      try {
        const result = await personApi.getById(personId);
        setPerson(result.data);
      } catch (err: any) {
        setError(err.message || 'Personne introuvable');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [personId]);

  if (loading) {
    return (
      <div style={{ padding: 'var(--space-8)' }}>
        <div className="container">
          <div className="skeleton" style={{ height: 40, width: 300, marginBottom: 'var(--space-6)' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
            <div className="skeleton" style={{ height: 300, borderRadius: 'var(--radius-xl)' }} />
            <div className="skeleton" style={{ height: 300, borderRadius: 'var(--radius-xl)' }} />
          </div>
        </div>
      </div>
    );
  }

  if (error || !person) {
    return (
      <div style={{ padding: 'var(--space-8)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <div className="glass-card" style={{ textAlign: 'center', maxWidth: 400 }}>
          <h2 style={{ color: 'var(--color-rose)', marginBottom: 'var(--space-4)' }}>Erreur</h2>
          <p style={{ color: 'var(--color-text-secondary)' }}>{error}</p>
        </div>
      </div>
    );
  }

  const displayName = person.givenNames + (person.usageSurname ? ` ${person.usageSurname}` : person.birthSurname ? ` ${person.birthSurname}` : '');

  const parents =
    person.childRelationships?.map((r: any) => r.parent).filter(Boolean) || [];
  const children =
    person.parentRelationships?.map((r: any) => r.child).filter(Boolean) || [];
  const unions = [
    ...(person.unionsAsPartner1 || []).map((u: any) => ({
      ...u,
      partner: u.partner2,
    })),
    ...(person.unionsAsPartner2 || []).map((u: any) => ({
      ...u,
      partner: u.partner1,
    })),
  ];

  return (
    <div style={{ padding: 'var(--space-8)' }} className="animate-fade-in">
      <div className="container">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
          <span style={{
            fontSize: '2.5rem',
            width: 60,
            height: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius-full)',
            background: person.gender === 'MALE' ? 'var(--color-male-subtle)' : person.gender === 'FEMALE' ? 'var(--color-female-subtle)' : 'var(--color-bg-elevated)',
          }}>
            {person.gender === 'MALE' ? '♂' : person.gender === 'FEMALE' ? '♀' : '◯'}
          </span>
          <div>
            <h1 id="person-name">{displayName}</h1>
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
              <span className={`badge ${person.gender === 'MALE' ? 'badge-male' : person.gender === 'FEMALE' ? 'badge-female' : 'badge-accent'}`}>
                {person.gender === 'MALE' ? 'Homme' : person.gender === 'FEMALE' ? 'Femme' : 'Inconnu'}
              </span>
              {person.isRootDefault && <span className="badge badge-accent">Racine</span>}
            </div>
          </div>
        </div>

        {/* Info Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 'var(--space-6)' }}>
          {/* Personal Info */}
          <div className="glass-card">
            <h3 style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--text-lg)' }}>
              📋 Informations Personnelles
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <InfoRow label="Prénom(s)" value={person.givenNames} />
              <InfoRow label="Nom d'usage" value={person.usageSurname} />
              <InfoRow label="Nom de naissance" value={person.birthSurname} />
              <InfoRow label="Naissance" value={person.birthDate ? `${new Date(person.birthDate).toLocaleDateString('fr-FR')}${person.birthPlace ? ` — ${person.birthPlace}` : ''}` : null} />
              <InfoRow label="Décès" value={person.deathDate ? `${new Date(person.deathDate).toLocaleDateString('fr-FR')}${person.deathPlace ? ` — ${person.deathPlace}` : ''}` : null} />
              <InfoRow label="Profession(s)" value={person.professions?.join(', ')} />
              {person.notes && (
                <div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-1)' }}>Notes</div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>
                    {person.notes}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Parents */}
          <div className="glass-card">
            <h3 style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--text-lg)' }}>
              👨‍👩‍👧 Parents ({parents.length})
            </h3>
            {parents.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Aucun parent enregistré</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {parents.map((p: any) => (
                  <PersonLink key={p.id} person={p} />
                ))}
              </div>
            )}
          </div>

          {/* Children */}
          <div className="glass-card">
            <h3 style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--text-lg)' }}>
              👶 Enfants ({children.length})
            </h3>
            {children.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Aucun enfant enregistré</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {children.map((c: any) => (
                  <PersonLink key={c.id} person={c} />
                ))}
              </div>
            )}
          </div>

          {/* Unions */}
          <div className="glass-card">
            <h3 style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--text-lg)' }}>
              💍 Unions ({unions.length})
            </h3>
            {unions.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Aucune union enregistrée</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {unions.map((u: any) => (
                  <div key={u.id} style={{
                    padding: 'var(--space-3)',
                    background: 'var(--color-bg-primary)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--color-border-subtle)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <PersonLink person={u.partner} />
                      <span className="badge badge-amber">{u.type}</span>
                    </div>
                    {u.startDate && (
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginTop: 'var(--space-1)' }}>
                        {new Date(u.startDate).toLocaleDateString('fr-FR')}
                        {u.startPlace && ` — ${u.startPlace}`}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* UUID */}
        <div style={{ marginTop: 'var(--space-8)', textAlign: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            UUID: {person.id}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Helper Components ──────────────────────
function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
        {value}
      </div>
    </div>
  );
}

function PersonLink({ person }: { person: any }) {
  const name = person.givenNames + (person.usageSurname ? ` ${person.usageSurname}` : person.birthSurname ? ` ${person.birthSurname}` : '');

  return (
    <a
      href={`/person/${person.id}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-3)',
        borderRadius: 'var(--radius-md)',
        color: 'var(--color-text-primary)',
        textDecoration: 'none',
        fontSize: 'var(--text-sm)',
        transition: 'background var(--transition-fast)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ fontSize: 'var(--text-sm)' }}>
        {person.gender === 'MALE' ? '♂' : person.gender === 'FEMALE' ? '♀' : '◯'}
      </span>
      <span>{name}</span>
    </a>
  );
}
