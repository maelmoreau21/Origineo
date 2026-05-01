'use client';

import { FormEvent } from 'react';
import styles from './TreeWorkspace.module.css';
import { personLabel, TreeWindow } from './types';

type Props = {
  tree: TreeWindow | null;
  searchQuery: string;
  searchResults: any[];
  searching: boolean;
  ancestors: number;
  descendants: number;
  includeSiblings: boolean;
  includeSpouses: boolean;
  hasToken: boolean;
  onSearchQueryChange: (value: string) => void;
  onSearch: () => void;
  onPickSearchResult: (personId: string) => void;
  onAncestorsChange: (value: number) => void;
  onDescendantsChange: (value: number) => void;
  onIncludeSiblingsChange: (value: boolean) => void;
  onIncludeSpousesChange: (value: boolean) => void;
  onRefresh: () => void;
  onImport: (mode: 'import' | 'merge') => void;
  onExport: () => void;
};

export default function TreeToolbar({
  tree,
  searchQuery,
  searchResults,
  searching,
  ancestors,
  descendants,
  includeSiblings,
  includeSpouses,
  hasToken,
  onSearchQueryChange,
  onSearch,
  onPickSearchResult,
  onAncestorsChange,
  onDescendantsChange,
  onIncludeSiblingsChange,
  onIncludeSpousesChange,
  onRefresh,
  onImport,
  onExport,
}: Props) {
  const stats = tree?.stats;

  function submit(event: FormEvent) {
    event.preventDefault();
    onSearch();
  }

  return (
    <header className={styles.toolbar}>
      <div className={styles.brand}>
        <div className={styles.brandMark}>O</div>
        <div className={styles.brandText}>
          <div className={styles.brandTitle}>Origineo Workspace</div>
          <div className={styles.brandMeta}>
            {stats
              ? `${stats.visiblePersons} visibles / ${stats.totalCollectedPersons} collectees`
              : 'Fenetre active million-scale'}
          </div>
        </div>
      </div>

      <form className={styles.searchForm} onSubmit={submit}>
        <input
          className={styles.searchInput}
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="Rechercher une personne, un lieu, une annee"
        />
        <button className={styles.searchButton} type="submit" title="Rechercher">
          {searching ? '...' : 'Go'}
        </button>
        {searchResults.length > 0 ? (
          <div className={styles.searchResults}>
            {searchResults.map((person) => (
              <button
                key={person.id}
                type="button"
                className={styles.searchResult}
                onClick={() => onPickSearchResult(person.id)}
              >
                <strong>{personLabel(person)}</strong>
                <div className={styles.muted}>
                  {[person.birthPlace, person.deathPlace].filter(Boolean).join(' - ')}
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </form>

      <div className={styles.toolbarCluster}>
        <div className={styles.controlGroup}>
          <label className={styles.muted} htmlFor="ancestors">
            Asc
          </label>
          <input
            id="ancestors"
            className={styles.smallInput}
            type="number"
            min={0}
            max={12}
            value={ancestors}
            onChange={(event) => onAncestorsChange(Number(event.target.value))}
          />
          <label className={styles.muted} htmlFor="descendants">
            Desc
          </label>
          <input
            id="descendants"
            className={styles.smallInput}
            type="number"
            min={0}
            max={12}
            value={descendants}
            onChange={(event) => onDescendantsChange(Number(event.target.value))}
          />
        </div>

        <div className={styles.controlGroup}>
          <button
            type="button"
            className={`${styles.toggle} ${includeSiblings ? styles.toggleActive : ''}`}
            onClick={() => onIncludeSiblingsChange(!includeSiblings)}
          >
            Fratrie
          </button>
          <button
            type="button"
            className={`${styles.toggle} ${includeSpouses ? styles.toggleActive : ''}`}
            onClick={() => onIncludeSpousesChange(!includeSpouses)}
          >
            Conjoints
          </button>
        </div>
      </div>

      <div className={styles.toolbarCluster}>
        <button className={styles.iconButton} type="button" onClick={onRefresh} title="Actualiser">
          R
        </button>
        <button className={styles.button} type="button" onClick={onExport}>
          Export
        </button>
        <button
          className={styles.button}
          type="button"
          disabled={!hasToken}
          onClick={() => onImport('import')}
        >
          Import GEDCOM
        </button>
        <button
          className={`${styles.button} ${styles.primaryButton}`}
          type="button"
          disabled={!hasToken}
          onClick={() => onImport('merge')}
        >
          Fusion
        </button>
      </div>
    </header>
  );
}
