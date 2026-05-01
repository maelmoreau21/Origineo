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
  onApplied: (result?: any) => void | Promise<void>;
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
  const [result, setResult] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);

  if (!open) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token || !file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setStatusText(mode === 'merge' ? 'Analyse du GEDCOM...' : 'Import du GEDCOM...');
    try {
      const envelope = await gedcomApi.createJob(file, mode, token);
      const createdJob = envelope.data || envelope;
      setJob(createdJob);
      onJobCreated(createdJob, mode);

      if (mode === 'import') {
        setStatusText('Creation des personnes, liens et unions...');
        const applyEnvelope = await gedcomApi.applyJob(createdJob.id, [], token);
        const applied = applyEnvelope.data || applyEnvelope;
        setResult(applied);
        setStatusText('Import termine.');
        await onApplied(applied);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur import');
    } finally {
      setBusy(false);
      setStatusText(null);
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
            <div className={styles.muted}>
              {mode === 'merge'
                ? 'Compare le fichier avec les personnes existantes.'
                : 'Ajoute le fichier dans l arbre puis ouvre la nouvelle racine.'}
            </div>
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
            {busy
              ? 'Traitement...'
              : mode === 'merge'
                ? 'Analyser pour fusion'
                : 'Importer maintenant'}
          </button>
        </form>

        {statusText ? (
          <div className={styles.importStatus}>{statusText}</div>
        ) : null}

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
              result ? (
                <div className={styles.importSummary}>
                  {result.personsCreated || 0} personnes creees,{' '}
                  {result.relationshipsCreated || 0} liens,{' '}
                  {result.unionsCreated || 0} unions.
                </div>
              ) : null
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
