<script lang="ts">
	import {
		type PersonDto,
		type RelationshipPathDto,
		searchApi,
		treeApi,
		personLabel,
		formatLifeYears
	} from '$lib/api';
	import { i18n } from '$lib/i18n/index.svelte';

	let {
		initialPersonA = null,
		onClose,
		onFocusPerson
	}: {
		initialPersonA?: PersonDto | null;
		onClose: () => void;
		onFocusPerson: (id: string) => void;
	} = $props();

	let personA = $state<PersonDto | null>(null);
	let personB = $state<PersonDto | null>(null);
	let queryA = $state('');
	let queryB = $state('');
	let resultsA = $state<PersonDto[]>([]);
	let resultsB = $state<PersonDto[]>([]);
	let loading = $state(false);
	let error = $state('');
	let pathResult = $state<RelationshipPathDto | null>(null);

	$effect(() => {
		if (initialPersonA && !personA) {
			personA = initialPersonA;
			queryA = personLabel(initialPersonA);
		}
	});

	async function handleSearchA(q: string) {
		queryA = q;
		if (q.trim().length < 2) {
			resultsA = [];
			return;
		}
		try {
			const res = await searchApi.search(q, 1, 8);
			resultsA = res.persons;
		} catch {
			resultsA = [];
		}
	}

	async function handleSearchB(q: string) {
		queryB = q;
		if (q.trim().length < 2) {
			resultsB = [];
			return;
		}
		try {
			const res = await searchApi.search(q, 1, 8);
			resultsB = res.persons;
		} catch {
			resultsB = [];
		}
	}

	async function calculatePath() {
		if (!personA || !personB) return;
		loading = true;
		error = '';
		pathResult = null;
		try {
			pathResult = await treeApi.getRelationshipPath(personA.id, personB.id);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Error';
		} finally {
			loading = false;
		}
	}

	function translateRelStep(rel: string | null): string {
		if (!rel) return '';
		const key = `rel_${rel}` as const;
		return i18n.t(key as never);
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={onClose}>
	<div class="modal-card" onclick={(e) => e.stopPropagation()}>
		<div class="modal-header">
			<div>
				<h3 style="margin: 0; font-size: 1.05rem; font-weight: 800;">🧬 {i18n.t('kinshipTitle')}</h3>
				<p style="margin: 0.2rem 0 0; font-size: 0.8rem; color: var(--text-secondary);">
					{i18n.t('kinshipSubtitle')}
				</p>
			</div>
			<button type="button" class="btn btn-ghost btn-sm" onclick={onClose}>✕</button>
		</div>

		<div class="modal-body" style="display: flex; flex-direction: column; gap: 1rem;">
			<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
				<!-- Person A -->
				<div style="position: relative;">
					<label class="label" for="kin-a">{i18n.t('personALabel')}</label>
					<input
						id="kin-a"
						class="input"
						value={queryA}
						oninput={(e) => handleSearchA((e.currentTarget as HTMLInputElement).value)}
						placeholder={i18n.t('searchPlaceholder')}
					/>
					{#if resultsA.length > 0}
						<div class="autocomplete-menu">
							{#each resultsA as item (item.id)}
								<button
									type="button"
									class="autocomplete-item"
									onclick={() => {
										personA = item;
										queryA = personLabel(item);
										resultsA = [];
									}}
								>
									<span>{personLabel(item)}</span>
									<span style="font-size: 0.74rem; color: var(--text-muted);">{formatLifeYears(item)}</span>
								</button>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Person B -->
				<div style="position: relative;">
					<label class="label" for="kin-b">{i18n.t('personBLabel')}</label>
					<input
						id="kin-b"
						class="input"
						value={queryB}
						oninput={(e) => handleSearchB((e.currentTarget as HTMLInputElement).value)}
						placeholder={i18n.t('searchPlaceholder')}
					/>
					{#if resultsB.length > 0}
						<div class="autocomplete-menu">
							{#each resultsB as item (item.id)}
								<button
									type="button"
									class="autocomplete-item"
									onclick={() => {
										personB = item;
										queryB = personLabel(item);
										resultsB = [];
									}}
								>
									<span>{personLabel(item)}</span>
									<span style="font-size: 0.74rem; color: var(--text-muted);">{formatLifeYears(item)}</span>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<button
				type="button"
				class="btn btn-primary"
				disabled={!personA || !personB || loading}
				onclick={calculatePath}
			>
				🔍 {i18n.t('calculateKinshipBtn')}
			</button>

			{#if error}
				<div style="padding: 0.7rem; border-radius: var(--radius-md); background: rgba(239,68,68,0.14); color: var(--danger); font-size: 0.84rem;">
					{error}
				</div>
			{/if}

			{#if pathResult}
				{#if !pathResult.found}
					<div style="padding: 1rem; border-radius: var(--radius-md); background: var(--bg-elevated); text-align: center; color: var(--text-secondary);">
						{i18n.t('kinshipNotFound')}
					</div>
				{:else}
					<div style="padding: 0.9rem 1rem; border-radius: var(--radius-md); background: var(--accent-soft); border: 1px solid var(--border-strong); display: flex; flex-direction: column; gap: 0.45rem;">
						<div style="font-weight: 800; color: var(--accent); font-size: 0.95rem;">
							{i18n.t('kinshipFound', {
								distance: pathResult.distance,
								summary: (i18n.locale === 'fr' ? pathResult.summaryFr : pathResult.summaryEn) || ''
							})}
						</div>
						<div style="display: flex; flex-wrap: wrap; gap: 0.5rem; font-size: 0.78rem; color: var(--text-secondary);">
							{#if pathResult.consanguinityCoefficient !== undefined && pathResult.consanguinityCoefficient > 0}
								<span class="badge badge-accent">
									Coef. Consanguinité (Wright Φ) : {(pathResult.consanguinityCoefficient * 100).toFixed(3)}%
								</span>
								<span class="badge badge-success">
									Parenté génétique (R) : {((pathResult.relationshipCoefficient || 0) * 100).toFixed(2)}%
								</span>
							{/if}
							{#if pathResult.isImplex}
								<span class="badge badge-warning">
									🧬 Implex (Ancêtres multiples)
								</span>
							{/if}
						</div>
					</div>

					{#if pathResult.commonAncestors && pathResult.commonAncestors.length > 0}
						<div style="padding: 0.75rem; border-radius: var(--radius-md); background: var(--bg-elevated); border: 1px solid var(--border-subtle);">
							<div style="font-size: 0.76rem; font-weight: 800; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.45rem;">
								👑 Ancêtres communs les plus proches (MRCA : {pathResult.commonAncestors.length})
							</div>
							<div style="display: flex; flex-wrap: wrap; gap: 0.4rem;">
								{#each pathResult.commonAncestors as ca (ca.person.id)}
									<button
										type="button"
										class="btn btn-secondary btn-sm"
										onclick={() => {
											onFocusPerson(ca.person.id);
											onClose();
										}}
									>
										{personLabel(ca.person)} (+{ca.stepsFromA}G / +{ca.stepsFromB}G)
									</button>
								{/each}
							</div>
						</div>
					{/if}

					<div style="display: flex; flex-direction: column; gap: 0.45rem;">
						{#each pathResult.steps as step, idx (step.person.id + '-' + idx)}
							{#if step.relationFromPrev}
								<div style="padding-left: 1.25rem; font-size: 0.76rem; color: var(--accent); font-weight: 700;">
									↓ {translateRelStep(step.relationFromPrev)}
								</div>
							{/if}
							<button
								type="button"
								class="step-card"
								onclick={() => {
									onFocusPerson(step.person.id);
									onClose();
								}}
							>
								<div style="display: flex; align-items: center; gap: 0.65rem;">
									<span class="badge badge-accent">#{idx + 1}</span>
									<span style="font-weight: 700;">{personLabel(step.person)}</span>
								</div>
								<span style="font-size: 0.78rem; color: var(--text-secondary);">
									{formatLifeYears(step.person)}
								</span>
							</button>
						{/each}
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>

<style>
	.autocomplete-menu {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		z-index: 40;
		margin-top: 0.25rem;
		background: var(--bg-surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		max-height: 220px;
		overflow-y: auto;
	}

	.autocomplete-item {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.55rem 0.75rem;
		border: none;
		background: transparent;
		color: var(--text-primary);
		font-size: 0.83rem;
		cursor: pointer;
		text-align: left;
	}

	.autocomplete-item:hover {
		background: var(--accent-soft);
	}

	.step-card {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.65rem 0.85rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--border-subtle);
		background: var(--bg-elevated);
		color: var(--text-primary);
		cursor: pointer;
	}

	.step-card:hover {
		border-color: var(--accent);
	}
</style>
