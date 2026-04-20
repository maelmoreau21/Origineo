'use client';

// ══════════════════════════════════════
// Origineo — Person Detail Page
// ══════════════════════════════════════

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import { personApi, unionApi, documentApi } from '@/lib/api';

const CATEGORY_LABELS: Record<string, string> = {
  BIRTH_CERT: 'Acte de naissance',
  DEATH_CERT: 'Acte de décès',
  MARRIAGE_CERT: 'Acte de mariage',
  BIRTH_CERTIFICATE: 'Acte de naissance',
  DEATH_CERTIFICATE: 'Acte de décès',
  MARRIAGE_CERTIFICATE: 'Acte de mariage',
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

const UNION_END_REASON_LABELS: Record<string, string> = {
  DIVORCE: 'Divorce',
  DEATH: 'Décès',
  ANNULMENT: 'Annulation',
  OTHER: 'Autre',
};

const HISTORY_EVENT_LABELS: Record<string, string> = {
  PERSON_CREATED: 'Création',
  PERSON_UPDATED: 'Mise à jour',
  PERSON_DELETED: 'Suppression',
  ROOT_CHANGED: 'Changement racine',
  COMPONENT_CONNECTED: 'Rattachement composant',
  COMPONENT_REMOVED: 'Suppression composant',
  PERSON_BRANCH_REMOVED: 'Suppression branche',
  TREE_CLEARED: 'Arbre vidé',
};

function formatDateValue(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString('fr-FR');
}

function toDateInputValue(value?: string | null) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

function unionTypeLabel(type?: string | null) {
  if (!type) return 'Union';
  return UNION_TYPE_LABELS[type] || type;
}

function unionEndReasonLabel(reason?: string | null) {
  if (!reason) return null;
  return UNION_END_REASON_LABELS[reason] || reason;
}

function isImageMimeType(mimeType: string) {
  return mimeType.startsWith('image/');
}

function roleFromJwt(token: string): string | null {
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return null;

    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const decoded = atob(padded);
    const payload = JSON.parse(decoded) as { role?: string };

    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

export default function PersonPage() {
  const params = useParams();
  const personId = params?.id as string;

  const [person, setPerson] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [adminMode, setAdminMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!personId) return;

    async function load() {
      try {
        const token = localStorage.getItem('origineo_token') || undefined;
        const [personResult, docsResult, historyResult] = await Promise.all([
          personApi.getById(personId),
          documentApi.getByPerson(personId).catch(() => ({ data: [] })),
          token
            ? personApi.getHistory(personId, 120, token).catch(() => null)
            : Promise.resolve(null),
        ]);
        setPerson(personResult.data);
        setDocuments(docsResult.data || []);
        setHistory(historyResult?.data || []);
        setHistoryVisible(Boolean(historyResult));
        setAdminMode(token ? roleFromJwt(token) === 'ADMIN' : false);
      } catch (err: any) {
        setError(err.message || 'Personne introuvable');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [personId]);

  if (loading) {
    return (
      <div style={{ padding: 'var(--space-8)' }}>
        <div className="container">
          <div className="skeleton" style={{ height: 40, width: 300, marginBottom: 'var(--space-6)' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
            <div className="skeleton" style={{ height: 300, borderRadius: 'var(--radius-xl)' }} />
            <div className="skeleton" style={{ height: 300, borderRadius: 'var(--radius-xl)' }} />
          </div>
        </div>
      </div>
    );
  }

  if (error || !person) {
    return (
      <div style={{ padding: 'var(--space-8)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <div className="glass-card" style={{ textAlign: 'center', maxWidth: 400 }}>
          <h2 style={{ color: 'var(--color-rose)', marginBottom: 'var(--space-4)' }}>Erreur</h2>
          <p style={{ color: 'var(--color-text-secondary)' }}>{error}</p>
        </div>
      </div>
    );
  }

  const displayName = person.givenNames + (person.usageSurname ? ` ${person.usageSurname}` : person.birthSurname ? ` ${person.birthSurname}` : '');

  const parents =
    person.childRelationships?.map((r: any) => r.parent).filter(Boolean) || [];
  const children =
    person.parentRelationships?.map((r: any) => r.child).filter(Boolean) || [];
  const unions = [
    ...(person.unionsAsPartner1 || []).map((u: any) => ({
      ...u,
      partner: u.partner2,
    })),
    ...(person.unionsAsPartner2 || []).map((u: any) => ({
      ...u,
      partner: u.partner1,
    })),
  ].sort((a: any, b: any) => {
    const aStart = a.startDate ? new Date(a.startDate).getTime() : 0;
    const bStart = b.startDate ? new Date(b.startDate).getTime() : 0;
    if (bStart !== aStart) {
      return bStart - aStart;
    }

    const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bCreated - aCreated;
  });

  const refreshPerson = async () => {
    const result = await personApi.getById(personId);
    setPerson(result.data);
  };

  return (
    <div style={{ padding: 'var(--space-8)' }} className="animate-fade-in">
      <div className="container">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
          <span style={{
            fontSize: '2.5rem',
            width: 60,
            height: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius-full)',
            background: person.gender === 'MALE' ? 'var(--color-male-subtle)' : person.gender === 'FEMALE' ? 'var(--color-female-subtle)' : 'var(--color-bg-elevated)',
          }}>
            {person.gender === 'MALE' ? '♂' : person.gender === 'FEMALE' ? '♀' : '◯'}
          </span>
          <div>
            <h1 id="person-name">{displayName}</h1>
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
              <span className={`badge ${person.gender === 'MALE' ? 'badge-male' : person.gender === 'FEMALE' ? 'badge-female' : 'badge-accent'}`}>
                {person.gender === 'MALE' ? 'Homme' : person.gender === 'FEMALE' ? 'Femme' : 'Inconnu'}
              </span>
              {person.isRootDefault && <span className="badge badge-accent">Racine</span>}
            </div>
          </div>
        </div>

        {/* Info Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 'var(--space-6)' }}>
          {/* Personal Info */}
          <div className="glass-card">
            <h3 style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--text-lg)' }}>
              📋 Informations Personnelles
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <InfoRow label="Prénom(s)" value={person.givenNames} />
              <InfoRow label="Nom d'usage" value={person.usageSurname} />
              <InfoRow label="Nom de naissance" value={person.birthSurname} />
              <InfoRow label="Naissance" value={person.birthDate ? `${new Date(person.birthDate).toLocaleDateString('fr-FR')}${person.birthPlace ? ` — ${person.birthPlace}` : ''}` : null} />
              <InfoRow label="Décès" value={person.deathDate ? `${new Date(person.deathDate).toLocaleDateString('fr-FR')}${person.deathPlace ? ` — ${person.deathPlace}` : ''}` : null} />
              <InfoRow label="Profession(s)" value={person.professions?.join(', ')} />
              {person.notes && (
                <div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-1)' }}>Notes</div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>
                    {person.notes}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Parents */}
          <div className="glass-card">
            <h3 style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--text-lg)' }}>
              👨‍👩‍👧 Parents ({parents.length})
            </h3>
            {parents.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Aucun parent enregistré</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {parents.map((p: any) => (
                  <PersonLink key={p.id} person={p} />
                ))}
              </div>
            )}
          </div>

          {/* Children */}
          <div className="glass-card">
            <h3 style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--text-lg)' }}>
              👶 Enfants ({children.length})
            </h3>
            {children.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Aucun enfant enregistré</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {children.map((c: any) => (
                  <PersonLink key={c.id} person={c} />
                ))}
              </div>
            )}
          </div>

          {/* Unions */}
          <div className="glass-card">
            <h3 style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--text-lg)' }}>
              💍 Unions ({unions.length})
            </h3>
            {unions.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Aucune union enregistrée</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {unions.map((u: any) => (
                  <UnionRecordCard
                    key={u.id}
                    union={u}
                    canManage={adminMode}
                    onUnionUpdated={refreshPerson}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ─── Documents Section ──────────────── */}
        <div style={{ marginTop: 'var(--space-8)' }}>
          <DocumentsPanel personId={personId} documents={documents} onUpdate={setDocuments} />
        </div>

        {historyVisible && (
          <div className="glass-card" style={{ marginTop: 'var(--space-8)' }}>
            <h3 style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--text-lg)' }}>
              🕘 Historique des modifications ({history.length})
            </h3>

            {history.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                Aucune modification historisée pour cette personne.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: 'var(--space-2)', maxHeight: 320, overflow: 'auto' }}>
                {history.map((entry: any) => (
                  <div key={entry.id} style={{ border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2)', background: 'var(--color-bg-primary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                      <span className="badge badge-accent">
                        {HISTORY_EVENT_LABELS[entry.eventType] || entry.eventType}
                      </span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                        {new Date(entry.at).toLocaleString('fr-FR')} · {entry.actor || 'system'}
                      </span>
                    </div>

                    {entry.details && (
                      <pre style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--font-mono)' }}>
                        {JSON.stringify(entry.details, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* UUID */}
        <div style={{ marginTop: 'var(--space-8)', textAlign: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            UUID: {person.id}
          </span>
        </div>
      </div>
    </div>
  );
}

function UnionRecordCard({
  union,
  canManage,
  onUnionUpdated,
}: {
  union: any;
  canManage: boolean;
  onUnionUpdated: () => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [savingUnion, setSavingUnion] = useState(false);
  const [editing, setEditing] = useState(false);
  const [category, setCategory] = useState('MARRIAGE_CERTIFICATE');
  const [description, setDescription] = useState('');
  const [form, setForm] = useState({
    type: union.type || 'MARRIAGE',
    startDate: toDateInputValue(union.startDate),
    startPlace: union.startPlace || '',
    endDate: toDateInputValue(union.endDate),
    endReason: union.endReason || '',
    notes: union.notes || '',
  });

  const loadDocuments = useMemo(
    () => async () => {
      setLoadingDocuments(true);
      try {
        const result = await documentApi.getByUnion(union.id);
        setDocuments(Array.isArray(result.data) ? result.data : []);
      } catch {
        setDocuments([]);
      } finally {
        setLoadingDocuments(false);
      }
    },
    [union.id],
  );

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    setForm({
      type: union.type || 'MARRIAGE',
      startDate: toDateInputValue(union.startDate),
      startPlace: union.startPlace || '',
      endDate: toDateInputValue(union.endDate),
      endReason: union.endReason || '',
      notes: union.notes || '',
    });
  }, [
    union.id,
    union.type,
    union.startDate,
    union.startPlace,
    union.endDate,
    union.endReason,
    union.notes,
  ]);

  const startDateLabel = formatDateValue(union.startDate);
  const endDateLabel = formatDateValue(union.endDate);
  const endReasonLabel = unionEndReasonLabel(union.endReason);

  const eventLine = startDateLabel || union.startPlace
    ? `${startDateLabel ? `Le ${startDateLabel}` : 'Date inconnue'}${union.startPlace ? ` à ${union.startPlace}` : ''}`
    : 'Date et lieu non renseignés';

  const endLine = endDateLabel || endReasonLabel
    ? `${endDateLabel ? `Fin le ${endDateLabel}` : 'Fin sans date précise'}${endReasonLabel ? ` (${endReasonLabel})` : ''}`
    : null;

  const handleSaveUnion = async () => {
    const token = localStorage.getItem('origineo_token');
    if (!token) {
      alert('Connectez-vous en administrateur pour modifier une union.');
      return;
    }

    setSavingUnion(true);
    try {
      await unionApi.update(
        union.id,
        {
          type: form.type,
          startDate: form.startDate || '',
          startPlace: form.startPlace.trim(),
          endDate: form.endDate || '',
          endReason: form.endReason || '',
          notes: form.notes.trim(),
        },
        token,
      );
      await onUnionUpdated();
      setEditing(false);
    } catch (err: any) {
      alert(err.message || 'Impossible de mettre à jour l\'union.');
    } finally {
      setSavingUnion(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const token = localStorage.getItem('origineo_token');
    if (!token) {
      alert('Veuillez vous connecter en tant qu\'administrateur pour envoyer des documents de couple.');
      return;
    }

    setUploading(true);
    try {
      await documentApi.upload(
        file,
        {
          unionId: union.id,
          category,
          description: description || undefined,
        },
        token,
      );
      await loadDocuments();
      setDescription('');
    } catch (err: any) {
      alert(err.message || 'Erreur lors de l\'envoi du document de couple.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    const token = localStorage.getItem('origineo_token');
    if (!token) {
      alert('Veuillez vous connecter en tant qu\'administrateur pour supprimer un document.');
      return;
    }

    if (!confirm('Supprimer ce document de couple ?')) {
      return;
    }

    try {
      await documentApi.delete(docId, token);
      setDocuments((current) => current.filter((doc) => doc.id !== docId));
    } catch (err: any) {
      alert(err.message || 'Erreur lors de la suppression du document.');
    }
  };

  return (
    <div
      style={{
        padding: 'var(--space-3)',
        background: 'var(--color-bg-primary)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border-subtle)',
        display: 'grid',
        gap: 'var(--space-3)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <PersonLink person={union.partner} />
        <span className="badge badge-amber">{unionTypeLabel(union.type)}</span>
      </div>

      <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          📍 {eventLine}
        </div>
        {endLine && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            {endLine}
          </div>
        )}
        {union.notes && !editing && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', whiteSpace: 'pre-wrap' }}>
            📝 {union.notes}
          </div>
        )}
      </div>

      {canManage && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={() => setEditing((current) => !current)}>
            {editing ? 'Fermer édition union' : 'Modifier date/lieu/notes'}
          </button>
        </div>
      )}

      {editing && (
        <div style={{ border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', display: 'grid', gap: 'var(--space-2)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
            <div className="input-group">
              <label className="input-label">Type d&apos;union</label>
              <select className="input" value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}>
                <option value="MARRIAGE">Mariage</option>
                <option value="PACS">PACS</option>
                <option value="PARTNERSHIP">Partenariat</option>
                <option value="OTHER">Autre</option>
              </select>
            </div>

            <div className="input-group">
              <label className="input-label">Date de l&apos;union</label>
              <input className="input" type="date" value={form.startDate} onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))} />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Lieu de l&apos;union</label>
            <input className="input" value={form.startPlace} onChange={(e) => setForm((prev) => ({ ...prev, startPlace: e.target.value }))} placeholder="Ex: Lille, France" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
            <div className="input-group">
              <label className="input-label">Date de fin</label>
              <input className="input" type="date" value={form.endDate} onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))} />
            </div>
            <div className="input-group">
              <label className="input-label">Raison de fin</label>
              <select className="input" value={form.endReason} onChange={(e) => setForm((prev) => ({ ...prev, endReason: e.target.value }))}>
                <option value="">Aucune</option>
                <option value="DIVORCE">Divorce</option>
                <option value="DEATH">Décès</option>
                <option value="ANNULMENT">Annulation</option>
                <option value="OTHER">Autre</option>
              </select>
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Notes de l&apos;union</label>
            <textarea
              className="input"
              style={{ minHeight: 90, resize: 'vertical' }}
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Ex: union religieuse, témoins, registre..."
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
            <button className="btn btn-ghost" onClick={() => setEditing(false)} disabled={savingUnion}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={handleSaveUnion} disabled={savingUnion}>
              {savingUnion ? 'Sauvegarde...' : 'Sauvegarder'}
            </button>
          </div>
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 'var(--space-3)', display: 'grid', gap: 'var(--space-2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)' }}>
          <h4 style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
            📎 Documents du couple ({documents.length})
          </h4>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            Documents liés aux deux partenaires
          </span>
        </div>

        {canManage && (
          <div style={{
            padding: 'var(--space-3)',
            background: 'var(--color-bg-elevated)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border-subtle)',
          }}>
            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="input-group" style={{ flex: '1 1 180px' }}>
                <label className="input-label">Catégorie</label>
                <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="MARRIAGE_CERTIFICATE">Acte de mariage</option>
                  <option value="PHOTO">Photo</option>
                  <option value="OFFICIAL_DOCUMENT">Document officiel</option>
                  <option value="OTHER">Autre</option>
                </select>
              </div>
              <div className="input-group" style={{ flex: '2 1 220px' }}>
                <label className="input-label">Description</label>
                <input
                  className="input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Acte de mariage de la mairie"
                />
              </div>
              <div>
                <label className="btn btn-secondary" style={{ cursor: 'pointer', opacity: uploading ? 0.5 : 1 }}>
                  {uploading ? 'Envoi...' : 'Ajouter document couple'}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.pdf,.doc,.docx"
                    onChange={handleUpload}
                    style={{ display: 'none' }}
                    disabled={uploading}
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {loadingDocuments ? (
          <div className="spinner" />
        ) : documents.length === 0 ? (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            Aucun document de couple pour cette union.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--space-2)' }}>
            {documents.map((doc) => (
              <div
                key={doc.id}
                style={{
                  background: 'var(--color-bg-elevated)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-subtle)',
                  overflow: 'hidden',
                }}
              >
                {isImageMimeType(doc.mimeType) ? (
                  <div style={{ width: '100%', height: 110, overflow: 'hidden', background: 'var(--color-bg-tertiary)' }}>
                    <img
                      src={documentApi.viewUrl(doc.id)}
                      alt={doc.filename}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <div style={{ width: '100%', height: 72, background: 'var(--color-bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
                    📄
                  </div>
                )}

                <div style={{ padding: 'var(--space-2)' }}>
                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {doc.filename}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-1)' }}>
                    <span className="badge badge-accent" style={{ fontSize: '0.62rem' }}>
                      {CATEGORY_LABELS[doc.category] || doc.category}
                    </span>
                    <a href={documentApi.downloadUrl(doc.id)} className="btn btn-ghost" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
                      Télécharger
                    </a>
                  </div>
                  {doc.description && (
                    <div style={{ fontSize: '0.68rem', color: 'var(--color-text-tertiary)', marginTop: 'var(--space-1)' }}>
                      {doc.description}
                    </div>
                  )}
                  {canManage && (
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: '0.68rem', padding: '2px 8px', color: 'var(--color-rose)', marginTop: 'var(--space-1)' }}
                      onClick={() => handleDeleteDocument(doc.id)}
                    >
                      Supprimer
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Documents Panel ────────────────────────
function DocumentsPanel({
  personId,
  documents,
  onUpdate,
}: {
  personId: string;
  documents: any[];
  onUpdate: (docs: any[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState('OTHER');
  const [description, setDescription] = useState('');

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const token = localStorage.getItem('origineo_token');
    if (!token) {
      alert('Veuillez vous connecter en tant qu\'administrateur pour envoyer des fichiers.');
      return;
    }

    setUploading(true);
    try {
      await documentApi.upload(
        file,
        { personId, category, description: description || undefined },
        token,
      );
      // Refresh documents list
      const result = await documentApi.getByPerson(personId);
      onUpdate(result.data || []);
      setDescription('');
    } catch (err: any) {
      alert(err.message || 'Erreur lors de l\'envoi');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (docId: string) => {
    const token = localStorage.getItem('origineo_token');
    if (!token) return;
    if (!confirm('Supprimer ce document ?')) return;

    try {
      await documentApi.delete(docId, token);
      onUpdate(documents.filter((d) => d.id !== docId));
    } catch (err: any) {
      alert(err.message || 'Erreur lors de la suppression');
    }
  };

  return (
    <div className="glass-card" id="documents-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <h3 style={{ fontSize: 'var(--text-lg)' }}>
          📎 Documents individuels ({documents.length})
        </h3>
      </div>

      {/* Upload Form */}
      <div style={{
        padding: 'var(--space-4)',
        background: 'var(--color-bg-primary)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border-subtle)',
        marginBottom: 'var(--space-4)',
      }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="input-group" style={{ flex: '1 1 200px' }}>
            <label className="input-label">Catégorie</label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)} id="doc-category">
              <option value="PHOTO">Photo</option>
              <option value="BIRTH_CERTIFICATE">Acte de naissance</option>
              <option value="DEATH_CERTIFICATE">Acte de décès</option>
              <option value="MARRIAGE_CERTIFICATE">Acte de mariage</option>
              <option value="OFFICIAL_DOCUMENT">Document officiel</option>
              <option value="OTHER">Autre</option>
            </select>
          </div>
          <div className="input-group" style={{ flex: '2 1 250px' }}>
            <label className="input-label">Description (optionnelle)</label>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Photo de famille, 1965" id="doc-description" />
          </div>
          <div>
            <label
              htmlFor="doc-file-input"
              className="btn btn-primary"
              style={{ cursor: 'pointer', opacity: uploading ? 0.5 : 1 }}
            >
              {uploading ? (
                <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Envoi...</>
              ) : (
                '📤 Envoyer un fichier'
              )}
            </label>
            <input
              ref={fileInputRef}
              id="doc-file-input"
              type="file"
              accept="image/*,.pdf,.doc,.docx"
              onChange={handleUpload}
              style={{ display: 'none' }}
              disabled={uploading}
            />
          </div>
        </div>
      </div>

      {/* Documents List */}
      {documents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--color-text-muted)' }}>
          <p style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-2)' }}>📂</p>
          <p style={{ fontSize: 'var(--text-sm)' }}>Aucun document associé à cette personne.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 'var(--space-3)' }}>
          {documents.map((doc: any) => (
            <div key={doc.id} style={{
              background: 'var(--color-bg-primary)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border-subtle)',
              overflow: 'hidden',
              transition: 'all var(--transition-base)',
            }}>
              {/* Preview */}
              {isImageMimeType(doc.mimeType) ? (
                <div style={{
                  width: '100%',
                  height: 160,
                  background: 'var(--color-bg-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}>
                  <img
                    src={documentApi.viewUrl(doc.id)}
                    alt={doc.filename}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    loading="lazy"
                  />
                </div>
              ) : (
                <div style={{
                  width: '100%',
                  height: 80,
                  background: 'var(--color-bg-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '2rem',
                }}>
                  📄
                </div>
              )}

              {/* Info */}
              <div style={{ padding: 'var(--space-3)' }}>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {doc.filename}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                  <span className="badge badge-accent" style={{ fontSize: '0.65rem' }}>
                    {CATEGORY_LABELS[doc.category] || doc.category}
                  </span>
                </div>
                {doc.description && (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-2)' }}>
                    {doc.description}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <a
                    href={documentApi.downloadUrl(doc.id)}
                    className="btn btn-ghost"
                    style={{ fontSize: 'var(--text-xs)', padding: 'var(--space-1) var(--space-2)' }}
                  >
                    ⬇ Télécharger
                  </a>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 'var(--text-xs)', padding: 'var(--space-1) var(--space-2)', color: 'var(--color-rose)' }}
                    onClick={() => handleDelete(doc.id)}
                  >
                    🗑 Supprimer
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Helper Components ──────────────────────
function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
        {value}
      </div>
    </div>
  );
}

function PersonLink({ person }: { person: any }) {
  const name = person.givenNames + (person.usageSurname ? ` ${person.usageSurname}` : person.birthSurname ? ` ${person.birthSurname}` : '');

  return (
    <a
      href={`/person/${person.id}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-3)',
        borderRadius: 'var(--radius-md)',
        color: 'var(--color-text-primary)',
        textDecoration: 'none',
        fontSize: 'var(--text-sm)',
        transition: 'background var(--transition-fast)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ fontSize: 'var(--text-sm)' }}>
        {person.gender === 'MALE' ? '♂' : person.gender === 'FEMALE' ? '♀' : '◯'}
      </span>
      <span>{name}</span>
    </a>
  );
}
