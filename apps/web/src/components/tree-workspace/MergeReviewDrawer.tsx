'use client';

import { useEffect, useState } from 'react';
import { gedcomApi } from '@/lib/api';
import styles from './TreeWorkspace.module.css';
import { personLabel } from './types';

type Props = {
  jobId: string | null;
  token: string | null;
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
};

export default function MergeReviewDrawer({
  jobId,
  token,
  open,
  onClose,
  onApplied,
}: Props) {
  const [page, setPage] = useState(1);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const [decisions, setDecisions] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !jobId || !token) return;
    let alive = true;
    setBusy(true);
    gedcomApi
      .getJobCandidates(jobId, token, page, 20)
      .then((envelope) => {
        if (!alive) return;
        const payload = envelope.data || envelope;
        setCandidates(payload.data || []);
        setMeta({
          total: payload.total || 0,
          totalPages: payload.totalPages || 1,
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur fusion'))
      .finally(() => setBusy(false));
    return () => {
      alive = false;
    };
  }, [open, jobId, token, page]);

  if (!open || !jobId) return null;

  async function apply() {
    if (!token || !jobId) return;
    setBusy(true);
    setError(null);
    try {
      await gedcomApi.applyJob(jobId, Object.values(decisions), token);
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
            <div className={styles.drawerTitle}>Revue de fusion</div>
            <div className={styles.muted}>{meta.total} candidats detectes</div>
          </div>
          <button className={styles.iconButton} onClick={onClose} type="button">
            X
          </button>
        </div>

        {busy && candidates.length === 0 ? <div className={styles.spinner} /> : null}
        {error ? <div className={styles.candidate}>{error}</div> : null}

        {candidates.length === 0 && !busy ? (
          <div className={styles.candidate}>
            Aucun doublon sur cette page. Vous pouvez appliquer le job pour creer
            les personnes restantes.
          </div>
        ) : null}

        {candidates.map((candidate) => {
          const key = candidate.stagedPersonId || candidate.stagedPointer;
          const current = decisions[key]?.action || 'merge';
          return (
            <div key={candidate.id} className={styles.candidate}>
              <div className={styles.candidateHeader}>
                <div>
                  <strong>{personLabel(candidate.staged)}</strong>
                  <div className={styles.muted}>GEDCOM {candidate.stagedPointer}</div>
                </div>
                <span className={styles.tag}>{candidate.confidence}%</span>
              </div>
              <div className={styles.muted}>
                Candidat base : {personLabel(candidate.existingPerson)}
              </div>
              <div className={styles.muted}>
                {(candidate.matchReasons || []).join(' - ')}
              </div>
              <div className={styles.actionRow}>
                {(['merge', 'create', 'skip'] as const).map((action) => (
                  <button
                    key={action}
                    type="button"
                    className={`${styles.toggle} ${current === action ? styles.toggleActive : ''}`}
                    onClick={() =>
                      setDecisions({
                        ...decisions,
                        [key]: {
                          stagedPersonId: candidate.stagedPersonId,
                          stagedPointer: candidate.stagedPointer,
                          action,
                          mergeIntoPersonId:
                            action === 'merge'
                              ? candidate.existingPersonId
                              : undefined,
                        },
                      })
                    }
                  >
                    {action === 'merge'
                      ? 'Fusionner'
                      : action === 'create'
                        ? 'Creer'
                        : 'Ignorer'}
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        <div className={styles.actionRow}>
          <button
            className={styles.button}
            disabled={page <= 1 || busy}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            type="button"
          >
            Page precedente
          </button>
          <button
            className={styles.button}
            disabled={page >= meta.totalPages || busy}
            onClick={() => setPage((value) => value + 1)}
            type="button"
          >
            Page suivante
          </button>
          <button
            className={`${styles.button} ${styles.primaryButton}`}
            disabled={!token || busy}
            onClick={apply}
            type="button"
          >
            Appliquer
          </button>
        </div>
      </aside>
    </div>
  );
}
