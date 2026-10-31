import type { PersonDto, TreeWindowDto } from '$lib/api';
import { personLabel, formatLifeYears } from '$lib/api';

/**
 * Generates a clean standalone HTML document for printing or saving
 * as a high-resolution Vector SVG / Poster / Plotter format (A0, A1, A2).
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

	const nodeWidth = 220;
	const nodeHeight = 85;
	const hGap = 60;
	const vGap = 90;

	// Calculate generation levels
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

	const totalWidth = Math.max(2800, maxPerGen * (nodeWidth + hGap) + 400);
	const totalHeight = Math.max(1800, sortedGens.length * (nodeHeight + vGap) + 500);

	// Position nodes in an aesthetic tree layout
	const positions = new Map<string, { x: number; y: number }>();
	sortedGens.forEach((gen, rowIdx) => {
		const list = nodesByGen.get(gen) || [];
		const rowWidth = list.length * (nodeWidth + hGap) - hGap;
		const startX = (totalWidth - rowWidth) / 2;
		const y = 300 + rowIdx * (nodeHeight + vGap);

		list.forEach((n, colIdx) => {
			const x = startX + colIdx * (nodeWidth + hGap);
			positions.set(n.person.id, { x, y });
		});
	});

	// Build SVG lines for parent-child links
	let linksSvg = '';
	for (const rel of treeWindow.relationships) {
		const pPos = positions.get(rel.parentId);
		const cPos = positions.get(rel.childId);
		if (pPos && cPos) {
			const x1 = pPos.x + nodeWidth / 2;
			const y1 = pPos.y + nodeHeight;
			const x2 = cPos.x + nodeWidth / 2;
			const y2 = cPos.y;
			const midY = (y1 + y2) / 2;
			linksSvg += `<path d="M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}" fill="none" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round"/>`;
		}
	}

	// Build SVG node boxes
	let nodesSvg = '';
	for (const n of treeWindow.nodes) {
		const pos = positions.get(n.person.id);
		if (!pos) continue;
		const isMale = n.person.gender === 'MALE';
		const isFemale = n.person.gender === 'FEMALE';
		const badgeColor = isMale ? '#3b82f6' : isFemale ? '#ec4899' : '#8b5cf6';
		const fillBg = n.person.id === rootPerson.id ? '#fef3c7' : '#ffffff';
		const strokeBorder = n.person.id === rootPerson.id ? '#d97706' : '#cbd5e1';

		const name = personLabel(n.person);
		const dates = formatLifeYears(n.person);
		const place = n.person.birthPlace || n.person.deathPlace || '';

		nodesSvg += `
		<g transform="translate(${pos.x}, ${pos.y})">
			<rect width="${nodeWidth}" height="${nodeHeight}" rx="12" fill="${fillBg}" stroke="${strokeBorder}" stroke-width="${n.person.id === rootPerson.id ? 3 : 1.5}" filter="drop-shadow(0 4px 6px rgba(0,0,0,0.06))"/>
			<circle cx="24" cy="24" r="10" fill="${badgeColor}" />
			<text x="24" y="28" font-family="sans-serif" font-size="10" font-weight="bold" fill="#ffffff" text-anchor="middle">${n.person.givenNames.charAt(0).toUpperCase()}</text>
			<text x="44" y="28" font-family="sans-serif" font-size="13" font-weight="bold" fill="#0f172a">${escapeHtml(name)}</text>
			<text x="14" y="52" font-family="monospace" font-size="11" font-weight="600" fill="#475569">${escapeHtml(dates || 'Dates inconnues')}</text>
			<text x="14" y="70" font-family="sans-serif" font-size="10" fill="#64748b">${escapeHtml(truncate(place, 28))}</text>
		</g>`;
	}

	win.document.write(`<!doctype html>
<html>
<head>
	<meta charset="utf-8"/>
	<title>${escapeHtml(title)} — Traceur HD / SVG</title>
	<style>
		body { margin: 0; background: #f8fafc; font-family: 'Plus Jakarta Sans', sans-serif; }
		.top-bar { position: fixed; top: 12px; left: 12px; z-index: 100; display: flex; gap: 8px; background: rgba(255,255,255,0.92); backdrop-filter: blur(8px); padding: 8px 14px; border-radius: 99px; box-shadow: 0 4px 12px rgba(0,0,0,0.12); border: 1px solid #e2e8f0; }
		.btn { padding: 8px 16px; border-radius: 99px; font-weight: 700; font-size: 13px; cursor: pointer; border: none; }
		.btn-primary { background: #0f172a; color: #fff; }
		.btn-secondary { background: #e2e8f0; color: #0f172a; }
		@media print {
			.top-bar { display: none; }
			@page { size: landscape; margin: 0; }
		}
	</style>
</head>
<body>
	<div class="top-bar">
		<button class="btn btn-primary" onclick="window.print()">🖨️ Imprimer / Sauvegarder en PDF Traceur (Grand Format)</button>
		<button class="btn btn-secondary" onclick="downloadSvg()">💾 Télécharger le fichier SVG Vectoriel pur</button>
	</div>

	<svg id="tree-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="${totalWidth}" height="${totalHeight}">
		<!-- Archival Crest Header -->
		<rect width="100%" height="100%" fill="#f8fafc" />
		<text x="${totalWidth / 2}" y="120" font-family="Georgia, serif" font-size="36" font-weight="bold" fill="#0f172a" text-anchor="middle">${escapeHtml(title)}</text>
		<text x="${totalWidth / 2}" y="160" font-family="sans-serif" font-size="16" fill="#64748b" text-anchor="middle">Lignée de ${escapeHtml(personLabel(rootPerson))} • ${treeWindow.nodes.length} individus représentés • Édité avec Origineo Studio</text>
		<line x1="300" y1="190" x2="${totalWidth - 300}" y2="190" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6 4" />

		<!-- Links and Nodes -->
		${linksSvg}
		${nodesSvg}
	</svg>

	<script>
		function downloadSvg() {
			const svg = document.getElementById('tree-svg');
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
 * Generates an illustrated family biographical chronicle / book
 */
