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
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { treeApi, personApi } from '@/lib/api';
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

// ─── Inner Flow (needs ReactFlowProvider) ───
function TreeFlow() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [rootPersonId, setRootPersonId] = useState<string | null>(null);
  const [ancestorGens, setAncestorGens] = useState(4);
  const [descendantGens, setDescendantGens] = useState(2);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nodeCount, setNodeCount] = useState(0);
  const { fitView } = useReactFlow();
  const abortRef = useRef<AbortController | null>(null);

  // Load root person on mount
  useEffect(() => {
    async function loadRoot() {
      try {
        const result = await personApi.getRoot();
        if (result.data) {
          setRootPersonId(result.data.id);
        } else {
          setError('Aucune personne racine définie. Ajoutez une personne et définissez-la comme racine.');
          setLoading(false);
        }
      } catch {
        setError('Impossible de contacter l\'API. Vérifiez que le serveur est en cours d\'exécution.');
        setLoading(false);
      }
    }
    loadRoot();
  }, []);

  // Load tree data when root or depth changes
  const loadTree = useCallback(async () => {
    if (!rootPersonId) return;

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
      const result = await treeApi.getTree(rootPersonId, ancestorGens, descendantGens);
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

      // Convert to React Flow edges with styled connections
      const flowEdges: Edge[] = treeData.relationships.map((rel: any) => ({
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

      // Apply dagre layout
      const { nodes: layoutedNodes, edges: layoutedEdges } =
        getLayoutedElements(flowNodes, flowEdges);

      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
      setNodeCount(layoutedNodes.length);

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
  }, [rootPersonId, ancestorGens, descendantGens, fitView, setNodes, setEdges]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  // Click on node → navigate to person page
  const onNodeClick = useCallback((_: any, node: Node) => {
    window.location.href = `/person/${node.id}`;
  }, []);

  // Double click on node → set as new tree root
  const onNodeDoubleClick = useCallback((_: any, node: Node) => {
    setRootPersonId(node.id);
  }, []);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
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
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
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
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
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
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          {/* Retry button */}
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
          }

          .tree-controls select {
            background: var(--color-bg-tertiary);
          }
        `}</style>
      </div>

      {/* ─── Tree Canvas ───────────────────── */}
      <div style={{ flex: 1, position: 'relative' }}>
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
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="hsla(225, 15%, 25%, 0.3)" />
            <Controls position="bottom-left" />
            <MiniMap
              position="bottom-right"
              nodeColor={(node) => {
                const gender = node.data?.person?.gender;
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
            Clic → détail · Double-clic → recentrer · Molette → zoom
          </div>
        )}
      </div>
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
