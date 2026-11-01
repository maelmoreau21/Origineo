<script lang="ts">
	import {
		type PersonDto,
		type TreeFragmentDto,
		type TreeFragmentsResponse,
		treeApi,
		searchApi,
		personApi,
		relationshipApi,
		unionApi,
		duplicateApi,
		personLabel,
		formatLifeYears
	} from '$lib/api';
	import { i18n } from '$lib/i18n/index.svelte';
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

	let data = $state<TreeFragmentsResponse | null>(null);
	let loading = $state(true);
	let errorMsg = $state('');
	let statusMsg = $state('');

	// Repair / Attachment State
	let selectedFragment = $state<TreeFragmentDto | null>(null);
	let sourcePersonId = $state<string>('');
	let targetSearchQuery = $state<string>('');
	let targetSearchResults = $state<PersonDto[]>([]);
	let selectedTargetPerson = $state<PersonDto | null>(null);
	let linkType = $state<'TARGET_IS_FATHER' | 'TARGET_IS_MOTHER' | 'SOURCE_IS_PARENT' | 'SPOUSE' | 'MERGE_PIVOT'>('TARGET_IS_FATHER');
	let isRepairing = $state(false);

	onMount(async () => {
		await loadFragments();
	});

	async function loadFragments() {
		loading = true;
		errorMsg = '';
		try {
			data = await treeApi.getFragments();
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Erreur lors de la détection des bouts d’arbre';
		} finally {
			loading = false;
		}
	}

	function startRepair(frag: TreeFragmentDto) {
		selectedFragment = frag;
		sourcePersonId = frag.rootPersons[0]?.id || frag.persons[0]?.id || '';
		selectedTargetPerson = null;
		targetSearchQuery = '';
		targetSearchResults = [];
		linkType = 'TARGET_IS_FATHER';
		statusMsg = '';
		errorMsg = '';
	}

	async function handleSearchTarget(q: string) {
		targetSearchQuery = q;
		if (q.trim().length < 2) {
			targetSearchResults = [];
			return;
		}
		try {
			const res = await searchApi.search(q.trim(), 1, 8);
			// Filter out people from the current fragment
			const fragIds = new Set(selectedFragment?.persons.map((p) => p.id) || []);
			targetSearchResults = res.persons.filter((p) => !fragIds.has(p.id));
		} catch {
			targetSearchResults = [];
		}
	}

	async function handleExecuteRepair() {
		if (!selectedTargetPerson || !sourcePersonId || !selectedFragment) {
			errorMsg = 'Veuillez sélectionner la personne source et la personne cible.';
			return;
		}

		isRepairing = true;
		errorMsg = '';
		statusMsg = '';

		try {
			if (linkType === 'TARGET_IS_FATHER' || linkType === 'TARGET_IS_MOTHER') {
				// Target is parent of source
				await relationshipApi.create({
					parentId: selectedTargetPerson.id,
					childId: sourcePersonId
				});
				statusMsg = `Lien de filiation établi : ${personLabel(selectedTargetPerson)} est désormais parent de la personne sélectionnée !`;
			} else if (linkType === 'SOURCE_IS_PARENT') {
				// Source is parent of target
				await relationshipApi.create({
					parentId: sourcePersonId,
					childId: selectedTargetPerson.id
				});
				statusMsg = `Lien de filiation établi avec succès !`;
			} else if (linkType === 'SPOUSE') {
				// Create union
				await unionApi.create({
					partner1Id: selectedTargetPerson.id,
					partner2Id: sourcePersonId
				});
				statusMsg = `Union créée avec succès entre les deux branches !`;
			} else if (linkType === 'MERGE_PIVOT') {
				// Merge pivot duplicate
				await duplicateApi.mergePersons({
					sourceId: sourcePersonId,
					targetId: selectedTargetPerson.id
				});
				statusMsg = `Fusion pivot réussie : les deux branches sont maintenant réunifiées !`;
			}

			onTreeMutated();
			selectedFragment = null;
			await loadFragments();
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Erreur lors du rattachement de la branche';
		} finally {
			isRepairing = false;
		}
	}

	const detachedFragments = $derived(
		data?.fragments.filter((f) => !f.isMain && f.size > 1) || []
	);
	const isolatedIndividuals = $derived(
		data?.fragments.filter((f) => !f.isMain && f.size === 1) || []
	);
	const mainFragment = $derived(
		data?.fragments.find((f) => f.isMain) || null
	);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={onClose}>
	<div class="modal-card" style="max-width: 860px;" onclick={(e) => e.stopPropagation()}>
		<!-- Header -->
		<div class="modal-header">
			<div style="display: flex; align-items: center; gap: 0.65rem;">
				<div class="modal-icon-badge">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
						<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
					</svg>
				</div>
				<div>
					<h3 style="margin: 0; font-size: 1.05rem; font-weight: 800;">
						🧩 Détecteur de Bouts d'Arbre & Réparation
					</h3>
					<div style="font-size: 0.74rem; color: var(--text-secondary);">
						Trouvez les branches orphelines et reliez-les en 1 clic au tronc principal
					</div>
				</div>
			</div>
			<button type="button" class="btn btn-ghost btn-sm" onclick={onClose} aria-label="Fermer">✕</button>
		</div>

		<div class="modal-body" style="display: flex; flex-direction: column; gap: 1rem;">
			{#if statusMsg}
				<div class="alert alert-success">
					<span style="font-weight: 700;">✓</span> {statusMsg}
				</div>
			{/if}
			{#if errorMsg}
				<div class="alert alert-error">
					<span style="font-weight: 700;">⚠</span> {errorMsg}
				</div>
			{/if}

			{#if loading}
				<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
					Analyse de la topologie de l'arbre en cours...
				</div>
			{:else if data}
				<!-- Health Banner -->
				<div class="health-strip">
					<div class="health-item main">
						<span class="health-val">{mainFragment?.size || 0}</span>
						<span class="health-label">Arbre principal (Tronc)</span>
					</div>
					<div class="health-item warning">
						<span class="health-val">{data.disconnectedCount}</span>
						<span class="health-label">Bouts d'arbres détachés</span>
					</div>
					<div class="health-item info">
						<span class="health-val">{data.isolatedCount}</span>
						<span class="health-label">Individus isolés (0 lien)</span>
					</div>
				</div>

				{#if data.disconnectedCount === 0 && data.isolatedCount === 0}
					<div class="empty-state">
						<div style="font-size: 2rem; margin-bottom: 0.4rem;">🌳 ✨</div>
						<div style="font-weight: 800; font-size: 1rem; color: var(--success);">
							Félicitations ! Votre arbre généalogique est parfaitement unifié !
						</div>
						<p style="margin: 0.35rem 0 0; font-size: 0.8rem; color: var(--text-secondary);">
							Toutes les personnes ({data.totalPersons}) sont reliées par des liens directs ou par alliance au tronc principal.
						</p>
					</div>
				{:else}
					<!-- Repair Section Drawer if active -->
					{#if selectedFragment}
						<div class="repair-drawer">
							<div class="repair-header">
								<h4 style="margin: 0; font-size: 0.95rem; font-weight: 800; color: var(--accent);">
									🔗 Réparer & Relier : {selectedFragment.label}
								</h4>
								<button
									type="button"
									class="btn btn-ghost btn-sm"
									onclick={() => (selectedFragment = null)}
								>
									Annuler
								</button>
							</div>

							<div class="repair-form">
								<!-- Step 1: Select Person in Fragment -->
								<div>
									<label class="label" for="src-person">1. Personne pivot du bout détaché</label>
									<select id="src-person" class="select" bind:value={sourcePersonId}>
										{#each selectedFragment.persons as p (p.id)}
											<option value={p.id}>
												{personLabel(p)} ({formatLifeYears(p)})
											</option>
										{/each}
									</select>
								</div>

								<!-- Step 2: Relation Type -->
								<div>
									<label class="label" for="link-type">2. Comment relier à l'arbre principal ?</label>
									<select id="link-type" class="select" bind:value={linkType}>
										<option value="TARGET_IS_FATHER">La personne cible est son PÈRE (Filiation)</option>
										<option value="TARGET_IS_MOTHER">La personne cible est sa MÈRE (Filiation)</option>
										<option value="SOURCE_IS_PARENT">Cette personne est le PÈRE / MÈRE de la cible</option>
										<option value="SPOUSE">Mariage / Union (Alliance)</option>
										<option value="MERGE_PIVOT">⚡ FUSIONNER (Ces deux personnes sont en fait la même personne !)</option>
									</select>
								</div>

								<!-- Step 3: Choose Target Person in Main Tree -->
								<div>
									<label class="label" for="target-search">3. Personne cible dans l'arbre principal</label>
									<input
										id="target-search"
										class="input"
										placeholder="Rechercher par nom ou prénom dans l'arbre principal..."
										value={targetSearchQuery}
										oninput={(e) => handleSearchTarget((e.currentTarget as HTMLInputElement).value)}
									/>

									{#if targetSearchResults.length > 0}
										<div class="target-results-box">
											{#each targetSearchResults as tp (tp.id)}
												<button
													type="button"
													class="target-item"
													class:selected={selectedTargetPerson?.id === tp.id}
													onclick={() => (selectedTargetPerson = tp)}
												>
													<span style="font-weight: 700;">{personLabel(tp)}</span>
													<span style="font-size: 0.74rem; color: var(--text-secondary); margin-left: auto;">
														{formatLifeYears(tp)} {tp.birthPlace ? `• ${tp.birthPlace}` : ''}
													</span>
												</button>
											{/each}
										</div>
									{/if}

									{#if selectedTargetPerson}
										<div class="selected-target-pill">
											<span>Cible sélectionnée : <strong>{personLabel(selectedTargetPerson)}</strong> ({formatLifeYears(selectedTargetPerson)})</span>
											<button
												type="button"
												class="btn-close-mini"
												onclick={() => (selectedTargetPerson = null)}
											>
												✕
											</button>
										</div>
									{/if}
								</div>

								<div style="padding-top: 0.5rem; display: flex; gap: 0.6rem;">
									<button
										type="button"
										class="btn btn-primary"
										disabled={!selectedTargetPerson || !sourcePersonId || isRepairing || !canModify}
										onclick={handleExecuteRepair}
									>
										{#if isRepairing}
											Rattachement en cours...
										{:else}
											✅ Appliquer le rattachement & Réunifier
										{/if}
									</button>
									<button
										type="button"
										class="btn btn-secondary"
										onclick={() => (selectedFragment = null)}
									>
										Fermer
									</button>
								</div>
							</div>
						</div>
					{/if}

					<!-- Detached Branches List -->
					{#if detachedFragments.length > 0}
						<div>
							<h4 style="margin: 0 0 0.65rem; font-size: 0.92rem; font-weight: 800; display: flex; align-items: center; gap: 0.4rem;">
								<span>🌿</span>
								<span>Bouts d'arbres détachés ({detachedFragments.length})</span>
							</h4>

							<div class="fragments-list">
								{#each detachedFragments as frag (frag.id)}
									<div class="frag-card">
										<div style="flex: 1; min-width: 0;">
											<div style="font-weight: 800; font-size: 0.92rem; color: var(--text-primary); display: flex; align-items: center; gap: 0.45rem;">
												<span>{frag.label}</span>
												<span class="badge badge-warning mono">{frag.size} pers.</span>
											</div>
											<div style="font-size: 0.76rem; color: var(--text-secondary); margin-top: 0.2rem;">
												{#if frag.doyen}
													Doyen : <strong>{personLabel(frag.doyen)}</strong> ({formatLifeYears(frag.doyen)})
												{/if}
												{#if frag.rootPersons.length > 0}
													· Tête de branche : {frag.rootPersons.map((p) => personLabel(p)).join(', ')}
												{/if}
											</div>
										</div>

										<div style="display: flex; gap: 0.45rem; align-items: center;">
											<button
												type="button"
												class="btn btn-secondary btn-sm"
												onclick={() => {
													const pid = frag.rootPersons[0]?.id || frag.persons[0]?.id;
													if (pid) {
														onFocusPerson(pid);
														onClose();
													}
												}}
												title="Centrer l'arbre sur cette branche"
											>
												🔍 Explorer
											</button>

											<button
												type="button"
												class="btn btn-primary btn-sm"
												onclick={() => startRepair(frag)}
											>
												🔗 Rattacher
											</button>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Isolated Individuals List -->
					{#if isolatedIndividuals.length > 0}
						<div>
							<h4 style="margin: 0 0 0.65rem; font-size: 0.92rem; font-weight: 800; display: flex; align-items: center; gap: 0.4rem;">
								<span>👤</span>
								<span>Individus totalement isolés ({isolatedIndividuals.length})</span>
							</h4>

							<div class="fragments-list">
								{#each isolatedIndividuals as frag (frag.id)}
									{@const p = frag.persons[0]}
									<div class="frag-card mini">
										<div style="flex: 1; min-width: 0;">
											<span style="font-weight: 700; font-size: 0.85rem;">{personLabel(p)}</span>
											<span style="font-size: 0.75rem; color: var(--text-secondary); margin-left: 0.4rem;">
												({formatLifeYears(p)}) {p.birthPlace ? `• ${p.birthPlace}` : ''}
											</span>
										</div>

										<div style="display: flex; gap: 0.4rem; align-items: center;">
											<button
												type="button"
												class="btn btn-secondary btn-sm"
												onclick={() => {
													onFocusPerson(p.id);
													onClose();
												}}
											>
												Explorer
											</button>
											<button
												type="button"
												class="btn btn-primary btn-sm"
												onclick={() => startRepair(frag)}
											>
												🔗 Relier
											</button>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				{/if}
			{/if}
		</div>
	</div>
</div>

<style>
	.modal-icon-badge {
		width: 36px;
		height: 36px;
		border-radius: 10px;
		background: var(--accent-soft);
		color: var(--accent);
		display: grid;
		place-items: center;
		flex-shrink: 0;
	}

	.health-strip {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 0.75rem;
	}

	.health-item {
		padding: 0.75rem 1rem;
		border-radius: var(--radius-md);
		background: var(--bg-elevated);
		border: 1px solid var(--border-subtle);
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.health-val {
		font-size: 1.4rem;
		font-weight: 800;
		font-family: var(--font-mono, monospace);
		color: var(--text-primary);
	}

	.health-label {
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--text-secondary);
	}

	.health-item.main .health-val {
		color: var(--accent);
	}

	.health-item.warning .health-val {
		color: var(--warning, #f59e0b);
	}

	.health-item.info .health-val {
		color: var(--color-other, #8b5cf6);
	}

	.empty-state {
		padding: 2.5rem 1.5rem;
		border-radius: var(--radius-lg);
		background: var(--bg-elevated);
		border: 1px solid var(--border-color);
		text-align: center;
	}

	.fragments-list {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		max-height: 280px;
		overflow-y: auto;
	}

	.frag-card {
		padding: 0.75rem 1rem;
		border-radius: var(--radius-md);
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.85rem;
		transition: border-color 0.14s ease;
	}

	.frag-card:hover {
		border-color: var(--border-color);
	}

	.frag-card.mini {
		padding: 0.5rem 0.85rem;
	}

	.repair-drawer {
		padding: 1.1rem;
		border-radius: var(--radius-lg);
		background: var(--bg-surface);
		border: 2px solid var(--accent);
		box-shadow: 0 4px 16px rgba(16, 185, 129, 0.12);
	}

	.repair-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.85rem;
		padding-bottom: 0.65rem;
		border-bottom: 1px solid var(--border-subtle);
	}

	.repair-form {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}

	.target-results-box {
		margin-top: 0.4rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--border-subtle);
		background: var(--bg-primary);
		max-height: 160px;
		overflow-y: auto;
	}

	.target-item {
		width: 100%;
		display: flex;
		align-items: center;
		padding: 0.5rem 0.75rem;
		border: none;
		border-bottom: 1px solid var(--border-subtle);
		background: transparent;
		color: var(--text-primary);
		font-size: 0.81rem;
		cursor: pointer;
		text-align: left;
	}

	.target-item:hover,
	.target-item.selected {
		background: var(--accent-soft);
		color: var(--accent);
	}

	.selected-target-pill {
		margin-top: 0.4rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.45rem 0.75rem;
		border-radius: var(--radius-sm);
		background: var(--accent-soft);
		border: 1px solid rgba(16, 185, 129, 0.3);
		font-size: 0.8rem;
		color: var(--accent);
	}

	.btn-close-mini {
		background: none;
		border: none;
		color: var(--accent);
		cursor: pointer;
		font-weight: bold;
	}

	.alert {
		padding: 0.65rem 0.85rem;
		border-radius: var(--radius-md);
		font-size: 0.84rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.alert-success {
		background: rgba(16, 185, 129, 0.14);
		color: var(--success);
		border: 1px solid rgba(16, 185, 129, 0.35);
	}

	.alert-error {
		background: rgba(239, 68, 68, 0.14);
		color: var(--danger);
		border: 1px solid rgba(239, 68, 68, 0.35);
	}
</style>
