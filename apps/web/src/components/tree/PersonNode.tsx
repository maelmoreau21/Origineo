'use client';

// ══════════════════════════════════════
// PersonNode — Custom React Flow Node
// ══════════════════════════════════════

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

  return (
    <>
      <Handle type="target" position={Position.Top} />

      <div
        className={`person-node ${genderClass} ${isRoot ? 'person-node--root' : ''}`}
        id={`person-node-${person.id}`}
      >
        <div className="person-node__header">
          <span className="person-node__gender-icon">
            {person.gender === 'MALE' ? '♂' : person.gender === 'FEMALE' ? '♀' : '◯'}
          </span>
          {isRoot && <span className="badge badge-accent" style={{ fontSize: '0.6rem' }}>Racine</span>}
        </div>

        <div className="person-node__name">{displayName}</div>

        {lifespan && (
          <div className="person-node__dates">{lifespan}</div>
        )}

        {person.birthPlace && (
          <div className="person-node__place">📍 {person.birthPlace}</div>
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
          transition: all var(--transition-base);
          box-shadow: var(--shadow-md);
        }

        .person-node:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-lg);
        }

        .person-node--male {
          border-color: var(--color-male-border);
          background: linear-gradient(180deg, var(--color-male-subtle) 0%, var(--color-bg-secondary) 100%);
        }

        .person-node--female {
          border-color: var(--color-female-border);
          background: linear-gradient(180deg, var(--color-female-subtle) 0%, var(--color-bg-secondary) 100%);
        }

        .person-node--root {
          border-width: 2px;
          animation: pulse-glow 3s ease-in-out infinite;
        }

        .person-node__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-1);
        }

        .person-node__gender-icon {
          font-size: var(--text-sm);
          opacity: 0.7;
        }

        .person-node__name {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: var(--text-sm);
          color: var(--color-text-primary);
          line-height: 1.3;
          margin-bottom: var(--space-1);
        }

        .person-node__dates {
          font-size: var(--text-xs);
          color: var(--color-text-secondary);
          font-family: var(--font-mono);
        }

        .person-node__place {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          margin-top: var(--space-1);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>
    </>
  );
}

export default memo(PersonNode);
