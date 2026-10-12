// One place that talks to the server: base URL, the session token, and errors.
import { fetch } from 'expo/fetch';
import { Platform } from 'react-native';

// An Android emulator reaches the computer it runs on at 10.0.2.2, not localhost.
const DEFAULT_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_URL).replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get code() {
    return typeof this.data.code === 'string' ? this.data.code : undefined;
  }
}

let token: string | null = null;
let onSessionEnded: (() => void) | null = null;

export const setToken = (value: string | null) => {
  token = value;
};
export const setSessionEndedHandler = (handler: (() => void) | null) => {
  onSessionEnded = handler;
};

export async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (method === 'POST') headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, { method, headers, body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined });
  } catch {
    throw new ApiError(`Cannot reach the server at ${API_URL}. Check the connection and try again.`, 0);
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (data as { error?: Record<string, unknown> } | null)?.error ?? {};
    // The session ended on the server (expired, password reset, account removed).
    if (response.status === 401 && !path.startsWith('/api/auth/')) onSessionEnded?.();
    throw new ApiError(typeof error.message === 'string' ? error.message : 'Something went wrong. Try again.', response.status, error);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
};
