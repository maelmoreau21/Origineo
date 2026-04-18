'use client';

// ══════════════════════════════════════
// PersonNode — Custom React Flow Node (Phase 3)
// ══════════════════════════════════════
// Optimized with:
// - Smooth hover transitions
// - Profession display
// - Clickable link indicator
// - Better visual hierarchy

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

function PersonNode({ data }: NodeProps) {
  const { person, generation, isRoot } = data as any;

  const genderClass =
    person.gender === 'MALE'
      ? 'person-node--male'
      : person.gender === 'FEMALE'
        ? 'person-node--female'
        : 'person-node--unknown';

  const displayName = person.givenNames + (person.usageSurname ? ` ${person.usageSurname}` : person.birthSurname ? ` ${person.birthSurname}` : '');

  const birthYear = person.birthDate
    ? new Date(person.birthDate).getFullYear()
    : null;
  const deathYear = person.deathDate
    ? new Date(person.deathDate).getFullYear()
    : null;

  const lifespan = birthYear
    ? `${birthYear}${deathYear ? ` – ${deathYear}` : ' – ...'}`
    : '';

  const profession = person.professions?.length > 0
    ? person.professions[0]
    : null;

  return (
    <>
      <Handle type="target" position={Position.Top} />

      <div
        className={`person-node ${genderClass} ${isRoot ? 'person-node--root' : ''}`}
        id={`person-node-${person.id}`}
      >
        {/* Header row */}
        <div className="person-node__header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="person-node__gender-icon">
              {person.gender === 'MALE' ? '♂' : person.gender === 'FEMALE' ? '♀' : '◯'}
            </span>
            {isRoot && <span className="person-node__root-badge">⭐</span>}
          </div>
          {generation !== undefined && (
            <span className="person-node__generation">
              G{generation > 0 ? `+${generation}` : generation}
            </span>
          )}
        </div>

        {/* Name */}
        <div className="person-node__name">{displayName}</div>

        {/* Lifespan */}
        {lifespan && (
          <div className="person-node__dates">{lifespan}</div>
        )}

        {/* Place */}
        {person.birthPlace && (
          <div className="person-node__place">📍 {person.birthPlace}</div>
        )}

        {/* Profession */}
        {profession && (
          <div className="person-node__profession">💼 {profession}</div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} />

      <style>{`
        .person-node {
          background: var(--color-bg-secondary);
          border: 2px solid var(--color-border);
          border-radius: var(--radius-xl);
          padding: var(--space-3) var(--space-4);
          min-width: 200px;
          max-width: 240px;
          cursor: pointer;
          transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: var(--shadow-md);
          position: relative;
        }

        .person-node:hover {
          transform: translateY(-3px) scale(1.02);
          box-shadow: var(--shadow-lg), 0 0 20px hsla(0, 0%, 0%, 0.2);
          z-index: 10;
        }

        .person-node--male {
          border-color: var(--color-male-border);
          background: linear-gradient(180deg, var(--color-male-subtle) 0%, var(--color-bg-secondary) 100%);
        }

        .person-node--male:hover {
          border-color: var(--color-male);
          box-shadow: var(--shadow-lg), 0 0 20px hsla(210, 70%, 55%, 0.2);
        }

        .person-node--female {
          border-color: var(--color-female-border);
          background: linear-gradient(180deg, var(--color-female-subtle) 0%, var(--color-bg-secondary) 100%);
        }

        .person-node--female:hover {
          border-color: var(--color-female);
          box-shadow: var(--shadow-lg), 0 0 20px hsla(330, 65%, 55%, 0.2);
        }

        .person-node--root {
          border-width: 2.5px;
          border-color: var(--color-accent);
          animation: pulse-glow 3s ease-in-out infinite;
        }

        .person-node__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 4px;
        }

        .person-node__gender-icon {
          font-size: 0.85rem;
          opacity: 0.8;
        }

        .person-node__root-badge {
          font-size: 0.65rem;
        }

        .person-node__generation {
          font-size: 0.6rem;
          font-family: var(--font-mono);
          color: var(--color-text-muted);
          background: var(--color-bg-tertiary);
          padding: 1px 6px;
          border-radius: var(--radius-full);
        }

        .person-node__name {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 0.85rem;
          color: var(--color-text-primary);
          line-height: 1.3;
          margin-bottom: 2px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .person-node__dates {
          font-size: 0.72rem;
          color: var(--color-text-secondary);
          font-family: var(--font-mono);
        }

        .person-node__place {
          font-size: 0.68rem;
          color: var(--color-text-tertiary);
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .person-node__profession {
          font-size: 0.65rem;
          color: var(--color-text-muted);
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-style: italic;
        }
      `}</style>
    </>
  );
}

export default memo(PersonNode);
