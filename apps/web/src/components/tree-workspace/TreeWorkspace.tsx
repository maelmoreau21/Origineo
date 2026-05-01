'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  personApi,
  searchApi,
  treeApi,
} from '@/lib/api';
import BranchDeleteDialog from './BranchDeleteDialog';
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
  const [notice, setNotice] = useState<string | null>(null);
  const [ancestors, setAncestors] = useState(4);
  const [descendants, setDescendants] = useState(2);
  const [includeSiblings, setIncludeSiblings] = useState(true);
  const [includeSpouses, setIncludeSpouses] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Person | null>(null);

  useEffect(() => {
    document.body.classList.add('tree-workspace-mode');
    const storedToken = window.localStorage.getItem('origineo_token');
    setToken(storedToken);

    let alive = true;
    async function boot() {
      setLoading(true);
      setError(null);
      try {
        const nextRootId = await resolveRootPersonId(storedToken);
        if (!alive) return;
        if (nextRootId) {
          setRootPersonId(nextRootId);
          setSelectedPersonId(nextRootId);
        } else {
          setTree(null);
          setRootPersonId(null);
          setSelectedPersonId(null);
        }
      } catch (err) {
        if (alive) {
          setError(err instanceof Error ? err.message : 'Impossible de charger l arbre');
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    void boot();
    return () => {
      alive = false;
      document.body.classList.remove('tree-workspace-mode');
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

  async function reloadAfterDelete() {
    const deletedId = deleteTarget?.id;
    const currentRootDeleted = Boolean(deletedId && deletedId === rootPersonId);
    const currentSelectionDeleted = Boolean(deletedId && deletedId === selectedPersonId);

    if (currentRootDeleted) {
      const nextRootId = await resolveRootPersonId(token);
      if (nextRootId) {
        await loadTree(nextRootId, nextRootId);
      } else {
        setRootPersonId(null);
        setSelectedPersonId(null);
        setTree(null);
      }
      return;
    }

    await loadTree(
      rootPersonId,
      currentSelectionDeleted ? rootPersonId || undefined : selectedPersonId || undefined,
    );
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
          onSearchQueryChange={setSearchQuery}
          onSearch={runSearch}
          onPickSearchResult={pickSearchResult}
          onAncestorsChange={(value) => setAncestors(clamp(value, 0, 12))}
          onDescendantsChange={(value) => setDescendants(clamp(value, 0, 12))}
          onIncludeSiblingsChange={setIncludeSiblings}
          onIncludeSpousesChange={setIncludeSpouses}
          onRefresh={() => {
            setNotice(null);
            loadTree(rootPersonId);
          }}
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
      {notice ? (
        <div className={styles.workspaceNotice}>
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)}>
            Fermer
          </button>
        </div>
      ) : null}

      <BranchDeleteDialog
        open={Boolean(deleteTarget)}
        person={deleteTarget}
        token={token}
        onClose={() => setDeleteTarget(null)}
        onDeleted={reloadAfterDelete}
      />
    </div>
  );
}

async function resolveRootPersonId(token: string | null) {
  const rootEnvelope = await personApi.getRoot().catch(() => null);
  const root = rootEnvelope?.data || rootEnvelope;
  if (root?.id) return root.id;

  if (token) {
    const repairEnvelope = await personApi.repairRootDefault(token).catch(() => null);
    const repair = repairEnvelope?.data || repairEnvelope;
    if (repair?.personId) return repair.personId;

    const repairedRootEnvelope = await personApi.getRoot().catch(() => null);
    const repairedRoot = repairedRootEnvelope?.data || repairedRootEnvelope;
    if (repairedRoot?.id) return repairedRoot.id;
  }

  const listEnvelope = await personApi.getAll(1, 1).catch(() => null);
  const payload = listEnvelope?.data || listEnvelope;
  const firstPerson = payload?.data?.[0] || payload?.persons?.[0] || payload?.[0];
  return firstPerson?.id || null;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}
