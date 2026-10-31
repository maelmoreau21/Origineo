<script lang="ts">
	import { formatLifeYears, personLabel, type PersonDto, type TreeWindowDto } from '$lib/api';
	import { i18n } from '$lib/i18n/index.svelte';

	let {
		tree,
		rootPersonId,
		selectedPersonId,
		onSelectPerson,
		onFocusPerson
	}: {
		tree: TreeWindowDto | null;
		rootPersonId: string | null;
		selectedPersonId: string | null;
		onSelectPerson: (id: string) => void;
		onFocusPerson: (id: string) => void;
	} = $props();

	let maxGen = $state(5); // 4 to 7 generations
	let fanAngleDeg = $state<240 | 360>(240);
	let scale = $state(1.0);
	let panX = $state(0);
	let panY = $state(0);
	let dragging = $state<{ startX: number; startY: number; px: number; py: number } | null>(null);
	let svgEl = $state<SVGSVGElement | null>(null);

	interface WedgeCell {
		sosa: number;
		generation: number;
		indexInGen: number;
		person: PersonDto | null;
		pathD: string;
		labelX: number;
		labelY: number;
		labelRotation: number;
		isImplex: boolean;
	}

	const RING_WIDTH = 68;
	const INNER_RADIUS = 56;

	function polarToCartesian(cx: number, cy: number, r: number, angleRad: number) {
		return {
			x: cx + r * Math.cos(angleRad),
			y: cy + r * Math.sin(angleRad)
		};
	}

	function createWedgePath(
		cx: number,
		cy: number,
		rInner: number,
		rOuter: number,
		startAngle: number,
		endAngle: number
	): string {
		const p1 = polarToCartesian(cx, cy, rOuter, startAngle);
		const p2 = polarToCartesian(cx, cy, rOuter, endAngle);
		const p3 = polarToCartesian(cx, cy, rInner, endAngle);
		const p4 = polarToCartesian(cx, cy, rInner, startAngle);
		const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

		return [
			`M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
			`A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
			`L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
			`A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
			'Z'
		].join(' ');
	}

	const fanData = $derived.by(() => {
		if (!tree || !rootPersonId) {
			return { rootPerson: null as PersonDto | null, wedges: [] as WedgeCell[], completenessPct: 0, implexCount: 0 };
		}

		const personById = new Map<string, PersonDto>();
		for (const n of tree.nodes) {
			personById.set(n.person.id, n.person);
		}

		const parentsByChild = new Map<string, { father?: PersonDto; mother?: PersonDto; others: PersonDto[] }>();
		for (const rel of tree.relationships) {
			const parent = personById.get(rel.parentId);
			if (!parent) continue;
			const entry = parentsByChild.get(rel.childId) || { others: [] };
			if (parent.gender === 'MALE' && !entry.father) {
				entry.father = parent;
			} else if (parent.gender === 'FEMALE' && !entry.mother) {
				entry.mother = parent;
			} else {
				entry.others.push(parent);
			}
			parentsByChild.set(rel.childId, entry);
		}

		// Fill Sosa slots 1 .. 2^(maxGen) - 1
		const sosaSlots = new Map<number, PersonDto>();
		const rootPerson = personById.get(rootPersonId) || null;
		if (rootPerson) {
			sosaSlots.set(1, rootPerson);
		}

		const countsById = new Map<string, number>();
		if (rootPerson) countsById.set(rootPerson.id, 1);

		for (let g = 0; g < maxGen - 1; g++) {
			const startSosa = 1 << g;
			const endSosa = (1 << (g + 1)) - 1;
			for (let s = startSosa; s <= endSosa; s++) {
				const child = sosaSlots.get(s);
				if (!child) continue;
				const pEntry = parentsByChild.get(child.id);
				if (!pEntry) continue;

				const father = pEntry.father || pEntry.others[0];
				const mother = pEntry.mother || (pEntry.father ? pEntry.others[0] : pEntry.others[1]);

				if (father) {
					sosaSlots.set(s * 2, father);
					countsById.set(father.id, (countsById.get(father.id) || 0) + 1);
				}
				if (mother) {
					sosaSlots.set(s * 2 + 1, mother);
					countsById.set(mother.id, (countsById.get(mother.id) || 0) + 1);
				}
			}
		}

		const totalSpanRad = (fanAngleDeg * Math.PI) / 180;
		const baseStartRad = -Math.PI / 2 - totalSpanRad / 2;

		const wedges: WedgeCell[] = [];
		let filledSlots = rootPerson ? 1 : 0;
		const totalPossibleSlots = (1 << maxGen) - 1;

		for (let g = 1; g < maxGen; g++) {
			const countInGen = 1 << g;
			const startSosa = countInGen;
			const rInner = INNER_RADIUS + (g - 1) * RING_WIDTH;
			const rOuter = INNER_RADIUS + g * RING_WIDTH;
			const angleStep = totalSpanRad / countInGen;

			for (let i = 0; i < countInGen; i++) {
				const sosa = startSosa + i;
				const person = sosaSlots.get(sosa) || null;
				if (person) filledSlots++;

				const a0 = baseStartRad + i * angleStep;
				const a1 = a0 + angleStep;
				const midAngle = (a0 + a1) / 2;
				const midRadius = (rInner + rOuter) / 2;
				const pos = polarToCartesian(0, 0, midRadius, midAngle);

				let deg = (midAngle * 180) / Math.PI;
				if (deg > 90 && deg < 270) deg += 180;
				else if (deg < -90 && deg > -270) deg += 180;

				wedges.push({
					sosa,
					generation: g,
					indexInGen: i,
					person,
					pathD: createWedgePath(0, 0, rInner, rOuter, a0, a1),
					labelX: pos.x,
					labelY: pos.y,
					labelRotation: deg,
					isImplex: person ? (countsById.get(person.id) || 0) > 1 : false
				});
			}
		}

		let implexCount = 0;
		for (const [, cnt] of countsById) {
			if (cnt > 1) implexCount++;
		}

		const completenessPct = Math.round((filledSlots / totalPossibleSlots) * 100);
		return { rootPerson, wedges, completenessPct, implexCount };
	});

	function exportSvg() {
		if (!svgEl) return;
		const serializer = new XMLSerializer();
		const source = serializer.serializeToString(svgEl);
		const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `origineo_roue_ascendance_${maxGen}G.svg`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="fanchart-viewport"
	role="application"
	aria-label="Roue d'ascendance interactive"
	onwheel={(e) => {
		e.preventDefault();
		const factor = e.deltaY < 0 ? 1.1 : 0.9;
		scale = Math.min(3.0, Math.max(0.35, scale * factor));
	}}
	onpointerdown={(e) => {
		if ((e.target as HTMLElement).closest('[data-controls="true"]')) return;
		dragging = { startX: e.clientX, startY: e.clientY, px: panX, py: panY };
	}}
	onpointermove={(e) => {
		if (!dragging) return;
		panX = dragging.px + (e.clientX - dragging.startX);
		panY = dragging.py + (e.clientY - dragging.startY);
	}}
	onpointerup={() => (dragging = null)}
>
	<!-- Top-left Fan Chart Controls -->
	<div class="fanchart-toolbar" data-controls="true">
		<div style="display: flex; align-items: center; gap: 0.6rem;">
			<span style="font-weight: 800; font-size: 0.85rem;">{i18n.t('fanChartTitle')}</span>
			<span class="badge badge-accent">{i18n.t('completenessLabel')} : {fanData.completenessPct}%</span>
			{#if fanData.implexCount > 0}
				<span class="badge badge-warning">Implex : {fanData.implexCount}</span>
			{/if}
		</div>

		<div style="display: flex; align-items: center; gap: 0.5rem;">
			<label style="font-size: 0.78rem; color: var(--text-secondary);">
				{i18n.t('generationsCountLabel')} :
				<select class="select" style="width: auto; display: inline-block; padding: 0.25rem 0.5rem; margin-left: 0.25rem;" bind:value={maxGen}>
					<option value={4}>4G (15 Sosa)</option>
					<option value={5}>5G (31 Sosa)</option>
					<option value={6}>6G (63 Sosa)</option>
					<option value={7}>7G (127 Sosa)</option>
				</select>
			</label>

			<button
				type="button"
				class="btn btn-secondary btn-sm"
				onclick={() => (fanAngleDeg = fanAngleDeg === 240 ? 360 : 240)}
			>
				{fanAngleDeg}°
			</button>

			<button type="button" class="btn btn-primary btn-sm" onclick={exportSvg}>
				⬇ {i18n.t('exportSvgBtn')}
			</button>
		</div>
	</div>

	<svg
		bind:this={svgEl}
		xmlns="http://www.w3.org/2000/svg"
		viewBox="-550 -520 1100 960"
		style="width: 100%; height: 100%;"
	>
		<g transform="translate({panX}, {panY}) scale({scale})">
			<!-- Ancestor Wedges -->
			{#each fanData.wedges as w (w.sosa)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<g
					class="wedge-group"
					style="cursor: {w.person ? 'pointer' : 'default'};"
					onclick={(e) => {
						e.stopPropagation();
						if (w.person) onSelectPerson(w.person.id);
					}}
					ondblclick={(e) => {
						e.stopPropagation();
						if (w.person) onFocusPerson(w.person.id);
					}}
				>
					<path
						d={w.pathD}
						fill={!w.person
							? 'rgba(148, 163, 184, 0.08)'
							: w.isImplex
								? 'rgba(245, 158, 11, 0.28)'
								: w.person.gender === 'MALE'
									? 'rgba(59, 130, 246, 0.24)'
									: 'rgba(236, 72, 153, 0.24)'}
						stroke={w.person && w.person.id === selectedPersonId
							? '#6366f1'
							: w.isImplex
								? '#f59e0b'
								: 'rgba(148, 163, 184, 0.28)'}
						stroke-width={w.person && w.person.id === selectedPersonId ? '2.5' : '1'}
					>
						<title>
							Sosa #{w.sosa} : {w.person ? `${personLabel(w.person)} (${formatLifeYears(w.person)})` : 'Ancêtre non renseigné'}
						</title>
					</path>

					{#if w.person && w.generation <= 5}
						<text
							x={w.labelX}
							y={w.labelY}
							transform="rotate({w.labelRotation}, {w.labelX}, {w.labelY})"
							text-anchor="middle"
							dominant-baseline="middle"
							fill="currentColor"
							font-size={w.generation <= 3 ? '10' : '8'}
							font-weight="700"
						>
							{w.person.usageSurname || w.person.birthSurname || w.person.givenNames}
						</text>
					{:else if !w.person && w.generation <= 4}
						<text
							x={w.labelX}
							y={w.labelY}
							text-anchor="middle"
							dominant-baseline="middle"
							fill="rgba(148, 163, 184, 0.45)"
							font-size="8"
						>
							#{w.sosa}
						</text>
					{/if}
				</g>
			{/each}

			<!-- Center Root Circle (Sosa 1) -->
			{#if fanData.rootPerson}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<g
					style="cursor: pointer;"
					onclick={() => fanData.rootPerson && onSelectPerson(fanData.rootPerson.id)}
				>
					<circle
						cx="0"
						cy="0"
						r={INNER_RADIUS - 4}
						fill="var(--bg-surface)"
						stroke="var(--accent)"
						stroke-width="3"
					/>
					<text x="0" y="-8" text-anchor="middle" fill="var(--accent)" font-size="9" font-weight="800">
						SOSA #1
					</text>
					<text x="0" y="6" text-anchor="middle" fill="currentColor" font-size="10" font-weight="800">
						{fanData.rootPerson.givenNames}
					</text>
					<text x="0" y="20" text-anchor="middle" fill="currentColor" font-size="9" font-weight="700">
						{(fanData.rootPerson.usageSurname || fanData.rootPerson.birthSurname || '').toUpperCase()}
					</text>
				</g>
			{/if}
		</g>
	</svg>
</div>

<style>
	.fanchart-viewport {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: var(--bg-canvas);
		color: var(--text-primary);
		cursor: grab;
	}

	.fanchart-viewport:active {
		cursor: grabbing;
	}

	.fanchart-toolbar {
		position: absolute;
		top: 1rem;
		left: 1rem;
		right: 1rem;
		max-width: 780px;
		z-index: 20;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.65rem 1rem;
		background: var(--bg-glass);
		backdrop-filter: blur(12px);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-md);
	}

	.wedge-group:hover path {
		filter: brightness(1.2);
	}
</style>
