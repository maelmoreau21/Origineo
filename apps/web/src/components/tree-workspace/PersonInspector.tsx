'use client';

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  documentApi,
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

type TreeNode = TreeWindow['nodes'][number];

type UnionGroup = {
  key: string;
  union?: any;
  unionId?: string;
  partnerId?: string;
  partner?: Person;
  title: string;
  subtitle: string;
  children: Person[];
  warnings: string[];
  inferred: boolean;
};

const CATEGORY_OPTIONS = [
  { value: 'PHOTO', label: 'Photo' },
  { value: 'BIRTH_CERTIFICATE', label: 'Acte naissance' },
  { value: 'DEATH_CERTIFICATE', label: 'Acte deces' },
  { value: 'MARRIAGE_CERTIFICATE', label: 'Acte mariage' },
  { value: 'OFFICIAL_DOCUMENT', label: 'Document officiel' },
  { value: 'OTHER', label: 'Autre' },
];

const CATEGORY_LABELS: Record<string, string> = {
  BIRTH_CERT: 'Acte naissance',
  DEATH_CERT: 'Acte deces',
  MARRIAGE_CERT: 'Acte mariage',
  BIRTH_CERTIFICATE: 'Acte naissance',
  DEATH_CERTIFICATE: 'Acte deces',
  MARRIAGE_CERTIFICATE: 'Acte mariage',
  PHOTO: 'Photo',
  OFFICIAL_DOCUMENT: 'Document officiel',
  OTHER: 'Autre',
};

const UNION_TYPE_LABELS: Record<string, string> = {
  MARRIAGE: 'Mariage',
  PACS: 'PACS',
  PARTNERSHIP: 'Partenariat',
  OTHER: 'Union',
};

