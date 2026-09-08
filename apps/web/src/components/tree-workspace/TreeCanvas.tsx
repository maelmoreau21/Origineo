'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { layoutFamilyTree } from '@/lib/family-layout';
import {
  centerViewOnPoint,
  fitViewToBounds,
  zoomViewAroundViewportCenter,
} from './canvas-view';
import { useTreeWorkspaceMode } from './TreeWorkspaceContext';
import styles from './TreeWorkspace.module.css';
import { formatLife, personLabel, TreeWindow } from './types';

type Props = {
  tree: TreeWindow | null;
  rootPersonId: string | null;
  selectedPersonId: string | null;
  onSelectPerson: (personId: string) => void;
  onFocusPerson: (personId: string) => void | Promise<void>;
  onRequestAddRelative: (personId: string) => void;
};

export default function TreeCanvas({
  tree,
  rootPersonId,
  selectedPersonId,
  onSelectPerson,
  onFocusPerson,
  onRequestAddRelative,
}: Props) {
  const { isReadOnly } = useTreeWorkspaceMode();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 0.9 });
  const dragRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(
    null,
  );
  const lastAutoCenteredRef = useRef<string | null>(null);

  const layout = useMemo(() => {
    if (!tree || !rootPersonId) return null;
    return layoutFamilyTree(tree as any, rootPersonId);
  }, [tree, rootPersonId]);

  const contentWidth = layout?.width || 0;
  const contentHeight = layout?.height || 0;
  const offsetX = layout ? -layout.minX : 0;
  const offsetY = layout ? -layout.minY : 0;

  const viewportSize = useCallback(() => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return {
      width: rect?.width || 1000,
      height: rect?.height || 720,
    };
  }, []);

  const centerOnPerson = useCallback(
    (personId?: string | null, scale = view.scale) => {
      if (!layout || !personId) return;
      const target = layout.nodes.find((node) => node.id === personId);
      if (!target) return;
      setView(
        centerViewOnPoint(
          {
            x: target.cx + offsetX,
            y: target.cy + offsetY,
          },
          viewportSize(),
          scale,
        ),
      );
    },
    [layout, offsetX, offsetY, view.scale, viewportSize],
  );

  const fitTree = useCallback(() => {
    if (!layout) return;
    setView(
      fitViewToBounds(
        { width: contentWidth, height: contentHeight },
        viewportSize(),
        { padding: 96 },
      ),
    );
  }, [contentHeight, contentWidth, layout, viewportSize]);

  useEffect(() => {
    if (!layout || !selectedPersonId) return;
    const token = `${rootPersonId}:${layout.nodes.length}:${layout.width}:${layout.height}`;
    if (lastAutoCenteredRef.current === token) return;
    lastAutoCenteredRef.current = token;
    centerOnPerson(selectedPersonId, 0.92);
  }, [centerOnPerson, layout, rootPersonId, selectedPersonId]);

  useEffect(() => {
    if (!layout) return;
    const handleResize = () => centerOnPerson(selectedPersonId, view.scale);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [centerOnPerson, layout, selectedPersonId, view.scale]);

  function zoomBy(delta: number) {
    setView(
      zoomViewAroundViewportCenter(view, viewportSize(), view.scale + delta),
    );
  }

  if (!tree || !layout) {
    return (
      <section className={`${styles.canvasPane} ${isReadOnly ? styles.canvasPaneReadOnly : ''}`}>
        <div className={styles.emptyState}>
          <div>
            <strong>Aucun arbre charge</strong>
            <p>
              Importez un GEDCOM pour creer l arbre, ou choisissez une personne
              avec la recherche.
            </p>
            {!isReadOnly ? (
              <div className={styles.emptyActions}>
                <a className={`${styles.button} ${styles.primaryButton}`} href="/tree-settings?tab=gedcom">
                  Gestion GEDCOM
                </a>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className={`${styles.canvasPane} ${isReadOnly ? styles.canvasPaneReadOnly : ''}`}>
      <div
        ref={viewportRef}
        className={styles.canvasViewport}
        onWheel={(event) => {
          event.preventDefault();
          zoomBy(event.deltaY > 0 ? -0.08 : 0.08);
        }}
        onPointerDown={(event) => {
          const target = event.target as HTMLElement;
          if (
            target.closest('[data-person-card="true"]') ||
            target.closest('[data-canvas-control="true"]')
          ) {
            return;
          }

          (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
          dragRef.current = {
            x: event.clientX,
            y: event.clientY,
            vx: view.x,
            vy: view.y,
          };
        }}
        onPointerMove={(event) => {
          if (!dragRef.current) return;
          const nextX = dragRef.current.vx + event.clientX - dragRef.current.x;
          const nextY = dragRef.current.vy + event.clientY - dragRef.current.y;
          setView((current) => ({ ...current, x: nextX, y: nextY }));
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
      >
        <div
          className={styles.canvasContent}
          style={{
            width: contentWidth,
            height: contentHeight,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          }}
        >
          <svg
            className={styles.linkLayer}
            width={contentWidth}
            height={contentHeight}
            viewBox={`0 0 ${contentWidth} ${contentHeight}`}
          >
            <g transform={`translate(${offsetX} ${offsetY})`}>
              {layout.links.map((link) => (
                <path
                  key={link.id}
                  className={
                    link.type === 'spouse'
                      ? styles.linkSpouse
                      : link.type === 'single-parent'
                        ? styles.linkSingle
                        : styles.linkParent
                  }
                  d={link.path}
                />
              ))}
            </g>
          </svg>

          {layout.nodes.map((node) => {
            const person = node.datum.data.person as any;
            const selected = selectedPersonId === node.id;
            return (
              <div
                key={node.tid}
                data-person-card="true"
                role="button"
                tabIndex={0}
                className={[
                  styles.personCard,
                  selected ? styles.personCardSelected : '',
                  person.gender === 'MALE'
                    ? styles.personMale
                    : person.gender === 'FEMALE'
                      ? styles.personFemale
                      : styles.personOther,
                ].join(' ')}
                style={{
                  left: node.x + offsetX,
                  top: node.y + offsetY,
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectPerson(node.id);
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  onSelectPerson(node.id);
                  void onFocusPerson(node.id);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  event.stopPropagation();
                  onSelectPerson(node.id);
                }}
                title="Double clic pour centrer l'arbre"
              >
                {!isReadOnly ? (
                  <button
                    type="button"
                    className={styles.personAddButton}
                    title="Ajouter un proche"
                    aria-label="Ajouter un proche"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectPerson(node.id);
                      onRequestAddRelative(node.id);
                    }}
                  >
                    +
                  </button>
                ) : null}
                <div className={styles.personName}>{personLabel(person)}</div>
                <div className={styles.personMeta}>
                  {formatLife(person)}
                  {person.birthPlace ? ` - ${person.birthPlace}` : ''}
                </div>
                <div className={styles.personTags}>
                  <span className={styles.tag}>Gen {node.generation}</span>
                  <span className={styles.tag}>
                    {(node.datum.rels.parents || []).length} parents
                  </span>
                  <span className={styles.tag}>
                    {(node.datum.rels.children || []).length} enfants
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Minimal Floating Status Badge (Bottom-Left) */}
        <div className={styles.modernCanvasStatus}>
          <span className={styles.modernStatusPill}>
            {tree.stats?.visiblePersons || tree.nodes.length} personnes • {tree.unions.length} unions
            {tree.stats?.truncated ? ` (limité à ${tree.stats.limit})` : ''}
          </span>
        </div>

        {/* Floating Zoom & Navigation Dock (Bottom-Right) */}
        <div className={styles.modernZoomDock} data-canvas-control="true">
          <button
            type="button"
            className={styles.dockIconButton}
            data-canvas-control="true"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              zoomBy(-0.15);
            }}
            title="Zoom arrière (Molette bas)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          <button
            type="button"
            className={styles.dockZoomValue}
            data-canvas-control="true"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              centerOnPerson(selectedPersonId || rootPersonId, 1.0);
            }}
            title="Réinitialiser le zoom à 100%"
          >
            {Math.round(view.scale * 100)}%
          </button>

          <button
            type="button"
            className={styles.dockIconButton}
            data-canvas-control="true"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              zoomBy(0.15);
            }}
            title="Zoom avant (Molette haut)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          <div className={styles.dockDivider} />

          <button
            type="button"
            className={styles.dockActionButton}
            data-canvas-control="true"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              fitTree();
            }}
            title="Ajuster la vue pour voir tout l'arbre visible"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
            <span>Ajuster</span>
          </button>

          {rootPersonId ? (
            <button
              type="button"
              className={styles.dockActionButton}
              data-canvas-control="true"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                centerOnPerson(rootPersonId, 0.92);
                if (rootPersonId) onSelectPerson(rootPersonId);
              }}
              title="Centrer sur la personne racine de l'arbre"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span>Racine</span>
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
