<script lang="ts">
	import {
		type PersonDto,
		type TreeWindowDto,
		type DocumentDto,
		type EventDetailDto,
		type CitationDto,
		type SourceDto,
		personApi,
		documentApi,
		eventApi,
		sourceApi,
		personLabel,
		formatLifeYears,
		calculateAge
	} from '$lib/api';
	import { i18n } from '$lib/i18n/index.svelte';
	import type { TranslationKey } from '$lib/i18n/translations';
	import DocumentViewerModal from '$lib/components/DocumentViewerModal.svelte';

	let {
		person,
		treeWindow,
		canModify = false,
		onClose,
		onSelectPerson,
		onFocusPerson,
		onOpenAddRelative,
		onTreeMutated
	}: {
		person: PersonDto;
		treeWindow: TreeWindowDto | null;
		canModify?: boolean;
		onClose: () => void;
		onSelectPerson: (id: string) => void;
		onFocusPerson: (id: string) => void;
		onOpenAddRelative: (anchorId: string, defaultType?: 'FATHER' | 'MOTHER' | 'SPOUSE' | 'CHILD') => void;
		onTreeMutated: () => void;
	} = $props();

	let activeTab = $state<'identity' | 'family' | 'documents' | 'events' | 'sources'>('identity');
	let isEditing = $state(false);
	let saving = $state(false);
	let statusMessage = $state('');
	let errorMessage = $state('');

	// Pro Events & Witnesses / Godparents State
	let events = $state<EventDetailDto[]>([]);
	let loadingEvents = $state(false);
	let newEventType = $state('BAPTEME');
	let newEventDate = $state('');
	let newEventPlace = $state('');
	let newEventNotes = $state('');
	let newEventWitnessId = $state('');
	let newEventWitnessRole = $state('PARRAIN');

	// Pro Sources & Citations State
	let citations = $state<CitationDto[]>([]);
	let availableSources = $state<SourceDto[]>([]);
	let loadingSources = $state(false);
	let selectedSourceId = $state('');
	let newCitationFolio = $state('');
	let newCitationTranscription = $state('');
	let newCitationConfidence = $state(3);

	// Quick create source form
	let showNewSourceModal = $state(false);
	let newSourceTitle = $state('');
	let newSourceCallNumber = $state('');
	let newSourceType = $state('REGISTRE_PAROISSIAL');
	let newSourceUrl = $state('');
	let newSourceReliability = $state('PRIMARY');

	// Extended Biographical Form Fields
	let givenNames = $state('');
	let usageSurname = $state('');
	let birthSurname = $state('');
	let nickname = $state('');
	let titleNobility = $state('');
	let gender = $state<'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN'>('UNKNOWN');
	let birthDate = $state('');
	let birthPlace = $state('');
	let baptismDate = $state('');
	let baptismPlace = $state('');
	let deathDate = $state('');
	let deathPlace = $state('');
	let burialDate = $state('');
	let burialPlace = $state('');
	let deathCause = $state('');
	let nationality = $state('');
	let religion = $state('');
	let militaryRegiment = $state('');
	let militarySerial = $state('');
	let nobilityCoatOfArms = $state('');
	let signatureStatus = $state('UNKNOWN');
	let birthRepublican = $state('');
	let deathRepublican = $state('');
	let professionsStr = $state('');
	let residencesStr = $state('');
	let notes = $state('');
	let isRootDefault = $state(false);

	// Documents state (100% transparent to the user)
	let documents = $state<DocumentDto[]>([]);
	let loadingDocs = $state(false);
	let uploadingDoc = $state(false);
	let isDraggingFile = $state(false);
	let docCategory = $state('BIRTH_CERTIFICATE');
	let docDescription = $state('');
	let selectedUnionId = $state<string>('');
	let hasPhoto = $state(false);
	let photoCacheBust = $state(Date.now());
	let activeViewerDoc = $state<DocumentDto | null>(null);

	const DOC_CATEGORIES = [
		'BIRTH_CERTIFICATE',
		'MARRIAGE_CERTIFICATE',
		'DEATH_CERTIFICATE',
		'PHOTO',
		'OFFICIAL_DOCUMENT',
		'OTHER'
	] as const;

	$effect(() => {
		const p = person;
		givenNames = p.givenNames || '';
		usageSurname = p.usageSurname || '';
		birthSurname = p.birthSurname || '';
		nickname = p.nickname || '';
		titleNobility = p.title || '';
		gender = p.gender || 'UNKNOWN';
		birthDate = p.birthDate || '';
		birthPlace = p.birthPlace || '';
		baptismDate = p.baptismDate || '';
		baptismPlace = p.baptismPlace || '';
		deathDate = p.deathDate || '';
		deathPlace = p.deathPlace || '';
		burialDate = p.burialDate || '';
		burialPlace = p.burialPlace || '';
		deathCause = p.deathCause || '';
		nationality = p.nationality || '';
		religion = p.religion || '';
		militaryRegiment = p.militaryRegiment || '';
		militarySerial = p.militarySerial || '';
		nobilityCoatOfArms = p.nobilityCoatOfArms || '';
		signatureStatus = p.signatureStatus || 'UNKNOWN';
		birthRepublican = p.birthRepublican || '';
		deathRepublican = p.deathRepublican || '';
		professionsStr = (p.professions || []).join(', ');
		residencesStr = (p.residences || []).join(', ');
		notes = p.notes || '';
		isRootDefault = Boolean(p.isRootDefault);
		statusMessage = '';
		errorMessage = '';
		isEditing = false;
		selectedUnionId = '';

		loadPersonMedia(p.id);
		loadEvents(p.id);
		loadSourcesAndCitations(p.id);
	});

	async function loadPersonMedia(personId: string) {
		loadingDocs = true;
		try {
			const [docs, photoCheck] = await Promise.all([
				documentApi.getByPerson(personId),
				documentApi.hasProfilePhoto(personId)
			]);
			documents = docs;
			hasPhoto = photoCheck.exists;
		} catch {
			documents = [];
			hasPhoto = false;
		} finally {
			loadingDocs = false;
		}
	}

	async function loadEvents(personId: string) {
		loadingEvents = true;
		try {
			events = await eventApi.getByPerson(personId);
		} catch {
			events = [];
		} finally {
			loadingEvents = false;
		}
	}

	async function loadSourcesAndCitations(personId: string) {
		loadingSources = true;
		try {
			const [cits, srcs] = await Promise.all([
				sourceApi.listCitationsByPerson(personId),
				sourceApi.listSources()
			]);
			citations = cits;
			availableSources = srcs;
			if (srcs.length > 0 && !selectedSourceId) {
				selectedSourceId = srcs[0].id;
			}
		} catch {
			citations = [];
			availableSources = [];
		} finally {
			loadingSources = false;
		}
	}

	async function handleAddEvent() {
		if (!newEventDate && !newEventPlace && !newEventNotes) return;
		try {
			const participants = [{ personId: person.id, role: 'SUBJECT' }];
			if (newEventWitnessId) {
				participants.push({ personId: newEventWitnessId, role: newEventWitnessRole });
			}
			await eventApi.create({
				type: newEventType,
				date: newEventDate || undefined,
				placeName: newEventPlace || undefined,
				notes: newEventNotes || undefined,
				participants
			});
			statusMessage = 'Événement et témoins enregistrés.';
			newEventDate = '';
			newEventPlace = '';
			newEventNotes = '';
			newEventWitnessId = '';
			await loadEvents(person.id);
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'Erreur lors de l’ajout de l’événement';
		}
	}

	async function handleDeleteEvent(id: string) {
		try {
			await eventApi.delete(id);
			await loadEvents(person.id);
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'Erreur lors de la suppression';
		}
	}

	async function handleAddCitation() {
		if (!selectedSourceId) return;
		try {
			await sourceApi.createCitation({
				sourceId: selectedSourceId,
				personId: person.id,
				pageFolio: newCitationFolio || undefined,
				confidence: newCitationConfidence,
				transcription: newCitationTranscription || undefined
			});
			statusMessage = 'Source reliée à la personne avec succès.';
			newCitationFolio = '';
			newCitationTranscription = '';
			await loadSourcesAndCitations(person.id);
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'Erreur lors de l’ajout de la citation';
		}
	}

	async function handleCreateSourceFast() {
		if (!newSourceTitle.trim()) return;
		try {
			const s = await sourceApi.createSource({
				title: newSourceTitle.trim(),
				callNumber: newSourceCallNumber || undefined,
				sourceType: newSourceType,
				url: newSourceUrl || undefined,
				reliability: newSourceReliability
			});
			showNewSourceModal = false;
			newSourceTitle = '';
			newSourceCallNumber = '';
			newSourceUrl = '';
			await loadSourcesAndCitations(person.id);
			selectedSourceId = s.id;
			statusMessage = 'Nouvelle source créée dans le registre.';
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'Erreur lors de la création de la source';
		}
	}

	async function handleDeleteCitation(id: string) {
		try {
			await sourceApi.deleteCitation(id);
			await loadSourcesAndCitations(person.id);
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'Erreur de suppression de la citation';
		}
	}

	const nodeMap = $derived.by(() => {
		const map = new Map<string, PersonDto>();
		if (treeWindow) {
			for (const n of treeWindow.nodes) {
				map.set(n.person.id, n.person);
			}
		}
		return map;
	});

	const family = $derived.by(() => {
		if (!treeWindow) {
			return {
				parents: [] as PersonDto[],
				spouses: [] as { partner: PersonDto; unionId: string }[],
				siblings: [] as PersonDto[],
				children: [] as PersonDto[]
			};
		}
		const currentNode = treeWindow.nodes.find((n) => n.person.id === person.id);
		const parentIds = currentNode?.parents || [];
		const childIds = currentNode?.children || [];

		const parents = parentIds.map((id) => nodeMap.get(id)).filter((p): p is PersonDto => Boolean(p));
		const children = childIds.map((id) => nodeMap.get(id)).filter((p): p is PersonDto => Boolean(p));

		const spouses: { partner: PersonDto; unionId: string }[] = [];
		for (const u of treeWindow.unions) {
			if (u.partner1Id === person.id) {
				const partner = nodeMap.get(u.partner2Id);
				if (partner) spouses.push({ partner, unionId: u.id });
			} else if (u.partner2Id === person.id) {
				const partner = nodeMap.get(u.partner1Id);
				if (partner) spouses.push({ partner, unionId: u.id });
			}
		}

		const siblingIdSet = new Set<string>();
		for (const rel of treeWindow.relationships) {
			if (parentIds.includes(rel.parentId) && rel.childId !== person.id) {
				siblingIdSet.add(rel.childId);
			}
		}
		const siblings = Array.from(siblingIdSet)
			.map((id) => nodeMap.get(id))
			.filter((p): p is PersonDto => Boolean(p));

		return { parents, spouses, siblings, children };
	});

	async function handleSave(e: SubmitEvent) {
		e.preventDefault();
		saving = true;
		statusMessage = '';
		errorMessage = '';
		try {
			await personApi.update(person.id, {
				givenNames: givenNames.trim(),
				usageSurname: usageSurname.trim() || null,
				birthSurname: birthSurname.trim() || null,
				nickname: nickname.trim() || null,
				title: titleNobility.trim() || null,
				gender,
				birthDate: birthDate.trim() || null,
				birthPlace: birthPlace.trim() || null,
				baptismDate: baptismDate.trim() || null,
				baptismPlace: baptismPlace.trim() || null,
				deathDate: deathDate.trim() || null,
				deathPlace: deathPlace.trim() || null,
				burialDate: burialDate.trim() || null,
				burialPlace: burialPlace.trim() || null,
				deathCause: deathCause.trim() || null,
				nationality: nationality.trim() || null,
				religion: religion.trim() || null,
				militaryRegiment: militaryRegiment.trim() || null,
				militarySerial: militarySerial.trim() || null,
				nobilityCoatOfArms: nobilityCoatOfArms.trim() || null,
				signatureStatus: signatureStatus || null,
				birthRepublican: birthRepublican.trim() || null,
				deathRepublican: deathRepublican.trim() || null,
				professions: professionsStr
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean),
				residences: residencesStr
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean),
				notes: notes.trim() || null,
				isRootDefault
			});
			statusMessage = i18n.t('savedSuccess');
			isEditing = false;
			onTreeMutated();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Error';
		} finally {
			saving = false;
		}
	}

	async function handleDeletePerson() {
		if (!confirm(`Supprimer définitivement ${personLabel(person)} ?`)) return;
		try {
			await personApi.delete(person.id);
			onTreeMutated();
			onClose();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Error';
		}
	}

	async function handlePhotoUpload(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		uploadingDoc = true;
		try {
			await documentApi.uploadProfilePhoto(person.id, file);
			hasPhoto = true;
			photoCacheBust = Date.now();
			onTreeMutated();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Upload failed';
		} finally {
			uploadingDoc = false;
			input.value = '';
		}
	}

	async function uploadDocFile(file: File) {
		uploadingDoc = true;
		errorMessage = '';
		try {
			await documentApi.upload(file, {
				personId: selectedUnionId ? undefined : person.id,
				unionId: selectedUnionId || undefined,
				category: docCategory,
				description: docDescription.trim() || undefined
			});
			docDescription = '';
			await loadPersonMedia(person.id);
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Upload failed';
		} finally {
			uploadingDoc = false;
		}
	}

	async function handleDocUpload(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		await uploadDocFile(file);
		input.value = '';
	}

	async function handleDropFile(e: DragEvent) {
		e.preventDefault();
		isDraggingFile = false;
		if (!canModify) return;
		const file = e.dataTransfer?.files?.[0];
		if (file) {
			await uploadDocFile(file);
		}
	}

	async function handleDeleteDoc(docId: string) {
		try {
			await documentApi.delete(docId);
			documents = documents.filter((d) => d.id !== docId);
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Delete failed';
		}
	}

	function translateDocCategory(cat: string): string {
		const key = `docCategory_${cat}` as TranslationKey;
		return i18n.t(key);
	}

	function isImageDocument(doc: DocumentDto): boolean {
		return (
			doc.mimeType?.startsWith('image/') ||
			/\.(jpe?g|png|webp|gif|bmp|svg)$/i.test(doc.filename)
		);
	}

	function formatDocDate(iso: string): string {
		try {
			return new Date(iso).toLocaleDateString(i18n.locale === 'en' ? 'en-US' : 'fr-FR', {
				day: '2-digit',
				month: 'short',
				year: 'numeric'
			});
		} catch {
			return '';
		}
	}

	function printBiographySheet() {
		const win = window.open('', '_blank', 'width=840,height=920');
		if (!win) return;
		const parentsHtml = family.parents.map((p) => `<li><strong>${personLabel(p)}</strong> (${formatLifeYears(p)})</li>`).join('') || '<li>—</li>';
		const spousesHtml = family.spouses.map((s) => `<li><strong>${personLabel(s.partner)}</strong> (${formatLifeYears(s.partner)})</li>`).join('') || '<li>—</li>';
		const childrenHtml = family.children.map((c) => `<li><strong>${personLabel(c)}</strong> (${formatLifeYears(c)})</li>`).join('') || '<li>—</li>';

		win.document.write(`<!doctype html>
<html>
<head>
	<meta charset="utf-8" />
	<title>Fiche Biographique — ${personLabel(person)}</title>
	<style>
		body { font-family: Georgia, serif; color: #0f172a; max-width: 740px; margin: 40px auto; padding: 0 24px; line-height: 1.6; }
		.header { border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
		h1 { margin: 0; font-size: 26px; }
		.sosa { font-family: monospace; font-size: 13px; background: #f1f5f9; padding: 4px 10px; border-radius: 99px; }
		.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
		.box { background: #f8fafc; border: 1px solid #cbd5e1; padding: 12px 16px; border-radius: 8px; }
		.label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-family: sans-serif; font-weight: bold; }
		h3 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-top: 24px; }
	</style>
</head>
<body>
	<div class="header">
		<div>
			<div class="label">Origineo Studio — Fiche Généalogique</div>
			<h1>${personLabel(person)}</h1>
		</div>
		${person.sosaNumber ? `<span class="sosa">Sosa #${person.sosaNumber}</span>` : ''}
	</div>
	<div class="grid">
		<div class="box">
			<div class="label">Naissance</div>
			<div><strong>${person.birthDate || '—'}</strong></div>
			<div>${person.birthPlace || ''}</div>
		</div>
		<div class="box">
			<div class="label">Décès</div>
			<div><strong>${person.deathDate || '—'}</strong></div>
			<div>${person.deathPlace || ''}</div>
		</div>
	</div>
	${person.professions?.length ? `<p><strong>Professions :</strong> ${person.professions.join(', ')}</p>` : ''}
	<h3>Parents</h3><ul>${parentsHtml}</ul>
	<h3>Unions & Conjoints</h3><ul>${spousesHtml}</ul>
	<h3>Enfants</h3><ul>${childrenHtml}</ul>
	${person.notes ? `<h3>Notes biographiques & Sources</h3><p>${person.notes}</p>` : ''}
	<script>window.onload = () => window.print();<\/script>
</body>
</html>`);
		win.document.close();
	}

	const age = $derived(calculateAge(person.birthDate, person.deathDate));
</script>

<aside class="drawer-panel">
	<!-- Hero Header -->
	<div class="drawer-header">
		<div style="display: flex; gap: 0.9rem; align-items: center; min-width: 0; flex: 1;">
			<label
				class="avatar-hero"
				class:male={person.gender === 'MALE'}
				class:female={person.gender === 'FEMALE'}
				style="cursor: {canModify ? 'pointer' : 'default'};"
				title={canModify ? i18n.t('uploadPhotoBtn') : ''}
			>
				{#if hasPhoto}
					<img
						src={documentApi.profilePhotoUrl(person.id, photoCacheBust)}
						alt={personLabel(person)}
					/>
				{:else}
					<span>{(person.givenNames?.[0] || '?').toUpperCase()}</span>
				{/if}
				{#if canModify}
					<input
						type="file"
						accept="image/*"
						style="display: none;"
						onchange={handlePhotoUpload}
						disabled={uploadingDoc}
					/>
				{/if}
			</label>

			<div style="min-width: 0; flex: 1;">
				<div style="display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; margin-bottom: 0.2rem;">
					{#if person.sosaNumber}
						<span class="badge badge-warning mono">Sosa #{person.sosaNumber}</span>
					{/if}
					{#if person.sosaNumbers && person.sosaNumbers.length > 1}
						<span class="badge badge-danger mono">Implex ×{person.sosaNumbers.length}</span>
					{/if}
					{#if age !== null}
						<span class="badge badge-accent">{i18n.t('yearsOld', { age })}</span>
					{/if}
				</div>

				<div style="font-size: 0.72rem; font-weight: 800; letter-spacing: 0.05em; color: var(--text-secondary); text-transform: uppercase;">
					{person.usageSurname || person.birthSurname || '—'}
					{#if person.birthSurname && person.usageSurname && person.birthSurname !== person.usageSurname}
						<span style="font-weight: 500; text-transform: none;">(née {person.birthSurname})</span>
					{/if}
				</div>
				<h2 style="margin: 0; font-size: 1.12rem; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
					{person.title ? `${person.title} ` : ''}{person.givenNames}
					{#if person.nickname}
						<span style="font-weight: 500; font-size: 0.88rem; color: var(--text-secondary);">« {person.nickname} »</span>
					{/if}
				</h2>
				<div style="font-size: 0.77rem; color: var(--text-muted); margin-top: 0.1rem;">
					{formatLifeYears(person) || i18n.t('datesUnknown')}
				</div>
			</div>
		</div>

		<button type="button" class="btn btn-ghost btn-sm" onclick={onClose} title={i18n.t('closeEditBtn')}>
			✕
		</button>
	</div>

	<!-- Action Bar -->
	<div class="action-bar">
		<button type="button" class="btn btn-secondary btn-sm" onclick={() => onFocusPerson(person.id)}>
			<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
				<circle cx="12" cy="12" r="3" />
				<path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
			</svg>
			<span>{i18n.t('centerTreeBtn')}</span>
		</button>
		<button type="button" class="btn btn-secondary btn-sm" onclick={printBiographySheet} title="Imprimer ou exporter la fiche biographique en PDF">
			<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<polyline points="6 9 6 2 18 2 18 9" />
				<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
				<rect x="6" y="14" width="12" height="8" />
			</svg>
			<span>{i18n.t('printBioBtn')}</span>
		</button>
		{#if canModify}
			<button type="button" class="btn btn-primary btn-sm" onclick={() => onOpenAddRelative(person.id)}>
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
					<path d="M12 5v14M5 12h14" />
				</svg>
				<span>{i18n.t('addRelativeBtn')}</span>
			</button>
			<button type="button" class="btn btn-secondary btn-sm" onclick={() => (isEditing = !isEditing)}>
				<span>{isEditing ? i18n.t('cancelBtn') : i18n.t('editBtn')}</span>
			</button>
			<button type="button" class="btn btn-danger btn-sm" onclick={handleDeletePerson} title={i18n.t('deleteBtn')}>
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="3 6 5 6 21 6" />
					<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
				</svg>
			</button>
		{/if}
	</div>

	<!-- Segmented Tabs -->
	<div class="drawer-tabs">
		<button
			type="button"
			class="tab-btn"
			class:active={activeTab === 'identity'}
			onclick={() => (activeTab = 'identity')}
		>
			{i18n.t('tabIdentity')}
		</button>
		<button
			type="button"
			class="tab-btn"
			class:active={activeTab === 'family'}
			onclick={() => (activeTab = 'family')}
		>
			{i18n.t('tabFamily')} ({family.parents.length + family.spouses.length + family.children.length})
		</button>
		<button
			type="button"
			class="tab-btn"
			class:active={activeTab === 'events'}
			onclick={() => (activeTab = 'events')}
		>
			Témoins & Actes ({events.length})
		</button>
		<button
			type="button"
			class="tab-btn"
			class:active={activeTab === 'sources'}
			onclick={() => (activeTab = 'sources')}
		>
			Sources ({citations.length})
		</button>
		<button
			type="button"
			class="tab-btn"
			class:active={activeTab === 'documents'}
			onclick={() => (activeTab = 'documents')}
		>
			{i18n.t('tabDocuments')} ({documents.length})
		</button>
	</div>

	<!-- Body -->
	<div class="drawer-body">
		{#if statusMessage}
			<div class="alert alert-success">{statusMessage}</div>
		{/if}
		{#if errorMessage}
			<div class="alert alert-error">{errorMessage}</div>
		{/if}

		{#if activeTab === 'identity'}
			{#if isEditing && canModify}
				<form onsubmit={handleSave} style="display: flex; flex-direction: column; gap: 0.85rem;">
					<div>
						<label class="label" for="edit-given">{i18n.t('givenNames')} *</label>
						<input id="edit-given" class="input" bind:value={givenNames} required />
					</div>
					<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem;">
						<div>
							<label class="label" for="edit-usage">{i18n.t('usageSurname')}</label>
							<input id="edit-usage" class="input" bind:value={usageSurname} />
						</div>
						<div>
							<label class="label" for="edit-birth-surname">{i18n.t('birthSurname')}</label>
							<input id="edit-birth-surname" class="input" bind:value={birthSurname} />
						</div>
					</div>
					<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem;">
						<div>
							<label class="label" for="edit-nick">{i18n.t('nickname')}</label>
							<input id="edit-nick" class="input" bind:value={nickname} />
						</div>
						<div>
							<label class="label" for="edit-title">{i18n.t('titleNobility')}</label>
							<input id="edit-title" class="input" bind:value={titleNobility} />
						</div>
					</div>
					<div>
						<label class="label" for="edit-gender">{i18n.t('gender')}</label>
						<select id="edit-gender" class="select" bind:value={gender}>
							<option value="MALE">{i18n.t('gender_MALE')}</option>
							<option value="FEMALE">{i18n.t('gender_FEMALE')}</option>
							<option value="OTHER">{i18n.t('gender_OTHER')}</option>
							<option value="UNKNOWN">{i18n.t('gender_UNKNOWN')}</option>
						</select>
					</div>
					<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem;">
						<div>
							<label class="label" for="edit-bdate">{i18n.t('birthDate')}</label>
							<input id="edit-bdate" type="date" class="input" bind:value={birthDate} />
						</div>
						<div>
							<label class="label" for="edit-bplace">{i18n.t('birthPlace')}</label>
							<input id="edit-bplace" class="input" bind:value={birthPlace} />
						</div>
					</div>
					<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem;">
						<div>
							<label class="label" for="edit-bapdate">{i18n.t('baptismDate')}</label>
							<input id="edit-bapdate" type="date" class="input" bind:value={baptismDate} />
						</div>
						<div>
							<label class="label" for="edit-bapplace">{i18n.t('baptismPlace')}</label>
							<input id="edit-bapplace" class="input" bind:value={baptismPlace} />
						</div>
					</div>
					<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem;">
						<div>
							<label class="label" for="edit-ddate">{i18n.t('deathDate')}</label>
							<input id="edit-ddate" type="date" class="input" bind:value={deathDate} />
						</div>
						<div>
							<label class="label" for="edit-dplace">{i18n.t('deathPlace')}</label>
							<input id="edit-dplace" class="input" bind:value={deathPlace} />
						</div>
					</div>
					<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem;">
						<div>
							<label class="label" for="edit-burdate">{i18n.t('burialDate')}</label>
							<input id="edit-burdate" type="date" class="input" bind:value={burialDate} />
						</div>
						<div>
							<label class="label" for="edit-burplace">{i18n.t('burialPlace')}</label>
							<input id="edit-burplace" class="input" bind:value={burialPlace} />
						</div>
					</div>
					<div>
						<label class="label" for="edit-dcause">{i18n.t('deathCause')}</label>
						<input id="edit-dcause" class="input" bind:value={deathCause} />
					</div>
					<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem;">
						<div>
							<label class="label" for="edit-regiment">Régiment militaire</label>
							<input id="edit-regiment" class="input" placeholder="Ex: 144e R.I." bind:value={militaryRegiment} />
						</div>
						<div>
							<label class="label" for="edit-serial">Matricule militaire</label>
							<input id="edit-serial" class="input" placeholder="Ex: Classe 1914, Mat. 2108" bind:value={militarySerial} />
						</div>
					</div>
					<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem;">
						<div>
							<label class="label" for="edit-arms">Armoiries / Blason</label>
							<input id="edit-arms" class="input" placeholder="D'azur au chevron d'or..." bind:value={nobilityCoatOfArms} />
						</div>
						<div>
							<label class="label" for="edit-signature">Capacité à signer</label>
							<select id="edit-signature" class="input" bind:value={signatureStatus}>
								<option value="UNKNOWN">Inconnue</option>
								<option value="SIGNS">Sait signer (signature apposée)</option>
								<option value="DOES_NOT_SIGN">Déclare ne savoir signer</option>
							</select>
						</div>
					</div>
					<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem;">
						<div>
							<label class="label" for="edit-rep-birth">Date républicaine de naissance</label>
							<input id="edit-rep-birth" class="input" placeholder="Ex: 14 Brumaire An IV" bind:value={birthRepublican} />
						</div>
						<div>
							<label class="label" for="edit-rep-death">Date républicaine de décès</label>
							<input id="edit-rep-death" class="input" placeholder="Ex: 2 Nivôse An 8" bind:value={deathRepublican} />
						</div>
					</div>
					<div>
						<label class="label" for="edit-prof">{i18n.t('professions')}</label>
						<input id="edit-prof" class="input" bind:value={professionsStr} />
					</div>
					<div>
						<label class="label" for="edit-res">{i18n.t('residences')}</label>
						<input id="edit-res" class="input" bind:value={residencesStr} />
					</div>
					<div>
						<label class="label" for="edit-notes">{i18n.t('notes')}</label>
						<textarea id="edit-notes" class="textarea" rows="4" bind:value={notes}></textarea>
					</div>
					<label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; cursor: pointer;">
						<input type="checkbox" bind:checked={isRootDefault} />
						<span>{i18n.t('setAsRootDefault')}</span>
					</label>
					<div style="display: flex; gap: 0.5rem; padding-top: 0.4rem;">
						<button type="submit" class="btn btn-primary" style="flex: 1;" disabled={saving}>
							{i18n.t('saveBtn')}
						</button>
						<button type="button" class="btn btn-secondary" onclick={() => (isEditing = false)}>
							{i18n.t('cancelBtn')}
						</button>
					</div>
				</form>
			{:else}
				<!-- Chronological Life Timeline -->
				<div class="timeline-list">
					<div class="timeline-card">
						<div class="timeline-dot birth">°</div>
						<div style="min-width: 0; flex: 1;">
							<div class="info-label">{i18n.t('birthDate')} & {i18n.t('birthPlace')}</div>
							<div class="info-value mono">{person.birthDate || i18n.t('datesUnknown')}</div>
							{#if person.birthPlace}
								<div class="info-sub">{person.birthPlace}</div>
							{/if}
							{#if person.baptismDate || person.baptismPlace}
								<div class="info-sub" style="margin-top: 0.25rem;">
									Baptême : {person.baptismDate || ''} {person.baptismPlace ? `· ${person.baptismPlace}` : ''}
								</div>
							{/if}
						</div>
					</div>

					{#if family.spouses.length > 0}
						<div class="timeline-card">
							<div class="timeline-dot union">⚭</div>
							<div style="min-width: 0; flex: 1;">
								<div class="info-label">{i18n.t('spousesSection')}</div>
								{#each family.spouses as sp (sp.unionId)}
									<div class="info-value" style="font-size: 0.83rem;">
										{i18n.t('marriedWith', { name: personLabel(sp.partner) })}
									</div>
								{/each}
							</div>
						</div>
					{/if}

					{#if person.deathDate || person.deathPlace || person.burialDate || person.burialPlace}
						<div class="timeline-card">
							<div class="timeline-dot death">†</div>
							<div style="min-width: 0; flex: 1;">
								<div class="info-label">{i18n.t('deathDate')} & {i18n.t('deathPlace')}</div>
								<div class="info-value mono">{person.deathDate || i18n.t('datesUnknown')}</div>
								{#if person.deathPlace}
									<div class="info-sub">{person.deathPlace}</div>
								{/if}
								{#if person.deathCause}
									<div class="info-sub">Circonstances : {person.deathCause}</div>
								{/if}
								{#if person.burialDate || person.burialPlace}
									<div class="info-sub" style="margin-top: 0.25rem;">
										Inhumation : {person.burialDate || ''} {person.burialPlace ? `· ${person.burialPlace}` : ''}
									</div>
								{/if}
							</div>
						</div>
					{/if}

					<div class="info-card">
						<div class="info-label">{i18n.t('gender')}</div>
						<div class="info-value">{i18n.t(`gender_${person.gender}`)}</div>
					</div>

					{#if person.professions && person.professions.length > 0}
						<div class="info-card">
							<div class="info-label">{i18n.t('professions')}</div>
							<div style="display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.35rem;">
								{#each person.professions as prof}
									<span class="badge badge-accent">{prof}</span>
								{/each}
							</div>
						</div>
					{/if}

					{#if person.residences && person.residences.length > 0}
						<div class="info-card">
							<div class="info-label">{i18n.t('residences')}</div>
							<div style="display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.35rem;">
								{#each person.residences as res}
									<span class="badge badge-success">{res}</span>
								{/each}
							</div>
						</div>
					{/if}

					{#if person.militaryRegiment || person.militarySerial}
						<div class="info-card">
							<div class="info-label">Service & Parcours Militaire</div>
							<div class="info-value" style="font-size: 0.85rem;">
								{person.militaryRegiment || ''}
								{#if person.militarySerial}
									<span class="mono" style="color: var(--text-secondary); margin-left: 0.4rem;">[Mat. {person.militarySerial}]</span>
								{/if}
							</div>
						</div>
					{/if}

					{#if person.nobilityCoatOfArms}
						<div class="info-card">
							<div class="info-label">Armoiries & Blasonnement</div>
							<div class="info-value" style="font-size: 0.82rem; font-style: italic;">
								🛡️ {person.nobilityCoatOfArms}
							</div>
						</div>
					{/if}

					{#if person.signatureStatus && person.signatureStatus !== 'UNKNOWN'}
						<div class="info-card">
							<div class="info-label">Mention de signature</div>
							<div class="info-value" style="font-size: 0.84rem;">
								✍️ {person.signatureStatus === 'SIGNS' ? 'Sait signer (signature apposée au registre)' : 'Déclare ne savoir signer'}
							</div>
						</div>
					{/if}

					{#if person.notes}
						<div class="info-card">
							<div class="info-label">{i18n.t('notes')}</div>
							<p style="margin: 0.35rem 0 0; font-size: 0.83rem; line-height: 1.55; white-space: pre-wrap; color: var(--text-secondary);">
								{person.notes}
							</p>
						</div>
					{/if}
				</div>
			{/if}
		{:else if activeTab === 'family'}
			<div style="display: flex; flex-direction: column; gap: 1.15rem;">
				<!-- Parents -->
				<section>
					<div class="section-header">
						<h4>{i18n.t('parentsSection')}</h4>
						{#if canModify}
							<div style="display: flex; gap: 0.35rem;">
								<button type="button" class="btn btn-secondary btn-sm" onclick={() => onOpenAddRelative(person.id, 'FATHER')}>
									{i18n.t('addFather')}
								</button>
								<button type="button" class="btn btn-secondary btn-sm" onclick={() => onOpenAddRelative(person.id, 'MOTHER')}>
									{i18n.t('addMother')}
								</button>
							</div>
						{/if}
					</div>
					{#if family.parents.length === 0}
						<p class="empty-hint">{i18n.t('noParents')}</p>
					{:else}
						{#each family.parents as p (p.id)}
							<button type="button" class="rel-item" onclick={() => onSelectPerson(p.id)} ondblclick={() => onFocusPerson(p.id)}>
								<div style="display: flex; align-items: center; gap: 0.55rem;">
									<span class="rel-dot" class:male={p.gender === 'MALE'} class:female={p.gender === 'FEMALE'}></span>
									<span>{personLabel(p)}</span>
								</div>
								<span class="rel-years mono">{formatLifeYears(p)}</span>
							</button>
						{/each}
					{/if}
				</section>

				<!-- Spouses -->
				<section>
					<div class="section-header">
						<h4>{i18n.t('spousesSection')}</h4>
						{#if canModify}
							<button type="button" class="btn btn-secondary btn-sm" onclick={() => onOpenAddRelative(person.id, 'SPOUSE')}>
								{i18n.t('addSpouse')}
							</button>
						{/if}
					</div>
					{#if family.spouses.length === 0}
						<p class="empty-hint">{i18n.t('noSpouses')}</p>
					{:else}
						{#each family.spouses as s (s.unionId)}
							<button type="button" class="rel-item" onclick={() => onSelectPerson(s.partner.id)} ondblclick={() => onFocusPerson(s.partner.id)}>
								<div style="display: flex; align-items: center; gap: 0.55rem;">
									<span style="color: var(--gold); font-weight: 800;">⚭</span>
									<span>{personLabel(s.partner)}</span>
								</div>
								<span class="rel-years mono">{formatLifeYears(s.partner)}</span>
							</button>
						{/each}
					{/if}
				</section>

				<!-- Children -->
				<section>
					<div class="section-header">
						<h4>{i18n.t('childrenSection')}</h4>
						{#if canModify}
							<button type="button" class="btn btn-secondary btn-sm" onclick={() => onOpenAddRelative(person.id, 'CHILD')}>
								{i18n.t('addChild')}
							</button>
						{/if}
					</div>
					{#if family.children.length === 0}
						<p class="empty-hint">{i18n.t('noChildren')}</p>
					{:else}
						{#each family.children as c (c.id)}
							<button type="button" class="rel-item" onclick={() => onSelectPerson(c.id)} ondblclick={() => onFocusPerson(c.id)}>
								<div style="display: flex; align-items: center; gap: 0.55rem;">
									<span class="rel-dot" class:male={c.gender === 'MALE'} class:female={c.gender === 'FEMALE'}></span>
									<span>{personLabel(c)}</span>
								</div>
								<span class="rel-years mono">{formatLifeYears(c)}</span>
							</button>
						{/each}
					{/if}
				</section>

				<!-- Siblings -->
				{#if family.siblings.length > 0}
					<section>
						<div class="section-header">
							<h4>{i18n.t('siblingsSection')}</h4>
						</div>
						{#each family.siblings as sib (sib.id)}
							<button type="button" class="rel-item" onclick={() => onSelectPerson(sib.id)} ondblclick={() => onFocusPerson(sib.id)}>
								<div style="display: flex; align-items: center; gap: 0.55rem;">
									<span class="rel-dot" class:male={sib.gender === 'MALE'} class:female={sib.gender === 'FEMALE'}></span>
									<span>{personLabel(sib)}</span>
								</div>
								<span class="rel-years mono">{formatLifeYears(sib)}</span>
							</button>
						{/each}
					</section>
				{/if}
			</div>

		{:else if activeTab === 'events'}
			<!-- Events & Participants (Témoins, Parrains, etc.) -->
			<div style="display: flex; flex-direction: column; gap: 1.1rem;">
				{#if canModify}
					<div class="info-card">
						<div class="info-label" style="margin-bottom: 0.55rem;">Ajouter un acte ou événement avec témoins</div>
						<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.5rem;">
							<div>
								<label class="label">Type d'acte</label>
								<select class="input" bind:value={newEventType}>
									<option value="BAPTEME">Baptême</option>
									<option value="MARIAGE">Mariage</option>
									<option value="SEPULTURE">Sépulture</option>
									<option value="CONTRAT_MARIAGE">Contrat de mariage</option>
									<option value="TESTAMENT">Testament</option>
									<option value="RECENSEMENT">Recensement</option>
									<option value="MILITAIRE">Service militaire</option>
									<option value="AUTRE">Autre événement</option>
								</select>
							</div>
							<div>
								<label class="label">Date (ou Républicain)</label>
								<input class="input" placeholder="AAAA-MM-JJ" bind:value={newEventDate} />
							</div>
						</div>
						<div style="margin-bottom: 0.5rem;">
							<label class="label">Lieu de l'acte</label>
							<input class="input" placeholder="Commune, paroisse ou département" bind:value={newEventPlace} />
						</div>

						<!-- Witness Linker -->
						<div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 0.6rem; margin-bottom: 0.5rem;">
							<div style="font-size: 0.72rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 0.35rem;">
								Témoin / Parrain / Célébrant associé
							</div>
							<div style="display: grid; grid-template-columns: 1fr 140px; gap: 0.5rem;">
								<select class="input" bind:value={newEventWitnessId}>
									<option value="">-- Choisir une personne de l'arbre --</option>
									{#each Array.from(nodeMap.values()) as np (np.id)}
										{#if np.id !== person.id}
											<option value={np.id}>{personLabel(np)} ({formatLifeYears(np)})</option>
										{/if}
									{/each}
								</select>
								<select class="input" bind:value={newEventWitnessRole}>
									<option value="PARRAIN">Parrain</option>
									<option value="MARRAINE">Marraine</option>
									<option value="TEMOIN">Témoin</option>
									<option value="NOTAIRE">Notaire</option>
									<option value="OFFICIER_ETAT_CIVIL">Officier d'état civil</option>
									<option value="AUTRE">Autre rôle</option>
								</select>
							</div>
						</div>

						<textarea
							class="input"
							rows="2"
							placeholder="Transcription textuelle de l'acte ou remarques marginales..."
							bind:value={newEventNotes}
						></textarea>

						<button
							type="button"
							class="btn btn-primary btn-sm"
							style="margin-top: 0.6rem; width: 100%;"
							onclick={handleAddEvent}
						>
							Enregistrer l'acte & les témoins
						</button>
					</div>
				{/if}

				<!-- List of events -->
				<div>
					<h4 style="margin: 0 0 0.6rem; font-size: 0.74rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-secondary);">
						Chronologie des actes & citations ({events.length})
					</h4>
					{#if loadingEvents}
						<p class="empty-hint">Chargement des actes...</p>
					{:else if events.length === 0}
						<p class="empty-hint">Aucun acte spécifique enregistré avec témoins.</p>
					{:else}
						<div style="display: flex; flex-direction: column; gap: 0.65rem;">
							{#each events as ev (ev.id)}
								<div class="info-card" style="padding: 0.75rem;">
									<div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
										<div>
											<span class="badge badge-accent" style="font-size: 0.68rem; font-weight: 800;">
												{ev.type}
											</span>
											<span class="mono" style="font-size: 0.8rem; font-weight: 700; margin-left: 0.4rem;">
												{ev.date || 'Date non précisée'}
											</span>
											{#if ev.placeName}
												<div style="font-size: 0.76rem; color: var(--text-secondary); margin-top: 0.2rem;">
													📍 {ev.placeName}
												</div>
											{/if}
										</div>
										{#if canModify}
											<button
												type="button"
												class="btn btn-ghost btn-sm"
												style="color: var(--danger); padding: 2px 6px;"
												onclick={() => handleDeleteEvent(ev.id)}
												title="Supprimer l'événement"
											>
												✕
											</button>
										{/if}
									</div>

									<!-- Participants -->
									{#if ev.participants.length > 0}
										<div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed var(--border-subtle); display: flex; flex-direction: column; gap: 0.25rem;">
											{#each ev.participants as p}
												<div style="font-size: 0.75rem; display: flex; align-items: center; justify-content: space-between;">
													<span>
														<strong>{p.role} :</strong>
														<button
															type="button"
															class="btn-link"
															style="background: none; border: none; padding: 0 0.3rem; color: var(--accent); cursor: pointer; text-decoration: underline;"
															onclick={() => onSelectPerson(p.personId)}
														>
															{p.personName}
														</button>
													</span>
												</div>
											{/each}
										</div>
									{/if}

									{#if ev.notes}
										<div style="margin-top: 0.4rem; font-size: 0.76rem; color: var(--text-secondary); font-style: italic;">
											« {ev.notes} »
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>

		{:else if activeTab === 'sources'}
			<!-- Professional Sources & Citations Manager -->
			<div style="display: flex; flex-direction: column; gap: 1.1rem;">
				{#if canModify}
					<div class="info-card">
						<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.55rem;">
							<div class="info-label">Relier une source d'archive (Cote / Folio)</div>
							<button
								type="button"
								class="btn btn-secondary btn-sm"
								style="font-size: 0.72rem;"
								onclick={() => (showNewSourceModal = !showNewSourceModal)}
							>
								{showNewSourceModal ? 'Fermer' : '+ Nouveau Registre'}
							</button>
						</div>

						{#if showNewSourceModal}
							<div style="background: var(--bg-surface); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: 0.75rem; margin-bottom: 0.75rem;">
								<div style="font-weight: 700; font-size: 0.8rem; margin-bottom: 0.5rem;">
									Créer une référence de registre d'archives
								</div>
								<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.4rem;">
									<input class="input" placeholder="Titre (ex: Registre BMS Bordeaux 1740-1760)" bind:value={newSourceTitle} />
									<input class="input" placeholder="Cote (ex: 3E 45/12)" bind:value={newSourceCallNumber} />
								</div>
								<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.4rem;">
									<select class="input" bind:value={newSourceType}>
										<option value="REGISTRE_PAROISSIAL">Registre paroissial (BMS)</option>
										<option value="ETAT_CIVIL">Registre d'état civil (NMD)</option>
										<option value="ACTE_NOTARIE">Minutes notariales</option>
										<option value="RECENSEMENT">Recensement de population</option>
										<option value="MILITAIRE">Registre matricule militaire</option>
									</select>
									<select class="input" bind:value={newSourceReliability}>
										<option value="PRIMARY">Acte original (Preuve directe)</option>
										<option value="SECONDARY">Copie conforme / Table décennale</option>
										<option value="QUESTIONABLE">Source douteuse / Non confirmée</option>
										<option value="ORAL">Tradition orale</option>
									</select>
								</div>
								<input class="input" placeholder="Lien URL vers l'archive numérisée en ligne" bind:value={newSourceUrl} />
								<button
									type="button"
									class="btn btn-primary btn-sm"
									style="margin-top: 0.5rem; width: 100%;"
									onclick={handleCreateSourceFast}
								>
									Enregistrer le registre dans la bibliothèque
								</button>
							</div>
						{/if}

						<div style="margin-bottom: 0.5rem;">
							<label class="label">Registre source</label>
							<select class="input" bind:value={selectedSourceId}>
								{#if availableSources.length === 0}
									<option value="">Aucun registre disponible (cliquez sur + Nouveau Registre)</option>
								{:else}
									{#each availableSources as s (s.id)}
										<option value={s.id}>{s.title} {s.callNumber ? `[${s.callNumber}]` : ''}</option>
									{/each}
								{/if}
							</select>
						</div>

						<div style="display: grid; grid-template-columns: 1fr 140px; gap: 0.5rem; margin-bottom: 0.5rem;">
							<input class="input" placeholder="Vue / Page / N° d'acte (ex: Vue 42/120, Acte 14)" bind:value={newCitationFolio} />
							<select class="input" bind:value={newCitationConfidence}>
								<option value={4}>Preuve certaine (4/4)</option>
								<option value={3}>Preuve directe (3/4)</option>
								<option value={2}>Preuve secondaire (2/4)</option>
								<option value={1}>Indice / Doute (1/4)</option>
							</select>
						</div>

						<textarea
							class="input"
							rows="2"
							placeholder="Extrait textuel de l'acte / Transcription paléographique..."
							bind:value={newCitationTranscription}
						></textarea>

						<button
							type="button"
							class="btn btn-primary btn-sm"
							style="margin-top: 0.6rem; width: 100%;"
							onclick={handleAddCitation}
							disabled={!selectedSourceId}
						>
							Lier cette citation à {person.givenNames}
						</button>
					</div>
				{/if}

				<!-- Citations list -->
				<div>
					<h4 style="margin: 0 0 0.6rem; font-size: 0.74rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-secondary);">
						Citations & Preuves d'archives ({citations.length})
					</h4>
					{#if loadingSources}
						<p class="empty-hint">Chargement des sources...</p>
					{:else if citations.length === 0}
						<p class="empty-hint">Aucune archive ou citation formelle rattachée.</p>
					{:else}
						<div style="display: flex; flex-direction: column; gap: 0.65rem;">
							{#each citations as cit (cit.id)}
								<div class="info-card" style="padding: 0.75rem;">
									<div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
										<div>
											<div style="font-weight: 700; font-size: 0.86rem; color: var(--text-primary);">
												{cit.sourceTitle}
											</div>
											{#if cit.callNumber}
												<span class="badge badge-accent mono" style="font-size: 0.68rem; margin-top: 0.2rem;">
													Cote : {cit.callNumber}
												</span>
											{/if}
											{#if cit.pageFolio}
												<span class="mono" style="font-size: 0.76rem; color: var(--text-secondary); margin-left: 0.35rem;">
													{cit.pageFolio}
												</span>
											{/if}
										</div>
										{#if canModify}
											<button
												type="button"
												class="btn btn-ghost btn-sm"
												style="color: var(--danger); padding: 2px 6px;"
												onclick={() => handleDeleteCitation(cit.id)}
												title="Détacher la citation"
											>
												✕
											</button>
										{/if}
									</div>

									{#if cit.transcription}
										<div style="margin-top: 0.4rem; padding: 0.5rem; background: var(--bg-surface); border-radius: var(--radius-sm); font-size: 0.78rem; font-family: var(--font-serif); line-height: 1.45;">
											« {cit.transcription} »
										</div>
									{/if}

									{#if cit.sourceUrl}
										<div style="margin-top: 0.4rem;">
											<a
												href={cit.sourceUrl}
												target="_blank"
												rel="noopener noreferrer"
												class="btn btn-secondary btn-sm"
												style="font-size: 0.72rem; padding: 2px 8px;"
											>
												Consulter l'archive numérisée ↗
											</a>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{:else if activeTab === 'documents'}
			<div style="display: flex; flex-direction: column; gap: 1.1rem;">
				{#if canModify}
					<!-- Transparent Archival Upload Studio -->
					<div class="info-card">
						<div class="info-label" style="margin-bottom: 0.55rem;">{i18n.t('uploadDocBtn')}</div>

						<!-- Category Pills -->
						<div class="cat-pills">
							{#each DOC_CATEGORIES as cat (cat)}
								<button
									type="button"
									class="cat-pill"
									class:active={docCategory === cat}
									onclick={() => (docCategory = cat)}
								>
									{translateDocCategory(cat)}
								</button>
							{/each}
						</div>

						<!-- Human-readable Scope Selector (Personal vs Couple) -->
						{#if family.spouses.length > 0}
							<div style="margin-top: 0.55rem;">
								<select class="select" bind:value={selectedUnionId}>
									<option value="">
										{i18n.t('attachToPerson', { name: personLabel(person) })}
									</option>
									{#each family.spouses as sp (sp.unionId)}
										<option value={sp.unionId}>
											{i18n.t('attachToUnion', { spouse: personLabel(sp.partner) })}
										</option>
									{/each}
								</select>
							</div>
						{/if}

						<input
							class="input"
							style="margin-top: 0.55rem;"
							placeholder={i18n.t('docDescriptionPlaceholder')}
							bind:value={docDescription}
						/>

						<!-- Drag & Drop Zone -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<label
							class="drop-zone"
							class:dragging={isDraggingFile}
							ondragover={(e) => {
								e.preventDefault();
								isDraggingFile = true;
							}}
							ondragleave={() => (isDraggingFile = false)}
							ondrop={handleDropFile}
						>
							<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
								<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
								<polyline points="17 8 12 3 7 8" />
								<line x1="12" y1="3" x2="12" y2="15" />
							</svg>
							<span>{uploadingDoc ? 'Téléversement en cours…' : i18n.t('uploadDropHint')}</span>
							<input type="file" style="display: none;" onchange={handleDocUpload} disabled={uploadingDoc} />
						</label>
					</div>
				{/if}

				<!-- Archival Gallery -->
				<div>
					<h4 style="margin: 0 0 0.6rem; font-size: 0.74rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-secondary);">
						{i18n.t('documentsTitle')} ({documents.length})
					</h4>
					{#if loadingDocs}
						<p class="empty-hint">Chargement...</p>
					{:else if documents.length === 0}
						<p class="empty-hint">{i18n.t('noDocuments')}</p>
					{:else}
						<div style="display: flex; flex-direction: column; gap: 0.6rem;">
							{#each documents as doc (doc.id)}
								<div class="doc-card">
									{#if isImageDocument(doc)}
										<!-- svelte-ignore a11y_click_events_have_key_events -->
										<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
										<img
											src={documentApi.viewUrl(doc.id)}
											alt={doc.description || doc.filename}
											class="doc-thumb"
											onclick={() => (activeViewerDoc = doc)}
										/>
									{:else}
										<div class="doc-icon-box">PDF</div>
									{/if}

									<div style="min-width: 0; flex: 1;">
										<div style="display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap;">
											<span class="badge badge-accent">{translateDocCategory(doc.category)}</span>
											{#if doc.unionId}
												<span class="badge badge-warning">⚭ Union</span>
											{/if}
										</div>
										<div style="font-size: 0.83rem; font-weight: 700; margin-top: 0.22rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
											{doc.description || doc.filename}
										</div>
										<div style="font-size: 0.71rem; color: var(--text-muted); margin-top: 0.1rem;">
											{doc.filename} · {formatDocDate(doc.createdAt)}
										</div>
									</div>

									<div style="display: flex; flex-direction: column; gap: 0.3rem;">
										<button
											type="button"
											class="btn btn-primary btn-sm"
											onclick={() => (activeViewerDoc = doc)}
										>
											{i18n.t('inspectDocBtn')}
										</button>
										<div style="display: flex; gap: 0.3rem; justify-content: flex-end;">
											<a
												href={documentApi.downloadUrl(doc.id)}
												class="btn btn-secondary btn-sm"
												title={i18n.t('downloadDoc')}
											>
												⬇
											</a>
											{#if canModify}
												<button
													type="button"
													class="btn btn-danger btn-sm"
													onclick={() => handleDeleteDoc(doc.id)}
												>
													✕
												</button>
											{/if}
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</aside>

{#if activeViewerDoc}
	<DocumentViewerModal
		document={activeViewerDoc}
		{canModify}
		onClose={() => (activeViewerDoc = null)}
		onSelectPerson={(id) => {
			activeViewerDoc = null;
			onFocusPerson(id);
		}}
	/>
{/if}

<style>
	.avatar-hero {
		width: 60px;
		height: 60px;
		border-radius: 50%;
		background: var(--color-other-bg);
		color: var(--color-other);
		border: 2px solid var(--color-other-border);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 800;
		font-size: 1.35rem;
		flex-shrink: 0;
		overflow: hidden;
		transition: transform 0.15s ease;
	}

	.avatar-hero:hover {
		transform: scale(1.03);
	}

	.avatar-hero.male {
		background: var(--color-male-bg);
		color: var(--color-male);
		border-color: var(--color-male-border);
	}

	.avatar-hero.female {
		background: var(--color-female-bg);
		color: var(--color-female);
		border-color: var(--color-female-border);
	}

	.avatar-hero img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.action-bar {
		padding: 0.6rem 1.1rem;
		border-bottom: 1px solid var(--border-subtle);
		display: flex;
		flex-wrap: wrap;
		gap: 0.38rem;
		background: var(--bg-elevated);
	}

	.drawer-tabs {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		border-bottom: 1px solid var(--border-subtle);
		background: var(--bg-surface);
	}

	.tab-btn {
		padding: 0.68rem 0.4rem;
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--text-secondary);
		font-size: 0.77rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.14s ease;
	}

	.tab-btn.active {
		color: var(--accent);
		border-bottom-color: var(--accent);
		background: var(--accent-soft);
	}

	.timeline-list {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	.timeline-card {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.78rem 0.9rem;
		border-radius: var(--radius-md);
		background: var(--bg-elevated);
		border: 1px solid var(--border-subtle);
	}

	.timeline-dot {
		width: 28px;
		height: 28px;
		border-radius: 8px;
		display: grid;
		place-items: center;
		font-weight: 800;
		font-size: 0.9rem;
		flex-shrink: 0;
	}

	.timeline-dot.birth {
		background: var(--accent-soft);
		color: var(--accent);
	}

	.timeline-dot.union {
		background: var(--gold-soft);
		color: var(--gold);
	}

	.timeline-dot.death {
		background: rgba(148, 163, 184, 0.14);
		color: var(--text-secondary);
	}

	.info-card {
		padding: 0.78rem 0.9rem;
		border-radius: var(--radius-md);
		background: var(--bg-elevated);
		border: 1px solid var(--border-subtle);
	}

	.info-label {
		font-size: 0.69rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
	}

	.info-value {
		font-size: 0.86rem;
		font-weight: 700;
		color: var(--text-primary);
		margin-top: 0.18rem;
	}

	.info-sub {
		font-size: 0.77rem;
		color: var(--text-secondary);
		margin-top: 0.1rem;
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.45rem;
	}

	.section-header h4 {
		margin: 0;
		font-size: 0.75rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-secondary);
	}

	.rel-item {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.62rem 0.8rem;
		margin-bottom: 0.38rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--border-subtle);
		background: var(--bg-elevated);
		color: var(--text-primary);
		font-size: 0.83rem;
		font-weight: 600;
		cursor: pointer;
		text-align: left;
		transition: all 0.14s ease;
	}

	.rel-item:hover {
		border-color: var(--accent);
		background: var(--bg-tertiary);
	}

	.rel-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-other);
		flex-shrink: 0;
	}

	.rel-dot.male {
		background: var(--color-male);
	}

	.rel-dot.female {
		background: var(--color-female);
	}

	.rel-years {
		font-size: 0.73rem;
		color: var(--text-muted);
	}

	.empty-hint {
		margin: 0;
		font-size: 0.79rem;
		color: var(--text-muted);
		font-style: italic;
	}

	/* ─── Transparent Documents & Media Studio ────────────────────────────── */
	.cat-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.cat-pill {
		padding: 0.25rem 0.58rem;
		border-radius: 999px;
		border: 1px solid var(--border-color);
		background: var(--bg-surface);
		color: var(--text-secondary);
		font-size: 0.72rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.12s ease;
	}

	.cat-pill.active {
		background: var(--accent-soft);
		color: var(--accent);
		border-color: var(--accent);
	}

	.drop-zone {
		margin-top: 0.6rem;
		padding: 0.9rem;
		border-radius: var(--radius-md);
		border: 1.5px dashed var(--border-strong);
		background: var(--bg-surface);
		color: var(--text-secondary);
		font-size: 0.78rem;
		font-weight: 600;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.35rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.drop-zone:hover,
	.drop-zone.dragging {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.doc-card {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.65rem 0.75rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--border-subtle);
		background: var(--bg-elevated);
	}

	.doc-thumb {
		width: 54px;
		height: 54px;
		border-radius: 8px;
		object-fit: cover;
		border: 1px solid var(--border-color);
		cursor: pointer;
		flex-shrink: 0;
	}

	.doc-icon-box {
		width: 54px;
		height: 54px;
		border-radius: 8px;
		background: var(--bg-surface);
		border: 1px solid var(--border-color);
		display: grid;
		place-items: center;
		font-size: 0.72rem;
		font-weight: 800;
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.alert {
		padding: 0.6rem 0.8rem;
		border-radius: var(--radius-md);
		font-size: 0.81rem;
		margin-bottom: 0.75rem;
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
