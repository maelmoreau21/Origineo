'use client';

import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  documentApi,
  eventApi,
  personApi,
  sourceApi,
  unionApi,
} from '@/lib/api';
import {
  type TreeWorkspaceMode,
  useTreeWorkspaceMode,
} from './TreeWorkspaceContext';
import styles from './TreeWorkspace.module.css';
import { formatLife, Person, personLabel, TreeWindow } from './types';

type InspectorTab = 'timeline' | 'sources';

type Props = {
  tree: TreeWindow | null;
  selectedPersonId: string | null;
  token: string | null;
  mode?: TreeWorkspaceMode;
  onSaved: (personId?: string) => void;
  onRootChange: (personId: string) => void;
  onRequestAddRelative?: (personId: string) => void;
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

type PersonEvent = {
  id: string;
  type: string;
  date?: string | null;
  dateRaw?: string | null;
  notes?: string | null;
  place?: {
    id: string;
    name: string;
    subdivision?: string | null;
    region?: string | null;
    country?: string | null;
  } | null;
  participants?: Array<{
    personId?: string;
    role?: string | null;
    person?: Person;
  }>;
};

type CitationLink = {
  id: string;
  createdAt?: string;
  citation?: Citation;
};

type Citation = {
  id: string;
  page?: string | null;
  transcription?: string | null;
  confidenceScore?: number | null;
  source?: {
    id: string;
    title: string;
    text?: string | null;
    repository?: {
      id: string;
      name: string;
      type?: string | null;
      url?: string | null;
    } | null;
  } | null;
};

const EVENT_TYPE_OPTIONS = [
  { value: 'BIRTH', label: 'Naissance' },
  { value: 'BAPTISM', label: 'Bapteme' },
  { value: 'RESIDENCE', label: 'Residence' },
  { value: 'CENSUS', label: 'Recensement' },
  { value: 'MARRIAGE', label: 'Mariage' },
  { value: 'MILITARY_SERVICE', label: 'Service militaire' },
  { value: 'DEATH', label: 'Deces' },
  { value: 'BURIAL', label: 'Inhumation' },
  { value: 'OTHER', label: 'Autre' },
];

const EVENT_TYPE_LABELS = Object.fromEntries(
  EVENT_TYPE_OPTIONS.map((option) => [option.value, option.label]),
);

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
  mode: modeOverride,
  onSaved,
  onRootChange,
  onRequestAddRelative,
  onRequestDeleteBranch,
}: Props) {
  const { mode: contextMode } = useTreeWorkspaceMode();
  const mode = modeOverride ?? contextMode;
  const isConsultation = mode === 'consultation';
  const canMutate = Boolean(token) && !isConsultation;
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

  return (
    <aside className={styles.inspector}>
      <section className={`${styles.inspectorPanel} ${styles.inspectorHero}`}>
        <div className={styles.inspectorHeroTop}>
          <div className={styles.inspectorHeroIdentity}>
            <div className={styles.panelEyebrow}>Personne selectionnee</div>
            <h2 className={styles.personSummaryName}>{personLabel(selected)}</h2>
            <div className={styles.personSummaryLife}>
              {formatLife(selected) || 'Dates inconnues'}
            </div>
          </div>
          <span
            className={`${styles.modeBadge} ${
              isConsultation ? styles.modeBadgeReadOnly : styles.modeBadgeEdit
            }`}
          >
            {isConsultation ? 'Consultation' : 'Modification'}
          </span>
        </div>

        <div className={styles.inspectorMetrics}>
          <MetricCard label="Parents" value={selectedNode.parents.length} />
          <MetricCard label="Enfants" value={selectedNode.children.length} />
          <MetricCard label="Unions" value={unionGroups.length} />
        </div>

        <div className={styles.inspectorActions}>
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
        </div>
      </section>

      <InspectorAccordion
        index="01"
        title="Identite & infos vitales"
        subtitle="Sosa, dates et lieux normalises"
        defaultOpen
      >
        <IdentityVitals person={selected} node={selectedNode} />

        {!isConsultation ? (
          <form className={`${styles.fieldGrid} ${styles.editorCard}`} onSubmit={savePerson}>
            <div className={styles.formTitle}>Modifier la fiche</div>
            <label className={styles.label}>
              Prenoms
              <input
                className={styles.input}
                value={form.givenNames}
                onChange={(event) => setForm({ ...form, givenNames: event.target.value })}
              />
            </label>
            <div className={styles.twoColumnFields}>
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
            </div>
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
            <div className={styles.twoColumnFields}>
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
                Deces
                <input
                  className={styles.input}
                  type="date"
                  value={form.deathDate}
                  onChange={(event) => setForm({ ...form, deathDate: event.target.value })}
                />
              </label>
            </div>
            <label className={styles.label}>
              Lieu de naissance
              <input
                className={styles.input}
                value={form.birthPlace}
                onChange={(event) => setForm({ ...form, birthPlace: event.target.value })}
              />
            </label>
            <label className={styles.label}>
              Lieu de deces
              <input
                className={styles.input}
                value={form.deathPlace}
                onChange={(event) => setForm({ ...form, deathPlace: event.target.value })}
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
              {busy ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </form>
        ) : null}
      </InspectorAccordion>

      <DataQualityPanel
        warnings={integrityWarnings}
        groups={unionGroups}
        selectedPersonId={selected.id}
        token={token}
        canMutate={canMutate}
        onSaved={onSaved}
      />

      <UnionChildrenPanel
        groups={unionGroups}
        token={token}
        canMutate={canMutate}
      />

      <InspectorAccordion
        index="03"
        title="Documents de la personne"
        subtitle="Actes, photos et pieces directement rattaches au profil"
        defaultOpen
      >
        <EntityDocumentsPanel
          entityId={selected.id}
          ownerType="person"
          title="Pieces du profil"
          subtitle="Glissez un fichier ici ou utilisez le selecteur."
          token={token}
          canUpload={canMutate}
          defaultCategory="OTHER"
        />
      </InspectorAccordion>

      <PersonFactsTabs
        person={selected}
        token={token}
        canMutate={canMutate}
        onSaved={onSaved}
      />

      {!isConsultation ? (
        <InspectorAccordion
          index="05"
          title="Actions rapides"
          subtitle="Ajouter un proche depuis l'arbre"
        >
          <button
            type="button"
            className={`${styles.button} ${styles.primaryButton}`}
            disabled={!canMutate || !onRequestAddRelative}
            onClick={() => onRequestAddRelative?.(selected.id)}
          >
            Ajouter un proche
          </button>
          {!token ? (
            <div className={styles.formNotice}>Session admin requise.</div>
          ) : null}
        </InspectorAccordion>
      ) : null}

      {!isConsultation ? (
        <section className={`${styles.inspectorPanel} ${styles.dangerPanel}`}>
          <div className={styles.panelTitle}>Zone danger</div>
          <p className={styles.muted}>
            Choisissez au moment de confirmer : personne seule, descendants
            seulement, ou personne avec sa descendance.
          </p>
          <button
            type="button"
            className={styles.dangerButton}
            disabled={!token}
            onClick={() => onRequestDeleteBranch(selected)}
          >
            Ouvrir les options de suppression
          </button>
        </section>
      ) : null}
    </aside>
  );
}

function InspectorAccordion({
  index,
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  index: string;
  title: string;
  subtitle: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className={styles.inspectorAccordion} open={defaultOpen}>
      <summary className={styles.inspectorAccordionSummary}>
        <span className={styles.sectionIndex}>{index}</span>
        <span className={styles.sectionTitleBlock}>
          <span className={styles.sectionTitle}>{title}</span>
          <span className={styles.sectionSubtitle}>{subtitle}</span>
        </span>
        <span className={styles.accordionChevron} aria-hidden="true" />
      </summary>
      <div className={styles.inspectorAccordionBody}>{children}</div>
    </details>
  );
}

function IdentityVitals({
  person,
  node,
}: {
  person: Person;
  node: TreeNode;
}) {
  return (
    <div className={styles.identitySection}>
      <div className={styles.vitalCardGrid}>
        <VitalCard
          label="Sosa"
          value={formatSosaNumber(person)}
          detail={formatSosaHint(person)}
        />
        <VitalCard
          label="Naissance"
          value={formatDateValue(person.birthDate) || 'Date inconnue'}
          detail={person.birthPlace || 'Lieu non renseigne'}
        />
        <VitalCard
          label="Deces"
          value={formatDateValue(person.deathDate) || 'Date inconnue'}
          detail={person.deathPlace || 'Lieu non renseigne'}
        />
        <VitalCard
          label="Genre"
          value={genderLabel(person.gender)}
          detail={formatLife(person) || 'Dates de vie incompletes'}
        />
      </div>

      <div className={styles.identityTextGrid}>
        <InfoLine label="Nom d'usage" value={person.usageSurname || null} />
        <InfoLine label="Nom naissance" value={person.birthSurname || null} />
        <InfoLine label="Parents directs" value={String(node.parents.length || 0)} />
        <InfoLine label="Enfants directs" value={String(node.children.length || 0)} />
      </div>

      <div className={styles.normalizedPlaceGrid}>
        <NormalizedPlace label="Lieu naissance normalise" value={person.birthPlace} />
        <NormalizedPlace label="Lieu deces normalise" value={person.deathPlace} />
      </div>

      {person.notes ? (
        <div className={styles.readOnlyNote}>
          <span>Notes</span>
          <p>{person.notes}</p>
        </div>
      ) : null}
    </div>
  );
}

function VitalCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className={styles.vitalCard}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function NormalizedPlace({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  const parts = normalizedPlaceParts(value);

  return (
    <div className={styles.normalizedPlace}>
      <span>{label}</span>
      {parts.length > 0 ? (
        <div className={styles.placePillRow}>
          {parts.map((part) => (
            <strong key={part}>{part}</strong>
          ))}
        </div>
      ) : (
        <em>Non renseigne</em>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.metricCard}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function DataQualityPanel({
  warnings,
  groups,
  selectedPersonId,
  token,
  canMutate,
  onSaved,
}: {
  warnings: string[];
  groups: UnionGroup[];
  selectedPersonId: string;
  token: string | null;
  canMutate: boolean;
  onSaved: (personId?: string) => void;
}) {
  const [creatingUnionKey, setCreatingUnionKey] = useState<string | null>(null);
  const actionableGroups = groups.filter(
    (group) => group.inferred && group.partnerId,
  );

  async function createMissingUnion(group: UnionGroup) {
    if (!token || !canMutate || !group.partnerId) return;
    setCreatingUnionKey(group.key);
    try {
      await unionApi.create(
        {
          partner1Id: selectedPersonId,
          partner2Id: group.partnerId,
          type: 'PARTNERSHIP',
        },
        token,
      );
      onSaved(selectedPersonId);
    } finally {
      setCreatingUnionKey(null);
    }
  }

  return (
    <section className={`${styles.inspectorPanel} ${styles.qualityPanel}`}>
      <div className={styles.panelTitle}>Qualite des donnees</div>
      {warnings.length > 0 ? (
        <WarningList warnings={warnings} />
      ) : (
        <div className={styles.qualityOk}>
          Aucune anomalie visible dans cette fenetre.
        </div>
      )}
      {canMutate && actionableGroups.length > 0 ? (
        <div className={styles.actionRow}>
          {actionableGroups.map((group) => (
            <button
              key={group.key}
              type="button"
              className={styles.button}
              disabled={!token || creatingUnionKey === group.key}
              onClick={() => createMissingUnion(group)}
            >
              {creatingUnionKey === group.key
                ? 'Creation...'
                : `Creer l'union avec ${group.title}`}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function UnionChildrenPanel({
  groups,
  token,
  canMutate,
}: {
  groups: UnionGroup[];
  token: string | null;
  canMutate: boolean;
}) {
  const [activeDocumentUnionId, setActiveDocumentUnionId] = useState<string | null>(null);

  return (
    <InspectorAccordion
      index="02"
      title="Conjoints & unions"
      subtitle="Couples, enfants et documents propres a chaque union"
      defaultOpen
    >
      {groups.length === 0 ? (
        <div className={styles.emptyInline}>Aucune union ou descendance visible.</div>
      ) : (
        <div className={styles.unionGrid}>
          {groups.map((group) => (
            <article key={group.key} className={styles.unionCard}>
              <div className={styles.unionHeader}>
                <div>
                  <div className={styles.unionTitle}>{group.title}</div>
                  <div className={styles.muted}>{group.subtitle}</div>
                </div>
                <span className={styles.unionBadge}>
                  {group.inferred ? 'Coparent visuel' : unionTypeLabel(group.union?.type)}
                </span>
              </div>

              <div className={styles.unionMetaGrid}>
                <InfoLine label="Date union" value={formatDateValue(group.union?.startDate)} />
                <InfoLine label="Lieu union" value={group.union?.startPlace || null} />
              </div>

              {group.children.length > 0 ? (
                <div className={styles.unionChildrenBlock}>
                  <div className={styles.inlineLabel}>Enfants rattaches</div>
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
                </div>
              ) : (
                <div className={styles.muted}>Aucun enfant visible pour cette union.</div>
              )}

              {group.warnings.length > 0 ? (
                <WarningList warnings={group.warnings} />
              ) : null}

              {group.unionId ? (
                <div className={styles.unionDocumentArea}>
                  <button
                    type="button"
                    className={`${styles.button} ${canMutate ? styles.primaryButton : ''}`}
                    onClick={() =>
                      setActiveDocumentUnionId(
                        activeDocumentUnionId === group.unionId ? null : group.unionId || null,
                      )
                    }
                  >
                    {activeDocumentUnionId === group.unionId
                      ? 'Masquer les documents'
                      : canMutate
                        ? 'Lier un document'
                        : 'Voir les documents'}
                  </button>

                  {activeDocumentUnionId === group.unionId ? (
                    <EntityDocumentsPanel
                      entityId={group.unionId}
                      ownerType="union"
                      title="Documents de l'union"
                      subtitle="Contrat, acte de mariage ou preuve du couple."
                      token={token}
                      canUpload={canMutate}
                      defaultCategory="MARRIAGE_CERTIFICATE"
                      compact
                    />
                  ) : null}
                </div>
              ) : (
                <div className={styles.muted}>
                  {canMutate
                    ? 'Creez une union reelle pour attacher des documents de couple.'
                    : 'Union non materialisee dans les donnees.'}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </InspectorAccordion>
  );
}

function PersonFactsTabs({
  person,
  token,
  canMutate,
  onSaved,
}: {
  person: Person;
  token: string | null;
  canMutate: boolean;
  onSaved: (personId?: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<InspectorTab>('timeline');
  const [events, setEvents] = useState<PersonEvent[]>([]);
  const [citationLinks, setCitationLinks] = useState<CitationLink[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingCitations, setLoadingCitations] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [eventForm, setEventForm] = useState({
    type: 'RESIDENCE',
    date: '',
    dateRaw: '',
    role: 'SUBJECT',
    notes: '',
  });
  const [eventLinkForm, setEventLinkForm] = useState({
    eventId: '',
    role: 'SUBJECT',
  });
  const [citationForm, setCitationForm] = useState({
    sourceId: '',
    page: '',
    transcription: '',
    confidenceScore: '',
  });
  const [citationLinkForm, setCitationLinkForm] = useState({ citationId: '' });
  const [savingEvent, setSavingEvent] = useState(false);
  const [linkingEvent, setLinkingEvent] = useState(false);
  const [savingCitation, setSavingCitation] = useState(false);
  const [linkingCitation, setLinkingCitation] = useState(false);

  useEffect(() => {
    let alive = true;
    setNotice(null);
    setLoadingEvents(true);

    eventApi
      .getByPerson(person.id, 1, 80)
      .then((result) => {
        if (!alive) return;
        setEvents(readApiList<PersonEvent>(result));
      })
      .catch(() => {
        if (!alive) return;
        setEvents([]);
      })
      .finally(() => {
        if (alive) setLoadingEvents(false);
      });

    return () => {
      alive = false;
    };
  }, [person.id]);

  useEffect(() => {
    let alive = true;
    setLoadingCitations(true);

    sourceApi
      .getCitationsByPerson(person.id)
      .then((result) => {
        if (!alive) return;
        setCitationLinks(readApiList<CitationLink>(result));
      })
      .catch(() => {
        if (!alive) return;
        setCitationLinks([]);
      })
      .finally(() => {
        if (alive) setLoadingCitations(false);
      });

    return () => {
      alive = false;
    };
  }, [person.id]);

  async function refreshEvents() {
    const result = await eventApi.getByPerson(person.id, 1, 80);
    setEvents(readApiList<PersonEvent>(result));
  }

  async function refreshCitations() {
    const result = await sourceApi.getCitationsByPerson(person.id);
    setCitationLinks(readApiList<CitationLink>(result));
  }

  async function createTimelineEvent(event: FormEvent) {
    event.preventDefault();
    if (!token || !canMutate) return;

    const type = eventForm.type.trim();
    const role = eventForm.role.trim() || 'SUBJECT';
    const dateRaw = eventForm.dateRaw.trim();
    const notes = eventForm.notes.trim();

    if (!type) {
      setNotice("Le type d'evenement est obligatoire.");
      return;
    }

    if (!eventForm.date && !dateRaw) {
      setNotice('Ajoutez une date exacte ou une date libre.');
      return;
    }

    setSavingEvent(true);
    setNotice(null);
    try {
      await eventApi.create(
        {
          type,
          date: eventForm.date || null,
          dateRaw: dateRaw || null,
          notes: notes || null,
          participants: [{ personId: person.id, role }],
        },
        token,
      );
      setEventForm({
        type: eventForm.type,
        date: '',
        dateRaw: '',
        role,
        notes: '',
      });
      await refreshEvents();
      onSaved(person.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Creation de l'evenement impossible.");
    } finally {
      setSavingEvent(false);
    }
  }

  async function linkExistingEvent(event: FormEvent) {
    event.preventDefault();
    if (!token || !canMutate) return;

    const eventId = eventLinkForm.eventId.trim();
    if (!eventId) {
      setNotice("Indiquez l'identifiant de l'evenement a lier.");
      return;
    }

    setLinkingEvent(true);
    setNotice(null);
    try {
      await eventApi.attachParticipant(
        eventId,
        { personId: person.id, role: eventLinkForm.role.trim() || 'SUBJECT' },
        token,
      );
      setEventLinkForm({ ...eventLinkForm, eventId: '' });
      await refreshEvents();
      onSaved(person.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Lien d'evenement impossible.");
    } finally {
      setLinkingEvent(false);
    }
  }

  async function createCitationAndLink(event: FormEvent) {
    event.preventDefault();
    if (!token || !canMutate) return;

    const sourceId = citationForm.sourceId.trim();
    const confidenceScore = citationForm.confidenceScore.trim()
      ? Number(citationForm.confidenceScore)
      : undefined;

    if (!sourceId) {
      setNotice("Indiquez l'identifiant de la source.");
      return;
    }

    if (
      confidenceScore !== undefined &&
      (!Number.isFinite(confidenceScore) || confidenceScore < 0 || confidenceScore > 100)
    ) {
      setNotice('La confiance doit etre comprise entre 0 et 100.');
      return;
    }

    setSavingCitation(true);
    setNotice(null);
    try {
      const createdEnvelope = await sourceApi.createCitation(
        {
          sourceId,
          page: citationForm.page.trim() || undefined,
          transcription: citationForm.transcription.trim() || undefined,
          ...(confidenceScore !== undefined ? { confidenceScore } : {}),
        },
        token,
      );
      const created = createdEnvelope.data || createdEnvelope;

      if (!created.id) {
        throw new Error('Citation creee sans identifiant.');
      }

      await sourceApi.linkCitation({ citationId: created.id, personId: person.id }, token);
      setCitationForm({
        sourceId,
        page: '',
        transcription: '',
        confidenceScore: '',
      });
      await refreshCitations();
      onSaved(person.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Creation de citation impossible.');
    } finally {
      setSavingCitation(false);
    }
  }

  async function linkExistingCitation(event: FormEvent) {
    event.preventDefault();
    if (!token || !canMutate) return;

    const citationId = citationLinkForm.citationId.trim();
    if (!citationId) {
      setNotice("Indiquez l'identifiant de la citation.");
      return;
    }

    setLinkingCitation(true);
    setNotice(null);
    try {
      await sourceApi.linkCitation({ citationId, personId: person.id }, token);
      setCitationLinkForm({ citationId: '' });
      await refreshCitations();
      onSaved(person.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Lien de citation impossible.');
    } finally {
      setLinkingCitation(false);
    }
  }

  return (
    <InspectorAccordion
      index="04"
      title="Faits & sources"
      subtitle="Chronologie, evenements et citations"
    >
      <div className={styles.tabsRoot}>
        <div className={styles.tabList} role="tablist" aria-label="Faits">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'timeline'}
            className={`${styles.tabTrigger} ${activeTab === 'timeline' ? styles.tabTriggerActive : ''}`}
            onClick={() => setActiveTab('timeline')}
          >
            Chronologie ({events.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'sources'}
            className={`${styles.tabTrigger} ${activeTab === 'sources' ? styles.tabTriggerActive : ''}`}
            onClick={() => setActiveTab('sources')}
          >
            Sources ({citationLinks.length})
          </button>
        </div>

        {notice ? <div className={styles.formNotice}>{notice}</div> : null}

        {activeTab === 'timeline' ? (
          <div className={styles.tabPanel} role="tabpanel">
            {canMutate ? (
              <div className={styles.quickForms}>
                <form className={styles.compactForm} onSubmit={createTimelineEvent}>
                  <div className={styles.formTitle}>Nouvel evenement</div>
                  <label className={styles.label}>
                    Type
                    <input
                      className={styles.input}
                      list="person-event-type-options"
                      value={eventForm.type}
                      onChange={(event) =>
                        setEventForm({ ...eventForm, type: event.target.value })
                      }
                    />
                    <datalist id="person-event-type-options">
                      {EVENT_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </datalist>
                  </label>
                  <div className={styles.twoColumnFields}>
                    <label className={styles.label}>
                      Date
                      <input
                        className={styles.input}
                        type="date"
                        value={eventForm.date}
                        onChange={(event) =>
                          setEventForm({ ...eventForm, date: event.target.value })
                        }
                      />
                    </label>
                    <label className={styles.label}>
                      Date libre
                      <input
                        className={styles.input}
                        value={eventForm.dateRaw}
                        onChange={(event) =>
                          setEventForm({ ...eventForm, dateRaw: event.target.value })
                        }
                        placeholder="vers 1830"
                      />
                    </label>
                  </div>
                  <label className={styles.label}>
                    Role
                    <input
                      className={styles.input}
                      value={eventForm.role}
                      onChange={(event) =>
                        setEventForm({ ...eventForm, role: event.target.value })
                      }
                    />
                  </label>
                  <label className={styles.label}>
                    Notes
                    <textarea
                      className={styles.textarea}
                      value={eventForm.notes}
                      onChange={(event) =>
                        setEventForm({ ...eventForm, notes: event.target.value })
                      }
                    />
                  </label>
                  <button
                    className={`${styles.button} ${styles.primaryButton}`}
                    disabled={savingEvent}
                  >
                    {savingEvent ? 'Creation...' : 'Creer et lier'}
                  </button>
                </form>

                <form className={styles.compactForm} onSubmit={linkExistingEvent}>
                  <div className={styles.formTitle}>Lier un evenement</div>
                  <label className={styles.label}>
                    Event ID
                    <input
                      className={styles.input}
                      value={eventLinkForm.eventId}
                      onChange={(event) =>
                        setEventLinkForm({ ...eventLinkForm, eventId: event.target.value })
                      }
                    />
                  </label>
                  <label className={styles.label}>
                    Role
                    <input
                      className={styles.input}
                      value={eventLinkForm.role}
                      onChange={(event) =>
                        setEventLinkForm({ ...eventLinkForm, role: event.target.value })
                      }
                    />
                  </label>
                  <button className={styles.button} disabled={linkingEvent}>
                    {linkingEvent ? 'Lien...' : 'Lier'}
                  </button>
                </form>
              </div>
            ) : null}

            {loadingEvents ? (
              <div className={styles.muted}>Chargement de la chronologie...</div>
            ) : events.length === 0 ? (
              <div className={styles.emptyInline}>Aucun evenement lie a cette personne.</div>
            ) : (
              <div className={styles.timelineList}>
                {events.map((personEvent) => (
                  <article key={personEvent.id} className={styles.timelineItem}>
                    <div className={styles.timelineMarker} aria-hidden="true" />
                    <div className={styles.timelineContent}>
                      <div className={styles.timelineHeader}>
                        <div>
                          <div className={styles.timelineTitle}>
                            {eventTypeLabel(personEvent.type)}
                          </div>
                          <div className={styles.timelineDate}>
                            {formatDateValue(personEvent.date) ||
                              personEvent.dateRaw ||
                              'Date inconnue'}
                          </div>
                        </div>
                        <span className={styles.tag}>
                          {participantRoleFor(personEvent, person.id)}
                        </span>
                      </div>
                      {personEvent.place ? (
                        <div className={styles.timelinePlace}>
                          {formatPlace(personEvent.place)}
                        </div>
                      ) : null}
                      {personEvent.notes ? (
                        <div className={styles.timelineNotes}>{personEvent.notes}</div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className={styles.tabPanel} role="tabpanel">
            {canMutate ? (
              <div className={styles.quickForms}>
                <form className={styles.compactForm} onSubmit={createCitationAndLink}>
                  <div className={styles.formTitle}>Nouvelle citation</div>
                  <label className={styles.label}>
                    Source ID
                    <input
                      className={styles.input}
                      value={citationForm.sourceId}
                      onChange={(event) =>
                        setCitationForm({ ...citationForm, sourceId: event.target.value })
                      }
                    />
                  </label>
                  <div className={styles.twoColumnFields}>
                    <label className={styles.label}>
                      Page/vue
                      <input
                        className={styles.input}
                        value={citationForm.page}
                        onChange={(event) =>
                          setCitationForm({ ...citationForm, page: event.target.value })
                        }
                      />
                    </label>
                    <label className={styles.label}>
                      Confiance
                      <input
                        className={styles.input}
                        type="number"
                        min="0"
                        max="100"
                        value={citationForm.confidenceScore}
                        onChange={(event) =>
                          setCitationForm({
                            ...citationForm,
                            confidenceScore: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                  <label className={styles.label}>
                    Transcription
                    <textarea
                      className={styles.textarea}
                      value={citationForm.transcription}
                      onChange={(event) =>
                        setCitationForm({
                          ...citationForm,
                          transcription: event.target.value,
                        })
                      }
                    />
                  </label>
                  <button
                    className={`${styles.button} ${styles.primaryButton}`}
                    disabled={savingCitation}
                  >
                    {savingCitation ? 'Creation...' : 'Creer et lier'}
                  </button>
                </form>

                <form className={styles.compactForm} onSubmit={linkExistingCitation}>
                  <div className={styles.formTitle}>Lier une citation</div>
                  <label className={styles.label}>
                    Citation ID
                    <input
                      className={styles.input}
                      value={citationLinkForm.citationId}
                      onChange={(event) =>
                        setCitationLinkForm({ citationId: event.target.value })
                      }
                    />
                  </label>
                  <button className={styles.button} disabled={linkingCitation}>
                    {linkingCitation ? 'Lien...' : 'Lier'}
                  </button>
                </form>
              </div>
            ) : null}

            {loadingCitations ? (
              <div className={styles.muted}>Chargement des sources...</div>
            ) : citationLinks.length === 0 ? (
              <div className={styles.emptyInline}>Aucune citation liee a cette personne.</div>
            ) : (
              <div className={styles.citationList}>
                {citationLinks.map((link) => {
                  const citation = citationFromLink(link);
                  return (
                    <article key={link.id} className={styles.citationItem}>
                      <div className={styles.citationHeader}>
                        <div>
                          <div className={styles.citationTitle}>
                            {citation?.source?.title || 'Source sans titre'}
                          </div>
                          <div className={styles.muted}>
                            {[
                              citation?.source?.repository?.name,
                              citation?.page ? `page ${citation.page}` : null,
                            ]
                              .filter(Boolean)
                              .join(' - ') || 'Reference sans detail'}
                          </div>
                        </div>
                        {citation?.confidenceScore !== undefined &&
                        citation?.confidenceScore !== null ? (
                          <span className={styles.tag}>
                            {citation.confidenceScore}/100
                          </span>
                        ) : null}
                      </div>
                      {citation?.transcription ? (
                        <div className={styles.citationQuote}>
                          {citation.transcription}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </InspectorAccordion>
  );
}

function EntityDocumentsPanel({
  entityId,
  ownerType,
  title,
  subtitle,
  token,
  canUpload,
  defaultCategory,
  compact = false,
}: {
  entityId: string;
  ownerType: 'person' | 'union';
  title: string;
  subtitle: string;
  token: string | null;
  canUpload: boolean;
  defaultCategory: string;
  compact?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
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
        setDocuments(readApiList<any>(result));
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
    setDocuments(readApiList<any>(result));
  }

  async function uploadFiles(files: FileList | File[]) {
    const fileList = Array.from(files).filter(Boolean);
    if (fileList.length === 0 || !token || !canUpload) return;

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
      await refreshDocuments();
      setDescription('');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files) return;
    void uploadFiles(files);
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (canUpload) setDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);
    if (!event.dataTransfer.files) return;
    void uploadFiles(event.dataTransfer.files);
  }

  async function handleDelete(documentId: string) {
    if (!token || !canUpload) return;
    if (!window.confirm('Supprimer ce document ?')) return;

    await documentApi.delete(documentId, token);
    setDocuments((current) => current.filter((document) => document.id !== documentId));
  }

  return (
    <div
      className={`${styles.documentPanel} ${
        compact ? styles.compactDocumentPanel : ''
      }`}
    >
      <div className={styles.documentHeader}>
        <div>
          <div className={styles.panelTitle}>
            {title} ({documents.length})
          </div>
          <div className={styles.muted}>{subtitle}</div>
        </div>
      </div>

      {canUpload ? (
        <div className={styles.documentDropGroup}>
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
          </div>
          <label
            className={`${styles.dropZone} ${
              dragActive ? styles.dropZoneActive : ''
            }`}
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
              multiple
              hidden
            />
            <span className={styles.dropZoneIcon} aria-hidden="true">
              +
            </span>
            <strong>{uploading ? 'Envoi en cours...' : 'Deposer les fichiers ici'}</strong>
            <small>PDF, images ou documents bureautiques</small>
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
                  <span>{documentKindLabel(document.mimeType)}</span>
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
                  {canUpload ? (
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

function InfoLine({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className={styles.infoLine}>
      <span>{label}</span>
      <strong>{value || 'Non renseigne'}</strong>
    </div>
  );
}

function genderLabel(gender?: Person['gender']) {
  if (gender === 'MALE') return 'Homme';
  if (gender === 'FEMALE') return 'Femme';
  if (gender === 'OTHER') return 'Autre';
  return 'Inconnu';
}

function formatSosaNumber(person: Person) {
  return person.sosaNumber ? `Sosa ${person.sosaNumber}` : 'Non attribue';
}

function formatSosaHint(person: Person) {
  if (!person.sosaNumber) return 'Hors ligne Sosa visible';
  if (person.sosaNumber === 1) return 'Racine de numerotation';
  return person.sosaNumber % 2 === 0 ? 'Ascendant paternel' : 'Ascendant maternel';
}

function normalizedPlaceParts(value?: string | null) {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function documentKindLabel(mimeType?: string | null) {
  if (!mimeType) return 'DOC';
  if (mimeType.includes('pdf')) return 'PDF';
  if (mimeType.includes('word')) return 'DOC';
  return 'FILE';
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

function eventTypeLabel(type?: string | null) {
  if (!type) return 'Evenement';
  return EVENT_TYPE_LABELS[type] || type.replace(/_/g, ' ');
}

function participantRoleFor(personEvent: PersonEvent, personId: string) {
  const participant = personEvent.participants?.find(
    (item) => item.personId === personId || item.person?.id === personId,
  );

  return participant?.role || 'SUBJECT';
}

function citationFromLink(link: CitationLink | Citation): Citation | undefined {
  if ('citation' in link) return link.citation;
  return link;
}

function formatPlace(place?: PersonEvent['place']) {
  if (!place) return '';
  return [place.name, place.subdivision, place.region, place.country]
    .filter(Boolean)
    .join(', ');
}

function readApiList<T>(result: any): T[] {
  const payload = result?.data ?? result;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function formatDateValue(value?: string | null) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return parsed.toLocaleDateString('fr-FR');
}

function formatEvent(date?: string | null, place?: string | null) {
  const formattedDate = formatDateValue(date);
  if (formattedDate && place) return `${formattedDate} - ${place}`;
  return formattedDate || place || null;
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
