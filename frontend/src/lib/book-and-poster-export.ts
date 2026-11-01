import type { PersonDto, TreeWindowDto } from '$lib/api';
import { personLabel, formatLifeYears } from '$lib/api';

/**
 * Generates an interactive High-Resolution Vector SVG / Poster / Plotter format (A0, A1, A2)
 * with Pan & Zoom controls and printable layout.
 */
export function exportPosterSvgOrPrint(
	treeWindow: TreeWindowDto,
	rootPerson: PersonDto,
	title = 'Grand Arbre Généalogique Origineo'
) {
	const win = window.open('', '_blank');
	if (!win) {
		alert('Veuillez autoriser les fenêtres pop-up pour afficher l’arbre grand format.');
		return;
	}

	const nodeWidth = 230;
	const nodeHeight = 90;
	const hGap = 50;
	const vGap = 120;

	// Build index of parents, children, spouses
	const childToParents = new Map<string, string[]>();
	const parentToChildren = new Map<string, string[]>();
	for (const rel of treeWindow.relationships) {
		const pList = childToParents.get(rel.childId) || [];
		pList.push(rel.parentId);
		childToParents.set(rel.childId, pList);

		const cList = parentToChildren.get(rel.parentId) || [];
		cList.push(rel.childId);
		parentToChildren.set(rel.parentId, cList);
	}

	// Group nodes by generation
	const nodesByGen = new Map<number, typeof treeWindow.nodes>();
	for (const n of treeWindow.nodes) {
		const list = nodesByGen.get(n.generation) || [];
		list.push(n);
		nodesByGen.set(n.generation, list);
	}

	const sortedGens = Array.from(nodesByGen.keys()).sort((a, b) => a - b);
	let maxPerGen = 0;
	for (const list of nodesByGen.values()) {
		maxPerGen = Math.max(maxPerGen, list.length);
	}

	const totalWidth = Math.max(3200, maxPerGen * (nodeWidth + hGap) + 600);
	const totalHeight = Math.max(2200, sortedGens.length * (nodeHeight + vGap) + 600);

	// Positions map: id -> { x, y }
	const positions = new Map<string, { x: number; y: number }>();

	// Calculate generation Y offset so generation 0 (root) is centered vertically
	const minGen = sortedGens[0] ?? 0;
	const maxGen = sortedGens[sortedGens.length - 1] ?? 0;
	const genSpan = Math.max(1, maxGen - minGen);

	sortedGens.forEach((gen) => {
		const list = nodesByGen.get(gen) || [];
		// Sort within row: males first, then females, or by surname
		list.sort((a, b) => {
			if (a.person.id === rootPerson.id) return -1;
			if (b.person.id === rootPerson.id) return 1;
			return a.person.givenNames.localeCompare(b.person.givenNames);
		});

		const rowWidth = list.length * (nodeWidth + hGap) - hGap;
		const startX = (totalWidth - rowWidth) / 2;
		// Generation index from top
		const rowIdx = gen - minGen;
		const y = 320 + rowIdx * (nodeHeight + vGap);

		list.forEach((n, colIdx) => {
			const x = startX + colIdx * (nodeWidth + hGap);
			positions.set(n.person.id, { x, y });
		});
	});

	// Build smooth SVG bezier curves for parent-child links
	let linksSvg = '';
	for (const rel of treeWindow.relationships) {
		const pPos = positions.get(rel.parentId);
		const cPos = positions.get(rel.childId);
		if (pPos && cPos) {
			const pGen = treeWindow.nodes.find((n) => n.person.id === rel.parentId)?.generation ?? 0;
			const cGen = treeWindow.nodes.find((n) => n.person.id === rel.childId)?.generation ?? 0;

			let x1: number, y1: number, x2: number, y2: number;
			if (pGen <= cGen) {
				// Parent is higher on canvas (lower or equal Y)
				x1 = pPos.x + nodeWidth / 2;
				y1 = pPos.y + nodeHeight;
				x2 = cPos.x + nodeWidth / 2;
				y2 = cPos.y;
			} else {
				// Parent is lower on canvas
				x1 = pPos.x + nodeWidth / 2;
				y1 = pPos.y;
				x2 = cPos.x + nodeWidth / 2;
				y2 = cPos.y + nodeHeight;
			}

			const midY = (y1 + y2) / 2;
			linksSvg += `<path d="M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}" fill="none" stroke="#64748b" stroke-width="2.5" stroke-linecap="round" opacity="0.6"/>`;
		}
	}

	// Build spouse links
	for (const u of treeWindow.unions) {
		const pos1 = positions.get(u.partner1Id);
		const pos2 = positions.get(u.partner2Id);
		if (pos1 && pos2) {
			const x1 = pos1.x + nodeWidth;
			const y1 = pos1.y + nodeHeight / 2;
			const x2 = pos2.x;
			const y2 = pos2.y + nodeHeight / 2;
			linksSvg += `<path d="M ${x1} ${y1} L ${x2} ${y2}" fill="none" stroke="#e11d48" stroke-width="2" stroke-dasharray="4 3" opacity="0.8"/>`;
		}
	}

	// Build SVG node cards
	let nodesSvg = '';
	for (const n of treeWindow.nodes) {
		const pos = positions.get(n.person.id);
		if (!pos) continue;
		const isMale = n.person.gender === 'MALE';
		const isFemale = n.person.gender === 'FEMALE';
		const badgeColor = isMale ? '#2563eb' : isFemale ? '#db2777' : '#7c3aed';
		const isRoot = n.person.id === rootPerson.id;
		const fillBg = isRoot ? '#fef3c7' : '#ffffff';
		const strokeBorder = isRoot ? '#d97706' : '#cbd5e1';

		const name = personLabel(n.person);
		const dates = formatLifeYears(n.person);
		const place = n.person.birthPlace || n.person.deathPlace || '';
		const sosaBadge = n.person.sosaNumber ? `Sosa #${n.person.sosaNumber}` : '';

		nodesSvg += `
		<g transform="translate(${pos.x}, ${pos.y})">
			<rect width="${nodeWidth}" height="${nodeHeight}" rx="12" fill="${fillBg}" stroke="${strokeBorder}" stroke-width="${isRoot ? 3 : 1.5}" filter="drop-shadow(0 4px 6px rgba(0,0,0,0.06))"/>
			<circle cx="22" cy="24" r="11" fill="${badgeColor}" />
			<text x="22" y="28" font-family="'Plus Jakarta Sans', sans-serif" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle">${escapeHtml(n.person.givenNames.charAt(0).toUpperCase())}</text>
			<text x="42" y="28" font-family="'Plus Jakarta Sans', sans-serif" font-size="13" font-weight="bold" fill="#0f172a">${escapeHtml(truncate(name, 22))}</text>
			<text x="14" y="52" font-family="'JetBrains Mono', monospace" font-size="11" font-weight="600" fill="#475569">${escapeHtml(dates || 'Dates inconnues')}</text>
			<text x="14" y="72" font-family="'Plus Jakarta Sans', sans-serif" font-size="10.5" fill="#64748b">${escapeHtml(truncate(place, 26))}</text>
			${sosaBadge ? `<rect x="${nodeWidth - 68}" y="8" width="60" height="18" rx="4" fill="#fef3c7" stroke="#d97706" stroke-width="1"/><text x="${nodeWidth - 38}" y="21" font-family="'JetBrains Mono', monospace" font-size="9" font-weight="bold" fill="#b45309" text-anchor="middle">${sosaBadge}</text>` : ''}
		</g>`;
	}

	win.document.write(`<!doctype html>
<html lang="fr">
<head>
	<meta charset="utf-8"/>
	<title>${escapeHtml(title)} — Traceur Haute Précision</title>
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700;800&family=JetBrains+Mono:wght@600;700&display=swap" rel="stylesheet">
	<style>
		* { box-sizing: border-box; }
		body { margin: 0; background: #0f172a; color: #f8fafc; font-family: 'Plus Jakarta Sans', sans-serif; overflow: hidden; height: 100vh; width: 100vw; }
		.top-controls { position: fixed; top: 16px; left: 16px; z-index: 100; display: flex; align-items: center; gap: 8px; background: rgba(15, 23, 42, 0.9); backdrop-filter: blur(12px); padding: 8px 14px; border-radius: 99px; box-shadow: 0 8px 24px rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15); }
		.btn { padding: 8px 16px; border-radius: 99px; font-weight: 700; font-size: 13px; cursor: pointer; border: none; display: inline-flex; align-items: center; gap: 6px; transition: all 0.15s ease; }
		.btn-primary { background: #06b6d4; color: #0f172a; }
		.btn-primary:hover { background: #22d3ee; }
		.btn-secondary { background: rgba(255,255,255,0.12); color: #fff; }
		.btn-secondary:hover { background: rgba(255,255,255,0.22); }
		.zoom-info { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #94a3b8; padding: 0 6px; }
		.viewport-container { width: 100vw; height: 100vh; cursor: grab; user-select: none; }
		.viewport-container:active { cursor: grabbing; }
		@media print {
			.top-controls { display: none !important; }
			body { background: #fff !important; color: #000 !important; overflow: visible !important; }
			@page { size: landscape; margin: 0; }
		}
	</style>
</head>
<body>
	<div class="top-controls">
		<button class="btn btn-primary" onclick="window.print()">🖨️ Imprimer Traceur A0 / PDF</button>
		<button class="btn btn-secondary" onclick="downloadSvg()">💾 Exporter SVG Vectoriel</button>
		<div style="width: 1px; height: 20px; background: rgba(255,255,255,0.2); margin: 0 4px;"></div>
		<button class="btn btn-secondary" onclick="zoomIn()">➕</button>
		<button class="btn btn-secondary" onclick="zoomOut()">➖</button>
		<button class="btn btn-secondary" onclick="resetZoom()">⟲ Recentrer</button>
		<span class="zoom-info" id="zoom-text">100%</span>
	</div>

	<div class="viewport-container" id="viewport">
		<svg id="tree-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="${totalWidth}" height="${totalHeight}">
			<defs>
				<linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
					<stop offset="0%" stop-color="#f8fafc" />
					<stop offset="100%" stop-color="#f1f5f9" />
				</linearGradient>
			</defs>

			<rect width="100%" height="100%" fill="url(#bg-grad)" />

			<!-- Archival Header -->
			<text x="${totalWidth / 2}" y="130" font-family="'Plus Jakarta Sans', sans-serif" font-size="42" font-weight="800" fill="#0f172a" text-anchor="middle">${escapeHtml(title)}</text>
			<text x="${totalWidth / 2}" y="175" font-family="'Plus Jakarta Sans', sans-serif" font-size="18" font-weight="600" fill="#64748b" text-anchor="middle">Lignée de ${escapeHtml(personLabel(rootPerson))} • ${treeWindow.nodes.length} individus représentés • Origineo Studio</text>
			<line x1="300" y1="210" x2="${totalWidth - 300}" y2="210" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="8 6" />

			<!-- Links & Nodes -->
			${linksSvg}
			${nodesSvg}
		</svg>
	</div>

	<script>
		const svg = document.getElementById('tree-svg');
		const viewport = document.getElementById('viewport');
		const zoomText = document.getElementById('zoom-text');

		let scale = 0.65;
		let panX = 40;
		let panY = 20;
		let isPanning = false;
		let startX = 0;
		let startY = 0;

		function updateTransform() {
			svg.style.transformOrigin = '0 0';
			svg.style.transform = \`translate(\${panX}px, \${panY}px) scale(\${scale})\`;
			zoomText.textContent = Math.round(scale * 100) + '%';
		}
		updateTransform();

		viewport.addEventListener('mousedown', (e) => {
			if (e.target.closest('.top-controls')) return;
			isPanning = true;
			startX = e.clientX - panX;
			startY = e.clientY - panY;
		});

		window.addEventListener('mousemove', (e) => {
			if (!isPanning) return;
			panX = e.clientX - startX;
			panY = e.clientY - startY;
			updateTransform();
		});

		window.addEventListener('mouseup', () => { isPanning = false; });

		viewport.addEventListener('wheel', (e) => {
			e.preventDefault();
			const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
			const newScale = Math.min(Math.max(0.1, scale * zoomFactor), 3);
			
			// Zoom toward mouse position
			const mouseX = e.clientX;
			const mouseY = e.clientY;
			panX = mouseX - (mouseX - panX) * (newScale / scale);
			panY = mouseY - (mouseY - panY) * (newScale / scale);
			scale = newScale;
			updateTransform();
		}, { passive: false });

		function zoomIn() { scale = Math.min(3, scale * 1.25); updateTransform(); }
		function zoomOut() { scale = Math.max(0.1, scale * 0.8); updateTransform(); }
		function resetZoom() {
			scale = 0.65;
			panX = 40;
			panY = 20;
			updateTransform();
		}

		function downloadSvg() {
			const serializer = new XMLSerializer();
			const source = serializer.serializeToString(svg);
			const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = 'Origineo_Arbre_Traceur_${rootPerson.id.slice(0, 8)}.svg';
			link.click();
		}
	</script>
</body>
</html>`);
	win.document.close();
}

