'use client';

// ══════════════════════════════════════
// Origineo — Search Page
// ══════════════════════════════════════

import { useState, useCallback } from 'react';
import { searchApi } from '@/lib/api';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    setLoading(true);
    setSearched(true);
    try {
      const result = await searchApi.search(query);
      setResults(result.data.persons || []);
      setTotal(result.data.total || 0);
    } catch (err) {
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="search-page" style={{ padding: 'var(--space-8)' }}>
      <div className="container">
        <h1 style={{ marginBottom: 'var(--space-2)' }}>
          🔍 Recherche
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-8)' }}>
          Recherchez une personne par nom, prénom ou lieu de naissance.
        </p>

        {/* Search Bar */}
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-8)' }}>
          <input
            id="search-input"
            className="input"
            type="text"
            placeholder="Ex: Jean Dupont, Paris..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ flex: 1 }}
          />
          <button
            id="search-button"
            className="btn btn-primary"
            onClick={handleSearch}
            disabled={loading || !query.trim()}
          >
            {loading ? (
              <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            ) : (
              'Rechercher'
            )}
          </button>
        </div>

        {/* Results */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 80, borderRadius: 'var(--radius-lg)' }} />
            ))}
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="glass-card" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
            <p style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-2)' }}>😕</p>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              Aucun résultat pour &quot;{query}&quot;
            </p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <>
            <p style={{ color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
              {total} résultat{total > 1 ? 's' : ''} trouvé{total > 1 ? 's' : ''}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {results.map((person: any) => {
                const displayName =
                  person.given_names +
                  (person.usage_surname || person.birth_surname
                    ? ` ${person.usage_surname || person.birth_surname}`
                    : '');

                const birthYear = person.birth_date
                  ? new Date(person.birth_date).getFullYear()
                  : null;

                return (
                  <a
                    key={person.id}
                    href={`/person/${person.id}`}
                    className="glass-card"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-4)',
                      textDecoration: 'none',
                      color: 'inherit',
                      padding: 'var(--space-4) var(--space-6)',
                    }}
                    id={`search-result-${person.id}`}
                  >
                    <span
                      className={`badge ${person.gender === 'MALE' ? 'badge-male' : person.gender === 'FEMALE' ? 'badge-female' : 'badge-accent'}`}
                      style={{ fontSize: '1.2rem', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-full)' }}
                    >
                      {person.gender === 'MALE' ? '♂' : person.gender === 'FEMALE' ? '♀' : '◯'}
                    </span>

                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{displayName}</div>
                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                        {birthYear && `Né(e) en ${birthYear}`}
                        {person.birth_place && ` à ${person.birth_place}`}
                      </div>
                    </div>

                    {person.similarity !== undefined && (
                      <span className="badge badge-emerald">
                        {Math.round(person.similarity * 100)}%
                      </span>
                    )}
                  </a>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
