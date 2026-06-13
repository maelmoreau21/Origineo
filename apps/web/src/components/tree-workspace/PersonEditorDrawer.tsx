'use client';

import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BookOpen,
  CalendarDays,
  FileText,
  Heart,
  Link2,
  Lock,
  Save,
  ShieldAlert,
  Trash2,
  Upload,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import {
  documentApi,
  personApi,
  sourceApi,
  unionApi,
} from '@/lib/api';
import { RelativeLinkType } from './AddRelativeModal';
import {
  buildUnionGroups,
  formatShortDate,
  readApiList,
  unionEndReasonLabel,
  unionTypeLabel,
  UnionGroup,
} from './family-helpers';
import {
  formFromPerson,
  payloadFromPersonForm,
  PersonFormState,
  toDateInput,
} from './person-form';
import styles from './TreeWorkspace.module.css';
import { Person, personLabel, TreeWindow } from './types';

export type PersonEditorTab =
  | 'identity'
  | 'events'
  | 'family'
  | 'documents'
  | 'sources'
  | 'danger';

type Props = {
  open: boolean;
  treeId: string;
  tree: TreeWindow | null;
  person: Person | null;
  token: string | null;
  initialTab: PersonEditorTab;
  onClose: () => void;
  onSaved: (personId?: string) => void | Promise<void>;
  onRequestAddRelative: (personId: string, linkType?: RelativeLinkType | null) => void;
  onRequestDeleteBranch: (person: Person) => void;
};

const TAB_ITEMS: Array<{
  id: PersonEditorTab;
  label: string;
  icon: typeof UserRound;
}> = [
  { id: 'identity', label: 'Identite', icon: UserRound },
  { id: 'events', label: 'Evenements', icon: CalendarDays },
  { id: 'family', label: 'Famille', icon: Users },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'sources', label: 'Sources', icon: BookOpen },
  { id: 'danger', label: 'Danger', icon: ShieldAlert },
];

const UNION_TYPES = [
  { value: 'MARRIAGE', label: 'Mariage' },
  { value: 'PACS', label: 'PACS' },
  { value: 'PARTNERSHIP', label: 'Partenariat' },
  { value: 'OTHER', label: 'Autre' },
];

const UNION_END_REASONS = [
  { value: '', label: 'Non renseigne' },
  { value: 'DIVORCE', label: 'Divorce' },
  { value: 'DEATH', label: 'Deces' },
  { value: 'ANNULMENT', label: 'Annulation' },
  { value: 'OTHER', label: 'Autre' },
];

const DOCUMENT_CATEGORIES = [
  { value: 'PHOTO', label: 'Photo' },
  { value: 'BIRTH_CERTIFICATE', label: 'Acte naissance' },
  { value: 'DEATH_CERTIFICATE', label: 'Acte deces' },
  { value: 'MARRIAGE_CERTIFICATE', label: 'Acte mariage' },
  { value: 'OFFICIAL_DOCUMENT', label: 'Document officiel' },
  { value: 'OTHER', label: 'Autre' },
];

