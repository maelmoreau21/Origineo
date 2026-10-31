<script lang="ts">
	import {
		calculateAge,
		formatLifeYears,
		personApi,
		personLabel,
		type PersonDto
	} from '$lib/api';
	import { i18n } from '$lib/i18n/index.svelte';
	import { onMount } from 'svelte';

	let {
		onClose,
		onFocusPerson
	}: {
		onClose: () => void;
		onFocusPerson: (id: string) => void;
	} = $props();

	let activeTab = $state<'stats' | 'directory'>('stats');
	let allPersons = $state<PersonDto[]>([]);
	let loading = $state(true);
	let filterQuery = $state('');
	let sortBy = $state<'surname' | 'birth' | 'place'>('surname');

	onMount(async () => {
		loading = true;
		try {
			const res = await personApi.getAll(1, 500);
			allPersons = res.data;
		} catch {
			allPersons = [];
		} finally {
			loading = false;
		}
	});

	const stats = $derived.by(() => {
		const total = allPersons.length;
		let males = 0;
		let females = 0;
		let totalAge = 0;
		let ageCount = 0;
		let oldestPerson: { person: PersonDto; age: number } | null = null;

		const surnameCounts = new Map<string, number>();
		const placeCounts = new Map<string, number>();
		const centuryCounts = new Map<string, number>();

		for (const p of allPersons) {
			if (p.gender === 'MALE') males++;
			else if (p.gender === 'FEMALE') females++;

			const surname = (p.usageSurname || p.birthSurname || '').trim().toUpperCase();
			if (surname) {
				surnameCounts.set(surname, (surnameCounts.get(surname) || 0) + 1);
			}

			if (p.birthPlace) {
				const city = p.birthPlace.split(',')[0].trim();
				if (city) placeCounts.set(city, (placeCounts.get(city) || 0) + 1);
			}

			if (p.birthDate) {
				const yr = parseInt(p.birthDate.slice(0, 4), 10);
				if (!Number.isNaN(yr)) {
					const cent = `${Math.floor(yr / 100) + 1}e siècle`;
					centuryCounts.set(cent, (centuryCounts.get(cent) || 0) + 1);
				}
			}

			if (p.birthDate && p.deathDate) {
				const age = calculateAge(p.birthDate, p.deathDate);
				if (age !== null && age > 0 && age < 120) {
					totalAge += age;
					ageCount++;
					if (!oldestPerson || age > oldestPerson.age) {
						oldestPerson = { person: p, age };
					}
				}
			}
		}

		const topSurnames = Array.from(surnameCounts.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 6);

		const topPlaces = Array.from(placeCounts.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 6);

		const centuries = Array.from(centuryCounts.entries()).sort((a, b) => a[0].localeCompare(b[0]));

		return {
			total,
			males,
			females,
			avgLifespan: ageCount > 0 ? Math.round(totalAge / ageCount) : null,
			oldestPerson,
			topSurnames,
			topPlaces,
			centuries
		};
	});

	const filteredDirectory = $derived.by(() => {
		const q = filterQuery.trim().toLowerCase();
		const list = q
			? allPersons.filter(
					(p) =>
						p.givenNames.toLowerCase().includes(q) ||
						(p.usageSurname || '').toLowerCase().includes(q) ||
						(p.birthSurname || '').toLowerCase().includes(q) ||
						(p.birthPlace || '').toLowerCase().includes(q) ||
						(p.professions || []).some((pr) => pr.toLowerCase().includes(q))
				)
			: [...allPersons];

		list.sort((a, b) => {
			if (sortBy === 'birth') {
				return (a.birthDate || '9999').localeCompare(b.birthDate || '9999');
			}
			if (sortBy === 'place') {
				return (a.birthPlace || 'ZZZ').localeCompare(b.birthPlace || 'ZZZ');
			}
			const sA = (a.usageSurname || a.birthSurname || '').toUpperCase();
			const sB = (b.usageSurname || b.birthSurname || '').toUpperCase();
			return sA.localeCompare(sB) || a.givenNames.localeCompare(b.givenNames);
		});

		return list;
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={onClose}>
	<div class="modal-card" style="max-width: 920px; width: 95vw;" onclick={(e) => e.stopPropagation()}>
		<div class="modal-header">
			<div>
				<h3 style="margin: 0; font-size: 1.08rem; font-weight: 800;">
					{i18n.t('dirModalTitle')}
				</h3>
			</div>
			<button type="button" class="btn btn-ghost btn-sm" onclick={onClose}>✕</button>
		</div>

		<!-- Tabs -->
		<div style="display: flex; gap: 0.5rem; padding: 0.7rem 1.35rem; border-bottom: 1px solid var(--border-subtle); background: var(--bg-elevated);">
			<button
				type="button"
				class="btn btn-sm"
				class:btn-primary={activeTab === 'stats'}
				class:btn-secondary={activeTab !== 'stats'}
				onclick={() => (activeTab = 'stats')}
			>
				📊 {i18n.t('dirTabStats')}
			</button>
			<button
				type="button"
				class="btn btn-sm"
				class:btn-primary={activeTab === 'directory'}
				class:btn-secondary={activeTab !== 'directory'}
				onclick={() => (activeTab = 'directory')}
			>
				📖 {i18n.t('dirTabList')} ({allPersons.length})
			</button>
		</div>

		<div class="modal-body" style="max-height: 72vh; overflow-y: auto;">
			{#if loading}
				<p style="font-size: 0.85rem; color: var(--text-secondary);">Chargement des données…</p>
			{:else if activeTab === 'stats'}
				<!-- KPI Cards -->
				<div class="kpi-grid">
					<div class="kpi-card">
						<div class="kpi-label">{i18n.t('statTotalPersons')}</div>
						<div class="kpi-val mono">{stats.total}</div>
					</div>
					<div class="kpi-card">
						<div class="kpi-label">{i18n.t('statGenderSplit')}</div>
						<div class="kpi-val mono" style="font-size: 1.15rem;">
							<span style="color: var(--color-male);">{stats.males} ♂</span>
							<span style="color: var(--text-muted);">/</span>
							<span style="color: var(--color-female);">{stats.females} ♀</span>
						</div>
					</div>
					<div class="kpi-card">
						<div class="kpi-label">{i18n.t('statAvgLifespan')}</div>
						<div class="kpi-val mono">
							{stats.avgLifespan !== null ? `${stats.avgLifespan} ans` : '—'}
						</div>
					</div>
					<div class="kpi-card">
						<div class="kpi-label">{i18n.t('statOldestPerson')}</div>
						{#if stats.oldestPerson}
							<div style="font-weight: 800; font-size: 0.86rem; margin-top: 0.25rem;">
								{personLabel(stats.oldestPerson.person)}
							</div>
							<div class="mono" style="font-size: 0.78rem; color: var(--accent);">
								{stats.oldestPerson.age} ans
							</div>
						{:else}
							<div class="kpi-val">—</div>
						{/if}
					</div>
				</div>

				<!-- Top Surnames & Top Places -->
				<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
					<div class="stat-panel">
						<h4>{i18n.t('statTopSurnames')}</h4>
						<div class="bar-list">
							{#each stats.topSurnames as [surname, cnt]}
								<div class="bar-item">
									<span style="font-weight: 700;">{surname}</span>
									<span class="badge badge-accent mono">{cnt}</span>
								</div>
							{/each}
						</div>
					</div>

					<div class="stat-panel">
						<h4>{i18n.t('statTopPlaces')}</h4>
						<div class="bar-list">
							{#each stats.topPlaces as [place, cnt]}
								<div class="bar-item">
									<span style="font-weight: 600;">{place}</span>
									<span class="badge badge-success mono">{cnt}</span>
								</div>
							{/each}
						</div>
					</div>
				</div>
			{:else}
				<!-- Complete Filterable & Sortable Directory -->
				<div style="display: flex; gap: 0.65rem; flex-wrap: wrap; margin-bottom: 0.5rem;">
					<input
						class="input"
						style="flex: 1; min-width: 240px;"
						placeholder={i18n.t('dirSearchPlaceholder')}
						bind:value={filterQuery}
					/>
					<select class="select" style="width: auto;" bind:value={sortBy}>
						<option value="surname">{i18n.t('dirSortName')}</option>
						<option value="birth">{i18n.t('dirSortBirth')}</option>
						<option value="place">{i18n.t('dirSortPlace')}</option>
					</select>
				</div>

				<div class="dir-table">
					{#each filteredDirectory as p (p.id)}
						<button
							type="button"
							class="dir-row"
							onclick={() => {
								onFocusPerson(p.id);
								onClose();
							}}
						>
							<div style="display: flex; align-items: center; gap: 0.65rem; min-width: 0; flex: 1;">
								<span
									class="gender-dot"
									class:male={p.gender === 'MALE'}
									class:female={p.gender === 'FEMALE'}
								></span>
								<div style="min-width: 0;">
									<div style="font-weight: 700; font-size: 0.85rem;">{personLabel(p)}</div>
									{#if p.professions && p.professions.length > 0}
										<div style="font-size: 0.72rem; color: var(--text-muted);">
											{p.professions.join(', ')}
										</div>
									{/if}
								</div>
							</div>

							<div style="display: flex; align-items: center; gap: 0.75rem; font-size: 0.77rem; color: var(--text-secondary);">
								{#if p.birthPlace}
									<span>{p.birthPlace.split(',')[0]}</span>
								{/if}
								<span class="mono">{formatLifeYears(p) || '—'}</span>
							</div>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.kpi-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.75rem;
	}

	.kpi-card {
		padding: 0.9rem 1rem;
		border-radius: var(--radius-md);
		background: var(--bg-elevated);
		border: 1px solid var(--border-subtle);
	}

	.kpi-label {
		font-size: 0.7rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
	}

	.kpi-val {
		font-size: 1.45rem;
		font-weight: 800;
		color: var(--text-primary);
		margin-top: 0.25rem;
	}

	.stat-panel {
		padding: 1rem;
		border-radius: var(--radius-md);
		background: var(--bg-elevated);
		border: 1px solid var(--border-subtle);
	}

	.stat-panel h4 {
		margin: 0 0 0.7rem;
		font-size: 0.76rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-secondary);
	}

	.bar-list {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.bar-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.45rem 0.65rem;
		border-radius: var(--radius-xs);
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		font-size: 0.82rem;
	}

	.dir-table {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.dir-row {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.6rem 0.85rem;
		border-radius: var(--radius-sm);
		background: var(--bg-elevated);
		border: 1px solid var(--border-subtle);
		color: var(--text-primary);
		text-align: left;
		cursor: pointer;
		transition: border-color 0.14s ease;
	}

	.dir-row:hover {
		border-color: var(--accent);
	}

	.gender-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-other);
		flex-shrink: 0;
	}

	.gender-dot.male {
		background: var(--color-male);
	}

	.gender-dot.female {
		background: var(--color-female);
	}
</style>
