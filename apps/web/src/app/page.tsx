'use client';

// ══════════════════════════════════════
// Origineo — Home / Tree Page
// ══════════════════════════════════════

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { treeApi, personApi } from '@/lib/api';
import PersonNode from '@/components/tree/PersonNode';

const NODE_WIDTH = 220;
const NODE_HEIGHT = 100;

// ─── Dagre Layout ───────────────────────────
function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction = 'TB',
) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 80, ranksep: 120 });

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

export default function HomePage() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [rootPersonId, setRootPersonId] = useState<string | null>(null);
  const [ancestorGens, setAncestorGens] = useState(4);
  const [descendantGens, setDescendantGens] = useState(2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      } catch (err) {
        setError('Impossible de contacter l\'API. Vérifiez que le serveur est en cours d\'exécution.');
        setLoading(false);
      }
    }
    loadRoot();
  }, []);

  // Load tree data when root or depth changes
  useEffect(() => {
    if (!rootPersonId) return;

    async function loadTree() {
      setLoading(true);
      setError(null);
      try {
        const result = await treeApi.getTree(rootPersonId!, ancestorGens, descendantGens);
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

        // Convert to React Flow edges
        const flowEdges: Edge[] = treeData.relationships.map((rel: any) => ({
          id: rel.id,
          source: rel.parentId,
          target: rel.childId,
          type: 'smoothstep',
          animated: false,
          style: { stroke: 'var(--color-border)', strokeWidth: 2 },
        }));

        // Apply dagre layout
        const { nodes: layoutedNodes, edges: layoutedEdges } =
          getLayoutedElements(flowNodes, flowEdges);

        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
      } catch (err: any) {
        setError(err.message || 'Erreur lors du chargement de l\'arbre');
      } finally {
        setLoading(false);
      }
    }

    loadTree();
  }, [rootPersonId, ancestorGens, descendantGens]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* ─── Controls Bar ──────────────────── */}
      <div className="tree-controls" id="tree-controls-bar">
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>
          🌳 Arbre Généalogique
        </h1>

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
        </div>

        <style>{`
          .tree-controls {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: var(--space-4) var(--space-6);
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
            <div style={{ textAlign: 'center' }}>
              <div className="spinner spinner-lg" style={{ margin: '0 auto var(--space-4)' }} />
              <p style={{ color: 'var(--color-text-secondary)' }}>Chargement de l&apos;arbre...</p>
            </div>
          </div>
        )}

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
            <div className="glass-card" style={{ maxWidth: 500, textAlign: 'center' }}>
              <h3 style={{ marginBottom: 'var(--space-4)', color: 'var(--color-amber)' }}>
                ⚠️ Arbre non disponible
              </h3>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)' }}>
                {error}
              </p>
              <a href="/admin" className="btn btn-primary">
                Accéder au panneau Admin
              </a>
            </div>
          </div>
        )}

        {!loading && !error && (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.1}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="hsla(225, 15%, 25%, 0.3)" />
            <Controls />
            <MiniMap
              nodeColor={(node) => {
                const gender = node.data?.person?.gender;
                if (gender === 'MALE') return 'var(--color-male)';
                if (gender === 'FEMALE') return 'var(--color-female)';
                return 'var(--color-text-tertiary)';
              }}
              maskColor="hsla(225, 25%, 5%, 0.7)"
            />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