export default function PersonEditorDrawer({
  open,
  treeId,
  tree,
  person,
  token,
  initialTab,
  onClose,
  onSaved,
  onRequestAddRelative,
  onRequestDeleteBranch,
}: Props) {
  const [activeTab, setActiveTab] = useState<PersonEditorTab>(initialTab);
  const [form, setForm] = useState<PersonFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedNode = useMemo(
    () => tree?.nodes.find((node) => node.person.id === person?.id),
    [person?.id, tree],
  );
  const unionGroups = useMemo(
    () => (tree && selectedNode ? buildUnionGroups(tree, selectedNode) : []),
    [selectedNode, tree],
  );

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, open]);

  useEffect(() => {
    if (person) setForm(formFromPerson(person));
    setError(null);
    setSaving(false);
  }, [person?.id, person]);

  if (!open || !person) return null;

  async function savePerson(event?: FormEvent) {
    event?.preventDefault();
    if (!token || !person || !form) return;
    if (!form.givenNames.trim()) {
      setError('Les prenoms sont obligatoires.');
      setActiveTab('identity');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await personApi.update(person.id, payloadFromPersonForm(form), token, treeId);
      await onSaved(person.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={styles.editorOverlay}
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className={styles.editorDrawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="person-editor-title"
      >
        <header className={styles.editorHeader}>
          <div>
            <span>Edition personne</span>
            <h2 id="person-editor-title">{personLabel(person)}</h2>
          </div>
          <div className={styles.editorHeaderActions}>
            <button
              type="button"
              className={styles.proButton}
              onClick={() => void savePerson()}
              disabled={saving || !token}
            >
              <Save size={15} />
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
            <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Fermer">
              <X size={17} />
            </button>
          </div>
        </header>

        {!token ? (
          <div className={styles.editorLocked}>
            <Lock size={26} />
            <strong>Session admin requise</strong>
            <span>Connectez-vous pour modifier les donnees genealogiques.</span>
            <a className={styles.proButton} href="/tree-settings?tab=login">
              Ouvrir la connexion
            </a>
          </div>
        ) : form ? (
          <>
            <nav className={styles.editorTabs} aria-label="Onglets edition">
              {TAB_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={activeTab === item.id ? styles.editorTabActive : ''}
                    onClick={() => setActiveTab(item.id)}
                  >
                    <Icon size={15} />
                    {item.label}
                  </button>
                );
              })}
            </nav>

            {error ? <div className={styles.editorError}>{error}</div> : null}

            <form className={styles.editorBody} onSubmit={savePerson}>
              {activeTab === 'identity' ? (
                <IdentityEditor form={form} setForm={setForm} />
              ) : null}

              {activeTab === 'events' ? (
                <EventsEditor form={form} setForm={setForm} />
              ) : null}

              {activeTab === 'family' ? (
                <FamilyEditor
                  treeId={treeId}
                  person={person}
                  groups={unionGroups}
                  token={token}
                  onSaved={onSaved}
                  onRequestAddRelative={onRequestAddRelative}
                />
              ) : null}

              {activeTab === 'documents' ? (
                <DocumentManager
                  entityId={person.id}
                  ownerType="person"
                  token={token}
                  title="Documents de la personne"
                />
              ) : null}

              {activeTab === 'sources' ? (
                <SourceManager personId={person.id} treeId={treeId} token={token} />
              ) : null}

              {activeTab === 'danger' ? (
                <DangerEditor person={person} onRequestDeleteBranch={onRequestDeleteBranch} />
              ) : null}

              {(activeTab === 'identity' || activeTab === 'events') ? (
                <div className={styles.editorFooter}>
                  <button type="button" className={styles.proButton} onClick={onClose}>
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className={`${styles.proButton} ${styles.proButtonPrimary}`}
                    disabled={saving}
                  >
                    <Save size={15} />
                    {saving ? 'Enregistrement...' : 'Enregistrer la fiche'}
                  </button>
                </div>
              ) : null}
            </form>
          </>
        ) : null}
      </aside>
    </div>
  );
}

function IdentityEditor({
  form,
  setForm,
}: {
  form: PersonFormState;
  setForm: (form: PersonFormState) => void;
}) {
  return (
    <div className={styles.editorGrid}>
      <EditorSection title="Noms et identite">
        <Field label="Prenoms" required>
          <input
            value={form.givenNames}
            onChange={(event) => setForm({ ...form, givenNames: event.target.value })}
            autoFocus
          />
        </Field>
        <div className={styles.editorTwoColumns}>
          <Field label="Nom d usage">
            <input
              value={form.usageSurname}
              onChange={(event) => setForm({ ...form, usageSurname: event.target.value })}
            />
          </Field>
          <Field label="Nom de naissance">
            <input
              value={form.birthSurname}
              onChange={(event) => setForm({ ...form, birthSurname: event.target.value })}
            />
          </Field>
        </div>
        <div className={styles.editorTwoColumns}>
          <Field label="Surnom">
            <input
              value={form.nickname}
              onChange={(event) => setForm({ ...form, nickname: event.target.value })}
            />
          </Field>
          <Field label="Titre">
            <input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </Field>
        </div>
        <Field label="Genre">
          <select
            value={form.gender}
            onChange={(event) =>
              setForm({ ...form, gender: event.target.value as Person['gender'] })
            }
          >
            <option value="UNKNOWN">Inconnu</option>
            <option value="MALE">Homme</option>
            <option value="FEMALE">Femme</option>
            <option value="OTHER">Autre</option>
          </select>
        </Field>
      </EditorSection>

      <EditorSection title="Details personnels">
        <div className={styles.editorTwoColumns}>
          <Field label="Nationalite">
            <input
              value={form.nationality}
              onChange={(event) => setForm({ ...form, nationality: event.target.value })}
            />
          </Field>
          <Field label="Religion">
            <input
              value={form.religion}
              onChange={(event) => setForm({ ...form, religion: event.target.value })}
            />
          </Field>
        </div>
        <Field label="Education">
          <input
            value={form.education}
            onChange={(event) => setForm({ ...form, education: event.target.value })}
          />
        </Field>
        <Field label="Description physique">
          <textarea
            rows={3}
            value={form.physicalDescription}
            onChange={(event) =>
              setForm({ ...form, physicalDescription: event.target.value })
            }
          />
        </Field>
        <div className={styles.editorTwoColumns}>
          <Field label="Professions (une par ligne)">
            <textarea
              rows={5}
              value={form.professions}
              onChange={(event) => setForm({ ...form, professions: event.target.value })}
            />
          </Field>
          <Field label="Residences (une par ligne)">
            <textarea
              rows={5}
              value={form.residences}
              onChange={(event) => setForm({ ...form, residences: event.target.value })}
            />
          </Field>
        </div>
        <Field label="Notes">
          <textarea
            rows={6}
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
          />
        </Field>
        <label className={styles.editorCheck}>
          <input
            type="checkbox"
            checked={form.isRootDefault}
            onChange={(event) => setForm({ ...form, isRootDefault: event.target.checked })}
          />
          Definir comme racine par defaut
        </label>
      </EditorSection>
    </div>
  );
}

