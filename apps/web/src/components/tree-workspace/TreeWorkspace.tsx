'use client';

import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DEFAULT_TREE_ID,
  personApi,
  searchApi,
  treeApi,
} from '@/lib/api';
import AddRelativeModal, { RelativeLinkType } from './AddRelativeModal';
import BranchDeleteDialog from './BranchDeleteDialog';
import PersonDetailDrawer from './PersonDetailDrawer';
import TreeCanvas from './TreeCanvas';
import TreeDirectoryDialog from './TreeDirectoryDialog';
import TreeToolbar from './TreeToolbar';
import {
  type TreeWorkspaceMode,
  TreeWorkspaceProvider,
} from './TreeWorkspaceContext';
import styles from './TreeWorkspace.module.css';
import { Person, personLabel, TreeWindow } from './types';

export default function TreeWorkspace() {
  const treeId = DEFAULT_TREE_ID;
  const [token, setToken] = useState<string | null>(null);
  const [rootPersonId, setRootPersonId] = useState<string | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
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
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [relativeRequest, setRelativeRequest] = useState<{
    personId: string;
    linkType?: RelativeLinkType | null;
  } | null>(null);
  const [mode, setMode] = useState<TreeWorkspaceMode>('modification');

  const workspaceContext = useMemo(
    () => ({
      mode,
      setMode,
      isReadOnly: mode === 'consultation',
    }),
    [mode],
  );

  useEffect(() => {
    document.body.classList.add('tree-workspace-mode');
    const storedToken = window.localStorage.getItem('origineo_token');
    setToken(storedToken);

    let alive = true;
    async function boot() {
      setLoading(true);
      setError(null);
      try {
        const nextRootId = await resolveRootPersonId(storedToken, treeId);
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
        }, treeId);
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
    [ancestors, descendants, includeSiblings, includeSpouses, rootPersonId, treeId],
  );

  useEffect(() => {
    if (!rootPersonId) return;
    loadTree(rootPersonId, selectedPersonId || rootPersonId);
  }, [rootPersonId, ancestors, descendants, includeSiblings, includeSpouses]);

  useEffect(() => {
    if (mode === 'consultation') {
      setRelativeRequest(null);
    }
  }, [mode]);

  const selectedPerson = useMemo(
    () => tree?.nodes.find((node) => node.person.id === selectedPersonId)?.person || null,
    [tree, selectedPersonId],
  );

  const relativeAnchorPerson = useMemo(
    () =>
      tree?.nodes.find((node) => node.person.id === relativeRequest?.personId)?.person ||
      selectedPerson ||
      null,
    [relativeRequest?.personId, selectedPerson, tree],
  );

  async function runSearch() {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const envelope = await searchApi.search(searchQuery, 1, 8, treeId);
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
      const nextRootId = await resolveRootPersonId(token, treeId);
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

  function requestAddRelative(personId: string, linkType?: RelativeLinkType | null) {
    if (mode === 'consultation') return;
    setSelectedPersonId(personId);
    setRelativeRequest({ personId, linkType });
  }

  async function reloadAfterRelativeCreated(createdPersonId: string) {
    const anchorPersonId = relativeRequest?.personId || selectedPersonId || rootPersonId;
    setNotice('Proche ajoute et lien reconstruit.');
    setRelativeRequest(null);
    if (anchorPersonId) {
      await loadTree(anchorPersonId, createdPersonId);
    }
  }

  return (
    <TreeWorkspaceProvider value={workspaceContext}>
      <div className={styles.workspace}>
        <div className={styles.modernShell}>
          <TreeToolbar
            treeId={treeId}
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
            onOpenDirectory={() => setDirectoryOpen(true)}
            onRefresh={() => {
              setNotice(null);
              loadTree(rootPersonId);
            }}
          />

          <div className={styles.canvasWrapper}>
            <TreeCanvas
              tree={tree}
              rootPersonId={rootPersonId}
              selectedPersonId={selectedPersonId}
              onSelectPerson={(personId) => {
                setSelectedPersonId(personId);
                setIsDrawerOpen(true);
              }}
              onFocusPerson={(personId) => loadTree(personId, personId)}
              onRequestAddRelative={(personId) => requestAddRelative(personId)}
            />

            {/* Floating button to reopen drawer when closed */}
            {!isDrawerOpen && selectedPerson ? (
              <button
                type="button"
                className={styles.drawerReopenButton}
                onClick={() => setIsDrawerOpen(true)}
                title="Ouvrir la fiche de la personne selectionnee"
              >
                <span className={styles.reopenAvatar}>
                  {selectedPerson.gender === 'MALE' ? '♂' : selectedPerson.gender === 'FEMALE' ? '♀' : '👤'}
                </span>
                <span className={styles.reopenName}>{personLabel(selectedPerson)}</span>
                <span className={styles.reopenAction}>Fiche ➔</span>
              </button>
            ) : null}

            <PersonDetailDrawer
              tree={tree}
              selectedPersonId={selectedPersonId}
              isOpen={isDrawerOpen && Boolean(selectedPersonId)}
              token={token}
              isReadOnly={mode === 'consultation'}
              onClose={() => setIsDrawerOpen(false)}
              onCenter={(personId) => {
                setSelectedPersonId(personId);
                loadTree(rootPersonId, personId);
              }}
              onSelectRelative={(personId) => {
                setSelectedPersonId(personId);
                setIsDrawerOpen(true);
              }}
              onRequestAddRelative={(personId, linkType) => requestAddRelative(personId, linkType)}
              onRequestDelete={(person) => setDeleteTarget(person)}
              onPersonUpdated={(personId) => loadTree(rootPersonId, personId)}
            />
          </div>
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

        <TreeDirectoryDialog
          open={directoryOpen}
          treeId={treeId}
          selectedPersonId={selectedPersonId}
          onClose={() => setDirectoryOpen(false)}
          onSelectPerson={setSelectedPersonId}
          onFocusPerson={(personId) => loadTree(personId, personId)}
        />

        <AddRelativeModal
          open={Boolean(relativeRequest)}
          treeId={treeId}
          token={token}
          anchorPerson={relativeAnchorPerson}
          initialLinkType={relativeRequest?.linkType || null}
          onClose={() => setRelativeRequest(null)}
          onCreated={reloadAfterRelativeCreated}
        />
      </div>
    </TreeWorkspaceProvider>
  );
}

async function resolveRootPersonId(token: string | null, treeId = DEFAULT_TREE_ID) {
  const rootEnvelope = await personApi.getRoot(treeId).catch(() => null);
  const root = rootEnvelope?.data || rootEnvelope;
  if (root?.id) return root.id;

  if (token) {
    const repairEnvelope = await personApi.repairRootDefault(token, treeId).catch(() => null);
    const repair = repairEnvelope?.data || repairEnvelope;
    if (repair?.personId) return repair.personId;

    const repairedRootEnvelope = await personApi.getRoot(treeId).catch(() => null);
    const repairedRoot = repairedRootEnvelope?.data || repairedRootEnvelope;
    if (repairedRoot?.id) return repairedRoot.id;
  }

  const listEnvelope = await personApi.getAll(1, 1, treeId).catch(() => null);
  const payload = listEnvelope?.data || listEnvelope;
  const firstPerson = payload?.data?.[0] || payload?.persons?.[0] || payload?.[0];
  return firstPerson?.id || null;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}
