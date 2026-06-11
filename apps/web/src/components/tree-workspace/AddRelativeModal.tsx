'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { personApi } from '@/lib/api';
import styles from './TreeWorkspace.module.css';
import { Person, personLabel } from './types';

export type RelativeLinkType = 'FATHER' | 'MOTHER' | 'SPOUSE' | 'CHILD';

type Props = {
  open: boolean;
  treeId: string;
  token: string | null;
  anchorPerson: Person | null;
  initialLinkType?: RelativeLinkType | null;
  onClose: () => void;
  onCreated: (createdPersonId: string) => void;
};

type Step = 1 | 2 | 3;

const LINK_OPTIONS: Array<{
  value: RelativeLinkType;
  label: string;
  description: string;
}> = [
  {
    value: 'FATHER',
    label: 'Pere',
    description: 'Nouveau parent masculin',
  },
  {
    value: 'MOTHER',
    label: 'Mere',
    description: 'Nouveau parent feminin',
  },
  {
    value: 'SPOUSE',
    label: 'Conjoint',
    description: 'Nouvelle union',
  },
  {
    value: 'CHILD',
    label: 'Enfant',
    description: 'Nouvelle filiation descendante',
  },
];

const LINK_LABELS = Object.fromEntries(
  LINK_OPTIONS.map((option) => [option.value, option.label]),
) as Record<RelativeLinkType, string>;

export default function AddRelativeModal({
  open,
  treeId,
  token,
  anchorPerson,
  initialLinkType,
  onClose,
  onCreated,
}: Props) {
  const [step, setStep] = useState<Step>(1);
  const [linkType, setLinkType] = useState<RelativeLinkType>('CHILD');
  const [form, setForm] = useState({
    givenNames: '',
    usageSurname: '',
    birthDate: '',
    birthPlace: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const nextLinkType = initialLinkType || 'CHILD';
    setStep(initialLinkType ? 2 : 1);
    setLinkType(nextLinkType);
    setForm({
      givenNames: '',
      usageSurname: '',
      birthDate: '',
      birthPlace: '',
    });
    setBusy(false);
    setError(null);
  }, [anchorPerson?.id, initialLinkType, open]);

  const createdLabel = useMemo(
    () =>
      [form.givenNames.trim(), form.usageSurname.trim()]
        .filter(Boolean)
        .join(' ')
        .trim() || 'Sans nom',
    [form.givenNames, form.usageSurname],
  );

  if (!open || !anchorPerson) return null;

  const anchor = anchorPerson;

  const canContinue = Boolean(form.givenNames.trim());

  function chooseLink(nextLinkType: RelativeLinkType) {
    setLinkType(nextLinkType);
    setStep(2);
    setError(null);
  }

  function validateForm(event: FormEvent) {
    event.preventDefault();
    if (!canContinue) {
      setError('Le prenom est obligatoire.');
      return;
    }
    setStep(3);
    setError(null);
  }

  async function submitRelative() {
    if (!token) {
      setError('Session admin requise.');
      return;
    }
    if (!canContinue) {
      setError('Le prenom est obligatoire.');
      setStep(2);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const envelope = await personApi.createRelative(
        anchor.id,
        {
          linkType,
          person: {
            givenNames: form.givenNames.trim(),
            usageSurname: form.usageSurname.trim() || null,
            birthDate: form.birthDate || null,
            birthPlace: form.birthPlace.trim() || null,
          },
        },
        token,
        treeId,
      );
      const payload = envelope.data || envelope;
      const createdPersonId = payload.createdPerson?.id || payload.person?.id || anchor.id;
      onCreated(createdPersonId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Creation impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={styles.dialogOverlay}
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`${styles.dialog} ${styles.relativeDialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-relative-title"
      >
        <div className={styles.dialogHeader}>
          <div>
            <div className={styles.panelEyebrow}>Ajouter un proche</div>
            <h2 id="add-relative-title" className={styles.dialogTitle}>
              {personLabel(anchor)}
            </h2>
          </div>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onClose}
            aria-label="Fermer"
          >
            x
          </button>
        </div>

        <div className={styles.stepRail} aria-label="Progression">
          {[1, 2, 3].map((item) => (
            <span
              key={item}
              className={`${styles.stepDot} ${step === item ? styles.stepDotActive : ''}`}
            >
              {item}
            </span>
          ))}
        </div>

        {step === 1 ? (
          <div className={styles.linkChoiceGrid}>
            {LINK_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`${styles.linkChoice} ${
                  linkType === option.value ? styles.linkChoiceActive : ''
                }`}
                onClick={() => chooseLink(option.value)}
              >
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </button>
            ))}
          </div>
        ) : null}

        {step === 2 ? (
          <form className={styles.fieldGrid} onSubmit={validateForm}>
            <div className={styles.selectedLinkLine}>
              <span>{LINK_LABELS[linkType]}</span>
              <button type="button" onClick={() => setStep(1)}>
                Modifier
              </button>
            </div>
            <div className={styles.twoColumnFields}>
              <label className={styles.label}>
                Prenom
                <input
                  className={styles.input}
                  value={form.givenNames}
                  onChange={(event) =>
                    setForm({ ...form, givenNames: event.target.value })
                  }
                  autoFocus
                />
              </label>
              <label className={styles.label}>
                Nom
                <input
                  className={styles.input}
                  value={form.usageSurname}
                  onChange={(event) =>
                    setForm({ ...form, usageSurname: event.target.value })
                  }
                />
              </label>
            </div>
            <div className={styles.twoColumnFields}>
              <label className={styles.label}>
                Date de naissance
                <input
                  className={styles.input}
                  type="date"
                  value={form.birthDate}
                  onChange={(event) =>
                    setForm({ ...form, birthDate: event.target.value })
                  }
                />
              </label>
              <label className={styles.label}>
                Lieu de naissance
                <input
                  className={styles.input}
                  value={form.birthPlace}
                  onChange={(event) =>
                    setForm({ ...form, birthPlace: event.target.value })
                  }
                />
              </label>
            </div>
            {error ? <div className={styles.formNotice}>{error}</div> : null}
            <div className={styles.dialogActions}>
              <button type="button" className={styles.button} onClick={() => setStep(1)}>
                Retour
              </button>
              <button
                type="submit"
                className={`${styles.button} ${styles.primaryButton}`}
              >
                Valider
              </button>
            </div>
          </form>
        ) : null}

        {step === 3 ? (
          <div className={styles.confirmPanel}>
            <div className={styles.confirmTitle}>Validation</div>
            <div className={styles.confirmGrid}>
              <span>Lien</span>
              <strong>{LINK_LABELS[linkType]}</strong>
              <span>Proche</span>
              <strong>{createdLabel}</strong>
              <span>Personne liee</span>
              <strong>{personLabel(anchorPerson)}</strong>
              <span>Date</span>
              <strong>{form.birthDate || 'Non renseignee'}</strong>
              <span>Lieu</span>
              <strong>{form.birthPlace.trim() || 'Non renseigne'}</strong>
            </div>
            {error ? <div className={styles.formNotice}>{error}</div> : null}
            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.button}
                onClick={() => setStep(2)}
                disabled={busy}
              >
                Retour
              </button>
              <button
                type="button"
                className={`${styles.button} ${styles.primaryButton}`}
                onClick={submitRelative}
                disabled={busy || !token}
              >
                {busy ? 'Creation...' : 'Creer le lien'}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
