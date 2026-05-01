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

type DeleteMode = 'person-only' | 'person-descendants' | 'descendants-only';

export default function BranchDeleteDialog({
  person,
  token,
  open,
  onClose,
  onDeleted,
}: Props) {
  const [deleteMode, setDeleteMode] = useState<DeleteMode>('person-only');
  const [preview, setPreview] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !person || !token) return;
    if (deleteMode === 'person-only') {
      setBusy(false);
      setError(null);
      setPreview({
        personsDeleted: 1,
        relationshipsDeleted: null,
        unionsDeleted: null,
        documentsDeleted: null,
        personOnly: true,
      });
      return;
    }

    let alive = true;
    const includeRoot = deleteMode === 'person-descendants';
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
  }, [open, person, token, deleteMode]);

  if (!open || !person) return null;

  async function confirmDelete() {
    if (!token || !person) return;
    setBusy(true);
    setError(null);
    try {
      if (deleteMode === 'person-only') {
        await personApi.delete(person.id, token);
      } else {
        await personApi.deleteBranch(
          person.id,
          token,
          deleteMode === 'person-descendants',
          false,
        );
      }
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
          <div className={styles.drawerTitle}>Suppression</div>
          <button className={styles.iconButton} onClick={onClose} type="button">
            X
          </button>
        </div>
        <p className={styles.muted}>{personLabel(person)}</p>

        <label className={styles.label}>
          <span>Que voulez-vous supprimer ?</span>
          <select
            className={styles.select}
            value={deleteMode}
            onChange={(event) => setDeleteMode(event.target.value as DeleteMode)}
          >
            <option value="person-only">Personne seule</option>
            <option value="person-descendants">Personne + descendants</option>
            <option value="descendants-only">Descendants seulement</option>
          </select>
        </label>
        <p className={styles.muted}>
          {deleteMode === 'person-only'
            ? 'Supprime seulement cette fiche. Ses parents, conjoints et enfants restent dans la base, mais les liens directs avec cette personne seront coupes.'
            : deleteMode === 'person-descendants'
              ? 'Supprime cette personne et toute sa descendance visible par les liens enfant.'
              : 'Conserve cette personne et supprime uniquement sa descendance.'}
        </p>

        <div className={styles.panel}>
          {busy && !preview ? <div className={styles.spinner} /> : null}
          {preview ? (
            <div className={styles.fieldGrid}>
              <span className={styles.tag}>{preview.personsDeleted} personnes</span>
              <span className={styles.tag}>
                {preview.relationshipsDeleted ?? 'Liens directs'} relations
              </span>
              <span className={styles.tag}>
                {preview.unionsDeleted ?? 'Unions directes'} unions
              </span>
              <span className={styles.tag}>
                {preview.documentsDeleted ?? 'Conserves'} documents
              </span>
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
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}
