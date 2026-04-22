'use client';

import { useState, useEffect, useCallback } from 'react';
import { searchApi } from '@/lib/api';

function normalizePerson(person: any) {
  return {
    id: person.id,
    givenNames: person.givenNames ?? person.given_names ?? '',
    usageSurname: person.usageSurname ?? person.usage_surname ?? null,
    birthSurname: person.birthSurname ?? person.birth_surname ?? null,
    gender: person.gender ?? 'UNKNOWN',
    birthDate: person.birthDate ?? person.birth_date ?? null,
    birthPlace: person.birthPlace ?? person.birth_place ?? null,
  };
}

function personDisplayName(person: any) {
  if (!person) return '';
  const p = normalizePerson(person);
  const surname = p.usageSurname || p.birthSurname || '';
  return `${p.givenNames}${surname ? ` ${surname}` : ''}`.trim();
}

export type TreeSettingsPanelProps = {
  visible: boolean;
  onClose: () => void;
  // Tree params
  ancestorGens: number;
  descendantGens: number;
  onAncestorGensChange: (v: number) => void;
  onDescendantGensChange: (v: number) => void;
  // Focus
  focusModeEnabled: boolean;
  onFocusModeChange: (v: boolean) => void;
  // Drag
  dragLinkType: string;
  onDragLinkTypeChange: (v: string) => void;
  relationshipType: string;
  onRelationshipTypeChange: (v: string) => void;
  unionType: string;
  onUnionTypeChange: (v: string) => void;
  // Zoom
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  onFocusSelected: () => void;
  // Root
  onChangeRoot: (person: any) => void;
  selectedPersonId: string | null;
  // Admin
  isAdmin: boolean;
  nodeCount: number;
  onSetDefaultRoot: () => void;
  onOpenStandaloneCreate: () => void;
  actionBusy: boolean;
  // Exports
  onExportPng: () => void;
  onExportPdf: () => void;
  onExportCsvVisible: () => void;
  onExportCsvBranch: () => void;
  exportBusy: string | null;
  // Undo/redo
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  // Presentation
  presentationMode: boolean;
  onTogglePresentation: () => void;
  // Error
  error: string | null;
  onRetry: () => void;
};

