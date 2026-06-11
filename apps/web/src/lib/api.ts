// ══════════════════════════════════════
// Origineo — API Client (typed fetch)
// ══════════════════════════════════════

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
export const DEFAULT_TREE_ID =
  process.env.NEXT_PUBLIC_TREE_ID || '00000000-0000-0000-0000-000000000001';

interface FetchOptions extends RequestInit {
  token?: string;
}

function resolveToken(explicitToken?: string): string | undefined {
  if (explicitToken) return explicitToken;
  if (typeof window === 'undefined') return undefined;

  const stored = window.localStorage.getItem('origineo_token');
  return stored || undefined;
}

async function apiFetch<T>(
  endpoint: string,
  options: FetchOptions = {},
): Promise<T> {
  const { token: explicitToken, ...fetchOptions } = options;
  const token = resolveToken(explicitToken);

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...((fetchOptions.headers as Record<string, string>) || {}),
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}/api${endpoint}`, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') {
      window.localStorage.removeItem('origineo_token');
      if (!window.location.pathname.startsWith('/admin')) {
        window.location.href = '/admin';
      }
    }

    const error = await response.json().catch(() => ({ message: 'Network error' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

function appendTreeId(endpoint: string, treeId = DEFAULT_TREE_ID) {
  const separator = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${separator}treeId=${encodeURIComponent(treeId)}`;
}

