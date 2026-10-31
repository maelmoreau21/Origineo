<script lang="ts">
	import {
		type UserDto,
		type PersonDto,
		type TreeWindowDto,
		authApi,
		personApi,
		treeApi,
		searchApi,
		personLabel,
		formatLifeYears
	} from '$lib/api';
	import { i18n } from '$lib/i18n/index.svelte';
	import { AVAILABLE_LOCALES } from '$lib/i18n/translations';
	import TreeCanvas from '$lib/components/TreeCanvas.svelte';
	import FanChartCanvas from '$lib/components/FanChartCanvas.svelte';
	import MigrationMapCanvas from '$lib/components/MigrationMapCanvas.svelte';
	import TimelineCanvas from '$lib/components/TimelineCanvas.svelte';
	import PersonDrawer from '$lib/components/PersonDrawer.svelte';
	import KinshipModal from '$lib/components/KinshipModal.svelte';
	import GedcomModal from '$lib/components/GedcomModal.svelte';
	import RelativeModal from '$lib/components/RelativeModal.svelte';
	import AuditModal from '$lib/components/AuditModal.svelte';
	import DirectoryStatsModal from '$lib/components/DirectoryStatsModal.svelte';
	import DuplicatesModal from '$lib/components/DuplicatesModal.svelte';
	import { exportPosterSvgOrPrint, exportFamilyBook } from '$lib/book-and-poster-export';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	let currentUser = $state<UserDto | null>(null);
	let loadingAuth = $state(true);

	// Tree Window State (Default: 3 ancestor generations & 3 descendant generations)
	let focusPersonId = $state<string | null>(null);
	let selectedPersonId = $state<string | null>(null);
	let selectedPerson = $state<PersonDto | null>(null);
	let treeWindow = $state<TreeWindowDto | null>(null);
	let ancestorsGen = $state(3);
	let descendantsGen = $state(3);
	let includeSiblings = $state(true);
	let includeSpouses = $state(true);
	let showGenPopover = $state(false);

	// Fuzzy Search (pg_trgm)
	let searchQuery = $state('');
	let searchResults = $state<(PersonDto & { similarity: number })[]>([]);
	let showSearchDropdown = $state(false);
	let searchInputEl = $state<HTMLInputElement | null>(null);

	// Modals & View Modes
	let viewMode = $state<'tree' | 'fanchart' | 'map' | 'timeline'>('tree');
	let showKinshipModal = $state(false);
	let showGedcomModal = $state(false);
	let showRelativeModal = $state(false);
	let showAuditModal = $state(false);
	let showDirectoryModal = $state(false);
	let showDuplicatesModal = $state(false);
	let relativeAnchor = $state<PersonDto | null>(null);
	let relativeDefaultType = $state<'FATHER' | 'MOTHER' | 'SPOUSE' | 'CHILD'>('CHILD');

	const canModify = $derived(
		currentUser?.role === 'ADMIN' || currentUser?.role === 'MODIFIER'
	);
	const isAdmin = $derived(currentUser?.role === 'ADMIN');

	const focusPersonObj = $derived.by(() => {
		if (!focusPersonId || !treeWindow) return null;
		return treeWindow.nodes.find((n) => n.person.id === focusPersonId)?.person || null;
	});

	onMount(async () => {
		try {
			currentUser = await authApi.getMe();
		} catch {
			goto('/login');
			return;
		} finally {
			loadingAuth = false;
		}

		await initializeTree();
	});

	async function initializeTree() {
		try {
			const root = await personApi.getRoot();
			if (root) {
				focusPersonId = root.id;
				selectedPersonId = root.id;
				selectedPerson = root;
				await loadTreeWindow(root.id);
			} else {
				treeWindow = null;
				focusPersonId = null;
				selectedPersonId = null;
				selectedPerson = null;
			}
		} catch {
			treeWindow = null;
		}
	}

	async function loadTreeWindow(rootId: string) {
		try {
			const win = await treeApi.getWindow(rootId, ancestorsGen, descendantsGen, {
				siblings: includeSiblings,
				spouses: includeSpouses
			});
			treeWindow = win;
			focusPersonId = rootId;

			if (selectedPersonId) {
				const inWin = win.nodes.find((n) => n.person.id === selectedPersonId)?.person;
				if (inWin) {
					selectedPerson = inWin;
				} else {
					selectedPerson = await personApi.getById(selectedPersonId).catch(() => null);
				}
			}
		} catch (err) {
			console.error('Failed to load tree window:', err);
		}
	}

	async function handleSelectPerson(id: string) {
		selectedPersonId = id;
		const inWin = treeWindow?.nodes.find((n) => n.person.id === id)?.person;
		if (inWin) {
			selectedPerson = inWin;
		} else {
			selectedPerson = await personApi.getById(id).catch(() => null);
		}
	}

	async function handleFocusPerson(id: string) {
		focusPersonId = id;
		selectedPersonId = id;
		await loadTreeWindow(id);
	}

	function applyGenerationPreset(anc: number, desc: number) {
		ancestorsGen = anc;
		descendantsGen = desc;
		if (focusPersonId) {
			loadTreeWindow(focusPersonId);
		}
	}

	async function handleSearchInput(q: string) {
		searchQuery = q;
		if (q.trim().length < 2) {
			searchResults = [];
			showSearchDropdown = false;
			return;
		}
		try {
			const res = await searchApi.search(q, 1, 12);
			searchResults = res.persons;
			showSearchDropdown = true;
		} catch {
			searchResults = [];
		}
	}

	function handleOpenAddRelative(
		anchorId: string,
		defaultType: 'FATHER' | 'MOTHER' | 'SPOUSE' | 'CHILD' = 'CHILD'
	) {
		const anchor =
			treeWindow?.nodes.find((n) => n.person.id === anchorId)?.person || selectedPerson;
		relativeAnchor = anchor || null;
		relativeDefaultType = defaultType;
		showRelativeModal = true;
	}

	function handleOpenCreateRoot() {
		relativeAnchor = null;
		showRelativeModal = true;
	}

	async function handleLogout() {
		await authApi.logout().catch(() => {});
		goto('/login');
	}

	function handleGlobalKeydown(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			searchInputEl?.focus();
		} else if (e.key === 'Escape') {
			showSearchDropdown = false;
			showGenPopover = false;
		}
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

