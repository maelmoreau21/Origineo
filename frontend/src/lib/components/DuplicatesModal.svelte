<script lang="ts">
	import { duplicateApi, personLabel, formatLifeYears, type DuplicatePairDto } from '$lib/api';
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

	let duplicates = $state<DuplicatePairDto[]>([]);
	let loading = $state(true);
	let merging = $state(false);
	let statusMsg = $state('');
	let errorMsg = $state('');

	onMount(async () => {
		await loadDuplicates();
	});

	async function loadDuplicates() {
		loading = true;
		errorMsg = '';
		try {
			duplicates = await duplicateApi.getCandidates();
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Erreur lors de la détection des doublons';
		} finally {
			loading = false;
		}
	}

	async function handleMerge(pair: DuplicatePairDto, targetWinsA: boolean) {
		const targetId = targetWinsA ? pair.personA.id : pair.personB.id;
		const sourceId = targetWinsA ? pair.personB.id : pair.personA.id;
		const targetName = targetWinsA ? personLabel(pair.personA) : personLabel(pair.personB);

		if (!confirm(`Confirmer la fusion ? La fiche source sera consolidée dans ${targetName} sans perte de liens familiaux ni d'actes.`)) {
			return;
		}

		merging = true;
		statusMsg = '';
		errorMsg = '';
		try {
			await duplicateApi.mergePersons({ targetId, sourceId });
			statusMsg = `Fusion réussie dans la fiche de ${targetName}.`;
			await loadDuplicates();
			onTreeMutated();
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Erreur lors de la fusion';
		} finally {
			merging = false;
		}
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={onClose}>
	<div class="modal-card" style="max-width: 900px; width: 95vw;" onclick={(e) => e.stopPropagation()}>
		<div class="modal-header">
			<div>
				<h3 style="margin: 0; font-size: 1.08rem; font-weight: 800; display: flex; align-items: center; gap: 0.5rem;">
					<span>👥 Détection de Doublons & Fusion Intelligente</span>
				</h3>
				<p style="margin: 0.2rem 0 0; font-size: 0.78rem; color: var(--text-secondary);">
					Analyse des homonymies, dates et lieux pour fusionner deux fiches sans casser l'arbre
				</p>
			</div>
			<button type="button" class="btn btn-ghost btn-sm" onclick={onClose}>✕</button>
		</div>

		<div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
			{#if statusMsg}
				<div class="alert-box success">{statusMsg}</div>
			{/if}
			{#if errorMsg}
				<div class="alert-box error">{errorMsg}</div>
			{/if}

			{#if loading}
				<p style="color: var(--text-secondary); font-size: 0.85rem;">Recherche d'homonymes en cours...</p>
			{:else if duplicates.length === 0}
				<div style="padding: 2.5rem; text-align: center; background: var(--bg-elevated); border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
					<div style="font-size: 2.2rem; margin-bottom: 0.4rem;">✨</div>
					<div style="font-weight: 700; font-size: 0.95rem;">Aucun doublon suspecté</div>
					<div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;">
						Votre arbre généalogique ne présente aucune homonymie avec concordance de dates ou de lieux.
					</div>
				</div>
			{:else}
				<div style="display: flex; flex-direction: column; gap: 1rem;">
					{#each duplicates as pair}
						<div class="pair-card">
							<div class="pair-header">
								<span class="badge badge-accent mono">Similarité {pair.similarityScore}%</span>
								<div class="match-tags">
									{#each pair.matchReasons as reason}
										<span class="reason-tag">{reason}</span>
									{/each}
								</div>
							</div>

							<!-- Comparison Grid -->
							<div class="comparison-grid">
								<!-- Person A -->
								<div class="person-box">
									<div class="box-header">
										<strong>{personLabel(pair.personA)}</strong>
										<span class="mono" style="font-size: 0.72rem; color: var(--text-secondary);">{formatLifeYears(pair.personA)}</span>
									</div>
									<div class="detail-row"><span>Naissance :</span> <strong>{pair.personA.birthDate || '—'} {pair.personA.birthPlace ? `à ${pair.personA.birthPlace}` : ''}</strong></div>
									<div class="detail-row"><span>Décès :</span> <strong>{pair.personA.deathDate || '—'} {pair.personA.deathPlace ? `à ${pair.personA.deathPlace}` : ''}</strong></div>
									{#if pair.personA.professions?.length}
										<div class="detail-row"><span>Métiers :</span> <span>{pair.personA.professions.join(', ')}</span></div>
									{/if}

									{#if canModify}
										<button
											type="button"
											class="btn btn-primary btn-sm"
											style="margin-top: 0.75rem; width: 100%;"
											disabled={merging}
											onclick={() => handleMerge(pair, true)}
										>
											Conserver A (Fusionner B dedans)
										</button>
									{/if}
								</div>

								<div class="vs-divider">⇄</div>

								<!-- Person B -->
								<div class="person-box">
									<div class="box-header">
										<strong>{personLabel(pair.personB)}</strong>
										<span class="mono" style="font-size: 0.72rem; color: var(--text-secondary);">{formatLifeYears(pair.personB)}</span>
									</div>
									<div class="detail-row"><span>Naissance :</span> <strong>{pair.personB.birthDate || '—'} {pair.personB.birthPlace ? `à ${pair.personB.birthPlace}` : ''}</strong></div>
									<div class="detail-row"><span>Décès :</span> <strong>{pair.personB.deathDate || '—'} {pair.personB.deathPlace ? `à ${pair.personB.deathPlace}` : ''}</strong></div>
									{#if pair.personB.professions?.length}
										<div class="detail-row"><span>Métiers :</span> <span>{pair.personB.professions.join(', ')}</span></div>
									{/if}

									{#if canModify}
										<button
											type="button"
											class="btn btn-primary btn-sm"
											style="margin-top: 0.75rem; width: 100%;"
											disabled={merging}
											onclick={() => handleMerge(pair, false)}
										>
											Conserver B (Fusionner A dedans)
										</button>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.pair-card {
		background: var(--bg-elevated);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		padding: 1rem;
	}

	.pair-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.match-tags {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
	}

	.reason-tag {
		font-size: 0.72rem;
		padding: 2px 8px;
		background: rgba(59, 130, 246, 0.12);
		color: #3b82f6;
		border-radius: 99px;
		font-weight: 600;
	}

	.comparison-grid {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		gap: 0.75rem;
		align-items: center;
	}

	.person-box {
		background: var(--bg-surface);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-sm);
		padding: 0.75rem;
	}

	.box-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 1px solid var(--border-subtle);
		padding-bottom: 0.4rem;
		margin-bottom: 0.5rem;
	}

	.detail-row {
		font-size: 0.76rem;
		display: flex;
		justify-content: space-between;
		padding: 2px 0;
	}

	.detail-row span:first-child {
		color: var(--text-secondary);
	}

	.vs-divider {
		font-size: 1.2rem;
		color: var(--text-muted);
		font-weight: 800;
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
