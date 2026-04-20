'use client';

// ══════════════════════════════════════
// Origineo — Search Page
// ══════════════════════════════════════

import { useState, useCallback } from 'react';
import { searchApi } from '@/lib/api';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [place, setPlace] = useState('');
  const [gender, setGender] = useState<'' | 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN'>('');
  const [birthDateFrom, setBirthDateFrom] = useState('');
  const [birthDateTo, setBirthDateTo] = useState('');
  const [deathDateFrom, setDeathDateFrom] = useState('');
  const [deathDateTo, setDeathDateTo] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const [results, setResults] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const hasCriteria =
    query.trim().length > 0
    || place.trim().length > 0
    || gender.length > 0
    || birthDateFrom.length > 0
    || birthDateTo.length > 0
    || deathDateFrom.length > 0
    || deathDateTo.length > 0;

  const handleSearch = useCallback(async () => {
    if (!hasCriteria) return;

    setLoading(true);
    setSearched(true);
    try {
      const result = await searchApi.search(
        {
          q: query.trim() || undefined,
          place: place.trim() || undefined,
          gender: gender || undefined,
          birthDateFrom: birthDateFrom || undefined,
          birthDateTo: birthDateTo || undefined,
          deathDateFrom: deathDateFrom || undefined,
          deathDateTo: deathDateTo || undefined,
        },
        1,
        50,
      );
      setResults(result.data.persons || []);
      setTotal(result.data.total || 0);
    } catch (err) {
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [
    hasCriteria,
    query,
    place,
    gender,
    birthDateFrom,
    birthDateTo,
    deathDateFrom,
    deathDateTo,
  ]);

  const resetFilters = () => {
    setQuery('');
    setPlace('');
    setGender('');
    setBirthDateFrom('');
    setBirthDateTo('');
    setDeathDateFrom('');
    setDeathDateTo('');
    setResults([]);
    setTotal(0);
    setSearched(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const criteriaSummary = [
    query.trim() ? `Texte: ${query.trim()}` : null,
    place.trim() ? `Lieu: ${place.trim()}` : null,
    gender ? `Genre: ${gender}` : null,
    birthDateFrom ? `Naissance >= ${birthDateFrom}` : null,
    birthDateTo ? `Naissance <= ${birthDateTo}` : null,
    deathDateFrom ? `Décès >= ${deathDateFrom}` : null,
    deathDateTo ? `Décès <= ${deathDateTo}` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="search-page" style={{ padding: 'var(--space-8)' }}>
      <div className="container">
        <h1 style={{ marginBottom: 'var(--space-2)' }}>
          🔍 Recherche
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-8)' }}>
          Recherchez par texte, dates (naissance/décès), lieu et genre.
        </p>

        {/* Search Bar */}
        <div style={{ display: 'grid', gap: 'var(--space-3)', marginBottom: 'var(--space-8)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <input
              id="search-input"
              className="input"
              type="text"
              placeholder="Ex: Jean Dupont, notaire, Bordeaux..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{ flex: 1 }}
            />
            <button
              id="search-button"
              className="btn btn-primary"
              onClick={handleSearch}
              disabled={loading || !hasCriteria}
            >
              {loading ? (
                <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
              ) : (
                'Rechercher'
              )}
            </button>
            <button
              className="btn btn-ghost"
              onClick={resetFilters}
              disabled={loading || !searched}
            >
              Réinitialiser
            </button>
          </div>

          <div className="glass-card" style={{ display: 'grid', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)' }}>
              <h3 style={{ fontSize: 'var(--text-base)', margin: 0 }}>Filtres avancés</h3>
              <button className="btn btn-ghost" onClick={() => setAdvancedOpen((value) => !value)}>
                {advancedOpen ? 'Masquer' : 'Afficher'}
              </button>
            </div>

            {advancedOpen && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)' }}>
                  <div className="input-group">
                    <label className="input-label">Lieu (naissance ou décès)</label>
                    <input
                      className="input"
                      value={place}
                      onChange={(e) => setPlace(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Ex: Lyon"
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label">Genre</label>
                    <select
                      className="input"
                      value={gender}
                      onChange={(e) => setGender(e.target.value as '' | 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN')}
                    >
                      <option value="">Tous</option>
                      <option value="MALE">Homme</option>
                      <option value="FEMALE">Femme</option>
                      <option value="OTHER">Autre</option>
                      <option value="UNKNOWN">Inconnu</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)' }}>
                  <div className="input-group">
                    <label className="input-label">Naissance à partir de</label>
                    <input className="input" type="date" value={birthDateFrom} onChange={(e) => setBirthDateFrom(e.target.value)} />
                  </div>

                  <div className="input-group">
                    <label className="input-label">Naissance jusqu&apos;à</label>
                    <input className="input" type="date" value={birthDateTo} onChange={(e) => setBirthDateTo(e.target.value)} />
                  </div>

                  <div className="input-group">
                    <label className="input-label">Décès à partir de</label>
                    <input className="input" type="date" value={deathDateFrom} onChange={(e) => setDeathDateFrom(e.target.value)} />
                  </div>

                  <div className="input-group">
                    <label className="input-label">Décès jusqu&apos;à</label>
                    <input className="input" type="date" value={deathDateTo} onChange={(e) => setDeathDateTo(e.target.value)} />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {searched && criteriaSummary.length > 0 && (
          <p style={{ color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
            Filtres appliqués: {criteriaSummary.join(' · ')}
          </p>
        )}

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
              Aucun résultat avec les filtres actuels.
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
                  person.given_names
                  + (person.usage_surname || person.birth_surname
                    ? ` ${person.usage_surname || person.birth_surname}`
                    : '');

                const birthLabel = person.birth_date
                  ? `Naissance: ${new Date(person.birth_date).toLocaleDateString('fr-FR')}`
                  : 'Naissance: inconnue';
                const deathLabel = person.death_date
                  ? `Décès: ${new Date(person.death_date).toLocaleDateString('fr-FR')}`
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
                        {birthLabel}
                        {person.birth_place ? ` · ${person.birth_place}` : ''}
                      </div>
                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                        {deathLabel || 'Décès: inconnu'}
                        {person.death_place ? ` · ${person.death_place}` : ''}
                      </div>
                    </div>

                    {person.similarity > 0 && (
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
