'use client';

import { FormEvent, useState } from 'react';
import { gedcomApi } from '@/lib/api';
import styles from './TreeWorkspace.module.css';

type Props = {
  open: boolean;
  mode: 'import' | 'merge';
  token: string | null;
  onClose: () => void;
  onJobCreated: (job: any, mode: 'import' | 'merge') => void;
  onApplied: () => void;
};

export default function GedcomImportDrawer({
  open,
  mode,
  token,
  onClose,
  onJobCreated,
  onApplied,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token || !file) return;
    setBusy(true);
    setError(null);
    try {
      const envelope = await gedcomApi.createJob(file, mode, token);
      const createdJob = envelope.data || envelope;
      setJob(createdJob);
      onJobCreated(createdJob, mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur import');
    } finally {
      setBusy(false);
    }
  }

  async function applyImport() {
    if (!token || !job) return;
    setBusy(true);
    setError(null);
    try {
      await gedcomApi.applyJob(job.id, [], token);
      onApplied();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur application');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.drawerOverlay} role="presentation">
      <aside className={styles.drawer} role="dialog" aria-modal="true">
        <div className={styles.drawerHeader}>
          <div>
            <div className={styles.drawerTitle}>
              {mode === 'merge' ? 'Fusion GEDCOM' : 'Import GEDCOM'}
            </div>
            <div className={styles.muted}>Fichiers .ged et .gedcom acceptes</div>
          </div>
          <button className={styles.iconButton} onClick={onClose} type="button">
            X
          </button>
        </div>

        <form className={styles.fieldGrid} onSubmit={submit}>
          <label className={styles.label}>
            Fichier
            <input
              className={styles.input}
              type="file"
              accept=".ged,.gedcom"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </label>
          <button
            className={`${styles.button} ${styles.primaryButton}`}
            disabled={!file || !token || busy}
          >
            Creer le job
          </button>
        </form>

        {job ? (
          <section className={styles.panel}>
            <div className={styles.panelTitle}>Job {job.status}</div>
            <div className={styles.fieldGrid}>
              <div className={styles.muted}>{job.filename}</div>
              <span className={styles.tag}>{job.totalPersons} personnes</span>
              <span className={styles.tag}>{job.totalFamilies} familles</span>
              <span className={styles.tag}>{job.duplicateCount} doublons</span>
            </div>
            {mode === 'import' ? (
              <button
                className={`${styles.button} ${styles.primaryButton}`}
                disabled={busy || !token}
                onClick={applyImport}
                type="button"
              >
                Appliquer l'import
              </button>
            ) : (
              <div className={styles.muted}>
                Les candidats sont disponibles dans le tiroir de fusion.
              </div>
            )}
          </section>
        ) : null}

        {error ? <div className={styles.candidate}>{error}</div> : null}
      </aside>
    </div>
  );
}
