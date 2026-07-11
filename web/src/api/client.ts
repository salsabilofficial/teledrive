import { supabase } from './supabase';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3001';

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

  startQrLogin: (apiId: number, apiHash: string) =>
    request<{ success: boolean; qr_url?: string; error?: string }>('/api/auth/qr/start', {
      method: 'POST',
      body: JSON.stringify({ api_id: apiId, api_hash: apiHash }),
    }),

  checkQrStatus: () =>
    request<{ success: boolean; qr_url?: string; next_step?: string; error?: string }>('/api/auth/qr/status'),

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
  listFiles: (params: { folder_id?: number | null; offset_id?: number; search?: string; mime_type?: string; date_from?: string; date_to?: string; size_min?: number; size_max?: number; sort?: string; order?: string }) => {
    const q = new URLSearchParams();
    if (params.folder_id != null) q.set('folder_id', String(params.folder_id));
    if (params.offset_id) q.set('offset_id', String(params.offset_id));
    if (params.search) q.set('search', params.search);
    if (params.mime_type) q.set('mime_type', params.mime_type);
    if (params.date_from) q.set('date_from', params.date_from);
    if (params.date_to) q.set('date_to', params.date_to);
    if (params.size_min != null) q.set('size_min', String(params.size_min));
    if (params.size_max != null) q.set('size_max', String(params.size_max));
    if (params.sort) q.set('sort', params.sort);
    if (params.order) q.set('order', params.order);
    return request<{ data: any[]; nextOffsetId: number | null; hasMore: boolean; total?: number }>(`/api/files?${q}`);
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

  uploadFile: (
    file: File,
    folder_id: number | null,
    uploadId: string,
    onProgress?: (event: { status: string; percent: number }) => void
  ): { abort: () => void; promise: Promise<{ id: number; name: string }> } => {
    const xhr = new XMLHttpRequest();
    let sse: EventSource | null = null;
    let sseActive = false;

    const abort = () => {
      xhr.abort();
      if (sse) {
        sse.close();
      }
      // Fire cancel request to backend
      getAuthHeader().then(authHeader => {
        const token = authHeader['Authorization']?.replace('Bearer ', '');
        const q = token ? `?token=${token}` : '';
        fetch(`${API_BASE}/api/files/upload/${uploadId}/cancel${q}`, {
          method: 'POST',
          headers: {
            ...authHeader
          }
        }).catch(() => {});
      });
    };

    const promise = new Promise<{ id: number; name: string }>(async (resolve, reject) => {
      const form = new FormData();
      form.append('file', file);

      const q = new URLSearchParams();
      if (folder_id != null) q.set('folder_id', String(folder_id));
      q.set('upload_id', uploadId);

      const authHeader = await getAuthHeader();

      // Connect SSE for backend progress (server -> Telegram)
      const token = authHeader['Authorization']?.replace('Bearer ', '');
      const sseTokenQuery = token ? `&token=${token}` : '';
      sse = new EventSource(`${API_BASE}/api/files/upload/progress?upload_id=${uploadId}${sseTokenQuery}`);

      sse.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.status === 'uploading_to_tg') {
            sseActive = true;
            const tgPercent = data.totalBytes > 0 ? Math.round((data.tgBytes / data.totalBytes) * 100) : 0;
            // Scale: 50% for browser-to-server, 50% for server-to-telegram
            const scaledPercent = 50 + Math.round(tgPercent / 2);
            onProgress?.({ status: 'uploading_to_tg', percent: Math.min(scaledPercent, 99) });
          } else if (data.status === 'done') {
            sse?.close();
          } else if (data.status === 'cancelled') {
            sse?.close();
            reject(new Error('Upload cancelled'));
          } else if (data.status === 'failed') {
            sse?.close();
            reject(new Error(data.error || 'Upload failed'));
          }
        } catch (_) {}
      };

      sse.onerror = () => {
        // Fallback to purely XHR progress if SSE connection fails/closes early
        sse?.close();
      };

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && !sseActive) {
          const serverPercent = Math.round((e.loaded / e.total) * 100);
          // Scale browser-to-server upload to 0-50%
          const scaledPercent = Math.round(serverPercent / 2);
          onProgress?.({ status: 'uploading_to_server', percent: scaledPercent });
        }
      };

      xhr.onload = () => {
        if (sse) sse.close();
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (_) {
            resolve({ id: 0, name: file.name });
          }
        } else {
          try {
            const body = JSON.parse(xhr.responseText);
            reject(new Error(body.error || xhr.statusText));
          } catch (_) {
            reject(new Error(xhr.statusText));
          }
        }
      };

      xhr.onerror = () => {
        if (sse) sse.close();
        reject(new Error('Network error'));
      };

      xhr.onabort = () => {
        if (sse) sse.close();
        reject(new Error('Upload cancelled'));
      };

      xhr.open('POST', `${API_BASE}/api/files/upload?${q.toString()}`);
      
      // Apply auth headers
      Object.entries(authHeader).forEach(([key, val]) => {
        xhr.setRequestHeader(key, val);
      });

      xhr.send(form);
    });

    return { abort, promise };
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

  getThumbnailUrl: (messageId: number, folder_id?: number | null): string => {
    const q = new URLSearchParams();
    if (folder_id != null) q.set('folder_id', String(folder_id));
    if (activeAccessToken) q.set('token', activeAccessToken);
    const queryString = q.toString() ? `?${q.toString()}` : '';
    return `${API_BASE}/api/files/${messageId}/thumbnail${queryString}`;
  },

  getPreviewUrl: (messageId: number, folder_id?: number | null): string => {
    const q = new URLSearchParams();
    if (folder_id != null) q.set('folder_id', String(folder_id));
    if (activeAccessToken) q.set('token', activeAccessToken);
    const queryString = q.toString() ? `?${q.toString()}` : '';
    return `${API_BASE}/api/files/${messageId}/preview${queryString}`;
  },

  getStreamUrl: (messageId: number, folder_id?: number | null): string => {
    const q = new URLSearchParams();
    if (folder_id != null) q.set('folder_id', String(folder_id));
    if (activeAccessToken) q.set('token', activeAccessToken);
    const queryString = q.toString() ? `?${q.toString()}` : '';
    return `${API_BASE}/api/files/${messageId}/stream${queryString}`;
  },
};