// ─── Person API ──────────────────────────────
export const personApi = {
  getAll: (page = 1, limit = 20, treeId = DEFAULT_TREE_ID) =>
    apiFetch<any>(`/persons?page=${page}&limit=${limit}&treeId=${encodeURIComponent(treeId)}`),

  getById: (id: string, treeId = DEFAULT_TREE_ID) =>
    apiFetch<any>(appendTreeId(`/persons/${id}`, treeId)),

  getRoot: (treeId = DEFAULT_TREE_ID) =>
    apiFetch<any>(appendTreeId('/persons/root', treeId)),

  create: (data: any, token: string, treeId = DEFAULT_TREE_ID) =>
    apiFetch<any>('/persons', {
      method: 'POST',
      body: JSON.stringify({ ...data, treeId: data.treeId || treeId }),
      token,
    }),

  update: (id: string, data: any, token: string, treeId = DEFAULT_TREE_ID) =>
    apiFetch<any>(appendTreeId(`/persons/${id}`, treeId), {
      method: 'PATCH',
      body: JSON.stringify(data),
      token,
    }),

  delete: (id: string, token: string, treeId = DEFAULT_TREE_ID) =>
    apiFetch<any>(appendTreeId(`/persons/${id}`, treeId), {
      method: 'DELETE',
      token,
    }),

  deleteBranch: (id: string, token: string, includeRoot = true, simulate = false, treeId = DEFAULT_TREE_ID) =>
    apiFetch<any>(`/persons/${id}/branch?includeRoot=${includeRoot}&simulate=${simulate}&treeId=${encodeURIComponent(treeId)}`, {
      method: 'DELETE',
      token,
    }),

  deleteAll: (token: string, treeId = DEFAULT_TREE_ID) =>
    apiFetch<any>(`/persons?confirm=DELETE_ALL&treeId=${encodeURIComponent(treeId)}`, {
      method: 'DELETE',
      token,
    }),

  getIntegrityReport: (token: string, treeId = DEFAULT_TREE_ID) =>
    apiFetch<any>(appendTreeId('/persons/integrity/report', treeId), {
      token,
    }),

  repairRootDefault: (token: string, treeId = DEFAULT_TREE_ID) =>
    apiFetch<any>(appendTreeId('/persons/integrity/repair-root', treeId), {
      method: 'POST',
      token,
    }),

  repairRootDefaultWithOptions: (token: string, simulate = false, treeId = DEFAULT_TREE_ID) =>
    apiFetch<any>(`/persons/integrity/repair-root?treeId=${encodeURIComponent(treeId)}${simulate ? '&simulate=true' : ''}`, {
      method: 'POST',
      token,
    }),

  getQualityRules: (token: string, treeId = DEFAULT_TREE_ID) =>
    apiFetch<any>(appendTreeId('/persons/integrity/rules', treeId), {
      token,
    }),

  updateQualityRules: (
    data: {
      requireParentKnown?: boolean;
      minBiologicalParentAge?: number;
      maxBiologicalParentAge?: number;
      maxLifespanYears?: number;
    },
    token: string,
    treeId = DEFAULT_TREE_ID,
  ) =>
    apiFetch<any>(appendTreeId('/persons/integrity/rules', treeId), {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),

  getRepairLogs: (token: string, limit = 40, treeId = DEFAULT_TREE_ID) =>
    apiFetch<any>(`/persons/integrity/logs?limit=${limit}&treeId=${encodeURIComponent(treeId)}`, {
      token,
    }),

  undoRepairLog: (logId: string, token: string, simulate = false, treeId = DEFAULT_TREE_ID) =>
    apiFetch<any>(`/persons/integrity/logs/${logId}/undo?treeId=${encodeURIComponent(treeId)}${simulate ? '&simulate=true' : ''}`, {
      method: 'POST',
      token,
    }),

  connectDisconnectedComponent: (
    data: {
      componentPersonId: string;
      anchorPersonId?: string;
      linkMode?: 'PARENT_OF_COMPONENT' | 'CHILD_OF_COMPONENT' | 'UNION';
      relationshipType?: 'BIOLOGICAL' | 'ADOPTIVE' | 'FOSTER';
      unionType?: 'MARRIAGE' | 'PACS' | 'PARTNERSHIP' | 'OTHER';
      simulate?: boolean;
    },
    token: string,
    treeId = DEFAULT_TREE_ID,
  ) =>
    apiFetch<any>(appendTreeId('/persons/integrity/connect', treeId), {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),

  deleteDisconnectedComponent: (personId: string, token: string, simulate = false, treeId = DEFAULT_TREE_ID) =>
    apiFetch<any>(
      `/persons/integrity/component/${personId}?confirm=DELETE_COMPONENT&treeId=${encodeURIComponent(treeId)}${simulate ? '&simulate=true' : ''}`,
      {
      method: 'DELETE',
      token,
      },
    ),

  getHistory: (personId: string, limit = 120, token?: string, treeId = DEFAULT_TREE_ID) =>
    apiFetch<any>(`/persons/${personId}/history?limit=${limit}&treeId=${encodeURIComponent(treeId)}`, {
      token,
    }),
};

// ─── Tree API ────────────────────────────────
export const treeApi = {
  getTree: (
    rootPersonId: string,
    ancestors = 4,
    descendants = 2,
    options: { siblings?: boolean; spouses?: boolean; limit?: number } = {},
    treeId = DEFAULT_TREE_ID,
  ) => {
    const params = new URLSearchParams({
      treeId,
      ancestors: String(ancestors),
      descendants: String(descendants),
      siblings: String(options.siblings ?? true),
      spouses: String(options.spouses ?? true),
      limit: String(options.limit ?? 1200),
    });
    return apiFetch<any>(
      `/tree/${rootPersonId}?${params.toString()}`,
    );
  },

  getRelationshipPath: (personAId: string, personBId: string, treeId = DEFAULT_TREE_ID) =>
    apiFetch<any>(appendTreeId(`/tree/relationship/${personAId}/${personBId}`, treeId)),
};

// ─── Search API ──────────────────────────────
type SearchFilters = {
  q?: string;
  place?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN' | '';
  birthDateFrom?: string;
  birthDateTo?: string;
  deathDateFrom?: string;
  deathDateTo?: string;
};

export const searchApi = {
  search: (queryOrFilters: string | SearchFilters, page = 1, limit = 20, treeId = DEFAULT_TREE_ID) => {
    if (typeof queryOrFilters === 'string') {
      return apiFetch<any>(`/search?q=${encodeURIComponent(queryOrFilters)}&page=${page}&limit=${limit}&treeId=${encodeURIComponent(treeId)}`);
    }

    const params = new URLSearchParams();
    params.set('treeId', treeId);
    if (queryOrFilters.q?.trim()) params.set('q', queryOrFilters.q.trim());
    if (queryOrFilters.place?.trim()) params.set('place', queryOrFilters.place.trim());
    if (queryOrFilters.gender) params.set('gender', queryOrFilters.gender);
    if (queryOrFilters.birthDateFrom) params.set('birthDateFrom', queryOrFilters.birthDateFrom);
    if (queryOrFilters.birthDateTo) params.set('birthDateTo', queryOrFilters.birthDateTo);
    if (queryOrFilters.deathDateFrom) params.set('deathDateFrom', queryOrFilters.deathDateFrom);
    if (queryOrFilters.deathDateTo) params.set('deathDateTo', queryOrFilters.deathDateTo);
    params.set('page', String(page));
    params.set('limit', String(limit));

    return apiFetch<any>(`/search?${params.toString()}`);
  },
};

// ─── Relationship API ────────────────────────
export const relationshipApi = {
  getAll: (page = 1, limit = 100) =>
    apiFetch<any>(`/relationships?page=${page}&limit=${limit}`),

  create: (data: any, token: string) =>
    apiFetch<any>('/relationships', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),

  getByPerson: (personId: string) =>
    apiFetch<any>(`/relationships/person/${personId}`),

  delete: (id: string, token: string) =>
    apiFetch<any>(`/relationships/${id}`, {
      method: 'DELETE',
      token,
    }),
};

// ─── Union API ───────────────────────────────
export const unionApi = {
  getAll: (page = 1, limit = 100, treeId = DEFAULT_TREE_ID) =>
    apiFetch<any>(`/unions?page=${page}&limit=${limit}&treeId=${encodeURIComponent(treeId)}`),

  create: (data: any, token: string, treeId = DEFAULT_TREE_ID) =>
    apiFetch<any>('/unions', {
      method: 'POST',
      body: JSON.stringify({ ...data, treeId: data.treeId || treeId }),
      token,
    }),

  getByPerson: (personId: string, treeId = DEFAULT_TREE_ID) =>
    apiFetch<any>(appendTreeId(`/unions/person/${personId}`, treeId)),

  update: (id: string, data: any, token: string, treeId = DEFAULT_TREE_ID) =>
    apiFetch<any>(appendTreeId(`/unions/${id}`, treeId), {
      method: 'PATCH',
      body: JSON.stringify(data),
      token,
    }),

  delete: (id: string, token: string, treeId = DEFAULT_TREE_ID) =>
    apiFetch<any>(appendTreeId(`/unions/${id}`, treeId), {
      method: 'DELETE',
      token,
    }),
};

// ─── Event API ───────────────────────────────
export const eventApi = {
  getByPerson: (personId: string, page = 1, limit = 80, treeId = DEFAULT_TREE_ID) =>
    apiFetch<any>(
      `/events/person/${personId}?page=${page}&limit=${limit}&treeId=${encodeURIComponent(treeId)}`,
    ),

  create: (data: any, token: string, treeId = DEFAULT_TREE_ID) =>
    apiFetch<any>('/events', {
      method: 'POST',
      body: JSON.stringify({ ...data, treeId: data.treeId || treeId }),
      token,
    }),

  attachParticipant: (
    eventId: string,
    data: { personId: string; role: string },
    token: string,
    treeId = DEFAULT_TREE_ID,
  ) =>
    apiFetch<any>(appendTreeId(`/events/${eventId}/participants`, treeId), {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),
};

export const sourceApi = {
  getCitationsByPerson: (personId: string, treeId = DEFAULT_TREE_ID) =>
    apiFetch<any>(appendTreeId(`/sources/persons/${personId}/citations`, treeId)),

  createCitation: (data: any, token: string, treeId = DEFAULT_TREE_ID) =>
    apiFetch<any>('/sources/citations', {
      method: 'POST',
      body: JSON.stringify({ ...data, treeId: data.treeId || treeId }),
      token,
    }),

  linkCitation: (
    data: { citationId: string; personId?: string; unionId?: string },
    token: string,
    treeId = DEFAULT_TREE_ID,
  ) =>
    apiFetch<any>('/sources/citation-links', {
      method: 'POST',
      body: JSON.stringify({ ...data, treeId }),
      token,
    }),
};

// ─── Auth API ────────────────────────────────
export const authApi = {
  login: (identifier: string, password: string) =>
    apiFetch<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    }),

  getProfile: (token: string) =>
    apiFetch<any>('/auth/me', { token }),

  listUsers: (token: string) =>
    apiFetch<any>('/auth/users', { token }),

  createUser: (
    data: {
      identifier: string;
      password: string;
      displayName?: string;
      role?: 'ADMIN' | 'VISITOR';
    },
    token: string,
  ) =>
    apiFetch<any>('/auth/users', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),

  updateUserRole: (id: string, role: 'ADMIN' | 'VISITOR', token: string) =>
    apiFetch<any>(`/auth/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
      token,
    }),

  updateUserStatus: (id: string, active: boolean, token: string) =>
    apiFetch<any>(`/auth/users/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
      token,
    }),

  deleteUser: (id: string, token: string) =>
    apiFetch<any>(`/auth/users/${id}`, {
      method: 'DELETE',
      token,
    }),

  getLdapConfig: (token: string) =>
    apiFetch<any>('/auth/ldap/config', { token }),

  updateLdapConfig: (data: any, token: string) =>
    apiFetch<any>('/auth/ldap/config', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),
};

