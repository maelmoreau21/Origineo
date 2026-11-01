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
	let fileInputEl = $state<HTMLInputElement | null>(null);
	let isDragging = $state(false);
	let busy = $state(false);
	let statusMessage = $state('');
	let errorMessage = $state('');

	// Client-side quick inspection of GEDCOM header
	interface GedcomHeaderMeta {
		source?: string;
		version?: string;
		charset?: string;
		date?: string;
		lineCount?: number;
	}
	let headerMeta = $state<GedcomHeaderMeta | null>(null);

	// Import Options / Parameters
	let encodingOption = $state<'auto' | 'UTF-8' | 'WINDOWS-1252' | 'ANSEL'>('auto');
	let forceUppercaseSurnames = $state(true);
	let hideLivingContemporaries = $state(false);
	let showAdvancedOptions = $state(false);

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

	function formatBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	}

	function processFile(file: File) {
		if (!file.name.toLowerCase().endsWith('.ged') && !file.type.includes('text')) {
			errorMessage = 'Le fichier doit être au format GEDCOM (.ged).';
			return;
		}

		selectedFile = file;
		analysis = null;
		statusMessage = '';
		errorMessage = '';
		headerMeta = null;

		// Fast read first 8KB to extract header info
		const slice = file.slice(0, 8192);
		const reader = new FileReader();
		reader.onload = (e) => {
			const text = e.target?.result as string;
			if (!text) return;
			const meta: GedcomHeaderMeta = {};
			const lines = text.split(/\r?\n/);
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i].trim();
				if (line.startsWith('1 SOUR ')) {
					meta.source = line.substring(7);
				} else if (line.startsWith('2 VERS ') && meta.source && !meta.source.includes('v')) {
					meta.source += ` (${line.substring(7)})`;
				} else if (line.startsWith('1 GEDC')) {
					const next = lines[i + 1]?.trim();
					if (next && next.startsWith('2 VERS ')) {
						meta.version = next.substring(7);
					}
				} else if (line.startsWith('1 CHAR ')) {
					meta.charset = line.substring(7);
				} else if (line.startsWith('1 DATE ')) {
					meta.date = line.substring(7);
				}
			}
			headerMeta = meta;
		};
		reader.readAsText(slice);
	}

	function handleFileChange(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			processFile(file);
		}
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isDragging = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
		const file = e.dataTransfer?.files?.[0];
		if (file) {
			processFile(file);
		}
	}

	function clearSelectedFile(e: MouseEvent) {
		e.stopPropagation();
		selectedFile = null;
		analysis = null;
		headerMeta = null;
		statusMessage = '';
		errorMessage = '';
		if (fileInputEl) fileInputEl.value = '';
	}

	async function handleDirectImport() {
		if (!selectedFile) return;
		busy = true;
		errorMessage = '';
		statusMessage = '';
		try {
			const res = await gedcomApi.importFull(selectedFile);
			statusMessage = `Import terminé avec succès : ${res.personsCreated} personnes, ${res.unionsCreated} unions, ${res.relationshipsCreated} liens de parenté créés.`;
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

	function setAllDuplicatesAction(act: 'merge' | 'create' | 'skip') {
		if (!analysis) return;
		const next = { ...dupActions };
		for (const d of analysis.duplicates) {
			next[d.stagedPointer] = act;
		}
		dupActions = next;
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
	<div class="modal-card" style="max-width: 840px;" onclick={(e) => e.stopPropagation()}>
		<div class="modal-header">
			<div style="display: flex; align-items: center; gap: 0.65rem;">
				<div class="modal-icon-badge">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
						<polyline points="14 2 14 8 20 8" />
						<line x1="12" y1="18" x2="12" y2="12" />
						<line x1="9" y1="15" x2="15" y2="15" />
					</svg>
				</div>
				<div>
					<h3 style="margin: 0; font-size: 1.05rem; font-weight: 800;">
						{i18n.t('gedcomModalTitle')}
					</h3>
					<div style="font-size: 0.74rem; color: var(--text-secondary);">
						Format standard généalogique · Compatible Heredis, Geneanet, Gramps, FTM
					</div>
				</div>
			</div>
			<button type="button" class="btn btn-ghost btn-sm" onclick={onClose} aria-label="Fermer">✕</button>
		</div>

		<!-- Tabs -->
		<div class="tabs-nav">
			<button
				type="button"
				class="tab-btn"
				class:active={activeTab === 'import'}
				onclick={() => (activeTab = 'import')}
			>
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<polyline points="7 10 12 15 17 10" />
					<line x1="12" y1="15" x2="12" y2="3" />
				</svg>
				<span>{i18n.t('gedcomTabImport')}</span>
			</button>
			<button
				type="button"
				class="tab-btn"
				class:active={activeTab === 'export'}
				onclick={() => (activeTab = 'export')}
			>
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<polyline points="17 8 12 3 7 8" />
					<line x1="12" y1="3" x2="12" y2="15" />
				</svg>
				<span>{i18n.t('gedcomTabExport')}</span>
			</button>
		</div>

		<div class="modal-body" style="display: flex; flex-direction: column; gap: 1rem;">
			{#if statusMessage}
				<div class="alert alert-success">
					<span style="font-weight: 700;">✓</span> {statusMessage}
				</div>
			{/if}
			{#if errorMessage}
				<div class="alert alert-error">
					<span style="font-weight: 700;">⚠</span> {errorMessage}
				</div>
			{/if}

			{#if activeTab === 'import'}
				<!-- Modern Upload Dropzone -->
				<input
					bind:this={fileInputEl}
					type="file"
					accept=".ged,text/plain"
					style="display: none;"
					onchange={handleFileChange}
				/>

				{#if !selectedFile}
					<!-- Empty Dropzone State -->
					<div
						class="dropzone-box"
						class:dragging={isDragging}
						ondragover={handleDragOver}
						ondragleave={handleDragLeave}
						ondrop={handleDrop}
						onclick={() => fileInputEl?.click()}
					>
						<div class="dropzone-icon">
							<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
								<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
								<path d="M12 12v9" />
								<path d="m8 16 4-4 4 4" />
							</svg>
						</div>
						<div class="dropzone-title">
							Glissez et déposez votre fichier <strong>.ged</strong> ici
						</div>
						<div class="dropzone-sub">
							ou <span class="dropzone-browse">parcourez vos dossiers</span> pour sélectionner un fichier
						</div>
						<div class="dropzone-meta-tags">
							<span class="meta-tag">GEDCOM 5.5 / 5.5.1 / 7.0</span>
							<span class="meta-tag">Jusqu'à 100 000 individus</span>
							<span class="meta-tag">Encodage UTF-8 & ANSI</span>
						</div>
					</div>
				{:else}
					<!-- Selected File Preview Card -->
					<div class="file-card">
						<div class="file-card-main">
							<div class="file-badge">.GED</div>
							<div style="min-width: 0; flex: 1;">
								<div class="file-name" title={selectedFile.name}>
									{selectedFile.name}
								</div>
								<div class="file-size-row">
									<span>{formatBytes(selectedFile.size)}</span>
									{#if headerMeta?.charset}
										<span class="meta-dot">·</span>
										<span class="tag-badge">{headerMeta.charset}</span>
									{/if}
									{#if headerMeta?.version}
										<span class="meta-dot">·</span>
										<span>GEDCOM {headerMeta.version}</span>
									{/if}
								</div>
							</div>
							<div style="display: flex; gap: 0.4rem; align-items: center;">
								<button
									type="button"
									class="btn btn-secondary btn-sm"
									onclick={() => fileInputEl?.click()}
								>
									Changer
								</button>
								<button
									type="button"
									class="btn btn-ghost btn-sm btn-icon"
									onclick={clearSelectedFile}
									title="Supprimer la sélection"
								>
									✕
								</button>
							</div>
						</div>

						<!-- Header Quick Insights -->
						{#if headerMeta && (headerMeta.source || headerMeta.date)}
							<div class="file-insights">
								{#if headerMeta.source}
									<div class="insight-item">
										<span class="insight-label">Logiciel source :</span>
										<span class="insight-val">{headerMeta.source}</span>
									</div>
								{/if}
								{#if headerMeta.date}
									<div class="insight-item">
										<span class="insight-label">Date d'export :</span>
										<span class="insight-val">{headerMeta.date}</span>
									</div>
								{/if}
							</div>
						{/if}
					</div>

					<!-- Advanced Import Settings Accordion -->
					<div class="settings-box">
						<button
							type="button"
							class="settings-toggle-btn"
							onclick={() => (showAdvancedOptions = !showAdvancedOptions)}
						>
							<div style="display: flex; align-items: center; gap: 0.5rem;">
								<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<circle cx="12" cy="12" r="3" />
									<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
								</svg>
								<span style="font-weight: 700; font-size: 0.83rem;">Paramètres & Options d'importation</span>
							</div>
							<span style="font-size: 0.8rem; color: var(--text-muted);">
								{showAdvancedOptions ? 'Masquer ▲' : 'Personnaliser ▼'}
							</span>
						</button>

						{#if showAdvancedOptions}
							<div class="settings-content">
								<div class="form-grid">
									<div>
										<label class="label" for="enc-select">Jeu de caractères / Encodage</label>
										<select id="enc-select" class="select" bind:value={encodingOption}>
											<option value="auto">Détection automatique ({headerMeta?.charset || 'Standard'})</option>
											<option value="UTF-8">Forcer UTF-8 (Universel)</option>
											<option value="WINDOWS-1252">Forcer Windows-1252 / ANSI (Vieux exports français)</option>
											<option value="ANSEL">Forcer ANSEL (Généalogique historique)</option>
										</select>
									</div>

									<div>
										<label class="label" for="surname-opt">Standardisation des patronymes</label>
										<label class="checkbox-row" for="surname-opt">
											<input
												id="surname-opt"
												type="checkbox"
												bind:checked={forceUppercaseSurnames}
											/>
											<span style="font-size: 0.82rem;">Passer les noms de famille en MAJUSCULES (ex: MARTIN)</span>
										</label>
									</div>
								</div>

								<div style="margin-top: 0.75rem;">
									<label class="checkbox-row">
										<input
											type="checkbox"
											bind:checked={hideLivingContemporaries}
										/>
										<span style="font-size: 0.82rem;">
											Confidentialité : masquer les données privées des contemporains (&lt; 100 ans)
										</span>
									</label>
								</div>
							</div>
						{/if}
					</div>

					<!-- Action Buttons -->
					<div class="actions-card">
						<div class="actions-buttons">
							<button
								type="button"
								class="btn btn-primary"
								style="flex: 1.3;"
								disabled={busy}
								onclick={handleAnalyzeSelective}
							>
								{#if busy}
									<span class="spinner-mini"></span>
									<span>Traitement en cours...</span>
								{:else}
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
										<circle cx="11" cy="11" r="8" />
										<line x1="21" y1="21" x2="16.65" y2="16.65" />
									</svg>
									<span>{i18n.t('analyzeGedcomBtn')}</span>
									<span class="badge badge-accent mono" style="margin-left: 0.35rem; font-size: 0.65rem;">Recommandé</span>
								{/if}
							</button>

							<button
								type="button"
								class="btn btn-secondary"
								style="flex: 1;"
								disabled={busy}
								onclick={handleDirectImport}
								title="Importe tous les individus directement sans passer par l'étape de fusion guidée"
							>
								<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
									<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
								</svg>
								<span>{i18n.t('directImportBtn')}</span>
							</button>
						</div>
						<p class="actions-hint">
							{i18n.t('gedcomSelectiveDesc')}
						</p>
					</div>
				{/if}

				{#if analysis}
					<!-- Duplicates Section -->
					{#if analysis.duplicates.length > 0}
						<div class="section-box">
							<div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.5rem; margin-bottom: 0.65rem;">
								<h4 style="margin: 0; font-size: 0.9rem; display: flex; align-items: center; gap: 0.4rem;">
									<span>⚠️</span>
									<span>{i18n.t('duplicatesDetected', { count: analysis.duplicates.length })}</span>
								</h4>
								<div style="display: flex; gap: 0.35rem;">
									<button type="button" class="btn btn-secondary btn-sm" onclick={() => setAllDuplicatesAction('merge')}>
										⚡ Tout fusionner
									</button>
									<button type="button" class="btn btn-secondary btn-sm" onclick={() => setAllDuplicatesAction('create')}>
										➕ Tout créer
									</button>
									<button type="button" class="btn btn-secondary btn-sm" onclick={() => setAllDuplicatesAction('skip')}>
										🚫 Tout ignorer
									</button>
								</div>
							</div>

							<div style="display: flex; flex-direction: column; gap: 0.65rem; max-height: 280px; overflow-y: auto;">
								{#each analysis.duplicates as dup (dup.stagedPointer)}
									<div class="dup-row" style="flex-direction: column; align-items: stretch; gap: 0.5rem;">
										<div style="display: flex; justify-content: space-between; align-items: center; gap: 0.6rem;">
											<div>
												<span style="font-size: 0.88rem; font-weight: 800; color: var(--text-primary);">
													{dup.staged.givenNames} {dup.staged.surname}
												</span>
												<span class="badge badge-warning" style="margin-left: 0.4rem;">
													{dup.confidence <= 1 ? Math.round(dup.confidence * 100) : Math.round(dup.confidence)}% similarité
												</span>
											</div>

											<select
												class="select"
												style="width: 220px; font-weight: 700; height: 32px;"
												bind:value={dupActions[dup.stagedPointer]}
											>
												<option value="merge">⚡ {i18n.t('actionMerge')}</option>
												<option value="create">➕ {i18n.t('actionCreate')}</option>
												<option value="skip">🚫 {i18n.t('actionSkip')}</option>
											</select>
										</div>

										<!-- Side-by-side comparison Diff -->
										<div class="diff-grid">
											<div class="diff-col file">
												<span class="diff-tag">Fichier GEDCOM</span>
												<div><strong>Dates :</strong> {dup.staged.birthDate || '—'} → {dup.staged.deathDate || '—'}</div>
												<div><strong>Lieux :</strong> {dup.staged.birthPlace || '—'}</div>
											</div>
											<div class="diff-col db">
												<span class="diff-tag">Base existante</span>
												<div><strong>Dates :</strong> {dup.existingPerson.birthDate || '—'} → {dup.existingPerson.deathDate || '—'}</div>
												<div><strong>Lieux :</strong> {dup.existingPerson.birthPlace || '—'}</div>
											</div>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- New Persons Checkboxes for Partial/Selective Import -->
					<div class="section-box">
						<div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.5rem; margin-bottom: 0.65rem;">
							<h4 style="margin: 0; font-size: 0.9rem; display: flex; align-items: center; gap: 0.4rem;">
								<span>✨</span>
								<span>{i18n.t('newPersonsDetected', { count: analysis.newPersons.length })}</span>
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
										{np.givenNames} {forceUppercaseSurnames ? np.surname.toUpperCase() : np.surname}
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

	.tabs-nav {
		display: grid;
		grid-template-columns: 1fr 1fr;
		border-bottom: 1px solid var(--border-subtle);
		background: var(--bg-surface);
	}

	.tab-btn {
		padding: 0.8rem 1rem;
		border: none;
		border-bottom: 2px solid transparent;
		background: transparent;
		color: var(--text-secondary);
		font-weight: 700;
		font-size: 0.85rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		transition: all 0.14s ease;
	}

	.tab-btn:hover {
		color: var(--text-primary);
		background: var(--bg-elevated);
	}

	.tab-btn.active {
		color: var(--accent);
		border-bottom-color: var(--accent);
		background: var(--bg-surface);
	}

	/* ─── Modern Dropzone ─────────────────────────────────────────────────── */
	.dropzone-box {
		padding: 2.2rem 1.5rem;
		border-radius: var(--radius-lg);
		border: 2px dashed var(--border-color);
		background: linear-gradient(180deg, var(--bg-primary), var(--bg-elevated));
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		cursor: pointer;
		transition: all 0.18s ease;
	}

	.dropzone-box:hover,
	.dropzone-box.dragging {
		border-color: var(--accent);
		background: var(--accent-soft);
		box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.12);
		transform: translateY(-1px);
	}

	.dropzone-icon {
		width: 60px;
		height: 60px;
		border-radius: 16px;
		background: var(--bg-surface);
		border: 1px solid var(--border-color);
		color: var(--accent);
		display: grid;
		place-items: center;
		margin-bottom: 0.85rem;
		box-shadow: var(--shadow-sm);
	}

	.dropzone-title {
		font-size: 1rem;
		font-weight: 700;
		color: var(--text-primary);
		margin-bottom: 0.25rem;
	}

	.dropzone-sub {
		font-size: 0.82rem;
		color: var(--text-secondary);
		margin-bottom: 1.1rem;
	}

	.dropzone-browse {
		color: var(--accent);
		font-weight: 700;
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.dropzone-meta-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		justify-content: center;
	}

	.meta-tag {
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--text-muted);
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		padding: 0.2rem 0.55rem;
		border-radius: 999px;
	}

	/* ─── File Card ───────────────────────────────────────────────────────── */
	.file-card {
		padding: 1rem 1.1rem;
		border-radius: var(--radius-md);
		background: var(--bg-elevated);
		border: 1px solid var(--border-color);
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.file-card-main {
		display: flex;
		align-items: center;
		gap: 0.85rem;
	}

	.file-badge {
		font-family: var(--font-mono, monospace);
		font-size: 0.75rem;
		font-weight: 800;
		background: var(--accent);
		color: #ffffff;
		padding: 0.35rem 0.55rem;
		border-radius: 6px;
		letter-spacing: 0.05em;
	}

	.file-name {
		font-weight: 700;
		font-size: 0.92rem;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.file-size-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.76rem;
		color: var(--text-secondary);
		margin-top: 0.15rem;
	}

	.meta-dot {
		color: var(--text-muted);
	}

	.tag-badge {
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		padding: 0.05rem 0.35rem;
		border-radius: 4px;
		font-family: var(--font-mono, monospace);
		font-size: 0.68rem;
		font-weight: 700;
	}

	.file-insights {
		display: flex;
		flex-wrap: wrap;
		gap: 1.2rem;
		padding-top: 0.65rem;
		border-top: 1px dashed var(--border-subtle);
		font-size: 0.78rem;
	}

	.insight-item {
		display: flex;
		gap: 0.35rem;
	}

	.insight-label {
		color: var(--text-muted);
	}

	.insight-val {
		font-weight: 700;
		color: var(--text-primary);
	}

	/* ─── Advanced Settings ───────────────────────────────────────────────── */
	.settings-box {
		border-radius: var(--radius-md);
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		overflow: hidden;
	}

	.settings-toggle-btn {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		background: transparent;
		border: none;
		color: var(--text-primary);
		cursor: pointer;
		transition: background 0.14s ease;
	}

	.settings-toggle-btn:hover {
		background: var(--bg-elevated);
	}

	.settings-content {
		padding: 0.9rem 1rem 1.1rem;
		border-top: 1px solid var(--border-subtle);
		background: var(--bg-elevated);
	}

	.form-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.checkbox-row {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		cursor: pointer;
		font-weight: 600;
	}

	/* ─── Actions Card ────────────────────────────────────────────────────── */
	.actions-card {
		padding: 1rem;
		border-radius: var(--radius-md);
		background: var(--bg-elevated);
		border: 1px solid var(--border-subtle);
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	.actions-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.actions-hint {
		margin: 0;
		font-size: 0.78rem;
		color: var(--text-secondary);
		line-height: 1.4;
	}

	.spinner-mini {
		width: 13px;
		height: 13px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: #ffffff;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		display: inline-block;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
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
		padding: 0.75rem 0.85rem;
		border-radius: var(--radius-sm);
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
	}

	.diff-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.65rem;
		font-size: 0.75rem;
		color: var(--text-secondary);
		background: var(--bg-elevated);
		padding: 0.5rem 0.65rem;
		border-radius: 6px;
	}

	.diff-col {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.diff-tag {
		font-size: 0.66rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		margin-bottom: 0.2rem;
	}

	.diff-col.file .diff-tag {
		color: var(--accent);
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
