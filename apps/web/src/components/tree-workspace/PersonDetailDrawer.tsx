'use client';

import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  documentApi,
  eventApi,
  personApi,
} from '@/lib/api';
import {
  buildUnionGroups,
  formatShortDate,
  peopleFromIds,
  TreeNode,
  UnionGroup,
} from './family-helpers';
import styles from './TreeWorkspace.module.css';
import { formatLife, Person, personLabel, TreeWindow } from './types';
import { RelativeLinkType } from './AddRelativeModal';

type DrawerTab = 'info' | 'family' | 'documents' | 'timeline';

type Props = {
  tree: TreeWindow | null;
  selectedPersonId: string | null;
  isOpen: boolean;
  token: string | null;
  isReadOnly: boolean;
  onClose: () => void;
  onCenter: (personId: string) => void;
  onSelectRelative: (personId: string) => void;
  onRequestAddRelative?: (personId: string, linkType?: RelativeLinkType) => void;
  onRequestDelete: (person: Person) => void;
  onPersonUpdated: (personId: string) => void;
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  BAPTEME: 'Baptême',
  PROFESSION: 'Profession / Métier',
  RESIDENCE: 'Résidence / Domicile',
  MARIAGE: 'Mariage / Union',
  MILITAIRE: 'Service militaire',
  TITRE: 'Titre / Distinction',
  RECENSEMENT: 'Recensement',
  SEPULTURE: 'Sépulture',
  TESTAMENT: 'Testament',
  AUTRE: 'Événement',
  NAISSANCE: 'Naissance',
  DECES: 'Décès',
};

function formatEventPlace(ev: any): string | null {
  if (ev.place?.name) return ev.place.name;
  if (ev.notes && typeof ev.notes === 'string') {
    const match = ev.notes.match(/^Lieu\s*:\s*([^\n]+)/i);
    if (match) return match[1].trim();
  }
  return null;
}

function formatEventNotes(ev: any): string | null {
  if (!ev.notes || typeof ev.notes !== 'string') return null;
  const cleaned = ev.notes.replace(/^Lieu\s*:\s*[^\n]+\n?/i, '').trim();
  return cleaned || null;
}