// ─── GEDCOM API ──────────────────────────────
export const gedcomApi = {
  import: async (file: File, token: string, treeId = DEFAULT_TREE_ID) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/api/gedcom/import?treeId=${encodeURIComponent(treeId)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Upload failed' }));
      throw new Error(error.message);
    }

    return response.json();
  },

  exportUrl: (rootPersonId?: string, maxGenerations?: number, treeId = DEFAULT_TREE_ID) => {
    let url = `${API_BASE}/api/gedcom/export`;
    const params = new URLSearchParams();
    params.set('treeId', treeId);
    if (rootPersonId) params.set('rootPersonId', rootPersonId);
    if (maxGenerations) params.set('maxGenerations', String(maxGenerations));
    const qs = params.toString();
    return qs ? `${url}?${qs}` : url;
  },

  exportFile: async (token: string, rootPersonId?: string, maxGenerations?: number, treeId = DEFAULT_TREE_ID) => {
    const response = await fetch(
      gedcomApi.exportUrl(rootPersonId, maxGenerations, treeId),
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Export failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    const contentDisposition = response.headers.get('content-disposition') || '';
    const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
    const filename = filenameMatch?.[1] || 'origineo_export.ged';
    const blob = await response.blob();

    return { blob, filename };
  },

  mergeAnalyze: async (file: File, token: string, treeId = DEFAULT_TREE_ID) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/api/gedcom/merge/analyze?treeId=${encodeURIComponent(treeId)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Analysis failed' }));
      throw new Error(error.message);
    }

    return response.json();
  },

  mergeApply: (sessionId: string, decisions: any[], token: string) =>
    apiFetch<any>('/gedcom/merge/apply', {
      method: 'POST',
      body: JSON.stringify({ sessionId, decisions }),
      token,
    }),

  createJob: async (file: File, mode: 'import' | 'merge', token: string, treeId = DEFAULT_TREE_ID) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/api/gedcom/jobs?mode=${mode}&treeId=${encodeURIComponent(treeId)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Job failed' }));
      throw new Error(error.message);
    }

    return response.json();
  },

  getJob: (jobId: string, token: string, treeId = DEFAULT_TREE_ID) =>
    apiFetch<any>(appendTreeId(`/gedcom/jobs/${jobId}`, treeId), { token }),

  getJobCandidates: (jobId: string, token: string, page = 1, limit = 25, treeId = DEFAULT_TREE_ID) =>
    apiFetch<any>(`/gedcom/jobs/${jobId}/candidates?page=${page}&limit=${limit}&treeId=${encodeURIComponent(treeId)}`, {
      token,
    }),

  applyJob: (jobId: string, decisions: any[], token: string, treeId = DEFAULT_TREE_ID) =>
    apiFetch<any>(appendTreeId(`/gedcom/jobs/${jobId}/apply`, treeId), {
      method: 'POST',
      body: JSON.stringify({ decisions }),
      token,
    }),
};

