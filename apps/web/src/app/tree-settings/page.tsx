'use client';

// ══════════════════════════════════════
// Origineo — Tree Settings Workspace
// ══════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  authApi,
  personApi,
  gedcomApi,
  relationshipApi,
  unionApi,
} from '@/lib/api';

type Tab = 'people' | 'gedcom' | 'maintenance' | 'login';

export default function TreeSettingsPage() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<Tab>('login');
  const [sessionRestoring, setSessionRestoring] = useState(true);
  const isAdminUser = user?.role === 'ADMIN';
  const isRootUser = user?.isRoot === true;

  // Try to restore session from localStorage
  useEffect(() => {
    let isMounted = true;
    const saved = localStorage.getItem('origineo_token');
    if (!saved) {
      setSessionRestoring(false);
      return;
    }

    setToken(saved);
    authApi.getProfile(saved).then((res) => {
      if (!isMounted) return;
      const profile = res.data;
      if (profile?.role !== 'ADMIN') {
        window.location.href = '/';
        return;
      }

      setUser(profile);
      setActiveTab('people');
    }).catch(() => {
      if (!isMounted) return;
      localStorage.removeItem('origineo_token');
      setToken(null);
      setUser(null);
      setActiveTab('login');
    }).finally(() => {
      if (isMounted) {
        setSessionRestoring(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogin = async (identifier: string, password: string) => {
    try {
      const result = await authApi.login(identifier, password);
      const accessToken = result.data.accessToken;
      setToken(accessToken);
      setUser(result.data.user);
      localStorage.setItem('origineo_token', accessToken);

      if (result.data.user?.role !== 'ADMIN') {
        window.location.href = '/';
        return;
      }

      setActiveTab('people');
    } catch (err: any) {
      alert(err.message || 'Échec de la connexion');
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
            <h1>🌳 Paramètres de l&apos;arbre</h1>
            {user && (
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>
                Connecté en tant que <strong>{user.displayName || user.email}</strong>
                <span className="badge badge-accent" style={{ marginLeft: 'var(--space-2)' }}>{user.role}</span>
                {isRootUser && <span className="badge badge-amber" style={{ marginLeft: 'var(--space-2)' }}>ROOT</span>}
              </p>
            )}
          </div>
          {user && (
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <a href="/admin" className="btn btn-ghost">Paramètres application</a>
              <button className="btn btn-ghost" onClick={handleLogout} id="logout-button">
                Déconnexion
              </button>
            </div>
          )}
        </div>

        {/* Auth Gate */}
        {sessionRestoring ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-8) 0' }}>
            <div className="glass-card" style={{ textAlign: 'center', minWidth: 280 }}>
              <div className="spinner" style={{ margin: '0 auto var(--space-3)' }} />
              <p style={{ color: 'var(--color-text-secondary)' }}>Chargement de la session admin...</p>
            </div>
          </div>
        ) : !token ? (
          <LoginForm onLogin={handleLogin} />
        ) : !isAdminUser ? (
          <div className="glass-card" style={{ textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
            <h3 style={{ marginBottom: 'var(--space-2)' }}>Acces admin requis</h3>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
              Ce compte n&apos;a pas les droits administrateur pour cette zone.
            </p>
            <a href="/" className="btn btn-secondary">
              Retourner a l&apos;arbre
            </a>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-6)', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-2)' }}>
              {(
                [
                { key: 'people', label: '👥 Données personnes' },
                { key: 'gedcom', label: '📂 GEDCOM' },
                { key: 'maintenance', label: '🛠️ Intégrité & suppression' },
              ] as { key: Tab; label: string }[]
              ).map(({ key, label }) => (
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

            {activeTab === 'people' && <PeoplePanel token={token} />}
            {activeTab === 'gedcom' && <GedcomSectionPanel token={token} />}
            {activeTab === 'maintenance' && <MaintenancePanel token={token} />}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Login Form ─────────────────────────────
function LoginForm({
  onLogin,
}: {
  onLogin: (identifier: string, password: string) => Promise<void>;
}) {
  const [identifier, setIdentifier] = useState('root');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onLogin(identifier, password);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: '0 auto' }}>
      <div className="glass-card animate-fade-in-up">
        <h2 style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>🔐 Connexion</h2>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="input-group">
            <label className="input-label">Identifiant</label>
            <input
              className="input"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="root"
              required
              id="input-identifier"
            />
          </div>

          <div className="input-group">
            <label className="input-label">Mot de passe</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Votre mot de passe" required id="input-password" />
          </div>

          <button className="btn btn-primary" type="submit" disabled={loading} id="submit-auth" style={{ width: '100%' }}>
            {loading ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : 'Se connecter'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          Compte initial par défaut: <strong>root</strong> / <strong>root</strong>
        </p>
      </div>
    </div>
  );
}

function SettingsPanel({ token, isRootUser }: { token: string; isRootUser: boolean }) {
  if (!isRootUser) {
    return (
      <div className="glass-card" style={{ maxWidth: 760 }}>
        <h3 style={{ marginBottom: 'var(--space-2)' }}>🔐 Paramètres d&apos;application</h3>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
          La configuration LDAP/AD est réservée au compte root.
        </p>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
          Demandez au root de modifier les mappings de groupes LDAP.
        </p>
      </div>
    );
  }

  return <AccountsPanel token={token} mode="ldap" />;
}

function AccountsPagePanel({ token, isRootUser }: { token: string; isRootUser: boolean }) {
  if (!isRootUser) {
    return (
      <div className="glass-card" style={{ maxWidth: 760 }}>
        <h3 style={{ marginBottom: 'var(--space-2)' }}>👤 Gestion des comptes</h3>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
          La création et gestion des comptes (activation, désactivation, suppression) est réservée au compte root.
        </p>
      </div>
    );
  }

  return <AccountsPanel token={token} mode="accounts" />;
}

function PeoplePanel({ token }: { token: string }) {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
      <div className="glass-card">
        <h3 style={{ marginBottom: 'var(--space-2)' }}>👥 Gestion des personnes</h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
          Ajout, consultation et suppression des personnes ou branches.
        </p>
      </div>

      <PersonsList token={token} />
      <AddPersonForm token={token} />
    </div>
  );
}

function GedcomSectionPanel({ token }: { token: string }) {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
      <div className="glass-card">
        <h3 style={{ marginBottom: 'var(--space-2)' }}>📂 GEDCOM</h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
          Import simple, fusion avancée, export GEDCOM et export XLSX.
        </p>
      </div>

      <GedcomPanel token={token} />
    </div>
  );
}

function MaintenancePanel({ token }: { token: string }) {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
      <div className="glass-card">
        <h3 style={{ marginBottom: 'var(--space-2)' }}>🛠️ Intégrité et nettoyage</h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
          Réparation de l&apos;arbre, rattachement de composants déconnectés et actions de suppression globale.
        </p>
      </div>

      <TreeRepairPanel token={token} />
      <TreeDangerZone token={token} />
    </div>
  );
}

function TreeDangerZone({ token }: { token: string }) {
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const handleDeleteAll = async () => {
    if (confirmText !== 'SUPPRIMER TOUT') {
      alert('Tapez exactement SUPPRIMER TOUT pour confirmer.');
      return;
    }

    if (!window.confirm('Confirmer la suppression de toutes les personnes de l\'arbre ?')) {
      return;
    }

    setBusy(true);
    setResultMessage(null);

    try {
      const result = await personApi.deleteAll(token);
      const stats = result.data || {};
      setResultMessage(
        `Suppression terminée: ${stats.personsDeleted || 0} personnes, ${stats.relationshipsDeleted || 0} relations, ${stats.unionsDeleted || 0} unions, ${stats.documentsDeleted || 0} documents.`,
      );
      setConfirmText('');
    } catch (err: any) {
      alert(err.message || 'Impossible de supprimer l\'arbre complet.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-card" style={{ borderColor: 'var(--color-rose)' }}>
      <h3 style={{ marginBottom: 'var(--space-2)', color: 'var(--color-rose)' }}>🧨 Zone sensible</h3>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>
        Supprime tout l&apos;arbre: personnes, relations, unions et métadonnées de documents liées.
      </p>

      <div className="input-group" style={{ maxWidth: 360, marginBottom: 'var(--space-3)' }}>
        <label className="input-label">Écrivez SUPPRIMER TOUT pour autoriser l&apos;action</label>
        <input
          className="input"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="SUPPRIMER TOUT"
        />
      </div>

      <button className="btn btn-secondary" onClick={handleDeleteAll} disabled={busy}>
        {busy ? 'Suppression...' : 'Supprimer tout l\'arbre'}
      </button>

      {resultMessage && (
        <p style={{ marginTop: 'var(--space-3)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
          {resultMessage}
        </p>
      )}
    </div>
  );
}

function TreeRepairPanel({ token }: { token: string }) {
  type ComponentOptionState = {
    anchorPersonId: string;
    linkMode: 'PARENT_OF_COMPONENT' | 'CHILD_OF_COMPONENT' | 'UNION';
    relationshipType: 'BIOLOGICAL' | 'ADOPTIVE' | 'FOSTER';
    unionType: 'MARRIAGE' | 'PACS' | 'PARTNERSHIP' | 'OTHER';
  };

  const [report, setReport] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [simulate, setSimulate] = useState(true);
  const [repairingRoot, setRepairingRoot] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [assistantMode, setAssistantMode] = useState(false);
  const [assistantIndex, setAssistantIndex] = useState(0);
  const [undoingLogId, setUndoingLogId] = useState<string | null>(null);
  const [repairLogs, setRepairLogs] = useState<any[]>([]);
  const [qualityRules, setQualityRules] = useState({
    requireParentKnown: false,
    minBiologicalParentAge: 12,
    maxBiologicalParentAge: 80,
    maxLifespanYears: 120,
  });
  const [busyConnectComponentId, setBusyConnectComponentId] = useState<string | null>(null);
  const [busyDeleteComponentId, setBusyDeleteComponentId] = useState<string | null>(null);
  const [componentOptions, setComponentOptions] = useState<Record<string, ComponentOptionState>>({});

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const result = await personApi.getRepairLogs(token, 80);
      setRepairLogs(result.data || []);
    } catch (err: any) {
      setError(err.message || 'Impossible de charger le journal des réparations.');
      setRepairLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, [token]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await personApi.getIntegrityReport(token);
      const payload = result.data || null;
      setReport(payload);
      if (payload?.qualityRules) {
        setQualityRules({
          requireParentKnown: Boolean(payload.qualityRules.requireParentKnown),
          minBiologicalParentAge: Number(payload.qualityRules.minBiologicalParentAge) || 12,
          maxBiologicalParentAge: Number(payload.qualityRules.maxBiologicalParentAge) || 80,
          maxLifespanYears: Number(payload.qualityRules.maxLifespanYears) || 120,
        });
      }

      const defaultAnchorPersonId =
        payload?.root?.personId || payload?.mainComponent?.representativePersonId || '';
      const disconnectedComponents = payload?.disconnectedComponents || [];

      setComponentOptions((previous) => {
        const next: Record<string, ComponentOptionState> = {};

        disconnectedComponents.forEach((component: any) => {
          const bestSuggestion = Array.isArray(component.anchorSuggestions)
            ? component.anchorSuggestions[0]
            : null;

          next[component.id] = previous[component.id] || {
            anchorPersonId: bestSuggestion?.anchorPersonId || defaultAnchorPersonId,
            linkMode: 'PARENT_OF_COMPONENT',
            relationshipType: 'FOSTER',
            unionType: 'OTHER',
          };

          if (!next[component.id].anchorPersonId) {
            next[component.id].anchorPersonId =
              bestSuggestion?.anchorPersonId || defaultAnchorPersonId;
          }
        });

        return next;
      });
    } catch (err: any) {
      setError(err.message || 'Impossible de charger le diagnostic de l\'arbre.');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void Promise.all([loadReport(), loadLogs()]);
  }, [loadReport, loadLogs]);

  const disconnectedComponents = report?.disconnectedComponents || [];

  useEffect(() => {
    if (disconnectedComponents.length === 0) {
      setAssistantIndex(0);
      return;
    }

    if (assistantIndex >= disconnectedComponents.length) {
      setAssistantIndex(disconnectedComponents.length - 1);
    }
  }, [assistantIndex, disconnectedComponents.length]);

  const refreshAll = async () => {
    await Promise.all([loadReport(), loadLogs()]);
  };

  const updateComponentOption = (
    componentId: string,
    patch: Partial<{
      anchorPersonId: string;
      linkMode: 'PARENT_OF_COMPONENT' | 'CHILD_OF_COMPONENT' | 'UNION';
      relationshipType: 'BIOLOGICAL' | 'ADOPTIVE' | 'FOSTER';
      unionType: 'MARRIAGE' | 'PACS' | 'PARTNERSHIP' | 'OTHER';
    }>,
  ) => {
    setComponentOptions((previous) => ({
      ...previous,
      [componentId]: {
        anchorPersonId: previous[componentId]?.anchorPersonId || '',
        linkMode: previous[componentId]?.linkMode || 'PARENT_OF_COMPONENT',
        relationshipType: previous[componentId]?.relationshipType || 'FOSTER',
        unionType: previous[componentId]?.unionType || 'OTHER',
        ...patch,
      },
    }));
  };

  const handleRepairRoot = async () => {
    setRepairingRoot(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await personApi.repairRootDefaultWithOptions(token, simulate);
      const payload = result.data || {};

      if (payload.changed) {
        setSuccess(simulate
          ? `Simulation: la racine serait déplacée vers ${payload.label || payload.personId || 'personne inconnue'}.`
          : `Racine corrigée: ${payload.label || payload.personId || 'personne inconnue'}`);
      } else {
        setSuccess(simulate
          ? 'Simulation: aucune correction de racine nécessaire.'
          : 'Racine déjà cohérente avec le composant principal.');
      }

      if (!simulate) {
        await refreshAll();
      }
    } catch (err: any) {
      setError(err.message || 'Impossible de corriger la racine.');
    } finally {
      setRepairingRoot(false);
    }
  };

  const handleConnectComponent = async (component: any) => {
    const options = componentOptions[component.id];

    setBusyConnectComponentId(component.id);
    setError(null);
    setSuccess(null);

    try {
      await personApi.connectDisconnectedComponent(
        {
          componentPersonId: component.representativePersonId,
          anchorPersonId: options?.anchorPersonId || undefined,
          linkMode: options?.linkMode || 'PARENT_OF_COMPONENT',
          relationshipType: options?.relationshipType || 'FOSTER',
          unionType: options?.unionType || 'OTHER',
          simulate,
        },
        token,
      );

      setSuccess(simulate
        ? `Simulation: le composant ${component.id} serait rattaché au composant principal.`
        : `Composant ${component.id} rattaché avec succès.`);
      if (!simulate) {
        await refreshAll();
      }
    } catch (err: any) {
      setError(err.message || 'Impossible de rattacher ce composant.');
    } finally {
      setBusyConnectComponentId(null);
    }
  };

  const handleDeleteComponent = async (component: any) => {
    if (
      !window.confirm(
        `Supprimer le composant ${component.id} (${component.size} personne(s)) ?`,
      )
    ) {
      return;
    }

    setBusyDeleteComponentId(component.id);
    setError(null);
    setSuccess(null);

    try {
      const result = await personApi.deleteDisconnectedComponent(
        component.representativePersonId,
        token,
        simulate,
      );
      const stats = result.data || {};

      setSuccess(
        `${simulate ? 'Simulation suppression' : 'Composant supprimé'}: ${stats.personsDeleted || 0} personnes, ${stats.relationshipsDeleted || 0} relations, ${stats.unionsDeleted || 0} unions.`,
      );

      if (!simulate) {
        await refreshAll();
      }
    } catch (err: any) {
      setError(err.message || 'Impossible de supprimer ce composant.');
    } finally {
      setBusyDeleteComponentId(null);
    }
  };

  const handleSaveRules = async () => {
    setSavingRules(true);
    setError(null);
    setSuccess(null);

    try {
      await personApi.updateQualityRules(
        {
          requireParentKnown: qualityRules.requireParentKnown,
          minBiologicalParentAge: Number(qualityRules.minBiologicalParentAge),
          maxBiologicalParentAge: Number(qualityRules.maxBiologicalParentAge),
          maxLifespanYears: Number(qualityRules.maxLifespanYears),
        },
        token,
      );
      setSuccess('Règles qualité mises à jour.');
      await refreshAll();
    } catch (err: any) {
      setError(err.message || 'Impossible de sauvegarder les règles qualité.');
    } finally {
      setSavingRules(false);
    }
  };

  const handleUndoRepair = async (log: any) => {
    if (!window.confirm(`Annuler l'action: ${log.summary} ?`)) {
      return;
    }

    setUndoingLogId(log.id);
    setError(null);
    setSuccess(null);

    try {
      const result = await personApi.undoRepairLog(log.id, token, simulate);
      const payload = result.data || {};

      if (payload.simulated) {
        setSuccess(`Simulation: l'action "${log.summary}" est annulable.`);
      } else {
        setSuccess(`Action annulée: ${log.summary}`);
        await refreshAll();
      }
    } catch (err: any) {
      setError(err.message || 'Impossible d\'annuler cette réparation.');
    } finally {
      setUndoingLogId(null);
    }
  };

  const anchorOptions = report?.mainComponent?.samplePeople || [];
  const assistantComponent = disconnectedComponents[assistantIndex] || null;
  const componentsToRender = assistantMode && assistantComponent
    ? [assistantComponent]
    : disconnectedComponents;

  const healthGraphNodes = report?.healthGraph?.nodes || [];
  const healthGraphEdges = report?.healthGraph?.edges || [];
  const mainNode = healthGraphNodes.find((node: any) => node.isMain);

  return (
    <div className="glass-card" style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ marginBottom: 'var(--space-2)' }}>🩺 Réparer l&apos;arbre</h3>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            Détecte les personnes isolées et les branches non connectées après import GEDCOM, puis propose une réparation guidée avec score de confiance.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            <input
              type="checkbox"
              checked={simulate}
              onChange={(e) => setSimulate(e.target.checked)}
            />
            Mode simulation
          </label>
          <button className="btn btn-ghost" onClick={loadReport} disabled={loading}>
            {loading ? 'Analyse...' : 'Analyser'}
          </button>
          <button className="btn btn-secondary" onClick={handleRepairRoot} disabled={repairingRoot || loading}>
            {repairingRoot ? 'Correction...' : simulate ? 'Simuler racine' : 'Corriger racine'}
          </button>
          <button className={`btn ${assistantMode ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAssistantMode((prev) => !prev)} disabled={disconnectedComponents.length === 0}>
            {assistantMode ? 'Assistant actif' : 'Assistant guidé'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-rose)', color: 'var(--color-rose)', background: 'var(--color-rose-subtle)' }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-emerald)', color: 'var(--color-emerald)', background: 'var(--color-emerald-subtle)' }}>
          {success}
        </div>
      )}

      {!loading && report && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 'var(--space-2)' }}>
            <StatCard icon="👥" label="Personnes" value={report.totalPersons || 0} />
            <StatCard icon="🧩" label="Composants" value={report.connectedComponents || 0} color="var(--color-amber)" />
            <StatCard icon="🔌" label="Déconnectés" value={disconnectedComponents.length} color="var(--color-rose)" />
            <StatCard icon="🧍" label="Isolées" value={report.isolatedPersons || 0} color="var(--color-amber)" />
          </div>

          {assistantMode && disconnectedComponents.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', background: 'var(--color-bg-primary)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-3)' }}>
              <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                Étape {assistantIndex + 1}/{disconnectedComponents.length}: traiter {assistantComponent?.id}
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => setAssistantIndex((prev) => Math.max(0, prev - 1))}
                  disabled={assistantIndex === 0}
                >
                  Précédent
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => setAssistantIndex((prev) => Math.min(disconnectedComponents.length - 1, prev + 1))}
                  disabled={assistantIndex >= disconnectedComponents.length - 1}
                >
                  Suivant
                </button>
              </div>
            </div>
          )}

          {Array.isArray(report.suggestions) && report.suggestions.length > 0 && (
            <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-primary)' }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
                Suggestions automatiques
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', display: 'grid', gap: 'var(--space-1)' }}>
                {report.suggestions.map((item: string) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-primary)', display: 'grid', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                ⚙️ Règles qualité configurables
              </div>
              <button className="btn btn-secondary" onClick={handleSaveRules} disabled={savingRules}>
                {savingRules ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-2)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={qualityRules.requireParentKnown}
                  onChange={(e) => setQualityRules((prev) => ({ ...prev, requireParentKnown: e.target.checked }))}
                />
                Parent requis pour chaque personne
              </label>

              <div className="input-group">
                <label className="input-label">Âge parent minimum</label>
                <input
                  className="input"
                  type="number"
                  min={10}
                  max={35}
                  value={qualityRules.minBiologicalParentAge}
                  onChange={(e) => setQualityRules((prev) => ({ ...prev, minBiologicalParentAge: Number(e.target.value) || 10 }))}
                />
              </div>

              <div className="input-group">
                <label className="input-label">Âge parent maximum</label>
                <input
                  className="input"
                  type="number"
                  min={40}
                  max={120}
                  value={qualityRules.maxBiologicalParentAge}
                  onChange={(e) => setQualityRules((prev) => ({ ...prev, maxBiologicalParentAge: Number(e.target.value) || 40 }))}
                />
              </div>

              <div className="input-group">
                <label className="input-label">Longévité max</label>
                <input
                  className="input"
                  type="number"
                  min={60}
                  max={140}
                  value={qualityRules.maxLifespanYears}
                  onChange={(e) => setQualityRules((prev) => ({ ...prev, maxLifespanYears: Number(e.target.value) || 60 }))}
                />
              </div>
            </div>
          </div>

          <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-primary)' }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
              🕸️ Vue graphe des composants
            </div>

            <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
              {mainNode && (
                <div style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-emerald)', background: 'var(--color-emerald-subtle)' }}>
                  <strong>Composant principal:</strong> {mainNode.label} ({mainNode.size} personne(s))
                </div>
              )}

              {healthGraphNodes.filter((node: any) => !node.isMain).map((node: any) => {
                const edge = healthGraphEdges.find((candidate: any) => candidate.from === node.id);
                return (
                  <div key={node.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2)' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{node.id}</div>
                      <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>
                        {node.label} · {node.size} personne(s){node.isolated ? ' · isolée' : ''}
                      </div>
                    </div>
                    {edge ? (
                      <span className="badge badge-amber">
                        Confiance rattachement {edge.confidence}%
                      </span>
                    ) : (
                      <span className="badge badge-rose">Sans suggestion</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {(report.anomalies?.length > 0 || report.qualityViolations?.length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--space-3)' }}>
              <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-primary)' }}>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
                  ⏱️ Incohérences temporelles ({report.anomalies?.length || 0})
                </div>
                <div style={{ display: 'grid', gap: 'var(--space-2)', maxHeight: 220, overflow: 'auto' }}>
                  {(report.anomalies || []).slice(0, 30).map((anomaly: any) => (
                    <div key={anomaly.id} style={{ border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2)', background: 'var(--color-bg-elevated)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{anomaly.code}</span>
                        <span className={`badge ${anomaly.severity === 'HIGH' ? 'badge-rose' : anomaly.severity === 'MEDIUM' ? 'badge-amber' : 'badge-accent'}`}>
                          {anomaly.severity}
                        </span>
                      </div>
                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)' }}>
                        {anomaly.message}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-primary)' }}>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
                  ✅ Violations règles qualité ({report.qualityViolations?.length || 0})
                </div>
                <div style={{ display: 'grid', gap: 'var(--space-2)', maxHeight: 220, overflow: 'auto' }}>
                  {(report.qualityViolations || []).slice(0, 30).map((violation: any) => (
                    <div key={violation.id} style={{ border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2)', background: 'var(--color-bg-elevated)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{violation.code}</span>
                        <span className={`badge ${violation.severity === 'HIGH' ? 'badge-rose' : violation.severity === 'MEDIUM' ? 'badge-amber' : 'badge-accent'}`}>
                          {violation.severity}
                        </span>
                      </div>
                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)' }}>
                        {violation.message}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-primary)' }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
              Composant principal
            </div>
            {report.mainComponent ? (
              <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                {report.mainComponent.size} personne(s), référent: <strong>{report.mainComponent.representativeLabel}</strong>
                {report.root?.personId && (
                  <>
                    {' '}· Racine actuelle: <strong>{report.root.label || report.root.personId}</strong>
                    {' '}({report.root.inMainComponent ? 'dans le principal' : 'hors principal'})
                  </>
                )}
              </div>
            ) : (
              <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                Aucun composant principal détecté.
              </div>
            )}
          </div>

          <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                🧾 Journal des réparations
              </div>
              <button className="btn btn-ghost" onClick={loadLogs} disabled={logsLoading}>
                {logsLoading ? 'Chargement...' : 'Actualiser'}
              </button>
            </div>

            {logsLoading ? (
              <div className="spinner" />
            ) : repairLogs.length === 0 ? (
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                Aucun journal disponible.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 'var(--space-2)', maxHeight: 260, overflow: 'auto' }}>
                {repairLogs.map((log) => (
                  <div key={log.id} style={{ border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2)', background: 'var(--color-bg-elevated)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{log.summary}</div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                          {new Date(log.createdAt).toLocaleString('fr-FR')} · {log.createdBy} · {log.action}
                        </div>
                      </div>

                      {log.undoAvailable && !log.undoneAt ? (
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: 'var(--text-xs)', padding: 'var(--space-1) var(--space-2)' }}
                          onClick={() => handleUndoRepair(log)}
                          disabled={undoingLogId === log.id}
                        >
                          {undoingLogId === log.id ? 'Annulation...' : simulate ? 'Simuler annulation' : 'Annuler'}
                        </button>
                      ) : (
                        <span className={`badge ${log.undoneAt ? 'badge-accent' : 'badge-amber'}`}>
                          {log.undoneAt ? 'Annulé' : 'Non annulable'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {disconnectedComponents.length === 0 ? (
            <div style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-emerald)', background: 'var(--color-emerald-subtle)', color: 'var(--color-emerald)' }}>
              ✅ Aucun composant déconnecté: toutes les personnes sont reliées au même arbre.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
              {componentsToRender.map((component: any) => {
                const options = componentOptions[component.id] || {
                  anchorPersonId:
                    report?.root?.personId ||
                    report?.mainComponent?.representativePersonId ||
                    '',
                  linkMode: 'PARENT_OF_COMPONENT',
                  relationshipType: 'FOSTER',
                  unionType: 'OTHER',
                };

                const connectBusy = busyConnectComponentId === component.id;
                const deleteBusy = busyDeleteComponentId === component.id;

                return (
                  <div
                    key={component.id}
                    style={{
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: 'var(--radius-lg)',
                      background: 'var(--color-bg-primary)',
                      padding: 'var(--space-3)',
                      display: 'grid',
                      gap: 'var(--space-3)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>
                          {component.id} · {component.size} personne(s)
                        </div>
                        <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>
                          Référent: {component.representativeLabel}
                          {component.isolated ? ' · isolée' : ''}
                        </div>
                      </div>
                      <span className={`badge ${component.isolated ? 'badge-amber' : 'badge-rose'}`}>
                        {component.isolated ? 'Isolée' : 'Déconnectée'}
                      </span>
                    </div>

                    {Array.isArray(component.samplePeople) && component.samplePeople.length > 0 && (
                      <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>
                        Exemples: {component.samplePeople.map((person: any) => person.label).join(' · ')}
                      </div>
                    )}

                    {Array.isArray(component.anchorSuggestions) && component.anchorSuggestions.length > 0 && (
                      <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
                        <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>
                          Suggestions de rattachement
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                          {component.anchorSuggestions.slice(0, 4).map((suggestion: any) => (
                            <button
                              key={`${component.id}-${suggestion.anchorPersonId}`}
                              className={`btn ${options.anchorPersonId === suggestion.anchorPersonId ? 'btn-primary' : 'btn-ghost'}`}
                              style={{ fontSize: 'var(--text-xs)', padding: 'var(--space-1) var(--space-2)' }}
                              onClick={() => updateComponentOption(component.id, { anchorPersonId: suggestion.anchorPersonId })}
                            >
                              {suggestion.anchorLabel} ({suggestion.confidence}%)
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: 'var(--space-2)' }}>
                      <div className="input-group">
                        <label className="input-label">Ancrer sur</label>
                        <select
                          className="input"
                          value={options.anchorPersonId}
                          onChange={(e) => updateComponentOption(component.id, { anchorPersonId: e.target.value })}
                        >
                          <option value="">Auto (racine / référent principal)</option>
                          {anchorOptions.map((anchor: any) => (
                            <option key={anchor.id} value={anchor.id}>
                              {anchor.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="input-group">
                        <label className="input-label">Mode lien</label>
                        <select
                          className="input"
                          value={options.linkMode}
                          onChange={(e) =>
                            updateComponentOption(component.id, {
                              linkMode: e.target.value as
                                | 'PARENT_OF_COMPONENT'
                                | 'CHILD_OF_COMPONENT'
                                | 'UNION',
                            })
                          }
                        >
                          <option value="PARENT_OF_COMPONENT">Ancrage → composant (parent)</option>
                          <option value="CHILD_OF_COMPONENT">Composant → ancrage (parent)</option>
                          <option value="UNION">Union entre les deux</option>
                        </select>
                      </div>

                      <div className="input-group">
                        <label className="input-label">Type filiation</label>
                        <select
                          className="input"
                          value={options.relationshipType}
                          onChange={(e) =>
                            updateComponentOption(component.id, {
                              relationshipType: e.target.value as
                                | 'BIOLOGICAL'
                                | 'ADOPTIVE'
                                | 'FOSTER',
                            })
                          }
                          disabled={options.linkMode === 'UNION'}
                        >
                          <option value="FOSTER">Accueil (technique)</option>
                          <option value="BIOLOGICAL">Biologique</option>
                          <option value="ADOPTIVE">Adoptive</option>
                        </select>
                      </div>

                      <div className="input-group">
                        <label className="input-label">Type union</label>
                        <select
                          className="input"
                          value={options.unionType}
                          onChange={(e) =>
                            updateComponentOption(component.id, {
                              unionType: e.target.value as
                                | 'MARRIAGE'
                                | 'PACS'
                                | 'PARTNERSHIP'
                                | 'OTHER',
                            })
                          }
                          disabled={options.linkMode !== 'UNION'}
                        >
                          <option value="OTHER">Autre</option>
                          <option value="MARRIAGE">Mariage</option>
                          <option value="PACS">PACS</option>
                          <option value="PARTNERSHIP">Partenariat</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleConnectComponent(component)}
                        disabled={connectBusy || deleteBusy}
                      >
                        {connectBusy ? 'Rattachement...' : simulate ? 'Simuler rattachement' : 'Rattacher au principal'}
                      </button>
                      <button
                        className="btn btn-ghost"
                        onClick={() => handleDeleteComponent(component)}
                        disabled={connectBusy || deleteBusy}
                      >
                        {deleteBusy ? 'Suppression...' : simulate ? 'Simuler suppression' : 'Supprimer composant'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Persons List ───────────────────────────
function PersonsList({ token }: { token: string }) {
  const [persons, setPersons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [busyPersonId, setBusyPersonId] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const loadPersons = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await personApi.getAll(page, limit);
      const payload = result.data || {};
      const rows = payload.data || [];

      setPersons(rows);
      setTotal(payload.total || 0);
      setTotalPages(Math.max(1, payload.totalPages || 1));
    } catch (err: any) {
      setError(err.message || 'Impossible de charger la liste des personnes.');
      setPersons([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [page, limit]);

  useEffect(() => {
    loadPersons();
  }, [loadPersons, refreshTick]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const personName = (person: any) => {
    const surname = person.usageSurname || person.birthSurname || '';
    return `${person.givenNames}${surname ? ` ${surname}` : ''}`.trim();
  };

  const refresh = () => {
    setRefreshTick((value) => value + 1);
  };

  const handleDeletePerson = async (person: any) => {
    const label = personName(person) || person.id;
    if (!window.confirm(`Supprimer la personne "${label}" ?`)) {
      return;
    }

    setBusyPersonId(person.id);
    try {
      await personApi.delete(person.id, token);
      refresh();
    } catch (err: any) {
      alert(err.message || 'Suppression impossible.');
    } finally {
      setBusyPersonId(null);
    }
  };

  const handleDeleteBranch = async (person: any) => {
    const label = personName(person) || person.id;
    if (!window.confirm(`Supprimer la branche de "${label}" (la personne et ses descendants) ?`)) {
      return;
    }

    setBusyPersonId(person.id);
    try {
      await personApi.deleteBranch(person.id, token, true);
      refresh();
    } catch (err: any) {
      alert(err.message || 'Suppression de branche impossible.');
    } finally {
      setBusyPersonId(null);
    }
  };

  return (
    <div className="glass-card" style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <h3>👥 Personnes</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <label className="input-label" style={{ margin: 0 }}>Lignes</label>
          <select
            className="input"
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1);
            }}
            style={{ width: 90, padding: 'var(--space-2)' }}
          >
            {[25, 50, 100, 200].map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
          <button className="btn btn-ghost" onClick={refresh}>Recharger</button>
        </div>
      </div>

      <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
        Total: {total} personne{total > 1 ? 's' : ''} · Page {page}/{Math.max(1, totalPages)}
      </p>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: 54, borderRadius: 'var(--radius-lg)' }} />
          ))}
        </div>
      )}

      {!loading && error && (
        <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-rose)', color: 'var(--color-rose)', background: 'var(--color-rose-subtle)' }}>
          {error}
        </div>
      )}

      {!loading && !error && persons.length === 0 && (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-secondary)' }}>
          Aucune personne trouvée pour cette page.
        </div>
      )}

      {!loading && !error && persons.length > 0 && (
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          {persons.map((person: any) => {
            const label = personName(person);
            const isBusy = busyPersonId === person.id;

            return (
              <div
                key={person.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 'var(--space-2)',
                  alignItems: 'center',
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'var(--color-bg-secondary)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--color-border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
                  <span>{person.gender === 'MALE' ? '♂' : person.gender === 'FEMALE' ? '♀' : '◯'}</span>
                  <a href={`/person/${person.id}`} style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{label}</a>
                  {person.isRootDefault && <span className="badge badge-accent">Racine</span>}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    {person.id.slice(0, 8)}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost" style={{ fontSize: 'var(--text-xs)', padding: 'var(--space-1) var(--space-3)' }} disabled={isBusy} onClick={() => handleDeleteBranch(person)}>
                    Supprimer branche
                  </button>
                  <button className="btn btn-ghost" style={{ fontSize: 'var(--text-xs)', padding: 'var(--space-1) var(--space-3)' }} disabled={isBusy} onClick={() => handleDeletePerson(person)}>
                    Supprimer personne
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)' }}>
        <button className="btn btn-ghost" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>
          ← Précédent
        </button>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          Page {page} / {Math.max(1, totalPages)}
        </span>
        <button className="btn btn-ghost" disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>
          Suivant →
        </button>
      </div>
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
  const [exporting, setExporting] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);
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
        const topCandidate = Array.isArray(dup.candidates) && dup.candidates.length > 0
          ? dup.candidates[0]
          : null;
        defaults[dup.stagedPointer] = {
          action: dup.confidence >= 70 ? 'merge' : 'create',
          mergeIntoPersonId: topCandidate?.existingPersonId || dup.existingPersonId,
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
        mergeIntoPersonId: dec.action === 'merge' ? dec.mergeIntoPersonId : undefined,
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
    setMergeDecisions((prev) => {
      const previousChoice = prev[pointer];
      return {
        ...prev,
        [pointer]: {
          action,
          mergeIntoPersonId:
            action === 'merge'
              ? mergeIntoPersonId || previousChoice?.mergeIntoPersonId
              : undefined,
        },
      };
    });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { blob, filename } = await gedcomApi.exportFile(token);
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (err: any) {
      alert(err.message || 'Erreur lors de l\'export GEDCOM');
    } finally {
      setExporting(false);
    }
  };

  const fetchPaginatedRows = async (
    fetchPage: (page: number, limit: number) => Promise<any>,
    limit = 500,
  ) => {
    const rows: any[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const response = await fetchPage(page, limit);
      const payload = response.data || {};
      const pageRows = Array.isArray(payload.data) ? payload.data : [];
      rows.push(...pageRows);

      if (typeof payload.totalPages === 'number' && Number.isFinite(payload.totalPages)) {
        totalPages = Math.max(1, payload.totalPages);
      } else if (pageRows.length < limit) {
        break;
      } else {
        totalPages = page + 1;
      }

      page += 1;
    }

    return rows;
  };

  const handleExportXlsx = async () => {
    setExportingXlsx(true);
    try {
      const [persons, unions, relationships, integrityResponse] = await Promise.all([
        fetchPaginatedRows((page, limit) => personApi.getAll(page, limit)),
        fetchPaginatedRows((page, limit) => unionApi.getAll(page, limit)),
        fetchPaginatedRows((page, limit) => relationshipApi.getAll(page, limit)),
        personApi.getIntegrityReport(token),
      ]);

      const integrity = integrityResponse.data || {};

      const personRows = persons.map((person: any) => ({
        id: person.id,
        givenNames: person.givenNames,
        usageSurname: person.usageSurname || '',
        birthSurname: person.birthSurname || '',
        gender: person.gender,
        birthDate: person.birthDate ? new Date(person.birthDate).toISOString().slice(0, 10) : '',
        deathDate: person.deathDate ? new Date(person.deathDate).toISOString().slice(0, 10) : '',
        birthPlace: person.birthPlace || '',
        deathPlace: person.deathPlace || '',
        professions: Array.isArray(person.professions) ? person.professions.join(', ') : '',
        isRootDefault: Boolean(person.isRootDefault),
      }));

      const unionRows = unions.map((union: any) => ({
        id: union.id,
        partner1Id: union.partner1Id,
        partner2Id: union.partner2Id,
        type: union.type,
        startDate: union.startDate ? new Date(union.startDate).toISOString().slice(0, 10) : '',
        endDate: union.endDate ? new Date(union.endDate).toISOString().slice(0, 10) : '',
        startPlace: union.startPlace || '',
        endReason: union.endReason || '',
      }));

      const relationshipRows = relationships.map((relationship: any) => ({
        id: relationship.id,
        parentId: relationship.parentId,
        childId: relationship.childId,
        type: relationship.type,
        parentLabel: relationship.parent
          ? `${relationship.parent.givenNames} ${relationship.parent.usageSurname || relationship.parent.birthSurname || ''}`.trim()
          : '',
        childLabel: relationship.child
          ? `${relationship.child.givenNames} ${relationship.child.usageSurname || relationship.child.birthSurname || ''}`.trim()
          : '',
      }));

      const anomalyRows = (integrity.anomalies || []).map((anomaly: any) => ({
        id: anomaly.id,
        code: anomaly.code,
        severity: anomaly.severity,
        message: anomaly.message,
        personIds: Array.isArray(anomaly.personIds) ? anomaly.personIds.join(', ') : '',
        relationshipId: anomaly.relationshipId || '',
        unionId: anomaly.unionId || '',
      }));

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(personRows), 'persons');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(unionRows), 'unions');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(relationshipRows), 'relationships');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(anomalyRows), 'anomalies');

      const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
      XLSX.writeFile(workbook, `origineo-export-${stamp}.xlsx`);
    } catch (err: any) {
      alert(err.message || 'Erreur lors de l\'export XLSX');
    } finally {
      setExportingXlsx(false);
    }
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

              {importResult.integrityAlert && (
                <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-amber)', background: 'var(--color-amber-subtle)', color: 'var(--color-amber)' }}>
                  <p style={{ fontWeight: 700, marginBottom: 'var(--space-1)' }}>⚠️ Alerte intégrité</p>
                  <p style={{ marginBottom: 'var(--space-1)' }}>{importResult.integrityAlert.message}</p>
                  <p style={{ fontSize: 'var(--text-xs)' }}>
                    Avant: {importResult.integrityAlert.before.connectedComponents} composants ({importResult.integrityAlert.before.disconnectedComponents} déconnectés)
                    {' '}→ Après: {importResult.integrityAlert.after.connectedComponents} composants ({importResult.integrityAlert.after.disconnectedComponents} déconnectés)
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Export */}
        <div className="glass-card">
          <h3 style={{ marginBottom: 'var(--space-4)' }}>📤 Exporter</h3>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>
            Téléchargez votre arbre en GEDCOM ou exportez un classeur XLSX avec personnes, unions, relations et anomalies.
          </p>
          <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
            <button
              className="btn btn-secondary"
              style={{ width: '100%', display: 'flex', justifyContent: 'center' }}
              id="export-gedcom-button"
              onClick={handleExport}
              disabled={exporting || exportingXlsx}
            >
              {exporting ? (
                <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Export GEDCOM...</>
              ) : (
                '📥 Télécharger l\'arbre complet (.ged)'
              )}
            </button>

            <button
              className="btn btn-primary"
              style={{ width: '100%', display: 'flex', justifyContent: 'center' }}
              id="export-xlsx-button"
              onClick={handleExportXlsx}
              disabled={exporting || exportingXlsx}
            >
              {exportingXlsx ? (
                <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Export XLSX...</>
              ) : (
                '📊 Export XLSX (4 feuilles)'
              )}
            </button>
          </div>
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
                    const candidates = Array.isArray(dup.candidates) && dup.candidates.length > 0
                      ? dup.candidates
                      : [
                          {
                            existingPersonId: dup.existingPersonId,
                            confidence: dup.confidence,
                            matchReasons: dup.matchReasons || [],
                            existingPerson: dup.existingPerson,
                          },
                        ];
                    const selectedCandidate =
                      candidates.find((candidate: any) => candidate.existingPersonId === decision?.mergeIntoPersonId) ||
                      candidates[0];

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
                            <div className={`badge ${selectedCandidate.confidence >= 70 ? 'badge-emerald' : selectedCandidate.confidence >= 50 ? 'badge-amber' : 'badge-rose'}`} style={{ fontSize: 'var(--text-base)', padding: 'var(--space-2) var(--space-4)' }}>
                              {selectedCandidate.confidence}%
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
                              {selectedCandidate.existingPerson.givenNames} {selectedCandidate.existingPerson.usageSurname || selectedCandidate.existingPerson.birthSurname || ''}
                            </div>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                              {selectedCandidate.existingPerson.gender}
                              {selectedCandidate.existingPerson.birthDate && ` · Né: ${new Date(selectedCandidate.existingPerson.birthDate).toLocaleDateString('fr-FR')}`}
                              {selectedCandidate.existingPerson.birthPlace && ` · ${selectedCandidate.existingPerson.birthPlace}`}
                            </div>
                          </div>
                        </div>

                        {/* Match reasons */}
                        <div style={{ marginTop: 'var(--space-2)', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                          {selectedCandidate.matchReasons?.map((reason: string, i: number) => (
                            <span key={i} style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', background: 'var(--color-bg-tertiary)', padding: '2px 8px', borderRadius: 'var(--radius-sm)' }}>
                              {reason}
                            </span>
                          ))}
                        </div>

                        {candidates.length > 1 && (
                          <div style={{ marginTop: 'var(--space-3)' }}>
                            <label className="input-label">Candidat cible pour fusion</label>
                            <select
                              className="input"
                              value={decision?.mergeIntoPersonId || selectedCandidate.existingPersonId}
                              onChange={(e) => setDecision(dup.stagedPointer, decision?.action || 'merge', e.target.value)}
                            >
                              {candidates.map((candidate: any) => (
                                <option key={candidate.existingPersonId} value={candidate.existingPersonId}>
                                  {candidate.existingPerson.givenNames} {candidate.existingPerson.usageSurname || candidate.existingPerson.birthSurname || ''} · {candidate.confidence}%
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Decision buttons */}
                        <div style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-2)' }}>
                          <button
                            className={`btn ${decision?.action === 'merge' ? 'btn-primary' : 'btn-ghost'}`}
                            style={{ fontSize: 'var(--text-xs)', padding: 'var(--space-1) var(--space-3)' }}
                            onClick={() => setDecision(dup.stagedPointer, 'merge', decision?.mergeIntoPersonId || selectedCandidate.existingPersonId)}
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

              {mergeResult.integrityAlert && (
                <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-amber)', background: 'var(--color-amber-subtle)', color: 'var(--color-amber)' }}>
                  <p style={{ fontWeight: 700, marginBottom: 'var(--space-1)' }}>⚠️ Alerte intégrité</p>
                  <p>{mergeResult.integrityAlert.message}</p>
                </div>
              )}
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

// ─── Accounts & LDAP Panel (Root) ──────────
function AccountsPanel({
  token,
  mode = 'all',
}: {
  token: string;
  mode?: 'accounts' | 'ldap' | 'all';
}) {
  const [users, setUsers] = useState<any[]>([]);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, 'ADMIN' | 'VISITOR'>>({});
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [savingUser, setSavingUser] = useState(false);
  const [loadingLdap, setLoadingLdap] = useState(true);
  const [savingLdap, setSavingLdap] = useState(false);
  const [processingAccountId, setProcessingAccountId] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newUserForm, setNewUserForm] = useState({
    identifier: '',
    password: '',
    displayName: '',
    role: 'VISITOR' as 'ADMIN' | 'VISITOR',
  });

  const [ldapForm, setLdapForm] = useState({
    enabled: false,
    url: '',
    bindDn: '',
    bindPassword: '',
    userSearchBase: '',
    userSearchFilter: '(|(sAMAccountName={{username}})(mail={{username}})(uid={{username}}))',
    groupAttribute: 'memberOf',
    adminGroupDns: '',
    userGroupDns: '',
    hasBindPassword: false,
  });

  const clearMessages = () => {
    setSuccess(null);
    setError(null);
  };

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const result = await authApi.listUsers(token);
      const fetchedUsers = result.data || [];
      setUsers(fetchedUsers);

      const drafts: Record<string, 'ADMIN' | 'VISITOR'> = {};
      fetchedUsers.forEach((user: any) => {
        drafts[user.id] = user.role;
      });
      setRoleDrafts(drafts);
    } catch (err: any) {
      setError(err.message || 'Impossible de charger les comptes.');
    } finally {
      setLoadingUsers(false);
    }
  }, [token]);

  const loadLdap = useCallback(async () => {
    setLoadingLdap(true);
    try {
      const result = await authApi.getLdapConfig(token);
      const config = result.data || {};

      setLdapForm({
        enabled: Boolean(config.enabled),
        url: config.url || '',
        bindDn: config.bindDn || '',
        bindPassword: '',
        userSearchBase: config.userSearchBase || '',
        userSearchFilter: config.userSearchFilter || '(|(sAMAccountName={{username}})(mail={{username}})(uid={{username}}))',
        groupAttribute: config.groupAttribute || 'memberOf',
        adminGroupDns: (config.adminGroupDns || []).join(', '),
        userGroupDns: (config.userGroupDns || []).join(', '),
        hasBindPassword: Boolean(config.hasBindPassword),
      });
    } catch (err: any) {
      setError(err.message || 'Impossible de charger la configuration LDAP.');
    } finally {
      setLoadingLdap(false);
    }
  }, [token]);

  useEffect(() => {
    if (mode !== 'ldap') {
      void loadUsers();
    }

    if (mode !== 'accounts') {
      void loadLdap();
    }
  }, [mode, loadUsers, loadLdap]);

  const parseDnList = (value: string) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setSavingUser(true);

    try {
      await authApi.createUser(
        {
          identifier: newUserForm.identifier,
          password: newUserForm.password,
          displayName: newUserForm.displayName || undefined,
          role: newUserForm.role,
        },
        token,
      );

      setSuccess(`Compte ${newUserForm.identifier} créé avec succès.`);
      setNewUserForm({
        identifier: '',
        password: '',
        displayName: '',
        role: 'VISITOR',
      });
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Impossible de créer le compte.');
    } finally {
      setSavingUser(false);
    }
  };

  const handleApplyRole = async (userId: string) => {
    clearMessages();
    setSavingUser(true);

    try {
      const nextRole = roleDrafts[userId];
      await authApi.updateUserRole(userId, nextRole, token);
      setSuccess('Rôle utilisateur mis à jour.');
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Impossible de mettre à jour le rôle.');
    } finally {
      setSavingUser(false);
    }
  };

  const handleToggleAccountStatus = async (account: any) => {
    const nextActive = account.isActive === false;
    const actionLabel = nextActive ? 'réactiver' : 'désactiver';

    if (!window.confirm(`Confirmer: ${actionLabel} le compte ${account.identifier} ?`)) {
      return;
    }

    clearMessages();
    setSavingUser(true);
    setProcessingAccountId(account.id);

    try {
      await authApi.updateUserStatus(account.id, nextActive, token);
      setSuccess(
        nextActive
          ? `Compte ${account.identifier} réactivé.`
          : `Compte ${account.identifier} désactivé.`,
      );
      await loadUsers();
    } catch (err: any) {
      setError(err.message || `Impossible de ${actionLabel} ce compte.`);
    } finally {
      setProcessingAccountId(null);
      setSavingUser(false);
    }
  };

  const handleDeleteAccount = async (account: any) => {
    if (
      !window.confirm(
        `Supprimer définitivement le compte ${account.identifier} ? Cette action est irréversible.`,
      )
    ) {
      return;
    }

    clearMessages();
    setSavingUser(true);
    setProcessingAccountId(account.id);

    try {
      await authApi.deleteUser(account.id, token);
      setSuccess(`Compte ${account.identifier} supprimé.`);
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Impossible de supprimer ce compte.');
    } finally {
      setProcessingAccountId(null);
      setSavingUser(false);
    }
  };

  const handleSaveLdap = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setSavingLdap(true);

    try {
      await authApi.updateLdapConfig(
        {
          enabled: ldapForm.enabled,
          url: ldapForm.url || undefined,
          bindDn: ldapForm.bindDn || undefined,
          bindPassword: ldapForm.bindPassword || undefined,
          userSearchBase: ldapForm.userSearchBase || undefined,
          userSearchFilter: ldapForm.userSearchFilter || undefined,
          groupAttribute: ldapForm.groupAttribute || undefined,
          adminGroupDns: parseDnList(ldapForm.adminGroupDns),
          userGroupDns: parseDnList(ldapForm.userGroupDns),
        },
        token,
      );

      setSuccess('Configuration LDAP enregistrée.');
      await loadLdap();
    } catch (err: any) {
      setError(err.message || 'Impossible de sauvegarder la configuration LDAP.');
    } finally {
      setSavingLdap(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
      {error && (
        <div style={{ padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-lg)', background: 'var(--color-rose-subtle)', border: '1px solid var(--color-rose)', color: 'var(--color-rose)' }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-lg)', background: 'var(--color-emerald-subtle)', border: '1px solid var(--color-emerald)', color: 'var(--color-emerald)' }}>
          {success}
        </div>
      )}

      {mode !== 'ldap' && (
      <div className="glass-card">
        <h3 style={{ marginBottom: 'var(--space-4)' }}>👤 Création et gestion des comptes</h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>
          Le compte root peut créer, modifier, désactiver, réactiver et supprimer des comptes ADMIN/UTILISATEUR.
        </p>

        <form onSubmit={handleCreateUser} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 0.8fr auto', gap: 'var(--space-3)', alignItems: 'end' }}>
          <div className="input-group">
            <label className="input-label">Identifiant *</label>
            <input
              className="input"
              value={newUserForm.identifier}
              onChange={(e) => setNewUserForm((prev) => ({ ...prev, identifier: e.target.value }))}
              placeholder="admin"
              required
            />
          </div>

          <div className="input-group">
            <label className="input-label">Mot de passe *</label>
            <input
              className="input"
              type="password"
              value={newUserForm.password}
              onChange={(e) => setNewUserForm((prev) => ({ ...prev, password: e.target.value }))}
              placeholder="Min. 8 caractères"
              minLength={8}
              required
            />
          </div>

          <div className="input-group">
            <label className="input-label">Nom affiché</label>
            <input
              className="input"
              value={newUserForm.displayName}
              onChange={(e) => setNewUserForm((prev) => ({ ...prev, displayName: e.target.value }))}
              placeholder="Nom complet"
            />
          </div>

          <div className="input-group">
            <label className="input-label">Rôle</label>
            <select
              className="input"
              value={newUserForm.role}
              onChange={(e) => setNewUserForm((prev) => ({ ...prev, role: e.target.value as 'ADMIN' | 'VISITOR' }))}
            >
              <option value="VISITOR">UTILISATEUR</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>

          <button className="btn btn-primary" type="submit" disabled={savingUser}>
            {savingUser ? 'Création...' : 'Créer'}
          </button>
        </form>

        <div style={{ marginTop: 'var(--space-5)' }}>
          <h4 style={{ marginBottom: 'var(--space-3)' }}>Comptes existants</h4>
          {loadingUsers ? (
            <div className="spinner" />
          ) : (
            <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
              {users.map((account) => (
                <div
                  key={account.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.5fr 1fr 0.8fr 0.9fr auto auto auto auto',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    padding: 'var(--space-3)',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-bg-primary)',
                    opacity: account.isActive === false ? 0.72 : 1,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{account.identifier}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                      {account.displayName || 'Sans nom'}
                    </div>
                  </div>

                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    Créé le {new Date(account.createdAt).toLocaleDateString('fr-FR')}
                  </div>

                  <span className={`badge ${account.role === 'ADMIN' ? 'badge-accent' : 'badge-emerald'}`}>
                    {account.role === 'ADMIN' ? 'ADMIN' : 'UTILISATEUR'}
                  </span>

                  <span className={`badge ${account.isActive === false ? 'badge-rose' : 'badge-emerald'}`}>
                    {account.isActive === false ? 'INACTIF' : 'ACTIF'}
                  </span>

                  <select
                    className="input"
                    style={{ minWidth: 150 }}
                    value={roleDrafts[account.id] || account.role}
                    onChange={(e) =>
                      setRoleDrafts((prev) => ({
                        ...prev,
                        [account.id]: e.target.value as 'ADMIN' | 'VISITOR',
                      }))
                    }
                    disabled={account.isRoot || savingUser || processingAccountId === account.id}
                  >
                    <option value="VISITOR">UTILISATEUR</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>

                  <button
                    className="btn btn-secondary"
                    onClick={() => handleApplyRole(account.id)}
                    disabled={
                      account.isRoot ||
                      savingUser ||
                      processingAccountId === account.id ||
                      (roleDrafts[account.id] || account.role) === account.role
                    }
                  >
                    Appliquer
                  </button>

                  <button
                    className="btn btn-ghost"
                    onClick={() => handleToggleAccountStatus(account)}
                    disabled={account.isRoot || savingUser || processingAccountId === account.id}
                  >
                    {processingAccountId === account.id
                      ? 'Traitement...'
                      : account.isActive === false
                        ? 'Réactiver'
                        : 'Désactiver'}
                  </button>

                  <button
                    className="btn btn-ghost"
                    style={{ color: 'var(--color-rose)' }}
                    onClick={() => handleDeleteAccount(account)}
                    disabled={account.isRoot || savingUser || processingAccountId === account.id}
                  >
                    Supprimer
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      {mode !== 'accounts' && (
      <form className="glass-card" onSubmit={handleSaveLdap}>
        <h3 style={{ marginBottom: 'var(--space-4)' }}>🔐 LDAP / Active Directory</h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>
          Les utilisateurs LDAP sont automatiquement classés ADMIN ou UTILISATEUR selon les groupes DN configurés.
        </p>

        {loadingLdap ? (
          <div className="spinner" />
        ) : (
          <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <input
                type="checkbox"
                checked={ldapForm.enabled}
                onChange={(e) => setLdapForm((prev) => ({ ...prev, enabled: e.target.checked }))}
              />
              <span>Activer l&apos;authentification LDAP/AD</span>
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <div className="input-group">
                <label className="input-label">URL LDAP</label>
                <input
                  className="input"
                  value={ldapForm.url}
                  onChange={(e) => setLdapForm((prev) => ({ ...prev, url: e.target.value }))}
                  placeholder="ldap://ad.example.local:389"
                />
              </div>
              <div className="input-group">
                <label className="input-label">Base de recherche utilisateur</label>
                <input
                  className="input"
                  value={ldapForm.userSearchBase}
                  onChange={(e) => setLdapForm((prev) => ({ ...prev, userSearchBase: e.target.value }))}
                  placeholder="OU=Users,DC=example,DC=local"
                />
              </div>
              <div className="input-group">
                <label className="input-label">Bind DN (optionnel)</label>
                <input
                  className="input"
                  value={ldapForm.bindDn}
                  onChange={(e) => setLdapForm((prev) => ({ ...prev, bindDn: e.target.value }))}
                  placeholder="CN=svc-origineo,..."
                />
              </div>
              <div className="input-group">
                <label className="input-label">
                  Bind Password {ldapForm.hasBindPassword ? '(laissez vide pour conserver)' : ''}
                </label>
                <input
                  className="input"
                  type="password"
                  value={ldapForm.bindPassword}
                  onChange={(e) => setLdapForm((prev) => ({ ...prev, bindPassword: e.target.value }))}
                />
              </div>
              <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                <label className="input-label">Filtre utilisateur LDAP</label>
                <input
                  className="input"
                  value={ldapForm.userSearchFilter}
                  onChange={(e) => setLdapForm((prev) => ({ ...prev, userSearchFilter: e.target.value }))}
                  placeholder="(|(sAMAccountName={{username}})(mail={{username}}))"
                />
              </div>
              <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                <label className="input-label">Attribut groupes</label>
                <input
                  className="input"
                  value={ldapForm.groupAttribute}
                  onChange={(e) => setLdapForm((prev) => ({ ...prev, groupAttribute: e.target.value }))}
                  placeholder="memberOf"
                />
              </div>
              <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                <label className="input-label">Groupes ADMIN (DN, séparés par des virgules)</label>
                <input
                  className="input"
                  value={ldapForm.adminGroupDns}
                  onChange={(e) => setLdapForm((prev) => ({ ...prev, adminGroupDns: e.target.value }))}
                  placeholder="CN=Origineo_Admins,OU=Groups,DC=example,DC=local"
                />
              </div>
              <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                <label className="input-label">Groupes UTILISATEUR (DN, optionnel)</label>
                <input
                  className="input"
                  value={ldapForm.userGroupDns}
                  onChange={(e) => setLdapForm((prev) => ({ ...prev, userGroupDns: e.target.value }))}
                  placeholder="CN=Origineo_Users,OU=Groups,DC=example,DC=local"
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" type="submit" disabled={savingLdap}>
                {savingLdap ? 'Enregistrement...' : 'Enregistrer la configuration LDAP'}
              </button>
            </div>
          </div>
        )}
      </form>
      )}
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
