'use client';

// ══════════════════════════════════════
// Origineo — Home / Tree Page (Phase 3)
// ══════════════════════════════════════
// Optimized with:
// - Smooth transition on generation depth change
// - Node click → navigate to person
// - fitView animation on tree reload
// - Error boundary with retry
// - Proper cleanup and memoization

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type Connection,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import {
  treeApi,
  personApi,
  authApi,
  relationshipApi,
  unionApi,
  searchApi,
} from '@/lib/api';
import PersonNode from '@/components/tree/PersonNode';

const NODE_WIDTH = 220;
const NODE_HEIGHT = 120;

// ─── Dagre Layout ───────────────────────────
function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction = 'TB',
) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 100, ranksep: 140, marginx: 40, marginy: 40 });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = g.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

// ─── Custom Node Types ──────────────────────
const nodeTypes = {
  person: PersonNode,
};

type TreePerson = {
  id: string;
  givenNames?: string;
  given_names?: string;
  usageSurname?: string | null;
  usage_surname?: string | null;
  birthSurname?: string | null;
  birth_surname?: string | null;
  gender?: string;
  birthDate?: string | null;
  birth_date?: string | null;
  birthPlace?: string | null;
  birth_place?: string | null;
};

type LinkMode = 'PARENT' | 'CHILD' | 'SPOUSE';
type LinkTarget = 'new' | 'existing';
type DragLinkType = 'PARENT_CHILD' | 'UNION';

type OperationKind = 'person' | 'relationship' | 'union';

type HistoryOperation = {
  opId: string;
  kind: OperationKind;
  payload: Record<string, any>;
  createdId?: string;
};

type HistoryEntry = {
  id: string;
  label: string;
  createdAt: number;
  operations: HistoryOperation[];
};

