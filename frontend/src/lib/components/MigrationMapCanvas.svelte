<script lang="ts">
	import { mapApi, type MapPlaceDto, type MigrationArcDto } from '$lib/api';
	import { i18n } from '$lib/i18n/index.svelte';
	import { onMount } from 'svelte';

	let { canModify = false }: { canModify?: boolean } = $props();

	let places = $state<MapPlaceDto[]>([]);
	let migrations = $state<MigrationArcDto[]>([]);
	let loading = $state(true);
	let selectedPlace = $state<MapPlaceDto | null>(null);
	let editLat = $state('');
	let editLng = $state('');
	let savingCoords = $state(false);
	let filterKind = $state<'ALL' | 'PARENT_TO_CHILD' | 'BIRTH_TO_DEATH'>('ALL');

	// Map pan & zoom state (Equirectangular / Mercator-like projection centered on Europe/France)
	let scale = $state(1.0);
	let panX = $state(0);
	let panY = $state(0);
	let dragging = $state<{ startX: number; startY: number; px: number; py: number } | null>(null);

	onMount(async () => {
		await loadMapData();
	});

	async function loadMapData() {
		loading = true;
		try {
			const res = await mapApi.getFamilyMap();
			places = res.places;
			migrations = res.migrations;
			if (res.places.length > 0 && !selectedPlace) {
				selectPlace(res.places[0]);
			}
		} catch (e) {
			console.error('Failed loading map data:', e);
		} finally {
			loading = false;
		}
	}

	function selectPlace(p: MapPlaceDto) {
		selectedPlace = p;
		editLat = p.latitude !== null ? String(p.latitude) : '';
		editLng = p.longitude !== null ? String(p.longitude) : '';
	}

	async function saveCoords(e: SubmitEvent) {
		e.preventDefault();
		if (!selectedPlace) return;
		const lat = parseFloat(editLat);
		const lng = parseFloat(editLng);
		if (Number.isNaN(lat) || Number.isNaN(lng)) return;
		savingCoords = true;
		try {
			await mapApi.updatePlaceCoords(selectedPlace.id, lat, lng);
			await loadMapData();
		} finally {
			savingCoords = false;
		}
	}

	// Project (lat, lng) into SVG viewBox (-500 -350 1000 700), centered on (46.5°N, 2.5°E)
	function project(lat: number, lng: number): { x: number; y: number } {
		const centerLat = 46.5;
		const centerLng = 2.5;
		const x = (lng - centerLng) * 24;
		const y = -(lat - centerLat) * 32;
		return { x, y };
	}

	const geoPlaces = $derived(
		places.filter((p): p is MapPlaceDto & { latitude: number; longitude: number } =>
			p.latitude !== null && p.longitude !== null
		)
	);

	const visibleMigrations = $derived(
		migrations.filter((m) => filterKind === 'ALL' || m.kind === filterKind)
	);

	function buildArcPath(m: MigrationArcDto): string {
		const p1 = project(m.fromLat, m.fromLng);
		const p2 = project(m.toLat, m.toLng);
		const dx = p2.x - p1.x;
		const dy = p2.y - p1.y;
		const cx = (p1.x + p2.x) / 2 - dy * 0.22;
		const cy = (p1.y + p2.y) / 2 + dx * 0.22;
		return `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
	}
</script>

<div class="map-layout">
	<!-- Interactive SVG Vector Map -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="map-viewport"
		role="application"
		aria-label="Carte des migrations familiales"
		onwheel={(e) => {
			e.preventDefault();
			const factor = e.deltaY < 0 ? 1.15 : 0.87;
			scale = Math.min(8.0, Math.max(0.25, scale * factor));
		}}
		onpointerdown={(e) => {
			if ((e.target as HTMLElement).closest('[data-map-ui="true"]')) return;
			dragging = { startX: e.clientX, startY: e.clientY, px: panX, py: panY };
		}}
		onpointermove={(e) => {
			if (!dragging) return;
			panX = dragging.px + (e.clientX - dragging.startX);
			panY = dragging.py + (e.clientY - dragging.startY);
		}}
		onpointerup={() => (dragging = null)}
	>
		<div class="map-toolbar" data-map-ui="true">
			<div style="display: flex; align-items: center; gap: 0.6rem;">
				<span style="font-weight: 800; font-size: 0.88rem;">{i18n.t('mapTitle')}</span>
				<span class="badge badge-accent">{i18n.t('geolocatedPlaces', { geo: geoPlaces.length, total: places.length })}</span>
				<span class="badge badge-success">{i18n.t('migrationFlows', { count: visibleMigrations.length })}</span>
			</div>

			<div style="display: flex; gap: 0.4rem;">
				<button
					type="button"
					class="btn btn-sm {filterKind === 'ALL' ? 'btn-primary' : 'btn-secondary'}"
					onclick={() => (filterKind = 'ALL')}
				>
					{i18n.t('allFlows')}
				</button>
				<button
					type="button"
					class="btn btn-sm {filterKind === 'PARENT_TO_CHILD' ? 'btn-primary' : 'btn-secondary'}"
					onclick={() => (filterKind = 'PARENT_TO_CHILD')}
				>
					{i18n.t('parentToChildFlows')}
				</button>
				<button
					type="button"
					class="btn btn-sm {filterKind === 'BIRTH_TO_DEATH' ? 'btn-primary' : 'btn-secondary'}"
					onclick={() => (filterKind = 'BIRTH_TO_DEATH')}
				>
					{i18n.t('birthToDeathFlows')}
				</button>
			</div>
		</div>

		<svg viewBox="-500 -350 1000 700" style="width: 100%; height: 100%;">
			<defs>
				<marker id="arrow-gen" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
					<path d="M 0 1 L 10 5 L 0 9 z" fill="#6366f1" />
				</marker>
				<marker id="arrow-life" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
					<path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
				</marker>
			</defs>

			<g transform="translate({panX}, {panY}) scale({scale})">
				<!-- Latitude / Longitude Grid -->
				{#each [-60, -40, -20, 0, 20, 40] as lng}
					{@const p = project(46.5, lng)}
					<line x1={p.x} y1="-1500" x2={p.x} y2="1500" stroke="var(--canvas-grid)" stroke-width={1 / scale} />
				{/each}
				{#each [30, 35, 40, 45, 50, 55, 60] as lat}
					{@const p = project(lat, 2.5)}
					<line x1="-2500" y1={p.y} x2="2500" y2={p.y} stroke="var(--canvas-grid)" stroke-width={1 / scale} />
				{/each}

				<!-- Simplified Reference Outline of France / Western Europe -->
				<polygon
					points="{project(51.09, 2.54).x},{project(51.09, 2.54).y} {project(48.57, 7.75).x},{project(48.57, 7.75).y} {project(46.2, 6.14).x},{project(46.2, 6.14).y} {project(43.7, 7.26).x},{project(43.7, 7.26).y} {project(43.3, 5.37).x},{project(43.3, 5.37).y} {project(42.68, 2.89).x},{project(42.68, 2.89).y} {project(43.49, -1.47).x},{project(43.49, -1.47).y} {project(44.83, -0.57).x},{project(44.83, -0.57).y} {project(47.21, -1.55).x},{project(47.21, -1.55).y} {project(48.39, -4.48).x},{project(48.39, -4.48).y} {project(48.64, -2.02).x},{project(48.64, -2.02).y} {project(49.49, 0.1).x},{project(49.49, 0.1).y}"
					fill="rgba(99, 102, 241, 0.05)"
					stroke="rgba(148, 163, 184, 0.25)"
					stroke-width={1.5 / scale}
					stroke-dasharray="4 3"
				/>

				<!-- Migration Curved Arcs -->
				{#each visibleMigrations as m, i (m.fromPlaceId + '-' + m.toPlaceId + '-' + m.kind + '-' + i)}
					<path
						d={buildArcPath(m)}
						fill="none"
						stroke={m.kind === 'PARENT_TO_CHILD' ? '#6366f1' : '#10b981'}
						stroke-width={Math.min(5, 1.5 + m.count * 0.5) / Math.sqrt(scale)}
						stroke-opacity="0.72"
						marker-end={m.kind === 'PARENT_TO_CHILD' ? 'url(#arrow-gen)' : 'url(#arrow-life)'}
					>
						<title>
							{m.fromName} → {m.toName} ({m.count} {m.kind === 'PARENT_TO_CHILD' ? 'génération(s)' : 'parcours de vie'})
						</title>
					</path>
				{/each}

				<!-- Geo-located Place Nodes -->
				{#each geoPlaces as pl (pl.id)}
					{@const pos = project(pl.latitude, pl.longitude)}
					{@const radius = Math.min(20, 6 + Math.sqrt(pl.totalEvents) * 2.5) / Math.sqrt(scale)}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<g
						style="cursor: pointer;"
						onclick={(e) => {
							e.stopPropagation();
							selectPlace(pl);
						}}
					>
						<circle
							cx={pos.x}
							cy={pos.y}
							r={radius}
							fill={selectedPlace?.id === pl.id ? '#f59e0b' : '#6366f1'}
							fill-opacity="0.85"
							stroke="#ffffff"
							stroke-width={1.5 / Math.sqrt(scale)}
						/>
						<text
							x={pos.x}
							y={pos.y - radius - 4 / Math.sqrt(scale)}
							text-anchor="middle"
							fill="currentColor"
							font-size={11 / Math.sqrt(scale)}
							font-weight="700"
						>
							{pl.name} ({pl.totalEvents})
						</text>
					</g>
				{/each}
			</g>
		</svg>
	</div>

	<!-- Side Panel of Places & Coordinate Editor -->
	<aside class="map-sidebar">
		<div style="padding: 1rem; border-bottom: 1px solid var(--border-subtle);">
			<h3 style="margin: 0; font-size: 0.95rem; font-weight: 800;">{i18n.t('familyPlacesTitle', { count: places.length })}</h3>
			<p style="margin: 0.25rem 0 0; font-size: 0.76rem; color: var(--text-secondary);">
				{i18n.t('familyPlacesHint')}
			</p>
		</div>

		{#if selectedPlace}
			<div style="padding: 1rem; border-bottom: 1px solid var(--border-subtle); background: var(--bg-elevated);">
				<div style="font-weight: 800; font-size: 0.92rem;">{selectedPlace.name}</div>
				<div style="font-size: 0.76rem; color: var(--text-secondary); margin-top: 0.15rem;">
					° {selectedPlace.birthCount} naissance(s) • † {selectedPlace.deathCount} décès
				</div>

				{#if selectedPlace.samplePersons.length > 0}
					<div style="display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.55rem;">
						{#each selectedPlace.samplePersons as sp}
							<span class="badge badge-accent">{sp}</span>
						{/each}
					</div>
				{/if}

				{#if canModify}
					<form onsubmit={saveCoords} style="margin-top: 0.75rem; display: flex; flex-direction: column; gap: 0.45rem;">
						<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem;">
							<input
								class="input"
								style="padding: 0.35rem 0.5rem; font-size: 0.78rem;"
								placeholder="Latitude (ex: 48.8566)"
								bind:value={editLat}
							/>
							<input
								class="input"
								style="padding: 0.35rem 0.5rem; font-size: 0.78rem;"
								placeholder="Longitude (ex: 2.3522)"
								bind:value={editLng}
							/>
						</div>
						<button type="submit" class="btn btn-primary btn-sm" disabled={savingCoords}>
							💾 Enregistrer coordonnées GPS
						</button>
					</form>
				{/if}
			</div>
		{/if}

		<div style="flex: 1; overflow-y: auto; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.35rem;">
			{#if loading}
				<p style="font-size: 0.82rem; color: var(--text-muted);">Chargement des lieux...</p>
			{:else if places.length === 0}
				<p style="font-size: 0.82rem; color: var(--text-muted);">Aucun lieu renseigné dans l'arbre.</p>
			{:else}
				{#each places as p (p.id)}
					<button
						type="button"
						class="place-item"
						class:active={selectedPlace?.id === p.id}
						onclick={() => selectPlace(p)}
					>
						<div>
							<div style="font-weight: 700; font-size: 0.83rem;">{p.name}</div>
							<div style="font-size: 0.72rem; color: var(--text-muted);">
								{[p.region, p.country].filter(Boolean).join(', ') || '—'}
							</div>
						</div>
						<div style="display: flex; align-items: center; gap: 0.35rem;">
							{#if p.latitude !== null && p.longitude !== null}
								<span class="badge badge-success" title="Géolocalisé">GPS</span>
							{:else}
								<span class="badge badge-warning" title="Coordonnées manquantes">?</span>
							{/if}
							<span class="badge badge-accent">{p.totalEvents}</span>
						</div>
					</button>
				{/each}
			{/if}
		</div>
	</aside>
</div>

<style>
	.map-layout {
		display: flex;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: var(--bg-canvas);
		color: var(--text-primary);
	}

	.map-viewport {
		position: relative;
		flex: 1;
		height: 100%;
		overflow: hidden;
		cursor: grab;
	}

	.map-viewport:active {
		cursor: grabbing;
	}

	.map-toolbar {
		position: absolute;
		top: 1rem;
		left: 1rem;
		z-index: 20;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		padding: 0.65rem 1rem;
		background: var(--bg-glass);
		backdrop-filter: blur(12px);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-md);
	}

	.map-sidebar {
		width: 340px;
		height: 100%;
		background: var(--bg-surface);
		border-left: 1px solid var(--border-subtle);
		display: flex;
		flex-direction: column;
	}

	.place-item {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.55rem 0.7rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--border-subtle);
		background: var(--bg-elevated);
		color: var(--text-primary);
		text-align: left;
		cursor: pointer;
	}

	.place-item.active {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
</style>
