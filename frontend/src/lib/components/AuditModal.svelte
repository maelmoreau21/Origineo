<script lang="ts">
	import {
		type AnomalyDto,
		type AuditLogDto,
		auditApi
	} from '$lib/api';
	import { i18n } from '$lib/i18n/index.svelte';
	import {
		REPUBLICAN_MONTHS,
		gregorianToRepublican,
		parseRepublicanString,
		republicanToGregorian
	} from '$lib/republican-calendar';
	import { onMount } from 'svelte';

	let {
		canModify = false,
		onClose,
		onFocusPerson,
		onTreeMutated
	}: {
		canModify?: boolean;
		onClose: () => void;
		onFocusPerson: (personId: string) => void;
		onTreeMutated: () => void;
	} = $props();

	let activeTab = $state<'anomalies' | 'logs' | 'converter'>('anomalies');
	let anomalies = $state<AnomalyDto[]>([]);
	let logs = $state<AuditLogDto[]>([]);
	let loading = $state(true);
	let statusMsg = $state('');
	let errorMsg = $state('');
	let filterSeverity = $state<'ALL' | 'ERROR' | 'WARNING'>('ALL');

	// Republican Calendar Interactive State
	let repDay = $state<number>(14);
	let repMonthIndex = $state<number>(1); // Brumaire
	let repYear = $state<number>(4); // An IV
	let repResultGregorian = $derived(republicanToGregorian(repDay, repMonthIndex, repYear));

	let inputGregorian = $state<string>('1795-11-05');
	let gregResultRepublican = $derived(gregorianToRepublican(inputGregorian));

	let freeformSearch = $state<string>('18 Brumaire An VIII');
	let parsedFreeform = $derived(parseRepublicanString(freeformSearch));

	const filteredAnomalies = $derived(
		filterSeverity === 'ALL'
			? anomalies
			: anomalies.filter((a) => a.severity === filterSeverity)
	);

	const errorCount = $derived(anomalies.filter((a) => a.severity === 'ERROR').length);
	const warningCount = $derived(anomalies.filter((a) => a.severity === 'WARNING').length);

	onMount(async () => {
		await refreshAll();
	});

	async function refreshAll() {
		loading = true;
		errorMsg = '';
		try {
			const [anomRes, logRes] = await Promise.all([
				auditApi.getAnomalies(),
				auditApi.getLogs()
			]);
			anomalies = anomRes;
			logs = logRes;
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Erreur lors du chargement de l’audit';
		} finally {
			loading = false;
		}
	}

	async function handleUndo(log: AuditLogDto) {
		statusMsg = '';
		errorMsg = '';
		try {
			await auditApi.undoLog(log.id);
			statusMsg = `Action « ${log.action} » (${log.entityLabel || log.id.slice(0, 8)}) annulée avec succès.`;
			await refreshAll();
			onTreeMutated();
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Impossible d’annuler cette action';
		}
	}

	function formatTimestamp(iso: string): string {
		try {
			return new Date(iso).toLocaleString();
		} catch {
			return iso;
		}
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={onClose}>
	<div class="modal-card" style="max-width: 860px; width: 95vw;" onclick={(e) => e.stopPropagation()}>
		<div class="modal-header">
			<div>
				<h3 style="margin: 0; font-size: 1.08rem; font-weight: 800; display: flex; align-items: center; gap: 0.5rem;">
					<span>🛡️ Contrôle de cohérence & Outils d'Archives</span>
				</h3>
				<p style="margin: 0.2rem 0 0; font-size: 0.78rem; color: var(--text-secondary);">
					Détection d'anomalies généalogiques (9 règles pro), Journal d'audit avec Undo et Convertisseur Républicain (1792–1805)
				</p>
			</div>
			<button type="button" class="btn btn-ghost btn-sm" onclick={onClose}>✕</button>
		</div>

		<!-- Tabs -->
		<div style="display: flex; gap: 0.5rem; padding: 0.75rem 1.25rem; border-bottom: 1px solid var(--border-subtle); background: var(--bg-elevated); flex-wrap: wrap;">
			<button
				type="button"
				class="btn btn-sm"
				class:btn-primary={activeTab === 'anomalies'}
				class:btn-secondary={activeTab !== 'anomalies'}
				onclick={() => (activeTab = 'anomalies')}
			>
				⚠️ Anomalies détectées ({anomalies.length})
			</button>
			<button
				type="button"
				class="btn btn-sm"
				class:btn-primary={activeTab === 'converter'}
				class:btn-secondary={activeTab !== 'converter'}
				onclick={() => (activeTab = 'converter')}
			>
				📅 Calendrier Républicain
			</button>
			<button
				type="button"
				class="btn btn-sm"
				class:btn-primary={activeTab === 'logs'}
				class:btn-secondary={activeTab !== 'logs'}
				onclick={() => (activeTab = 'logs')}
			>
				📜 Journal d'audit & Undo ({logs.length})
			</button>
			<button
				type="button"
				class="btn btn-ghost btn-sm"
				style="margin-left: auto;"
				onclick={refreshAll}
			>
				🔄 Actualiser
			</button>
		</div>

		<div class="modal-body" style="max-height: 68vh; overflow-y: auto;">
			{#if statusMsg}
				<div class="alert-box success">{statusMsg}</div>
			{/if}
			{#if errorMsg}
				<div class="alert-box error">{errorMsg}</div>
			{/if}

			{#if loading}
				<p style="color: var(--text-secondary); font-size: 0.85rem;">Analyse de la base généalogique en cours...</p>
			{:else if activeTab === 'anomalies'}
				<!-- Summary Counters -->
				<div style="display: flex; gap: 0.5rem; margin-bottom: 0.9rem; flex-wrap: wrap;">
					<button
						type="button"
						class="btn btn-sm"
						class:btn-primary={filterSeverity === 'ALL'}
						class:btn-secondary={filterSeverity !== 'ALL'}
						onclick={() => (filterSeverity = 'ALL')}
					>
						Toutes ({anomalies.length})
					</button>
					<button
						type="button"
						class="btn btn-sm"
						class:btn-primary={filterSeverity === 'ERROR'}
						class:btn-secondary={filterSeverity !== 'ERROR'}
						onclick={() => (filterSeverity = 'ERROR')}
					>
						⛔ Erreurs critiques ({errorCount})
					</button>
					<button
						type="button"
						class="btn btn-sm"
						class:btn-primary={filterSeverity === 'WARNING'}
						class:btn-secondary={filterSeverity !== 'WARNING'}
						onclick={() => (filterSeverity = 'WARNING')}
					>
						⚠️ Avertissements ({warningCount})
					</button>
				</div>

				{#if filteredAnomalies.length === 0}
					<div style="padding: 2rem; text-align: center; background: var(--bg-elevated); border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
						<div style="font-size: 2rem; margin-bottom: 0.4rem;">✨</div>
						<div style="font-weight: 700; font-size: 0.95rem;">Aucune incohérence généalogique détectée</div>
						<div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;">
							Toutes les dates de naissance, décès, mariages, âges parentaux et espacements de fratries respectent les contrôles d'archives.
						</div>
					</div>
				{:else}
					<div style="display: flex; flex-direction: column; gap: 0.55rem;">
						{#each filteredAnomalies as item}
							<div class="anomaly-row {item.severity.toLowerCase()}">
								<div style="flex: 1; min-width: 0;">
									<div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.2rem;">
										<span class="badge {item.severity === 'ERROR' ? 'badge-danger' : 'badge-warning'}" style="font-size: 0.68rem; font-weight: 800;">
											{item.severity === 'ERROR' ? 'CRITIQUE' : 'AVIS'}
										</span>
										<strong style="font-size: 0.88rem;">{item.personName}</strong>
									</div>
									<div style="font-size: 0.82rem; color: var(--text-primary);">
										{i18n.locale === 'fr' ? item.messageFr : item.messageEn}
									</div>
								</div>
								<button
									type="button"
									class="btn btn-secondary btn-sm"
									style="flex-shrink: 0;"
									onclick={() => {
										onFocusPerson(item.personId);
										onClose();
									}}
								>
									Voir la fiche →
								</button>
							</div>
						{/each}
					</div>
				{/if}

			{:else if activeTab === 'converter'}
				<!-- Republican Calendar Interactive Suite -->
				<div style="display: flex; flex-direction: column; gap: 1.25rem;">
					<div style="background: rgba(180, 83, 9, 0.08); border: 1px solid rgba(180, 83, 9, 0.25); border-radius: var(--radius-md); padding: 0.85rem 1rem;">
						<div style="font-weight: 700; font-size: 0.88rem; color: #d97706; margin-bottom: 0.2rem;">
							🏛️ Calendrier Républicain Français (1792 – 1805)
						</div>
						<p style="margin: 0; font-size: 0.78rem; color: var(--text-secondary); line-height: 1.45;">
							Indispensable pour déchiffrer les actes d'état civil de la Révolution et du Consulat. Ce convertisseur bidirectionnel gère les 12 mois poétiques (30 jours) et les Sans-culottides.
						</p>
					</div>

					<!-- Two conversion cards side-by-side -->
					<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1rem;">
						<!-- Card 1: Républicain -> Grégorien -->
						<div style="background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 1rem;">
							<div style="font-weight: 700; font-size: 0.86rem; margin-bottom: 0.75rem;">
								📜 Du Républicain vers le Grégorien
							</div>
							<div style="display: grid; grid-template-columns: 80px 1fr 100px; gap: 0.5rem; margin-bottom: 1rem;">
								<div>
									<label class="form-label" style="font-size: 0.72rem;">Jour (1-30)</label>
									<input type="number" class="input" min="1" max="30" bind:value={repDay} />
								</div>
								<div>
									<label class="form-label" style="font-size: 0.72rem;">Mois</label>
									<select class="input" bind:value={repMonthIndex}>
										{#each REPUBLICAN_MONTHS as m, idx}
											<option value={idx}>{m.name} ({m.season})</option>
										{/each}
									</select>
								</div>
								<div>
									<label class="form-label" style="font-size: 0.72rem;">Année (I - XIV)</label>
									<input type="number" class="input" min="1" max="14" bind:value={repYear} />
								</div>
							</div>

							<div style="padding: 0.75rem; background: var(--bg-surface); border-radius: var(--radius-sm); border: 1px dashed var(--border-strong); text-align: center;">
								<div style="font-size: 0.72rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 700;">
									Date Grégorienne Correspondante
								</div>
								<div style="font-size: 1.25rem; font-weight: 800; color: var(--accent-primary); margin-top: 0.25rem; font-family: var(--font-mono);">
									{repResultGregorian || 'Date invalide'}
								</div>
							</div>
						</div>

						<!-- Card 2: Grégorien -> Républicain -->
						<div style="background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 1rem;">
							<div style="font-weight: 700; font-size: 0.86rem; margin-bottom: 0.75rem;">
								🗓️ Du Grégorien vers le Républicain
							</div>
							<div style="margin-bottom: 1rem;">
								<label class="form-label" style="font-size: 0.72rem;">Date grégorienne (entre 1792-09-22 et 1805-12-31)</label>
								<input type="date" class="input" min="1792-09-22" max="1805-12-31" bind:value={inputGregorian} />
							</div>

							<div style="padding: 0.75rem; background: var(--bg-surface); border-radius: var(--radius-sm); border: 1px dashed var(--border-strong); text-align: center;">
								<div style="font-size: 0.72rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 700;">
									Date Républicaine Correspondante
								</div>
								<div style="font-size: 1.15rem; font-weight: 800; color: #10b981; margin-top: 0.25rem; font-family: var(--font-serif);">
									{#if gregResultRepublican}
										{gregResultRepublican.day} {gregResultRepublican.month} An {gregResultRepublican.yearRoman}
									{:else}
										<span style="color: var(--text-secondary); font-size: 0.85rem;">Hors période républicaine</span>
									{/if}
								</div>
							</div>
						</div>
					</div>

					<!-- Parser en texte libre -->
					<div style="background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 1rem;">
						<div style="font-weight: 700; font-size: 0.86rem; margin-bottom: 0.4rem;">
							⚡ Détecteur instantané de mention d'acte
						</div>
						<div style="display: flex; gap: 0.75rem; align-items: center;">
							<input
								type="text"
								class="input"
								placeholder="Exemple: 18 Brumaire An VIII ou 4 Ventôse An 12..."
								bind:value={freeformSearch}
								style="flex: 1;"
							/>
						</div>
						{#if parsedFreeform}
							<div style="margin-top: 0.6rem; padding: 0.6rem 0.85rem; background: rgba(16, 185, 129, 0.12); border-radius: var(--radius-sm); font-size: 0.82rem; color: #10b981; display: flex; justify-content: space-between; align-items: center;">
								<span>Reconnu : <strong>{parsedFreeform.display}</strong></span>
								<span style="font-family: var(--font-mono); font-weight: 700;">→ {parsedFreeform.gregorian}</span>
							</div>
						{/if}
					</div>
				</div>

			{:else if activeTab === 'logs'}
				{#if logs.length === 0}
					<p style="color: var(--text-secondary); font-size: 0.85rem;">Aucun événement enregistré dans le journal.</p>
				{:else}
					<div style="display: flex; flex-direction: column; gap: 0.55rem;">
						{#each logs as log}
							<div class="log-row">
								<div style="flex: 1; min-width: 0;">
									<div style="display: flex; align-items: center; gap: 0.5rem;">
										<span class="badge badge-secondary" style="font-size: 0.68rem; font-weight: 700;">
											{log.action}
										</span>
										<strong style="font-size: 0.86rem;">{log.entityLabel || log.entityType}</strong>
									</div>
									<div style="font-size: 0.76rem; color: var(--text-secondary); margin-top: 0.2rem;">
										{log.userEmail} · {formatTimestamp(log.createdAt)}
									</div>
								</div>
								{#if canModify && !log.undone}
									<button
										type="button"
										class="btn btn-secondary btn-sm"
										onclick={() => handleUndo(log)}
									>
										↩️ Annuler (Undo)
									</button>
								{:else if log.undone}
									<span class="badge" style="background: rgba(100, 116, 139, 0.2); color: var(--text-secondary); font-size: 0.72rem;">
										Annulée
									</span>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>

<style>
	.anomaly-row,
	.log-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.7rem 0.9rem;
		border-radius: var(--radius-md);
		background: var(--bg-elevated);
		border: 1px solid var(--border-subtle);
	}

	.anomaly-row.error {
		border-left: 4px solid #ef4444;
	}

	.anomaly-row.warning {
		border-left: 4px solid #f59e0b;
	}

	.badge-danger {
		background: rgba(239, 68, 68, 0.16);
		color: #f87171;
		border: 1px solid rgba(239, 68, 68, 0.35);
	}

	.badge-warning {
		background: rgba(245, 158, 11, 0.16);
		color: #fbbf24;
		border: 1px solid rgba(245, 158, 11, 0.35);
	}

	.alert-box {
		padding: 0.65rem 0.85rem;
		border-radius: var(--radius-md);
		font-size: 0.82rem;
		margin-bottom: 0.8rem;
	}

	.alert-box.success {
		background: rgba(16, 185, 129, 0.15);
		color: var(--success);
		border: 1px solid rgba(16, 185, 129, 0.35);
	}

	.alert-box.error {
		background: rgba(239, 68, 68, 0.15);
		color: var(--danger);
		border: 1px solid rgba(239, 68, 68, 0.35);
	}
</style>
