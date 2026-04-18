// ══════════════════════════════════════
// Origineo — API Client (typed fetch)
// ══════════════════════════════════════

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface FetchOptions extends RequestInit {
  token?: string;
}

async function apiFetch<T>(
  endpoint: string,
  options: FetchOptions = {},
): Promise<T> {
  const { token, ...fetchOptions } = options;

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
export const searchApi = {
  search: (query: string, page = 1, limit = 20) =>
    apiFetch<any>(`/search?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`),
};

// ─── Relationship API ────────────────────────
export const relationshipApi = {
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
  login: (email: string, password: string) =>
    apiFetch<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (email: string, password: string, displayName?: string) =>
    apiFetch<any>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
    }),

  getProfile: (token: string) =>
    apiFetch<any>('/auth/me', { token }),
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
};
