'use client';

import { useEffect, useState } from 'react';
import { personApi } from '@/lib/api';
import styles from './TreeWorkspace.module.css';
import { Person, personLabel } from './types';

type Props = {
  person: Person | null;
  token: string | null;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
};

export default function BranchDeleteDialog({
  person,
  token,
  open,
  onClose,
  onDeleted,
}: Props) {
  const [includeRoot, setIncludeRoot] = useState(true);
  const [preview, setPreview] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !person || !token) return;
    let alive = true;
    setBusy(true);
    setError(null);
    personApi
      .deleteBranch(person.id, token, includeRoot, true)
      .then((envelope) => {
        if (alive) setPreview(envelope.data || envelope);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur preview'))
      .finally(() => setBusy(false));
    return () => {
      alive = false;
    };
  }, [open, person, token, includeRoot]);

  if (!open || !person) return null;

  async function confirmDelete() {
    if (!token || !person) return;
    setBusy(true);
    setError(null);
    try {
      await personApi.deleteBranch(person.id, token, includeRoot, false);
      onDeleted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur suppression');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.dialogOverlay}>
      <div className={styles.dialog} role="dialog" aria-modal="true">
        <div className={styles.drawerHeader}>
          <div className={styles.drawerTitle}>Supprimer une branche</div>
          <button className={styles.iconButton} onClick={onClose} type="button">
            X
          </button>
        </div>
        <p className={styles.muted}>{personLabel(person)}</p>

        <label className={styles.label}>
          <span>Perimetre</span>
          <select
            className={styles.select}
            value={includeRoot ? 'with-root' : 'descendants-only'}
            onChange={(event) => setIncludeRoot(event.target.value === 'with-root')}
          >
            <option value="with-root">Personne selectionnee + descendants</option>
            <option value="descendants-only">Descendants seulement</option>
          </select>
        </label>

        <div className={styles.panel}>
          {busy && !preview ? <div className={styles.spinner} /> : null}
          {preview ? (
            <div className={styles.fieldGrid}>
              <span className={styles.tag}>{preview.personsDeleted} personnes</span>
              <span className={styles.tag}>{preview.relationshipsDeleted} relations</span>
              <span className={styles.tag}>{preview.unionsDeleted} unions</span>
              <span className={styles.tag}>{preview.documentsDeleted} documents</span>
            </div>
          ) : null}
          {error ? <div className={styles.candidate}>{error}</div> : null}
        </div>

        <div className={styles.actionRow}>
          <button className={styles.button} onClick={onClose} type="button">
            Annuler
          </button>
          <button
            className={styles.dangerButton}
            onClick={confirmDelete}
            disabled={busy || !token}
            type="button"
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}
