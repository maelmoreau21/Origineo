'use client';

import {
  type FormEvent,
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTreeWorkspaceMode } from './TreeWorkspaceContext';
import styles from './TreeWorkspace.module.css';
import { formatLife, personLabel, TreeWindow } from './types';

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
  onOpenDirectory: () => void;
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
  onOpenDirectory,
  onRefresh,
}: Props) {
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const stats = tree?.stats;
  const encodedTreeId = encodeURIComponent(treeId);
  const { mode, setMode, isReadOnly } = useTreeWorkspaceMode();

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent | any) {
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target)) {
        setViewMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    onSearch();
  }

  function applyPreset(
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
    <header className={styles.modernToolbar}>
      {/* Left: Brand & Tree Stats */}
      <div className={styles.toolbarBrand}>
        <div className={styles.brandIconWrapper}>
          <span className={styles.brandEmoji}>🌳</span>
        </div>
        <div className={styles.brandInfo}>
          <h1 className={styles.brandHeadline}>Origineo</h1>
          <div className={styles.brandSubtitle}>
            {stats ? (
              <span className={styles.statsBadge}>
                {stats.visiblePersons} personnes • {stats.visibleUnions} unions
              </span>
            ) : (
              <span>Arbre genealogique</span>
            )}
          </div>
        </div>
      </div>

      {/* Center: Search Bar */}
      <div ref={searchContainerRef} className={styles.searchWrapper}>
        <form className={styles.modernSearchForm} onSubmit={submitSearch}>
          <span className={styles.searchIcon}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>

          <input
            className={styles.modernSearchInput}
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="Rechercher une personne, lieu, annee..."
          />

          {searchQuery ? (
            <button
              type="button"
              className={styles.searchClearButton}
              onClick={() => onSearchQueryChange('')}
              title="Effacer la recherche"
            >
              ✕
            </button>
          ) : null}

          <button
            className={styles.modernSearchSubmit}
            type="submit"
            title="Lancer la recherche"
            disabled={searching}
          >
            {searching ? (
              <span className={styles.searchSpinner} />
            ) : (
              <span>Chercher</span>
            )}
          </button>
        </form>

        {/* Autocomplete Dropdown */}
        {searchResults.length > 0 && (
          <div className={styles.modernSearchResults}>
            <div className={styles.searchResultsHeader}>
              <span>{searchResults.length} resultat(s) trouve(s)</span>
            </div>
            <div className={styles.searchResultsList}>
              {searchResults.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  className={styles.searchResultRow}
                  onClick={() => onPickSearchResult(person.id)}
                >
                  <div className={`${styles.searchResultAvatar} ${person.gender === 'FEMALE' ? styles.avatarFemale : styles.avatarMale}`}>
                    {person.gender === 'FEMALE' ? '♀' : '♂'}
                  </div>
                  <div className={styles.searchResultDetails}>
                    <div className={styles.searchResultName}>{personLabel(person)}</div>
                    <div className={styles.searchResultMeta}>
                      {formatLife(person) || 'Dates inconnues'}
                      {[person.birthPlace, person.deathPlace].filter(Boolean).length > 0
                        ? ` • ${[person.birthPlace, person.deathPlace].filter(Boolean).join(' → ')}`
                        : ''}
                    </div>
                  </div>
                  <span className={styles.searchResultNavHint}>🎯</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: Actions and Controls */}
      <div className={styles.toolbarActions}>
        {/* Mode Switch (Consultation / Modification) */}
        <button
          type="button"
          role="switch"
          aria-checked={mode === 'modification'}
          className={`${styles.modernModeToggle} ${mode === 'modification' ? styles.modeToggleEdit : styles.modeToggleRead}`}
          onClick={() =>
            setMode((cur) => (cur === 'consultation' ? 'modification' : 'consultation'))
          }
          title={isReadOnly ? 'Passer en mode modification' : 'Passer en mode consultation'}
        >
          <span className={styles.modeToggleIndicator} />
          <span className={styles.modeToggleText}>
            {mode === 'modification' ? 'Edition' : 'Lecture'}
          </span>
        </button>

        {/* Annuaire */}
        <button
          type="button"
          className={styles.toolbarButton}
          onClick={onOpenDirectory}
          title="Ouvrir l'annuaire complet des personnes"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          <span className={styles.buttonLabel}>Annuaire</span>
        </button>

        {/* View Filters Popover */}
        <div ref={viewMenuRef} className={styles.popoverContainer}>
          <button
            type="button"
            className={`${styles.toolbarButton} ${viewMenuOpen ? styles.toolbarButtonActive : ''}`}
            onClick={() => setViewMenuOpen(!viewMenuOpen)}
            title="Ajuster la vue et les filtres de generations"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            <span className={styles.buttonLabel}>Affichage</span>
          </button>

          {viewMenuOpen && (
            <div className={styles.modernPopover}>
              <div className={styles.popoverHeader}>
                <span className={styles.popoverTitle}>Prereglages d'affichage</span>
              </div>

              {/* Presets */}
              <div className={styles.presetGrid}>
                <button
                  type="button"
                  className={styles.presetChip}
                  onClick={() => applyPreset(2, 2, true, true)}
                >
                  Proches (2G)
                </button>
                <button
                  type="button"
                  className={styles.presetChip}
                  onClick={() => applyPreset(6, 0, false, true)}
                >
                  Ascendance
                </button>
                <button
                  type="button"
                  className={styles.presetChip}
                  onClick={() => applyPreset(0, 4, false, true)}
                >
                  Descendance
                </button>
                <button
                  type="button"
                  className={styles.presetChip}
                  onClick={() => applyPreset(6, 4, true, true)}
                >
                  Tout visible
                </button>
              </div>

              <div className={styles.popoverDivider} />

              {/* Generation Sliders */}
              <div className={styles.sliderControl}>
                <div className={styles.sliderHeader}>
                  <span>Ancetres ({ancestors} gen.)</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={10}
                  value={ancestors}
                  onChange={(e) => onAncestorsChange(Number(e.target.value))}
                  className={styles.rangeInput}
                />
              </div>

              <div className={styles.sliderControl}>
                <div className={styles.sliderHeader}>
                  <span>Descendants ({descendants} gen.)</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={8}
                  value={descendants}
                  onChange={(e) => onDescendantsChange(Number(e.target.value))}
                  className={styles.rangeInput}
                />
              </div>

              {/* Toggles */}
              <div className={styles.toggleRow}>
                <button
                  type="button"
                  className={`${styles.popoverToggle} ${includeSiblings ? styles.popoverToggleActive : ''}`}
                  onClick={() => onIncludeSiblingsChange(!includeSiblings)}
                >
                  <span>{includeSiblings ? '✓ Fratrie incluse' : '+ Inclure fratrie'}</span>
                </button>
                <button
                  type="button"
                  className={`${styles.popoverToggle} ${includeSpouses ? styles.popoverToggleActive : ''}`}
                  onClick={() => onIncludeSpousesChange(!includeSpouses)}
                >
                  <span>{includeSpouses ? '✓ Conjoints inclus' : '+ Inclure conjoints'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Refresh Button */}
        <button
          type="button"
          className={styles.toolbarIconButton}
          onClick={onRefresh}
          title="Actualiser l'arbre"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>

        {/* Settings / GEDCOM Link */}
        <a
          href={`/tree-settings?tab=gedcom&treeId=${encodedTreeId}`}
          className={styles.toolbarIconButton}
          title="Parametres et import/export GEDCOM"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </a>

        {/* Admin Link */}
        <a
          href="/admin"
          className={styles.toolbarAdminLink}
          title="Acceder a l'espace administrateur"
        >
          <span>Admin</span>
        </a>
      </div>
    </header>
  );
}
