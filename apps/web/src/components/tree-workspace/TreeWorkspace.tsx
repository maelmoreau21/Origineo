'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  gedcomApi,
  personApi,
  searchApi,
  treeApi,
} from '@/lib/api';
import BranchDeleteDialog from './BranchDeleteDialog';
import GedcomImportDrawer from './GedcomImportDrawer';
import MergeReviewDrawer from './MergeReviewDrawer';
import PersonInspector from './PersonInspector';
import TreeCanvas from './TreeCanvas';
import TreeToolbar from './TreeToolbar';
import styles from './TreeWorkspace.module.css';
import { Person, TreeWindow } from './types';

export default function TreeWorkspace() {
  const [token, setToken] = useState<string | null>(null);
  const [rootPersonId, setRootPersonId] = useState<string | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [tree, setTree] = useState<TreeWindow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ancestors, setAncestors] = useState(4);
  const [descendants, setDescendants] = useState(2);
  const [includeSiblings, setIncludeSiblings] = useState(true);
  const [includeSpouses, setIncludeSpouses] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [importMode, setImportMode] = useState<'import' | 'merge'>('import');
  const [importOpen, setImportOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Person | null>(null);

  useEffect(() => {
    document.body.classList.add('tree-workspace-mode');
    setToken(window.localStorage.getItem('origineo_token'));
    return () => document.body.classList.remove('tree-workspace-mode');
  }, []);

  useEffect(() => {
    let alive = true;
    personApi
      .getRoot()
      .then((envelope) => {
        if (!alive) return;
        const root = envelope.data || envelope;
        if (root?.id) {
          setRootPersonId(root.id);
          setSelectedPersonId(root.id);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Racine introuvable'))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const loadTree = useCallback(
    async (nextRootId = rootPersonId, nextSelectedId?: string) => {
      if (!nextRootId) return;
      setLoading(true);
      setError(null);
      try {
        const envelope = await treeApi.getTree(nextRootId, ancestors, descendants, {
          siblings: includeSiblings,
          spouses: includeSpouses,
          limit: 1200,
        });
        const payload = envelope.data || envelope;
        setTree(payload);
        setRootPersonId(payload.rootPersonId || nextRootId);
        setSelectedPersonId(nextSelectedId || payload.rootPersonId || nextRootId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur arbre');
      } finally {
        setLoading(false);
      }
    },
    [ancestors, descendants, includeSiblings, includeSpouses, rootPersonId],
  );

  useEffect(() => {
    if (!rootPersonId) return;
    loadTree(rootPersonId, selectedPersonId || rootPersonId);
  }, [rootPersonId, ancestors, descendants, includeSiblings, includeSpouses]);

  const selectedPerson = useMemo(
    () => tree?.nodes.find((node) => node.person.id === selectedPersonId)?.person || null,
    [tree, selectedPersonId],
  );

  async function runSearch() {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const envelope = await searchApi.search(searchQuery, 1, 8);
      const payload = envelope.data || envelope;
      setSearchResults(payload.persons || []);
    } finally {
      setSearching(false);
    }
  }

  async function pickSearchResult(personId: string) {
    setSearchResults([]);
    setSearchQuery('');
    await loadTree(personId, personId);
  }

  async function exportBranch() {
    if (!token) return;
    const targetId = rootPersonId || selectedPersonId || undefined;
    const { blob, filename } = await gedcomApi.exportFile(token, targetId, 8);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function openImport(mode: 'import' | 'merge') {
    setImportMode(mode);
    setImportOpen(true);
  }

  return (
    <div className={styles.workspace}>
      <div className={styles.shell}>
        <TreeToolbar
          tree={tree}
          searchQuery={searchQuery}
          searchResults={searchResults}
          searching={searching}
          ancestors={ancestors}
          descendants={descendants}
          includeSiblings={includeSiblings}
          includeSpouses={includeSpouses}
          hasToken={Boolean(token)}
          onSearchQueryChange={setSearchQuery}
          onSearch={runSearch}
          onPickSearchResult={pickSearchResult}
          onAncestorsChange={(value) => setAncestors(clamp(value, 0, 12))}
          onDescendantsChange={(value) => setDescendants(clamp(value, 0, 12))}
          onIncludeSiblingsChange={setIncludeSiblings}
          onIncludeSpousesChange={setIncludeSpouses}
          onRefresh={() => loadTree(rootPersonId)}
          onImport={openImport}
          onExport={exportBranch}
        />

        <TreeCanvas
          tree={tree}
          rootPersonId={rootPersonId}
          selectedPersonId={selectedPersonId}
          onSelectPerson={setSelectedPersonId}
        />

        <PersonInspector
          tree={tree}
          selectedPersonId={selectedPersonId}
          token={token}
          onSaved={(personId) => loadTree(rootPersonId, personId)}
          onRootChange={(personId) => loadTree(personId, personId)}
          onRequestDeleteBranch={setDeleteTarget}
        />
      </div>

      {loading ? (
        <div className={styles.canvasStatus}>
          <span className={styles.statusPill}>Chargement...</span>
        </div>
      ) : null}
      {error ? (
        <div className={styles.candidate}>{error}</div>
      ) : null}

      <GedcomImportDrawer
        open={importOpen}
        mode={importMode}
        token={token}
        onClose={() => setImportOpen(false)}
        onJobCreated={(job, mode) => {
          setActiveJobId(job.id);
          if (mode === 'merge') {
            setImportOpen(false);
            setMergeOpen(true);
          }
        }}
        onApplied={() => loadTree(rootPersonId)}
      />

      <MergeReviewDrawer
        open={mergeOpen}
        jobId={activeJobId}
        token={token}
        onClose={() => setMergeOpen(false)}
        onApplied={() => loadTree(rootPersonId)}
      />

      <BranchDeleteDialog
        open={Boolean(deleteTarget)}
        person={deleteTarget}
        token={token}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => loadTree(rootPersonId || selectedPerson?.id || null)}
      />
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}