export default function PersonDetailDrawer({
  tree,
  selectedPersonId,
  isOpen,
  token,
  isReadOnly,
  onClose,
  onCenter,
  onSelectRelative,
  onRequestAddRelative,
  onRequestDelete,
  onPersonUpdated,
}: Props) {
  const [activeTab, setActiveTab] = useState<DrawerTab>('info');
  const [isEditing, setIsEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Documents state
  const [documents, setDocuments] = useState<any[]>([]);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const docFileInputRef = useRef<HTMLInputElement>(null);
  const photoFileInputRef = useRef<HTMLInputElement>(null);

  // Events / timeline state
  const [events, setEvents] = useState<any[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingVital, setEditingVital] = useState<'birth' | 'death' | null>(null);
  const [savingEvent, setSavingEvent] = useState(false);
  const [eventForm, setEventForm] = useState({
    type: 'BAPTEME',
    date: '',
    dateRaw: '',
    place: '',
    notes: '',
  });
  const [vitalForm, setVitalForm] = useState({
    date: '',
    place: '',
  });

  const selectedNode = useMemo(
    () => tree?.nodes.find((node) => node.person.id === selectedPersonId) || null,
    [tree, selectedPersonId],
  );
  const person = selectedNode?.person || null;

  // Edit form state
  const [form, setForm] = useState({
    givenNames: '',
    usageSurname: '',
    birthSurname: '',
    gender: 'UNKNOWN',
    birthDate: '',
    birthPlace: '',
    deathDate: '',
    deathPlace: '',
    professions: '',
    residences: '',
    notes: '',
  });

  // Sync form with selected person
  useEffect(() => {
    if (!person) return;
    setForm({
      givenNames: person.givenNames || '',
      usageSurname: person.usageSurname || '',
      birthSurname: person.birthSurname || '',
      gender: person.gender || 'UNKNOWN',
      birthDate: person.birthDate ? person.birthDate.slice(0, 10) : '',
      birthPlace: person.birthPlace || '',
      deathDate: person.deathDate ? person.deathDate.slice(0, 10) : '',
      deathPlace: person.deathPlace || '',
      professions: (person.professions || []).join(', '),
      residences: (person.residences || []).join(', '),
      notes: person.notes || '',
    });
    setIsEditing(false);
    setIsAddingEvent(false);
    setEditingEventId(null);
    setEditingVital(null);
    setNotice(null);
  }, [person?.id]);

  // Load documents when tab is opened
  useEffect(() => {
    if (!person?.id || (activeTab !== 'documents' && activeTab !== 'info')) return;
    let alive = true;
    setLoadingDocs(true);

    documentApi
      .getByPerson(person.id)
      .then((res) => {
        if (!alive) return;
        const docs = res.data || res || [];
        setDocuments(Array.isArray(docs) ? docs : []);
      })
      .catch(() => {
        if (alive) setDocuments([]);
      })
      .finally(() => {
        if (alive) setLoadingDocs(false);
      });

    // Check profile photo
    documentApi
      .hasProfilePhoto(person.id)
      .then((res: any) => {
        if (!alive) return;
        const exists = res?.data?.exists ?? res?.exists;
        if (exists) {
          setProfilePhotoUrl(documentApi.profilePhotoUrl(person.id));
        } else {
          setProfilePhotoUrl(null);
        }
      })
      .catch(() => {
        if (alive) setProfilePhotoUrl(null);
      });

    return () => {
      alive = false;
    };
  }, [person?.id, activeTab]);

  // Load events when timeline tab is opened
  const refreshEvents = async () => {
    if (!person?.id) return;
    try {
      const res = await eventApi.getByPerson(person.id);
      const raw = res.data?.data ?? res.data?.events ?? res.data ?? res;
      setEvents(Array.isArray(raw) ? raw : []);
    } catch {
      // keep current
    }
  };

  useEffect(() => {
    if (!person?.id || activeTab !== 'timeline') return;
    let alive = true;
    setLoadingEvents(true);

    eventApi
      .getByPerson(person.id)
      .then((res) => {
        if (!alive) return;
        const raw = res.data?.data ?? res.data?.events ?? res.data ?? res;
        setEvents(Array.isArray(raw) ? raw : []);
      })
      .catch(() => {
        if (alive) setEvents([]);
      })
      .finally(() => {
        if (alive) setLoadingEvents(false);
      });

    return () => {
      alive = false;
    };
  }, [person?.id, activeTab]);

  // Family relationships computed from tree
  const parents = useMemo(
    () => (selectedNode ? peopleFromIds(tree, selectedNode.parents) : []),
    [tree, selectedNode],
  );

  const children = useMemo(
    () => (selectedNode ? peopleFromIds(tree, selectedNode.children) : []),
    [tree, selectedNode],
  );

  const unionGroups: UnionGroup[] = useMemo(
    () => (tree && selectedNode ? buildUnionGroups(tree, selectedNode) : []),
    [tree, selectedNode],
  );

  // Compute siblings (share at least one parent)
  const siblings = useMemo(() => {
    if (!tree || !selectedNode || selectedNode.parents.length === 0) return [];
    const parentSet = new Set(selectedNode.parents);
    const siblingsSet = new Set<string>();

    for (const node of tree.nodes) {
      if (node.person.id === selectedNode.person.id) continue;
      if (node.parents.some((pId) => parentSet.has(pId))) {
        siblingsSet.add(node.person.id);
      }
    }

    return peopleFromIds(tree, Array.from(siblingsSet));
  }, [tree, selectedNode]);

  if (!isOpen || !person) {
    return null;
  }

  // Save handler for inline editing
  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!person || !token || isReadOnly) return;
    setBusy(true);
    setNotice(null);

    const payload = {
      givenNames: form.givenNames.trim() || undefined,
      usageSurname: form.usageSurname.trim() || undefined,
      birthSurname: form.birthSurname.trim() || undefined,
      gender: form.gender,
      birthDate: form.birthDate ? new Date(form.birthDate).toISOString() : null,
      birthPlace: form.birthPlace.trim() || null,
      deathDate: form.deathDate ? new Date(form.deathDate).toISOString() : null,
      deathPlace: form.deathPlace.trim() || null,
      professions: form.professions
        ? form.professions.split(',').map((p) => p.trim()).filter(Boolean)
        : [],
      residences: form.residences
        ? form.residences.split(',').map((r) => r.trim()).filter(Boolean)
        : [],
      notes: form.notes.trim() || null,
    };

    try {
      await personApi.update(person.id, payload, token);
      setIsEditing(false);
      setNotice('Fiche mise a jour.');
      onPersonUpdated(person.id);
    } catch (err: any) {
      setNotice(`Erreur : ${err.message || 'Impossible d enregistrer'}`);
    } finally {
      setBusy(false);
    }
  }

  // Save event handler (add or update)
  async function handleSaveEvent(e: FormEvent) {
    e.preventDefault();
    if (!person || !token || isReadOnly) return;

    const type = eventForm.type.trim() || 'AUTRE';
    const dateRaw = eventForm.dateRaw.trim();
    const place = eventForm.place.trim();
    const notesInput = eventForm.notes.trim();

    if (!eventForm.date && !dateRaw) {
      setNotice('Veuillez renseigner au moins une date exacte ou une date libre.');
      return;
    }

    let combinedNotes = notesInput;
    if (place) {
      combinedNotes = combinedNotes ? `Lieu : ${place}\n${combinedNotes}` : `Lieu : ${place}`;
    }

    setSavingEvent(true);
    setNotice(null);

    try {
      if (editingEventId) {
        await eventApi.update(
          editingEventId,
          {
            type,
            date: eventForm.date ? new Date(eventForm.date).toISOString() : null,
            dateRaw: dateRaw || null,
            notes: combinedNotes || null,
            participants: [{ personId: person.id, role: 'SUBJECT' }],
          },
          token,
        );
        setNotice('Événement modifié.');
      } else {
        await eventApi.create(
          {
            type,
            date: eventForm.date ? new Date(eventForm.date).toISOString() : null,
            dateRaw: dateRaw || null,
            notes: combinedNotes || null,
            participants: [{ personId: person.id, role: 'SUBJECT' }],
          },
          token,
        );
        setNotice('Événement ajouté à la chronologie.');
      }

      await refreshEvents();
      onPersonUpdated(person.id);
      setIsAddingEvent(false);
      setEditingEventId(null);
      setEventForm({ type: 'BAPTEME', date: '', dateRaw: '', place: '', notes: '' });
    } catch (err: any) {
      setNotice(`Erreur : ${err.message || "Impossible d'enregistrer l'événement"}`);
    } finally {
      setSavingEvent(false);
    }
  }

  // Delete event handler
  async function handleDeleteEvent(eventId: string) {
    if (!token || isReadOnly || !person) return;
    if (!window.confirm('Voulez-vous vraiment supprimer cet événement ?')) return;

    setNotice(null);
    try {
      await eventApi.delete(eventId, token);
      setNotice('Événement supprimé.');
      await refreshEvents();
      onPersonUpdated(person.id);
      if (editingEventId === eventId) {
        setEditingEventId(null);
      }
    } catch (err: any) {
      setNotice(`Erreur suppression : ${err.message}`);
    }
  }

  // Save birth or death vital handler
  async function handleSaveVital(e: FormEvent) {
    e.preventDefault();
    if (!person || !token || isReadOnly || !editingVital) return;

    setSavingEvent(true);
    setNotice(null);

    const isBirth = editingVital === 'birth';
    const payload = isBirth
      ? {
          birthDate: vitalForm.date ? new Date(vitalForm.date).toISOString() : null,
          birthPlace: vitalForm.place.trim() || null,
        }
      : {
          deathDate: vitalForm.date ? new Date(vitalForm.date).toISOString() : null,
          deathPlace: vitalForm.place.trim() || null,
        };

    try {
      await personApi.update(person.id, payload, token);
      setNotice(isBirth ? 'Date et lieu de naissance enregistrés.' : 'Date et lieu de décès enregistrés.');
      setEditingVital(null);
      onPersonUpdated(person.id);
    } catch (err: any) {
      setNotice(`Erreur : ${err.message}`);
    } finally {
      setSavingEvent(false);
    }
  }

  // Upload document handler
  async function handleDocUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !person || !token) return;
    setUploadingDoc(true);
    setNotice(null);
    try {
      await documentApi.upload(file, { personId: person.id, category: 'OTHER' }, token);
      setNotice('Document televerse avec succes.');
      const res = await documentApi.getByPerson(person.id);
      setDocuments(res.data || res || []);
    } catch (err: any) {
      setNotice(`Erreur televersement : ${err.message}`);
    } finally {
      setUploadingDoc(false);
      if (docFileInputRef.current) docFileInputRef.current.value = '';
    }
  }

  // Upload profile photo handler
  async function handleProfilePhotoUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !person || !token) return;
    setUploadingDoc(true);
    setNotice(null);
    try {
      await documentApi.uploadProfilePhoto(person.id, file, token);
      setProfilePhotoUrl(documentApi.profilePhotoUrl(person.id));
      setNotice('Photo de profil mise a jour.');
      onPersonUpdated(person.id);
    } catch (err: any) {
      setNotice(`Erreur photo : ${err.message}`);
    } finally {
      setUploadingDoc(false);
      if (photoFileInputRef.current) photoFileInputRef.current.value = '';
    }
  }

  // Age calculation helper
  const age = calculateAge(person.birthDate, person.deathDate);
  const initials = getInitials(person);
  const genderTheme =
    person.gender === 'MALE'
      ? styles.avatarMale
      : person.gender === 'FEMALE'
      ? styles.avatarFemale
      : styles.avatarOther;

  return (
    <aside className={styles.modernDrawer} aria-label="Fiche detaillee de la personne">
      {/* ── Top Header ───────────────────────────────── */}
      <header className={styles.drawerHeader}>
        <div className={styles.drawerHeaderTop}>
          <div className={styles.drawerAvatarContainer}>
            {profilePhotoUrl ? (
              <img
                src={profilePhotoUrl}
                alt={personLabel(person)}
                className={`${styles.drawerAvatarImg} ${genderTheme}`}
              />
            ) : (
              <div className={`${styles.drawerAvatar} ${genderTheme}`}>
                {initials}
              </div>
            )}
            <span
              className={styles.drawerGenderIndicator}
              title={person.gender === 'MALE' ? 'Homme' : person.gender === 'FEMALE' ? 'Femme' : 'Autre'}
            >
              {person.gender === 'MALE' ? '♂' : person.gender === 'FEMALE' ? '♀' : '👤'}
            </span>
          </div>

          <div className={styles.drawerIdentity}>
            <div className={styles.drawerNameRow}>
              <h2 className={styles.drawerFullName}>{personLabel(person)}</h2>
              {person.sosaNumber ? (
                <span className={styles.drawerSosaBadge} title="Numero Sosa (ascendant direct)">
                  Sosa {person.sosaNumber}
                </span>
              ) : null}
            </div>

            <div className={styles.drawerLifeSummary}>
              {formatLife(person) || 'Dates inconnues'}
              {age !== null ? <span className={styles.drawerAge}> • {age} ans</span> : null}
            </div>
          </div>

          <button
            type="button"
            className={styles.drawerCloseButton}
            onClick={onClose}
            title="Fermer le panneau (Echap)"
            aria-label="Fermer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Quick Actions Toolbar */}
        <div className={styles.drawerActionToolbar}>
          <button
            type="button"
            className={styles.drawerActionButton}
            onClick={() => onCenter(person.id)}
            title="Recentrer l'arbre sur cette personne"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>Centrer</span>
          </button>

          {!isReadOnly && onRequestAddRelative ? (
            <button
              type="button"
              className={styles.drawerActionButton}
              onClick={() => onRequestAddRelative(person.id)}
              title="Ajouter un parent, conjoint ou enfant"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Ajouter</span>
            </button>
          ) : null}

          {!isReadOnly ? (
            <button
              type="button"
              className={`${styles.drawerActionButton} ${isEditing ? styles.drawerActionActive : ''}`}
              onClick={() => {
                setIsEditing(!isEditing);
                setActiveTab('info');
              }}
              title={isEditing ? 'Fermer l’édition' : 'Modifier les informations'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                {isEditing ? (
                  <>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </>
                ) : (
                  <>
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </>
                )}
              </svg>
              <span>{isEditing ? 'Fermer' : 'Modifier'}</span>
            </button>
          ) : null}

          <a
            className={styles.drawerActionButton}
            href={`/person/${person.id}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Ouvrir la fiche individuelle complète"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            <span>Fiche</span>
          </a>

          {!isReadOnly ? (
            <button
              type="button"
              className={`${styles.drawerActionButton} ${styles.drawerActionDanger}`}
              onClick={() => onRequestDelete(person)}
              title="Supprimer cette personne ou cette branche"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              <span>Suppr.</span>
            </button>
          ) : null}
        </div>

        {/* Navigation Tabs */}
        <nav className={styles.drawerTabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'info'}
            className={`${styles.drawerTab} ${activeTab === 'info' ? styles.drawerTabActive : ''}`}
            onClick={() => setActiveTab('info')}
          >
            <span>Identite</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'family'}
            className={`${styles.drawerTab} ${activeTab === 'family' ? styles.drawerTabActive : ''}`}
            onClick={() => setActiveTab('family')}
          >
            <span>Famille</span>
            <span className={styles.drawerTabBadge}>
              {parents.length + children.length + unionGroups.length}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'documents'}
            className={`${styles.drawerTab} ${activeTab === 'documents' ? styles.drawerTabActive : ''}`}
            onClick={() => setActiveTab('documents')}
          >
            <span>Documents</span>
            {documents.length > 0 ? (
              <span className={styles.drawerTabBadge}>{documents.length}</span>
            ) : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'timeline'}
            className={`${styles.drawerTab} ${activeTab === 'timeline' ? styles.drawerTabActive : ''}`}
            onClick={() => setActiveTab('timeline')}
          >
            <span>Chronologie</span>
          </button>
        </nav>
      </header>

      {/* ── Notification Banner ──────────────────────── */}
      {notice ? (
        <div className={styles.drawerNotice}>
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)}>✕</button>
        </div>
      ) : null}

      {/* ── Tab Content ──────────────────────────────── */}
      <div className={styles.drawerBody}>
        {/* TAB 1: IDENTITE & INFOS */}
        {activeTab === 'info' && (
          <div className={styles.drawerSection}>
            {isEditing ? (
              /* Inline Edit Form */
              <form className={styles.drawerEditForm} onSubmit={handleSave}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Prenoms</label>
                  <input
                    className={styles.formInput}
                    type="text"
                    value={form.givenNames}
                    onChange={(e) => setForm({ ...form, givenNames: e.target.value })}
                    placeholder="Jean"
                    required
                  />
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Nom d'usage</label>
                    <input
                      className={styles.formInput}
                      type="text"
                      value={form.usageSurname}
                      onChange={(e) => setForm({ ...form, usageSurname: e.target.value })}
                      placeholder="DUPONT"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Nom de naissance</label>
                    <input
                      className={styles.formInput}
                      type="text"
                      value={form.birthSurname}
                      onChange={(e) => setForm({ ...form, birthSurname: e.target.value })}
                      placeholder="DUPONT"
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Genre</label>
                  <select
                    className={styles.formSelect}
                    value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value })}
                  >
                    <option value="UNKNOWN">Inconnu</option>
                    <option value="MALE">Homme</option>
                    <option value="FEMALE">Femme</option>
                    <option value="OTHER">Autre</option>
                  </select>
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Date de naissance</label>
                    <input
                      className={styles.formInput}
                      type="date"
                      value={form.birthDate}
                      onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Date de deces</label>
                    <input
                      className={styles.formInput}
                      type="date"
                      value={form.deathDate}
                      onChange={(e) => setForm({ ...form, deathDate: e.target.value })}
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Lieu de naissance</label>
                  <input
                    className={styles.formInput}
                    type="text"
                    value={form.birthPlace}
                    onChange={(e) => setForm({ ...form, birthPlace: e.target.value })}
                    placeholder="Paris, 75001, Ile-de-France, FRANCE"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Lieu de deces</label>
                  <input
                    className={styles.formInput}
                    type="text"
                    value={form.deathPlace}
                    onChange={(e) => setForm({ ...form, deathPlace: e.target.value })}
                    placeholder="Lyon, 69001, Rhone, FRANCE"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Professions (separees par des virgules)</label>
                  <input
                    className={styles.formInput}
                    type="text"
                    value={form.professions}
                    onChange={(e) => setForm({ ...form, professions: e.target.value })}
                    placeholder="Agriculteur, Forgeron"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Notes biographiques</label>
                  <textarea
                    className={styles.formTextarea}
                    rows={4}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Remarques, sources ou faits notables..."
                  />
                </div>

                <div className={styles.formButtonRow}>
                  <button
                    type="button"
                    className={styles.formCancelButton}
                    onClick={() => setIsEditing(false)}
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className={styles.formSubmitButton}
                    disabled={busy}
                  >
                    {busy ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>
              </form>
            ) : (
              /* View Mode Information Cards */
              <div className={styles.drawerInfoGrid}>
                {/* Naissance */}
                <div className={styles.drawerInfoCard}>
                  <div className={styles.drawerCardIcon}>🎂</div>
                  <div className={styles.drawerCardContent}>
                    <div className={styles.drawerCardLabel}>Naissance</div>
                    <div className={styles.drawerCardValue}>
                      {formatShortDate(person.birthDate) || 'Date inconnue'}
                    </div>
                    {person.birthPlace ? (
                      <div className={styles.drawerCardSubvalue}>📍 {person.birthPlace}</div>
                    ) : null}
                  </div>
                </div>

                {/* Deces */}
                <div className={styles.drawerInfoCard}>
                  <div className={styles.drawerCardIcon}>✝️</div>
                  <div className={styles.drawerCardContent}>
                    <div className={styles.drawerCardLabel}>Deces</div>
                    <div className={styles.drawerCardValue}>
                      {formatShortDate(person.deathDate) || (person.birthDate ? 'Vivant(e) ou date inconnue' : 'Date inconnue')}
                    </div>
                    {person.deathPlace ? (
                      <div className={styles.drawerCardSubvalue}>📍 {person.deathPlace}</div>
                    ) : null}
                  </div>
                </div>

                {/* Sexe & Identifiants */}
                <div className={styles.drawerInfoCard}>
                  <div className={styles.drawerCardIcon}>🏷️</div>
                  <div className={styles.drawerCardContent}>
                    <div className={styles.drawerCardLabel}>Genre & Noms</div>
                    <div className={styles.drawerCardValue}>
                      {person.gender === 'MALE' ? 'Homme' : person.gender === 'FEMALE' ? 'Femme' : 'Autre ou inconnu'}
                    </div>
                    {person.birthSurname && person.usageSurname && person.birthSurname !== person.usageSurname ? (
                      <div className={styles.drawerCardSubvalue}>
                        Nom de naissance : <strong>{person.birthSurname}</strong>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Professions */}
                {person.professions && person.professions.length > 0 ? (
                  <div className={styles.drawerInfoCard}>
                    <div className={styles.drawerCardIcon}>💼</div>
                    <div className={styles.drawerCardContent}>
                      <div className={styles.drawerCardLabel}>Professions</div>
                      <div className={styles.drawerCardValue}>
                        {person.professions.join(', ')}
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Notes */}
                {person.notes ? (
                  <div className={styles.drawerInfoCardFull}>
                    <div className={styles.drawerCardLabel}>Notes & Biographie</div>
                    <div className={styles.drawerCardNotes}>{person.notes}</div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: FAMILLE & RELATIONS */}
        {activeTab === 'family' && (
          <div className={styles.drawerSection}>
            {/* PARENTS */}
            <div className={styles.drawerFamilyGroup}>
              <div className={styles.drawerGroupHeader}>
                <h3 className={styles.drawerGroupTitle}>👥 Parents ({parents.length})</h3>
                {!isReadOnly && onRequestAddRelative && parents.length < 2 ? (
                  <button
                    type="button"
                    className={styles.drawerMiniAction}
                    onClick={() => onRequestAddRelative(person.id, 'FATHER')}
                    title="Ajouter un parent"
                  >
                    + Ajouter
                  </button>
                ) : null}
              </div>

              {parents.length === 0 ? (
                <div className={styles.drawerEmptyNotice}>
                  Aucun parent renseigne.
                  {!isReadOnly && onRequestAddRelative ? (
                    <button
                      type="button"
                      className={styles.drawerLinkButton}
                      onClick={() => onRequestAddRelative(person.id, 'FATHER')}
                    >
                      Ajouter un parent
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className={styles.drawerRelativeList}>
                  {parents.map((parent) => (
                    <div
                      key={parent.id}
                      className={styles.drawerRelativeCard}
                      onClick={() => onSelectRelative(parent.id)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className={`${styles.miniAvatar} ${parent.gender === 'FEMALE' ? styles.avatarFemale : styles.avatarMale}`}>
                        {parent.gender === 'FEMALE' ? '♀' : '♂'}
                      </div>
                      <div className={styles.drawerRelativeInfo}>
                        <div className={styles.drawerRelativeName}>{personLabel(parent)}</div>
                        <div className={styles.drawerRelativeDates}>{formatLife(parent) || 'Dates inconnues'}</div>
                      </div>
                      <button
                        type="button"
                        className={styles.drawerRelativeNav}
                        onClick={(e) => {
                          e.stopPropagation();
                          onCenter(parent.id);
                        }}
                        title="Voir dans l'arbre"
                      >
                        🎯
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* UNIONS & CONJOINTS */}
            <div className={styles.drawerFamilyGroup}>
              <div className={styles.drawerGroupHeader}>
                <h3 className={styles.drawerGroupTitle}>💍 Unions ({unionGroups.length})</h3>
                {!isReadOnly && onRequestAddRelative ? (
                  <button
                    type="button"
                    className={styles.drawerMiniAction}
                    onClick={() => onRequestAddRelative(person.id, 'SPOUSE')}
                    title="Ajouter un conjoint"
                  >
                    + Ajouter
                  </button>
                ) : null}
              </div>

              {unionGroups.length === 0 ? (
                <div className={styles.drawerEmptyNotice}>
                  Aucune union enregistree.
                </div>
              ) : (
                <div className={styles.drawerUnionList}>
                  {unionGroups.map((group) => (
                    <div key={group.key} className={styles.drawerUnionCard}>
                      <div
                        className={styles.drawerUnionPartnerRow}
                        onClick={() => group.partner && onSelectRelative(group.partner.id)}
                        role="button"
                        tabIndex={0}
                      >
                        <div className={`${styles.miniAvatar} ${group.partner?.gender === 'MALE' ? styles.avatarMale : styles.avatarFemale}`}>
                          💍
                        </div>
                        <div className={styles.drawerRelativeInfo}>
                          <div className={styles.drawerRelativeName}>{group.title}</div>
                          <div className={styles.drawerRelativeDates}>{group.subtitle}</div>
                        </div>
                        {group.partner ? (
                          <button
                            type="button"
                            className={styles.drawerRelativeNav}
                            onClick={(e) => {
                              e.stopPropagation();
                              onCenter(group.partner!.id);
                            }}
                            title="Voir dans l'arbre"
                          >
                            🎯
                          </button>
                        ) : null}
                      </div>

                      {/* Enfants de cette union */}
                      {group.children.length > 0 ? (
                        <div className={styles.drawerUnionChildren}>
                          <div className={styles.drawerChildrenHeader}>
                            👶 Enfants ({group.children.length})
                          </div>
                          <div className={styles.drawerChildrenList}>
                            {group.children.map((child) => (
                              <div
                                key={child.id}
                                className={styles.drawerChildItem}
                                onClick={() => onSelectRelative(child.id)}
                                role="button"
                                tabIndex={0}
                              >
                                <span className={child.gender === 'FEMALE' ? styles.childFemale : styles.childMale}>
                                  {child.gender === 'FEMALE' ? '♀' : '♂'}
                                </span>
                                <span className={styles.childName}>{personLabel(child)}</span>
                                <span className={styles.childDates}>{formatLife(child)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ENFANTS DIRECTS */}
            <div className={styles.drawerFamilyGroup}>
              <div className={styles.drawerGroupHeader}>
                <h3 className={styles.drawerGroupTitle}>👶 Tous les enfants ({children.length})</h3>
                {!isReadOnly && onRequestAddRelative ? (
                  <button
                    type="button"
                    className={styles.drawerMiniAction}
                    onClick={() => onRequestAddRelative(person.id, 'CHILD')}
                    title="Ajouter un enfant"
                  >
                    + Ajouter
                  </button>
                ) : null}
              </div>

              {children.length === 0 ? (
                <div className={styles.drawerEmptyNotice}>
                  Aucun enfant enregistre.
                </div>
              ) : (
                <div className={styles.drawerRelativeList}>
                  {children.map((child) => (
                    <div
                      key={child.id}
                      className={styles.drawerRelativeCard}
                      onClick={() => onSelectRelative(child.id)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className={`${styles.miniAvatar} ${child.gender === 'FEMALE' ? styles.avatarFemale : styles.avatarMale}`}>
                        {child.gender === 'FEMALE' ? '♀' : '♂'}
                      </div>
                      <div className={styles.drawerRelativeInfo}>
                        <div className={styles.drawerRelativeName}>{personLabel(child)}</div>
                        <div className={styles.drawerRelativeDates}>{formatLife(child) || 'Dates inconnues'}</div>
                      </div>
                      <button
                        type="button"
                        className={styles.drawerRelativeNav}
                        onClick={(e) => {
                          e.stopPropagation();
                          onCenter(child.id);
                        }}
                        title="Voir dans l'arbre"
                      >
                        🎯
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* FRERES ET SOEURS */}
            {siblings.length > 0 ? (
              <div className={styles.drawerFamilyGroup}>
                <div className={styles.drawerGroupHeader}>
                  <h3 className={styles.drawerGroupTitle}>👫 Fratrie ({siblings.length})</h3>
                </div>
                <div className={styles.drawerRelativeList}>
                  {siblings.map((sibling) => (
                    <div
                      key={sibling.id}
                      className={styles.drawerRelativeCard}
                      onClick={() => onSelectRelative(sibling.id)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className={`${styles.miniAvatar} ${sibling.gender === 'FEMALE' ? styles.avatarFemale : styles.avatarMale}`}>
                        {sibling.gender === 'FEMALE' ? '♀' : '♂'}
                      </div>
                      <div className={styles.drawerRelativeInfo}>
                        <div className={styles.drawerRelativeName}>{personLabel(sibling)}</div>
                        <div className={styles.drawerRelativeDates}>{formatLife(sibling) || 'Dates inconnues'}</div>
                      </div>
                      <button
                        type="button"
                        className={styles.drawerRelativeNav}
                        onClick={(e) => {
                          e.stopPropagation();
                          onCenter(sibling.id);
                        }}
                        title="Voir dans l'arbre"
                      >
                        🎯
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* TAB 3: DOCUMENTS & MEDIAS */}
        {activeTab === 'documents' && (
          <div className={styles.drawerSection}>
            {/* Photo de profil */}
            <div className={styles.drawerMediaBox}>
              <div className={styles.drawerGroupHeader}>
                <h3 className={styles.drawerGroupTitle}>📸 Photo de profil</h3>
                {!isReadOnly ? (
                  <button
                    type="button"
                    className={styles.drawerMiniAction}
                    onClick={() => photoFileInputRef.current?.click()}
                    disabled={uploadingDoc}
                  >
                    {uploadingDoc ? 'Chargement...' : profilePhotoUrl ? 'Remplacer' : '+ Ajouter'}
                  </button>
                ) : null}
                <input
                  ref={photoFileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleProfilePhotoUpload}
                />
              </div>

              {profilePhotoUrl ? (
                <div className={styles.drawerPhotoPreviewWrapper}>
                  <img src={profilePhotoUrl} alt="Profil" className={styles.drawerPhotoPreview} />
                </div>
              ) : (
                <div className={styles.drawerEmptyNotice}>
                  Aucune photo de profil.
                </div>
              )}
            </div>

            {/* Documents & Actes */}
            <div className={styles.drawerMediaBox}>
              <div className={styles.drawerGroupHeader}>
                <h3 className={styles.drawerGroupTitle}>📁 Actes & Fichiers ({documents.length})</h3>
                {!isReadOnly ? (
                  <button
                    type="button"
                    className={styles.drawerMiniAction}
                    onClick={() => docFileInputRef.current?.click()}
                    disabled={uploadingDoc}
                  >
                    + Ajouter un fichier
                  </button>
                ) : null}
                <input
                  ref={docFileInputRef}
                  type="file"
                  style={{ display: 'none' }}
                  onChange={handleDocUpload}
                />
              </div>

              {loadingDocs ? (
                <div className={styles.drawerLoading}>Chargement des documents...</div>
              ) : documents.length === 0 ? (
                <div className={styles.drawerEmptyNotice}>
                  Aucun document ou acte rattache.
                </div>
              ) : (
                <div className={styles.drawerDocList}>
                  {documents.map((doc) => (
                    <div key={doc.id} className={styles.drawerDocCard}>
                      <div className={styles.drawerDocIcon}>📄</div>
                      <div className={styles.drawerDocDetails}>
                        <div className={styles.drawerDocName}>{doc.originalFilename || doc.title || 'Document'}</div>
                        <div className={styles.drawerDocMeta}>
                          {doc.category || 'Fichier'} • {formatShortDate(doc.createdAt)}
                        </div>
                      </div>
                      <div className={styles.drawerDocActions}>
                        <a
                          href={documentApi.viewUrl(doc.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.drawerDocButton}
                          title="Visualiser"
                        >
                          👁️
                        </a>
                        <a
                          href={documentApi.downloadUrl(doc.id)}
                          className={styles.drawerDocButton}
                          title="Telecharger"
                          download
                        >
                          ⬇️
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: CHRONOLOGIE & EVENEMENTS */}
        {activeTab === 'timeline' && (
          <div className={styles.drawerSection}>
            <div className={styles.timelineHeaderRow}>
              <h3 className={styles.drawerGroupTitle} style={{ margin: 0 }}>🏛️ Ligne de vie</h3>
              {!isReadOnly ? (
                <button
                  type="button"
                  className={styles.timelineAddBtn}
                  onClick={() => {
                    setIsAddingEvent(!isAddingEvent);
                    setEditingEventId(null);
                    setEditingVital(null);
                    setEventForm({ type: 'BAPTEME', date: '', dateRaw: '', place: '', notes: '' });
                  }}
                  title="Ajouter un événement à la chronologie"
                >
                  <span>{isAddingEvent ? '✕ Fermer' : '+ Événement'}</span>
                </button>
              ) : null}
            </div>

            {/* Formulaire d'ajout / modification d'événement */}
            {(isAddingEvent || editingEventId) && (
              <form className={styles.timelineFormCard} onSubmit={handleSaveEvent}>
                <div className={styles.timelineFormHeader}>
                  <span>{editingEventId ? '✏️ Modifier l’événement' : '➕ Nouvel événement'}</span>
                  <button
                    type="button"
                    className={styles.drawerMiniAction}
                    onClick={() => {
                      setIsAddingEvent(false);
                      setEditingEventId(null);
                    }}
                  >
                    ✕
                  </button>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Type d'événement</label>
                  <select
                    className={styles.formSelect}
                    value={eventForm.type}
                    onChange={(e) => setEventForm({ ...eventForm, type: e.target.value })}
                  >
                    <option value="BAPTEME">Baptême</option>
                    <option value="PROFESSION">Profession / Métier</option>
                    <option value="RESIDENCE">Résidence / Domicile</option>
                    <option value="MARIAGE">Mariage</option>
                    <option value="MILITAIRE">Service militaire</option>
                    <option value="TITRE">Titre / Distinction</option>
                    <option value="RECENSEMENT">Recensement</option>
                    <option value="SEPULTURE">Sépulture</option>
                    <option value="TESTAMENT">Testament</option>
                    <option value="AUTRE">Autre événement</option>
                  </select>
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Date exacte</label>
                    <input
                      className={styles.formInput}
                      type="date"
                      value={eventForm.date}
                      onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Date libre / approximative</label>
                    <input
                      className={styles.formInput}
                      type="text"
                      value={eventForm.dateRaw}
                      onChange={(e) => setEventForm({ ...eventForm, dateRaw: e.target.value })}
                      placeholder="ex: vers 1740, mai 1812"
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Lieu</label>
                  <input
                    className={styles.formInput}
                    type="text"
                    value={eventForm.place}
                    onChange={(e) => setEventForm({ ...eventForm, place: e.target.value })}
                    placeholder="ex: Paris, France ou Paroisse Saint-Sulpice"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Notes & détails</label>
                  <input
                    className={styles.formInput}
                    type="text"
                    value={eventForm.notes}
                    onChange={(e) => setEventForm({ ...eventForm, notes: e.target.value })}
                    placeholder="Témoins, parrain/marraine, détails..."
                  />
                </div>

                <div className={styles.timelineFormActions}>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() => {
                      setIsAddingEvent(false);
                      setEditingEventId(null);
                    }}
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className={styles.btnPrimary}
                    disabled={savingEvent}
                  >
                    {savingEvent ? 'Enregistrement...' : editingEventId ? 'Mettre à jour' : 'Ajouter'}
                  </button>
                </div>
              </form>
            )}

            {/* Formulaire d'édition Naissance / Décès */}
            {editingVital && (
              <form className={styles.timelineFormCard} onSubmit={handleSaveVital}>
                <div className={styles.timelineFormHeader}>
                  <span>{editingVital === 'birth' ? '👶 Modifier la Naissance' : '⚰️ Modifier le Décès'}</span>
                  <button
                    type="button"
                    className={styles.drawerMiniAction}
                    onClick={() => setEditingVital(null)}
                  >
                    ✕
                  </button>
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Date</label>
                    <input
                      className={styles.formInput}
                      type="date"
                      value={vitalForm.date}
                      onChange={(e) => setVitalForm({ ...vitalForm, date: e.target.value })}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Lieu</label>
                    <input
                      className={styles.formInput}
                      type="text"
                      value={vitalForm.place}
                      onChange={(e) => setVitalForm({ ...vitalForm, place: e.target.value })}
                      placeholder="Ville, département, pays"
                    />
                  </div>
                </div>

                <div className={styles.timelineFormActions}>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() => setEditingVital(null)}
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className={styles.btnPrimary}
                    disabled={savingEvent}
                  >
                    {savingEvent ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>
              </form>
            )}

            {loadingEvents ? (
              <div className={styles.drawerLoading}>Chargement des événements...</div>
            ) : (
              <div className={styles.drawerTimeline}>
                {/* Naissance */}
                <div className={styles.timelineItem}>
                  <div className={styles.timelineDot} />
                  <div className={styles.timelineCard}>
                    <div className={styles.timelineCardMain}>
                      <div className={styles.timelineDate}>
                        {person.birthDate ? formatShortDate(person.birthDate) : 'Date de naissance inconnue'}
                      </div>
                      <div className={styles.timelineTitle}>Naissance</div>
                      {person.birthPlace ? <div className={styles.timelinePlace}>📍 {person.birthPlace}</div> : null}
                    </div>
                    {!isReadOnly ? (
                      <div className={styles.timelineCardActions}>
                        <button
                          type="button"
                          className={styles.timelineMiniBtn}
                          title="Modifier la naissance"
                          onClick={() => {
                            setEditingVital('birth');
                            setEditingEventId(null);
                            setIsAddingEvent(false);
                            setVitalForm({
                              date: person.birthDate ? person.birthDate.slice(0, 10) : '',
                              place: person.birthPlace || '',
                            });
                          }}
                        >
                          ✏️
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Unions */}
                {unionGroups.map((u) => (
                  <div key={u.key} className={styles.timelineItem}>
                    <div className={styles.timelineDot} style={{ borderColor: 'var(--color-accent)' }} />
                    <div className={styles.timelineCard}>
                      <div className={styles.timelineCardMain}>
                        <div className={styles.timelineDate}>{u.subtitle}</div>
                        <div className={styles.timelineTitle}>Union avec {u.title}</div>
                        {u.children.length > 0 ? (
                          <div className={styles.timelineDetail}>{u.children.length} enfant(s) né(s) de cette union</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Autres événements API */}
                {events.map((ev) => {
                  const placeName = formatEventPlace(ev);
                  const cleanNotes = formatEventNotes(ev);
                  const typeLabel = EVENT_TYPE_LABELS[ev.type] || ev.type || 'Événement';
                  const dateDisplay = ev.date
                    ? formatShortDate(ev.date)
                    : ev.dateRaw || 'Date non précisée';

                  return (
                    <div key={ev.id} className={styles.timelineItem}>
                      <div className={styles.timelineDot} />
                      <div className={styles.timelineCard}>
                        <div className={styles.timelineCardMain}>
                          <div className={styles.timelineDate}>{dateDisplay}</div>
                          <div className={styles.timelineTitle}>{typeLabel}</div>
                          {placeName ? <div className={styles.timelinePlace}>📍 {placeName}</div> : null}
                          {cleanNotes ? <div className={styles.timelineDetail}>{cleanNotes}</div> : null}
                        </div>
                        {!isReadOnly ? (
                          <div className={styles.timelineCardActions}>
                            <button
                              type="button"
                              className={styles.timelineMiniBtn}
                              title="Modifier cet événement"
                              onClick={() => {
                                setEditingEventId(ev.id);
                                setIsAddingEvent(false);
                                setEditingVital(null);

                                let placeVal = ev.place?.name || '';
                                let notesVal = ev.notes || '';
                                if (!placeVal && notesVal.startsWith('Lieu : ')) {
                                  const parts = notesVal.split('\n');
                                  placeVal = parts[0].replace(/^Lieu\s*:\s*/i, '').trim();
                                  notesVal = parts.slice(1).join('\n').trim();
                                }

                                setEventForm({
                                  type: ev.type || 'AUTRE',
                                  date: ev.date ? ev.date.slice(0, 10) : '',
                                  dateRaw: ev.dateRaw || '',
                                  place: placeVal,
                                  notes: notesVal,
                                });
                              }}
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              className={`${styles.timelineMiniBtn} ${styles.timelineMiniBtnDanger}`}
                              title="Supprimer cet événement"
                              onClick={() => handleDeleteEvent(ev.id)}
                            >
                              🗑️
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}

                {/* Décès */}
                {(person.deathDate || person.deathPlace || !isReadOnly) ? (
                  <div className={styles.timelineItem}>
                    <div className={`${styles.timelineDot} ${styles.timelineDotDeath}`} />
                    <div className={styles.timelineCard}>
                      <div className={styles.timelineCardMain}>
                        <div className={styles.timelineDate}>
                          {person.deathDate ? formatShortDate(person.deathDate) : 'Date de décès non renseignée'}
                        </div>
                        <div className={styles.timelineTitle}>Décès</div>
                        {person.deathPlace ? <div className={styles.timelinePlace}>📍 {person.deathPlace}</div> : null}
                        {age !== null ? <div className={styles.timelineDetail}>Âge au décès : {age} ans</div> : null}
                      </div>
                      {!isReadOnly ? (
                        <div className={styles.timelineCardActions}>
                          <button
                            type="button"
                            className={styles.timelineMiniBtn}
                            title="Modifier le décès"
                            onClick={() => {
                              setEditingVital('death');
                              setEditingEventId(null);
                              setIsAddingEvent(false);
                              setVitalForm({
                                date: person.deathDate ? person.deathDate.slice(0, 10) : '',
                                place: person.deathPlace || '',
                              });
                            }}
                          >
                            ✏️
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

// Helper: Calculate age in years
function calculateAge(birthDate?: string | null, deathDate?: string | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;

  const end = deathDate ? new Date(deathDate) : new Date();
  if (Number.isNaN(end.getTime())) return null;

  let age = end.getFullYear() - birth.getFullYear();
  const m = end.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && end.getDate() < birth.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
}

// Helper: Initials from person
function getInitials(person: Person): string {
  const given = (person.givenNames || '').trim().split(' ')[0] || '';
  const surname = (person.usageSurname || person.birthSurname || '').trim();
  const g = given ? given[0].toUpperCase() : '';
  const s = surname ? surname[0].toUpperCase() : '';
  return `${g}${s}` || '?';
}
