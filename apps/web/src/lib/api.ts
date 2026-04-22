// ══════════════════════════════════════
// Origineo — API Client (typed fetch)
// ══════════════════════════════════════

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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

// ─── Person API ──────────────────────────────
export const personApi = {
  getAll: (page = 1, limit = 20) =>
    apiFetch<any>(`/persons?page=${page}&limit=${limit}`),

  getById: (id: string) =>
    apiFetch<any>(`/persons/${id}`),

  getRoot: () =>
    apiFetch<any>('/persons/root'),

  create: (data: any, token: string) =>
    apiFetch<any>('/persons', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),

  update: (id: string, data: any, token: string) =>
    apiFetch<any>(`/persons/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      token,
    }),

  delete: (id: string, token: string) =>
    apiFetch<any>(`/persons/${id}`, {
      method: 'DELETE',
      token,
    }),

  deleteBranch: (id: string, token: string, includeRoot = true) =>
    apiFetch<any>(`/persons/${id}/branch?includeRoot=${includeRoot}`, {
      method: 'DELETE',
      token,
    }),

  deleteAll: (token: string) =>
    apiFetch<any>('/persons?confirm=DELETE_ALL', {
      method: 'DELETE',
      token,
    }),

  getIntegrityReport: (token: string) =>
    apiFetch<any>('/persons/integrity/report', {
      token,
    }),

  repairRootDefault: (token: string) =>
    apiFetch<any>('/persons/integrity/repair-root', {
      method: 'POST',
      token,
    }),

  repairRootDefaultWithOptions: (token: string, simulate = false) =>
    apiFetch<any>(`/persons/integrity/repair-root${simulate ? '?simulate=true' : ''}`, {
      method: 'POST',
      token,
    }),

  getQualityRules: (token: string) =>
    apiFetch<any>('/persons/integrity/rules', {
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
  ) =>
    apiFetch<any>('/persons/integrity/rules', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),

  getRepairLogs: (token: string, limit = 40) =>
    apiFetch<any>(`/persons/integrity/logs?limit=${limit}`, {
      token,
    }),

  undoRepairLog: (logId: string, token: string, simulate = false) =>
    apiFetch<any>(`/persons/integrity/logs/${logId}/undo${simulate ? '?simulate=true' : ''}`, {
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
  ) =>
    apiFetch<any>('/persons/integrity/connect', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),

  deleteDisconnectedComponent: (personId: string, token: string, simulate = false) =>
    apiFetch<any>(
      `/persons/integrity/component/${personId}?confirm=DELETE_COMPONENT${simulate ? '&simulate=true' : ''}`,
      {
      method: 'DELETE',
      token,
      },
    ),

  getHistory: (personId: string, limit = 120, token?: string) =>
    apiFetch<any>(`/persons/${personId}/history?limit=${limit}`, {
      token,
    }),
};

// ─── Tree API ────────────────────────────────
export const treeApi = {
  getTree: (rootPersonId: string, ancestors = 4, descendants = 2) =>
    apiFetch<any>(
      `/tree/${rootPersonId}?ancestors=${ancestors}&descendants=${descendants}`,
    ),

  getRelationshipPath: (personAId: string, personBId: string) =>
    apiFetch<any>(`/tree/relationship/${personAId}/${personBId}`),
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
  search: (queryOrFilters: string | SearchFilters, page = 1, limit = 20) => {
    if (typeof queryOrFilters === 'string') {
      return apiFetch<any>(`/search?q=${encodeURIComponent(queryOrFilters)}&page=${page}&limit=${limit}`);
    }

    const params = new URLSearchParams();
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
  getAll: (page = 1, limit = 100) =>
    apiFetch<any>(`/unions?page=${page}&limit=${limit}`),

  create: (data: any, token: string) =>
    apiFetch<any>('/unions', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),

  getByPerson: (personId: string) =>
    apiFetch<any>(`/unions/person/${personId}`),

  update: (id: string, data: any, token: string) =>
    apiFetch<any>(`/unions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      token,
    }),

  delete: (id: string, token: string) =>
    apiFetch<any>(`/unions/${id}`, {
      method: 'DELETE',
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
  import: async (file: File, token: string) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/api/gedcom/import`, {
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

  exportUrl: (rootPersonId?: string, maxGenerations?: number) => {
    let url = `${API_BASE}/api/gedcom/export`;
    const params = new URLSearchParams();
    if (rootPersonId) params.set('rootPersonId', rootPersonId);
    if (maxGenerations) params.set('maxGenerations', String(maxGenerations));
    const qs = params.toString();
    return qs ? `${url}?${qs}` : url;
  },

  exportFile: async (token: string, rootPersonId?: string, maxGenerations?: number) => {
    const response = await fetch(
      gedcomApi.exportUrl(rootPersonId, maxGenerations),
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

  mergeAnalyze: async (file: File, token: string) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/api/gedcom/merge/analyze`, {
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

