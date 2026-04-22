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
  BaseEdge,
  EdgeLabelRenderer,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type EdgeProps,
  type Node,
  type Edge,
  type Connection,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import {
  treeApi,
  personApi,
  authApi,
  relationshipApi,
  unionApi,
  searchApi,
} from '@/lib/api';
import PersonNode from '@/components/tree/PersonNode';
import TreeSettingsPanel from '@/components/tree/TreeSettingsPanel';
import TreePersonPanel from '@/components/tree/TreePersonPanel';

const NODE_WIDTH = 220;
const NODE_HEIGHT = 120;
const COUPLE_LINK_MARGIN = 24;
const CHILD_ORTHOGONAL_PRE_TARGET_GAP = 20;

function CoupleHorizontalEdge({
  id,
  sourceX,
  targetX,
  sourceY,
  targetY,
  style,
  markerEnd,
  label,
  data,
}: EdgeProps) {
  const sourceBottomY = typeof data?.sourceBottomY === 'number'
    ? data.sourceBottomY
    : sourceY;
  const targetBottomY = typeof data?.targetBottomY === 'number'
    ? data.targetBottomY
    : targetY;
  const coupleY = typeof data?.coupleY === 'number'
    ? data.coupleY
    : Math.max(sourceBottomY, targetBottomY) + COUPLE_LINK_MARGIN;
  const labelText = typeof label === 'string' || typeof label === 'number' ? label : null;
  const labelX = (sourceX + targetX) / 2;

  const dx = targetX - sourceX;
  let path = '';
  if (dx === 0) {
    path = `M ${sourceX},${sourceBottomY} L ${sourceX},${targetBottomY}`;
  } else {
    const dirX = Math.sign(dx);
    const r = Math.min(12, Math.abs(dx) / 2, Math.abs(coupleY - sourceBottomY), Math.abs(coupleY - targetBottomY));
    path = `M ${sourceX},${sourceBottomY} ` +
      `L ${sourceX},${coupleY - r} ` +
      `Q ${sourceX},${coupleY} ${sourceX + r * dirX},${coupleY} ` +
      `L ${targetX - r * dirX},${coupleY} ` +
      `Q ${targetX},${coupleY} ${targetX},${coupleY - r} ` +
      `L ${targetX},${targetBottomY}`;
  }

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {labelText !== null && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${coupleY}px)`,
              pointerEvents: 'none',
              fontSize: 15,
              fontWeight: 700,
              lineHeight: 1,
              color: typeof style?.stroke === 'string' ? style.stroke : 'currentColor',
              background: 'hsla(225, 24%, 12%, 0.88)',
              border: `1px solid ${typeof style?.stroke === 'string' ? style.stroke : 'transparent'}`,
              borderRadius: 8,
              padding: '2px 6px',
            }}
          >
            {labelText}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

function OrthogonalDescendantEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerEnd,
  data,
}: EdgeProps) {
  const startX = typeof data?.sourceCoupleX === 'number' ? data.sourceCoupleX : sourceX;
  const startY = typeof data?.sourceCoupleY === 'number' ? data.sourceCoupleY : sourceY;
  
  const dx = targetX - startX;
  // Fix "décalage": if nodes are almost perfectly aligned vertically, snap them to a straight line
  const effectiveTargetX = Math.abs(dx) < 15 ? startX : targetX;
  const effectiveDx = effectiveTargetX - startX;
  
  const preTargetY = Math.max(startY + 12, targetY - CHILD_ORTHOGONAL_PRE_TARGET_GAP);
  
  let path = '';
  if (effectiveDx === 0) {
    path = `M ${startX},${startY} L ${startX},${targetY}`;
  } else {
    const dirX = Math.sign(effectiveDx);
    const r = Math.min(16, Math.abs(effectiveDx) / 2, Math.abs(preTargetY - startY) / 2, Math.abs(targetY - preTargetY) / 2);
    
    path = `M ${startX},${startY} ` +
           `L ${startX},${preTargetY - r} ` +
           `Q ${startX},${preTargetY} ${startX + r * dirX},${preTargetY} ` +
           `L ${effectiveTargetX - r * dirX},${preTargetY} ` +
           `Q ${effectiveTargetX},${preTargetY} ${effectiveTargetX},${preTargetY + r} ` +
           `L ${effectiveTargetX},${targetY}`;
  }

  return <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />;
}

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

const edgeTypes = {
  coupleHorizontal: CoupleHorizontalEdge,
  orthogonalDescendant: OrthogonalDescendantEdge,
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
type LinkTarget = 'new' | 'existing' | 'standalone';
type DragLinkType = 'PARENT_CHILD' | 'UNION';
type NodeQuickAction = 'ADD_FATHER' | 'ADD_MOTHER' | 'ADD_SPOUSE' | 'ADD_CHILD';
type QuickAddGender = 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN';

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

type UnionRecord = {
  id: string;
  partner1Id: string;
  partner2Id: string;
  type?: string;
  partner1?: TreePerson;
  partner2?: TreePerson;
};

type ChildRelationshipRecord = {
  id: string;
  parentId: string;
  childId: string;
  type?: string;
  parent?: TreePerson;
};

type ChildUnionOption = {
  id: string;
  partnerId: string;
  partnerName: string;
  unionType: string;
};

type ParentOption = {
  parentId: string;
  parentName: string;
};

type SidePanelTab = 'SUMMARY' | 'EDIT' | 'HISTORY';

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

type NormalizedTreePerson = ReturnType<typeof normalizePerson>;

type TreeRelationship = {
  id: string;
  parentId: string;
  childId: string;
  type?: string;
};

type TreeUnion = {
  id: string;
  partner1Id: string;
  partner2Id: string;
  type?: string;
};

type FamilySummary = {
  unionId: string;
  partnerId: string;
  partnerName: string;
  children: Array<{ id: string; name: string }>;
};

type CouplePair = {
  key: string;
  partner1Id: string;
  partner2Id: string;
  unionType?: string;
};

function buildPairKey(idA: string, idB: string) {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}

function colorFromSeed(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 76%, 56%)`;
}

function toCsvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  const escaped = text.replace(/"/g, '""');
  return `"${escaped}"`;
}

