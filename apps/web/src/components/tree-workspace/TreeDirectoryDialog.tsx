'use client';

import { useEffect, useMemo, useState } from 'react';
import { personApi } from '@/lib/api';
import styles from './TreeWorkspace.module.css';
import { Person, personLabel, year } from './types';

type DirectoryPerson = Person & {
  isRootDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type SortKey = 'name' | 'birthDate' | 'birthPlace' | 'deathDate' | 'updatedAt';
type SortDirection = 'asc' | 'desc';

type Props = {
  open: boolean;
  treeId: string;
  selectedPersonId: string | null;
  onClose: () => void;
  onSelectPerson: (personId: string) => void;
  onFocusPerson: (personId: string) => void | Promise<void>;
};

const SORT_LABELS: Record<SortKey, string> = {
  name: 'Nom',
  birthDate: 'Naissance',
  birthPlace: 'Lieu',
  deathDate: 'Deces',
  updatedAt: 'Maj',
};

export default function TreeDirectoryDialog({
  open,
  treeId,
  selectedPersonId,
  onClose,
  onSelectPerson,
  onFocusPerson,
}: Props) {
  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let alive = true;
    async function loadAllPeople() {
      setLoading(true);
      setError(null);
      try {
        const rows: DirectoryPerson[] = [];
        let page = 1;
        let totalPages = 1;

        do {
          const envelope = await personApi.getAll(page, 500, treeId);
          const payload = envelope?.data ?? envelope;
          const pageRows = readRows(payload);
          rows.push(...pageRows);
          totalPages = Number(payload?.totalPages || page);
          page += 1;
        } while (page <= totalPages);

        if (!alive) return;
        setPeople(uniqueById(rows));
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'Annuaire indisponible.');
      } finally {
        if (alive) setLoading(false);
      }
    }

    void loadAllPeople();
    return () => {
      alive = false;
    };
  }, [open, treeId]);

  const filteredPeople = useMemo(() => {
    const normalizedQuery = normalize(query);
    const filtered = normalizedQuery
      ? people.filter((person) => {
          const haystack = normalize(
            [
              personLabel(person),
              person.birthDate,
              person.birthPlace,
              person.deathDate,
              person.deathPlace,
              person.gender,
            ]
              .filter(Boolean)
              .join(' '),
          );
          return haystack.includes(normalizedQuery);
        })
      : people;

    return [...filtered].sort((a, b) => {
      const result = comparePeople(a, b, sortKey);
      return sortDirection === 'asc' ? result : -result;
    });
  }, [people, query, sortDirection, sortKey]);

  if (!open) return null;

  function toggleSort(nextSortKey: SortKey) {
    if (nextSortKey === sortKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextSortKey);
    setSortDirection('asc');
  }

  async function openPerson(personId: string) {
    onSelectPerson(personId);
    await onFocusPerson(personId);
    onClose();
  }

  return (
    <div
      className={styles.dialogOverlay}
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`${styles.dialog} ${styles.directoryDialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tree-directory-title"
      >
        <div className={styles.dialogHeader}>
          <div>
            <div className={styles.panelEyebrow}>Annuaire</div>
            <h2 id="tree-directory-title" className={styles.dialogTitle}>
              Personnes de l'arbre
            </h2>
          </div>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onClose}
            aria-label="Fermer"
          >
            x
          </button>
        </div>

        <div className={styles.directoryControls}>
          <input
            className={styles.searchInput}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher nom, lieu, annee"
            autoFocus
          />
          <span className={styles.statusPill}>
            {filteredPeople.length} / {people.length}
          </span>
        </div>

        {error ? <div className={styles.formNotice}>{error}</div> : null}

        <div className={styles.directoryTableWrap}>
          <table className={styles.directoryTable}>
            <thead>
              <tr>
                {(['name', 'birthDate', 'birthPlace', 'deathDate', 'updatedAt'] as SortKey[]).map(
                  (key) => (
                    <th key={key}>
                      <button type="button" onClick={() => toggleSort(key)}>
                        {SORT_LABELS[key]}
                        {sortKey === key ? (sortDirection === 'asc' ? ' ^' : ' v') : ''}
                      </button>
                    </th>
                  ),
                )}
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6}>Chargement...</td>
                </tr>
              ) : null}
              {!loading && filteredPeople.length === 0 ? (
                <tr>
                  <td colSpan={6}>Aucune personne trouvee.</td>
                </tr>
              ) : null}
              {!loading
                ? filteredPeople.map((person) => {
                    const selected = person.id === selectedPersonId;
                    return (
                      <tr
                        key={person.id}
                        className={selected ? styles.directoryRowSelected : ''}
                        onDoubleClick={() => void openPerson(person.id)}
                      >
                        <td>
                          <strong>{personLabel(person)}</strong>
                          {person.isRootDefault ? (
                            <span className={styles.rootBadge}>Racine</span>
                          ) : null}
                        </td>
                        <td>{formatYear(person.birthDate)}</td>
                        <td>{person.birthPlace || '-'}</td>
                        <td>{formatYear(person.deathDate)}</td>
                        <td>{formatShortDate(person.updatedAt)}</td>
                        <td>
                          <button
                            type="button"
                            className={styles.tableAction}
                            onClick={() => void openPerson(person.id)}
                          >
                            Ouvrir
                          </button>
                        </td>
                      </tr>
                    );
                  })
                : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function readRows(payload: any): DirectoryPerson[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.persons)) return payload.persons;
  return [];
}

function uniqueById(people: DirectoryPerson[]) {
  const byId = new Map<string, DirectoryPerson>();
  for (const person of people) {
    byId.set(person.id, person);
  }
  return Array.from(byId.values());
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function comparePeople(a: DirectoryPerson, b: DirectoryPerson, key: SortKey) {
  if (key === 'name') {
    return personLabel(a).localeCompare(personLabel(b), 'fr', { sensitivity: 'base' });
  }

  const valueA = key === 'birthPlace' ? a.birthPlace || '' : a[key] || '';
  const valueB = key === 'birthPlace' ? b.birthPlace || '' : b[key] || '';
  return String(valueA).localeCompare(String(valueB), 'fr', {
    numeric: true,
    sensitivity: 'base',
  });
}

function formatYear(value?: string | null) {
  return value ? year(value) : '-';
}

function formatShortDate(value?: string | null) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return parsed.toLocaleDateString('fr-FR');
}
