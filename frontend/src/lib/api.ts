export const DEFAULT_TREE_ID = '00000000-0000-0000-0000-000000000001';

export type UserRole = 'ADMIN' | 'MODIFIER' | 'READER';

export interface UserDto {
	id: string;
	email: string;
	displayName: string | null;
	role: UserRole;
	createdAt: string;
}

export interface PersonDto {
	id: string;
	treeId: string;
	usageSurname: string | null;
	birthSurname: string | null;
	givenNames: string;
	nickname: string | null;
	title: string | null;
	gender: 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN';
	birthDate: string | null;
	birthPlace: string | null;
	birthPlaceId?: string | null;
	baptismDate?: string | null;
	baptismPlace?: string | null;
	deathDate: string | null;
	deathPlace: string | null;
	deathPlaceId?: string | null;
	burialDate?: string | null;
	burialPlace?: string | null;
	deathCause?: string | null;
	religion?: string | null;
	physicalDescription?: string | null;
	nationality?: string | null;
	education?: string | null;
	militaryRegiment?: string | null;
	militarySerial?: string | null;
	nobilityCoatOfArms?: string | null;
	signatureStatus?: string | null;
	birthRepublican?: string | null;
	deathRepublican?: string | null;
	professions: string[];
	residences: string[];
	notes: string | null;
	hasProfilePhoto?: boolean;
	isRootDefault: boolean;
	sosaNumber?: number;
	sosaNumbers?: number[];
	createdAt: string;
	updatedAt: string;
}

export interface RelationshipDto {
	id: string;
	parentId: string;
	childId: string;
	type: string;
	createdAt: string;
}

export interface UnionDto {
	id: string;
	treeId: string;
	partner1Id: string;
	partner2Id: string;
	type: string;
	startDate: string | null;
	startPlace: string | null;
	endDate: string | null;
	endReason: string | null;
	notes: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface TreeNodeDto {
	person: PersonDto;
	generation: number;
	unions: UnionDto[];
	parents: string[];
	children: string[];
	visible: boolean;
}

export interface TreeWindowStatsDto {
	rootPersonId: string;
	requestedAncestors: number;
	requestedDescendants: number;
	visiblePersons: number;
	totalCollectedPersons: number;
	visibleRelationships: number;
	visibleUnions: number;
	limit: number;
	truncated: boolean;
	includesSiblings: boolean;
	includesSpouses: boolean;
}

export interface TreeWindowDto {
	rootPersonId: string;
	nodes: TreeNodeDto[];
	relationships: RelationshipDto[];
	unions: UnionDto[];
	stats: TreeWindowStatsDto;
}

export interface RelationshipPathStepDto {
	person: PersonDto;
	relationFromPrev: string | null;
}

export interface CommonAncestorDto {
	person: PersonDto;
	stepsFromA: number;
	stepsFromB: number;
	pathCount: number;
}

export interface RelationshipPathDto {
	found: boolean;
	distance: number;
	path: PersonDto[];
	steps: RelationshipPathStepDto[];
	summaryFr: string | null;
	summaryEn: string | null;
	commonAncestors?: CommonAncestorDto[];
	consanguinityCoefficient?: number;
	relationshipCoefficient?: number;
	isImplex?: boolean;
}

export interface DocumentTagDto {
	id: string;
	documentId: string;
	personId: string;
	personGivenNames: string;
	personSurname: string | null;
	xPct: number;
	yPct: number;
	wPct: number;
	hPct: number;
	label: string | null;
	createdAt: string;
}

export interface MapPlaceDto {
	id: string;
	name: string;
	region: string | null;
	country: string | null;
	latitude: number | null;
	longitude: number | null;
	birthCount: number;
	deathCount: number;
	totalEvents: number;
	samplePersons: string[];
}

export interface MigrationArcDto {
	fromPlaceId: string;
	fromName: string;
	fromLat: number;
	fromLng: number;
	toPlaceId: string;
	toName: string;
	toLat: number;
	toLng: number;
	count: number;
	kind: 'BIRTH_TO_DEATH' | 'PARENT_TO_CHILD';
}

export interface AnomalyDto {
	code: string;
	severity: 'ERROR' | 'WARNING';
	personId: string;
	personName: string;
	relatedPersonId: string | null;
	relatedPersonName: string | null;
	messageFr: string;
	messageEn: string;
}

export interface EventParticipantDto {
	id: string;
	eventId: string;
	personId: string;
	personName: string;
	role: string;
	createdAt: string;
}

export interface EventDetailDto {
	id: string;
	treeId: string;
	type: string;
	date: string | null;
	dateRaw: string | null;
	notes: string | null;
	placeId: string | null;
	placeName: string | null;
	participants: EventParticipantDto[];
	createdAt: string;
	updatedAt: string;
}

export interface RepositoryDto {
	id: string;
	treeId: string;
	name: string;
	type: string;
	websiteUrl: string | null;
	address: string | null;
	notes: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface SourceDto {
	id: string;
	treeId: string;
	repositoryId: string | null;
	repositoryName: string | null;
	title: string;
	author: string | null;
	callNumber: string | null;
	sourceType: string;
	reliability: string;
	url: string | null;
	textExtract: string | null;
	notes: string | null;
	citationCount: number;
	createdAt: string;
	updatedAt: string;
}

export interface CitationDto {
	id: string;
	sourceId: string;
	sourceTitle: string;
	callNumber: string | null;
	reliability: string;
	sourceUrl: string | null;
	personId: string | null;
	unionId: string | null;
	pageFolio: string | null;
	confidence: number;
	transcription: string | null;
	createdAt: string;
}

export interface DuplicatePairDto {
	personA: PersonDto;
	personB: PersonDto;
	similarityScore: number;
	matchReasons: string[];
}

export interface AuditLogDto {
	id: string;
	treeId: string;
	userId: string | null;
	userEmail: string;
	action: string;
	entityType: string;
	entityId: string | null;
	entityLabel: string | null;
	beforeState: unknown;
	afterState: unknown;
	undone: boolean;
	createdAt: string;
}

export interface DocumentDto {
	id: string;
	personId: string | null;
	unionId: string | null;
	filename: string;
	mimeType: string;
	storagePath: string;
	category: string;
	description: string | null;
	createdAt: string;
}

async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
	const headers: Record<string, string> = {
		...(options.headers as Record<string, string>)
	};

