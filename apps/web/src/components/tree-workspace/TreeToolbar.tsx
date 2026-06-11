'use client';

import { FormEvent } from 'react';
import styles from './TreeWorkspace.module.css';
import { personLabel, TreeWindow } from './types';

type Props = {
  treeId: string;
  tree: TreeWindow | null;
  searchQuery: string;
  searchResults: any[];
  searching: boolean;
  ancestors: number;
  descendants: number;
  includeSiblings: boolean;
  includeSpouses: boolean;
  onSearchQueryChange: (value: string) => void;
  onSearch: () => void;
  onPickSearchResult: (personId: string) => void;
  onAncestorsChange: (value: number) => void;
  onDescendantsChange: (value: number) => void;
  onIncludeSiblingsChange: (value: boolean) => void;
  onIncludeSpousesChange: (value: boolean) => void;
  onRefresh: () => void;
};

export default function TreeToolbar({
  treeId,
  tree,
  searchQuery,
  searchResults,
  searching,
  ancestors,
  descendants,
  includeSiblings,
  includeSpouses,
  onSearchQueryChange,
  onSearch,
  onPickSearchResult,
  onAncestorsChange,
  onDescendantsChange,
  onIncludeSiblingsChange,
  onIncludeSpousesChange,
  onRefresh,
}: Props) {
  const stats = tree?.stats;
  const encodedTreeId = encodeURIComponent(treeId);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSearch();
  }

  function applyViewPreset(
    nextAncestors: number,
    nextDescendants: number,
    nextSiblings: boolean,
    nextSpouses: boolean,
  ) {
    onAncestorsChange(nextAncestors);
    onDescendantsChange(nextDescendants);
    onIncludeSiblingsChange(nextSiblings);
    onIncludeSpousesChange(nextSpouses);
  }

  return (
    <header className={styles.toolbar}>
      <div className={styles.brand}>
        <div className={styles.brandText}>
          <div className={styles.brandTitle}>Arbre genealogique</div>
          <div className={styles.brandMeta}>
            {stats
              ? `${stats.visiblePersons} personnes visibles`
              : 'Importez ou recherchez une personne'}
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
          {searching ? '...' : 'Rechercher'}
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
        <a className={styles.button} href={`/tree-settings?tab=people&treeId=${encodedTreeId}`}>
          Annuaire
        </a>
        <a className={styles.button} href={`/tree-settings?tab=gedcom&treeId=${encodedTreeId}`}>
          Gestion
        </a>
        <details className={styles.viewMenu}>
          <summary>Vue</summary>
          <div className={styles.viewMenuPanel}>
            <div className={styles.presetGrid}>
              <button
                type="button"
                className={styles.presetButton}
                onClick={() => applyViewPreset(2, 2, true, true)}
              >
                Famille proche
              </button>
              <button
                type="button"
                className={styles.presetButton}
                onClick={() => applyViewPreset(8, 0, false, true)}
              >
                Ascendance
              </button>
              <button
                type="button"
                className={styles.presetButton}
                onClick={() => applyViewPreset(0, 6, false, true)}
              >
                Descendance
              </button>
              <button
                type="button"
                className={styles.presetButton}
                onClick={() => applyViewPreset(6, 6, true, true)}
              >
                Tout visible
              </button>
            </div>
            <label className={styles.label} htmlFor="ancestors">
              Ancetres
              <input
                id="ancestors"
                className={styles.smallInput}
                type="number"
                min={0}
                max={12}
                value={ancestors}
                onChange={(event) => onAncestorsChange(Number(event.target.value))}
              />
            </label>
            <label className={styles.label} htmlFor="descendants">
              Descendants
              <input
                id="descendants"
                className={styles.smallInput}
                type="number"
                min={0}
                max={12}
                value={descendants}
                onChange={(event) => onDescendantsChange(Number(event.target.value))}
              />
            </label>
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
        </details>
        <button className={styles.button} type="button" onClick={onRefresh}>
          Actualiser
        </button>
      </div>
    </header>
  );
}