function EventsEditor({
  form,
  setForm,
}: {
  form: PersonFormState;
  setForm: (form: PersonFormState) => void;
}) {
  return (
    <div className={styles.editorGrid}>
      <EditorSection title="Naissance et bapteme">
        <div className={styles.editorTwoColumns}>
          <Field label="Date naissance">
            <input
              type="date"
              value={form.birthDate}
              onChange={(event) => setForm({ ...form, birthDate: event.target.value })}
            />
          </Field>
          <Field label="Lieu naissance">
            <input
              value={form.birthPlace}
              onChange={(event) => setForm({ ...form, birthPlace: event.target.value })}
            />
          </Field>
        </div>
        <div className={styles.editorTwoColumns}>
          <Field label="Date bapteme">
            <input
              type="date"
              value={form.baptismDate}
              onChange={(event) => setForm({ ...form, baptismDate: event.target.value })}
            />
          </Field>
          <Field label="Lieu bapteme">
            <input
              value={form.baptismPlace}
              onChange={(event) => setForm({ ...form, baptismPlace: event.target.value })}
            />
          </Field>
        </div>
      </EditorSection>

      <EditorSection title="Deces et inhumation">
        <div className={styles.editorTwoColumns}>
          <Field label="Date deces">
            <input
              type="date"
              value={form.deathDate}
              onChange={(event) => setForm({ ...form, deathDate: event.target.value })}
            />
          </Field>
          <Field label="Lieu deces">
            <input
              value={form.deathPlace}
              onChange={(event) => setForm({ ...form, deathPlace: event.target.value })}
            />
          </Field>
        </div>
        <Field label="Cause deces">
          <input
            value={form.deathCause}
            onChange={(event) => setForm({ ...form, deathCause: event.target.value })}
          />
        </Field>
        <div className={styles.editorTwoColumns}>
          <Field label="Date inhumation">
            <input
              type="date"
              value={form.burialDate}
              onChange={(event) => setForm({ ...form, burialDate: event.target.value })}
            />
          </Field>
          <Field label="Lieu inhumation">
            <input
              value={form.burialPlace}
              onChange={(event) => setForm({ ...form, burialPlace: event.target.value })}
            />
          </Field>
        </div>
      </EditorSection>
    </div>
  );
}

function FamilyEditor({
  treeId,
  person,
  groups,
  token,
  onSaved,
  onRequestAddRelative,
}: {
  treeId: string;
  person: Person;
  groups: UnionGroup[];
  token: string;
  onSaved: (personId?: string) => void | Promise<void>;
  onRequestAddRelative: Props['onRequestAddRelative'];
}) {
  return (
    <div className={styles.editorGrid}>
      <EditorSection title="Ajouter un proche">
        <div className={styles.editorActionGrid}>
          <button type="button" onClick={() => onRequestAddRelative(person.id, 'FATHER')}>
            Pere
          </button>
          <button type="button" onClick={() => onRequestAddRelative(person.id, 'MOTHER')}>
            Mere
          </button>
          <button type="button" onClick={() => onRequestAddRelative(person.id, 'SPOUSE')}>
            Conjoint
          </button>
          <button type="button" onClick={() => onRequestAddRelative(person.id, 'CHILD')}>
            Enfant
          </button>
        </div>
      </EditorSection>

      <EditorSection title="Unions et coparents">
        {groups.length === 0 ? (
          <div className={styles.proEmptyInline}>Aucune union visible.</div>
        ) : (
          <div className={styles.editorUnionStack}>
            {groups.map((group) => (
              <UnionEditorCard
                key={group.key}
                treeId={treeId}
                group={group}
                person={person}
                token={token}
                onSaved={onSaved}
              />
            ))}
          </div>
        )}
      </EditorSection>
    </div>
  );
}