export default function PersonInspector({
  tree,
  selectedPersonId,
  token,
  onSaved,
  onRootChange,
  onRequestDeleteBranch,
}: Props) {
  const selectedNode = useMemo(
    () => tree?.nodes.find((node) => node.person.id === selectedPersonId),
    [tree, selectedPersonId],
  );
  const selected = selectedNode?.person;
  const unionGroups = useMemo(
    () => (tree && selectedNode ? buildUnionGroups(tree, selectedNode) : []),
    [tree, selectedNode],
  );
  const integrityWarnings = useMemo(
    () => buildIntegrityWarnings(selectedNode, unionGroups),
    [selectedNode, unionGroups],
  );
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

  if (!selected || !selectedNode) {
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
          <a className={styles.button} href={`/person/${selected.id}`}>
            Fiche complete
          </a>
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
            {selectedNode.parents.length || 0} parents
          </span>
          <span className={styles.tag}>
            {selectedNode.children.length || 0} enfants
          </span>
          <span className={styles.tag}>
            {selectedNode.unions.length || 0} unions
          </span>
        </div>
        {integrityWarnings.length > 0 ? (
          <WarningList warnings={integrityWarnings} />
        ) : null}
      </section>

      <UnionChildrenPanel groups={unionGroups} token={token} />

      <section className={styles.panel}>
        <EntityDocumentsPanel
          entityId={selected.id}
          ownerType="person"
          title="Documents personne"
          subtitle="Fichiers rattaches a cette personne."
          token={token}
          defaultCategory="OTHER"
        />
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

function UnionChildrenPanel({
  groups,
  token,
}: {
  groups: UnionGroup[];
  token: string | null;
}) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelTitle}>Unions et enfants</div>
      {groups.length === 0 ? (
        <div className={styles.muted}>Aucune union ou descendance visible.</div>
      ) : (
        <div className={styles.unionGrid}>
          {groups.map((group) => (
            <article key={group.key} className={styles.unionCard}>
              <div className={styles.unionHeader}>
                <div>
                  <div className={styles.unionTitle}>{group.title}</div>
                  <div className={styles.muted}>{group.subtitle}</div>
                </div>
                <span className={styles.tag}>
                  {group.inferred ? 'Coparent visuel' : unionTypeLabel(group.union?.type)}
                </span>
              </div>

              {group.children.length > 0 ? (
                <div className={styles.personChipList}>
                  {group.children.map((child) => (
                    <a
                      key={child.id}
                      className={styles.personChip}
                      href={`/person/${child.id}`}
                    >
                      {personLabel(child)}
                    </a>
                  ))}
                </div>
              ) : (
                <div className={styles.muted}>Aucun enfant visible pour cette union.</div>
              )}

              {group.warnings.length > 0 ? (
                <WarningList warnings={group.warnings} />
              ) : null}

              {group.unionId ? (
                <EntityDocumentsPanel
                  entityId={group.unionId}
                  ownerType="union"
                  title="Documents union"
                  subtitle="Actes, photos et preuves du couple."
                  token={token}
                  defaultCategory="MARRIAGE_CERTIFICATE"
                  compact
                />
              ) : (
                <div className={styles.muted}>
                  Creez une union reelle pour attacher des documents de couple.
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function EntityDocumentsPanel({
  entityId,
  ownerType,
  title,
  subtitle,
  token,
  defaultCategory,
  compact = false,
}: {
  entityId: string;
  ownerType: 'person' | 'union';
  title: string;
  subtitle: string;
  token: string | null;
  defaultCategory: string;
  compact?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState(defaultCategory);
  const [description, setDescription] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const request =
      ownerType === 'person'
        ? documentApi.getByPerson(entityId)
        : documentApi.getByUnion(entityId);

    request
      .then((result) => {
        if (!alive) return;
        setDocuments(Array.isArray(result.data) ? result.data : []);
      })
      .catch(() => {
        if (!alive) return;
        setDocuments([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [entityId, ownerType]);

  async function refreshDocuments() {
    const result =
      ownerType === 'person'
        ? await documentApi.getByPerson(entityId)
        : await documentApi.getByUnion(entityId);
    setDocuments(Array.isArray(result.data) ? result.data : []);
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !token) return;

    setUploading(true);
    try {
      await documentApi.upload(
        file,
        {
          personId: ownerType === 'person' ? entityId : undefined,
          unionId: ownerType === 'union' ? entityId : undefined,
          category,
          description: description.trim() || undefined,
        },
        token,
      );
      await refreshDocuments();
      setDescription('');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDelete(documentId: string) {
    if (!token) return;
    if (!window.confirm('Supprimer ce document ?')) return;

    await documentApi.delete(documentId, token);
    setDocuments((current) => current.filter((document) => document.id !== documentId));
  }

  return (
    <div className={compact ? styles.compactDocumentPanel : undefined}>
      <div className={styles.documentHeader}>
        <div>
          <div className={styles.panelTitle}>
            {title} ({documents.length})
          </div>
          <div className={styles.muted}>{subtitle}</div>
        </div>
      </div>

      {token ? (
        <div className={styles.documentControls}>
          <select
            className={styles.select}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            className={styles.input}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description"
          />
          <label className={`${styles.button} ${styles.primaryButton}`}>
            {uploading ? 'Envoi...' : 'Ajouter'}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx"
              onChange={handleUpload}
              disabled={uploading}
              hidden
            />
          </label>
        </div>
      ) : null}

      {loading ? (
        <div className={styles.muted}>Chargement des documents...</div>
      ) : documents.length === 0 ? (
        <div className={styles.muted}>Aucun document.</div>
      ) : (
        <div className={styles.documentList}>
          {documents.map((document) => (
            <div key={document.id} className={styles.documentItem}>
              <div className={styles.documentThumb}>
                {isImageMimeType(document.mimeType) ? (
                  <img src={documentApi.viewUrl(document.id)} alt={document.filename} />
                ) : (
                  <span>PDF</span>
                )}
              </div>
              <div className={styles.documentMeta}>
                <div className={styles.documentName}>{document.filename}</div>
                <div className={styles.muted}>
                  {CATEGORY_LABELS[document.category] || document.category}
                  {document.description ? ` - ${document.description}` : ''}
                </div>
                <div className={styles.documentActions}>
                  <a href={documentApi.viewUrl(document.id)} target="_blank">
                    Voir
                  </a>
                  <a href={documentApi.downloadUrl(document.id)}>Telecharger</a>
                  {token ? (
                    <button type="button" onClick={() => handleDelete(document.id)}>
                      Supprimer
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WarningList({ warnings }: { warnings: string[] }) {
  return (
    <div className={styles.warningList}>
      {unique(warnings).map((warning) => (
        <div key={warning} className={styles.warning}>
          {warning}
        </div>
      ))}
    </div>
  );
}

function buildUnionGroups(tree: TreeWindow, selectedNode: TreeNode): UnionGroup[] {
  const selectedId = selectedNode.person.id;
  const peopleById = new Map(tree.nodes.map((node) => [node.person.id, node.person]));
  const parentsByChild = new Map<string, string[]>();
  const selectedUnions = uniqueById([
    ...tree.unions.filter(
      (union) => union.partner1Id === selectedId || union.partner2Id === selectedId,
    ),
    ...(selectedNode.unions || []),
  ]);
  const groups = new Map<string, UnionGroup>();
  const unionKeyByPartner = new Map<string, string>();

  for (const relationship of tree.relationships) {
    parentsByChild.set(relationship.childId, [
      ...(parentsByChild.get(relationship.childId) || []),
      relationship.parentId,
    ]);
  }

  for (const union of selectedUnions) {
    const partnerId = union.partner1Id === selectedId ? union.partner2Id : union.partner1Id;
    const partner = peopleById.get(partnerId);
    const key = `union-${union.id}`;
    unionKeyByPartner.set(partnerId, key);
    groups.set(key, {
      key,
      union,
      unionId: union.id,
      partnerId,
      partner,
      title: partner ? personLabel(partner) : `Partenaire ${partnerId.slice(0, 8)}`,
      subtitle: formatUnionLine(union),
      children: [],
      warnings: [],
      inferred: false,
    });
  }

  for (const childId of selectedNode.children || []) {
    const child = peopleById.get(childId);
    if (!child) continue;

    const parentIds = unique(parentsByChild.get(childId) || [selectedId]);
    const otherParentIds = parentIds.filter((id) => id !== selectedId);
    const firstOtherParentId = otherParentIds[0];
    const realUnionKey = firstOtherParentId
      ? unionKeyByPartner.get(firstOtherParentId)
      : undefined;
    const key = realUnionKey || (firstOtherParentId ? `coparent-${firstOtherParentId}` : 'single-parent');

    if (!groups.has(key)) {
      const partner = firstOtherParentId ? peopleById.get(firstOtherParentId) : undefined;
      groups.set(key, {
        key,
        partnerId: firstOtherParentId,
        partner,
        title: partner ? personLabel(partner) : 'Parent inconnu',
        subtitle: firstOtherParentId
          ? 'Coparent deduit des parents de l enfant'
          : 'Enfants rattaches a un seul parent visible',
        children: [],
        warnings: [],
        inferred: true,
      });
    }

    const group = groups.get(key)!;
    group.children.push(child);

    if (parentIds.length > 2) {
      group.warnings.push(`${personLabel(child)} a plus de deux parents enregistres.`);
    }
    if (firstOtherParentId && !realUnionKey) {
      group.warnings.push(
        `${personLabel(child)} a un coparent mais aucune union reelle pour ce couple.`,
      );
    }
    if (!firstOtherParentId) {
      group.warnings.push(`${personLabel(child)} n a qu un parent visible dans cette fenetre.`);
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (a.inferred !== b.inferred) return a.inferred ? 1 : -1;
    return a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' });
  });
}

function buildIntegrityWarnings(
  selectedNode: TreeNode | undefined,
  groups: UnionGroup[],
) {
  if (!selectedNode) return [];
  const warnings: string[] = [];
  if (selectedNode.parents.length > 2) {
    warnings.push('Cette personne a plus de deux parents enregistres.');
  }
  for (const group of groups) {
    warnings.push(...group.warnings);
  }
  return unique(warnings);
}

function formatUnionLine(union: any) {
  const type = unionTypeLabel(union.type);
  const date = formatDateValue(union.startDate);
  const place = union.startPlace;
  if (date || place) {
    return [type, date, place].filter(Boolean).join(' - ');
  }
  return `${type} sans date ni lieu`;
}

function unionTypeLabel(type?: string | null) {
  if (!type) return 'Union';
  return UNION_TYPE_LABELS[type] || type;
}

function formatDateValue(value?: string | null) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return parsed.toLocaleDateString('fr-FR');
}

function isImageMimeType(mimeType?: string) {
  return Boolean(mimeType?.startsWith('image/'));
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

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function uniqueById<T extends { id: string }>(values: T[]) {
  const byId = new Map<string, T>();
  for (const value of values) {
    byId.set(value.id, value);
  }
  return Array.from(byId.values());
}