function downloadFile(fileName: string, mimeType: string, content: string | Blob) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function buildExportDateSuffix() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${hh}${min}`;
}

function personDisplayName(person: TreePerson | null | undefined) {
  if (!person) return '';
  const p = normalizePerson(person);
  const surname = p.usageSurname || p.birthSurname || '';
  return `${p.givenNames}${surname ? ` ${surname}` : ''}`.trim();
}

function shortId(value: string) {
  return value.slice(0, 8);
}

function unionTypeLabel(type: string | undefined) {
  if (type === 'MARRIAGE') return 'Mariage';
  if (type === 'PACS') return 'PACS';
  if (type === 'PARTNERSHIP') return 'Partenariat';
  return 'Union';
}

function buildStandalonePersonForm(isRootDefault = false) {
  return {
    givenNames: '',
    usageSurname: '',
    birthSurname: '',
    gender: 'UNKNOWN',
    birthDate: '',
    birthPlace: '',
    isRootDefault,
  };
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
  const [wideTreeMode, setWideTreeMode] = useState(true);
  const [menusCompact, setMenusCompact] = useState(true);
  const [presentationMode, setPresentationMode] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [sidePanelTab, setSidePanelTab] = useState<SidePanelTab>('SUMMARY');
  const [preferencesKey, setPreferencesKey] = useState('origineo_tree_prefs_guest');
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [focusModeEnabled, setFocusModeEnabled] = useState(false);
  const [dragLinkType, setDragLinkType] = useState<DragLinkType>('PARENT_CHILD');
  const [assistantCreateMissingParent, setAssistantCreateMissingParent] = useState(false);
  const [selectedPersonUnions, setSelectedPersonUnions] = useState<UnionRecord[]>([]);
  const [selectedPersonParents, setSelectedPersonParents] = useState<ChildRelationshipRecord[]>([]);
  const [familyContextLoading, setFamilyContextLoading] = useState(false);
  const [familyContextError, setFamilyContextError] = useState<string | null>(null);
  const [selectedChildUnionId, setSelectedChildUnionId] = useState('');
  const [parentUnionLinkParentId, setParentUnionLinkParentId] = useState('NONE');
  const [treeRelationships, setTreeRelationships] = useState<TreeRelationship[]>([]);
  const [treeUnions, setTreeUnions] = useState<TreeUnion[]>([]);
  const [treePersonById, setTreePersonById] = useState<Record<string, NormalizedTreePerson>>({});
  const [exportBusy, setExportBusy] = useState<null | 'PNG' | 'PDF' | 'CSV_VISIBLE' | 'CSV_BRANCH'>(null);
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
  const [showStandaloneCreate, setShowStandaloneCreate] = useState(false);
  const [standaloneCreateBusy, setStandaloneCreateBusy] = useState(false);
  const [standalonePersonForm, setStandalonePersonForm] = useState(() => buildStandalonePersonForm(true));
  const [focusQuery, setFocusQuery] = useState('');
  const [focusResults, setFocusResults] = useState<any[]>([]);
  const [focusLoading, setFocusLoading] = useState(false);
  const [showFocusResults, setShowFocusResults] = useState(false);
  const [existingQuery, setExistingQuery] = useState('');
  const [existingResults, setExistingResults] = useState<any[]>([]);
  const [existingLoading, setExistingLoading] = useState(false);
  const { fitView, getViewport, setViewport } = useReactFlow();
  const abortRef = useRef<AbortController | null>(null);
  const treeCanvasRef = useRef<HTMLDivElement | null>(null);
  const controlsBarRef = useRef<HTMLDivElement | null>(null);
  const controlsHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWorkspaceMoveRef = useRef(0);
  const [controlsBarHeight, setControlsBarHeight] = useState(0);

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
  const showSelectionPanel = Boolean(selectedPerson) && !wideTreeMode && !presentationMode;
  const isNodeEditMode = authChecked && isAdmin && sidePanelTab === 'EDIT';

  useEffect(() => {
    document.body.classList.add('tree-workspace-mode');
    return () => {
      document.body.classList.remove('tree-workspace-mode');
    };
  }, []);

  const childUnionOptions = useMemo<ChildUnionOption[]>(() => {
    if (!selectedPersonId) return [];

    return selectedPersonUnions.map((union) => {
      const partnerId = union.partner1Id === selectedPersonId
        ? union.partner2Id
        : union.partner1Id;
      const partner = union.partner1Id === selectedPersonId
        ? union.partner2
        : union.partner1;

      return {
        id: union.id,
        partnerId,
        partnerName: personDisplayName(partner) || `Personne ${shortId(partnerId)}`,
        unionType: union.type || 'OTHER',
      };
    });
  }, [selectedPersonId, selectedPersonUnions]);

  const selectedChildUnion = useMemo(() => {
    if (!selectedChildUnionId) return null;
    return childUnionOptions.find((union) => union.id === selectedChildUnionId) || null;
  }, [childUnionOptions, selectedChildUnionId]);

  const visibleUnionOptions = useMemo<ChildUnionOption[]>(() => {
    if (!selectedPersonId) return [];

    return treeUnions
      .filter((union) => union.partner1Id === selectedPersonId || union.partner2Id === selectedPersonId)
      .map((union) => {
        const partnerId = union.partner1Id === selectedPersonId ? union.partner2Id : union.partner1Id;
        const partner = treePersonById[partnerId];

        return {
          id: union.id,
          partnerId,
          partnerName: personDisplayName(partner) || `Personne ${shortId(partnerId)}`,
          unionType: union.type || 'OTHER',
        };
      });
  }, [selectedPersonId, treeUnions, treePersonById]);

  const familySummary = useMemo(() => {
    if (!selectedPersonId) {
      return {
        families: [] as FamilySummary[],
        childrenWithoutUnion: [] as Array<{ id: string; name: string }>,
      };
    }

    const childrenByParent = new Map<string, Set<string>>();
    for (const relationship of treeRelationships) {
      const children = childrenByParent.get(relationship.parentId) || new Set<string>();
      children.add(relationship.childId);
      childrenByParent.set(relationship.parentId, children);
    }

    const selectedChildren = childrenByParent.get(selectedPersonId) || new Set<string>();
    const seenChildren = new Set<string>();

    const families: FamilySummary[] = visibleUnionOptions.map((unionOption) => {
      const partnerChildren = childrenByParent.get(unionOption.partnerId) || new Set<string>();
      const sharedChildren = Array.from(selectedChildren)
        .filter((childId) => partnerChildren.has(childId))
        .map((childId) => {
          seenChildren.add(childId);
          const child = treePersonById[childId];
          return {
            id: childId,
            name: personDisplayName(child) || `Personne ${shortId(childId)}`,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

      return {
        unionId: unionOption.id,
        partnerId: unionOption.partnerId,
        partnerName: unionOption.partnerName,
        children: sharedChildren,
      };
    });

    const childrenWithoutUnion = Array.from(selectedChildren)
      .filter((childId) => !seenChildren.has(childId))
      .map((childId) => {
        const child = treePersonById[childId];
        return {
          id: childId,
          name: personDisplayName(child) || `Personne ${shortId(childId)}`,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

    return {
      families,
      childrenWithoutUnion,
    };
  }, [selectedPersonId, treeRelationships, treePersonById, visibleUnionOptions]);

  const parentOptionsForUnion = useMemo<ParentOption[]>(() => {
    const uniqueParents = new Map<string, ParentOption>();

    selectedPersonParents.forEach((relationship) => {
      if (uniqueParents.has(relationship.parentId)) return;

      uniqueParents.set(relationship.parentId, {
        parentId: relationship.parentId,
        parentName:
          personDisplayName(relationship.parent) ||
          `Parent ${shortId(relationship.parentId)}`,
      });
    });

    return Array.from(uniqueParents.values());
  }, [selectedPersonParents]);

  const canUndo = historyState.index >= 0;
  const canRedo = historyState.index < historyState.entries.length - 1;

  const clearControlsHideTimer = useCallback(() => {
    if (!controlsHideTimerRef.current) return;
    clearTimeout(controlsHideTimerRef.current);
    controlsHideTimerRef.current = null;
  }, []);

  const scheduleControlsHide = useCallback(() => {
    clearControlsHideTimer();
    if (presentationMode) {
      setControlsVisible(false);
      return;
    }
  }, [clearControlsHideTimer, presentationMode]);

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

  const resetStandalonePersonForm = useCallback((asRootDefault: boolean) => {
    setStandalonePersonForm(buildStandalonePersonForm(asRootDefault));
  }, []);

  const openStandaloneCreate = useCallback(() => {
    clearActionState();
    resetStandalonePersonForm(!rootPersonId);
    setShowStandaloneCreate(true);
  }, [clearActionState, resetStandalonePersonForm, rootPersonId]);

  const closeStandaloneCreate = useCallback(() => {
    setShowStandaloneCreate(false);
    setStandaloneCreateBusy(false);
    resetStandalonePersonForm(!rootPersonId);
  }, [resetStandalonePersonForm, rootPersonId]);

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

  const buildChildCoParentOperations = useCallback((
    childRef: string,
  ): { operations: HistoryOperation[]; actionSuffix: string } => {
    if (!selectedPersonId || linkMode !== 'CHILD') {
      return { operations: [], actionSuffix: '' };
    }

    if (selectedChildUnion) {
      return {
        operations: [
          {
            opId: makeOperationId('co-parent-link'),
            kind: 'relationship',
            payload: {
              parentId: selectedChildUnion.partnerId,
              childId: childRef,
              type: relationshipType,
            },
          },
        ],
        actionSuffix: ` + co-parent (${selectedChildUnion.partnerName})`,
      };
    }

    if (!assistantCreateMissingParent) {
      return { operations: [], actionSuffix: '' };
    }

    const coParentOpId = makeOperationId('assistant-co-parent');
    const surname =
      selectedPersonNormalized?.birthSurname ||
      selectedPersonNormalized?.usageSurname ||
      undefined;

    return {
      operations: [
        {
          opId: coParentOpId,
          kind: 'person',
          payload: {
            givenNames: 'Co-parent a completer',
            usageSurname: surname,
            birthSurname: surname,
            gender: 'UNKNOWN',
          },
        },
        {
          opId: makeOperationId('assistant-union'),
          kind: 'union',
          payload: {
            partner1Id: selectedPersonId,
            partner2Id: `@${coParentOpId}`,
            type: unionType,
          },
        },
        {
          opId: makeOperationId('assistant-co-parent-link'),
          kind: 'relationship',
          payload: {
            parentId: `@${coParentOpId}`,
            childId: childRef,
            type: relationshipType,
          },
        },
      ],
      actionSuffix: ' + co-parent provisoire',
    };
  }, [
    selectedPersonId,
    linkMode,
    selectedChildUnion,
    assistantCreateMissingParent,
    makeOperationId,
    relationshipType,
    selectedPersonNormalized,
    unionType,
  ]);

  const buildParentUnionOperation = useCallback((
    parentRef: string,
  ): HistoryOperation | null => {
    if (linkMode !== 'PARENT') return null;
    if (!selectedPersonId || parentUnionLinkParentId === 'NONE') return null;
    if (parentRef === parentUnionLinkParentId) return null;

    return {
      opId: makeOperationId('parent-union-link'),
      kind: 'union',
      payload: {
        partner1Id: parentRef,
        partner2Id: parentUnionLinkParentId,
        type: unionType,
      },
    };
  }, [linkMode, selectedPersonId, parentUnionLinkParentId, makeOperationId, unionType]);

  const applyQuickTemplate = useCallback(
    (template: 'MOTHER' | 'FATHER' | 'PARENT' | 'CHILD' | 'SPOUSE') => {
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

      if (template === 'PARENT') {
        setLinkMode('PARENT');
        setRelationshipType('BIOLOGICAL');
        setNewPersonForm({
          givenNames: '',
          usageSurname: defaultSurname,
          birthSurname: defaultSurname,
          gender: 'UNKNOWN',
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
            setError('Aucune personne disponible. Créez la première personne directement depuis cette page.');
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
      setPreferencesKey('origineo_tree_prefs_guest');
      setAuthChecked(true);
      return;
    }

    setToken(savedToken);
    authApi.getProfile(savedToken)
      .then((result) => {
        setIsAdmin(result.data?.role === 'ADMIN');
        const profileIdentifier = String(
          result.data?.email || result.data?.id || result.data?.sub || 'guest',
        )
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, '_');
        setPreferencesKey(`origineo_tree_prefs_${profileIdentifier}`);
      })
      .catch(() => {
        localStorage.removeItem('origineo_token');
        setToken(null);
        setIsAdmin(false);
        setPreferencesKey('origineo_tree_prefs_guest');
      })
      .finally(() => {
        setAuthChecked(true);
      });
  }, []);

  useEffect(() => {
    setPreferencesReady(false);
    try {
      const raw = localStorage.getItem(preferencesKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.wideTreeMode === 'boolean') setWideTreeMode(parsed.wideTreeMode);
        if (typeof parsed.menusCompact === 'boolean') setMenusCompact(parsed.menusCompact);
        if (typeof parsed.ancestorGens === 'number' && parsed.ancestorGens >= 0 && parsed.ancestorGens <= 8) {
          setAncestorGens(parsed.ancestorGens);
        }
        if (typeof parsed.descendantGens === 'number' && parsed.descendantGens >= 0 && parsed.descendantGens <= 6) {
          setDescendantGens(parsed.descendantGens);
        }
      }
    } catch {
      // Ignore invalid persisted preferences.
    } finally {
      setPreferencesReady(true);
    }
  }, [preferencesKey]);

  useEffect(() => {
    if (!preferencesReady) return;

    const payload = {
      wideTreeMode,
      menusCompact,
      ancestorGens,
      descendantGens,
    };

    localStorage.setItem(preferencesKey, JSON.stringify(payload));
  }, [
    preferencesReady,
    preferencesKey,
    wideTreeMode,
    menusCompact,
    ancestorGens,
    descendantGens,
  ]);

  // Keep selected node valid after reload/root changes
  useEffect(() => {
    if (!selectedPersonId) return;
    const exists = nodes.some((n) => n.id === selectedPersonId);
    if (!exists) {
      setSelectedPersonId(rootPersonId);
    }
  }, [nodes, selectedPersonId, rootPersonId]);

  // Load complete family context for selected person (all unions + known parents)
  useEffect(() => {
    if (!selectedPersonId || !isAdmin) {
      setSelectedPersonUnions([]);
      setSelectedPersonParents([]);
      setFamilyContextError(null);
      setFamilyContextLoading(false);
      return;
    }

    let cancelled = false;
    setFamilyContextLoading(true);
    setFamilyContextError(null);

    Promise.all([
      unionApi.getByPerson(selectedPersonId),
      relationshipApi.getByPerson(selectedPersonId),
    ])
      .then(([unionResult, relationshipResult]) => {
        if (cancelled) return;

        const unions = Array.isArray(unionResult.data)
          ? (unionResult.data as UnionRecord[])
          : [];
        const asChild = relationshipResult.data?.asChild;
        const parentLinks = Array.isArray(asChild)
          ? (asChild as ChildRelationshipRecord[])
          : [];

        setSelectedPersonUnions(unions);
        setSelectedPersonParents(parentLinks);
      })
      .catch(() => {
        if (cancelled) return;
        setSelectedPersonUnions([]);
        setSelectedPersonParents([]);
        setFamilyContextError('Impossible de charger le contexte familial de cette personne.');
      })
      .finally(() => {
        if (!cancelled) setFamilyContextLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPersonId, isAdmin]);

  useEffect(() => {
    if (childUnionOptions.length === 0) {
      setSelectedChildUnionId('');
      return;
    }

    setSelectedChildUnionId((current) => (
      current && childUnionOptions.some((option) => option.id === current)
        ? current
        : childUnionOptions[0].id
    ));
  }, [childUnionOptions]);

  useEffect(() => {
    setParentUnionLinkParentId((current) => (
      current !== 'NONE' && !parentOptionsForUnion.some((option) => option.parentId === current)
        ? 'NONE'
        : current
    ));
  }, [parentOptionsForUnion]);

  useEffect(() => {
    if (presentationMode) {
      clearControlsHideTimer();
      setControlsVisible(false);
      return;
    }

    setControlsVisible(true);
    scheduleControlsHide();
  }, [clearControlsHideTimer, menusCompact, presentationMode, scheduleControlsHide]);

  useEffect(() => {
    return () => {
      clearControlsHideTimer();
    };
  }, [clearControlsHideTimer]);

  useEffect(() => {
    const controlsBar = controlsBarRef.current;

    if (!controlsBar || presentationMode || !controlsVisible) {
      setControlsBarHeight(0);
      return;
    }

    const updateHeight = () => {
      const nextHeight = Math.ceil(controlsBar.getBoundingClientRect().height);
      setControlsBarHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    };

    updateHeight();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      updateHeight();
    });
    observer.observe(controlsBar);
    window.addEventListener('resize', updateHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, [controlsVisible, presentationMode]);

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

    const requestedAncestors = ancestorGens;
    const requestedDescendants = descendantGens;

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

      const normalizedPersonMap: Record<string, NormalizedTreePerson> = {};
      treeData.nodes.forEach((node: any) => {
        normalizedPersonMap[node.person.id] = normalizePerson(node.person);
      });
      setTreePersonById(normalizedPersonMap);

      const relationships: TreeRelationship[] = treeData.relationships || [];
      const unions: TreeUnion[] = treeData.unions || [];
      setTreeRelationships(relationships);
      setTreeUnions(unions);

      const parentsByChild = new Map<string, string[]>();
      relationships.forEach((rel) => {
        const list = parentsByChild.get(rel.childId) || [];
        list.push(rel.parentId);
        parentsByChild.set(rel.childId, list);
      });

      const relationshipEdgesForLayout: Edge[] = relationships
        .filter((rel) => Boolean(normalizedPersonMap[rel.parentId]) && Boolean(normalizedPersonMap[rel.childId]))
        .map((rel) => ({
          id: `layout-${rel.id}`,
          source: rel.parentId,
          target: rel.childId,
          type: 'smoothstep',
        }));

      const couplePairs = new Map<string, CouplePair>();
      const registerCouplePair = (
        partnerAId: string,
        partnerBId: string,
        unionType?: string,
      ) => {
        if (!partnerAId || !partnerBId || partnerAId === partnerBId) {
          return null;
        }

        const key = buildPairKey(partnerAId, partnerBId);
        const existing = couplePairs.get(key);
        if (existing) {
          if (!existing.unionType && unionType) {
            existing.unionType = unionType;
          }
          return existing;
        }

        const [partner1Id, partner2Id] =
          partnerAId < partnerBId
            ? [partnerAId, partnerBId]
            : [partnerBId, partnerAId];

        const pair: CouplePair = {
          key,
          partner1Id,
          partner2Id,
          unionType,
        };

        couplePairs.set(key, pair);
        return pair;
      };

      unions.forEach((union) => {
        registerCouplePair(union.partner1Id, union.partner2Id, union.type);
      });

      const childrenByPair = new Map<string, string[]>();
      parentsByChild.forEach((parentIds, childId) => {
        const uniqueParents = Array.from(new Set(parentIds)).filter((parentId) =>
          Boolean(normalizedPersonMap[parentId]),
        );

        if (uniqueParents.length !== 2) {
          return;
        }

        const pair = registerCouplePair(uniqueParents[0], uniqueParents[1]);
        if (!pair) {
          return;
        }

        const children = childrenByPair.get(pair.key) || [];
        if (!children.includes(childId)) {
          children.push(childId);
          childrenByPair.set(pair.key, children);
        }
      });

      // Apply dagre layout
      const { nodes: layoutedNodes } = getLayoutedElements(flowNodes, relationshipEdgesForLayout);
      const nodeById = new Map(layoutedNodes.map((node) => [node.id, node]));

      const coupleYByPairKey = new Map<string, number>();
      const coupleMidXByPairKey = new Map<string, number>();
      const coupleEdges: Edge[] = [];

      couplePairs.forEach((pair) => {
        const partner1Node = nodeById.get(pair.partner1Id);
        const partner2Node = nodeById.get(pair.partner2Id);
        if (!partner1Node || !partner2Node) {
          return;
        }

        const pairColor = colorFromSeed(pair.key);
        const pairShadow = pairColor.replace('hsl(', 'hsla(').replace(')', ', 0.30)');
        const coupleY = Math.max(partner1Node.position.y, partner2Node.position.y) + NODE_HEIGHT + COUPLE_LINK_MARGIN;
        const center1X = partner1Node.position.x + NODE_WIDTH / 2;
        const center2X = partner2Node.position.x + NODE_WIDTH / 2;
        const midpointX = (center1X + center2X) / 2;
        const sourceBottomY = partner1Node.position.y + NODE_HEIGHT;
        const targetBottomY = partner2Node.position.y + NODE_HEIGHT;

        coupleYByPairKey.set(pair.key, coupleY);
        coupleMidXByPairKey.set(pair.key, midpointX);

        coupleEdges.push({
          id: `couple-${pair.key}`,
          source: pair.partner1Id,
          target: pair.partner2Id,
          type: 'coupleHorizontal',
          animated: false,
          style: {
            stroke: pairColor,
            strokeWidth: 3.2,
            opacity: 0.96,
            filter: `drop-shadow(0 0 5px ${pairShadow})`,
          },
          label: childrenByPair.has(pair.key) ? undefined : '⚭',
          labelStyle: {
            fontSize: 15,
            fontWeight: 700,
            fill: pairColor,
          },
          labelBgStyle: {
            fill: 'hsla(225, 24%, 12%, 0.88)',
            stroke: pairColor,
            strokeWidth: 1,
          },
          labelBgPadding: [4, 2],
          labelBgBorderRadius: 8,
          data: {
            unionType: pair.unionType,
            coupleY,
            sourceBottomY,
            targetBottomY,
          },
        });
      });

      const renderedChildEdges: Edge[] = [];
      const linkedChildrenFromPair = new Set<string>();

      relationships.forEach((rel) => {
        const parentIds = Array.from(new Set(parentsByChild.get(rel.childId) || []));

        if (parentIds.length === 2) {
          const pairKey = buildPairKey(parentIds[0], parentIds[1]);
          const pair = couplePairs.get(pairKey);
          const childLinkId = `${pairKey}|${rel.childId}`;

          const sourceCoupleY = coupleYByPairKey.get(pairKey);
          const sourceCoupleX = coupleMidXByPairKey.get(pairKey);

          if (
            pair
            && typeof sourceCoupleY === 'number'
            && typeof sourceCoupleX === 'number'
          ) {
            if (!linkedChildrenFromPair.has(childLinkId)) {
              linkedChildrenFromPair.add(childLinkId);
              const pairColor = colorFromSeed(pairKey);

              renderedChildEdges.push({
                id: `children-${pairKey}-${rel.childId}`,
                source: pair.partner1Id,
                target: rel.childId,
                type: 'orthogonalDescendant',
                animated: false,
                style: {
                  stroke: pairColor,
                  strokeWidth: 2.8,
                  opacity: 0.95,
                },
                data: {
                  sourceCoupleY,
                  sourceCoupleX,
                },
              });
            }

            // When a child is linked through a couple midpoint, skip direct parent->child fallback edges.
            return;
          }
        }

        renderedChildEdges.push({
          id: `relationship-${rel.id}`,
          source: rel.parentId,
          target: rel.childId,
          type: 'smoothstep',
          animated: false,
          style: {
            stroke: 'var(--color-border)',
            strokeWidth: 2,
            opacity: 0.84,
          },
        });
      });

      setNodes(layoutedNodes);
      setEdges([...coupleEdges, ...renderedChildEdges]);
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
  }, [selectedPersonId]);

  const quickZoomIn = useCallback(() => {
    const viewport = getViewport();
    const nextZoom = Math.min(2.5, viewport.zoom * 1.45);
    setViewport({ ...viewport, zoom: nextZoom }, { duration: 140 });
  }, [getViewport, setViewport]);

  const quickZoomOut = useCallback(() => {
    const viewport = getViewport();
    const nextZoom = Math.max(0.05, viewport.zoom * 0.72);
    setViewport({ ...viewport, zoom: nextZoom }, { duration: 140 });
  }, [getViewport, setViewport]);

  const zoomToGlobalView = useCallback(() => {
    fitView({ padding: 0.15, duration: 260 });
  }, [fitView]);

  const getExportElement = useCallback(() => {
    return treeCanvasRef.current?.querySelector('.react-flow') as HTMLElement | null;
  }, []);

  const exportVisibleAsPng = useCallback(async () => {
    const target = getExportElement();
    if (!target) {
      setActionError('Export visuel impossible: zone arbre introuvable.');
      return;
    }

    clearActionState();
    setExportBusy('PNG');

    try {
      const exportDateSuffix = buildExportDateSuffix();
      const dataUrl = await toPng(target, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#0f1420',
      });

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `origineo_arbre_${exportDateSuffix}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();

      setActionSuccess('Export PNG généré.');
    } catch (err: any) {
      setActionError(err.message || 'Impossible d\'exporter le visuel en PNG.');
    } finally {
      setExportBusy(null);
    }
  }, [clearActionState, getExportElement]);

  const exportVisibleAsPdf = useCallback(async () => {
    const target = getExportElement();
    if (!target) {
      setActionError('Export PDF impossible: zone arbre introuvable.');
      return;
    }

    clearActionState();
    setExportBusy('PDF');

    try {
      const exportDateSuffix = buildExportDateSuffix();
      const dataUrl = await toPng(target, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#0f1420',
      });

      const image = new Image();
      const imageLoaded = new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Image export invalid.'));
      });
      image.src = dataUrl;
      await imageLoaded;

      const orientation = image.width >= image.height ? 'landscape' : 'portrait';
      const pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const scale = Math.min(pageWidth / image.width, pageHeight / image.height);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      const offsetX = (pageWidth - drawWidth) / 2;
      const offsetY = (pageHeight - drawHeight) / 2;

      pdf.addImage(dataUrl, 'PNG', offsetX, offsetY, drawWidth, drawHeight);
      pdf.save(`origineo_arbre_${exportDateSuffix}.pdf`);

      setActionSuccess('Export PDF généré.');
    } catch (err: any) {
      setActionError(err.message || 'Impossible d\'exporter le visuel en PDF.');
    } finally {
      setExportBusy(null);
    }
  }, [clearActionState, getExportElement]);

  const exportVisibleTableCsv = useCallback(() => {
    if (nodes.length === 0) {
      setActionError('Aucune donnée visible à exporter.');
      return;
    }

    clearActionState();
    setExportBusy('CSV_VISIBLE');

    try {
      const exportDateSuffix = buildExportDateSuffix();
      const headers = [
        'id',
        'prenom_nom',
        'prenoms',
        'nom_usage',
        'nom_naissance',
        'genre',
        'date_naissance',
        'lieu_naissance',
        'generation',
      ];

      const lines = [headers.map(toCsvCell).join(';')];

      const rows = nodes
        .filter((node) => node.type === 'person')
        .map((node) => {
          const person = normalizePerson((node.data as any).person);
          const generation = (node.data as any).generation ?? 0;
          return {
            id: person.id,
            fullName: personDisplayName(person),
            givenNames: person.givenNames,
            usageSurname: person.usageSurname || '',
            birthSurname: person.birthSurname || '',
            gender: person.gender,
            birthDate: person.birthDate || '',
            birthPlace: person.birthPlace || '',
            generation,
          };
        })
        .sort((a, b) => {
          if (a.generation !== b.generation) return a.generation - b.generation;
          return a.fullName.localeCompare(b.fullName, 'fr');
        });

      for (const row of rows) {
        lines.push([
          row.id,
          row.fullName,
          row.givenNames,
          row.usageSurname,
          row.birthSurname,
          row.gender,
          row.birthDate,
          row.birthPlace,
          row.generation,
        ].map(toCsvCell).join(';'));
      }

      const csvContent = `\uFEFF${lines.join('\n')}`;
      downloadFile(
        `origineo_tableau_vue_${exportDateSuffix}.csv`,
        'text/csv;charset=utf-8',
        csvContent,
      );

      setActionSuccess('Tableau CSV (Excel) exporté pour la vue actuelle.');
    } catch (err: any) {
      setActionError(err.message || 'Impossible d\'exporter le tableau CSV.');
    } finally {
      setExportBusy(null);
    }
  }, [clearActionState, nodes]);

  const exportSelectedBranchCsv = useCallback(async () => {
    const branchRootId = selectedPersonId || rootPersonId;
    if (!branchRootId) {
      setActionError('Sélectionnez une personne pour exporter une branche.');
      return;
    }

    const askAncestors = window.prompt(
      'Nombre de générations d\'ancêtres à exporter pour cette branche :',
      String(ancestorGens),
    );
    if (askAncestors === null) return;

    const askDescendants = window.prompt(
      'Nombre de générations de descendants à exporter pour cette branche :',
      String(descendantGens),
    );
    if (askDescendants === null) return;

    const parsedAncestors = Number.parseInt(askAncestors, 10);
    const parsedDescendants = Number.parseInt(askDescendants, 10);

    if (
      Number.isNaN(parsedAncestors)
      || Number.isNaN(parsedDescendants)
      || parsedAncestors < 0
      || parsedDescendants < 0
    ) {
      setActionError('Valeurs invalides: utilisez des nombres entiers >= 0.');
      return;
    }

    clearActionState();
    setExportBusy('CSV_BRANCH');

    try {
      const exportDateSuffix = buildExportDateSuffix();
      const result = await treeApi.getTree(branchRootId, parsedAncestors, parsedDescendants);
      const branchNodes = result.data?.nodes || [];

      const headers = [
        'id',
        'prenom_nom',
        'prenoms',
        'nom_usage',
        'nom_naissance',
        'genre',
        'date_naissance',
        'lieu_naissance',
        'generation',
        'parents_count',
        'children_count',
      ];
      const lines = [headers.map(toCsvCell).join(';')];

      const rows = branchNodes
        .map((item: any) => {
          const person = normalizePerson(item.person);
          return {
            id: person.id,
            fullName: personDisplayName(person),
            givenNames: person.givenNames,
            usageSurname: person.usageSurname || '',
            birthSurname: person.birthSurname || '',
            gender: person.gender,
            birthDate: person.birthDate || '',
            birthPlace: person.birthPlace || '',
            generation: item.generation ?? 0,
            parentsCount: Array.isArray(item.parents) ? item.parents.length : 0,
            childrenCount: Array.isArray(item.children) ? item.children.length : 0,
          };
        })
        .sort((a: any, b: any) => {
          if (a.generation !== b.generation) return a.generation - b.generation;
          return a.fullName.localeCompare(b.fullName, 'fr');
        });

      for (const row of rows) {
        lines.push([
          row.id,
          row.fullName,
          row.givenNames,
          row.usageSurname,
          row.birthSurname,
          row.gender,
          row.birthDate,
          row.birthPlace,
          row.generation,
          row.parentsCount,
          row.childrenCount,
        ].map(toCsvCell).join(';'));
      }

      const csvContent = `\uFEFF${lines.join('\n')}`;
      downloadFile(
        `origineo_tableau_branche_${shortId(branchRootId)}_${exportDateSuffix}.csv`,
        'text/csv;charset=utf-8',
        csvContent,
      );

      setActionSuccess('Tableau CSV (Excel) exporté pour la branche sélectionnée.');
    } catch (err: any) {
      setActionError(err.message || 'Impossible d\'exporter la branche en CSV.');
    } finally {
      setExportBusy(null);
    }
  }, [
    ancestorGens,
    clearActionState,
    descendantGens,
    rootPersonId,
    selectedPersonId,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = Boolean(
        target && (
          target.tagName === 'INPUT'
          || target.tagName === 'TEXTAREA'
          || target.tagName === 'SELECT'
          || target.isContentEditable
        ),
      );

      if (isTyping) return;

      const key = event.key.toLowerCase();

      if (key === 'f') {
        event.preventDefault();
        focusOnSelected();
      }

      if (key === 'w') {
        event.preventDefault();
        setWideTreeMode((value) => !value);
      }

      if (key === 'm') {
        event.preventDefault();
        setMenusCompact((value) => !value);
      }

      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        quickZoomIn();
      }

      if (event.key === '-') {
        event.preventDefault();
        quickZoomOut();
      }

      if (key === 'g') {
        event.preventDefault();
        zoomToGlobalView();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusOnSelected, quickZoomIn, quickZoomOut, zoomToGlobalView]);

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

  const refreshAfterStructuralMutation = useCallback(async () => {
    let nextRootId: string | null = null;
    let fallbackWarning: string | null = null;

    const rootResult = await personApi.getRoot();
    if (rootResult.data?.id) {
      nextRootId = rootResult.data.id;
    } else {
      const firstPersonResult = await personApi.getAll(1, 1);
      const fallbackPerson = firstPersonResult.data?.data?.[0];
      if (fallbackPerson?.id) {
        nextRootId = fallbackPerson.id;
        fallbackWarning = 'Aucune racine par défaut: affichage centré sur la première personne disponible.';
      }
    }

    if (!nextRootId) {
      setRootPersonId(null);
      setSelectedPersonId(null);
      setNodes([]);
      setEdges([]);
      setNodeCount(0);
      setWarning(null);
      setError('Aucune personne disponible. Créez la première personne directement depuis cette page.');
      return;
    }

    setError(null);
    setWarning(fallbackWarning);
    setSelectedPersonId(nextRootId);

    if (rootPersonId !== nextRootId) {
      setRootPersonId(nextRootId);
      return;
    }

    await loadTree();
  }, [loadTree, rootPersonId, setEdges, setNodes]);

  const deleteSelectedPerson = useCallback(async () => {
    if (!selectedPersonId || !ensureAdminSession() || !token) return;

    const label = selectedPersonName || `Personne ${shortId(selectedPersonId)}`;
    if (!window.confirm(`Supprimer la personne "${label}" ?`)) {
      return;
    }

    clearActionState();
    setActionBusy(true);

    try {
      await personApi.delete(selectedPersonId, token);
      await refreshAfterStructuralMutation();
      setActionSuccess('Personne supprimée avec succès.');
    } catch (err: any) {
      setActionError(err.message || 'Impossible de supprimer cette personne.');
    } finally {
      setActionBusy(false);
    }
  }, [
    selectedPersonId,
    ensureAdminSession,
    token,
    selectedPersonName,
    clearActionState,
    refreshAfterStructuralMutation,
  ]);

  const deleteSelectedBranch = useCallback(async () => {
    if (!selectedPersonId || !ensureAdminSession() || !token) return;

    const label = selectedPersonName || `Personne ${shortId(selectedPersonId)}`;
    if (!window.confirm(`Supprimer la branche de "${label}" (personne + descendants) ?`)) {
      return;
    }

    clearActionState();
    setActionBusy(true);

    try {
      const result = await personApi.deleteBranch(selectedPersonId, token, true);
      const stats = result.data || {};
      await refreshAfterStructuralMutation();
      setActionSuccess(
        `Branche supprimée: ${stats.personsDeleted || 0} personnes, ${stats.relationshipsDeleted || 0} relations, ${stats.unionsDeleted || 0} unions.`,
      );
    } catch (err: any) {
      setActionError(err.message || 'Impossible de supprimer cette branche.');
    } finally {
      setActionBusy(false);
    }
  }, [
    selectedPersonId,
    ensureAdminSession,
    token,
    selectedPersonName,
    clearActionState,
    refreshAfterStructuralMutation,
  ]);

  const createStandalonePerson = useCallback(async () => {
    if (!ensureAdminSession() || !token) return;

    const payload = {
      givenNames: standalonePersonForm.givenNames.trim(),
      usageSurname: standalonePersonForm.usageSurname.trim() || undefined,
      birthSurname: standalonePersonForm.birthSurname.trim() || undefined,
      gender: standalonePersonForm.gender,
      birthDate: standalonePersonForm.birthDate || undefined,
      birthPlace: standalonePersonForm.birthPlace.trim() || undefined,
      isRootDefault: standalonePersonForm.isRootDefault,
    };

    if (!payload.givenNames) {
      setActionError('Le champ "Prénoms" est obligatoire.');
      return;
    }

    clearActionState();
    setStandaloneCreateBusy(true);
    try {
      const createdResult = await personApi.create(payload, token);
      const createdPerson = normalizePerson(createdResult.data);
      setRootPersonId(createdPerson.id);
      setSelectedPersonId(createdPerson.id);
      setFocusQuery(personDisplayName(createdPerson));
      setShowFocusResults(false);
      setError(null);
      setWarning(null);
      setActionSuccess('Personne créée depuis l\'accueil. Vous pouvez maintenant lier sa famille.');
      setShowStandaloneCreate(false);
      resetStandalonePersonForm(false);
    } catch (err: any) {
      setActionError(err.message || 'Impossible de créer la personne.');
    } finally {
      setStandaloneCreateBusy(false);
    }
  }, [
    ensureAdminSession,
    token,
    standalonePersonForm,
    clearActionState,
    resetStandalonePersonForm,
  ]);

  const createAndAttachNewPerson = useCallback(async () => {
    if (linkTarget !== 'standalone' && !selectedPersonId) {
      setActionError('Sélectionnez d\'abord une personne dans l\'arbre, ou utilisez le mode "personne indépendante".');
      return;
    }

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

    if (linkTarget === 'standalone') {
      const executed = await runWithHistory('Créer une personne indépendante', operations);
      if (!executed) return;

      const createdPerson = executed.find((op) => op.opId === newPersonOpId)?.createdId;
      if (createdPerson) {
        setSelectedPersonId(createdPerson);
        if (!rootPersonId) {
          setRootPersonId(createdPerson);
        }
      }

      setActionSuccess('Personne créée avec succès.');
      resetNewPersonForm();
      return;
    }

    const linkOperation = buildLinkOperation(
      makeOperationId('link-new'),
      `@${newPersonOpId}`,
    );

    if (!linkOperation) return;
    operations.push(linkOperation);

    let actionLabel = selectedPersonLabel;

    if (linkMode === 'CHILD') {
      const childPlan = buildChildCoParentOperations(`@${newPersonOpId}`);
      if (childPlan.operations.length > 0) {
        operations.push(...childPlan.operations);
        actionLabel = `${selectedPersonLabel}${childPlan.actionSuffix}`;
      }
    }

    if (linkMode === 'PARENT') {
      const parentUnionOperation = buildParentUnionOperation(`@${newPersonOpId}`);
      if (parentUnionOperation) {
        operations.push(parentUnionOperation);
        actionLabel = 'Ajouter un parent + union parentale';
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
    linkTarget,
    selectedPersonId,
    rootPersonId,
    toNewPersonPayload,
    makeOperationId,
    buildLinkOperation,
    buildChildCoParentOperations,
    buildParentUnionOperation,
    runWithHistory,
    linkMode,
    linkVerb,
    selectedPersonLabel,
    resetNewPersonForm,
    setRootPersonId,
    setActionError,
  ]);

  const linkExistingPerson = useCallback(async (personId: string) => {
    if (!selectedPersonId) {
      setActionError('Sélectionnez une personne source avant de lier une personne existante.');
      return;
    }

    if (linkMode === 'CHILD' && selectedChildUnion && personId === selectedChildUnion.partnerId) {
      setActionError(
        'Cette personne est déjà le co-parent de l\'union sélectionnée. Choisissez un autre enfant.',
      );
      return;
    }

    const operation = buildLinkOperation(
      makeOperationId('link-existing'),
      personId,
    );
    if (!operation) return;

    const operations: HistoryOperation[] = [operation];
    let actionLabel = selectedPersonLabel;

    if (linkMode === 'CHILD') {
      const childPlan = buildChildCoParentOperations(personId);
      if (childPlan.operations.length > 0) {
        operations.push(...childPlan.operations);
        actionLabel = `${selectedPersonLabel}${childPlan.actionSuffix}`;
      }
    }

    if (linkMode === 'PARENT') {
      const parentUnionOperation = buildParentUnionOperation(personId);
      if (parentUnionOperation) {
        operations.push(parentUnionOperation);
        actionLabel = 'Ajouter un parent + union parentale';
      }
    }

    const executed = await runWithHistory(actionLabel, operations);
    if (!executed) return;

    setActionSuccess(`${linkVerb} avec succès.`);
    setSelectedPersonId(personId);
  }, [
    selectedPersonId,
    buildLinkOperation,
    makeOperationId,
    buildChildCoParentOperations,
    buildParentUnionOperation,
    runWithHistory,
    linkMode,
    selectedChildUnion,
    selectedPersonLabel,
    linkVerb,
    setActionError,
  ]);

  const handleNodeQuickAction = useCallback(async (
    anchorPersonId: string,
    action: NodeQuickAction,
    preferredGender?: QuickAddGender,
  ) => {
    if (!anchorPersonId) return;
    if (!ensureAdminSession() || !token) return;

    clearActionState();
    setSidePanelTab('EDIT');
    setLinkTarget('new');
    setSelectedPersonId(anchorPersonId);

    const anchorPerson = treePersonById[anchorPersonId];
    const defaultSurname =
      anchorPerson?.birthSurname ||
      anchorPerson?.usageSurname ||
      undefined;

    const newPersonOpId = makeOperationId('card-quick-person');
    const defaultGender: QuickAddGender =
      action === 'ADD_FATHER'
        ? 'MALE'
        : action === 'ADD_MOTHER'
          ? 'FEMALE'
          : 'UNKNOWN';

    const operations: HistoryOperation[] = [
      {
        opId: newPersonOpId,
        kind: 'person',
        payload: {
          givenNames:
            action === 'ADD_FATHER'
              ? 'Pere a completer'
              : action === 'ADD_MOTHER'
                ? 'Mere a completer'
                : action === 'ADD_CHILD'
                  ? 'Enfant a completer'
                  : 'Conjoint a completer',
          usageSurname: defaultSurname,
          birthSurname: defaultSurname,
          birthPlace: anchorPerson?.birthPlace || undefined,
          gender: preferredGender ?? defaultGender,
        },
      },
    ];

    if (action === 'ADD_CHILD') {
      operations.push({
        opId: makeOperationId('card-quick-child-link'),
        kind: 'relationship',
        payload: {
          parentId: anchorPersonId,
          childId: `@${newPersonOpId}`,
          type: relationshipType,
        },
      });
    } else if (action === 'ADD_SPOUSE') {
      operations.push({
        opId: makeOperationId('card-quick-spouse-link'),
        kind: 'union',
        payload: {
          partner1Id: anchorPersonId,
          partner2Id: `@${newPersonOpId}`,
          type: unionType,
        },
      });
    } else {
      operations.push({
        opId: makeOperationId('card-quick-parent-link'),
        kind: 'relationship',
        payload: {
          parentId: `@${newPersonOpId}`,
          childId: anchorPersonId,
          type: relationshipType,
        },
      });
    }

    const actionLabel =
      action === 'ADD_FATHER'
        ? 'Ajout rapide pere'
        : action === 'ADD_MOTHER'
          ? 'Ajout rapide mere'
          : action === 'ADD_SPOUSE'
            ? 'Ajout rapide conjoint'
            : 'Ajout rapide enfant';

    const executed = await runWithHistory(actionLabel, operations);
    if (!executed) return;

    const createdPerson = executed.find((operation) => operation.opId === newPersonOpId)?.createdId;
    if (createdPerson) {
      setSelectedPersonId(createdPerson);
    }

    setActionSuccess(
      action === 'ADD_FATHER'
        ? 'Pere ajoute depuis la carte.'
        : action === 'ADD_MOTHER'
          ? 'Mere ajoutee depuis la carte.'
          : action === 'ADD_SPOUSE'
            ? 'Conjoint ajoute depuis la carte.'
            : 'Enfant ajoute depuis la carte.',
    );
  }, [
    clearActionState,
    ensureAdminSession,
    makeOperationId,
    relationshipType,
    runWithHistory,
    token,
    treePersonById,
    unionType,
  ]);

  useEffect(() => {
    setNodes((prevNodes) => {
      let changed = false;

      const nextNodes = prevNodes.map((node) => {
        if (node.type !== 'person') {
          return node;
        }

        const nodeData = (node.data || {}) as any;

        if (
          nodeData.isEditMode === isNodeEditMode
          && nodeData.onQuickAdd === handleNodeQuickAction
        ) {
          return node;
        }

        changed = true;

        return {
          ...node,
          data: {
            ...nodeData,
            isEditMode: isNodeEditMode,
            onQuickAdd: handleNodeQuickAction,
          },
        };
      });

      return changed ? nextNodes : prevNodes;
    });
  }, [handleNodeQuickAction, isNodeEditMode, setNodes]);

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

  const onWorkspaceMouseMove = useCallback(() => {
    // Left workspace menu is manually shown/hidden by the user.
  }, []);

  const onToolbarEnter = useCallback(() => {
    if (presentationMode) return;
  }, [presentationMode]);

  const onToolbarLeave = useCallback(() => {
    if (presentationMode) return;
  }, [presentationMode]);

  const overlayTopOffset = 'var(--space-3)';

  return (
    <div
      style={{
        height: '100vh',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{ height: '100vh', display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}
      >
        {/* ─── Left Settings Panel ──────────────────── */}
        <TreeSettingsPanel
          visible={controlsVisible}
          onClose={() => setControlsVisible(false)}
          ancestorGens={ancestorGens}
          descendantGens={descendantGens}
          onAncestorGensChange={setAncestorGens}
          onDescendantGensChange={setDescendantGens}
          focusModeEnabled={focusModeEnabled}
          onFocusModeChange={setFocusModeEnabled}
          dragLinkType={dragLinkType}
          onDragLinkTypeChange={(v) => setDragLinkType(v as DragLinkType)}
          relationshipType={relationshipType}
          onRelationshipTypeChange={setRelationshipType}
          unionType={unionType}
          onUnionTypeChange={setUnionType}
          onZoomIn={quickZoomIn}
          onZoomOut={quickZoomOut}
          onZoomFit={zoomToGlobalView}
          onFocusSelected={focusOnSelected}
          onChangeRoot={(p) => { setRootPersonId(p.id); setSelectedPersonId(p.id); }}
          selectedPersonId={selectedPersonId}
          isAdmin={isAdmin}
          nodeCount={nodeCount}
          onSetDefaultRoot={setCurrentAsDefaultRoot}
          onOpenStandaloneCreate={openStandaloneCreate}
          actionBusy={actionBusy}
          onExportPng={exportVisibleAsPng}
          onExportPdf={exportVisibleAsPdf}
          onExportCsvVisible={exportVisibleTableCsv}
          onExportCsvBranch={exportSelectedBranchCsv}
          exportBusy={exportBusy}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undoLastAction}
          onRedo={redoLastAction}
          presentationMode={presentationMode}
          onTogglePresentation={() => setPresentationMode(!presentationMode)}
          error={error}
          onRetry={loadTree}
        />

        {!presentationMode && !controlsVisible && (
          <button
            className="btn btn-primary"
            style={{
              position: 'absolute',
              top: 'var(--space-3)',
              left: 'var(--space-3)',
              zIndex: 16,
            }}
            onClick={() => setControlsVisible(true)}
          >
            🌳 Menu
          </button>
        )}

        {/* ─── Tree Canvas ───────────────────── */}
        <div ref={treeCanvasRef} style={{ flex: 1, position: 'relative' }}>
          {warning && !error && (
            <div style={{
              position: 'absolute',
              top: overlayTopOffset,
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
            top: overlayTopOffset,
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
                {authChecked && isAdmin && (
                  <button className="btn btn-primary" onClick={openStandaloneCreate}>
                    Créer la première personne
                  </button>
                )}
                {(!authChecked || !isAdmin) && (
                  <a href="/admin" className="btn btn-primary">
                    Accéder au panneau Admin
                  </a>
                )}
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
            edgeTypes={edgeTypes}
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
            {!presentationMode && (
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
            )}
          </ReactFlow>
        )}

        {presentationMode && (
          <button
            className="btn btn-ghost"
            style={{
              position: 'absolute',
              top: 'var(--space-3)',
              right: 'var(--space-3)',
              zIndex: 16,
              background: 'var(--color-surface-glass)',
              backdropFilter: 'blur(10px)',
            }}
            onClick={() => setPresentationMode(false)}
          >
            Quitter présentation
          </button>
        )}

        {showStandaloneCreate && isAdmin && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 20,
              background: 'hsla(228, 20%, 7%, 0.72)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--space-4)',
            }}
            onClick={closeStandaloneCreate}
          >
            <div
              className="glass-card animate-fade-in-up"
              style={{
                width: 'min(620px, 100%)',
                maxHeight: 'min(88vh, 760px)',
                overflowY: 'auto',
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                <div>
                  <h3 style={{ marginBottom: 'var(--space-1)' }}>Créer une personne depuis l&apos;accueil</h3>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                    Démarrez l&apos;arbre ici, puis ajoutez parents, enfants, unions et co-parents depuis le panneau de sélection.
                  </p>
                </div>
                <button className="btn btn-ghost" onClick={closeStandaloneCreate}>Fermer</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
                <div className="input-group">
                  <label className="input-label">Prénoms *</label>
                  <input
                    className="input"
                    value={standalonePersonForm.givenNames}
                    onChange={(e) => setStandalonePersonForm((prev) => ({ ...prev, givenNames: e.target.value }))}
                    placeholder="Ex: Marie Claire"
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">Genre</label>
                  <select
                    className="input"
                    value={standalonePersonForm.gender}
                    onChange={(e) => setStandalonePersonForm((prev) => ({ ...prev, gender: e.target.value }))}
                  >
                    <option value="UNKNOWN">Inconnu</option>
                    <option value="MALE">Homme</option>
                    <option value="FEMALE">Femme</option>
                    <option value="OTHER">Autre</option>
                  </select>
                </div>

                <div className="input-group">
                  <label className="input-label">Nom d&apos;usage</label>
                  <input
                    className="input"
                    value={standalonePersonForm.usageSurname}
                    onChange={(e) => setStandalonePersonForm((prev) => ({ ...prev, usageSurname: e.target.value }))}
                    placeholder="Ex: Martin"
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">Nom de naissance</label>
                  <input
                    className="input"
                    value={standalonePersonForm.birthSurname}
                    onChange={(e) => setStandalonePersonForm((prev) => ({ ...prev, birthSurname: e.target.value }))}
                    placeholder="Ex: Dupont"
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">Date de naissance</label>
                  <input
                    className="input"
                    type="date"
                    value={standalonePersonForm.birthDate}
                    onChange={(e) => setStandalonePersonForm((prev) => ({ ...prev, birthDate: e.target.value }))}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">Lieu de naissance</label>
                  <input
                    className="input"
                    value={standalonePersonForm.birthPlace}
                    onChange={(e) => setStandalonePersonForm((prev) => ({ ...prev, birthPlace: e.target.value }))}
                    placeholder="Ex: Nantes"
                  />
                </div>
              </div>

              <label
                style={{
                  marginTop: 'var(--space-4)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                <input
                  type="checkbox"
                  checked={standalonePersonForm.isRootDefault}
                  onChange={(e) => setStandalonePersonForm((prev) => ({ ...prev, isRootDefault: e.target.checked }))}
                />
                Définir cette personne comme racine par défaut
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-5)' }}>
                <button className="btn btn-ghost" onClick={closeStandaloneCreate} disabled={standaloneCreateBusy}>
                  Annuler
                </button>
                <button className="btn btn-primary" onClick={createStandalonePerson} disabled={standaloneCreateBusy}>
                  {standaloneCreateBusy ? 'Création...' : 'Créer la personne'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      </div>

      {/* ─── Interactive Side Panel ────────────────── */}
      {showSelectionPanel && selectedPerson && (
        <TreePersonPanel
          person={selectedPerson}
          personId={selectedPersonId}
          isAdmin={isAdmin}
          onClose={() => setSelectedPersonId(null)}
          onCenterOnPerson={focusOnSelected}
          onPersonUpdated={loadTree}
          token={token}
        />
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