function UnionEditorCard({
  treeId,
  group,
  person,
  token,
  onSaved,
}: {
  treeId: string;
  group: UnionGroup;
  person: Person;
  token: string;
  onSaved: (personId?: string) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(() => unionDraftFromGroup(group));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(unionDraftFromGroup(group));
  }, [group.unionId, group.union?.updatedAt]);

  async function saveUnion() {
    if (!group.unionId) return;
    setBusy(true);
    try {
      await unionApi.update(
        group.unionId,
        {
          type: draft.type,
          startDate: draft.startDate || null,
          startPlace: draft.startPlace.trim() || null,
          endDate: draft.endDate || null,
          endReason: draft.endReason || null,
          notes: draft.notes.trim() || null,
        },
        token,
        treeId,
      );
      await onSaved(person.id);
    } finally {
      setBusy(false);
    }
  }

  async function createMissingUnion() {
    if (!group.partnerId) return;
    setBusy(true);
    try {
      await unionApi.create(
        {
          partner1Id: person.id,
          partner2Id: group.partnerId,
          type: 'PARTNERSHIP',
        },
        token,
        treeId,
      );
      await onSaved(person.id);
    } finally {
      setBusy(false);
    }
  }

  async function deleteUnion() {
    if (!group.unionId || !window.confirm('Supprimer cette union ?')) return;
    setBusy(true);
    try {
      await unionApi.delete(group.unionId, token, treeId);
      await onSaved(person.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={styles.editorUnionCard}>
      <div className={styles.editorUnionTitle}>
        <div>
          <strong>{group.title}</strong>
          <span>{group.inferred ? 'Coparent deduit' : unionTypeLabel(group.union?.type)}</span>
        </div>
        {group.inferred ? <em>Union manquante</em> : null}
      </div>

      {group.unionId ? (
        <>
          <div className={styles.editorTwoColumns}>
            <Field label="Type">
              <select
                value={draft.type}
                onChange={(event) => setDraft({ ...draft, type: event.target.value })}
              >
                {UNION_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Motif fin">
              <select
                value={draft.endReason}
                onChange={(event) => setDraft({ ...draft, endReason: event.target.value })}
              >
                {UNION_END_REASONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className={styles.editorTwoColumns}>
            <Field label="Date debut">
              <input
                type="date"
                value={draft.startDate}
                onChange={(event) => setDraft({ ...draft, startDate: event.target.value })}
              />
            </Field>
            <Field label="Lieu debut">
              <input
                value={draft.startPlace}
                onChange={(event) => setDraft({ ...draft, startPlace: event.target.value })}
              />
            </Field>
          </div>
          <div className={styles.editorTwoColumns}>
            <Field label="Date fin">
              <input
                type="date"
                value={draft.endDate}
                onChange={(event) => setDraft({ ...draft, endDate: event.target.value })}
              />
            </Field>
            <Field label="Resume">
              <input
                value={[
                  unionTypeLabel(draft.type),
                  formatShortDate(draft.startDate),
                  unionEndReasonLabel(draft.endReason),
                ]
                  .filter(Boolean)
                  .join(' - ')}
                readOnly
              />
            </Field>
          </div>
          <Field label="Notes union">
            <textarea
              rows={3}
              value={draft.notes}
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
            />
          </Field>
          <div className={styles.editorInlineActions}>
            <button type="button" onClick={saveUnion} disabled={busy}>
              {busy ? 'Enregistrement...' : 'Enregistrer union'}
            </button>
            <button type="button" className={styles.editorDangerButton} onClick={deleteUnion} disabled={busy}>
              Supprimer union
            </button>
          </div>
        </>
      ) : (
        <div className={styles.editorMissingUnion}>
          <span>Cette famille a un coparent visible mais aucune union reelle.</span>
          <button type="button" onClick={createMissingUnion} disabled={busy || !group.partnerId}>
            <Link2 size={14} />
            {busy ? 'Creation...' : 'Creer union'}
          </button>
        </div>
      )}

      {group.children.length > 0 ? (
        <div className={styles.proChipList}>
          {group.children.map((child) => (
            <em key={child.id}>{personLabel(child)}</em>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function DocumentManager({
  entityId,
  ownerType,
  token,
  title,
}: {
  entityId: string;
  ownerType: 'person' | 'union';
  token: string;
  title: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [category, setCategory] = useState('OTHER');
  const [description, setDescription] = useState('');

  async function loadDocuments() {
    setLoading(true);
    try {
      const result =
        ownerType === 'person'
          ? await documentApi.getByPerson(entityId)
          : await documentApi.getByUnion(entityId);
      setDocuments(readApiList(result));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDocuments();
  }, [entityId, ownerType]);

  async function uploadFiles(files: FileList | File[]) {
    const fileList = Array.from(files).filter(Boolean);
    if (fileList.length === 0) return;

    setUploading(true);
    try {
      for (const file of fileList) {
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
      }
      setDescription('');
      await loadDocuments();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) void uploadFiles(event.target.files);
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);
    if (event.dataTransfer.files) void uploadFiles(event.dataTransfer.files);
  }

  async function deleteDocument(documentId: string) {
    if (!window.confirm('Supprimer ce document ?')) return;
    await documentApi.delete(documentId, token);
    setDocuments((current) => current.filter((document) => document.id !== documentId));
  }

  return (
    <div className={styles.editorGrid}>
      <EditorSection title={title}>
        <div className={styles.documentUploadControls}>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {DOCUMENT_CATEGORIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description"
          />
        </div>
        <label
          className={`${styles.editorDropZone} ${dragActive ? styles.editorDropZoneActive : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx"
            onChange={handleUpload}
            disabled={uploading}
            hidden
            multiple
          />
          <Upload size={22} />
          <strong>{uploading ? 'Envoi en cours...' : 'Deposer ou choisir des fichiers'}</strong>
          <span>Images, PDF, Word</span>
        </label>
      </EditorSection>

      <EditorSection title={`Pieces rattachees (${documents.length})`}>
        {loading ? <div className={styles.proEmptyInline}>Chargement...</div> : null}
        {!loading && documents.length === 0 ? (
          <div className={styles.proEmptyInline}>Aucun document.</div>
        ) : null}
        <div className={styles.proDocumentList}>
          {documents.map((document) => (
            <article key={document.id} className={styles.proDocumentItem}>
              <div className={styles.proDocumentThumb}>
                {document.mimeType?.startsWith('image/') ? (
                  <img src={documentApi.viewUrl(document.id)} alt={document.filename} />
                ) : (
                  <FileText size={18} />
                )}
              </div>
              <div>
                <strong>{document.filename}</strong>
                <span>{[document.category, document.description].filter(Boolean).join(' - ')}</span>
                <div className={styles.proInlineLinks}>
                  <a href={documentApi.viewUrl(document.id)} target="_blank">
                    Voir
                  </a>
                  <a href={documentApi.downloadUrl(document.id)}>Telecharger</a>
                  <button type="button" onClick={() => void deleteDocument(document.id)}>
                    Supprimer
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </EditorSection>
    </div>
  );
}

function SourceManager({
  personId,
  treeId,
  token,
}: {
  personId: string;
  treeId: string;
  token: string;
}) {
  const [links, setLinks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingCitation, setSavingCitation] = useState(false);
  const [linkingCitation, setLinkingCitation] = useState(false);
  const [citationForm, setCitationForm] = useState({
    sourceId: '',
    page: '',
    confidenceScore: '',
    transcription: '',
  });
  const [citationId, setCitationId] = useState('');

  async function loadSources() {
    setLoading(true);
    try {
      const result = await sourceApi.getCitationsByPerson(personId, treeId);
      setLinks(readApiList(result));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSources();
  }, [personId, treeId]);

  async function createCitationAndLink(event: FormEvent) {
    event.preventDefault();
    if (!citationForm.sourceId.trim()) return;
    setSavingCitation(true);
    try {
      const envelope = await sourceApi.createCitation(
        {
          sourceId: citationForm.sourceId.trim(),
          page: citationForm.page.trim() || undefined,
          confidenceScore: citationForm.confidenceScore
            ? Number(citationForm.confidenceScore)
            : undefined,
          transcription: citationForm.transcription.trim() || undefined,
        },
        token,
        treeId,
      );
      const created = envelope.data || envelope;
      await sourceApi.linkCitation({ citationId: created.id, personId }, token, treeId);
      setCitationForm({
        sourceId: '',
        page: '',
        confidenceScore: '',
        transcription: '',
      });
      await loadSources();
    } finally {
      setSavingCitation(false);
    }
  }

  async function linkExistingCitation(event: FormEvent) {
    event.preventDefault();
    if (!citationId.trim()) return;
    setLinkingCitation(true);
    try {
      await sourceApi.linkCitation({ citationId: citationId.trim(), personId }, token, treeId);
      setCitationId('');
      await loadSources();
    } finally {
      setLinkingCitation(false);
    }
  }

  return (
    <div className={styles.editorGrid}>
      <EditorSection title="Nouvelle citation">
        <div className={styles.editorTwoColumns}>
          <Field label="Source ID">
            <input
              value={citationForm.sourceId}
              onChange={(event) =>
                setCitationForm({ ...citationForm, sourceId: event.target.value })
              }
            />
          </Field>
          <Field label="Page / vue">
            <input
              value={citationForm.page}
              onChange={(event) =>
                setCitationForm({ ...citationForm, page: event.target.value })
              }
            />
          </Field>
        </div>
        <Field label="Confiance">
          <input
            type="number"
            min="0"
            max="100"
            value={citationForm.confidenceScore}
            onChange={(event) =>
              setCitationForm({ ...citationForm, confidenceScore: event.target.value })
            }
          />
        </Field>
        <Field label="Transcription">
          <textarea
            rows={5}
            value={citationForm.transcription}
            onChange={(event) =>
              setCitationForm({ ...citationForm, transcription: event.target.value })
            }
          />
        </Field>
        <div className={styles.editorInlineActions}>
          <button type="button" onClick={createCitationAndLink as any} disabled={savingCitation}>
            {savingCitation ? 'Creation...' : 'Creer et lier'}
          </button>
        </div>
      </EditorSection>

      <EditorSection title="Lier une citation existante">
        <div className={styles.documentUploadControls}>
          <input
            value={citationId}
            onChange={(event) => setCitationId(event.target.value)}
            placeholder="Citation ID"
          />
          <button type="button" onClick={linkExistingCitation as any} disabled={linkingCitation}>
            {linkingCitation ? 'Lien...' : 'Lier'}
          </button>
        </div>
      </EditorSection>

      <EditorSection title={`Sources rattachees (${links.length})`}>
        {loading ? <div className={styles.proEmptyInline}>Chargement...</div> : null}
        {!loading && links.length === 0 ? (
          <div className={styles.proEmptyInline}>Aucune source.</div>
        ) : null}
        <div className={styles.proSourceList}>
          {links.map((link) => {
            const citation = link.citation || link;
            return (
              <article key={link.id} className={styles.proSourceItem}>
                <strong>{citation?.source?.title || 'Source sans titre'}</strong>
                <span>
                  {[citation?.source?.repository?.name, citation?.page ? `page ${citation.page}` : null]
                    .filter(Boolean)
                    .join(' - ') || 'Reference sans detail'}
                </span>
                {citation?.confidenceScore !== undefined && citation?.confidenceScore !== null ? (
                  <em>{citation.confidenceScore}/100</em>
                ) : null}
                {citation?.transcription ? <p>{citation.transcription}</p> : null}
              </article>
            );
          })}
        </div>
      </EditorSection>
    </div>
  );
}

function DangerEditor({
  person,
  onRequestDeleteBranch,
}: {
  person: Person;
  onRequestDeleteBranch: (person: Person) => void;
}) {
  return (
    <div className={styles.editorGrid}>
      <section className={styles.editorDangerPanel}>
        <ShieldAlert size={24} />
        <div>
          <strong>Suppression protegee</strong>
          <span>
            Ouvre une confirmation avec choix: personne seule, descendants seuls,
            ou personne avec descendance.
          </span>
        </div>
        <button type="button" onClick={() => onRequestDeleteBranch(person)}>
          <Trash2 size={15} />
          Ouvrir les options
        </button>
      </section>
    </div>
  );
}

function EditorSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.editorSection}>
      <h3>{title}</h3>
      <div>{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={styles.editorField}>
      <span>
        {label}
        {required ? ' *' : ''}
      </span>
      {children}
    </label>
  );
}

function unionDraftFromGroup(group: UnionGroup) {
  const union = group.union || {};
  return {
    type: union.type || 'MARRIAGE',
    startDate: toDateInput(union.startDate),
    startPlace: union.startPlace || '',
    endDate: toDateInput(union.endDate),
    endReason: union.endReason || '',
    notes: union.notes || '',
  };
}
