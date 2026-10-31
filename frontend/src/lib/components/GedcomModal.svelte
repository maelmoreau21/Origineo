<script lang="ts">
	import {
		type PersonDto,
		gedcomApi,
		personLabel,
		formatLifeYears
	} from '$lib/api';
	import { i18n } from '$lib/i18n/index.svelte';

	let {
		currentFocusPerson = null,
		onClose,
		onImported
	}: {
		currentFocusPerson?: PersonDto | null;
		onClose: () => void;
		onImported: () => void;
	} = $props();

	let activeTab = $state<'import' | 'export'>('import');
	let selectedFile = $state<File | null>(null);
	let busy = $state(false);
	let statusMessage = $state('');
	let errorMessage = $state('');

	// Selective Merge Analysis State
	type AnalysisResult = Awaited<ReturnType<typeof gedcomApi.analyzeMerge>>;
	let analysis = $state<AnalysisResult | null>(null);
	let dupActions = $state<Record<string, 'merge' | 'create' | 'skip'>>({});
	let selectedNewPointers = $state<Record<string, boolean>>({});
	let filterNewQuery = $state('');

	// Export Partial Branch State
	let exportBranchOnly = $state(false);
	let exportAncestors = $state(3);
	let exportDescendants = $state(3);

	function handleFileChange(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		selectedFile = input.files?.[0] || null;
		analysis = null;
		statusMessage = '';
		errorMessage = '';
	}

	async function handleDirectImport() {
		if (!selectedFile) return;
		busy = true;
		errorMessage = '';
		statusMessage = '';
		try {
			const res = await gedcomApi.importFull(selectedFile);
			statusMessage = `Import terminé : ${res.personsCreated} personnes, ${res.unionsCreated} unions, ${res.relationshipsCreated} liens créés.`;
			onImported();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Import failed';
		} finally {
			busy = false;
		}
	}

	async function handleAnalyzeSelective() {
		if (!selectedFile) return;
		busy = true;
		errorMessage = '';
		statusMessage = '';
		try {
			const res = await gedcomApi.analyzeMerge(selectedFile);
			analysis = res;

			const dMap: Record<string, 'merge' | 'create' | 'skip'> = {};
			for (const d of res.duplicates) {
				const scorePct = d.confidence <= 1 ? d.confidence * 100 : d.confidence;
				dMap[d.stagedPointer] = scorePct >= 75 ? 'merge' : 'create';
			}
			dupActions = dMap;

			const nMap: Record<string, boolean> = {};
			for (const np of res.newPersons) {
				nMap[np.pointer] = true;
			}
			selectedNewPointers = nMap;
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Analyze failed';
		} finally {
			busy = false;
		}
	}

	function toggleAllNew(val: boolean) {
		if (!analysis) return;
		const next = { ...selectedNewPointers };
		for (const np of filteredNewPersons) {
			next[np.pointer] = val;
		}
		selectedNewPointers = next;
	}

	const filteredNewPersons = $derived.by(() => {
		if (!analysis) return [];
		const q = filterNewQuery.trim().toLowerCase();
		if (!q) return analysis.newPersons;
		return analysis.newPersons.filter(
			(p) =>
				p.givenNames.toLowerCase().includes(q) ||
				p.surname.toLowerCase().includes(q) ||
				(p.birthPlace && p.birthPlace.toLowerCase().includes(q)) ||
				(p.birthDate && p.birthDate.includes(q))
		);
	});

	const selectedCount = $derived.by(() => {
		if (!analysis) return 0;
		let count = 0;
		for (const d of analysis.duplicates) {
			if (dupActions[d.stagedPointer] !== 'skip') count++;
		}
		for (const np of analysis.newPersons) {
			if (selectedNewPointers[np.pointer]) count++;
		}
		return count;
	});

	async function handleApplySelective() {
		if (!analysis) return;
		busy = true;
		errorMessage = '';
		statusMessage = '';
		try {
			const decisions: {
				stagedPointer: string;
				action: 'merge' | 'create' | 'skip';
				mergeIntoPersonId?: string;
			}[] = [];

			for (const d of analysis.duplicates) {
				const act = dupActions[d.stagedPointer] || 'merge';
				decisions.push({
					stagedPointer: d.stagedPointer,
					action: act,
					mergeIntoPersonId: act === 'merge' ? d.existingPersonId : undefined
				});
			}

			for (const np of analysis.newPersons) {
				decisions.push({
					stagedPointer: np.pointer,
					action: selectedNewPointers[np.pointer] ? 'create' : 'skip'
				});
			}

			const res = await gedcomApi.applyMerge(analysis.sessionId, decisions);
			statusMessage = `Import sélectif appliqué : ${res.personsCreated} créés, ${res.personsMerged} fusionnés, ${res.personsSkipped} ignorés.`;
			analysis = null;
			onImported();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Apply merge failed';
		} finally {
			busy = false;
		}
	}

	const exportHref = $derived.by(() => {
		if (exportBranchOnly && currentFocusPerson) {
			return gedcomApi.exportUrl({
				rootPersonId: currentFocusPerson.id,
				ancestors: exportAncestors,
				descendants: exportDescendants
			});
		}
		return gedcomApi.exportUrl();
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={onClose}>
	<div class="modal-card" style="max-width: 820px;" onclick={(e) => e.stopPropagation()}>
		<div class="modal-header">
			<h3 style="margin: 0; font-size: 1.05rem; font-weight: 800;">
				📦 {i18n.t('gedcomModalTitle')}
			</h3>
			<button type="button" class="btn btn-ghost btn-sm" onclick={onClose}>✕</button>
		</div>

		<!-- Tabs -->
		<div style="display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid var(--border-subtle);">
			<button
				type="button"
				class="tab-btn"
				class:active={activeTab === 'import'}
				onclick={() => (activeTab = 'import')}
			>
				📥 {i18n.t('gedcomTabImport')}
			</button>
			<button
				type="button"
				class="tab-btn"
				class:active={activeTab === 'export'}
				onclick={() => (activeTab = 'export')}
			>
				📤 {i18n.t('gedcomTabExport')}
			</button>
		</div>

		<div class="modal-body" style="display: flex; flex-direction: column; gap: 1rem;">
			{#if statusMessage}
				<div class="alert alert-success">{statusMessage}</div>
			{/if}
			{#if errorMessage}
				<div class="alert alert-error">{errorMessage}</div>
			{/if}

			{#if activeTab === 'import'}
				<div class="section-box">
					<label class="label" for="ged-file">Fichier GEDCOM (.ged)</label>
					<input
						id="ged-file"
						type="file"
						accept=".ged,text/plain"
						class="input"
						onchange={handleFileChange}
					/>

					<div style="display: flex; flex-wrap: wrap; gap: 0.65rem; margin-top: 0.85rem;">
						<button
							type="button"
							class="btn btn-primary"
							disabled={!selectedFile || busy}
							onclick={handleAnalyzeSelective}
						>
							🔍 {i18n.t('analyzeGedcomBtn')}
						</button>
						<button
							type="button"
							class="btn btn-secondary"
							disabled={!selectedFile || busy}
							onclick={handleDirectImport}
						>
							⚡ {i18n.t('directImportBtn')}
						</button>
					</div>
					<p style="margin: 0.5rem 0 0; font-size: 0.78rem; color: var(--text-secondary);">
						{i18n.t('gedcomSelectiveDesc')}
					</p>
				</div>

				{#if analysis}
					<!-- Duplicates Section -->
					{#if analysis.duplicates.length > 0}
						<div class="section-box">
							<h4 style="margin: 0 0 0.65rem; font-size: 0.9rem;">
								⚠️ {i18n.t('duplicatesDetected', { count: analysis.duplicates.length })}
							</h4>
							<div style="display: flex; flex-direction: column; gap: 0.55rem; max-height: 220px; overflow-y: auto;">
								{#each analysis.duplicates as dup (dup.stagedPointer)}
									<div class="dup-row">
										<div style="min-width: 0; flex: 1;">
											<div style="font-size: 0.84rem; font-weight: 700;">
												{dup.staged.givenNames} {dup.staged.surname}
												<span class="badge badge-warning" style="margin-left: 0.4rem;">
													{dup.confidence <= 1 ? Math.round(dup.confidence * 100) : Math.round(dup.confidence)}%
												</span>
											</div>
											<div style="font-size: 0.75rem; color: var(--text-secondary);">
												Existant : {personLabel(dup.existingPerson)} ({formatLifeYears(dup.existingPerson)})
											</div>
										</div>
										<select
											class="select"
											style="width: 210px;"
											bind:value={dupActions[dup.stagedPointer]}
										>
											<option value="merge">{i18n.t('actionMerge')}</option>
											<option value="create">{i18n.t('actionCreate')}</option>
											<option value="skip">{i18n.t('actionSkip')}</option>
										</select>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- New Persons Checkboxes for Partial/Selective Import -->
					<div class="section-box">
						<div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.5rem; margin-bottom: 0.65rem;">
							<h4 style="margin: 0; font-size: 0.9rem;">
								✨ {i18n.t('newPersonsDetected', { count: analysis.newPersons.length })}
							</h4>
							<div style="display: flex; gap: 0.4rem;">
								<button type="button" class="btn btn-secondary btn-sm" onclick={() => toggleAllNew(true)}>
									{i18n.t('selectAllNew')}
								</button>
								<button type="button" class="btn btn-secondary btn-sm" onclick={() => toggleAllNew(false)}>
									{i18n.t('deselectAllNew')}
								</button>
							</div>
						</div>

						<input
							class="input"
							style="margin-bottom: 0.6rem;"
							placeholder="Filtrer les personnes du fichier GEDCOM (nom, lieu, année)..."
							bind:value={filterNewQuery}
						/>

						<div style="display: flex; flex-direction: column; gap: 0.35rem; max-height: 230px; overflow-y: auto;">
							{#each filteredNewPersons as np (np.pointer)}
								<label class="new-person-row">
									<input type="checkbox" bind:checked={selectedNewPointers[np.pointer]} />
									<span style="font-weight: 600; font-size: 0.84rem;">
										{np.givenNames} {np.surname.toUpperCase()}
									</span>
									<span style="font-size: 0.75rem; color: var(--text-muted); margin-left: auto;">
										{np.birthDate || ''} {np.birthPlace ? `• ${np.birthPlace}` : ''}
									</span>
								</label>
							{/each}
						</div>
					</div>

					<button
						type="button"
						class="btn btn-primary"
						disabled={busy}
						onclick={handleApplySelective}
					>
						✅ {i18n.t('applySelectiveBtn', { count: selectedCount })}
					</button>
				{/if}
			{:else}
				<!-- Export Tab -->
				<div class="section-box" style="display: flex; flex-direction: column; gap: 0.85rem;">
					<label style="display: flex; align-items: center; gap: 0.55rem; font-weight: 600; cursor: pointer;">
						<input
							type="radio"
							name="exportMode"
							checked={!exportBranchOnly}
							onchange={() => (exportBranchOnly = false)}
						/>
						<span>{i18n.t('exportFullTitle')}</span>
					</label>

					{#if currentFocusPerson}
						<label style="display: flex; align-items: center; gap: 0.55rem; font-weight: 600; cursor: pointer;">
							<input
								type="radio"
								name="exportMode"
								checked={exportBranchOnly}
								onchange={() => (exportBranchOnly = true)}
							/>
							<span>
								{i18n.t('exportBranchTitle')} : <strong>{personLabel(currentFocusPerson)}</strong>
							</span>
						</label>

						{#if exportBranchOnly}
							<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; padding-left: 1.5rem;">
								<div>
									<label class="label" for="exp-anc">
										{i18n.t('ancestorsLabel', { count: exportAncestors })}
									</label>
									<input
										id="exp-anc"
										type="range"
										min="0"
										max="12"
										bind:value={exportAncestors}
										style="width: 100%;"
									/>
								</div>
								<div>
									<label class="label" for="exp-desc">
										{i18n.t('descendantsLabel', { count: exportDescendants })}
									</label>
									<input
										id="exp-desc"
										type="range"
										min="0"
										max="12"
										bind:value={exportDescendants}
										style="width: 100%;"
									/>
								</div>
							</div>
						{/if}
					{/if}

					<div style="padding-top: 0.5rem;">
						<a href={exportHref} class="btn btn-primary" download>
							⬇ {i18n.t('exportBtn')}
						</a>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.tab-btn {
		padding: 0.75rem 1rem;
		border: none;
		border-bottom: 2px solid transparent;
		background: var(--bg-surface);
		color: var(--text-secondary);
		font-weight: 700;
		font-size: 0.85rem;
		cursor: pointer;
	}

	.tab-btn.active {
		color: var(--accent);
		border-bottom-color: var(--accent);
	}

	.section-box {
		padding: 1rem;
		border-radius: var(--radius-md);
		background: var(--bg-elevated);
		border: 1px solid var(--border-subtle);
	}

	.dup-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.55rem 0.75rem;
		border-radius: var(--radius-sm);
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
	}

	.new-person-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.45rem 0.65rem;
		border-radius: var(--radius-sm);
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		cursor: pointer;
	}

	.alert {
		padding: 0.65rem 0.85rem;
		border-radius: var(--radius-md);
		font-size: 0.84rem;
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
