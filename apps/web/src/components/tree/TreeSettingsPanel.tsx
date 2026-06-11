'use client';

import { FormEvent, useEffect, useState } from 'react';

export type TreeSettingsPanelProps = {
  visible: boolean;
  tree: {
    id: string;
    title: string;
    description?: string | null;
  } | null;
  saving?: boolean;
  deleting?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (payload: { title: string; description: string | null }) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
};

export default function TreeSettingsPanel({
  visible,
  tree,
  saving = false,
  deleting = false,
  error,
  onClose,
  onSave,
  onDelete,
}: TreeSettingsPanelProps) {
  const [title, setTitle] = useState(tree?.title || '');
  const [description, setDescription] = useState(tree?.description || '');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  useEffect(() => {
    setTitle(tree?.title || '');
    setDescription(tree?.description || '');
    setDeleteConfirmation('');
  }, [tree?.id, tree?.title, tree?.description, visible]);

  const canSave = Boolean(tree && title.trim()) && !saving && !deleting;
  const canDelete = Boolean(tree && deleteConfirmation === tree.title) && !saving && !deleting;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;

    onSave({
      title: title.trim(),
      description: description.trim() || null,
    });
  }

  function deleteTree() {
    if (!canDelete) return;
    onDelete();
  }

  return (
    <aside className="tree-settings-panel" data-visible={visible ? 'true' : 'false'}>
      <div className="tree-settings-header">
        <div>
          <div className="tree-settings-eyebrow">Parametres</div>
          <h2 className="tree-settings-title">Arbre</h2>
        </div>
        <button className="tree-settings-close" type="button" onClick={onClose} title="Fermer">
          X
        </button>
      </div>

      <form className="tree-settings-body" onSubmit={submit}>
        <label className="tree-settings-field">
          <span>Titre</span>
          <input
            className="tree-settings-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Nom de l'arbre"
            disabled={!tree || saving || deleting}
            required
          />
        </label>

        <label className="tree-settings-field">
          <span>Description</span>
          <textarea
            className="tree-settings-textarea"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Courte description de cet arbre"
            disabled={!tree || saving || deleting}
          />
        </label>

        {error ? <p className="tree-settings-error">{error}</p> : null}

        <div className="tree-settings-actions">
          <button className="tree-settings-button" type="submit" disabled={!canSave}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>

        <section className="tree-settings-danger">
          <h3>Supprimer l'arbre</h3>
          <p>
            Cette action supprime l'arbre et les donnees qui lui sont rattachees. Pour confirmer,
            recopiez son titre.
          </p>
          <input
            className="tree-settings-input"
            value={deleteConfirmation}
            onChange={(event) => setDeleteConfirmation(event.target.value)}
            placeholder={tree?.title || "Titre de l'arbre"}
            disabled={!tree || saving || deleting}
          />
          <button
            className="tree-settings-button tree-settings-button-danger"
            type="button"
            onClick={deleteTree}
            disabled={!canDelete}
          >
            {deleting ? 'Suppression...' : "Supprimer l'arbre"}
          </button>
        </section>
      </form>

      <style>{`
        .tree-settings-panel {
          position: absolute;
          top: 12px;
          left: 12px;
          bottom: 12px;
          z-index: 20;
          width: min(360px, calc(100vw - 24px));
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid #2b343d;
          border-radius: 8px;
          background: #10151a;
          box-shadow: 0 18px 44px rgba(0, 0, 0, 0.36);
          color: var(--color-text-primary);
          transition: opacity 160ms ease, transform 160ms ease;
        }

        .tree-settings-panel[data-visible='false'] {
          opacity: 0;
          pointer-events: none;
          transform: translateX(-10px);
        }

        .tree-settings-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 16px;
          border-bottom: 1px solid #252c33;
        }

        .tree-settings-eyebrow {
          margin-bottom: 4px;
          color: var(--color-text-secondary);
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
        }

        .tree-settings-title {
          margin: 0;
          font-size: 18px;
          line-height: 1.2;
        }

        .tree-settings-close {
          width: 32px;
          height: 32px;
          border: 1px solid #2b343d;
          border-radius: 8px;
          background: #151b21;
          color: var(--color-text-secondary);
          cursor: pointer;
          font-weight: 800;
        }

        .tree-settings-close:hover {
          color: var(--color-text-primary);
          background: #1b232b;
        }

        .tree-settings-body {
          display: grid;
          gap: 14px;
          overflow-y: auto;
          padding: 16px;
        }

        .tree-settings-field {
          display: grid;
          gap: 6px;
          color: var(--color-text-secondary);
          font-size: 12px;
          font-weight: 700;
        }

        .tree-settings-input,
        .tree-settings-textarea {
          width: 100%;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          background: #151b21;
          color: var(--color-text-primary);
          padding: 9px 10px;
          outline: none;
        }

        .tree-settings-input:focus,
        .tree-settings-textarea:focus {
          border-color: #278568;
        }

        .tree-settings-textarea {
          min-height: 120px;
          resize: vertical;
        }

        .tree-settings-actions {
          display: flex;
          justify-content: flex-end;
        }

        .tree-settings-button {
          min-height: 34px;
          border: 1px solid #278568;
          border-radius: 8px;
          background: #1f6f58;
          color: #dffcf3;
          padding: 0 12px;
          cursor: pointer;
          font-weight: 800;
        }

        .tree-settings-button:disabled {
          cursor: default;
          opacity: 0.45;
        }

        .tree-settings-danger {
          display: grid;
          gap: 10px;
          margin-top: 8px;
          padding-top: 16px;
          border-top: 1px solid #3a252b;
        }

        .tree-settings-danger h3 {
          margin: 0;
          color: #ffcdd6;
          font-size: 14px;
        }

        .tree-settings-danger p {
          margin: 0;
          color: var(--color-text-secondary);
          font-size: 12px;
          line-height: 1.45;
        }

        .tree-settings-button-danger {
          border-color: #70404a;
          background: #2a151a;
          color: #ffcdd6;
        }

        .tree-settings-error {
          margin: 0;
          border: 1px solid #70404a;
          border-radius: 8px;
          padding: 8px 10px;
          background: #2a151a;
          color: #ffcdd6;
          font-size: 12px;
        }

        @media (max-width: 700px) {
          .tree-settings-panel {
            right: 12px;
            width: auto;
          }
        }
      `}</style>
    </aside>
  );
}
