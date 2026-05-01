'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  personApi,
  relationshipApi,
  unionApi,
} from '@/lib/api';
import styles from './TreeWorkspace.module.css';
import { formatLife, Person, personLabel, TreeWindow } from './types';

type ActionMode = 'parent' | 'child' | 'spouse';

type Props = {
  tree: TreeWindow | null;
  selectedPersonId: string | null;
  token: string | null;
  onSaved: (personId?: string) => void;
  onRootChange: (personId: string) => void;
  onRequestDeleteBranch: (person: Person) => void;
};

export default function PersonInspector({
  tree,
  selectedPersonId,
  token,
  onSaved,
  onRootChange,
  onRequestDeleteBranch,
}: Props) {
  const selected = tree?.nodes.find((node) => node.person.id === selectedPersonId)
    ?.person;
  const [form, setForm] = useState({
    givenNames: '',
    usageSurname: '',
    birthSurname: '',
    gender: 'UNKNOWN',
    birthDate: '',
    birthPlace: '',
    deathDate: '',
    deathPlace: '',
    notes: '',
  });
  const [actionMode, setActionMode] = useState<ActionMode | null>(null);
  const [newPerson, setNewPerson] = useState({
    givenNames: '',
    usageSurname: '',
    gender: 'UNKNOWN',
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!selected) return;
    setForm({
      givenNames: selected.givenNames || '',
      usageSurname: selected.usageSurname || '',
      birthSurname: selected.birthSurname || '',
      gender: selected.gender || 'UNKNOWN',
      birthDate: toInputDate(selected.birthDate),
      birthPlace: selected.birthPlace || '',
      deathDate: toInputDate(selected.deathDate),
      deathPlace: selected.deathPlace || '',
      notes: selected.notes || '',
    });
  }, [selected]);

  if (!selected) {
    return (
      <aside className={styles.inspector}>
        <div className={styles.emptyState}>Selectionnez une personne.</div>
      </aside>
    );
  }

  async function savePerson(event: FormEvent) {
    event.preventDefault();
    if (!token || !selected) return;
    setBusy(true);
    try {
      await personApi.update(selected.id, emptyToNull(form), token);
      onSaved(selected.id);
    } finally {
      setBusy(false);
    }
  }

  async function createRelative(event: FormEvent) {
    event.preventDefault();
    if (!token || !selected || !actionMode || !newPerson.givenNames.trim()) return;
    setBusy(true);
    try {
      const createdEnvelope = await personApi.create(
        {
          givenNames: newPerson.givenNames.trim(),
          usageSurname: newPerson.usageSurname.trim() || null,
          birthSurname: newPerson.usageSurname.trim() || null,
          gender: newPerson.gender,
        },
        token,
      );
      const created = createdEnvelope.data || createdEnvelope;

      if (actionMode === 'parent') {
        await relationshipApi.create(
          { parentId: created.id, childId: selected.id, type: 'BIOLOGICAL' },
          token,
        );
      } else if (actionMode === 'child') {
        await relationshipApi.create(
          { parentId: selected.id, childId: created.id, type: 'BIOLOGICAL' },
          token,
        );
      } else {
        await unionApi.create(
          { partner1Id: selected.id, partner2Id: created.id, type: 'MARRIAGE' },
          token,
        );
      }

      setNewPerson({ givenNames: '', usageSurname: '', gender: 'UNKNOWN' });
      setActionMode(null);
      onSaved(created.id);
    } finally {
      setBusy(false);
    }
  }

  const selectedNode = tree?.nodes.find((node) => node.person.id === selected.id);

  return (
    <aside className={styles.inspector}>
      <section className={styles.panel}>
        <div className={styles.panelTitle}>{personLabel(selected)}</div>
        <div className={styles.muted}>
          {formatLife(selected) || 'Dates inconnues'}
          {selected.birthPlace ? ` - ${selected.birthPlace}` : ''}
        </div>
        <div className={styles.actionRow}>
          <button
            type="button"
            className={styles.button}
            onClick={() => onRootChange(selected.id)}
          >
            Centrer
          </button>
          <button
            type="button"
            className={styles.dangerButton}
            disabled={!token}
            onClick={() => onRequestDeleteBranch(selected)}
          >
            Supprimer branche
          </button>
        </div>
        <div className={styles.actionRow}>
          <span className={styles.tag}>
            {selectedNode?.parents.length || 0} parents
          </span>
          <span className={styles.tag}>
            {selectedNode?.children.length || 0} enfants
          </span>
          <span className={styles.tag}>
            {selectedNode?.unions.length || 0} unions
          </span>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelTitle}>Fiche</div>
        <form className={styles.fieldGrid} onSubmit={savePerson}>
          <label className={styles.label}>
            Prenoms
            <input
              className={styles.input}
              value={form.givenNames}
              onChange={(event) => setForm({ ...form, givenNames: event.target.value })}
            />
          </label>
          <label className={styles.label}>
            Nom d'usage
            <input
              className={styles.input}
              value={form.usageSurname}
              onChange={(event) => setForm({ ...form, usageSurname: event.target.value })}
            />
          </label>
          <label className={styles.label}>
            Nom de naissance
            <input
              className={styles.input}
              value={form.birthSurname}
              onChange={(event) => setForm({ ...form, birthSurname: event.target.value })}
            />
          </label>
          <label className={styles.label}>
            Genre
            <select
              className={styles.select}
              value={form.gender}
              onChange={(event) => setForm({ ...form, gender: event.target.value })}
            >
              <option value="UNKNOWN">Inconnu</option>
              <option value="MALE">Homme</option>
              <option value="FEMALE">Femme</option>
              <option value="OTHER">Autre</option>
            </select>
          </label>
          <label className={styles.label}>
            Naissance
            <input
              className={styles.input}
              type="date"
              value={form.birthDate}
              onChange={(event) => setForm({ ...form, birthDate: event.target.value })}
            />
          </label>
          <label className={styles.label}>
            Lieu de naissance
            <input
              className={styles.input}
              value={form.birthPlace}
              onChange={(event) => setForm({ ...form, birthPlace: event.target.value })}
            />
          </label>
          <label className={styles.label}>
            Deces
            <input
              className={styles.input}
              type="date"
              value={form.deathDate}
              onChange={(event) => setForm({ ...form, deathDate: event.target.value })}
            />
          </label>
          <label className={styles.label}>
            Notes
            <textarea
              className={styles.textarea}
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </label>
          <button className={`${styles.button} ${styles.primaryButton}`} disabled={!token || busy}>
            Enregistrer
          </button>
        </form>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelTitle}>Ajouter depuis l'arbre</div>
        <div className={styles.actionRow}>
          {(['parent', 'child', 'spouse'] as ActionMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`${styles.toggle} ${actionMode === mode ? styles.toggleActive : ''}`}
              onClick={() => setActionMode(actionMode === mode ? null : mode)}
              disabled={!token}
            >
              {mode === 'parent' ? 'Parent' : mode === 'child' ? 'Enfant' : 'Conjoint'}
            </button>
          ))}
        </div>
        {actionMode ? (
          <form className={styles.fieldGrid} onSubmit={createRelative}>
            <label className={styles.label}>
              Prenoms
              <input
                className={styles.input}
                value={newPerson.givenNames}
                onChange={(event) =>
                  setNewPerson({ ...newPerson, givenNames: event.target.value })
                }
              />
            </label>
            <label className={styles.label}>
              Nom
              <input
                className={styles.input}
                value={newPerson.usageSurname}
                onChange={(event) =>
                  setNewPerson({ ...newPerson, usageSurname: event.target.value })
                }
              />
            </label>
            <label className={styles.label}>
              Genre
              <select
                className={styles.select}
                value={newPerson.gender}
                onChange={(event) =>
                  setNewPerson({ ...newPerson, gender: event.target.value })
                }
              >
                <option value="UNKNOWN">Inconnu</option>
                <option value="MALE">Homme</option>
                <option value="FEMALE">Femme</option>
                <option value="OTHER">Autre</option>
              </select>
            </label>
            <button className={styles.button} disabled={busy || !token}>
              Creer le lien
            </button>
          </form>
        ) : null}
      </section>
    </aside>
  );
}

function toInputDate(value?: string | null) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function emptyToNull(data: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      typeof value === 'string' && value.trim() === '' ? null : value,
    ]),
  );
}
