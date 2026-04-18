'use client';

// ══════════════════════════════════════
// Origineo — Admin Panel (Phase 2)
// ══════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { authApi, personApi, gedcomApi, documentApi } from '@/lib/api';

type Tab = 'persons' | 'add' | 'gedcom' | 'login';

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<Tab>('login');

  // Try to restore session from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('origineo_token');
    if (saved) {
      setToken(saved);
      authApi.getProfile(saved).then((res) => {
        setUser(res.data);
        setActiveTab('persons');
      }).catch(() => {
        localStorage.removeItem('origineo_token');
      });
    }
  }, []);

  const handleLogin = async (email: string, password: string) => {
    try {
      const result = await authApi.login(email, password);
      const accessToken = result.data.accessToken;
      setToken(accessToken);
      setUser(result.data.user);
      localStorage.setItem('origineo_token', accessToken);
      setActiveTab('persons');
    } catch (err: any) {
      alert(err.message || 'Échec de la connexion');
    }
  };

  const handleRegister = async (email: string, password: string, displayName: string) => {
    try {
      const result = await authApi.register(email, password, displayName);
      const accessToken = result.data.accessToken;
      setToken(accessToken);
      setUser(result.data.user);
      localStorage.setItem('origineo_token', accessToken);
      setActiveTab('persons');
    } catch (err: any) {
      alert(err.message || 'Échec de l\'inscription');
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('origineo_token');
    setActiveTab('login');
  };

  return (
    <div style={{ padding: 'var(--space-8)' }}>
      <div className="container">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-8)' }}>
          <div>
            <h1>⚙️ Administration</h1>
            {user && (
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>
                Connecté en tant que <strong>{user.displayName || user.email}</strong>
                <span className="badge badge-accent" style={{ marginLeft: 'var(--space-2)' }}>{user.role}</span>
              </p>
            )}
          </div>
          {user && (
            <button className="btn btn-ghost" onClick={handleLogout} id="logout-button">
              Déconnexion
            </button>
          )}
        </div>

        {/* Auth Gate */}
        {!token ? (
          <LoginForm onLogin={handleLogin} onRegister={handleRegister} />
        ) : (
          <>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-6)', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-2)' }}>
              {([
                { key: 'persons', label: '👥 Personnes' },
                { key: 'add', label: '➕ Ajouter' },
                { key: 'gedcom', label: '📄 GEDCOM' },
              ] as { key: Tab; label: string }[]).map(({ key, label }) => (
                <button
                  key={key}
                  className={`btn ${activeTab === key ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setActiveTab(key)}
                  id={`tab-${key}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {activeTab === 'persons' && <PersonsList token={token} />}
            {activeTab === 'add' && <AddPersonForm token={token} />}
            {activeTab === 'gedcom' && <GedcomPanel token={token} />}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Login Form ─────────────────────────────
function LoginForm({
  onLogin,
  onRegister,
}: {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string, displayName: string) => Promise<void>;
}) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isRegister) {
        await onRegister(email, password, displayName);
      } else {
        await onLogin(email, password);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: '0 auto' }}>
      <div className="glass-card animate-fade-in-up">
        <h2 style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
          {isRegister ? '📝 Inscription' : '🔐 Connexion'}
        </h2>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {isRegister && (
            <div className="input-group">
              <label className="input-label">Nom d&apos;affichage</label>
              <input className="input" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Votre nom" id="input-display-name" />
            </div>
          )}

          <div className="input-group">
            <label className="input-label">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@origineo.app" required id="input-email" />
          </div>

          <div className="input-group">
            <label className="input-label">Mot de passe</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 caractères" minLength={8} required id="input-password" />
          </div>

          <button className="btn btn-primary" type="submit" disabled={loading} id="submit-auth" style={{ width: '100%' }}>
            {loading ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : isRegister ? 'S\'inscrire' : 'Se connecter'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          {isRegister ? 'Déjà inscrit ?' : 'Pas encore de compte ?'}{' '}
          <button onClick={() => setIsRegister(!isRegister)} style={{ color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
            {isRegister ? 'Se connecter' : 'S\'inscrire'}
          </button>
        </p>
      </div>
    </div>
  );
}

// ─── Persons List ───────────────────────────
function PersonsList({ token }: { token: string }) {
  const [persons, setPersons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    personApi.getAll(1, 100).then((res) => {
      setPersons(res.data?.data || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton" style={{ height: 60, borderRadius: 'var(--radius-lg)' }} />
        ))}
      </div>
    );
  }

  if (persons.length === 0) {
    return (
      <div className="glass-card" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
        <p style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-2)' }}>📭</p>
        <p style={{ color: 'var(--color-text-secondary)' }}>Aucune personne dans la base de données.</p>
        <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}>
          Utilisez l&apos;onglet &quot;Ajouter&quot; ou importez un fichier GEDCOM.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-2)' }}>
        {persons.length} personne{persons.length > 1 ? 's' : ''} enregistrée{persons.length > 1 ? 's' : ''}
      </p>
      {persons.map((p: any) => {
        const name = p.givenNames + (p.usageSurname ? ` ${p.usageSurname}` : p.birthSurname ? ` ${p.birthSurname}` : '');
        return (
          <div key={p.id} style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-3) var(--space-4)',
            background: 'var(--color-bg-secondary)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border-subtle)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <span>{p.gender === 'MALE' ? '♂' : p.gender === 'FEMALE' ? '♀' : '◯'}</span>
              <a href={`/person/${p.id}`} style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{name}</a>
              {p.isRootDefault && <span className="badge badge-accent">Racine</span>}
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {p.id.slice(0, 8)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Add Person Form ────────────────────────
function AddPersonForm({ token }: { token: string }) {
  const [formData, setFormData] = useState({
    givenNames: '', usageSurname: '', birthSurname: '', gender: 'UNKNOWN',
    birthDate: '', birthPlace: '', deathDate: '', deathPlace: '',
    professions: '', notes: '', isRootDefault: false,
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSuccess(null);
    try {
      const data = {
        ...formData,
        professions: formData.professions
          ? formData.professions.split(',').map((p) => p.trim()).filter(Boolean)
          : [],
        usageSurname: formData.usageSurname || undefined,
        birthSurname: formData.birthSurname || undefined,
        birthDate: formData.birthDate || undefined,
        birthPlace: formData.birthPlace || undefined,
        deathDate: formData.deathDate || undefined,
        deathPlace: formData.deathPlace || undefined,
        notes: formData.notes || undefined,
      };

      await personApi.create(data, token);
      setSuccess(`${formData.givenNames} ajouté(e) avec succès !`);
      setFormData({
        givenNames: '', usageSurname: '', birthSurname: '', gender: 'UNKNOWN',
        birthDate: '', birthPlace: '', deathDate: '', deathPlace: '',
        professions: '', notes: '', isRootDefault: false,
      });
    } catch (err: any) {
      alert(err.message || 'Erreur lors de la création');
    } finally {
      setLoading(false);
    }
  };

  const update = (field: string) => (e: any) =>
    setFormData({ ...formData, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <div style={{ maxWidth: 700 }}>
      {success && (
        <div style={{
          padding: 'var(--space-3) var(--space-4)',
          borderRadius: 'var(--radius-lg)',
          marginBottom: 'var(--space-4)',
          background: 'var(--color-emerald-subtle)',
          border: '1px solid var(--color-emerald)',
          color: 'var(--color-emerald)',
          fontSize: 'var(--text-sm)',
        }}>
          ✅ {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="glass-card">
        <h3 style={{ marginBottom: 'var(--space-6)' }}>➕ Ajouter une personne</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
          <div className="input-group">
            <label className="input-label">Prénoms *</label>
            <input className="input" value={formData.givenNames} onChange={update('givenNames')} required placeholder="Jean Marie" id="input-given-names" />
          </div>
          <div className="input-group">
            <label className="input-label">Genre</label>
            <select className="input" value={formData.gender} onChange={update('gender')} id="input-gender">
              <option value="UNKNOWN">Inconnu</option>
              <option value="MALE">Homme</option>
              <option value="FEMALE">Femme</option>
              <option value="OTHER">Autre</option>
            </select>
          </div>
          <div className="input-group">
            <label className="input-label">Nom d&apos;usage</label>
            <input className="input" value={formData.usageSurname} onChange={update('usageSurname')} placeholder="Dupont" id="input-usage-surname" />
          </div>
          <div className="input-group">
            <label className="input-label">Nom de naissance</label>
            <input className="input" value={formData.birthSurname} onChange={update('birthSurname')} placeholder="Martin" id="input-birth-surname" />
          </div>
          <div className="input-group">
            <label className="input-label">Date de naissance</label>
            <input className="input" type="date" value={formData.birthDate} onChange={update('birthDate')} id="input-birth-date" />
          </div>
          <div className="input-group">
            <label className="input-label">Lieu de naissance</label>
            <input className="input" value={formData.birthPlace} onChange={update('birthPlace')} placeholder="Paris, France" id="input-birth-place" />
          </div>
          <div className="input-group">
            <label className="input-label">Date de décès</label>
            <input className="input" type="date" value={formData.deathDate} onChange={update('deathDate')} id="input-death-date" />
          </div>
          <div className="input-group">
            <label className="input-label">Lieu de décès</label>
            <input className="input" value={formData.deathPlace} onChange={update('deathPlace')} placeholder="Lyon, France" id="input-death-place" />
          </div>
        </div>

        <div className="input-group" style={{ marginTop: 'var(--space-4)' }}>
          <label className="input-label">Professions (séparées par des virgules)</label>
          <input className="input" value={formData.professions} onChange={update('professions')} placeholder="Instituteur, Écrivain" id="input-professions" />
        </div>

        <div className="input-group" style={{ marginTop: 'var(--space-4)' }}>
          <label className="input-label">Notes</label>
          <textarea className="input" value={formData.notes} onChange={update('notes')} rows={3} placeholder="Informations complémentaires..." id="input-notes" style={{ resize: 'vertical' }} />
        </div>

        <div style={{ marginTop: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <input type="checkbox" checked={formData.isRootDefault} onChange={update('isRootDefault')} id="input-is-root" />
          <label htmlFor="input-is-root" className="input-label" style={{ cursor: 'pointer' }}>
            Définir comme personne racine par défaut
          </label>
        </div>

        <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 'var(--space-6)', width: '100%' }} id="submit-person">
          {loading ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : 'Ajouter la personne'}
        </button>
      </form>
    </div>
  );
}

// ─── GEDCOM Panel (Import / Export / Merge) ──
function GedcomPanel({ token }: { token: string }) {
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  // Merge state
  const [mergeStep, setMergeStep] = useState<'idle' | 'analyzing' | 'review' | 'applying' | 'done'>('idle');
  const [mergeAnalysis, setMergeAnalysis] = useState<any>(null);
  const [mergeDecisions, setMergeDecisions] = useState<Record<string, { action: string; mergeIntoPersonId?: string }>>({});
  const [mergeResult, setMergeResult] = useState<any>(null);

  // ─── Basic Import ──────────────────────
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);
    try {
      const result = await gedcomApi.import(file, token);
      setImportResult(result.data);
    } catch (err: any) {
      alert(err.message || 'Erreur lors de l\'import');
    } finally {
      setImporting(false);
    }
  };

  // ─── Merge Step 1: Analyze ─────────────
  const handleMergeAnalyze = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMergeStep('analyzing');
    setMergeAnalysis(null);
    setMergeResult(null);
    try {
      const result = await gedcomApi.mergeAnalyze(file, token);
      setMergeAnalysis(result.data);
      // Pre-fill default decisions
      const defaults: Record<string, { action: string; mergeIntoPersonId?: string }> = {};
      for (const dup of result.data.duplicates || []) {
        defaults[dup.stagedPointer] = {
          action: dup.confidence >= 70 ? 'merge' : 'create',
          mergeIntoPersonId: dup.existingPersonId,
        };
      }
      setMergeDecisions(defaults);
      setMergeStep('review');
    } catch (err: any) {
      alert(err.message || 'Erreur lors de l\'analyse');
      setMergeStep('idle');
    }
  };

  // ─── Merge Step 2: Apply ───────────────
  const handleMergeApply = async () => {
    if (!mergeAnalysis) return;

    setMergeStep('applying');
    try {
      const decisions = Object.entries(mergeDecisions).map(([pointer, dec]) => ({
        stagedPointer: pointer,
        action: dec.action,
        mergeIntoPersonId: dec.mergeIntoPersonId,
      }));

      const result = await gedcomApi.mergeApply(
        mergeAnalysis.sessionId,
        decisions,
        token,
      );
      setMergeResult(result.data);
      setMergeStep('done');
    } catch (err: any) {
      alert(err.message || 'Erreur lors de la fusion');
      setMergeStep('review');
    }
  };

  const setDecision = (pointer: string, action: string, mergeIntoPersonId?: string) => {
    setMergeDecisions((prev) => ({
      ...prev,
      [pointer]: { action, mergeIntoPersonId },
    }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

      {/* Row 1: Import + Export */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
        {/* Import */}
        <div className="glass-card">
          <h3 style={{ marginBottom: 'var(--space-4)' }}>📥 Import Simple</h3>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>
            Crée toutes les personnes du fichier sans vérifier les doublons.
          </p>

          <label htmlFor="gedcom-file-input" className="btn btn-secondary" style={{ cursor: 'pointer', display: 'flex', justifyContent: 'center', opacity: importing ? 0.5 : 1 }}>
            {importing ? (
              <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Import en cours...</>
            ) : (
              '📄 Choisir un fichier .ged'
            )}
          </label>
          <input id="gedcom-file-input" type="file" accept=".ged" onChange={handleImport} style={{ display: 'none' }} disabled={importing} />

          {importResult && (
            <div style={{ marginTop: 'var(--space-4)', padding: 'var(--space-4)', background: 'var(--color-emerald-subtle)', border: '1px solid var(--color-emerald)', borderRadius: 'var(--radius-lg)', fontSize: 'var(--text-sm)' }}>
              <p style={{ fontWeight: 600, marginBottom: 'var(--space-2)' }}>✅ Import réussi</p>
              <p>Personnes créées : {importResult.personsCreated}</p>
              <p>Relations créées : {importResult.relationshipsCreated}</p>
              <p>Unions créées : {importResult.unionsCreated}</p>
            </div>
          )}
        </div>

        {/* Export */}
        <div className="glass-card">
          <h3 style={{ marginBottom: 'var(--space-4)' }}>📤 Exporter</h3>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>
            Téléchargez votre arbre au format GEDCOM 5.5.1.
          </p>
          <a href={gedcomApi.exportUrl()} className="btn btn-secondary" style={{ display: 'flex', justifyContent: 'center' }} id="export-gedcom-button">
            📥 Télécharger l&apos;arbre complet (.ged)
          </a>
        </div>
      </div>

      {/* Row 2: Advanced Merge */}
      <div className="glass-card">
        <h3 style={{ marginBottom: 'var(--space-2)' }}>🔀 Fusion Avancée</h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)' }}>
          Importez un second fichier GEDCOM avec détection automatique des doublons et résolution manuelle des conflits.
        </p>

        {/* Step 1: Upload for analysis */}
        {mergeStep === 'idle' && (
          <>
            <label htmlFor="gedcom-merge-input" className="btn btn-primary" style={{ cursor: 'pointer', display: 'inline-flex' }}>
              🔍 Analyser un fichier .ged pour fusion
            </label>
            <input id="gedcom-merge-input" type="file" accept=".ged" onChange={handleMergeAnalyze} style={{ display: 'none' }} />
          </>
        )}

        {/* Analyzing spinner */}
        {mergeStep === 'analyzing' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span className="spinner" />
            <span style={{ color: 'var(--color-text-secondary)' }}>Analyse et détection des doublons en cours...</span>
          </div>
        )}

        {/* Step 2: Review duplicates */}
        {mergeStep === 'review' && mergeAnalysis && (
          <div className="animate-fade-in-up">
            {/* Stats */}
            <div style={{ display: 'flex', gap: 'var(--space-6)', marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
              <StatCard icon="👤" label="Personnes dans le fichier" value={mergeAnalysis.totalPersonsInFile} />
              <StatCard icon="🔗" label="Familles" value={mergeAnalysis.totalFamiliesInFile} />
              <StatCard icon="⚠️" label="Doublons potentiels" value={mergeAnalysis.duplicates?.length || 0} color="var(--color-amber)" />
              <StatCard icon="✨" label="Nouvelles personnes" value={mergeAnalysis.newPersons?.length || 0} color="var(--color-emerald)" />
            </div>

            {/* Duplicate resolution table */}
            {mergeAnalysis.duplicates?.length > 0 && (
              <div style={{ marginBottom: 'var(--space-6)' }}>
                <h4 style={{ marginBottom: 'var(--space-4)', color: 'var(--color-amber)' }}>
                  ⚠️ Doublons détectés — Résolution requise
                </h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {mergeAnalysis.duplicates.map((dup: any) => {
                    const decision = mergeDecisions[dup.stagedPointer];

                    return (
                      <div key={dup.stagedPointer} style={{
                        background: 'var(--color-bg-primary)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--color-border)',
                        padding: 'var(--space-4)',
                      }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 'var(--space-4)', alignItems: 'center' }}>
                          {/* Incoming person */}
                          <div>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-1)', textTransform: 'uppercase' }}>
                              📄 Fichier GEDCOM
                            </div>
                            <div style={{ fontWeight: 600 }}>
                              {dup.staged.givenNames} {dup.staged.surname}
                            </div>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                              {dup.staged.gender} {dup.staged.birthDate && `· Né: ${dup.staged.birthDate}`}
                              {dup.staged.birthPlace && ` · ${dup.staged.birthPlace}`}
                            </div>
                          </div>

                          {/* Confidence badge */}
                          <div style={{ textAlign: 'center' }}>
                            <div className={`badge ${dup.confidence >= 70 ? 'badge-emerald' : dup.confidence >= 50 ? 'badge-amber' : 'badge-rose'}`} style={{ fontSize: 'var(--text-base)', padding: 'var(--space-2) var(--space-4)' }}>
                              {dup.confidence}%
                            </div>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-1)' }}>
                              confiance
                            </div>
                          </div>

                          {/* Existing person */}
                          <div>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-1)', textTransform: 'uppercase' }}>
                              🗄️ Base existante
                            </div>
                            <div style={{ fontWeight: 600 }}>
                              {dup.existingPerson.givenNames} {dup.existingPerson.usageSurname || dup.existingPerson.birthSurname || ''}
                            </div>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                              {dup.existingPerson.gender}
                              {dup.existingPerson.birthDate && ` · Né: ${new Date(dup.existingPerson.birthDate).toLocaleDateString('fr-FR')}`}
                              {dup.existingPerson.birthPlace && ` · ${dup.existingPerson.birthPlace}`}
                            </div>
                          </div>
                        </div>

                        {/* Match reasons */}
                        <div style={{ marginTop: 'var(--space-2)', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                          {dup.matchReasons?.map((reason: string, i: number) => (
                            <span key={i} style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', background: 'var(--color-bg-tertiary)', padding: '2px 8px', borderRadius: 'var(--radius-sm)' }}>
                              {reason}
                            </span>
                          ))}
                        </div>

                        {/* Decision buttons */}
                        <div style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-2)' }}>
                          <button
                            className={`btn ${decision?.action === 'merge' ? 'btn-primary' : 'btn-ghost'}`}
                            style={{ fontSize: 'var(--text-xs)', padding: 'var(--space-1) var(--space-3)' }}
                            onClick={() => setDecision(dup.stagedPointer, 'merge', dup.existingPersonId)}
                          >
                            🔗 Fusionner
                          </button>
                          <button
                            className={`btn ${decision?.action === 'create' ? 'btn-primary' : 'btn-ghost'}`}
                            style={{ fontSize: 'var(--text-xs)', padding: 'var(--space-1) var(--space-3)' }}
                            onClick={() => setDecision(dup.stagedPointer, 'create')}
                          >
                            ➕ Créer nouveau
                          </button>
                          <button
                            className={`btn ${decision?.action === 'skip' ? 'btn-primary' : 'btn-ghost'}`}
                            style={{ fontSize: 'var(--text-xs)', padding: 'var(--space-1) var(--space-3)' }}
                            onClick={() => setDecision(dup.stagedPointer, 'skip')}
                          >
                            ⏭ Ignorer
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Apply merge */}
            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => { setMergeStep('idle'); setMergeAnalysis(null); }}>
                Annuler
              </button>
              <button className="btn btn-primary" onClick={handleMergeApply} id="apply-merge-button">
                ✅ Appliquer la fusion
              </button>
            </div>
          </div>
        )}

        {/* Applying spinner */}
        {mergeStep === 'applying' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span className="spinner" />
            <span style={{ color: 'var(--color-text-secondary)' }}>Application de la fusion en cours...</span>
          </div>
        )}

        {/* Step 3: Done */}
        {mergeStep === 'done' && mergeResult && (
          <div className="animate-fade-in-up">
            <div style={{ padding: 'var(--space-4)', background: 'var(--color-emerald-subtle)', border: '1px solid var(--color-emerald)', borderRadius: 'var(--radius-lg)', fontSize: 'var(--text-sm)' }}>
              <p style={{ fontWeight: 600, marginBottom: 'var(--space-3)' }}>✅ Fusion terminée avec succès !</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-2)' }}>
                <p>Personnes créées : <strong>{mergeResult.personsCreated}</strong></p>
                <p>Personnes fusionnées : <strong>{mergeResult.personsMerged}</strong></p>
                <p>Personnes ignorées : <strong>{mergeResult.personsSkipped}</strong></p>
                <p>Relations créées : <strong>{mergeResult.relationshipsCreated}</strong></p>
                <p>Unions créées : <strong>{mergeResult.unionsCreated}</strong></p>
              </div>
            </div>
            <button className="btn btn-ghost" style={{ marginTop: 'var(--space-4)' }} onClick={() => { setMergeStep('idle'); setMergeAnalysis(null); setMergeResult(null); }}>
              Effectuer une autre fusion
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Stat Card Component ────────────────────
function StatCard({ icon, label, value, color }: { icon: string; label: string; value: number; color?: string }) {
  return (
    <div style={{
      padding: 'var(--space-3) var(--space-4)',
      background: 'var(--color-bg-primary)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--color-border-subtle)',
      minWidth: 140,
    }}>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-1)' }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, fontFamily: 'var(--font-display)', color: color || 'var(--color-text-primary)' }}>
        {value}
      </div>
    </div>
  );
}
