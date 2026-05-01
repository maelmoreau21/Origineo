'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { layoutFamilyTree } from '@/lib/family-layout';
import {
  centerViewOnPoint,
  fitViewToBounds,
  zoomViewAroundViewportCenter,
} from './canvas-view';
import styles from './TreeWorkspace.module.css';
import { formatLife, personLabel, TreeWindow } from './types';

type Props = {
  tree: TreeWindow | null;
  rootPersonId: string | null;
  selectedPersonId: string | null;
  onSelectPerson: (personId: string) => void;
  onFocusPerson: (personId: string) => void | Promise<void>;
};

export default function TreeCanvas({
  tree,
  rootPersonId,
  selectedPersonId,
  onSelectPerson,
  onFocusPerson,
}: Props) {
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
      <section className={styles.canvasPane}>
        <div className={styles.emptyState}>
          <div>
            <strong>Aucun arbre charge</strong>
            <p>
              Importez un GEDCOM pour creer l arbre, ou choisissez une personne
              avec la recherche.
            </p>
            <div className={styles.emptyActions}>
              <a className={`${styles.button} ${styles.primaryButton}`} href="/tree-settings?tab=gedcom">
                Gestion GEDCOM
              </a>
            </div>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className={styles.canvasPane}>
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
              <button
                key={node.tid}
                data-person-card="true"
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
                title="Double clic pour centrer l'arbre"
              >
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
              </button>
            );
          })}
        </div>

        <div className={styles.canvasStatus}>
          <span className={styles.statusPill}>
            {tree.stats?.visiblePersons || tree.nodes.length} personnes visibles
          </span>
          <span className={styles.statusPill}>
            {tree.relationships.length} liens parent-enfant
          </span>
          <span className={styles.statusPill}>
            {tree.unions.length} unions
          </span>
          {tree.stats?.truncated ? (
            <span className={styles.statusPill}>
              Fenetre limitee a {tree.stats.limit}
            </span>
          ) : null}
        </div>

        <div className={styles.zoomControls}>
          <button
            className={styles.iconButton}
            data-canvas-control="true"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              zoomBy(-0.12);
            }}
            title="Zoom arriere"
          >
            -
          </button>
          <span className={styles.zoomValue} data-canvas-control="true">
            {Math.round(view.scale * 100)}%
          </span>
          <button
            className={styles.iconButton}
            data-canvas-control="true"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              zoomBy(0.12);
            }}
            title="Zoom avant"
          >
            +
          </button>
          <button
            className={styles.button}
            data-canvas-control="true"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              fitTree();
            }}
            title="Afficher tout l'arbre visible"
          >
            Ajuster
          </button>
        </div>
      </div>
    </section>
  );
}
