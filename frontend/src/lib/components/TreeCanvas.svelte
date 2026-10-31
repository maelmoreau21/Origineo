<script lang="ts">
	import {
		layoutFamilyTree,
		centerViewOnPoint,
		fitViewToBounds,
		zoomViewAroundCenter,
		type CanvasView
	} from '$lib/family-layout';
	import { documentApi, type PersonDto, type TreeWindowDto } from '$lib/api';
	import { prefs } from '$lib/i18n/index.svelte';

	let {
		tree,
		rootPersonId,
		selectedPersonId,
		canModify,
		isAdmin,
		ancestors,
		descendants,
		onSelectPerson,
		onFocusPerson,
		onRequestAddRelative,
		onOpenCreateFirstPerson,
		onOpenGedcomModal
	}: {
		tree: TreeWindowDto | null;
		rootPersonId: string | null;
		selectedPersonId: string | null;
		canModify: boolean;
		isAdmin: boolean;
		ancestors: number;
		descendants: number;
		onSelectPerson: (id: string) => void;
		onFocusPerson: (id: string) => void;
		onRequestAddRelative: (id: string) => void;
		onOpenCreateFirstPerson: () => void;
		onOpenGedcomModal: () => void;
	} = $props();

	let viewportEl = $state<HTMLDivElement | null>(null);
	let view = $state<CanvasView>({ x: 0, y: 0, scale: 0.94 });
	let dragging = $state<{ startX: number; startY: number; vx: number; vy: number } | null>(null);
	let lastCenteredToken = '';

	const layout = $derived.by(() => {
		if (!tree || !rootPersonId || tree.nodes.length === 0) return null;
		return layoutFamilyTree(tree, rootPersonId);
	});

	const contentWidth = $derived(layout?.width || 1200);
	const contentHeight = $derived(layout?.height || 800);
	const offsetX = $derived(layout ? -layout.minX : 0);
	const offsetY = $derived(layout ? -layout.minY : 0);

	function getViewportSize() {
		const rect = viewportEl?.getBoundingClientRect();
		return {
			width: rect?.width || 1100,
			height: rect?.height || 740
		};
	}

	function centerOnPerson(personId?: string | null, scale = view.scale) {
		if (!layout || !personId) return;
		const target = layout.nodes.find((n) => n.id === personId);
		if (!target) return;
		view = centerViewOnPoint(
			{ x: target.cx + offsetX, y: target.cy + offsetY },
			getViewportSize(),
			scale
		);
	}

	function fitTree() {
		if (!layout) return;
		view = fitViewToBounds({ width: contentWidth, height: contentHeight }, getViewportSize(), 108);
	}

	function zoomBy(delta: number) {
		view = zoomViewAroundCenter(view, getViewportSize(), view.scale + delta);
	}

	function initialsOf(p: PersonDto): string {
		const g = (p.givenNames || '').trim()[0] || '';
		const s = (p.usageSurname || p.birthSurname || '').trim()[0] || '';
		return (g + s).toUpperCase() || '?';
	}

	function primarySurname(p: PersonDto): string {
		return (p.usageSurname || p.birthSurname || 'SANS NOM').toUpperCase();
	}

	function formatBirthCompact(p: PersonDto): string {
		const yr = p.birthDate ? p.birthDate.slice(0, 4) : '';
		const city = p.birthPlace ? p.birthPlace.split(',')[0].trim() : '';
		if (yr && city) return `${yr} · ${city}`;
		return yr || city || '';
	}

	function formatDeathCompact(p: PersonDto): string {
		const yr = p.deathDate ? p.deathDate.slice(0, 4) : '';
		const city = p.deathPlace ? p.deathPlace.split(',')[0].trim() : '';
		if (yr && city) return `${yr} · ${city}`;
		return yr || city || '';
	}

	$effect(() => {
		if (!layout || !rootPersonId) return;
		const token = `${rootPersonId}:${layout.nodes.length}:${ancestors}:${descendants}`;
		if (lastCenteredToken !== token) {
			lastCenteredToken = token;
			centerOnPerson(selectedPersonId || rootPersonId, 0.94);
		}
	});
</script>

