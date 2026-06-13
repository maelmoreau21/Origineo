'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CalendarDays,
  CircleAlert,
  Edit3,
  FileText,
  GitBranch,
  Heart,
  Lock,
  MapPin,
  Plus,
  ShieldAlert,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';
import { documentApi, sourceApi } from '@/lib/api';
import { RelativeLinkType } from './AddRelativeModal';
import {
  buildIntegrityWarnings,
  buildUnionGroups,
  formatShortDate,
  peopleFromIds,
  readApiList,
  UnionGroup,
} from './family-helpers';
import styles from './TreeWorkspace.module.css';
import {
  formatDate,
  formatLife,
  genderLabel,
  Person,
  personLabel,
  TreeWindow,
} from './types';

type DetailsTab = 'summary' | 'family' | 'documents' | 'sources' | 'quality';

type Props = {
  tree: TreeWindow | null;
  selectedPersonId: string | null;
  canMutate: boolean;
  isReadOnly: boolean;
  onRootChange: (personId: string) => void;
  onEditPerson: (tab?: 'identity' | 'events' | 'family' | 'documents' | 'sources') => void;
  onRequestAddRelative: (personId: string, linkType?: RelativeLinkType | null) => void;
  onRequestDeleteBranch: (person: Person) => void;
};

type CitationLink = {
  id: string;
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
    repository?: {
      name: string;
      type?: string | null;
      url?: string | null;
    } | null;
  } | null;
};

const TAB_ITEMS: Array<{
  id: DetailsTab;
  label: string;
  icon: typeof UserRound;
}> = [
  { id: 'summary', label: 'Fiche', icon: UserRound },
  { id: 'family', label: 'Famille', icon: Users },
  { id: 'documents', label: 'Docs', icon: FileText },
  { id: 'sources', label: 'Sources', icon: BookOpen },
  { id: 'quality', label: 'Controle', icon: ShieldAlert },
];

