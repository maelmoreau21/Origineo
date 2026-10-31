<script lang="ts">
	import {
		type DocumentDto,
		type DocumentTagDto,
		type PersonDto,
		documentApi,
		searchApi,
		personLabel,
		formatLifeYears
	} from '$lib/api';
	import { onMount } from 'svelte';

	let {
		document: doc,
		canModify = false,
		onClose,
		onSelectPerson
	}: {
		document: DocumentDto;
		canModify?: boolean;
		onClose: () => void;
		onSelectPerson: (personId: string) => void;
	} = $props();

	// Zoom & Pan state
	let scale = $state(1);
	let panX = $state(0);
	let panY = $state(0);
	let isPanning = $state(false);
	let panStart = { x: 0, y: 0 };

	// Paleography & Vital Record Image Enhancement Filters
	let brightness = $state(100);
	let contrast = $state(100);
	let invert = $state(false);
	let grayscale = $state(false);
	let rotation = $state(0);

	// Interactive Person / Face Tagging on Photos & Acts
	let tags = $state<DocumentTagDto[]>([]);
	let taggingMode = $state(false);
	let drawingBox = $state(false);
	let boxStart = $state<{ x: number; y: number } | null>(null);
	let currentBox = $state<{ xPct: number; yPct: number; wPct: number; hPct: number } | null>(null);

	// Tag assignment popover
	let showAssignModal = $state(false);
	let personQuery = $state('');
	let personResults = $state<(PersonDto & { similarity: number })[]>([]);
	let customLabel = $state('');
	let savingTag = $state(false);

	let imageWrapperEl: HTMLDivElement | undefined = $state();

	const isImage = $derived(
		doc.mimeType?.startsWith('image/') ||
			/\.(jpe?g|png|webp|gif|bmp|svg)$/i.test(doc.filename)
	);

	const filterCss = $derived(
		`brightness(${brightness}%) contrast(${contrast}%) ${invert ? 'invert(100%)' : ''} ${grayscale ? 'grayscale(100%)' : ''}`
	);

	onMount(async () => {
		await loadTags();
	});

	async function loadTags() {
		try {
			tags = await documentApi.getTags(doc.id);
		} catch {
			tags = [];
		}
	}

	function resetView() {
		scale = 1;
		panX = 0;
		panY = 0;
		rotation = 0;
	}

	function resetFilters() {
		brightness = 100;
		contrast = 100;
		invert = false;
		grayscale = false;
	}

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		const factor = e.deltaY < 0 ? 1.14 : 0.88;
		scale = Math.min(8, Math.max(0.4, scale * factor));
	}

	function handlePointerDown(e: PointerEvent) {
		if (taggingMode && imageWrapperEl) {
			const rect = imageWrapperEl.getBoundingClientRect();
			const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
			const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
			drawingBox = true;
			boxStart = { x, y };
			currentBox = { xPct: x, yPct: y, wPct: 1, hPct: 1 };
			return;
		}
		if (e.button !== 0) return;
		isPanning = true;
		panStart = { x: e.clientX - panX, y: e.clientY - panY };
	}

	function handlePointerMove(e: PointerEvent) {
		if (drawingBox && boxStart && imageWrapperEl) {
			const rect = imageWrapperEl.getBoundingClientRect();
			const curX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
			const curY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
			const xPct = Math.min(boxStart.x, curX);
			const yPct = Math.min(boxStart.y, curY);
			const wPct = Math.max(2, Math.abs(curX - boxStart.x));
			const hPct = Math.max(2, Math.abs(curY - boxStart.y));
			currentBox = { xPct, yPct, wPct, hPct };
			return;
		}
		if (!isPanning) return;
		panX = e.clientX - panStart.x;
		panY = e.clientY - panStart.y;
	}

	function handlePointerUp() {
		if (drawingBox && currentBox) {
			drawingBox = false;
			if (currentBox.wPct >= 2.5 && currentBox.hPct >= 2.5) {
				showAssignModal = true;
			} else {
				currentBox = null;
			}
		}
		isPanning = false;
	}

	async function searchPeopleForTag(q: string) {
		personQuery = q;
		if (q.trim().length < 2) {
			personResults = [];
			return;
		}
		try {
			const res = await searchApi.search(q, 1, 8);
			personResults = res.persons;
		} catch {
			personResults = [];
		}
	}

	async function saveTagWithPerson(person: PersonDto) {
		if (!currentBox) return;
		savingTag = true;
		try {
			const created = await documentApi.createTag(doc.id, {
				personId: person.id,
				label: customLabel.trim() || personLabel(person),
				xPct: Number(currentBox.xPct.toFixed(2)),
				yPct: Number(currentBox.yPct.toFixed(2)),
				wPct: Number(currentBox.wPct.toFixed(2)),
				hPct: Number(currentBox.hPct.toFixed(2))
			});
			tags = [...tags, created];
			showAssignModal = false;
			currentBox = null;
			taggingMode = false;
			personQuery = '';
			customLabel = '';
			personResults = [];
		} finally {
			savingTag = false;
		}
	}

	function tagDisplayName(t: DocumentTagDto): string {
		const full = [t.personGivenNames, t.personSurname?.toUpperCase()].filter(Boolean).join(' ').trim();
		return full || t.label || 'Individu';
	}

	async function removeTag(tagId: string) {
		try {
			await documentApi.deleteTag(tagId);
			tags = tags.filter((t) => t.id !== tagId);
		} catch {
			// ignore
		}
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={onClose}>
	<div class="viewer-modal" onclick={(e) => e.stopPropagation()}>
		<!-- Top Bar -->
		<div class="viewer-header">
			<div style="display: flex; align-items: center; gap: 0.75rem; min-width: 0;">
				<span class="badge badge-accent">{doc.category}</span>
				<div style="min-width: 0;">
					<h3 style="margin: 0; font-size: 0.98rem; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
						{doc.filename}
					</h3>
					{#if doc.description}
						<div style="font-size: 0.75rem; color: var(--text-secondary);">
							{doc.description}
						</div>
					{/if}
				</div>
			</div>

			<div style="display: flex; align-items: center; gap: 0.45rem;">
				{#if isImage && canModify}
					<button
						type="button"
						class="btn btn-sm"
						class:btn-primary={taggingMode}
						class:btn-secondary={!taggingMode}
						onclick={() => {
							taggingMode = !taggingMode;
							currentBox = null;
							showAssignModal = false;
						}}
					>
						🎯 {taggingMode ? 'Tracez un cadre sur la photo…' : 'Identifier une personne'}
					</button>
				{/if}
				<a href={documentApi.downloadUrl(doc.id)} class="btn btn-secondary btn-sm">
					⬇ Télécharger
				</a>
				<button type="button" class="btn btn-ghost btn-sm" onclick={onClose}>✕</button>
			</div>
		</div>

		<!-- Paleography & Zoom Toolbar (for images / scans of old registers) -->
		{#if isImage}
			<div class="paleo-toolbar">
				<div class="tool-group">
					<span class="tool-label">Zoom</span>
					<button type="button" class="btn btn-secondary btn-sm" onclick={() => (scale = Math.max(0.4, scale - 0.25))}>−</button>
					<span style="font-size: 0.76rem; font-weight: 700; min-width: 44px; text-align: center;">
						{Math.round(scale * 100)}%
					</span>
					<button type="button" class="btn btn-secondary btn-sm" onclick={() => (scale = Math.min(8, scale + 0.25))}>＋</button>
					<button type="button" class="btn btn-secondary btn-sm" onclick={() => (rotation = (rotation + 90) % 360)} title="Pivoter 90°">
						↻ 90°
					</button>
					<button type="button" class="btn btn-ghost btn-sm" onclick={resetView}>Réinitialiser vue</button>
				</div>

				<div class="tool-group">
					<span class="tool-label">☀️ Luminosité ({brightness}%)</span>
					<input type="range" min="40" max="220" bind:value={brightness} style="width: 90px;" />

					<span class="tool-label">◐ Contraste ({contrast}%)</span>
					<input type="range" min="50" max="280" bind:value={contrast} style="width: 90px;" />

					<button
						type="button"
						class="btn btn-sm"
						class:btn-primary={invert}
						class:btn-secondary={!invert}
						onclick={() => (invert = !invert)}
						title="Négatif pour lire les encres pâles des registres paroissiaux"
					>
						🌗 Négatif
					</button>
					<button
						type="button"
						class="btn btn-sm"
						class:btn-primary={grayscale}
						class:btn-secondary={!grayscale}
						onclick={() => (grayscale = !grayscale)}
					>
						N&B
					</button>
					<button type="button" class="btn btn-ghost btn-sm" onclick={resetFilters}>
						Filtres 0
					</button>
				</div>
			</div>
		{/if}

		<!-- Main Viewport + Sidebar Tags -->
		<div class="viewer-body">
			<!-- Interactive Stage -->
			<div
				class="viewer-stage"
				class:crosshair={taggingMode}
				onwheel={handleWheel}
				onpointerdown={handlePointerDown}
				onpointermove={handlePointerMove}
				onpointerup={handlePointerUp}
			>
				{#if isImage}
					<div
						bind:this={imageWrapperEl}
						class="image-transform-box"
						style="transform: translate({panX}px, {panY}px) scale({scale}) rotate({rotation}deg);"
					>
						<img
							src={documentApi.viewUrl(doc.id)}
							alt={doc.filename}
							draggable="false"
							style="filter: {filterCss}; display: block; max-width: 78vw; max-height: 70vh; user-select: none;"
						/>

						<!-- Existing Person / Face Bounding Boxes -->
						{#each tags as t (t.id)}
							<div
								class="tag-box"
								style="left: {t.xPct}%; top: {t.yPct}%; width: {t.wPct}%; height: {t.hPct}%;"
								onclick={(e) => {
									e.stopPropagation();
									if (t.personId) {
										onSelectPerson(t.personId);
										onClose();
									}
								}}
							>
								<span class="tag-chip">
									{tagDisplayName(t)}
								</span>
							</div>
						{/each}

						<!-- Currently Drawn Box -->
						{#if currentBox}
							<div
								class="tag-box drawing"
								style="left: {currentBox.xPct}%; top: {currentBox.yPct}%; width: {currentBox.wPct}%; height: {currentBox.hPct}%;"
							></div>
						{/if}
					</div>
				{:else}
					<iframe
						src={documentApi.viewUrl(doc.id)}
						title={doc.filename}
						style="width: 100%; height: 100%; border: none; background: #fff;"
					></iframe>
				{/if}

				<!-- Popover to assign drawn bounding box to a person -->
				{#if showAssignModal && currentBox}
					<div class="assign-popover" onclick={(e) => e.stopPropagation()}>
						<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
							<strong style="font-size: 0.85rem;">🎯 Identifier sur ce document</strong>
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								onclick={() => {
									showAssignModal = false;
									currentBox = null;
								}}
							>
								✕
							</button>
						</div>

						<input
							class="input"
							placeholder="Rechercher une personne de l'arbre..."
							value={personQuery}
							oninput={(e) => searchPeopleForTag((e.currentTarget as HTMLInputElement).value)}
						/>

						{#if personResults.length > 0}
							<div class="person-pick-list">
								{#each personResults as p (p.id)}
									<button
										type="button"
										class="person-pick-item"
										disabled={savingTag}
										onclick={() => saveTagWithPerson(p)}
									>
										<span>{personLabel(p)}</span>
										<span style="font-size: 0.72rem; color: var(--text-muted);">
											{formatLifeYears(p)}
										</span>
									</button>
								{/each}
							</div>
						{/if}

						<div style="margin-top: 0.55rem; padding-top: 0.55rem; border-top: 1px solid var(--border-subtle);">
							<input
								class="input"
								placeholder="Note facultative (ex: Témoin, Signature, Marié)..."
								bind:value={customLabel}
							/>
						</div>
					</div>
				{/if}
			</div>

			<!-- Right Sidebar: Tagged People on this Photo / Act -->
			{#if isImage}
				<aside class="tags-sidebar">
					<h4 style="margin: 0 0 0.65rem; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-secondary);">
						Personnes identifiées ({tags.length})
					</h4>
					{#if tags.length === 0}
						<p style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.45;">
							Aucune personne identifiée sur ce document. Cliquez sur <strong>« 🎯 Identifier une personne »</strong> puis tracez un rectangle sur un visage ou un nom dans l'acte.
						</p>
					{:else}
						<div style="display: flex; flex-direction: column; gap: 0.45rem;">
							{#each tags as t (t.id)}
								<div class="tag-list-item">
									<button
										type="button"
										style="background: none; border: none; color: var(--text-primary); font-weight: 600; font-size: 0.82rem; text-align: left; cursor: pointer; flex: 1;"
										onclick={() => {
											if (t.personId) {
												onSelectPerson(t.personId);
												onClose();
											}
										}}
									>
										👤 {tagDisplayName(t)}
									</button>
									{#if canModify}
										<button
											type="button"
											class="btn btn-ghost btn-sm"
											onclick={() => removeTag(t.id)}
											title="Supprimer ce repère"
										>
											✕
										</button>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</aside>
			{/if}
		</div>
	</div>
</div>

<style>
	.viewer-modal {
		width: min(1240px, 96vw);
		height: min(860px, 92vh);
		background: var(--bg-surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.viewer-header {
		padding: 0.85rem 1.2rem;
		border-bottom: 1px solid var(--border-subtle);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		background: var(--bg-elevated);
	}

	.paleo-toolbar {
		padding: 0.55rem 1.2rem;
		border-bottom: 1px solid var(--border-subtle);
		background: var(--bg-surface);
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.tool-group {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		flex-wrap: wrap;
	}

	.tool-label {
		font-size: 0.74rem;
		font-weight: 600;
		color: var(--text-secondary);
	}

	.viewer-body {
		flex: 1;
		display: flex;
		overflow: hidden;
	}

	.viewer-stage {
		flex: 1;
		position: relative;
		overflow: hidden;
		background: #0b0f19;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: grab;
	}

	.viewer-stage:active {
		cursor: grabbing;
	}

	.viewer-stage.crosshair {
		cursor: crosshair;
	}

	.image-transform-box {
		position: relative;
		display: inline-block;
		transform-origin: center center;
	}

	.tag-box {
		position: absolute;
		border: 2px solid #fbbf24;
		background: rgba(251, 191, 36, 0.14);
		border-radius: 6px;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.tag-box:hover {
		background: rgba(251, 191, 36, 0.28);
	}

	.tag-box.drawing {
		border-style: dashed;
		border-color: #38bdf8;
		background: rgba(56, 189, 248, 0.2);
	}

	.tag-chip {
		position: absolute;
		bottom: calc(100% + 4px);
		left: 0;
		background: rgba(15, 23, 42, 0.92);
		color: #fbbf24;
		font-size: 0.7rem;
		font-weight: 700;
		padding: 0.15rem 0.45rem;
		border-radius: 4px;
		white-space: nowrap;
		border: 1px solid rgba(251, 191, 36, 0.5);
	}

	.assign-popover {
		position: absolute;
		bottom: 1.25rem;
		left: 50%;
		transform: translateX(-50%);
		width: min(380px, 92vw);
		background: var(--bg-surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		padding: 0.85rem;
		box-shadow: var(--shadow-lg);
		z-index: 20;
	}

	.person-pick-list {
		max-height: 150px;
		overflow-y: auto;
		margin-top: 0.4rem;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
	}

	.person-pick-item {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.45rem 0.65rem;
		border: none;
		border-bottom: 1px solid var(--border-subtle);
		background: transparent;
		color: var(--text-primary);
		font-size: 0.8rem;
		cursor: pointer;
	}

	.person-pick-item:hover {
		background: var(--accent-soft);
	}

	.tags-sidebar {
		width: 260px;
		border-left: 1px solid var(--border-subtle);
		background: var(--bg-surface);
		padding: 0.95rem;
		overflow-y: auto;
	}

	.tag-list-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.45rem 0.6rem;
		border-radius: var(--radius-md);
		background: var(--bg-elevated);
		border: 1px solid var(--border-subtle);
	}
</style>
