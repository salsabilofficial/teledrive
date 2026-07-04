import { supabase } from './supabase';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}

let activeAccessToken: string | null = null;

supabase.auth.onAuthStateChange((_event, session) => {
  activeAccessToken = session ? session.access_token : null;
});

supabase.auth.getSession().then(({ data: { session } }) => {
  if (session) activeAccessToken = session.access_token;
});

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const authHeader = await getAuthHeader();
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
      ...options.headers
    },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error || body.message || res.statusText);
  }
  return res.json();
}

export const api = {
  // Health
  health: () => request<{ status: string; version: string }>('/api/health'),

  // Auth
  registerInvite: (email: string, password: string, token: string) =>
    request<{ success: boolean; message: string }>('/api/auth/register-invite', {
      method: 'POST',
      body: JSON.stringify({ email, password, token }),
    }),

  connect: (apiId: number, apiHash?: string) =>
    request<{ success: boolean }>('/api/auth/connect', {
      method: 'POST',
      body: JSON.stringify({ api_id: apiId, api_hash: apiHash }),
    }),

  requestCode: (phone: string, apiId: number, apiHash?: string) =>
    request<{ success: boolean; next_step?: string; error?: string }>('/api/auth/code', {
      method: 'POST',
      body: JSON.stringify({ phone, api_id: apiId, api_hash: apiHash }),
    }),

  signIn: (code: string) =>
    request<{ success: boolean; next_step?: string; error?: string }>('/api/auth/sign-in', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  checkPassword: (password: string) =>
    request<{ success: boolean; next_step?: string; error?: string }>('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  logout: () =>
    request<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),

  authStatus: () =>
    request<{ authenticated: boolean }>('/api/auth/status'),

  // Files
  listFiles: (params: { folder_id?: number | null; page?: number; limit?: number; search?: string }) => {
    const q = new URLSearchParams();
    if (params.folder_id != null) q.set('folder_id', String(params.folder_id));
    if (params.page) q.set('page', String(params.page));
    if (params.limit) q.set('limit', String(params.limit));
    if (params.search) q.set('search', params.search);
    return request<{ data: any[]; page: number; limit: number }>(`/api/files?${q}`);
  },

  getFile: (id: number, folder_id?: number | null) => {
    const q = folder_id != null ? `?folder_id=${folder_id}` : '';
    return request<any>(`/api/files/${id}${q}`);
  },

  deleteFile: (id: number, folder_id?: number | null) => {
    const q = folder_id != null ? `?folder_id=${folder_id}` : '';
    return request<{ success: boolean }>(`/api/files/${id}${q}`, { method: 'DELETE' });
  },

  renameFile: (id: number, name: string, folder_id?: number | null) =>
    request<{ success: boolean }>(`/api/files/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name, folder_id }),
    }),

  uploadFile: async (file: File, folder_id?: number | null): Promise<{ id: number; name: string }> => {
    const form = new FormData();
    form.append('file', file);
    // Pass folder_id as query param since busboy reads body as a raw stream
    const q = new URLSearchParams();
    if (folder_id != null) q.set('folder_id', String(folder_id));
    const authHeader = await getAuthHeader();
    const res = await fetch(`${API_BASE}/api/files/upload?${q}`, {
      method: 'POST',
      headers: {
        ...authHeader
      },
      body: form
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, body.error || res.statusText);
    }
    return res.json();
  },

  searchFiles: (query: string, folder_id?: number | null) => {
    const q = new URLSearchParams({ search: query });
    if (folder_id != null) q.set('folder_id', String(folder_id));
    return request<{ data: any[] }>(`/api/files/search?${q}`);
  },

  // Folders
  listFolders: () => request<{ data: any[] }>('/api/folders'),

  createFolder: (name: string) => request<any>('/api/folders', {
    method: 'POST',
    body: JSON.stringify({ name }),
  }),

  deleteFolder: (id: number) =>
    request<{ success: boolean }>(`/api/folders/${id}`, { method: 'DELETE' }),

  renameFolder: (id: number, name: string) =>
    request<{ success: boolean }>(`/api/folders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  getDownloadUrl: (messageId: number, folder_id?: number | null): string => {
    const q = new URLSearchParams();
    if (folder_id != null) q.set('folder_id', String(folder_id));
    if (activeAccessToken) q.set('token', activeAccessToken);
    const queryString = q.toString() ? `?${q.toString()}` : '';
    return `${API_BASE}/api/files/${messageId}/download${queryString}`;
  },
};