export default function PersonDetailsPanel({
  tree,
  selectedPersonId,
  canMutate,
  isReadOnly,
  onRootChange,
  onEditPerson,
  onRequestAddRelative,
  onRequestDeleteBranch,
}: Props) {
  const [activeTab, setActiveTab] = useState<DetailsTab>('summary');

  const selectedNode = useMemo(
    () => tree?.nodes.find((node) => node.person.id === selectedPersonId),
    [selectedPersonId, tree],
  );
  const person = selectedNode?.person || null;
  const unionGroups = useMemo(
    () => (tree && selectedNode ? buildUnionGroups(tree, selectedNode) : []),
    [selectedNode, tree],
  );
  const warnings = useMemo(
    () => buildIntegrityWarnings(selectedNode, unionGroups),
    [selectedNode, unionGroups],
  );

  useEffect(() => {
    setActiveTab('summary');
  }, [person?.id]);

  if (!person || !selectedNode) {
    return (
      <aside className={styles.proInspector}>
        <div className={styles.proEmptyPanel}>
          <UserRound size={28} />
          <strong>Aucune personne selectionnee</strong>
          <span>Choisissez une fiche dans l arbre ou dans l annuaire.</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className={styles.proInspector}>
      <section className={styles.proIdentityHeader}>
        <div className={styles.proIdentityTop}>
          <div className={styles.proAvatar} data-gender={person.gender}>
            {initials(person)}
          </div>
          <div className={styles.proIdentityText}>
            <span className={styles.proEyebrow}>Personne selectionnee</span>
            <h2>{personLabel(person)}</h2>
            {person.nickname ? <p>Dit "{person.nickname}"</p> : null}
            <div className={styles.proLifeLine}>
              <CalendarDays size={14} />
              <span>{formatLife(person) || 'Dates inconnues'}</span>
            </div>
          </div>
          <span className={styles.proModeBadge} data-readonly={isReadOnly}>
            {isReadOnly ? 'Consultation' : 'Modification'}
          </span>
        </div>

        <div className={styles.proMetricGrid}>
          <Metric label="Parents" value={selectedNode.parents.length} />
          <Metric label="Enfants" value={selectedNode.children.length} />
          <Metric label="Unions" value={unionGroups.length} />
        </div>

        <div className={styles.proActionGrid}>
          <button
            type="button"
            className={styles.proButton}
            onClick={() => onRootChange(person.id)}
          >
            <GitBranch size={15} />
            Centrer
          </button>
          <a className={styles.proButton} href={`/person/${person.id}`}>
            <FileText size={15} />
            Fiche
          </a>
          {canMutate ? (
            <button
              type="button"
              className={`${styles.proButton} ${styles.proButtonPrimary}`}
              onClick={() => onEditPerson('identity')}
            >
              <Edit3 size={15} />
              Modifier
            </button>
          ) : null}
        </div>

        {!canMutate ? (
          <div className={styles.proAdminHint}>
            <Lock size={15} />
            <span>Connectez-vous en admin pour modifier l arbre.</span>
            <a href="/tree-settings?tab=login">Connexion</a>
          </div>
        ) : null}
      </section>

      <nav className={styles.proTabList} aria-label="Sections personne">
        {TAB_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={activeTab === item.id ? styles.proTabActive : ''}
              onClick={() => setActiveTab(item.id)}
            >
              <Icon size={15} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className={styles.proPanelBody}>
        {activeTab === 'summary' ? (
          <SummaryTab person={person} node={selectedNode} canMutate={canMutate} onEditPerson={onEditPerson} />
        ) : null}

        {activeTab === 'family' ? (
          <FamilyTab
            tree={tree}
            person={person}
            node={selectedNode}
            groups={unionGroups}
            canMutate={canMutate}
            onEditPerson={onEditPerson}
            onRequestAddRelative={onRequestAddRelative}
          />
        ) : null}

        {activeTab === 'documents' ? (
          <DocumentsReadOnlyTab
            personId={person.id}
            canMutate={canMutate}
            onEditPerson={onEditPerson}
          />
        ) : null}

        {activeTab === 'sources' ? (
          <SourcesReadOnlyTab
            personId={person.id}
            canMutate={canMutate}
            onEditPerson={onEditPerson}
          />
        ) : null}

        {activeTab === 'quality' ? (
          <QualityTab
            tree={tree}
            person={person}
            groups={unionGroups}
            warnings={warnings}
            canMutate={canMutate}
            onRequestDeleteBranch={onRequestDeleteBranch}
          />
        ) : null}
      </div>
    </aside>
  );
}

function SummaryTab({
  person,
  node,
  canMutate,
  onEditPerson,
}: {
  person: Person;
  node: TreeWindow['nodes'][number];
  canMutate: boolean;
  onEditPerson: Props['onEditPerson'];
}) {
  return (
    <div className={styles.proSectionStack}>
      <SectionHeader
        icon={UserRound}
        title="Identite"
        action={canMutate ? { label: 'Modifier', onClick: () => onEditPerson('identity') } : undefined}
      />
      <div className={styles.proInfoGrid}>
        <Info label="Prenoms" value={person.givenNames} />
        <Info label="Nom usage" value={person.usageSurname} />
        <Info label="Nom naissance" value={person.birthSurname} />
        <Info label="Genre" value={genderLabel(person.gender)} />
        <Info label="Sosa" value={person.sosaNumber ? `Sosa ${person.sosaNumber}` : null} />
        <Info label="Racine" value={person.isRootDefault ? 'Oui' : 'Non'} />
      </div>

      <SectionHeader
        icon={CalendarDays}
        title="Evenements vitaux"
        action={canMutate ? { label: 'Modifier', onClick: () => onEditPerson('events') } : undefined}
      />
      <div className={styles.proTimeline}>
        <TimelineItem label="Naissance" date={person.birthDate} place={person.birthPlace} />
        <TimelineItem label="Bapteme" date={person.baptismDate} place={person.baptismPlace} />
        <TimelineItem label="Deces" date={person.deathDate} place={person.deathPlace} />
        <TimelineItem label="Inhumation" date={person.burialDate} place={person.burialPlace} />
      </div>

      <SectionHeader icon={MapPin} title="Details personnels" />
      <div className={styles.proInfoGrid}>
        <Info label="Nationalite" value={person.nationality} />
        <Info label="Religion" value={person.religion} />
        <Info label="Education" value={person.education} />
        <Info label="Cause deces" value={person.deathCause} />
        <Info label="Parents directs" value={String(node.parents.length)} />
        <Info label="Enfants directs" value={String(node.children.length)} />
      </div>

      <ListBlock label="Professions" values={person.professions || []} />
      <ListBlock label="Residences" values={person.residences || []} />
      <TextBlock label="Description physique" value={person.physicalDescription} />
      <TextBlock label="Notes" value={person.notes} />
    </div>
  );
}

function FamilyTab({
  tree,
  person,
  node,
  groups,
  canMutate,
  onEditPerson,
  onRequestAddRelative,
}: {
  tree: TreeWindow | null;
  person: Person;
  node: TreeWindow['nodes'][number];
  groups: UnionGroup[];
  canMutate: boolean;
  onEditPerson: Props['onEditPerson'];
  onRequestAddRelative: Props['onRequestAddRelative'];
}) {
  const parents = peopleFromIds(tree, node.parents);
  const children = peopleFromIds(tree, node.children);

  return (
    <div className={styles.proSectionStack}>
      <SectionHeader
        icon={Users}
        title="Filiation"
        action={canMutate ? { label: 'Gerer', onClick: () => onEditPerson('family') } : undefined}
      />
      <div className={styles.proFamilyQuickActions}>
        {canMutate ? (
          <>
            <button type="button" onClick={() => onRequestAddRelative(person.id, 'FATHER')}>
              <Plus size={14} />
              Pere
            </button>
            <button type="button" onClick={() => onRequestAddRelative(person.id, 'MOTHER')}>
              <Plus size={14} />
              Mere
            </button>
            <button type="button" onClick={() => onRequestAddRelative(person.id, 'SPOUSE')}>
              <Plus size={14} />
              Conjoint
            </button>
            <button type="button" onClick={() => onRequestAddRelative(person.id, 'CHILD')}>
              <Plus size={14} />
              Enfant
            </button>
          </>
        ) : null}
      </div>

      <div className={styles.proRelationColumns}>
        <RelationList title="Parents" people={parents} empty="Aucun parent visible" />
        <RelationList title="Enfants" people={children} empty="Aucun enfant visible" />
      </div>

      <SectionHeader icon={Heart} title="Conjoints et unions" />
      {groups.length === 0 ? (
        <EmptyInline text="Aucune union ou descendance visible." />
      ) : (
        <div className={styles.proUnionList}>
          {groups.map((group) => (
            <article key={group.key} className={styles.proUnionCard}>
              <div className={styles.proUnionHeader}>
                <div>
                  <strong>{group.title}</strong>
                  <span>{group.subtitle}</span>
                </div>
                <em>{group.inferred ? 'Coparent' : 'Union'}</em>
              </div>
              {group.children.length > 0 ? (
                <div className={styles.proChipList}>
                  {group.children.map((child) => (
                    <a key={child.id} href={`/person/${child.id}`}>
                      {personLabel(child)}
                    </a>
                  ))}
                </div>
              ) : null}
              {group.warnings.length > 0 ? (
                <div className={styles.proWarningMini}>
                  <CircleAlert size={14} />
                  {group.warnings[0]}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentsReadOnlyTab({
  personId,
  canMutate,
  onEditPerson,
}: {
  personId: string;
  canMutate: boolean;
  onEditPerson: Props['onEditPerson'];
}) {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    documentApi
      .getByPerson(personId)
      .then((result) => {
        if (alive) setDocuments(readApiList(result));
      })
      .catch(() => {
        if (alive) setDocuments([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [personId]);

  return (
    <div className={styles.proSectionStack}>
      <SectionHeader
        icon={FileText}
        title={`Documents (${documents.length})`}
        action={canMutate ? { label: 'Gerer', onClick: () => onEditPerson('documents') } : undefined}
      />
      {loading ? <EmptyInline text="Chargement des documents..." /> : null}
      {!loading && documents.length === 0 ? <EmptyInline text="Aucun document rattache." /> : null}
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
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function SourcesReadOnlyTab({
  personId,
  canMutate,
  onEditPerson,
}: {
  personId: string;
  canMutate: boolean;
  onEditPerson: Props['onEditPerson'];
}) {
  const [links, setLinks] = useState<CitationLink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    sourceApi
      .getCitationsByPerson(personId)
      .then((result) => {
        if (alive) setLinks(readApiList(result));
      })
      .catch(() => {
        if (alive) setLinks([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [personId]);

  return (
    <div className={styles.proSectionStack}>
      <SectionHeader
        icon={BookOpen}
        title={`Sources (${links.length})`}
        action={canMutate ? { label: 'Gerer', onClick: () => onEditPerson('sources') } : undefined}
      />
      {loading ? <EmptyInline text="Chargement des sources..." /> : null}
      {!loading && links.length === 0 ? <EmptyInline text="Aucune source rattachee." /> : null}
      <div className={styles.proSourceList}>
        {links.map((link) => {
          const citation = citationFromLink(link);
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
    </div>
  );
}

function QualityTab({
  tree,
  person,
  groups,
  warnings,
  canMutate,
  onRequestDeleteBranch,
}: {
  tree: TreeWindow | null;
  person: Person;
  groups: UnionGroup[];
  warnings: string[];
  canMutate: boolean;
  onRequestDeleteBranch: Props['onRequestDeleteBranch'];
}) {
  return (
    <div className={styles.proSectionStack}>
      <SectionHeader icon={ShieldAlert} title="Controle des donnees" />
      <div className={styles.proInfoGrid}>
        <Info label="Personnes visibles" value={String(tree?.stats?.visiblePersons || tree?.nodes.length || 0)} />
        <Info label="Relations visibles" value={String(tree?.relationships.length || 0)} />
        <Info label="Unions visibles" value={String(tree?.unions.length || 0)} />
        <Info label="Groupes famille" value={String(groups.length)} />
      </div>
      {warnings.length === 0 ? (
        <div className={styles.proQualityOk}>Aucune anomalie visible dans cette fenetre.</div>
      ) : (
        <div className={styles.proWarningList}>
          {warnings.map((warning) => (
            <div key={warning}>
              <CircleAlert size={15} />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}
      {canMutate ? (
        <section className={styles.proDangerZone}>
          <div>
            <strong>Zone sensible</strong>
            <span>Suppression protegee par confirmation.</span>
          </div>
          <button type="button" onClick={() => onRequestDeleteBranch(person)}>
            <Trash2 size={15} />
            Options suppression
          </button>
        </section>
      ) : null}
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  action,
}: {
  icon: typeof UserRound;
  title: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className={styles.proSectionHeader}>
      <div>
        <Icon size={16} />
        <h3>{title}</h3>
      </div>
      {action ? (
        <button type="button" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.proMetric}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className={styles.proInfo}>
      <span>{label}</span>
      <strong>{value || 'Non renseigne'}</strong>
    </div>
  );
}

function TimelineItem({
  label,
  date,
  place,
}: {
  label: string;
  date?: string | null;
  place?: string | null;
}) {
  return (
    <div className={styles.proTimelineItem}>
      <span>{label}</span>
      <strong>{formatDate(date) || 'Date inconnue'}</strong>
      <em>{place || 'Lieu non renseigne'}</em>
    </div>
  );
}

function RelationList({
  title,
  people,
  empty,
}: {
  title: string;
  people: Person[];
  empty: string;
}) {
  return (
    <section className={styles.proRelationList}>
      <strong>{title}</strong>
      {people.length === 0 ? <span>{empty}</span> : null}
      {people.map((person) => (
        <a key={person.id} href={`/person/${person.id}`}>
          {personLabel(person)}
          <em>{formatShortDate(person.birthDate) || 'Date inconnue'}</em>
        </a>
      ))}
    </section>
  );
}

function ListBlock({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div className={styles.proTextBlock}>
      <span>{label}</span>
      <div className={styles.proChipList}>
        {values.map((value) => (
          <em key={value}>{value}</em>
        ))}
      </div>
    </div>
  );
}

function TextBlock({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className={styles.proTextBlock}>
      <span>{label}</span>
      <p>{value}</p>
    </div>
  );
}

function EmptyInline({ text }: { text: string }) {
  return <div className={styles.proEmptyInline}>{text}</div>;
}

function initials(person: Person) {
  return [person.givenNames, person.usageSurname || person.birthSurname]
    .filter(Boolean)
    .flatMap((part) => part.trim().split(/\s+/))
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';
}

function citationFromLink(link: CitationLink | Citation): Citation | undefined {
  if ('citation' in link) return link.citation;
  return link;
}