function normalizePerson(person: TreePerson) {
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

function personDisplayName(person: TreePerson | null | undefined) {
  if (!person) return '';
  const p = normalizePerson(person);
  const surname = p.usageSurname || p.birthSurname || '';
  return `${p.givenNames}${surname ? ` ${surname}` : ''}`.trim();
}

// ─── Inner Flow (needs ReactFlowProvider) ───
function TreeFlow() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [rootPersonId, setRootPersonId] = useState<string | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [ancestorGens, setAncestorGens] = useState(4);
  const [descendantGens, setDescendantGens] = useState(2);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [nodeCount, setNodeCount] = useState(0);
  const [token, setToken] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [linkMode, setLinkMode] = useState<LinkMode>('CHILD');
  const [linkTarget, setLinkTarget] = useState<LinkTarget>('new');
  const [relationshipType, setRelationshipType] = useState('BIOLOGICAL');
  const [unionType, setUnionType] = useState('MARRIAGE');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [focusModeEnabled, setFocusModeEnabled] = useState(true);
  const [dragLinkType, setDragLinkType] = useState<DragLinkType>('PARENT_CHILD');
  const [assistantCreateMissingParent, setAssistantCreateMissingParent] = useState(true);
  const [loadedUnions, setLoadedUnions] = useState<any[]>([]);
  const [historyState, setHistoryState] = useState<{ entries: HistoryEntry[]; index: number }>({
    entries: [],
    index: -1,
  });
  const [newPersonForm, setNewPersonForm] = useState({
    givenNames: '',
    usageSurname: '',
    birthSurname: '',
    gender: 'UNKNOWN',
    birthDate: '',
    birthPlace: '',
  });
  const [focusQuery, setFocusQuery] = useState('');
  const [focusResults, setFocusResults] = useState<any[]>([]);
  const [focusLoading, setFocusLoading] = useState(false);
  const [showFocusResults, setShowFocusResults] = useState(false);
  const [existingQuery, setExistingQuery] = useState('');
  const [existingResults, setExistingResults] = useState<any[]>([]);
  const [existingLoading, setExistingLoading] = useState(false);
  const { fitView } = useReactFlow();
  const abortRef = useRef<AbortController | null>(null);

  const selectedPerson = useMemo(() => {
    if (!selectedPersonId) return null;
    const selectedNode = nodes.find((n) => n.id === selectedPersonId);
    return selectedNode ? (selectedNode.data as any)?.person : null;
  }, [nodes, selectedPersonId]);

  const selectedPersonName = personDisplayName(selectedPerson);
  const selectedPersonNormalized = useMemo(
    () => (selectedPerson ? normalizePerson(selectedPerson) : null),
    [selectedPerson],
  );
  const canUndo = historyState.index >= 0;
  const canRedo = historyState.index < historyState.entries.length - 1;

  const makeOperationId = useCallback((prefix: string) => {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }, []);

  const resolvePayloadRefs = useCallback((
    payload: Record<string, any>,
    createdMap: Record<string, string>,
  ) => {
    const resolved: Record<string, any> = {};

    Object.entries(payload).forEach(([key, value]) => {
      if (typeof value === 'string' && value.startsWith('@')) {
        const refId = value.slice(1);
        resolved[key] = createdMap[refId] || value;
        return;
      }

      resolved[key] = value;
    });

    return resolved;
  }, []);

  const createEntity = useCallback(async (
    kind: OperationKind,
    payload: Record<string, any>,
    accessToken: string,
  ) => {
    if (kind === 'person') {
      const created = await personApi.create(payload, accessToken);
      return created.data.id as string;
    }

    if (kind === 'relationship') {
      const created = await relationshipApi.create(payload, accessToken);
      return created.data.id as string;
    }

    const created = await unionApi.create(payload, accessToken);
    return created.data.id as string;
  }, []);

  const deleteEntity = useCallback(async (
    kind: OperationKind,
    id: string,
    accessToken: string,
  ) => {
    if (kind === 'person') {
      await personApi.delete(id, accessToken);
      return;
    }

    if (kind === 'relationship') {
      await relationshipApi.delete(id, accessToken);
      return;
    }

    await unionApi.delete(id, accessToken);
  }, []);

  const executeOperations = useCallback(async (
    operations: HistoryOperation[],
    accessToken: string,
  ) => {
    const createdMap: Record<string, string> = {};
    const executed: HistoryOperation[] = [];

    for (const operation of operations) {
      const payload = resolvePayloadRefs(operation.payload, createdMap);
      const createdId = await createEntity(operation.kind, payload, accessToken);
      createdMap[operation.opId] = createdId;
      executed.push({ ...operation, createdId });
    }

    return executed;
  }, [createEntity, resolvePayloadRefs]);

  const addHistoryEntry = useCallback((label: string, operations: HistoryOperation[]) => {
    const entry: HistoryEntry = {
      id: `history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label,
      createdAt: Date.now(),
      operations,
    };

    setHistoryState((prev) => {
      const baseEntries = prev.entries.slice(0, prev.index + 1);
      const nextEntries = [...baseEntries, entry];
      return {
        entries: nextEntries,
        index: nextEntries.length - 1,
      };
    });
  }, []);

  const clearActionState = useCallback(() => {
    setActionError(null);
    setActionSuccess(null);
  }, []);

  const ensureAdminSession = useCallback(() => {
    if (!token || !isAdmin) {
      setActionError('Connectez-vous en ADMIN dans le panneau Admin pour modifier l\'arbre.');
      return false;
    }
    return true;
  }, [isAdmin, token]);

  const toNewPersonPayload = useCallback(() => {
    return {
      givenNames: newPersonForm.givenNames.trim(),
      usageSurname: newPersonForm.usageSurname.trim() || undefined,
      birthSurname: newPersonForm.birthSurname.trim() || undefined,
      gender: newPersonForm.gender,
      birthDate: newPersonForm.birthDate || undefined,
      birthPlace: newPersonForm.birthPlace.trim() || undefined,
    };
  }, [newPersonForm]);

  const resetNewPersonForm = useCallback(() => {
    setNewPersonForm({
      givenNames: '',
      usageSurname: '',
      birthSurname: '',
      gender: 'UNKNOWN',
      birthDate: '',
      birthPlace: '',
    });
  }, []);

  const buildLinkOperation = useCallback((
    opId: string,
    targetPersonRef: string,
  ): HistoryOperation | null => {
    if (!selectedPersonId) return null;

    if (linkMode === 'PARENT') {
      return {
        opId,
        kind: 'relationship',
        payload: {
          parentId: targetPersonRef,
          childId: selectedPersonId,
          type: relationshipType,
        },
      };
    }

    if (linkMode === 'CHILD') {
      return {
        opId,
        kind: 'relationship',
        payload: {
          parentId: selectedPersonId,
          childId: targetPersonRef,
          type: relationshipType,
        },
      };
    }

    return {
      opId,
      kind: 'union',
      payload: {
        partner1Id: selectedPersonId,
        partner2Id: targetPersonRef,
        type: unionType,
      },
    };
  }, [selectedPersonId, linkMode, relationshipType, unionType]);

  const existingPartnerId = useMemo(() => {
    if (!selectedPersonId) return null;
    const union = loadedUnions.find(
      (u) => u.partner1Id === selectedPersonId || u.partner2Id === selectedPersonId,
    );
    if (!union) return null;
    return union.partner1Id === selectedPersonId ? union.partner2Id : union.partner1Id;
  }, [loadedUnions, selectedPersonId]);

  const selectedPersonLabel = linkMode === 'PARENT'
    ? 'Ajouter un parent'
    : linkMode === 'CHILD'
      ? 'Ajouter un enfant'
      : 'Ajouter un conjoint';

  const linkVerb = linkMode === 'PARENT'
    ? 'Parent ajouté'
    : linkMode === 'CHILD'
      ? 'Enfant ajouté'
      : 'Conjoint ajouté';

  const applyQuickTemplate = useCallback(
    (template: 'MOTHER' | 'FATHER' | 'CHILD' | 'SPOUSE') => {
      clearActionState();
      setLinkTarget('new');

      const defaultSurname =
        selectedPersonNormalized?.birthSurname ||
        selectedPersonNormalized?.usageSurname ||
        '';

      if (template === 'MOTHER') {
        setLinkMode('PARENT');
        setRelationshipType('BIOLOGICAL');
        setNewPersonForm({
          givenNames: '',
          usageSurname: '',
          birthSurname: defaultSurname,
          gender: 'FEMALE',
          birthDate: '',
          birthPlace: selectedPersonNormalized?.birthPlace || '',
        });
        return;
      }

      if (template === 'FATHER') {
        setLinkMode('PARENT');
        setRelationshipType('BIOLOGICAL');
        setNewPersonForm({
          givenNames: '',
          usageSurname: defaultSurname,
          birthSurname: defaultSurname,
          gender: 'MALE',
          birthDate: '',
          birthPlace: selectedPersonNormalized?.birthPlace || '',
        });
        return;
      }

      if (template === 'CHILD') {
        setLinkMode('CHILD');
        setRelationshipType('BIOLOGICAL');
        setNewPersonForm({
          givenNames: '',
          usageSurname: defaultSurname,
          birthSurname: defaultSurname,
          gender: 'UNKNOWN',
          birthDate: '',
          birthPlace: '',
        });
        return;
      }

      setLinkMode('SPOUSE');
      setUnionType('MARRIAGE');
      setNewPersonForm({
        givenNames: '',
        usageSurname: '',
        birthSurname: '',
        gender: 'UNKNOWN',
        birthDate: '',
        birthPlace: '',
      });
    },
    [clearActionState, selectedPersonNormalized],
  );

  // Load root person on mount
  useEffect(() => {
    async function loadRoot() {
      setError(null);
      setWarning(null);
      try {
        const rootResult = await personApi.getRoot();
        if (rootResult.data?.id) {
          setRootPersonId(rootResult.data.id);
          setSelectedPersonId(rootResult.data.id);
        } else {
          const firstPersonResult = await personApi.getAll(1, 1);
          const fallbackPerson = firstPersonResult.data?.data?.[0];
          if (fallbackPerson?.id) {
            setRootPersonId(fallbackPerson.id);
            setSelectedPersonId(fallbackPerson.id);
            setWarning('Aucune racine par défaut: affichage centré sur la première personne disponible.');
          } else {
            setError('Aucune personne disponible. Créez une personne dans Admin pour initialiser l\'arbre.');
            setLoading(false);
          }
        }
      } catch {
        setError('Impossible de contacter l\'API. Vérifiez que le serveur est en cours d\'exécution.');
        setLoading(false);
      }
    }
    loadRoot();
  }, []);

  // Restore authentication context for admin interactions
  useEffect(() => {
    const savedToken = localStorage.getItem('origineo_token');
    if (!savedToken) {
      setAuthChecked(true);
      return;
    }

    setToken(savedToken);
    authApi.getProfile(savedToken)
      .then((result) => {
        setIsAdmin(result.data?.role === 'ADMIN');
      })
      .catch(() => {
        localStorage.removeItem('origineo_token');
        setToken(null);
        setIsAdmin(false);
      })
      .finally(() => {
        setAuthChecked(true);
      });
  }, []);

  // Keep selected node valid after reload/root changes
  useEffect(() => {
    if (!selectedPersonId) return;
    const exists = nodes.some((n) => n.id === selectedPersonId);
    if (!exists) {
      setSelectedPersonId(rootPersonId);
    }
  }, [nodes, selectedPersonId, rootPersonId]);

  // Search suggestions for root focus (server-side, scalable)
  useEffect(() => {
    const query = focusQuery.trim();
    if (query.length < 2) {
      setFocusResults([]);
      setFocusLoading(false);
      return;
    }

    const timeout = setTimeout(async () => {
      setFocusLoading(true);
      try {
        const result = await searchApi.search(query, 1, 8);
        const persons = (result.data?.persons || []).map(normalizePerson);
        setFocusResults(persons);
      } catch {
        setFocusResults([]);
      } finally {
        setFocusLoading(false);
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [focusQuery]);

  // Search existing persons to link
  useEffect(() => {
    const query = existingQuery.trim();
    if (linkTarget !== 'existing' || query.length < 2) {
      setExistingResults([]);
      setExistingLoading(false);
      return;
    }

    const timeout = setTimeout(async () => {
      setExistingLoading(true);
      try {
        const result = await searchApi.search(query, 1, 10);
        const persons = (result.data?.persons || [])
          .map(normalizePerson)
          .filter((p: any) => p.id !== selectedPersonId);
        setExistingResults(persons);
      } catch {
        setExistingResults([]);
      } finally {
        setExistingLoading(false);
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [existingQuery, linkTarget, selectedPersonId]);

  // Load tree data when root or depth changes
  const loadTree = useCallback(async () => {
    if (!rootPersonId) return;

    const requestedAncestors = focusModeEnabled
      ? Math.min(ancestorGens, 2)
      : ancestorGens;
    const requestedDescendants = focusModeEnabled
      ? Math.min(descendantGens, 2)
      : descendantGens;

    // Abort previous request if still pending
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    if (nodes.length > 0) {
      setTransitioning(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const result = await treeApi.getTree(
        rootPersonId,
        requestedAncestors,
        requestedDescendants,
      );
      const treeData = result.data;
      setLoadedUnions(treeData.unions || []);

      // Convert to React Flow nodes
      const flowNodes: Node[] = treeData.nodes.map((node: any) => ({
        id: node.person.id,
        type: 'person',
        data: {
          person: node.person,
          generation: node.generation,
          isRoot: node.person.id === rootPersonId,
        },
        position: { x: 0, y: 0 },
      }));

      // Parent-child edges
      const relationshipEdges: Edge[] = treeData.relationships.map((rel: any) => ({
        id: rel.id,
        source: rel.parentId,
        target: rel.childId,
        type: 'smoothstep',
        animated: false,
        style: {
          stroke: 'var(--color-border)',
          strokeWidth: 2,
        },
        markerEnd: {
          type: 'arrowclosed' as any,
          color: 'var(--color-border)',
          width: 16,
          height: 16,
        },
      }));

      // Partner edges (visual only, not used in dagre layout to keep generations stable)
      const unionEdges: Edge[] = (treeData.unions || []).map((u: any) => ({
        id: `union-${u.id}`,
        source: u.partner1Id,
        target: u.partner2Id,
        type: 'straight',
        style: {
          stroke: 'hsla(40, 90%, 55%, 0.7)',
          strokeWidth: 1.5,
          strokeDasharray: '6 4',
        },
        label: 'union',
        labelStyle: {
          fontSize: 10,
          fill: 'hsl(40, 90%, 60%)',
          fontFamily: 'var(--font-mono)',
        },
      }));

      // Apply dagre layout
      const { nodes: layoutedNodes, edges: layoutedEdges } =
        getLayoutedElements(flowNodes, relationshipEdges);

      setNodes(layoutedNodes);
      setEdges([...layoutedEdges, ...unionEdges]);
      setNodeCount(layoutedNodes.length);

      if (!selectedPersonId) {
        setSelectedPersonId(rootPersonId);
      }

      // Animate fitView after layout
      requestAnimationFrame(() => {
        setTimeout(() => {
          fitView({ padding: 0.15, duration: 600 });
        }, 50);
      });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Erreur lors du chargement de l\'arbre');
      }
    } finally {
      setLoading(false);
      setTransitioning(false);
    }
  }, [
    rootPersonId,
    ancestorGens,
    descendantGens,
    focusModeEnabled,
    fitView,
    setNodes,
    setEdges,
    selectedPersonId,
  ]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const runWithHistory = useCallback(async (
    label: string,
    operations: HistoryOperation[],
  ) => {
    if (!ensureAdminSession() || !token) return null;

    clearActionState();
    setActionBusy(true);

    try {
      const executedOperations = await executeOperations(operations, token);
      addHistoryEntry(label, executedOperations);
      await loadTree();
      return executedOperations;
    } catch (err: any) {
      setActionError(err.message || 'Action impossible.');
      return null;
    } finally {
      setActionBusy(false);
    }
  }, [addHistoryEntry, clearActionState, ensureAdminSession, executeOperations, loadTree, token]);

  const undoLastAction = useCallback(async () => {
    if (!ensureAdminSession() || !token || historyState.index < 0) return;

    const entryToUndo = historyState.entries[historyState.index];
    if (!entryToUndo) return;

    clearActionState();
    setActionBusy(true);

    try {
      for (const operation of [...entryToUndo.operations].reverse()) {
        if (!operation.createdId) continue;
        try {
          await deleteEntity(operation.kind, operation.createdId, token);
        } catch (err: any) {
          const message = String(err?.message || '');
          if (!message.includes('not found') && !message.includes('HTTP 404')) {
            throw err;
          }
        }
      }

      setHistoryState((prev) => ({
        entries: prev.entries,
        index: prev.index - 1,
      }));

      await loadTree();
      setActionSuccess(`Annulé: ${entryToUndo.label}`);
    } catch (err: any) {
      setActionError(err.message || 'Impossible d\'annuler cette action.');
    } finally {
      setActionBusy(false);
    }
  }, [clearActionState, deleteEntity, ensureAdminSession, historyState.entries, historyState.index, loadTree, token]);

  const redoLastAction = useCallback(async () => {
    if (!ensureAdminSession() || !token) return;

    const redoIndex = historyState.index + 1;
    const entryToRedo = historyState.entries[redoIndex];
    if (!entryToRedo) return;

    clearActionState();
    setActionBusy(true);

    try {
      const recreatedOperations = await executeOperations(entryToRedo.operations, token);

      setHistoryState((prev) => {
        const nextEntries = [...prev.entries];
        nextEntries[redoIndex] = {
          ...nextEntries[redoIndex],
          operations: recreatedOperations,
          createdAt: Date.now(),
        };
        return {
          entries: nextEntries,
          index: redoIndex,
        };
      });

      await loadTree();
      setActionSuccess(`Rétabli: ${entryToRedo.label}`);
    } catch (err: any) {
      setActionError(err.message || 'Impossible de rétablir cette action.');
    } finally {
      setActionBusy(false);
    }
  }, [clearActionState, ensureAdminSession, executeOperations, historyState.entries, historyState.index, loadTree, token]);

  const focusOnSelected = useCallback(() => {
    if (!selectedPersonId) return;
    setRootPersonId(selectedPersonId);
    if (focusModeEnabled) {
      setAncestorGens((prev) => Math.min(prev, 2));
      setDescendantGens((prev) => Math.min(prev, 2));
    }
  }, [focusModeEnabled, selectedPersonId]);

  const onConnect = useCallback(async (connection: Connection) => {
    const sourceId = connection.source;
    const targetId = connection.target;

    if (!sourceId || !targetId) return;
    if (sourceId === targetId) {
      setActionError('Lien invalide: une personne ne peut pas être liée à elle-même.');
      return;
    }

    const operation: HistoryOperation = dragLinkType === 'PARENT_CHILD'
      ? {
          opId: makeOperationId('drag-relationship'),
          kind: 'relationship',
          payload: {
            parentId: sourceId,
            childId: targetId,
            type: relationshipType,
          },
        }
      : {
          opId: makeOperationId('drag-union'),
          kind: 'union',
          payload: {
            partner1Id: sourceId,
            partner2Id: targetId,
            type: unionType,
          },
        };

    const label = dragLinkType === 'PARENT_CHILD'
      ? 'Glisser-relier: parent/enfant'
      : 'Glisser-relier: union';

    const executed = await runWithHistory(label, [operation]);
    if (executed) {
      setActionSuccess(
        dragLinkType === 'PARENT_CHILD'
          ? 'Lien parent/enfant créé par glisser-relier.'
          : 'Union créée par glisser-relier.',
      );
    }
  }, [
    dragLinkType,
    makeOperationId,
    relationshipType,
    unionType,
    runWithHistory,
  ]);

  // Click on node → select person for direct editing actions
  const onNodeClick = useCallback((_: any, node: Node) => {
    clearActionState();
    setSelectedPersonId(node.id);
  }, [clearActionState]);

  const goToPersonDetails = useCallback(() => {
    if (!selectedPersonId) return;
    window.location.href = `/person/${selectedPersonId}`;
  }, [selectedPersonId]);

  const setCurrentAsTreeRoot = useCallback(() => {
    if (!selectedPersonId) return;
    setRootPersonId(selectedPersonId);
  }, [selectedPersonId]);

  const setCurrentAsDefaultRoot = useCallback(async () => {
    if (!selectedPersonId || !ensureAdminSession() || !token) return;

    clearActionState();
    setActionBusy(true);
    try {
      await personApi.update(
        selectedPersonId,
        { isRootDefault: true },
        token,
      );
      setRootPersonId(selectedPersonId);
      setActionSuccess('Cette personne est maintenant la racine par défaut du logiciel.');
      await loadTree();
    } catch (err: any) {
      setActionError(err.message || 'Impossible de définir la racine par défaut.');
    } finally {
      setActionBusy(false);
    }
  }, [selectedPersonId, ensureAdminSession, token, clearActionState, loadTree]);

  const createAndAttachNewPerson = useCallback(async () => {
    if (!selectedPersonId) return;

    const payload = toNewPersonPayload();
    if (!payload.givenNames) {
      setActionError('Le champ "Prénoms" est obligatoire.');
      return;
    }

    const newPersonOpId = makeOperationId('person-new');
    const operations: HistoryOperation[] = [
      {
        opId: newPersonOpId,
        kind: 'person',
        payload,
      },
    ];

    const linkOperation = buildLinkOperation(
      makeOperationId('link-new'),
      `@${newPersonOpId}`,
    );

    if (!linkOperation) return;
    operations.push(linkOperation);

    let actionLabel = selectedPersonLabel;

    if (linkMode === 'CHILD' && assistantCreateMissingParent) {
      if (existingPartnerId) {
        operations.push({
          opId: makeOperationId('assistant-co-parent-link'),
          kind: 'relationship',
          payload: {
            parentId: existingPartnerId,
            childId: `@${newPersonOpId}`,
            type: relationshipType,
          },
        });
        actionLabel = 'Ajouter un enfant (assistant foyer)';
      } else {
        const coParentOpId = makeOperationId('assistant-co-parent');
        const surname =
          selectedPersonNormalized?.birthSurname ||
          selectedPersonNormalized?.usageSurname ||
          undefined;

        operations.push({
          opId: coParentOpId,
          kind: 'person',
          payload: {
            givenNames: 'Parent a completer',
            usageSurname: surname,
            birthSurname: surname,
            gender:
              selectedPersonNormalized?.gender === 'MALE'
                ? 'FEMALE'
                : selectedPersonNormalized?.gender === 'FEMALE'
                  ? 'MALE'
                  : 'UNKNOWN',
          },
        });

        operations.push({
          opId: makeOperationId('assistant-union'),
          kind: 'union',
          payload: {
            partner1Id: selectedPersonId,
            partner2Id: `@${coParentOpId}`,
            type: unionType,
          },
        });

        operations.push({
          opId: makeOperationId('assistant-co-parent-link'),
          kind: 'relationship',
          payload: {
            parentId: `@${coParentOpId}`,
            childId: `@${newPersonOpId}`,
            type: relationshipType,
          },
        });

        actionLabel = 'Ajouter un enfant + creer le foyer';
      }
    }

    const executed = await runWithHistory(actionLabel, operations);
    if (!executed) return;

    const createdPerson = executed.find((op) => op.opId === newPersonOpId)?.createdId;
    if (createdPerson) {
      setSelectedPersonId(createdPerson);
    }
    setActionSuccess(`${linkVerb} avec succès.`);
    resetNewPersonForm();
  }, [
    selectedPersonId,
    toNewPersonPayload,
    makeOperationId,
    buildLinkOperation,
    runWithHistory,
    linkMode,
    assistantCreateMissingParent,
    existingPartnerId,
    relationshipType,
    selectedPersonNormalized,
    unionType,
    linkVerb,
    selectedPersonLabel,
    resetNewPersonForm,
    setActionError,
  ]);

  const linkExistingPerson = useCallback(async (personId: string) => {
    if (!selectedPersonId) return;

    const operation = buildLinkOperation(
      makeOperationId('link-existing'),
      personId,
    );
    if (!operation) return;

    const executed = await runWithHistory(selectedPersonLabel, [operation]);
    if (!executed) return;

    setActionSuccess(`${linkVerb} avec succès.`);
    setSelectedPersonId(personId);
  }, [
    selectedPersonId,
    buildLinkOperation,
    makeOperationId,
    runWithHistory,
    selectedPersonLabel,
    linkVerb,
  ]);

  const changeRootFromSearch = useCallback((person: any) => {
    setRootPersonId(person.id);
    setSelectedPersonId(person.id);
    setFocusQuery(personDisplayName(person));
    setShowFocusResults(false);
  }, []);

  // Double click on node → set as new tree root
  const onNodeDoubleClick = useCallback((_: any, node: Node) => {
    setRootPersonId(node.id);
    setSelectedPersonId(node.id);
  }, []);

  return (
    <div style={{ height: '100vh', display: 'grid', gridTemplateColumns: selectedPerson ? '1fr minmax(330px, 360px)' : '1fr' }}>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* ─── Controls Bar ──────────────────── */}
        <div className="tree-controls" id="tree-controls-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>
              🌳 Arbre Généalogique
            </h1>
            {nodeCount > 0 && (
              <span className="badge badge-accent" style={{ fontSize: '0.7rem' }}>
                {nodeCount} personne{nodeCount > 1 ? 's' : ''}
              </span>
            )}
            {isAdmin && (
              <span className="badge badge-emerald" style={{ fontSize: '0.7rem' }}>
                Édition active
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--space-2)' }}>
              <label className="input-label" style={{ whiteSpace: 'nowrap' }}>
                Ancêtres:
              </label>
              <select
                className="input"
                style={{ width: 70, padding: 'var(--space-2)' }}
                value={ancestorGens}
                onChange={(e) => setAncestorGens(Number(e.target.value))}
                id="select-ancestor-generations"
              >
                {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--space-2)' }}>
              <label className="input-label" style={{ whiteSpace: 'nowrap' }}>
                Descendants:
              </label>
              <select
                className="input"
                style={{ width: 70, padding: 'var(--space-2)' }}
                value={descendantGens}
                onChange={(e) => setDescendantGens(Number(e.target.value))}
                id="select-descendant-generations"
              >
                {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--space-2)' }}>
              <label className="input-label" style={{ whiteSpace: 'nowrap' }}>
                Navigation:
              </label>
              <select
                className="input"
                style={{ width: 115, padding: 'var(--space-2)' }}
                value={focusModeEnabled ? 'FOCUS' : 'EXPANDED'}
                onChange={(e) => setFocusModeEnabled(e.target.value === 'FOCUS')}
                id="select-navigation-mode"
              >
                <option value="FOCUS">Focus</option>
                <option value="EXPANDED">Étendu</option>
              </select>
            </div>

            {selectedPersonId && (
              <button
                className="btn btn-ghost"
                style={{ fontSize: 'var(--text-xs)', padding: 'var(--space-2) var(--space-3)' }}
                onClick={focusOnSelected}
              >
                Focus sélection
              </button>
            )}

            <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--space-2)' }}>
              <label className="input-label" style={{ whiteSpace: 'nowrap' }}>
                Glisser-relier:
              </label>
              <select
                className="input"
                style={{ width: 130, padding: 'var(--space-2)' }}
                value={dragLinkType}
                onChange={(e) => setDragLinkType(e.target.value as DragLinkType)}
                id="select-drag-link-mode"
              >
                <option value="PARENT_CHILD">Parenté</option>
                <option value="UNION">Union</option>
              </select>
            </div>

            {dragLinkType === 'PARENT_CHILD' ? (
              <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--space-2)' }}>
                <label className="input-label" style={{ whiteSpace: 'nowrap' }}>
                  Type:
                </label>
                <select
                  className="input"
                  style={{ width: 120, padding: 'var(--space-2)' }}
                  value={relationshipType}
                  onChange={(e) => setRelationshipType(e.target.value)}
                >
                  <option value="BIOLOGICAL">Bio</option>
                  <option value="ADOPTIVE">Adoptive</option>
                  <option value="FOSTER">Accueil</option>
                </select>
              </div>
            ) : (
              <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--space-2)' }}>
                <label className="input-label" style={{ whiteSpace: 'nowrap' }}>
                  Union:
                </label>
                <select
                  className="input"
                  style={{ width: 120, padding: 'var(--space-2)' }}
                  value={unionType}
                  onChange={(e) => setUnionType(e.target.value)}
                >
                  <option value="MARRIAGE">Mariage</option>
                  <option value="PACS">PACS</option>
                  <option value="PARTNERSHIP">Partenariat</option>
                  <option value="OTHER">Autre</option>
                </select>
              </div>
            )}

            <button
              className="btn btn-ghost"
              style={{ fontSize: 'var(--text-xs)', padding: 'var(--space-2) var(--space-3)' }}
              disabled={!canUndo || actionBusy}
              onClick={undoLastAction}
            >
              Annuler
            </button>

            <button
              className="btn btn-ghost"
              style={{ fontSize: 'var(--text-xs)', padding: 'var(--space-2) var(--space-3)' }}
              disabled={!canRedo || actionBusy}
              onClick={redoLastAction}
            >
              Rétablir
            </button>

            <div style={{ position: 'relative', minWidth: 260 }}>
              <input
                className="input"
                id="focus-person-input"
                placeholder="Recentrer l'arbre sur une personne..."
                value={focusQuery}
                onChange={(e) => {
                  setFocusQuery(e.target.value);
                  setShowFocusResults(true);
                }}
                onFocus={() => setShowFocusResults(true)}
              />
              {showFocusResults && (focusLoading || focusResults.length > 0) && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  left: 0,
                  right: 0,
                  zIndex: 30,
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: 'var(--shadow-lg)',
                  overflow: 'hidden',
                }}>
                  {focusLoading && (
                    <div style={{ padding: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                      Recherche en cours...
                    </div>
                  )}
                  {!focusLoading && focusResults.map((person) => (
                    <button
                      key={person.id}
                      className="btn btn-ghost"
                      style={{
                        width: '100%',
                        justifyContent: 'flex-start',
                        borderRadius: 0,
                        padding: 'var(--space-3)',
                        borderBottom: '1px solid var(--color-border-subtle)',
                      }}
                      onClick={() => changeRootFromSearch(person)}
                    >
                      {personDisplayName(person)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <button className="btn btn-ghost" onClick={loadTree} style={{ fontSize: 'var(--text-xs)' }}>
                🔄 Réessayer
              </button>
            )}
          </div>

          <style>{`
            .tree-controls {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: var(--space-3) var(--space-6);
              background: var(--color-bg-secondary);
              border-bottom: 1px solid var(--color-border);
              gap: var(--space-4);
              flex-shrink: 0;
              flex-wrap: wrap;
            }

            .tree-controls select {
              background: var(--color-bg-tertiary);
            }

            @media (max-width: 1200px) {
              .tree-controls {
                align-items: stretch;
              }
            }
          `}</style>
        </div>

        {/* ─── Tree Canvas ───────────────────── */}
        <div style={{ flex: 1, position: 'relative' }}>
          {warning && !error && (
            <div style={{
              position: 'absolute',
              top: 'var(--space-3)',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 12,
              padding: 'var(--space-2) var(--space-4)',
              borderRadius: 'var(--radius-full)',
              background: 'var(--color-amber-subtle)',
              border: '1px solid var(--color-amber)',
              color: 'var(--color-amber)',
              fontSize: 'var(--text-xs)',
            }}>
              {warning}
            </div>
          )}
        {/* Full-screen loading (initial load only) */}
        {loading && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--color-bg-primary)',
            zIndex: 10,
          }}>
            <div style={{ textAlign: 'center' }} className="animate-fade-in">
              <div className="spinner spinner-lg" style={{ margin: '0 auto var(--space-4)' }} />
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                Chargement de l&apos;arbre...
              </p>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)', marginTop: 'var(--space-2)' }}>
                Construction du graphe et disposition automatique
              </p>
            </div>
          </div>
        )}

        {/* Transition overlay (generation depth change) */}
        {transitioning && (
          <div style={{
            position: 'absolute',
            top: 'var(--space-3)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            background: 'var(--color-surface-glass)',
            backdropFilter: 'blur(12px)',
            padding: 'var(--space-2) var(--space-4)',
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--color-border)',
            animation: 'fadeIn 0.2s ease-out',
          }}>
            <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              Rechargement...
            </span>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--color-bg-primary)',
            zIndex: 10,
          }}>
            <div className="glass-card animate-fade-in-up" style={{ maxWidth: 500, textAlign: 'center' }}>
              <h3 style={{ marginBottom: 'var(--space-4)', color: 'var(--color-amber)' }}>
                ⚠️ Arbre non disponible
              </h3>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)', fontSize: 'var(--text-sm)' }}>
                {error}
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center' }}>
                <button className="btn btn-secondary" onClick={loadTree}>
                  🔄 Réessayer
                </button>
                <a href="/admin" className="btn btn-primary">
                  Accéder au panneau Admin
                </a>
              </div>
            </div>
          </div>
        )}

        {!loading && !error && (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.15, duration: 400 }}
            minZoom={0.05}
            maxZoom={2.5}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{
              type: 'smoothstep',
              animated: false,
            }}
            onPaneClick={() => {
              setShowFocusResults(false);
            }}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="hsla(225, 15%, 25%, 0.3)" />
            <Controls position="bottom-left" />
            <MiniMap
              position="bottom-right"
              nodeColor={(node) => {
                const gender = (node.data as any)?.person?.gender;
                if (gender === 'MALE') return 'hsl(210, 70%, 55%)';
                if (gender === 'FEMALE') return 'hsl(330, 65%, 55%)';
                return 'hsl(220, 12%, 50%)';
              }}
              maskColor="hsla(225, 25%, 5%, 0.7)"
              pannable
              zoomable
            />
          </ReactFlow>
        )}

        {/* Keyboard shortcuts hint */}
        {!loading && !error && nodes.length > 0 && (
          <div style={{
            position: 'absolute',
            bottom: 'var(--space-3)',
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-muted)',
            background: 'var(--color-surface-glass)',
            backdropFilter: 'blur(8px)',
            padding: 'var(--space-1) var(--space-3)',
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--color-border-subtle)',
            pointerEvents: 'none',
          }}>
            Clic → sélectionner · Double-clic → recentrer · Glisser-relier → créer lien · Molette → zoom
          </div>
        )}
      </div>

      </div>

      {/* ─── Interactive Side Panel ────────────────── */}
      {selectedPerson && (
        <aside style={{
          height: '100vh',
          borderLeft: '1px solid var(--color-border)',
          background: 'var(--color-bg-secondary)',
          overflowY: 'auto',
          padding: 'var(--space-4)',
        }}>
          <div className="glass-card" style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Personne sélectionnée
                </div>
                <h3 style={{ marginTop: 'var(--space-1)', marginBottom: 'var(--space-1)' }}>{selectedPersonName || 'Sans nom'}</h3>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  {selectedPersonNormalized?.birthDate
                    ? `Né(e) le ${new Date(selectedPersonNormalized.birthDate as string).toLocaleDateString('fr-FR')}`
                    : 'Date de naissance inconnue'}
                  {selectedPersonNormalized?.birthPlace ? ` · ${selectedPersonNormalized.birthPlace}` : ''}
                </div>
              </div>
              <button className="btn btn-ghost" style={{ padding: 'var(--space-1) var(--space-2)' }} onClick={() => setSelectedPersonId(null)}>
                Fermer
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
              <button className="btn btn-secondary" onClick={goToPersonDetails}>
                Voir fiche
              </button>
              <button className="btn btn-secondary" onClick={setCurrentAsTreeRoot}>
                Centrer ici
              </button>
            </div>

            <div style={{ marginTop: 'var(--space-4)', padding: 'var(--space-3)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', background: 'var(--color-bg-primary)' }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
                Édition généalogique
              </div>

              {!authChecked && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                  Vérification des droits...
                </div>
              )}

              {authChecked && !isAdmin && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-amber)' }}>
                  Connectez-vous en administrateur dans <a href="/admin">Admin</a> pour créer et lier des personnes directement depuis l'arbre.
                </div>
              )}

              {authChecked && isAdmin && (
                <>
                  <div style={{ marginTop: 'var(--space-2)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-2)' }}>
                      Actions rapides par défaut
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 'var(--text-xs)', border: '1px solid var(--color-border-subtle)' }}
                        onClick={() => applyQuickTemplate('MOTHER')}
                      >
                        + Mère
                      </button>
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 'var(--text-xs)', border: '1px solid var(--color-border-subtle)' }}
                        onClick={() => applyQuickTemplate('FATHER')}
                      >
                        + Père
                      </button>
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 'var(--text-xs)', border: '1px solid var(--color-border-subtle)' }}
                        onClick={() => applyQuickTemplate('CHILD')}
                      >
                        + Enfant
                      </button>
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 'var(--text-xs)', border: '1px solid var(--color-border-subtle)' }}
                        onClick={() => applyQuickTemplate('SPOUSE')}
                      >
                        + Conjoint
                      </button>
                    </div>
                  </div>

                  <div className="input-group" style={{ marginTop: 'var(--space-2)' }}>
                    <label className="input-label">Action</label>
                    <select className="input" value={linkMode} onChange={(e) => { setLinkMode(e.target.value as LinkMode); clearActionState(); }}>
                      <option value="PARENT">Ajouter un parent</option>
                      <option value="CHILD">Ajouter un enfant</option>
                      <option value="SPOUSE">Ajouter un conjoint</option>
                    </select>
                  </div>

                  <div className="input-group" style={{ marginTop: 'var(--space-2)' }}>
                    <label className="input-label">Source</label>
                    <select className="input" value={linkTarget} onChange={(e) => { setLinkTarget(e.target.value as LinkTarget); clearActionState(); }}>
                      <option value="new">Créer une nouvelle personne</option>
                      <option value="existing">Lier une personne existante</option>
                    </select>
                  </div>

                  {linkMode !== 'SPOUSE' && (
                    <div className="input-group" style={{ marginTop: 'var(--space-2)' }}>
                      <label className="input-label">Type de filiation</label>
                      <select className="input" value={relationshipType} onChange={(e) => setRelationshipType(e.target.value)}>
                        <option value="BIOLOGICAL">Biologique</option>
                        <option value="ADOPTIVE">Adoptive</option>
                        <option value="FOSTER">Accueil</option>
                      </select>
                    </div>
                  )}

                  {linkMode === 'SPOUSE' && (
                    <div className="input-group" style={{ marginTop: 'var(--space-2)' }}>
                      <label className="input-label">Type d'union</label>
                      <select className="input" value={unionType} onChange={(e) => setUnionType(e.target.value)}>
                        <option value="MARRIAGE">Mariage</option>
                        <option value="PACS">PACS</option>
                        <option value="PARTNERSHIP">Partenariat</option>
                        <option value="OTHER">Autre</option>
                      </select>
                    </div>
                  )}

                  {linkMode === 'CHILD' && linkTarget === 'new' && (
                    <div
                      style={{
                        marginTop: 'var(--space-3)',
                        padding: 'var(--space-2) var(--space-3)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-border-subtle)',
                        background: 'var(--color-bg-secondary)',
                      }}
                    >
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--space-2)',
                          fontSize: 'var(--text-xs)',
                          color: 'var(--color-text-secondary)',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={assistantCreateMissingParent}
                          onChange={(e) => setAssistantCreateMissingParent(e.target.checked)}
                        />
                        Assistant familial: compléter automatiquement le foyer
                      </label>
                      {assistantCreateMissingParent && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-2)' }}>
                          {existingPartnerId
                            ? 'Le second parent existant sera relié automatiquement à l\'enfant.'
                            : 'Un second parent provisoire et une union seront créés automatiquement.'}
                        </div>
                      )}
                    </div>
                  )}

                  {linkTarget === 'new' && (
                    <div style={{ marginTop: 'var(--space-3)', display: 'grid', gap: 'var(--space-2)' }}>
                      <input
                        className="input"
                        placeholder="Prénoms *"
                        value={newPersonForm.givenNames}
                        onChange={(e) => setNewPersonForm((prev) => ({ ...prev, givenNames: e.target.value }))}
                      />
                      <input
                        className="input"
                        placeholder="Nom d'usage"
                        value={newPersonForm.usageSurname}
                        onChange={(e) => setNewPersonForm((prev) => ({ ...prev, usageSurname: e.target.value }))}
                      />
                      <input
                        className="input"
                        placeholder="Nom de naissance"
                        value={newPersonForm.birthSurname}
                        onChange={(e) => setNewPersonForm((prev) => ({ ...prev, birthSurname: e.target.value }))}
                      />
                      <select
                        className="input"
                        value={newPersonForm.gender}
                        onChange={(e) => setNewPersonForm((prev) => ({ ...prev, gender: e.target.value }))}
                      >
                        <option value="UNKNOWN">Inconnu</option>
                        <option value="MALE">Homme</option>
                        <option value="FEMALE">Femme</option>
                        <option value="OTHER">Autre</option>
                      </select>
                      <input
                        className="input"
                        type="date"
                        value={newPersonForm.birthDate}
                        onChange={(e) => setNewPersonForm((prev) => ({ ...prev, birthDate: e.target.value }))}
                      />
                      <input
                        className="input"
                        placeholder="Lieu de naissance"
                        value={newPersonForm.birthPlace}
                        onChange={(e) => setNewPersonForm((prev) => ({ ...prev, birthPlace: e.target.value }))}
                      />

                      <button className="btn btn-primary" onClick={createAndAttachNewPerson} disabled={actionBusy}>
                        {actionBusy ? 'Traitement...' : selectedPersonLabel}
                      </button>
                    </div>
                  )}

                  {linkTarget === 'existing' && (
                    <div style={{ marginTop: 'var(--space-3)' }}>
                      <input
                        className="input"
                        placeholder="Rechercher une personne existante..."
                        value={existingQuery}
                        onChange={(e) => setExistingQuery(e.target.value)}
                      />
                      <div style={{ marginTop: 'var(--space-2)', display: 'grid', gap: 'var(--space-2)', maxHeight: 220, overflowY: 'auto' }}>
                        {existingLoading && (
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                            Recherche en cours...
                          </div>
                        )}
                        {!existingLoading && existingResults.length === 0 && existingQuery.trim().length >= 2 && (
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                            Aucun résultat.
                          </div>
                        )}
                        {!existingLoading && existingResults.map((person) => (
                          <button
                            key={person.id}
                            className="btn btn-ghost"
                            style={{ justifyContent: 'space-between', fontSize: 'var(--text-xs)', border: '1px solid var(--color-border-subtle)' }}
                            onClick={() => linkExistingPerson(person.id)}
                            disabled={actionBusy}
                          >
                            <span>{personDisplayName(person)}</span>
                            <span style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{person.id.slice(0, 8)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <button className="btn btn-ghost" style={{ width: '100%', marginTop: 'var(--space-3)' }} onClick={setCurrentAsDefaultRoot} disabled={actionBusy}>
                    Définir cette personne comme racine par défaut
                  </button>

                  {actionError && (
                    <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-rose)', borderRadius: 'var(--radius-md)', color: 'var(--color-rose)', background: 'var(--color-rose-subtle)', fontSize: 'var(--text-xs)' }}>
                      {actionError}
                    </div>
                  )}

                  {actionSuccess && (
                    <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-emerald)', borderRadius: 'var(--radius-md)', color: 'var(--color-emerald)', background: 'var(--color-emerald-subtle)', fontSize: 'var(--text-xs)' }}>
                      {actionSuccess}
                    </div>
                  )}

                  <div style={{ marginTop: 'var(--space-4)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-2)' }}>
                      Journal de session ({historyState.entries.length})
                    </div>
                    <div style={{ display: 'grid', gap: 'var(--space-2)', maxHeight: 180, overflowY: 'auto' }}>
                      {historyState.entries.length === 0 && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                          Aucune action enregistrée pour le moment.
                        </div>
                      )}
                      {[...historyState.entries].reverse().slice(0, 8).map((entry, reverseIndex) => {
                        const realIndex = historyState.entries.length - 1 - reverseIndex;
                        const isApplied = realIndex <= historyState.index;
                        return (
                          <div
                            key={entry.id}
                            style={{
                              fontSize: 'var(--text-xs)',
                              color: isApplied ? 'var(--color-text-secondary)' : 'var(--color-text-muted)',
                              padding: 'var(--space-2)',
                              borderRadius: 'var(--radius-md)',
                              border: '1px solid var(--color-border-subtle)',
                              background: isApplied ? 'var(--color-bg-secondary)' : 'var(--color-bg-primary)',
                            }}
                          >
                            <div>{entry.label}</div>
                            <div style={{ marginTop: '2px', opacity: 0.8 }}>
                              {new Date(entry.createdAt).toLocaleTimeString('fr-FR')} · {isApplied ? 'actif' : 'annulé'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

// ─── Wrapper with Provider ──────────────────
export default function HomePage() {
  return (
    <ReactFlowProvider>
      <TreeFlow />
    </ReactFlowProvider>
  );
}
