import { supabase } from './supabase';

const API_BASE = import.meta.env.VITE_API_URL || 'https://api.salsabilofficial.store';

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}

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
  // Get decrypted Telegram API ID and Hash for the logged-in user
  getTelegramCredentials: () =>
    request<{ api_id: number; api_hash: string }>('/api/auth/telegram-credentials'),
};
