'use client';

// ══════════════════════════════════════
// PersonNode — Custom React Flow Node (Phase 3)
// ══════════════════════════════════════
// Optimized with:
// - Smooth hover transitions
// - Profession display
// - Clickable link indicator
// - Better visual hierarchy

import { memo, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

type NodeQuickAction = 'ADD_FATHER' | 'ADD_MOTHER' | 'ADD_SPOUSE' | 'ADD_CHILD';
type QuickMenuAnchor = 'top' | 'right' | 'bottom' | 'left';

type PersonNodeData = {
  person: any;
  generation?: number;
  isRoot?: boolean;
  isEditMode?: boolean;
  onQuickAdd?: (personId: string, action: NodeQuickAction) => void;
};

function PersonNode({ data }: NodeProps) {
  const { person, generation, isRoot, isEditMode, onQuickAdd } = data as PersonNodeData;
  const [quickMenuAnchor, setQuickMenuAnchor] = useState<QuickMenuAnchor | null>(null);

  useEffect(() => {
    if (!isEditMode && quickMenuAnchor) {
      setQuickMenuAnchor(null);
    }
  }, [isEditMode, quickMenuAnchor]);

  useEffect(() => {
    if (!quickMenuAnchor) return;

    const closeMenu = () => {
      setQuickMenuAnchor(null);
    };

    window.addEventListener('pointerdown', closeMenu);
    return () => window.removeEventListener('pointerdown', closeMenu);
  }, [quickMenuAnchor]);

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

  const openQuickMenu = (anchor: QuickMenuAnchor, event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (!isEditMode || !onQuickAdd) return;
    setQuickMenuAnchor((current) => (current === anchor ? null : anchor));
  };

  const triggerQuickAction = (action: NodeQuickAction, event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (!onQuickAdd) return;
    onQuickAdd(person.id, action);
    setQuickMenuAnchor(null);
  };

  const quickMenuPosition = useMemo(() => {
    if (quickMenuAnchor === 'top') {
      return {
        left: '50%',
        bottom: 'calc(100% + 18px)',
        transform: 'translateX(-50%)',
      };
    }

    if (quickMenuAnchor === 'right') {
      return {
        top: '50%',
        left: 'calc(100% + 18px)',
        transform: 'translateY(-50%)',
      };
    }

    if (quickMenuAnchor === 'bottom') {
      return {
        left: '50%',
        top: 'calc(100% + 18px)',
        transform: 'translateX(-50%)',
      };
    }

    if (quickMenuAnchor === 'left') {
      return {
        top: '50%',
        right: 'calc(100% + 18px)',
        transform: 'translateY(-50%)',
      };
    }

    return null;
  }, [quickMenuAnchor]);

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

        {isEditMode && onQuickAdd && (
          <>
            <button
              type="button"
              className="person-node__quick-add person-node__quick-add--top nodrag nopan"
              onClick={(event) => openQuickMenu('top', event)}
              aria-label="Ouvrir le menu d'ajout"
              title="Ajouter un proche"
            >
              +
            </button>
            <button
              type="button"
              className="person-node__quick-add person-node__quick-add--right nodrag nopan"
              onClick={(event) => openQuickMenu('right', event)}
              aria-label="Ouvrir le menu d'ajout"
              title="Ajouter un proche"
            >
              +
            </button>
            <button
              type="button"
              className="person-node__quick-add person-node__quick-add--bottom nodrag nopan"
              onClick={(event) => openQuickMenu('bottom', event)}
              aria-label="Ouvrir le menu d'ajout"
              title="Ajouter un proche"
            >
              +
            </button>
            <button
              type="button"
              className="person-node__quick-add person-node__quick-add--left nodrag nopan"
              onClick={(event) => openQuickMenu('left', event)}
              aria-label="Ouvrir le menu d'ajout"
              title="Ajouter un proche"
            >
              +
            </button>

            {quickMenuPosition && (
              <div
                className="person-node__quick-menu nodrag nopan"
                style={quickMenuPosition}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="person-node__quick-menu-item"
                  onClick={(event) => triggerQuickAction('ADD_FATHER', event)}
                >
                  Ajouter Pere
                </button>
                <button
                  type="button"
                  className="person-node__quick-menu-item"
                  onClick={(event) => triggerQuickAction('ADD_MOTHER', event)}
                >
                  Ajouter Mere
                </button>
                <button
                  type="button"
                  className="person-node__quick-menu-item"
                  onClick={(event) => triggerQuickAction('ADD_SPOUSE', event)}
                >
                  Ajouter Conjoint
                </button>
                <button
                  type="button"
                  className="person-node__quick-menu-item"
                  onClick={(event) => triggerQuickAction('ADD_CHILD', event)}
                >
                  Ajouter Enfant
                </button>
              </div>
            )}
          </>
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

        .person-node__quick-add {
          width: 24px;
          height: 24px;
          border-radius: 999px;
          border: 1px solid var(--color-border);
          background: var(--color-bg-primary);
          color: var(--color-text-primary);
          font-size: 1rem;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          position: absolute;
          z-index: 14;
          box-shadow: var(--shadow-sm);
          opacity: 0;
          pointer-events: none;
          transition: opacity 140ms ease, border-color 140ms ease, background-color 140ms ease;
        }

        .person-node:hover .person-node__quick-add {
          opacity: 1;
          pointer-events: auto;
        }

        .person-node__quick-add:hover {
          background: var(--color-bg-tertiary);
          border-color: var(--color-accent);
        }

        .person-node__quick-add--top {
          left: 50%;
          top: 0;
          transform: translate(-50%, -50%);
        }

        .person-node__quick-add--right {
          right: 0;
          top: 50%;
          transform: translate(50%, -50%);
        }

        .person-node__quick-add--bottom {
          left: 50%;
          bottom: 0;
          transform: translate(-50%, 50%);
        }

        .person-node__quick-add--left {
          left: 0;
          top: 50%;
          transform: translate(-50%, -50%);
        }

        .person-node__quick-menu {
          position: absolute;
          z-index: 16;
          width: 168px;
          background: var(--color-bg-primary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-lg);
          padding: 6px;
          display: grid;
          gap: 4px;
        }

        .person-node__quick-menu-item {
          width: 100%;
          text-align: left;
          border: 1px solid transparent;
          border-radius: var(--radius-sm);
          background: transparent;
          color: var(--color-text-primary);
          font-size: 0.72rem;
          padding: 6px 8px;
          cursor: pointer;
          transition: background-color 120ms ease, border-color 120ms ease;
        }

        .person-node__quick-menu-item:hover {
          background: var(--color-bg-tertiary);
          border-color: var(--color-border-subtle);
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
