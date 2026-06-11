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
import PersonInspector from './PersonInspector';
import TreeCanvas from './TreeCanvas';
import TreeDirectoryDialog from './TreeDirectoryDialog';
import TreeToolbar from './TreeToolbar';
import {
  type TreeWorkspaceMode,
  TreeWorkspaceProvider,
} from './TreeWorkspaceContext';
import styles from './TreeWorkspace.module.css';
import { Person, TreeWindow } from './types';

export default function TreeWorkspace() {
  const treeId = DEFAULT_TREE_ID;
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
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [relativeRequest, setRelativeRequest] = useState<{
    personId: string;
    linkType?: RelativeLinkType | null;
  } | null>(null);
  const [mode, setMode] = useState<TreeWorkspaceMode>('modification');
  const [inspectorWidth, setInspectorWidth] = useState(380);
  const shellRef = useRef<HTMLDivElement>(null);

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

  const beginInspectorResize = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();

      const shellRect = shellRef.current?.getBoundingClientRect();
      if (!shellRect) return;

      const minWidth = 300;
      const maxWidth = Math.min(680, Math.max(minWidth, shellRect.width - 420));
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const resize = (moveEvent: MouseEvent) => {
        setInspectorWidth(
          clamp(shellRect.right - moveEvent.clientX, minWidth, maxWidth),
        );
      };

      const stopResize = () => {
        window.removeEventListener('mousemove', resize);
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
      };

      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResize, { once: true });
      resize(event.nativeEvent);
    },
    [],
  );

  return (
    <TreeWorkspaceProvider value={workspaceContext}>
      <div className={styles.workspace}>
        <div
          ref={shellRef}
          className={styles.shell}
          style={{ '--inspector-width': `${inspectorWidth}px` } as CSSProperties}
        >
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

          <TreeCanvas
            tree={tree}
            rootPersonId={rootPersonId}
            selectedPersonId={selectedPersonId}
            onSelectPerson={setSelectedPersonId}
            onFocusPerson={(personId) => loadTree(personId, personId)}
            onRequestAddRelative={(personId) => requestAddRelative(personId)}
          />

          <button
            type="button"
            className={styles.inspectorResizeHandle}
            aria-label="Redimensionner l'inspecteur"
            title="Redimensionner l'inspecteur"
            onMouseDown={beginInspectorResize}
          />

          <PersonInspector
            tree={tree}
            selectedPersonId={selectedPersonId}
            token={token}
            onSaved={(personId) => loadTree(rootPersonId, personId)}
            onRootChange={(personId) => loadTree(personId, personId)}
            onRequestAddRelative={(personId) => requestAddRelative(personId)}
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