/**
 * Generates an illustrated and structured Family Book (Chronique Généalogique)
 * with complete parentage, spouses, children, biographical details, and surname index.
 */
export function exportFamilyBook(
	treeWindow: TreeWindowDto,
	rootPerson: PersonDto
) {
	const win = window.open('', '_blank');
	if (!win) {
		alert('Veuillez autoriser les fenêtres pop-up pour éditer le Livre de Famille.');
		return;
	}

	// Index persons, parents, spouses, and children
	const personMap = new Map<string, PersonDto>();
	for (const n of treeWindow.nodes) {
		personMap.set(n.person.id, n.person);
	}

	const childToParents = new Map<string, PersonDto[]>();
	const parentToChildren = new Map<string, PersonDto[]>();
	for (const rel of treeWindow.relationships) {
		const parent = personMap.get(rel.parentId);
		const child = personMap.get(rel.childId);
		if (parent && child) {
			const pList = childToParents.get(child.id) || [];
			pList.push(parent);
			childToParents.set(child.id, pList);

			const cList = parentToChildren.get(parent.id) || [];
			cList.push(child);
			parentToChildren.set(parent.id, cList);
		}
	}

	const personToSpouses = new Map<string, { spouse: PersonDto; date?: string | null; place?: string | null }[]>();
	for (const u of treeWindow.unions) {
		const p1 = personMap.get(u.partner1Id);
		const p2 = personMap.get(u.partner2Id);
		if (p1 && p2) {
			const sList1 = personToSpouses.get(p1.id) || [];
			sList1.push({ spouse: p2, date: u.startDate, place: u.startPlace });
			personToSpouses.set(p1.id, sList1);

			const sList2 = personToSpouses.get(p2.id) || [];
			sList2.push({ spouse: p1, date: u.startDate, place: u.startPlace });
			personToSpouses.set(p2.id, sList2);
		}
	}

	// Group by generation
	const nodesByGen = new Map<number, typeof treeWindow.nodes>();
	for (const n of treeWindow.nodes) {
		const list = nodesByGen.get(n.generation) || [];
		list.push(n);
		nodesByGen.set(n.generation, list);
	}

	const sortedGens = Array.from(nodesByGen.keys()).sort((a, b) => a - b);

	// Count surnames for the index
	const surnameCounts = new Map<string, number>();
	for (const n of treeWindow.nodes) {
		const s = (n.person.usageSurname || n.person.birthSurname || 'Inconnu').toUpperCase();
		surnameCounts.set(s, (surnameCounts.get(s) || 0) + 1);
	}
	const sortedSurnames = Array.from(surnameCounts.entries()).sort((a, b) => b[1] - a[1]);

	let chaptersHtml = '';
	sortedGens.forEach((gen) => {
		const list = nodesByGen.get(gen) || [];
		const genTitle =
			gen === 0
				? 'Génération 0 — Racine & De Cujus (Sosa #1)'
				: gen < 0
					? `Génération Ascendante ${Math.abs(gen)} (${gen === -1 ? 'Parents' : gen === -2 ? 'Grands-parents' : 'Aïeux'})`
					: `Génération Descendante +${gen} (${gen === 1 ? 'Enfants' : gen === 2 ? 'Petits-enfants' : 'Descendance'})`;

		chaptersHtml += `
		<section class="chapter-section" id="gen-${gen}">
			<div class="chapter-header">
				<h2>${escapeHtml(genTitle)}</h2>
				<span class="chapter-count">${list.length} individu${list.length > 1 ? 's' : ''}</span>
			</div>
			<div class="persons-grid">`;

		for (const n of list) {
			const p = n.person;
			const parents = childToParents.get(p.id) || [];
			const spouses = personToSpouses.get(p.id) || [];
			const children = parentToChildren.get(p.id) || [];

			chaptersHtml += `
			<article class="bio-card" id="person-${p.id}">
				<div class="bio-card-top">
					<div>
						<div class="bio-name">${escapeHtml(personLabel(p))}</div>
						<div class="bio-dates">${escapeHtml(formatLifeYears(p))}</div>
					</div>
					${p.sosaNumber ? `<span class="sosa-badge">Sosa #${p.sosaNumber}</span>` : ''}
				</div>

				<!-- Genealogical Family Connections -->
				<div class="family-connections">
					${parents.length > 0 ? `<div class="conn-row"><span class="conn-label">Parents :</span> <span>${parents.map((par) => `<a href="#person-${par.id}" class="conn-link">${escapeHtml(personLabel(par))}</a> (${escapeHtml(formatLifeYears(par))})`).join(' & ')}</span></div>` : ''}
					${spouses.length > 0 ? `<div class="conn-row"><span class="conn-label">Union${spouses.length > 1 ? 's' : ''} :</span> <span>${spouses.map((sp) => `<a href="#person-${sp.spouse.id}" class="conn-link">${escapeHtml(personLabel(sp.spouse))}</a> ${sp.date ? `(m. ${sp.date})` : ''}`).join(', ')}</span></div>` : ''}
					${children.length > 0 ? `<div class="conn-row"><span class="conn-label">Enfants (${children.length}) :</span> <span>${children.map((ch) => `<a href="#person-${ch.id}" class="conn-link">${escapeHtml(personLabel(ch))}</a>`).join(', ')}</span></div>` : ''}
				</div>

				<table class="bio-table">
					${p.birthDate || p.birthPlace ? `<tr><td>Naissance</td><td>${escapeHtml(p.birthDate || '')} ${p.birthPlace ? `à <strong>${escapeHtml(p.birthPlace)}</strong>` : ''}</td></tr>` : ''}
					${p.birthRepublican ? `<tr><td>Date Républicaine</td><td><em>${escapeHtml(p.birthRepublican)}</em></td></tr>` : ''}
					${p.baptismDate || p.baptismPlace ? `<tr><td>Baptême</td><td>${escapeHtml(p.baptismDate || '')} ${p.baptismPlace ? `à ${escapeHtml(p.baptismPlace)}` : ''}</td></tr>` : ''}
					${p.deathDate || p.deathPlace ? `<tr><td>Décès</td><td>${escapeHtml(p.deathDate || '')} ${p.deathPlace ? `à <strong>${escapeHtml(p.deathPlace)}</strong>` : ''}</td></tr>` : ''}
					${p.professions?.length ? `<tr><td>Profession(s)</td><td><strong>${escapeHtml(p.professions.join(', '))}</strong></td></tr>` : ''}
					${p.militaryRegiment ? `<tr><td>Service Militaire</td><td>${escapeHtml(p.militaryRegiment)} ${p.militarySerial ? `[Matricule : ${escapeHtml(p.militarySerial)}]` : ''}</td></tr>` : ''}
					${p.nobilityCoatOfArms ? `<tr><td>Armoiries</td><td>🛡️ <em>${escapeHtml(p.nobilityCoatOfArms)}</em></td></tr>` : ''}
					${p.signatureStatus ? `<tr><td>Signature</td><td>${p.signatureStatus === 'SIGNS' ? '✍️ Sait signer' : 'Ne sait signer'}</td></tr>` : ''}
				</table>

				${p.notes ? `<div class="bio-notes">« ${escapeHtml(p.notes)} »</div>` : ''}
			</article>`;
		}

		chaptersHtml += `</div></section>`;
	});

	win.document.write(`<!doctype html>
<html lang="fr">
<head>
	<meta charset="utf-8"/>
	<title>Livre de Famille — Origineo</title>
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;800&family=Plus+Jakarta+Sans:wght@400;600;700;800&family=JetBrains+Mono:wght@600;700&display=swap" rel="stylesheet">
	<style>
		* { box-sizing: border-box; }
		body { font-family: 'Plus Jakarta Sans', sans-serif; color: #1e293b; background: #fdfbf7; max-width: 900px; margin: 0 auto; padding: 40px 24px; line-height: 1.6; }
		.top-actions { position: fixed; top: 16px; right: 16px; z-index: 100; display: flex; gap: 8px; }
		.btn { padding: 9px 18px; background: #0f172a; color: #ffffff; border: none; border-radius: 99px; cursor: pointer; font-weight: 700; font-size: 13px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
		.btn:hover { background: #1e293b; }
		
		.book-cover { text-align: center; padding: 80px 0 60px; border-bottom: 3px double #0f172a; margin-bottom: 40px; page-break-after: always; }
		.cover-badge { font-family: 'Cinzel', serif; font-size: 14px; text-transform: uppercase; letter-spacing: 0.15em; color: #64748b; margin-bottom: 16px; }
		.cover-title { font-family: 'Cinzel', serif; font-size: 40px; font-weight: 800; color: #0f172a; margin: 0; line-height: 1.2; }
		.cover-subtitle { font-size: 18px; color: #475569; margin-top: 14px; font-weight: 600; }
		.cover-meta { margin-top: 30px; font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #64748b; }

		.toc-box { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px 24px; margin-bottom: 40px; page-break-after: always; }
		.toc-title { font-size: 16px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0; color: #0f172a; }
		.toc-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; font-size: 14px; }
		.toc-list a { color: #0284c7; text-decoration: none; font-weight: 600; }
		.toc-list a:hover { text-decoration: underline; }

		.chapter-section { margin-bottom: 50px; page-break-before: auto; }
		.chapter-header { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 24px; }
		.chapter-header h2 { font-family: 'Cinzel', serif; margin: 0; font-size: 21px; color: #0f172a; }
		.chapter-count { font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700; color: #64748b; }

		.persons-grid { display: flex; flex-direction: column; gap: 20px; }
		.bio-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px 24px; box-shadow: 0 2px 4px rgba(0,0,0,0.03); page-break-inside: avoid; }
		.bio-card-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
		.bio-name { font-size: 19px; font-weight: 800; color: #0f172a; }
		.bio-dates { font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700; color: #64748b; margin-top: 2px; }
		.sosa-badge { background: #fef3c7; border: 1px solid #f59e0b; color: #b45309; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 6px; }

		.family-connections { background: #f8fafc; border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; font-size: 13px; display: flex; flex-direction: column; gap: 4px; border: 1px solid #f1f5f9; }
		.conn-label { font-weight: 700; color: #475569; width: 110px; display: inline-block; }
		.conn-link { color: #0284c7; text-decoration: none; font-weight: 600; }
		.conn-link:hover { text-decoration: underline; }

		.bio-table { width: 100%; border-collapse: collapse; font-size: 13.5px; margin-bottom: 10px; }
		.bio-table td { padding: 4px 0; vertical-align: top; }
		.bio-table td:first-child { width: 150px; color: #64748b; font-weight: 700; }
		.bio-notes { margin-top: 10px; padding: 10px 14px; background: #f0fdf4; border-left: 3px solid #16a34a; border-radius: 4px; font-style: italic; font-size: 13px; color: #166534; }

		.index-section { margin-top: 60px; padding-top: 30px; border-top: 3px double #0f172a; page-break-before: always; }
		.index-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; font-size: 13px; }
		.index-item { display: flex; justify-content: space-between; padding: 4px 8px; background: #ffffff; border-radius: 4px; border: 1px solid #e2e8f0; }

		@media print {
			.top-actions { display: none !important; }
			body { background: #ffffff !important; padding: 0 !important; }
			.bio-card { box-shadow: none !important; border: 1px solid #cbd5e1 !important; }
		}
	</style>
</head>
<body>
	<div class="top-actions">
		<button class="btn" onclick="window.print()">🖨️ Imprimer ou Enregistrer en PDF</button>
	</div>

	<!-- Cover Page -->
	<header class="book-cover">
		<div class="cover-badge">Origineo Studio — Chronique Généalogique</div>
		<h1 class="cover-title">Livre de Famille</h1>
		<div class="cover-subtitle">Ascendance, Descendance et Histoire de <strong>${escapeHtml(personLabel(rootPerson))}</strong></div>
		<div class="cover-meta">${treeWindow.nodes.length} individus documentés • ${treeWindow.relationships.length} filiations certifiées • ${treeWindow.unions.length} alliances</div>
	</header>

	<!-- Table of contents -->
	<nav class="toc-box">
		<h3 class="toc-title">Table des matières</h3>
		<ul class="toc-list">
			${sortedGens
				.map((gen) => {
					const list = nodesByGen.get(gen) || [];
					const title =
						gen === 0
							? 'Génération 0 — Racine (Sosa #1)'
							: gen < 0
								? `Génération Ascendante ${Math.abs(gen)}`
								: `Génération Descendante +${gen}`;
					return `<li><a href="#gen-${gen}">${escapeHtml(title)}</a> (${list.length} personnes)</li>`;
				})
				.join('')}
			<li><a href="#index-surnames">Index des patronymes</a> (${sortedSurnames.length} familles)</li>
		</ul>
	</nav>

	<!-- Generation Chapters -->
	${chaptersHtml}

	<!-- Index of Surnames -->
	<section class="index-section" id="index-surnames">
		<h2 style="font-family: 'Cinzel', serif; margin-top: 0; font-size: 20px;">Index des Patronymes</h2>
		<div class="index-grid">
			${sortedSurnames
				.map(
					([surname, count]) => `
				<div class="index-item">
					<span style="font-weight: 700;">${escapeHtml(surname)}</span>
					<span style="color: #64748b; font-family: 'JetBrains Mono', monospace;">${count}</span>
				</div>`
				)
				.join('')}
		</div>
	</section>
</body>
</html>`);
	win.document.close();
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function truncate(str: string, max: number): string {
	return str.length > max ? `${str.slice(0, max)}…` : str;
}