export function exportFamilyBook(
	treeWindow: TreeWindowDto,
	rootPerson: PersonDto
) {
	const win = window.open('', '_blank');
	if (!win) {
		alert('Veuillez autoriser les fenêtres pop-up.');
		return;
	}

	// Group by generation
	const nodesByGen = new Map<number, typeof treeWindow.nodes>();
	for (const n of treeWindow.nodes) {
		const list = nodesByGen.get(n.generation) || [];
		list.push(n);
		nodesByGen.set(n.generation, list);
	}

	const sortedGens = Array.from(nodesByGen.keys()).sort((a, b) => a - b);

	let chaptersHtml = '';
	sortedGens.forEach((gen) => {
		const list = nodesByGen.get(gen) || [];
		const genTitle = gen === 0 ? 'Génération Souche (Racine)' : gen > 0 ? `Génération Descendante +${gen}` : `Génération Ascendante ${gen}`;
		
		chaptersHtml += `<div class="chapter-header"><h2>${escapeHtml(genTitle)}</h2></div><div class="persons-grid">`;

		for (const n of list) {
			const p = n.person;
			chaptersHtml += `
			<article class="bio-entry">
				<div class="bio-name">${escapeHtml(personLabel(p))}</div>
				<div class="bio-dates">${escapeHtml(formatLifeYears(p))} ${p.sosaNumber ? `• Sosa #${p.sosaNumber}` : ''}</div>
				
				<table class="bio-table">
					${p.birthDate || p.birthPlace ? `<tr><td>Naissance</td><td>${escapeHtml(p.birthDate || '')} ${p.birthPlace ? `à ${escapeHtml(p.birthPlace)}` : ''}</td></tr>` : ''}
					${p.birthRepublican ? `<tr><td>Date Républicaine</td><td><em>${escapeHtml(p.birthRepublican)}</em></td></tr>` : ''}
					${p.baptismDate || p.baptismPlace ? `<tr><td>Baptême</td><td>${escapeHtml(p.baptismDate || '')} ${p.baptismPlace ? `à ${escapeHtml(p.baptismPlace)}` : ''}</td></tr>` : ''}
					${p.deathDate || p.deathPlace ? `<tr><td>Décès</td><td>${escapeHtml(p.deathDate || '')} ${p.deathPlace ? `à ${escapeHtml(p.deathPlace)}` : ''}</td></tr>` : ''}
					${p.professions?.length ? `<tr><td>Professions</td><td>${escapeHtml(p.professions.join(', '))}</td></tr>` : ''}
					${p.militaryRegiment ? `<tr><td>Service Militaire</td><td>${escapeHtml(p.militaryRegiment)} ${p.militarySerial ? `[Mat. ${escapeHtml(p.militarySerial)}]` : ''}</td></tr>` : ''}
					${p.nobilityCoatOfArms ? `<tr><td>Blason</td><td>🛡️ <em>${escapeHtml(p.nobilityCoatOfArms)}</em></td></tr>` : ''}
					${p.signatureStatus ? `<tr><td>Signature</td><td>${p.signatureStatus === 'SIGNS' ? '✍️ Sait signer' : 'Ne sait signer'}</td></tr>` : ''}
				</table>

				${p.notes ? `<div class="bio-notes">« ${escapeHtml(p.notes)} »</div>` : ''}
			</article>`;
		}

		chaptersHtml += `</div>`;
	});

	win.document.write(`<!doctype html>
<html>
<head>
	<meta charset="utf-8"/>
	<title>Livre de Famille — Origineo</title>
	<style>
		body { font-family: 'Georgia', serif; color: #1e293b; max-width: 860px; margin: 40px auto; padding: 0 24px; line-height: 1.6; }
		.cover { text-align: center; padding: 60px 0 40px; border-bottom: 3px double #0f172a; margin-bottom: 40px; }
		.title { font-size: 34px; font-weight: bold; margin: 0; color: #0f172a; letter-spacing: -0.02em; }
		.subtitle { font-size: 16px; color: #64748b; margin-top: 10px; font-family: sans-serif; }
		.chapter-header { margin: 36px 0 16px; border-bottom: 2px solid #0f172a; padding-bottom: 6px; }
		.chapter-header h2 { margin: 0; font-size: 20px; text-transform: uppercase; letter-spacing: 0.05em; color: #0f172a; }
		.persons-grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
		.bio-entry { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; page-break-inside: avoid; }
		.bio-name { font-size: 18px; font-weight: bold; color: #0f172a; }
		.bio-dates { font-size: 12px; color: #64748b; font-family: monospace; font-weight: bold; margin-bottom: 12px; }
		.bio-table { width: 100%; border-collapse: collapse; font-size: 13px; font-family: sans-serif; margin-bottom: 8px; }
		.bio-table td { padding: 4px 0; vertical-align: top; }
		.bio-table td:first-child { width: 140px; color: #64748b; font-weight: bold; }
		.bio-notes { margin-top: 8px; padding: 8px 12px; background: #ffffff; border-left: 3px solid #3b82f6; border-radius: 4px; font-style: italic; font-size: 13px; }
		.top-actions { position: fixed; top: 12px; right: 12px; display: flex; gap: 8px; }
		.btn { padding: 8px 16px; background: #0f172a; color: white; border: none; border-radius: 99px; cursor: pointer; font-weight: bold; }
		@media print {
			.top-actions { display: none; }
			body { margin: 0; padding: 0; }
		}
	</style>
</head>
<body>
	<div class="top-actions">
		<button class="btn" onclick="window.print()">🖨️ Imprimer ou Enregistrer en PDF</button>
	</div>

	<div class="cover">
		<div style="font-size: 12px; text-transform: uppercase; font-family: sans-serif; letter-spacing: 0.1em; color: #64748b; margin-bottom: 12px;">Origineo Studio — Chronique Généalogique</div>
		<h1 class="title">Livre de Famille</h1>
		<div class="subtitle">Histoire et Ascendance de ${escapeHtml(personLabel(rootPerson))}</div>
		<div style="margin-top: 24px; font-size: 13px; font-family: monospace; color: #64748b;">${treeWindow.nodes.length} individus • ${treeWindow.relationships.length} filiations certifiées</div>
	</div>

	${chaptersHtml}
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