<section class="canvas-pane">
	{#if !tree || !layout || tree.nodes.length === 0}
		<div class="empty-state">
			<div class="empty-card">
				<div class="empty-crest">
					<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
						<path d="M12 22v-7" />
						<path d="M7 15h10" />
						<circle cx="12" cy="6" r="3" />
						<circle cx="6" cy="18" r="2.5" />
						<circle cx="18" cy="18" r="2.5" />
						<path d="M12 9v6" />
						<path d="M7 15v.5" />
						<path d="M17 15v.5" />
					</svg>
				</div>
				<h2 class="font-serif-title" style="font-size: 1.45rem; font-weight: 700;">
					{prefs.t('emptyTreeTitle')}
				</h2>
				<p>{prefs.t('emptyTreeDesc')}</p>
				<div class="empty-actions">
					{#if canModify}
						<button type="button" class="btn btn-primary" onclick={onOpenCreateFirstPerson}>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
								<path d="M12 5v14M5 12h14" />
							</svg>
							{prefs.t('createRootPersonBtn')}
						</button>
					{/if}
					{#if isAdmin}
						<button type="button" class="btn btn-secondary" onclick={onOpenGedcomModal}>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
								<polyline points="17 8 12 3 7 8" />
								<line x1="12" y1="3" x2="12" y2="15" />
							</svg>
							{prefs.t('gedcomBtn')}
						</button>
					{/if}
				</div>
			</div>
		</div>
	{:else}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			bind:this={viewportEl}
			class="canvas-viewport"
			onwheel={(e) => {
				e.preventDefault();
				zoomBy(e.deltaY > 0 ? -0.08 : 0.08);
			}}
			onpointerdown={(e) => {
				const target = e.target as HTMLElement;
				if (target.closest('[data-card="true"]') || target.closest('[data-dock="true"]')) {
					return;
				}
				(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
				dragging = {
					startX: e.clientX,
					startY: e.clientY,
					vx: view.x,
					vy: view.y
				};
			}}
			onpointermove={(e) => {
				if (!dragging) return;
				view = {
					...view,
					x: dragging.vx + e.clientX - dragging.startX,
					y: dragging.vy + e.clientY - dragging.startY
				};
			}}
			onpointerup={() => (dragging = null)}
			onpointercancel={() => (dragging = null)}
		>
			<div
				class="canvas-content"
				style="width: {contentWidth}px; height: {contentHeight}px; transform: translate({view.x}px, {view.y}px) scale({view.scale});"
			>
				<svg
					class="link-layer"
					width={contentWidth}
					height={contentHeight}
					viewBox="0 0 {contentWidth} {contentHeight}"
				>
					<g transform="translate({offsetX} {offsetY})">
						{#each layout.links as link (link.id)}
							<path
								class={link.type === 'spouse'
									? 'link-spouse'
									: link.type === 'single-parent'
										? 'link-single'
										: 'link-parent'}
								d={link.path}
							/>
							{#if link.type === 'spouse' && link.points.length === 2}
								{@const mx = (link.points[0][0] + link.points[1][0]) / 2}
								{@const my = (link.points[0][1] + link.points[1][1]) / 2}
								<g transform="translate({mx}, {my})">
									<circle r="11" class="union-node-circle" />
									<text y="3.5" text-anchor="middle" class="union-node-symbol">⚭</text>
								</g>
							{/if}
						{/each}
					</g>
				</svg>

				{#each layout.nodes as node (node.tid)}
					{@const person = node.datum.data.person}
					{@const isSelected = selectedPersonId === node.id}
					{@const isCurrentRoot = rootPersonId === node.id}
					{@const bText = formatBirthCompact(person)}
					{@const dText = formatDeathCompact(person)}
					<div
						data-card="true"
						role="button"
						tabindex="0"
						class="person-card {person.gender === 'MALE'
							? 'person-male'
							: person.gender === 'FEMALE'
								? 'person-female'
								: 'person-other'} {isSelected ? 'selected' : ''} {isCurrentRoot ? 'is-root' : ''}"
						style="left: {node.x + offsetX}px; top: {node.y + offsetY}px;"
						onclick={(e) => {
							e.stopPropagation();
							onSelectPerson(node.id);
						}}
						ondblclick={(e) => {
							e.stopPropagation();
							onSelectPerson(node.id);
							onFocusPerson(node.id);
						}}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								onSelectPerson(node.id);
							}
						}}
						title={prefs.t('doubleClickCardTitle', { anc: ancestors, desc: descendants })}
					>
						<!-- Top Accent Bar -->
						<div class="card-accent-bar"></div>

						{#if canModify}
							<button
								type="button"
								class="add-relative-btn"
								title={prefs.t('addRelativeTooltip')}
								onclick={(e) => {
									e.stopPropagation();
									onSelectPerson(node.id);
									onRequestAddRelative(node.id);
								}}
							>
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
									<path d="M12 5v14M5 12h14" />
								</svg>
							</button>
						{/if}

						<!-- Main Row: Portrait Medallion + Identity -->
						<div class="card-main">
							<div class="portrait-medallion">
								{#if person.hasProfilePhoto}
									<img
										src={documentApi.profilePhotoUrl(person.id)}
										alt=""
										loading="lazy"
									/>
								{:else}
									<span>{initialsOf(person)}</span>
								{/if}
								<span class="gender-dot"></span>
							</div>

							<div class="identity-col">
								<div class="badges-row">
									{#if isCurrentRoot}
										<span class="pill pill-root">{prefs.t('rootBadge')}</span>
									{:else}
										<span class="pill pill-gen">
											{node.generation > 0 ? `+${node.generation}G` : `${node.generation}G`}
										</span>
									{/if}
									{#if person.sosaNumber}
										<span class="pill pill-sosa mono">Sosa {person.sosaNumber}</span>
									{/if}
									{#if person.sosaNumbers && person.sosaNumbers.length > 1}
										<span
											class="pill pill-implex mono"
											title="Implex : ancêtre présent {person.sosaNumbers.length} fois (Sosa {person.sosaNumbers.join(', ')})"
										>
											×{person.sosaNumbers.length}
										</span>
									{/if}
								</div>

								<div class="surname-line">{primarySurname(person)}</div>
								<div class="given-line">{person.givenNames || '—'}</div>
							</div>
						</div>

						<!-- Vital Dates & Places Footer -->
						<div class="card-vitals">
							{#if bText || dText}
								{#if bText}
									<span class="vital-chip">
										<strong class="vital-sym">°</strong> {bText}
									</span>
								{/if}
								{#if dText}
									<span class="vital-chip">
										<strong class="vital-sym">†</strong> {dText}
									</span>
								{/if}
							{:else}
								<span class="vital-unknown">{prefs.t('datesUnknown')}</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>

			<!-- Bottom-left Telemetry Dock -->
			<div class="status-dock" data-dock="true">
				<div class="status-pill">
					<span class="live-dot"></span>
					<span>
						<strong>{tree.stats.visiblePersons}</strong> {prefs.t('individualsUnit')}
					</span>
					<span class="sep">·</span>
					<span>
						<strong>{tree.stats.visibleUnions}</strong> {prefs.t('unionsUnit')}
					</span>
					<span class="sep">·</span>
					<span class="mono" style="font-size: 0.72rem; color: var(--accent);">
						{ancestors}A / {descendants}D
					</span>
				</div>
			</div>

			<!-- Bottom-right Studio Camera Dock -->
			<div class="zoom-dock" data-dock="true">
				<button type="button" class="dock-btn" onclick={() => zoomBy(-0.15)} title="Zoom arrière">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
						<line x1="5" y1="12" x2="19" y2="12" />
					</svg>
				</button>
				<button
					type="button"
					class="dock-zoom-label mono"
					onclick={() => centerOnPerson(selectedPersonId || rootPersonId, 1.0)}
					title={prefs.t('zoomReset')}
				>
					{Math.round(view.scale * 100)}%
				</button>
				<button type="button" class="dock-btn" onclick={() => zoomBy(0.15)} title="Zoom avant">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
						<line x1="12" y1="5" x2="12" y2="19" />
						<line x1="5" y1="12" x2="19" y2="12" />
					</svg>
				</button>
				<div class="dock-sep"></div>
				<button type="button" class="dock-action" onclick={fitTree}>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
					</svg>
					<span>{prefs.t('fitView')}</span>
				</button>
				{#if rootPersonId}
					<button
						type="button"
						class="dock-action"
						onclick={() => {
							centerOnPerson(rootPersonId, 0.94);
							if (rootPersonId) onSelectPerson(rootPersonId);
						}}
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="3" />
							<path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
						</svg>
						<span>{prefs.t('centerRoot')}</span>
					</button>
				{/if}
			</div>
		</div>
	{/if}
</section>

<style>
	.canvas-pane {
		position: relative;
		flex: 1;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: var(--bg-canvas);
	}

	.canvas-viewport {
		position: absolute;
		inset: 0;
		overflow: hidden;
		cursor: grab;
		background-color: var(--bg-canvas);
		background-image:
			radial-gradient(var(--canvas-dots) 1px, transparent 1px),
			linear-gradient(var(--canvas-grid) 1px, transparent 1px),
			linear-gradient(90deg, var(--canvas-grid) 1px, transparent 1px);
		background-size:
			24px 24px,
			120px 120px,
			120px 120px;
	}

	.canvas-viewport:active {
		cursor: grabbing;
	}

	.canvas-content {
		position: absolute;
		left: 0;
		top: 0;
		transform-origin: 0 0;
	}

	.link-layer {
		position: absolute;
		inset: 0;
		overflow: visible;
		pointer-events: none;
	}

	.link-spouse {
		fill: none;
		stroke: var(--link-spouse);
		stroke-width: 2.4;
		stroke-linecap: round;
	}

	.link-parent {
		fill: none;
		stroke: var(--link-parent);
		stroke-width: 2;
		stroke-opacity: 0.78;
		stroke-linecap: round;
	}

	.link-single {
		fill: none;
		stroke: var(--link-single);
		stroke-width: 1.8;
		stroke-dasharray: 5 5;
	}

	.union-node-circle {
		fill: var(--bg-surface);
		stroke: var(--link-spouse);
		stroke-width: 1.8;
	}

	.union-node-symbol {
		fill: var(--link-spouse);
		font-size: 11px;
		font-weight: 800;
	}

	/* ─── Studio Pedigree Card (256 × 118) ────────────────────────────────── */
	.person-card {
		position: absolute;
		width: 256px;
		height: 118px;
		padding: 0.7rem 0.85rem 0.6rem;
		border-radius: 14px;
		background: var(--bg-surface);
		border: 1px solid var(--border-color);
		box-shadow: var(--shadow-card);
		cursor: pointer;
		user-select: none;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		transition:
			transform 0.16s cubic-bezier(0.16, 1, 0.3, 1),
			border-color 0.16s ease,
			box-shadow 0.16s ease;
	}

	.card-accent-bar {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3.5px;
		background: var(--color-other);
		opacity: 0.9;
	}

	.person-male .card-accent-bar {
		background: linear-gradient(90deg, var(--color-male), #6366f1);
	}

	.person-female .card-accent-bar {
		background: linear-gradient(90deg, var(--color-female), #ec4899);
	}

	.person-card:hover {
		transform: translateY(-3px);
		border-color: var(--border-strong);
		box-shadow: var(--shadow-lg);
	}

	.person-card.selected {
		border-color: var(--accent);
		box-shadow:
			0 0 0 2px var(--accent),
			var(--shadow-lg);
	}

	.person-card.is-root {
		background: linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-surface) 100%);
		border-color: var(--accent);
	}

	/* Portrait Medallion */
	.card-main {
		display: flex;
		align-items: center;
		gap: 0.72rem;
		min-width: 0;
		margin-top: 0.1rem;
	}

	.portrait-medallion {
		position: relative;
		width: 44px;
		height: 44px;
		border-radius: 50%;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 800;
		font-size: 0.86rem;
		letter-spacing: 0.02em;
		background: var(--color-other-bg);
		color: var(--color-other);
		border: 1.5px solid var(--color-other-border);
	}

	.person-male .portrait-medallion {
		background: var(--color-male-bg);
		color: var(--color-male);
		border-color: var(--color-male-border);
	}

	.person-female .portrait-medallion {
		background: var(--color-female-bg);
		color: var(--color-female);
		border-color: var(--color-female-border);
	}

	.portrait-medallion img {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		object-fit: cover;
	}

	.gender-dot {
		position: absolute;
		bottom: -1px;
		right: -1px;
		width: 11px;
		height: 11px;
		border-radius: 50%;
		background: var(--color-other);
		border: 2px solid var(--bg-surface);
	}

	.person-male .gender-dot {
		background: var(--color-male);
	}

	.person-female .gender-dot {
		background: var(--color-female);
	}

	.identity-col {
		min-width: 0;
		flex: 1;
		padding-right: 1.2rem;
	}

	.badges-row {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		margin-bottom: 0.18rem;
		flex-wrap: nowrap;
		overflow: hidden;
	}

	.pill {
		font-size: 0.62rem;
		font-weight: 800;
		padding: 0.08rem 0.38rem;
		border-radius: 999px;
		letter-spacing: 0.03em;
		white-space: nowrap;
	}

	.pill-root {
		background: var(--accent-soft);
		color: var(--accent);
		border: 1px solid rgba(16, 185, 129, 0.35);
	}

	.pill-gen {
		background: var(--bg-elevated);
		color: var(--text-secondary);
		border: 1px solid var(--border-subtle);
	}

	.pill-sosa {
		background: var(--gold-soft);
		color: var(--gold);
	}

	.pill-implex {
		background: rgba(239, 68, 68, 0.16);
		color: #f87171;
	}

	.surname-line {
		font-size: 0.82rem;
		font-weight: 800;
		letter-spacing: 0.03em;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		line-height: 1.2;
	}

	.given-line {
		font-size: 0.78rem;
		font-weight: 500;
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		line-height: 1.25;
	}

	.card-vitals {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding-top: 0.38rem;
		border-top: 1px solid var(--border-subtle);
		font-size: 0.71rem;
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
	}

	.vital-chip {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.vital-sym {
		color: var(--accent);
		font-weight: 800;
	}

	.vital-unknown {
		color: var(--text-muted);
		font-style: italic;
		font-size: 0.7rem;
	}

	.add-relative-btn {
		position: absolute;
		top: 0.55rem;
		right: 0.55rem;
		width: 24px;
		height: 24px;
		border-radius: 7px;
		border: 1px solid var(--border-color);
		background: var(--bg-elevated);
		color: var(--text-secondary);
		cursor: pointer;
		display: grid;
		place-items: center;
		opacity: 0.75;
		transition: all 0.15s ease;
	}

	.person-card:hover .add-relative-btn {
		opacity: 1;
	}

	.add-relative-btn:hover {
		background: var(--accent);
		border-color: var(--accent);
		color: #ffffff;
		transform: scale(1.06);
	}

	/* ─── Floating Glass HUD Docks ────────────────────────────────────────── */
	.status-dock {
		position: absolute;
		left: 1.15rem;
		bottom: 1.15rem;
		z-index: 20;
	}

	.status-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.48rem 0.95rem;
		border-radius: 999px;
		background: var(--bg-glass-heavy);
		backdrop-filter: blur(16px);
		border: 1px solid var(--border-color);
		font-size: 0.77rem;
		color: var(--text-secondary);
		box-shadow: var(--shadow-md);
	}

	.status-pill strong {
		color: var(--text-primary);
		font-weight: 700;
	}

	.live-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--accent);
		box-shadow: 0 0 8px var(--accent);
	}

	.sep {
		color: var(--text-muted);
	}

	.zoom-dock {
		position: absolute;
		right: 1.15rem;
		bottom: 1.15rem;
		z-index: 20;
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.35rem;
		border-radius: 12px;
		background: var(--bg-glass-heavy);
		backdrop-filter: blur(16px);
		border: 1px solid var(--border-color);
		box-shadow: var(--shadow-md);
	}

	.dock-btn,
	.dock-zoom-label,
	.dock-action {
		height: 31px;
		border-radius: 8px;
		border: 0;
		background: transparent;
		color: var(--text-primary);
		font-size: 0.77rem;
		font-weight: 600;
		padding: 0 0.6rem;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 0.38rem;
		transition: background 0.14s ease;
	}

	.dock-btn:hover,
	.dock-zoom-label:hover,
	.dock-action:hover {
		background: var(--bg-elevated);
	}

	.dock-sep {
		width: 1px;
		height: 18px;
		background: var(--border-color);
		margin: 0 0.15rem;
	}

	/* ─── Empty State ─────────────────────────────────────────────────────── */
	.empty-state {
		height: 100%;
		display: grid;
		place-items: center;
		padding: 2rem;
		background-image: radial-gradient(var(--canvas-dots) 1px, transparent 1px);
		background-size: 24px 24px;
	}

	.empty-card {
		max-width: 480px;
		text-align: center;
		padding: 2.6rem 2.25rem;
		border-radius: var(--radius-xl);
		background: var(--bg-surface);
		border: 1px solid var(--border-color);
		box-shadow: var(--shadow-lg);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.9rem;
	}

	.empty-crest {
		width: 68px;
		height: 68px;
		border-radius: 20px;
		background: var(--accent-soft);
		color: var(--accent);
		border: 1px solid rgba(16, 185, 129, 0.35);
		display: grid;
		place-items: center;
	}

	.empty-card p {
		color: var(--text-secondary);
		font-size: 0.88rem;
		line-height: 1.6;
	}

	.empty-actions {
		margin-top: 0.5rem;
		display: flex;
		justify-content: center;
		gap: 0.65rem;
		flex-wrap: wrap;
	}
</style>