	if (!(options.body instanceof FormData) && !headers['Content-Type']) {
		headers['Content-Type'] = 'application/json';
	}

	const res = await fetch(`/api${endpoint}`, {
		...options,
		credentials: 'include',
		headers
	});

	if (!res.ok) {
		const errBody = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
		const error = new Error(errBody.message || `HTTP ${res.status}`) as Error & {
			status?: number;
		};
		error.status = res.status;
		throw error;
	}

	const json = await res.json();
	return (json && typeof json === 'object' && 'data' in json ? json.data : json) as T;
}

export const authApi = {
	getOidcConfig: () =>
		apiFetch<{
			enabled: boolean;
			buttonLabel: string;
			loginUrl: string;
			devMockEnabled: boolean;
			issuerConfigured: boolean;
		}>('/auth/oidc/config'),

	getMe: () => apiFetch<UserDto>('/auth/me'),

	logout: () => apiFetch<{ message: string }>('/auth/logout', { method: 'POST' }),

	listUsers: () => apiFetch<UserDto[]>('/auth/users')
};

export const personApi = {
	getAll: (page = 1, limit = 50, treeId = DEFAULT_TREE_ID) =>
		apiFetch<{
			data: PersonDto[];
			total: number;
			page: number;
			limit: number;
			totalPages: number;
		}>(`/persons?page=${page}&limit=${limit}&treeId=${encodeURIComponent(treeId)}`),

	getRoot: (treeId = DEFAULT_TREE_ID) =>
		apiFetch<PersonDto | null>(`/persons/root?treeId=${encodeURIComponent(treeId)}`),

	getById: (id: string, treeId = DEFAULT_TREE_ID) =>
		apiFetch<PersonDto>(`/persons/${id}?treeId=${encodeURIComponent(treeId)}`),

	create: (data: Partial<PersonDto>, treeId = DEFAULT_TREE_ID) =>
		apiFetch<PersonDto>('/persons', {
			method: 'POST',
			body: JSON.stringify({ ...data, treeId })
		}),

	update: (id: string, data: Partial<PersonDto>, treeId = DEFAULT_TREE_ID) =>
		apiFetch<PersonDto>(`/persons/${id}?treeId=${encodeURIComponent(treeId)}`, {
			method: 'PATCH',
			body: JSON.stringify(data)
		}),

	createRelative: (
		anchorId: string,
		linkType: 'FATHER' | 'MOTHER' | 'SPOUSE' | 'CHILD',
		person: {
			givenNames: string;
			usageSurname?: string | null;
			birthDate?: string | null;
			birthPlace?: string | null;
			gender?: string;
		},
		treeId = DEFAULT_TREE_ID
	) =>
		apiFetch<{
			linkType: string;
			anchorPersonId: string;
			createdPerson: PersonDto;
		}>(`/persons/${anchorId}/relatives?treeId=${encodeURIComponent(treeId)}`, {
			method: 'POST',
			body: JSON.stringify({ linkType, person })
		}),

	delete: (id: string, treeId = DEFAULT_TREE_ID) =>
		apiFetch<{ deleted: boolean }>(`/persons/${id}?treeId=${encodeURIComponent(treeId)}`, {
			method: 'DELETE'
		}),

	deleteBranch: (id: string, includeRoot = true, simulate = false, treeId = DEFAULT_TREE_ID) =>
		apiFetch<{
			rootPersonId: string;
			includeRoot: boolean;
			simulated: boolean;
			personsDeleted: number;
			relationshipsDeleted: number;
			unionsDeleted: number;
			documentsDeleted: number;
		}>(
			`/persons/${id}/branch?includeRoot=${includeRoot}&simulate=${simulate}&treeId=${encodeURIComponent(treeId)}`,
			{ method: 'DELETE' }
		)
};

export const treeApi = {
	getWindow: (
		rootPersonId: string,
		ancestors = 3,
		descendants = 3,
		options: { siblings?: boolean; spouses?: boolean; limit?: number } = {},
		treeId = DEFAULT_TREE_ID
	) => {
		const params = new URLSearchParams({
			treeId,
			ancestors: String(ancestors),
			descendants: String(descendants),
			siblings: String(options.siblings ?? true),
			spouses: String(options.spouses ?? true),
			limit: String(options.limit ?? 1500)
		});
		return apiFetch<TreeWindowDto>(`/tree/${rootPersonId}?${params.toString()}`);
	},

	getRelationshipPath: (personAId: string, personBId: string, treeId = DEFAULT_TREE_ID) =>
		apiFetch<RelationshipPathDto>(
			`/tree/relationship/${personAId}/${personBId}?treeId=${encodeURIComponent(treeId)}`
		)
};

export const searchApi = {
	search: (q: string, page = 1, limit = 15, treeId = DEFAULT_TREE_ID) =>
		apiFetch<{
			persons: (PersonDto & { similarity: number })[];
			total: number;
			page: number;
			limit: number;
		}>(
			`/search?q=${encodeURIComponent(q)}&page=${page}&limit=${limit}&treeId=${encodeURIComponent(treeId)}`
		)
};

export const gedcomApi = {
	importFull: (file: File, treeId = DEFAULT_TREE_ID) => {
		const fd = new FormData();
		fd.append('file', file);
		return apiFetch<{
			personsCreated: number;
			relationshipsCreated: number;
			unionsCreated: number;
			integrityAlert: unknown;
		}>(`/gedcom/import?treeId=${encodeURIComponent(treeId)}`, {
			method: 'POST',
			body: fd
		});
	},

	analyzeMerge: (file: File, treeId = DEFAULT_TREE_ID) => {
		const fd = new FormData();
		fd.append('file', file);
		return apiFetch<{
			treeId: string;
			sessionId: string;
			totalPersonsInFile: number;
			totalFamiliesInFile: number;
			duplicates: {
				stagedPointer: string;
				staged: {
					pointer: string;
					givenNames: string;
					surname: string;
					gender: string;
					birthDate: string | null;
					birthPlace: string | null;
					deathDate: string | null;
					deathPlace: string | null;
				};
				existingPersonId: string;
				existingPerson: PersonDto;
				confidence: number;
				matchReasons: string[];
			}[];
			newPersons: {
				pointer: string;
				givenNames: string;
				surname: string;
				gender: string;
				birthDate: string | null;
				birthPlace: string | null;
				deathDate: string | null;
				deathPlace: string | null;
			}[];
		}>(`/gedcom/merge/analyze?treeId=${encodeURIComponent(treeId)}`, {
			method: 'POST',
			body: fd
		});
	},

	applyMerge: (
		sessionId: string,
		decisions: {
			stagedPointer: string;
			action: 'merge' | 'create' | 'skip';
			mergeIntoPersonId?: string;
		}[]
	) =>
		apiFetch<{
			personsCreated: number;
			personsMerged: number;
			personsSkipped: number;
			relationshipsCreated: number;
			unionsCreated: number;
		}>('/gedcom/merge/apply', {
			method: 'POST',
			body: JSON.stringify({ sessionId, decisions })
		}),

	exportUrl: (
		options: {
			rootPersonId?: string;
			ancestors?: number;
			descendants?: number;
			treeId?: string;
		} = {}
	) => {
		const params = new URLSearchParams();
		params.set('treeId', options.treeId || DEFAULT_TREE_ID);
		if (options.rootPersonId) params.set('rootPersonId', options.rootPersonId);
		if (options.ancestors !== undefined) params.set('ancestors', String(options.ancestors));
		if (options.descendants !== undefined) params.set('descendants', String(options.descendants));
		return `/api/gedcom/export?${params.toString()}`;
	}
};

export const documentApi = {
	getByPerson: (personId: string) => apiFetch<DocumentDto[]>(`/documents/person/${personId}`),

	upload: (
		file: File,
		params: { personId?: string; unionId?: string; category?: string; description?: string }
	) => {
		const fd = new FormData();
		fd.append('file', file);
		const qs = new URLSearchParams();
		if (params.personId) qs.set('personId', params.personId);
		if (params.unionId) qs.set('unionId', params.unionId);
		if (params.category) qs.set('category', params.category);
		if (params.description) qs.set('description', params.description);
		return apiFetch<DocumentDto>(`/documents/upload?${qs.toString()}`, {
			method: 'POST',
			body: fd
		});
	},

	delete: (id: string) =>
		apiFetch<{ message: string }>(`/documents/${id}`, {
			method: 'DELETE'
		}),

	uploadProfilePhoto: (personId: string, file: File) => {
		const fd = new FormData();
		fd.append('file', file);
		return apiFetch<{ personId: string; filename: string; storagePath: string }>(
			`/documents/profile-photo/${personId}`,
			{
				method: 'POST',
				body: fd
			}
		);
	},

	hasProfilePhoto: (personId: string) =>
		apiFetch<{ exists: boolean }>(`/documents/profile-photo/${personId}/exists`),

	profilePhotoUrl: (personId: string, bustCache?: number) =>
		`/api/documents/profile-photo/${personId}${bustCache ? `?t=${bustCache}` : ''}`,

	downloadUrl: (id: string) => `/api/documents/${id}/download`,
	viewUrl: (id: string) => `/api/documents/${id}/view`,

	getTags: (documentId: string) => apiFetch<DocumentTagDto[]>(`/documents/${documentId}/tags`),

	createTag: (
		documentId: string,
		payload: {
			personId: string;
			xPct: number;
			yPct: number;
			wPct: number;
			hPct: number;
			label?: string;
		}
	) =>
		apiFetch<DocumentTagDto>(`/documents/${documentId}/tags`, {
			method: 'POST',
			body: JSON.stringify(payload)
		}),

	deleteTag: (tagId: string) =>
		apiFetch<{ deleted: boolean }>(`/documents/tags/${tagId}`, {
			method: 'DELETE'
		})
};

export const mapApi = {
	getFamilyMap: (treeId = DEFAULT_TREE_ID) =>
		apiFetch<{ places: MapPlaceDto[]; migrations: MigrationArcDto[] }>(
			`/places/map?treeId=${encodeURIComponent(treeId)}`
		),

	updatePlaceCoords: (placeId: string, latitude: number, longitude: number) =>
		apiFetch<{ id: string; latitude: number; longitude: number }>(`/places/${placeId}/coords`, {
			method: 'PATCH',
			body: JSON.stringify({ latitude, longitude })
		})
};

export const auditApi = {
	getAnomalies: (treeId = DEFAULT_TREE_ID) =>
		apiFetch<AnomalyDto[]>(`/audit/anomalies?treeId=${encodeURIComponent(treeId)}`),

	getLogs: (treeId = DEFAULT_TREE_ID) =>
		apiFetch<AuditLogDto[]>(`/audit/logs?treeId=${encodeURIComponent(treeId)}`),

	undoLog: (logId: string) =>
		apiFetch<{ undone: boolean; logId: string }>(`/audit/logs/${logId}/undo`, {
			method: 'POST'
		})
};

export const eventApi = {
	getByPerson: (personId: string, treeId = DEFAULT_TREE_ID) =>
		apiFetch<EventDetailDto[]>(`/events/person/${personId}?treeId=${encodeURIComponent(treeId)}`),

	create: (payload: {
		treeId?: string;
		type?: string;
		date?: string;
		dateRaw?: string;
		notes?: string;
		placeName?: string;
		participants?: { personId: string; role?: string }[];
	}) =>
		apiFetch<EventDetailDto>('/events', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),

	update: (
		id: string,
		payload: {
			treeId?: string;
			type?: string;
			date?: string;
			dateRaw?: string;
			notes?: string;
			placeName?: string;
			participants?: { personId: string; role?: string }[];
		}
	) =>
		apiFetch<EventDetailDto>(`/events/${id}`, {
			method: 'PATCH',
			body: JSON.stringify(payload)
		}),

	delete: (id: string) =>
		apiFetch<{ deleted: boolean }>(`/events/${id}`, {
			method: 'DELETE'
		})
};

export const sourceApi = {
	listRepositories: (treeId = DEFAULT_TREE_ID) =>
		apiFetch<RepositoryDto[]>(`/repositories?treeId=${encodeURIComponent(treeId)}`),

	createRepository: (payload: {
		treeId?: string;
		name: string;
		type?: string;
		websiteUrl?: string;
		address?: string;
		notes?: string;
	}) =>
		apiFetch<RepositoryDto>('/repositories', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),

	listSources: (search = '', treeId = DEFAULT_TREE_ID) =>
		apiFetch<SourceDto[]>(
			`/sources?treeId=${encodeURIComponent(treeId)}&search=${encodeURIComponent(search)}`
		),

	createSource: (payload: {
		treeId?: string;
		repositoryId?: string;
		title: string;
		author?: string;
		callNumber?: string;
		sourceType?: string;
		reliability?: string;
		url?: string;
		textExtract?: string;
		notes?: string;
	}) =>
		apiFetch<SourceDto>('/sources', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),

	deleteSource: (id: string) =>
		apiFetch<{ deleted: boolean }>(`/sources/${id}`, {
			method: 'DELETE'
		}),

	listCitationsByPerson: (personId: string) =>
		apiFetch<CitationDto[]>(`/citations/person/${personId}`),

	createCitation: (payload: {
		sourceId: string;
		personId?: string;
		unionId?: string;
		pageFolio?: string;
		confidence?: number;
		transcription?: string;
	}) =>
		apiFetch<CitationDto>('/citations', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),

	deleteCitation: (id: string) =>
		apiFetch<{ deleted: boolean }>(`/citations/${id}`, {
			method: 'DELETE'
		})
};

export const duplicateApi = {
	getCandidates: (treeId = DEFAULT_TREE_ID) =>
		apiFetch<DuplicatePairDto[]>(`/duplicates/candidates?treeId=${encodeURIComponent(treeId)}`),

	mergePersons: (payload: { sourceId: string; targetId: string; treeId?: string }) =>
		apiFetch<{ success: boolean; mergedTargetId: string; removedSourceId: string }>(
			'/duplicates/merge',
			{
				method: 'POST',
				body: JSON.stringify(payload)
			}
		)
};

export function personLabel(person: Pick<PersonDto, 'givenNames' | 'usageSurname' | 'birthSurname'>): string {
	const surname = person.usageSurname || person.birthSurname || '';
	return [person.givenNames, surname.toUpperCase()].filter(Boolean).join(' ').trim() || 'Inconnu';
}

export function formatLifeYears(person: Pick<PersonDto, 'birthDate' | 'deathDate'>): string {
	const b = person.birthDate ? person.birthDate.slice(0, 4) : '';
	const d = person.deathDate ? person.deathDate.slice(0, 4) : '';
	if (b && d) return `${b} – ${d}`;
	if (b) return `° ${b}`;
	if (d) return `† ${d}`;
	return '';
}

export function calculateAge(birthDate: string | null, deathDate: string | null): number | null {
	if (!birthDate) return null;
	const start = new Date(birthDate);
	if (Number.isNaN(start.getTime())) return null;
	const end = deathDate ? new Date(deathDate) : new Date();
	if (Number.isNaN(end.getTime())) return null;
	let years = end.getFullYear() - start.getFullYear();
	const m = end.getMonth() - start.getMonth();
	if (m < 0 || (m === 0 && end.getDate() < start.getDate())) {
		years -= 1;
	}
	return years >= 0 ? years : null;
}
