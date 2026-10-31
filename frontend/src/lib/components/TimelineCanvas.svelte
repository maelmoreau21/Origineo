<script lang="ts">
	import { calculateAge, personLabel, type PersonDto, type TreeWindowDto } from '$lib/api';
	import { i18n } from '$lib/i18n/index.svelte';

	let {
		tree,
		selectedPersonId,
		onSelectPerson,
		onFocusPerson
	}: {
		tree: TreeWindowDto | null;
		selectedPersonId: string | null;
		onSelectPerson: (id: string) => void;
		onFocusPerson: (id: string) => void;
	} = $props();

	const CURRENT_YEAR = new Date().getFullYear();

	const HISTORICAL_ERAS = [
		{ id: 'ancien', labelFr: 'Ancien Régime', labelEn: 'Ancien Régime', start: 1600, end: 1789, color: 'rgba(245, 158, 11, 0.08)' },
		{ id: 'rev', labelFr: 'Révolution & Empire', labelEn: 'Revolution & Empire', start: 1789, end: 1815, color: 'rgba(239, 68, 68, 0.09)' },
		{ id: 'xix', labelFr: 'XIXe Siècle Industriel', labelEn: '19th Century', start: 1815, end: 1914, color: 'rgba(56, 189, 248, 0.07)' },
		{ id: 'ww1', labelFr: '14-18', labelEn: 'WWI', start: 1914, end: 1918, color: 'rgba(239, 68, 68, 0.16)' },
		{ id: 'inter', labelFr: 'Entre-deux-guerres', labelEn: 'Interwar', start: 1918, end: 1939, color: 'rgba(16, 185, 129, 0.07)' },
		{ id: 'ww2', labelFr: '39-45', labelEn: 'WWII', start: 1939, end: 1945, color: 'rgba(239, 68, 68, 0.16)' },
		{ id: 'modern', labelFr: 'Époque Contemporaine', labelEn: 'Modern Era', start: 1945, end: 2030, color: 'rgba(99, 102, 241, 0.07)' }
	];

	interface TimelineRow {
		person: PersonDto;
		generation: number;
		startYear: number;
		endYear: number;
		isLiving: boolean;
		age: number | null;
	}

	const timelineData = $derived.by(() => {
		if (!tree || tree.nodes.length === 0) {
			return { minYear: 1850, maxYear: CURRENT_YEAR, rows: [] as TimelineRow[], ticks: [] as number[] };
		}

		const rows: TimelineRow[] = [];
		let minYear = CURRENT_YEAR;
		let maxYear = 1700;

		for (const n of tree.nodes) {
			const p = n.person;
			const bY = p.birthDate ? parseInt(p.birthDate.slice(0, 4), 10) : NaN;
			const dY = p.deathDate ? parseInt(p.deathDate.slice(0, 4), 10) : NaN;

			if (Number.isNaN(bY) && Number.isNaN(dY)) continue;

			const startYear = !Number.isNaN(bY) ? bY : dY - 65;
			const isLiving = Number.isNaN(dY) && CURRENT_YEAR - startYear < 105;
			const endYear = !Number.isNaN(dY) ? dY : isLiving ? CURRENT_YEAR : startYear + 72;

			if (startYear < minYear) minYear = startYear;
			if (endYear > maxYear) maxYear = endYear;

			rows.push({
				person: p,
				generation: n.generation,
				startYear,
				endYear: Math.max(startYear + 1, endYear),
				isLiving,
				age: calculateAge(p.birthDate, p.deathDate)
			});
		}

		rows.sort((a, b) => a.startYear - b.startYear || a.generation - b.generation);

		const paddedMin = Math.floor((minYear - 15) / 10) * 10;
		const paddedMax = Math.ceil((maxYear + 5) / 10) * 10;

		const step = paddedMax - paddedMin > 180 ? 20 : 10;
		const ticks: number[] = [];
		for (let y = paddedMin; y <= paddedMax; y += step) {
			ticks.push(y);
		}

		return { minYear: paddedMin, maxYear: paddedMax, rows, ticks };
	});

	function yearToPct(year: number): number {
		const span = Math.max(10, timelineData.maxYear - timelineData.minYear);
		return Math.max(0, Math.min(100, ((year - timelineData.minYear) / span) * 100));
	}
</script>

