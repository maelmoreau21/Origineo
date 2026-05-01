'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { layoutFamilyTree } from '@/lib/family-layout';
import styles from './TreeWorkspace.module.css';
import { formatLife, personLabel, TreeWindow } from './types';

type Props = {
  tree: TreeWindow | null;
  rootPersonId: string | null;
  selectedPersonId: string | null;
  onSelectPerson: (personId: string) => void;
};

export default function TreeCanvas({
  tree,
  rootPersonId,
  selectedPersonId,
  onSelectPerson,
}: Props) {
  const router = useRouter();
  const [view, setView] = useState({ x: -120, y: -80, scale: 0.88 });
  const dragRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(
    null,
  );

  const layout = useMemo(() => {
    if (!tree || !rootPersonId) return null;
    return layoutFamilyTree(tree as any, rootPersonId);
  }, [tree, rootPersonId]);

  if (!tree || !layout) {
    return (
      <section className={styles.canvasPane}>
        <div className={styles.emptyState}>
          <div>
            <strong>Aucun arbre charge</strong>
            <p>Importez un GEDCOM ou creez une premiere personne.</p>
          </div>
        </div>
      </section>
    );
  }

  const contentWidth = layout.width;
  const contentHeight = layout.height;
  const offsetX = -layout.minX;
  const offsetY = -layout.minY;

  return (
    <section className={styles.canvasPane}>
      <div
        className={styles.canvasViewport}
        onWheel={(event) => {
          event.preventDefault();
          const delta = event.deltaY > 0 ? -0.08 : 0.08;
          setView((current) => ({
            ...current,
            scale: Math.max(0.25, Math.min(1.6, current.scale + delta)),
          }));
        }}
        onPointerDown={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest('[data-person-card="true"]')) return;

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
                  router.push(`/person/${node.id}`);
                }}
                title="Double clic pour ouvrir la fiche"
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
            onClick={() =>
              setView((current) => ({
                ...current,
                scale: Math.max(0.25, current.scale - 0.12),
              }))
            }
            title="Zoom arriere"
          >
            -
          </button>
          <button
            className={styles.iconButton}
            onClick={() => setView({ x: -120, y: -80, scale: 0.88 })}
            title="Recentrer la vue"
          >
            0
          </button>
          <button
            className={styles.iconButton}
            onClick={() =>
              setView((current) => ({
                ...current,
                scale: Math.min(1.6, current.scale + 0.12),
              }))
            }
            title="Zoom avant"
          >
            +
          </button>
        </div>
      </div>
    </section>
  );
}