{#if loadingAuth}
	<div class="boot-screen">
		<div class="boot-crest">
			<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="6" r="3" />
				<circle cx="6" cy="18" r="2.5" />
				<circle cx="18" cy="18" r="2.5" />
				<path d="M12 9v6M7 15h10" />
			</svg>
		</div>
		<div style="font-weight: 700; font-size: 0.92rem;">Origineo Studio…</div>
	</div>
{:else if currentUser}
	<!-- Click-outside overlay when Generation Popover or Search Dropdown is open -->
	{#if showGenPopover || showSearchDropdown}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="popover-click-catcher"
			onclick={() => {
				showGenPopover = false;
				showSearchDropdown = false;
			}}
		></div>
	{/if}

	<div class="studio-shell">
		<!-- Top Command Header -->
		<header class="studio-header">
			<!-- Brand & Active Root Breadcrumb -->
			<div class="brand-cluster">
				<div class="brand-emblem">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="5" r="2.5" />
						<circle cx="6" cy="18" r="2.5" />
						<circle cx="18" cy="18" r="2.5" />
						<path d="M12 7.5V13M6 15.5V13h12v2.5" />
					</svg>
				</div>
				<div>
					<div class="brand-title">
						Origineo <span class="studio-tag">STUDIO</span>
					</div>
					<div class="brand-sub">
						{#if focusPersonObj}
							<span>{i18n.t('rootBreadcrumb')} <strong>{personLabel(focusPersonObj)}</strong></span>
						{:else}
							<span>{i18n.t('brandSubtitle')}</span>
						{/if}
					</div>
				</div>
			</div>

			<!-- Spotlight Fuzzy Search Bar (pg_trgm) -->
			<div class="spotlight-wrapper">
				<div class="spotlight-box">
					<svg class="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
						<circle cx="11" cy="11" r="8" />
						<line x1="21" y1="21" x2="16.65" y2="16.65" />
					</svg>
					<input
						bind:this={searchInputEl}
						class="spotlight-input"
						value={searchQuery}
						oninput={(e) => handleSearchInput((e.currentTarget as HTMLInputElement).value)}
						onfocus={() => {
							if (searchResults.length > 0) showSearchDropdown = true;
						}}
						placeholder={i18n.t('searchPlaceholder')}
					/>
					<kbd class="kbd-hint mono">Ctrl K</kbd>
				</div>

				{#if showSearchDropdown && searchResults.length > 0}
					<div class="search-dropdown">
						<div class="search-dropdown-header">
							<span>{i18n.t('searchResultsCount', { count: searchResults.length })}</span>
							<button
								type="button"
								class="btn-close-mini"
								onclick={() => (showSearchDropdown = false)}
							>
								✕
							</button>
						</div>
						{#each searchResults as item (item.id)}
							<button
								type="button"
								class="search-item"
								onclick={() => {
									showSearchDropdown = false;
									searchQuery = '';
									handleFocusPerson(item.id);
								}}
							>
								<div style="display: flex; align-items: center; gap: 0.65rem; min-width: 0;">
									<span
										class="search-gender-dot"
										class:male={item.gender === 'MALE'}
										class:female={item.gender === 'FEMALE'}
									></span>
									<div style="min-width: 0;">
										<div style="font-weight: 700; font-size: 0.84rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
											{personLabel(item)}
										</div>
										<div style="font-size: 0.73rem; color: var(--text-secondary);">
											{formatLifeYears(item)} {item.birthPlace ? `· ${item.birthPlace}` : ''}
										</div>
									</div>
								</div>
								<span class="badge badge-accent mono">{Math.round((item.similarity || 0) * 100)}%</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Right Studio Controls -->
			<div class="header-controls">
				<!-- Segmented View Switcher (Arbre | Roue Sosa | Atlas | Chronologie) -->
				<div class="segmented-switcher">
					<button
						type="button"
						class="seg-btn"
						class:active={viewMode === 'tree'}
						onclick={() => (viewMode = 'tree')}
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="5" r="2.5" />
							<circle cx="6" cy="19" r="2.5" />
							<circle cx="18" cy="19" r="2.5" />
							<path d="M12 7.5V13M6 16.5V13h12v3.5" />
						</svg>
						<span>{i18n.t('viewTree')}</span>
					</button>
					<button
						type="button"
						class="seg-btn"
						class:active={viewMode === 'fanchart'}
						onclick={() => {
							viewMode = 'fanchart';
							if (ancestorsGen < 5) applyGenerationPreset(6, descendantsGen);
						}}
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M12 12L4.93 4.93a10 10 0 0 1 14.14 0L12 12z" />
							<circle cx="12" cy="12" r="3" />
						</svg>
						<span>{i18n.t('viewFanChart')}</span>
					</button>
					<button
						type="button"
						class="seg-btn"
						class:active={viewMode === 'map'}
						onclick={() => (viewMode = 'map')}
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
							<line x1="8" y1="2" x2="8" y2="18" />
							<line x1="16" y1="6" x2="16" y2="22" />
						</svg>
						<span>{i18n.t('viewMap')}</span>
					</button>
					<button
						type="button"
						class="seg-btn"
						class:active={viewMode === 'timeline'}
						onclick={() => (viewMode = 'timeline')}
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<line x1="4" y1="6" x2="16" y2="6" />
							<line x1="8" y1="12" x2="20" y2="12" />
							<line x1="4" y1="18" x2="14" y2="18" />
						</svg>
						<span>{i18n.t('viewTimeline')}</span>
					</button>
				</div>

				<!-- Fixed Dynamic Generation Window Popover -->
				<div style="position: relative; z-index: 65;">
					<button
						type="button"
						class="btn btn-sm"
						class:btn-primary={showGenPopover}
						class:btn-secondary={!showGenPopover}
						onclick={() => (showGenPopover = !showGenPopover)}
						title={i18n.t('viewPresetsTitle')}
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polygon points="12 2 2 7 12 12 22 7 12 2" />
							<polyline points="2 17 12 22 22 17" />
							<polyline points="2 12 12 17 22 12" />
						</svg>
						<span class="mono">{ancestorsGen}A / {descendantsGen}D</span>
					</button>

					{#if showGenPopover}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="gen-popover" onclick={(e) => e.stopPropagation()}>
							<div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.75rem;">
								<div>
									<strong style="font-size: 0.86rem; display: block;">{i18n.t('viewPresetsTitle')}</strong>
									<span style="font-size: 0.72rem; color: var(--text-secondary);">
										{i18n.t('viewPresetsSubtitle')}
									</span>
								</div>
								<button type="button" class="btn btn-ghost btn-sm" onclick={() => (showGenPopover = false)}>
									✕
								</button>
							</div>

							<!-- Preset Buttons with Active State & Clean Wrapping -->
							<div class="preset-grid">
								<button
									type="button"
									class="preset-btn"
									class:active={ancestorsGen === 3 && descendantsGen === 3}
									onclick={() => applyGenerationPreset(3, 3)}
								>
									{i18n.t('preset3x3')}
								</button>
								<button
									type="button"
									class="preset-btn"
									class:active={ancestorsGen === 6 && descendantsGen === 0}
									onclick={() => applyGenerationPreset(6, 0)}
								>
									{i18n.t('presetAncestors')}
								</button>
								<button
									type="button"
									class="preset-btn"
									class:active={ancestorsGen === 0 && descendantsGen === 4}
									onclick={() => applyGenerationPreset(0, 4)}
								>
									{i18n.t('presetDescendants')}
								</button>
								<button
									type="button"
									class="preset-btn"
									class:active={ancestorsGen === 5 && descendantsGen === 4}
									onclick={() => applyGenerationPreset(5, 4)}
								>
									{i18n.t('presetWide')}
								</button>
							</div>

							<!-- Sliders with Live Value Badges -->
							<div class="slider-group">
								<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
									<label class="label" style="margin: 0;" for="slider-anc">
										{i18n.t('ancestorsLabel')}
									</label>
									<span class="badge badge-accent mono">{ancestorsGen}G</span>
								</div>
								<input
									id="slider-anc"
									type="range"
									min="0"
									max="10"
									bind:value={ancestorsGen}
									oninput={() => focusPersonId && loadTreeWindow(focusPersonId)}
									style="width: 100%; accent-color: var(--accent); cursor: pointer;"
								/>
							</div>

							<div class="slider-group">
								<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
									<label class="label" style="margin: 0;" for="slider-desc">
										{i18n.t('descendantsLabel')}
									</label>
									<span class="badge badge-success mono">{descendantsGen}G</span>
								</div>
								<input
									id="slider-desc"
									type="range"
									min="0"
									max="10"
									bind:value={descendantsGen}
									oninput={() => focusPersonId && loadTreeWindow(focusPersonId)}
									style="width: 100%; accent-color: var(--accent); cursor: pointer;"
								/>
							</div>

							<div style="display: flex; flex-direction: column; gap: 0.45rem; font-size: 0.8rem; padding-top: 0.4rem; border-top: 1px solid var(--border-subtle);">
								<label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
									<input
										type="checkbox"
										bind:checked={includeSiblings}
										onchange={() => focusPersonId && loadTreeWindow(focusPersonId)}
									/>
									<span>{i18n.t('includeSiblings')}</span>
								</label>
								<label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
									<input
										type="checkbox"
										bind:checked={includeSpouses}
										onchange={() => focusPersonId && loadTreeWindow(focusPersonId)}
									/>
									<span>{i18n.t('includeSpouses')}</span>
								</label>
							</div>

							<p style="margin: 0.7rem 0 0; font-size: 0.72rem; color: var(--text-muted); line-height: 1.45;">
								{i18n.t('doubleClickHint')}
							</p>
						</div>
					{/if}
				</div>

				<!-- Instant Segmented Language Switcher (FR | EN) -->
				<div class="segmented-switcher" role="group" aria-label="Langue">
					{#each AVAILABLE_LOCALES as loc (loc.code)}
						<button
							type="button"
							class="seg-btn mono"
							class:active={i18n.locale === loc.code}
							onclick={() => i18n.setLocale(loc.code)}
							title={loc.label}
						>
							{loc.code.toUpperCase()}
						</button>
					{/each}
				</div>

				<!-- Theme Toggle -->
				<button
					type="button"
					class="btn btn-secondary btn-sm"
					onclick={() => i18n.toggleTheme()}
					title={i18n.theme === 'dark' ? i18n.t('themeLight') : i18n.t('themeDark')}
				>
					{#if i18n.theme === 'dark'}
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="5" />
							<path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
						</svg>
					{:else}
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
						</svg>
					{/if}
				</button>

				<!-- User Role Badge & Logout -->
				<div class="user-pill">
					<span
						class="badge"
						class:badge-accent={currentUser.role === 'ADMIN'}
						class:badge-success={currentUser.role === 'MODIFIER'}
						class:badge-warning={currentUser.role === 'READER'}
					>
						{i18n.t(`role_${currentUser.role}`)}
					</span>
					<button
						type="button"
						class="btn btn-ghost btn-sm"
						onclick={handleLogout}
						title={i18n.t('logoutBtn')}
					>
						<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
							<polyline points="16 17 21 12 16 7" />
							<line x1="21" y1="12" x2="9" y2="12" />
						</svg>
					</button>
				</div>
			</div>
		</header>

		<!-- Main Workspace: Left Studio Dock + Interactive Viewport + Right Slide-Over Drawer -->
		<div class="studio-workspace">
			<!-- Left Vertical Studio Rail -->
			<nav class="studio-rail" aria-label="Outils généalogiques">
				<div class="rail-group">
					<button
						type="button"
						class="rail-btn"
						class:active={viewMode === 'tree'}
						onclick={() => (viewMode = 'tree')}
						title={i18n.t('viewTree')}
					>
						<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="5" r="2.5" />
							<circle cx="6" cy="19" r="2.5" />
							<circle cx="18" cy="19" r="2.5" />
							<path d="M12 7.5V13M6 16.5V13h12v3.5" />
						</svg>
						<span class="rail-label">{i18n.t('viewTree')}</span>
					</button>

					<button
						type="button"
						class="rail-btn"
						class:active={viewMode === 'fanchart'}
						onclick={() => {
							viewMode = 'fanchart';
							if (ancestorsGen < 5) applyGenerationPreset(6, descendantsGen);
						}}
						title={i18n.t('viewFanChart')}
					>
						<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M12 12L4.93 4.93a10 10 0 0 1 14.14 0L12 12z" />
							<circle cx="12" cy="12" r="3" />
						</svg>
						<span class="rail-label">{i18n.t('viewFanChart')}</span>
					</button>

					<button
						type="button"
						class="rail-btn"
						class:active={viewMode === 'map'}
						onclick={() => (viewMode = 'map')}
						title={i18n.t('viewMap')}
					>
						<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
							<line x1="8" y1="2" x2="8" y2="18" />
							<line x1="16" y1="6" x2="16" y2="22" />
						</svg>
						<span class="rail-label">{i18n.t('viewMap')}</span>
					</button>

					<button
						type="button"
						class="rail-btn"
						class:active={viewMode === 'timeline'}
						onclick={() => (viewMode = 'timeline')}
						title={i18n.t('viewTimeline')}
					>
						<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<line x1="4" y1="6" x2="16" y2="6" />
							<line x1="8" y1="12" x2="20" y2="12" />
							<line x1="4" y1="18" x2="14" y2="18" />
						</svg>
						<span class="rail-label">{i18n.t('viewTimeline')}</span>
					</button>
				</div>

				<div class="rail-divider"></div>

				<div class="rail-group">
					<button
						type="button"
						class="rail-btn"
						onclick={() => (showDirectoryModal = true)}
						title={i18n.t('directoryBtn')}
					>
						<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
							<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
						</svg>
						<span class="rail-label">{i18n.t('railDirectory')}</span>
					</button>

					<button
						type="button"
						class="rail-btn"
						onclick={() => (showKinshipModal = true)}
						title={i18n.t('kinshipTitle')}
					>
						<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
						</svg>
						<span class="rail-label">{i18n.t('railKinship')}</span>
					</button>

					<button
						type="button"
						class="rail-btn"
						onclick={() => (showAuditModal = true)}
						title="Audit & Cohérence"
					>
						<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
							<path d="m9 12 2 2 4-4" />
						</svg>
						<span class="rail-label">{i18n.t('railAudit')}</span>
					</button>

					<button
						type="button"
						class="rail-btn"
						onclick={() => (showDuplicatesModal = true)}
						title="Détection et fusion de doublons"
					>
						<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
							<circle cx="9" cy="7" r="4" />
							<path d="M22 21v-2a4 4 0 0 0-3-3.87" />
							<path d="M16 3.13a4 4 0 0 1 0 7.75" />
						</svg>
						<span class="rail-label">Doublons</span>
					</button>

					{#if treeWindow && selectedPerson}
						<button
							type="button"
							class="rail-btn"
							onclick={() => treeWindow && selectedPerson && exportPosterSvgOrPrint(treeWindow, selectedPerson)}
							title="Exporter en arbre géant vectoriel / SVG / Traceur A0"
						>
							<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<rect x="3" y="3" width="18" height="18" rx="2" />
								<circle cx="8.5" cy="8.5" r="1.5" />
								<polyline points="21 15 16 10 5 21" />
							</svg>
							<span class="rail-label">Traceur</span>
						</button>

						<button
							type="button"
							class="rail-btn"
							onclick={() => treeWindow && selectedPerson && exportFamilyBook(treeWindow, selectedPerson)}
							title="Générer le Livre de Famille biographique"
						>
							<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
								<path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
							</svg>
							<span class="rail-label">Livre</span>
						</button>
					{/if}

					{#if isAdmin}
						<button
							type="button"
							class="rail-btn"
							onclick={() => (showGedcomModal = true)}
							title={i18n.t('gedcomBtn')}
						>
							<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
								<polyline points="17 8 12 3 7 8" />
								<line x1="12" y1="3" x2="12" y2="15" />
							</svg>
							<span class="rail-label">{i18n.t('railGedcom')}</span>
						</button>
					{/if}

					{#if canModify}
						<button
							type="button"
							class="rail-btn accent"
							onclick={() => {
								if (selectedPersonId) handleOpenAddRelative(selectedPersonId);
								else handleOpenCreateRoot();
							}}
							title={i18n.t('addRelativeBtn')}
						>
							<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
								<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
								<circle cx="8.5" cy="7" r="4" />
								<line x1="20" y1="8" x2="20" y2="14" />
								<line x1="23" y1="11" x2="17" y2="11" />
							</svg>
							<span class="rail-label">{i18n.t('railAdd')}</span>
						</button>
					{/if}
				</div>
			</nav>

			<!-- Center Interactive Stage -->
			<div class="stage-container">
				{#if viewMode === 'tree'}
					<TreeCanvas
						tree={treeWindow}
						rootPersonId={focusPersonId}
						{selectedPersonId}
						{canModify}
						{isAdmin}
						ancestors={ancestorsGen}
						descendants={descendantsGen}
						onSelectPerson={handleSelectPerson}
						onFocusPerson={handleFocusPerson}
						onRequestAddRelative={(id: string) => handleOpenAddRelative(id)}
						onOpenCreateFirstPerson={handleOpenCreateRoot}
						onOpenGedcomModal={() => (showGedcomModal = true)}
					/>
				{:else if viewMode === 'fanchart'}
					<FanChartCanvas
						tree={treeWindow}
						rootPersonId={focusPersonId}
						{selectedPersonId}
						onSelectPerson={handleSelectPerson}
						onFocusPerson={handleFocusPerson}
					/>
				{:else if viewMode === 'map'}
					<MigrationMapCanvas {canModify} />
				{:else}
					<TimelineCanvas
						tree={treeWindow}
						{selectedPersonId}
						onSelectPerson={handleSelectPerson}
						onFocusPerson={handleFocusPerson}
					/>
				{/if}

				{#if selectedPerson}
					<PersonDrawer
						person={selectedPerson}
						{treeWindow}
						{canModify}
						onClose={() => {
							selectedPerson = null;
							selectedPersonId = null;
						}}
						onSelectPerson={handleSelectPerson}
						onFocusPerson={handleFocusPerson}
						onOpenAddRelative={handleOpenAddRelative}
						onTreeMutated={() => {
							if (focusPersonId) loadTreeWindow(focusPersonId);
							else initializeTree();
						}}
					/>
				{/if}
			</div>
		</div>
	</div>

	<!-- Modals -->
	{#if showDirectoryModal}
		<DirectoryStatsModal
			onClose={() => (showDirectoryModal = false)}
			onFocusPerson={(id) => {
				viewMode = 'tree';
				handleFocusPerson(id);
			}}
		/>
	{/if}

	{#if showDuplicatesModal}
		<DuplicatesModal
			{canModify}
			onClose={() => (showDuplicatesModal = false)}
			onFocusPerson={(id) => {
				viewMode = 'tree';
				handleFocusPerson(id);
			}}
			onTreeMutated={() => initializeTree()}
		/>
	{/if}

	{#if showKinshipModal}
		<KinshipModal
			initialPersonA={selectedPerson}
			onClose={() => (showKinshipModal = false)}
			onFocusPerson={handleFocusPerson}
		/>
	{/if}

	{#if showGedcomModal && isAdmin}
		<GedcomModal
			currentFocusPerson={selectedPerson}
			onClose={() => (showGedcomModal = false)}
			onImported={() => initializeTree()}
		/>
	{/if}

	{#if showRelativeModal && canModify}
		<RelativeModal
			anchorPerson={relativeAnchor}
			initialLinkType={relativeDefaultType}
			onClose={() => (showRelativeModal = false)}
			onCreated={(created) => {
				if (focusPersonId) {
					loadTreeWindow(focusPersonId);
				} else {
					handleFocusPerson(created.id);
				}
			}}
		/>
	{/if}

	{#if showAuditModal}
		<AuditModal
			{canModify}
			onClose={() => (showAuditModal = false)}
			onFocusPerson={(id) => {
				viewMode = 'tree';
				handleFocusPerson(id);
			}}
			onTreeMutated={() => {
				if (focusPersonId) loadTreeWindow(focusPersonId);
				else initializeTree();
			}}
		/>
	{/if}
{/if}

<style>
	.popover-click-catcher {
		position: fixed;
		inset: 0;
		z-index: 45;
		background: transparent;
	}

	.boot-screen {
		height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.9rem;
		background: var(--bg-canvas);
		color: var(--text-secondary);
	}

	.boot-crest {
		width: 56px;
		height: 56px;
		border-radius: 16px;
		background: var(--accent-soft);
		color: var(--accent);
		border: 1px solid rgba(16, 185, 129, 0.35);
		display: grid;
		place-items: center;
	}

	.studio-shell {
		height: 100vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--bg-canvas);
	}

	.studio-header {
		height: 58px;
		padding: 0 1rem;
		background: var(--bg-surface);
		border-bottom: 1px solid var(--border-subtle);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.85rem;
		z-index: 50;
	}

	.brand-cluster {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		min-width: 0;
	}

	.brand-emblem {
		width: 36px;
		height: 36px;
		border-radius: 10px;
		background: linear-gradient(135deg, var(--accent-soft), rgba(56, 189, 248, 0.12));
		border: 1px solid rgba(16, 185, 129, 0.35);
		color: var(--accent);
		display: grid;
		place-items: center;
		flex-shrink: 0;
	}

	.brand-title {
		font-weight: 800;
		font-size: 0.96rem;
		line-height: 1.15;
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.studio-tag {
		font-size: 0.6rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		padding: 0.1rem 0.38rem;
		border-radius: 4px;
		background: var(--bg-elevated);
		color: var(--text-secondary);
		border: 1px solid var(--border-subtle);
	}

	.brand-sub {
		font-size: 0.72rem;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.brand-sub strong {
		color: var(--text-secondary);
		font-weight: 600;
	}

	/* ─── Spotlight Fuzzy Search Bar ──────────────────────────────────────── */
	.spotlight-wrapper {
		position: relative;
		flex: 1;
		max-width: 400px;
		z-index: 65;
	}

	.spotlight-box {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		height: 35px;
		padding: 0 0.75rem;
		border-radius: 10px;
		background: var(--bg-primary);
		border: 1px solid var(--border-color);
		transition:
			border-color 0.15s ease,
			box-shadow 0.15s ease;
	}

	.spotlight-box:focus-within {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-soft);
	}

	.search-icon {
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.spotlight-input {
		flex: 1;
		border: none;
		background: transparent;
		color: var(--text-primary);
		font-size: 0.81rem;
		outline: none;
		min-width: 0;
	}

	.kbd-hint {
		font-size: 0.64rem;
		padding: 0.12rem 0.38rem;
		border-radius: 5px;
		background: var(--bg-elevated);
		border: 1px solid var(--border-subtle);
		color: var(--text-muted);
	}

	.search-dropdown {
		position: absolute;
		top: calc(100% + 0.4rem);
		left: 0;
		right: 0;
		background: var(--bg-surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		max-height: 340px;
		overflow-y: auto;
		z-index: 70;
	}

	.search-dropdown-header {
		padding: 0.5rem 0.85rem;
		font-size: 0.71rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
		border-bottom: 1px solid var(--border-subtle);
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.btn-close-mini {
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
	}

	.search-item {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.62rem 0.85rem;
		border: none;
		border-bottom: 1px solid var(--border-subtle);
		background: transparent;
		color: var(--text-primary);
		text-align: left;
		cursor: pointer;
		transition: background 0.12s ease;
	}

	.search-item:hover {
		background: var(--bg-elevated);
	}

	.search-gender-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-other);
		flex-shrink: 0;
	}

	.search-gender-dot.male {
		background: var(--color-male);
	}

	.search-gender-dot.female {
		background: var(--color-female);
	}

	/* ─── Header Controls ─────────────────────────────────────────────────── */
	.header-controls {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}

	.segmented-switcher {
		display: inline-flex;
		background: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 9px;
		padding: 0.15rem;
		gap: 0.12rem;
	}

	.seg-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		height: 27px;
		padding: 0 0.58rem;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--text-secondary);
		font-size: 0.75rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.14s ease;
	}

	.seg-btn:hover {
		color: var(--text-primary);
	}

	.seg-btn.active {
		background: var(--bg-elevated);
		color: var(--accent);
		box-shadow: var(--shadow-sm);
	}

	.user-pill {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding-left: 0.35rem;
		border-left: 1px solid var(--border-subtle);
	}

	/* ─── Redesigned Generation Window Popover ────────────────────────────── */
	.gen-popover {
		position: absolute;
		top: calc(100% + 0.5rem);
		right: 0;
		width: 360px;
		padding: 1.1rem;
		background: var(--bg-surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-popover);
		z-index: 80;
	}

	.preset-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.45rem;
		margin-bottom: 0.95rem;
	}

	.preset-btn {
		padding: 0.48rem 0.6rem;
		border-radius: var(--radius-xs);
		border: 1px solid var(--border-color);
		background: var(--bg-elevated);
		color: var(--text-primary);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		text-align: center;
		transition: all 0.14s ease;
	}

	.preset-btn:hover {
		border-color: var(--border-strong);
		background: var(--bg-tertiary);
	}

	.preset-btn.active {
		background: var(--accent-soft);
		color: var(--accent);
		border-color: var(--accent);
		font-weight: 700;
	}

	.slider-group {
		margin-bottom: 0.75rem;
	}

	/* ─── Studio Workspace & Left Vertical Rail ───────────────────────────── */
	.studio-workspace {
		flex: 1;
		display: flex;
		overflow: hidden;
		position: relative;
	}

	.studio-rail {
		width: 68px;
		background: var(--bg-surface);
		border-right: 1px solid var(--border-subtle);
		padding: 0.65rem 0.35rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: space-between;
		z-index: 30;
		flex-shrink: 0;
	}

	.rail-group {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		width: 100%;
	}

	.rail-divider {
		width: 32px;
		height: 1px;
		background: var(--border-subtle);
		margin: 0.3rem auto;
	}

	.rail-btn {
		width: 100%;
		padding: 0.48rem 0.15rem;
		border-radius: 10px;
		border: 1px solid transparent;
		background: transparent;
		color: var(--text-secondary);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.22rem;
		cursor: pointer;
		transition: all 0.14s ease;
	}

	.rail-btn:hover {
		background: var(--bg-elevated);
		color: var(--text-primary);
	}

	.rail-btn.active {
		background: var(--accent-soft);
		color: var(--accent);
		border-color: rgba(16, 185, 129, 0.3);
	}

	.rail-btn.accent {
		background: var(--bg-elevated);
		color: var(--accent);
		border-color: var(--border-color);
	}

	.rail-btn.accent:hover {
		background: var(--accent);
		color: #ffffff;
		border-color: var(--accent);
	}

	.rail-label {
		font-size: 0.61rem;
		font-weight: 700;
		letter-spacing: 0.01em;
		text-align: center;
		line-height: 1.1;
	}

	.stage-container {
		flex: 1;
		position: relative;
		overflow: hidden;
		display: flex;
	}
</style>