export default function TreeSettingsPanel(props: TreeSettingsPanelProps) {
  const {
    visible, onClose,
    ancestorGens, descendantGens, onAncestorGensChange, onDescendantGensChange,
    focusModeEnabled, onFocusModeChange,
    dragLinkType, onDragLinkTypeChange,
    relationshipType, onRelationshipTypeChange,
    unionType, onUnionTypeChange,
    onZoomIn, onZoomOut, onZoomFit, onFocusSelected,
    onChangeRoot, selectedPersonId,
    isAdmin, nodeCount,
    onSetDefaultRoot, onOpenStandaloneCreate, actionBusy,
    onExportPng, onExportPdf, onExportCsvVisible, onExportCsvBranch, exportBusy,
    canUndo, canRedo, onUndo, onRedo,
    presentationMode, onTogglePresentation,
    error, onRetry,
  } = props;

  const [focusQuery, setFocusQuery] = useState('');
  const [focusResults, setFocusResults] = useState<any[]>([]);
  const [focusLoading, setFocusLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    const q = focusQuery.trim();
    if (q.length < 2) { setFocusResults([]); setFocusLoading(false); return; }
    const t = setTimeout(async () => {
      setFocusLoading(true);
      try {
        const r = await searchApi.search(q, 1, 8);
        setFocusResults((r.data?.persons || []).map(normalizePerson));
      } catch { setFocusResults([]); }
      finally { setFocusLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [focusQuery]);

  const selectPerson = useCallback((p: any) => {
    onChangeRoot(p);
    setFocusQuery(personDisplayName(p));
    setShowResults(false);
  }, [onChangeRoot]);

  if (presentationMode) return null;

  return (
    <>
      <div
        className="tsp-panel"
        data-visible={visible ? 'true' : 'false'}
      >
        {/* Header */}
        <div className="tsp-header">
          <div>
            <div className="tsp-title">
              <span style={{ fontSize: '1.1rem' }}>🌳</span>
              <span>Arbre</span>
              {nodeCount > 0 && (
                <span className="tsp-badge">{nodeCount}</span>
              )}
            </div>
          </div>
          <button className="tsp-close" onClick={onClose} title="Fermer">✕</button>
        </div>

        <div className="tsp-body">
          {/* Search */}
          <div className="tsp-section">
            <div className="tsp-section-icon">🔍</div>
            <div className="tsp-section-content">
              <div style={{ position: 'relative' }}>
                <input
                  className="tsp-input"
                  placeholder="Rechercher une personne..."
                  value={focusQuery}
                  onChange={(e) => { setFocusQuery(e.target.value); setShowResults(true); }}
                  onFocus={() => setShowResults(true)}
                />
                {showResults && (focusLoading || focusResults.length > 0) && (
                  <div className="tsp-dropdown">
                    {focusLoading && <div className="tsp-dropdown-msg">Recherche...</div>}
                    {!focusLoading && focusResults.map((p) => (
                      <button key={p.id} className="tsp-dropdown-item" onClick={() => selectPerson(p)}>
                        <span>{personDisplayName(p)}</span>
                        <span className="tsp-dropdown-sub">
                          {p.gender === 'MALE' ? '♂' : p.gender === 'FEMALE' ? '♀' : '◯'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="tsp-btn-row">
                {selectedPersonId && (
                  <button className="tsp-btn" onClick={onFocusSelected}>Focus</button>
                )}
                <button className="tsp-btn" onClick={onZoomFit}>Vue globale</button>
                <button className="tsp-btn" onClick={onZoomOut}>−</button>
                <button className="tsp-btn" onClick={onZoomIn}>+</button>
              </div>
            </div>
          </div>

          {/* Generations */}
          <div className="tsp-section">
            <div className="tsp-section-icon">📊</div>
            <div className="tsp-section-content">
              <div className="tsp-label">Générations affichées</div>
              <div className="tsp-gen-grid">
                <div className="tsp-gen-item">
                  <span className="tsp-gen-label">Ancêtres</span>
                  <div className="tsp-gen-control">
                    <button className="tsp-gen-btn" onClick={() => onAncestorGensChange(Math.max(0, ancestorGens - 1))} disabled={ancestorGens <= 0}>−</button>
                    <span className="tsp-gen-value">{ancestorGens}</span>
                    <button className="tsp-gen-btn" onClick={() => onAncestorGensChange(Math.min(8, ancestorGens + 1))} disabled={ancestorGens >= 8}>+</button>
                  </div>
                </div>
                <div className="tsp-gen-item">
                  <span className="tsp-gen-label">Descendants</span>
                  <div className="tsp-gen-control">
                    <button className="tsp-gen-btn" onClick={() => onDescendantGensChange(Math.max(0, descendantGens - 1))} disabled={descendantGens <= 0}>−</button>
                    <span className="tsp-gen-value">{descendantGens}</span>
                    <button className="tsp-gen-btn" onClick={() => onDescendantGensChange(Math.min(6, descendantGens + 1))} disabled={descendantGens >= 6}>+</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Options */}
          <details className="tsp-details" open>
            <summary>
              <span className="tsp-section-icon" style={{ marginRight: 8 }}>⚙️</span>
              Options
            </summary>
            <div className="tsp-details-body">
              <div className="tsp-opt-grid">
                <div className="tsp-opt">
                  <label className="tsp-opt-label">Navigation</label>
                  <select className="tsp-select" value={focusModeEnabled ? 'FOCUS' : 'EXPANDED'} onChange={(e) => onFocusModeChange(e.target.value === 'FOCUS')}>
                    <option value="FOCUS">Focus</option>
                    <option value="EXPANDED">Étendu</option>
                  </select>
                </div>
                <div className="tsp-opt">
                  <label className="tsp-opt-label">Glisser-relier</label>
                  <select className="tsp-select" value={dragLinkType} onChange={(e) => onDragLinkTypeChange(e.target.value)}>
                    <option value="PARENT_CHILD">Parenté</option>
                    <option value="UNION">Union</option>
                  </select>
                </div>
                {dragLinkType === 'PARENT_CHILD' ? (
                  <div className="tsp-opt">
                    <label className="tsp-opt-label">Type lien</label>
                    <select className="tsp-select" value={relationshipType} onChange={(e) => onRelationshipTypeChange(e.target.value)}>
                      <option value="BIOLOGICAL">Bio</option>
                      <option value="ADOPTIVE">Adoptif</option>
                      <option value="FOSTER">Accueil</option>
                    </select>
                  </div>
                ) : (
                  <div className="tsp-opt">
                    <label className="tsp-opt-label">Type union</label>
                    <select className="tsp-select" value={unionType} onChange={(e) => onUnionTypeChange(e.target.value)}>
                      <option value="MARRIAGE">Mariage</option>
                      <option value="PACS">PACS</option>
                      <option value="PARTNERSHIP">Partenariat</option>
                      <option value="OTHER">Autre</option>
                    </select>
                  </div>
                )}
              </div>
              <button className="tsp-btn tsp-btn-wide" onClick={onTogglePresentation}>
                {presentationMode ? 'Quitter présentation' : '🖥 Présentation'}
              </button>
            </div>
          </details>

          {/* Exports */}
          <details className="tsp-details">
            <summary>
              <span className="tsp-section-icon" style={{ marginRight: 8 }}>📤</span>
              Exports & Historique
            </summary>
            <div className="tsp-details-body">
              <div className="tsp-btn-row">
                <button className="tsp-btn" disabled={!canUndo || actionBusy} onClick={onUndo}>↩ Annuler</button>
                <button className="tsp-btn" disabled={!canRedo || actionBusy} onClick={onRedo}>↪ Rétablir</button>
              </div>
              <div className="tsp-btn-row">
                <button className="tsp-btn" onClick={onExportPng} disabled={!!exportBusy}>
                  {exportBusy === 'PNG' ? '...' : 'PNG'}
                </button>
                <button className="tsp-btn" onClick={onExportPdf} disabled={!!exportBusy}>
                  {exportBusy === 'PDF' ? '...' : 'PDF'}
                </button>
                <button className="tsp-btn" onClick={onExportCsvVisible} disabled={!!exportBusy}>
                  {exportBusy === 'CSV_VISIBLE' ? '...' : 'CSV vue'}
                </button>
                <button className="tsp-btn" onClick={onExportCsvBranch} disabled={!!exportBusy}>
                  {exportBusy === 'CSV_BRANCH' ? '...' : 'CSV branche'}
                </button>
              </div>
            </div>
          </details>

          {/* Admin */}
          {isAdmin && (
            <div className="tsp-section tsp-admin">
              <div className="tsp-section-icon">👑</div>
              <div className="tsp-section-content">
                <div className="tsp-label">Administration</div>
                <div className="tsp-btn-row">
                  {selectedPersonId && (
                    <button className="tsp-btn tsp-btn-sec" onClick={onSetDefaultRoot} disabled={actionBusy}>
                      ⭐ Racine défaut
                    </button>
                  )}
                  <button className="tsp-btn tsp-btn-accent" onClick={onOpenStandaloneCreate}>
                    + Nouvelle personne
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Retry */}
          {error && (
            <button className="tsp-btn tsp-btn-accent tsp-btn-wide" onClick={onRetry}>
              🔄 Réessayer
            </button>
          )}

          {/* Shortcuts */}
          <div className="tsp-shortcuts">
            Clic: sélectionner · Double-clic: recentrer · F: focus · +/-: zoom · G: vue globale
          </div>

          {/* Links */}
          <div className="tsp-links">
            <a href="/search">Recherche avancée</a>
            <a href="/tree-settings">Paramètres</a>
            {isAdmin && <a href="/admin">Admin</a>}
          </div>
        </div>
      </div>

      <style>{`
        .tsp-panel {
          position: absolute;
          top: var(--space-3);
          left: var(--space-3);
          bottom: var(--space-3);
          width: min(320px, calc(100% - 2 * var(--space-3)));
          z-index: 15;
          display: flex;
          flex-direction: column;
          background: rgba(14, 17, 23, 0.94);
          border: 1px solid hsla(220, 20%, 28%, 0.5);
          border-radius: 16px;
          box-shadow: 0 8px 32px hsla(220, 40%, 4%, 0.5);
          backdrop-filter: blur(16px);
          overflow: hidden;
          transition: opacity 200ms ease, transform 200ms ease;
        }
        .tsp-panel[data-visible='false'] {
          opacity: 0;
          transform: translateX(-12px);
          pointer-events: none;
        }
        .tsp-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px 10px;
          border-bottom: 1px solid hsla(220, 20%, 28%, 0.4);
        }
        .tsp-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 700;
          font-size: 0.95rem;
          color: var(--color-text-primary);
        }
        .tsp-badge {
          font-size: 0.65rem;
          font-weight: 600;
          background: hsla(200, 80%, 50%, 0.15);
          color: hsl(200, 80%, 65%);
          padding: 2px 8px;
          border-radius: 99px;
        }
        .tsp-close {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          border: 1px solid hsla(220, 20%, 28%, 0.5);
          background: transparent;
          color: var(--color-text-secondary);
          font-size: 0.8rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 120ms ease;
        }
        .tsp-close:hover { background: hsla(220, 20%, 28%, 0.5); }
        .tsp-body {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .tsp-body::-webkit-scrollbar { width: 6px; }
        .tsp-body::-webkit-scrollbar-thumb { background: hsla(200, 15%, 50%, 0.3); border-radius: 99px; }
        .tsp-section {
          display: flex;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 12px;
          background: hsla(220, 20%, 16%, 0.6);
          border: 1px solid hsla(220, 20%, 28%, 0.3);
        }
        .tsp-section-icon {
          font-size: 0.9rem;
          flex-shrink: 0;
          margin-top: 2px;
        }
        .tsp-section-content {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .tsp-label {
          font-size: 0.7rem;
          font-weight: 600;
          color: var(--color-text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .tsp-input {
          width: 100%;
          padding: 8px 10px;
          border-radius: 8px;
          border: 1px solid hsla(220, 20%, 28%, 0.5);
          background: hsla(220, 20%, 12%, 0.7);
          color: var(--color-text-primary);
          font-size: 0.78rem;
          outline: none;
          transition: border-color 150ms ease;
        }
        .tsp-input:focus { border-color: hsl(200, 80%, 50%); }
        .tsp-input::placeholder { color: var(--color-text-muted); }
        .tsp-dropdown {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          z-index: 30;
          background: hsla(220, 24%, 14%, 0.98);
          border: 1px solid hsla(220, 20%, 28%, 0.5);
          border-radius: 10px;
          box-shadow: 0 8px 24px hsla(220, 40%, 4%, 0.5);
          overflow: hidden;
          max-height: 260px;
          overflow-y: auto;
        }
        .tsp-dropdown-msg {
          padding: 10px 12px;
          font-size: 0.72rem;
          color: var(--color-text-muted);
        }
        .tsp-dropdown-item {
          width: 100%;
          text-align: left;
          border: none;
          background: transparent;
          color: var(--color-text-primary);
          padding: 8px 12px;
          font-size: 0.76rem;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: background 100ms ease;
        }
        .tsp-dropdown-item:hover { background: hsla(200, 80%, 50%, 0.1); }
        .tsp-dropdown-sub { font-size: 0.7rem; color: var(--color-text-muted); }
        .tsp-btn-row {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        .tsp-btn {
          padding: 5px 10px;
          border-radius: 7px;
          border: 1px solid hsla(220, 20%, 28%, 0.5);
          background: hsla(220, 20%, 18%, 0.6);
          color: var(--color-text-secondary);
          font-size: 0.7rem;
          font-weight: 500;
          cursor: pointer;
          transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
          white-space: nowrap;
        }
        .tsp-btn:hover:not(:disabled) { background: hsla(220, 20%, 24%, 0.8); color: var(--color-text-primary); border-color: hsla(200, 80%, 50%, 0.3); }
        .tsp-btn:disabled { opacity: 0.4; cursor: default; }
        .tsp-btn-wide { width: 100%; text-align: center; }
        .tsp-btn-sec { border-color: hsla(200, 60%, 40%, 0.4); }
        .tsp-btn-accent {
          background: hsla(200, 80%, 50%, 0.15);
          border-color: hsla(200, 80%, 50%, 0.3);
          color: hsl(200, 80%, 65%);
        }
        .tsp-btn-accent:hover:not(:disabled) { background: hsla(200, 80%, 50%, 0.25); }
        .tsp-gen-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .tsp-gen-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 6px;
          border-radius: 8px;
          background: hsla(220, 20%, 14%, 0.5);
          border: 1px solid hsla(220, 20%, 28%, 0.3);
        }
        .tsp-gen-label { font-size: 0.65rem; color: var(--color-text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
        .tsp-gen-control { display: flex; align-items: center; gap: 8px; }
        .tsp-gen-btn {
          width: 26px;
          height: 26px;
          border-radius: 6px;
          border: 1px solid hsla(220, 20%, 28%, 0.5);
          background: hsla(220, 20%, 20%, 0.6);
          color: var(--color-text-secondary);
          font-size: 0.85rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 120ms ease;
        }
        .tsp-gen-btn:hover:not(:disabled) { background: hsla(200, 80%, 50%, 0.15); }
        .tsp-gen-btn:disabled { opacity: 0.3; cursor: default; }
        .tsp-gen-value { font-size: 1.1rem; font-weight: 700; color: var(--color-text-primary); min-width: 20px; text-align: center; font-family: var(--font-mono); }
        .tsp-details {
          border-radius: 12px;
          border: 1px solid hsla(220, 20%, 28%, 0.3);
          background: hsla(220, 20%, 16%, 0.6);
          overflow: hidden;
        }
        .tsp-details summary {
          cursor: pointer;
          list-style: none;
          padding: 8px 12px;
          font-size: 0.72rem;
          font-weight: 600;
          color: var(--color-text-secondary);
          display: flex;
          align-items: center;
          transition: background 120ms ease;
        }
        .tsp-details summary:hover { background: hsla(220, 20%, 22%, 0.4); }
        .tsp-details summary::-webkit-details-marker { display: none; }
        .tsp-details summary::after { content: '+'; margin-left: auto; font-size: 0.8rem; opacity: 0.6; }
        .tsp-details[open] summary { border-bottom: 1px solid hsla(220, 20%, 28%, 0.3); }
        .tsp-details[open] summary::after { content: '−'; }
        .tsp-details-body {
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .tsp-opt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
        .tsp-opt { display: flex; flex-direction: column; gap: 3px; }
        .tsp-opt-label { font-size: 0.62rem; color: var(--color-text-muted); font-weight: 600; }
        .tsp-select {
          padding: 5px 8px;
          border-radius: 6px;
          border: 1px solid hsla(220, 20%, 28%, 0.5);
          background: hsla(220, 20%, 12%, 0.7);
          color: var(--color-text-primary);
          font-size: 0.7rem;
          outline: none;
        }
        .tsp-admin { border-color: hsla(45, 80%, 50%, 0.2); background: hsla(45, 40%, 16%, 0.4); }
        .tsp-shortcuts {
          font-size: 0.62rem;
          color: var(--color-text-muted);
          line-height: 1.5;
          padding: 6px 8px;
          border-radius: 8px;
          background: hsla(220, 20%, 14%, 0.4);
          border: 1px solid hsla(220, 20%, 28%, 0.2);
        }
        .tsp-links {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .tsp-links a {
          font-size: 0.66rem;
          padding: 4px 10px;
          border-radius: 6px;
          border: 1px solid hsla(220, 20%, 28%, 0.4);
          background: hsla(220, 20%, 18%, 0.5);
          color: var(--color-text-secondary);
          text-decoration: none;
          transition: background 120ms ease;
        }
        .tsp-links a:hover { background: hsla(220, 20%, 24%, 0.7); color: var(--color-text-primary); }
        @media (max-width: 900px) {
          .tsp-panel {
            left: var(--space-2);
            right: var(--space-2);
            width: auto;
            max-height: calc(100vh - 2 * var(--space-2));
          }
        }
      `}</style>
    </>
  );
}
