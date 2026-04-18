'use client';

// ══════════════════════════════════════
// Origineo — Admin Panel
// ══════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { authApi, personApi, gedcomApi } from '@/lib/api';

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
        <div className="toast-success" style={{
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

// ─── GEDCOM Panel ───────────────────────────
function GedcomPanel({ token }: { token: string }) {
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
      {/* Import */}
      <div className="glass-card">
        <h3 style={{ marginBottom: 'var(--space-4)' }}>📥 Importer un GEDCOM</h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>
          Importez un fichier .ged pour peupler votre arbre généalogique.
        </p>

        <label
          htmlFor="gedcom-file-input"
          className="btn btn-secondary"
          style={{
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'center',
            opacity: importing ? 0.5 : 1,
          }}
        >
          {importing ? (
            <>
              <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
              Import en cours...
            </>
          ) : (
            '📄 Choisir un fichier .ged'
          )}
        </label>
        <input
          id="gedcom-file-input"
          type="file"
          accept=".ged"
          onChange={handleImport}
          style={{ display: 'none' }}
          disabled={importing}
        />

        {importResult && (
          <div style={{
            marginTop: 'var(--space-4)',
            padding: 'var(--space-4)',
            background: 'var(--color-emerald-subtle)',
            border: '1px solid var(--color-emerald)',
            borderRadius: 'var(--radius-lg)',
            fontSize: 'var(--text-sm)',
          }}>
            <p style={{ fontWeight: 600, marginBottom: 'var(--space-2)' }}>✅ Import réussi</p>
            <p>Personnes créées : {importResult.personsCreated}</p>
            <p>Relations créées : {importResult.relationshipsCreated}</p>
            <p>Unions créées : {importResult.unionsCreated}</p>
          </div>
        )}
      </div>

      {/* Export */}
      <div className="glass-card">
        <h3 style={{ marginBottom: 'var(--space-4)' }}>📤 Exporter en GEDCOM</h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>
          Téléchargez votre arbre au format GEDCOM 5.5.1 pour l&apos;utiliser dans d&apos;autres logiciels.
        </p>

        <a
          href={gedcomApi.exportUrl()}
          className="btn btn-secondary"
          style={{ display: 'flex', justifyContent: 'center' }}
          id="export-gedcom-button"
        >
          📥 Télécharger l&apos;arbre complet (.ged)
        </a>
      </div>
    </div>
  );
}