<div class="timeline-stage">
	<!-- Header Banner -->
	<div class="timeline-header">
		<div>
			<h2 style="font-size: 1rem; font-weight: 800;">{i18n.t('timelineTitle')}</h2>
			<p style="font-size: 0.77rem; color: var(--text-secondary);">
				{i18n.t('timelineSubtitle')}
			</p>
		</div>
		<div style="display: flex; gap: 0.45rem; align-items: center;">
			<span class="badge badge-accent mono">
				{timelineData.minYear} — {timelineData.maxYear}
			</span>
			<span class="badge badge-success">
				{timelineData.rows.length} {i18n.t('individualsUnit')}
			</span>
		</div>
	</div>

	<div class="timeline-scroll">
		<!-- Historical Eras Bar -->
		<div class="eras-row">
			<div class="person-col-header">Individu / Lignée</div>
			<div class="chart-col-header">
				{#each HISTORICAL_ERAS as era (era.id)}
					{@const left = yearToPct(Math.max(timelineData.minYear, era.start))}
					{@const right = yearToPct(Math.min(timelineData.maxYear, era.end))}
					{#if right > left}
						<div
							class="era-band"
							style="left: {left}%; width: {right - left}%; background: {era.color};"
						>
							<span>{i18n.locale === 'en' ? era.labelEn : era.labelFr}</span>
						</div>
					{/if}
				{/each}
			</div>
		</div>

		<!-- Year Ticks Row -->
		<div class="ticks-row">
			<div class="person-col-spacer"></div>
			<div class="chart-col-ticks">
				{#each timelineData.ticks as yr (yr)}
					<div class="tick-mark mono" style="left: {yearToPct(yr)}%;">
						<span>{yr}</span>
					</div>
				{/each}
			</div>
		</div>

		<!-- Life Bars Rows -->
		<div class="bars-list">
			{#each timelineData.rows as row (row.person.id)}
				{@const leftPct = yearToPct(row.startYear)}
				{@const widthPct = Math.max(1.2, yearToPct(row.endYear) - leftPct)}
				<div
					class="life-row"
					class:selected={selectedPersonId === row.person.id}
					onclick={() => onSelectPerson(row.person.id)}
					ondblclick={() => onFocusPerson(row.person.id)}
					role="button"
					tabindex="0"
					onkeydown={(e) => {
						if (e.key === 'Enter') onSelectPerson(row.person.id);
					}}
				>
					<div class="person-cell">
						<span
							class="gender-dot"
							class:male={row.person.gender === 'MALE'}
							class:female={row.person.gender === 'FEMALE'}
						></span>
						<div style="min-width: 0; flex: 1;">
							<div class="row-name">{personLabel(row.person)}</div>
							<div class="row-sub">
								{#if row.person.sosaNumber}
									<span class="mono" style="color: var(--gold);">Sosa #{row.person.sosaNumber}</span> ·
								{/if}
								<span>{row.person.birthPlace ? row.person.birthPlace.split(',')[0] : '—'}</span>
							</div>
						</div>
					</div>

					<div class="bar-track">
						{#each timelineData.ticks as yr (yr)}
							<div class="grid-vline" style="left: {yearToPct(yr)}%;"></div>
						{/each}

						<div
							class="life-bar"
							class:male={row.person.gender === 'MALE'}
							class:female={row.person.gender === 'FEMALE'}
							class:living={row.isLiving}
							style="left: {leftPct}%; width: {widthPct}%;"
						>
							<span class="bar-years mono">
								{row.startYear} – {row.isLiving ? '…' : row.endYear}
								{#if row.age !== null}
									({row.age} ans)
								{/if}
							</span>
						</div>
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
	.timeline-stage {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--bg-canvas);
		overflow: hidden;
	}

	.timeline-header {
		padding: 0.9rem 1.35rem;
		background: var(--bg-surface);
		border-bottom: 1px solid var(--border-subtle);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.timeline-scroll {
		flex: 1;
		overflow: auto;
		padding: 1rem 1.35rem 2rem;
	}

	.eras-row,
	.ticks-row {
		display: flex;
		align-items: stretch;
	}

	.person-col-header,
	.person-col-spacer {
		width: 250px;
		flex-shrink: 0;
		padding: 0.45rem 0.75rem;
		font-size: 0.72rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
	}

	.chart-col-header {
		flex: 1;
		position: relative;
		height: 30px;
		background: var(--bg-surface);
		border-radius: var(--radius-xs);
		overflow: hidden;
		border: 1px solid var(--border-subtle);
	}

	.era-band {
		position: absolute;
		top: 0;
		bottom: 0;
		border-right: 1px dashed var(--border-color);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 0.3rem;
		font-size: 0.66rem;
		font-weight: 700;
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.chart-col-ticks {
		flex: 1;
		position: relative;
		height: 26px;
	}

	.tick-mark {
		position: absolute;
		top: 4px;
		transform: translateX(-50%);
		font-size: 0.68rem;
		font-weight: 600;
		color: var(--text-muted);
	}

	.bars-list {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.life-row {
		display: flex;
		align-items: center;
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: border-color 0.14s ease, background 0.14s ease;
	}

	.life-row:hover {
		border-color: var(--border-strong);
		background: var(--bg-elevated);
	}

	.life-row.selected {
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent);
	}

	.person-cell {
		width: 250px;
		flex-shrink: 0;
		padding: 0.5rem 0.75rem;
		display: flex;
		align-items: center;
		gap: 0.55rem;
		border-right: 1px solid var(--border-subtle);
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

	.row-name {
		font-size: 0.8rem;
		font-weight: 700;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.row-sub {
		font-size: 0.69rem;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.bar-track {
		flex: 1;
		position: relative;
		height: 38px;
		overflow: hidden;
	}

	.grid-vline {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--canvas-grid);
	}

	.life-bar {
		position: absolute;
		top: 7px;
		height: 24px;
		border-radius: 6px;
		background: var(--color-other-bg);
		border: 1px solid var(--color-other-border);
		display: flex;
		align-items: center;
		padding: 0 0.5rem;
		min-width: 72px;
	}

	.life-bar.male {
		background: var(--color-male-bg);
		border-color: var(--color-male-border);
	}

	.life-bar.female {
		background: var(--color-female-bg);
		border-color: var(--color-female-border);
	}

	.life-bar.living {
		border-style: dashed;
	}

	.bar-years {
		font-size: 0.69rem;
		font-weight: 700;
		color: var(--text-primary);
		white-space: nowrap;
	}
</style>