// ─── Document API ────────────────────────────
export const documentApi = {
  upload: async (
    file: File,
    params: { personId?: string; unionId?: string; category?: string; description?: string },
    token: string,
  ) => {
    const formData = new FormData();
    formData.append('file', file);

    const queryParams = new URLSearchParams();
    if (params.personId) queryParams.set('personId', params.personId);
    if (params.unionId) queryParams.set('unionId', params.unionId);
    if (params.category) queryParams.set('category', params.category);
    if (params.description) queryParams.set('description', params.description);

    const response = await fetch(
      `${API_BASE}/api/documents/upload?${queryParams.toString()}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      },
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Upload failed' }));
      throw new Error(error.message);
    }

    return response.json();
  },

  getByPerson: (personId: string) =>
    apiFetch<any>(`/documents/person/${personId}`),

  getByUnion: (unionId: string) =>
    apiFetch<any>(`/documents/union/${unionId}`),

  getOne: (id: string) =>
    apiFetch<any>(`/documents/${id}`),

  downloadUrl: (id: string) =>
    `${API_BASE}/api/documents/${id}/download`,

  viewUrl: (id: string) =>
    `${API_BASE}/api/documents/${id}/view`,

  delete: (id: string, token: string) =>
    apiFetch<any>(`/documents/${id}`, {
      method: 'DELETE',
      token,
    }),

  uploadProfilePhoto: async (personId: string, file: File, token: string) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(
      `${API_BASE}/api/documents/profile-photo/${personId}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      },
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Upload failed' }));
      throw new Error(error.message);
    }

    return response.json();
  },

  profilePhotoUrl: (personId: string) =>
    `${API_BASE}/api/documents/profile-photo/${personId}`,

  hasProfilePhoto: (personId: string) =>
    apiFetch<any>(`/documents/profile-photo/${personId}/exists`),
};
