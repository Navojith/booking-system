import type { AuthResponse, User } from './types';

const BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly errors?: string[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface AuthHandlers {
  onRefreshed: (user: User) => void;
  onLost: () => void;
}

let accessToken: string | null = null;
let handlers: AuthHandlers = { onRefreshed: () => {}, onLost: () => {} };
let refreshing: Promise<AuthResponse | null> | null = null;

export function configureAuth(next: AuthHandlers) {
  handlers = next;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

/** Single-flight: concurrent 401s share one refresh call (the refresh token rotates). */
export function refreshSession(): Promise<AuthResponse | null> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function doRefresh(): Promise<AuthResponse | null> {
  try {
    const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (!res.ok) {
      accessToken = null;
      return null;
    }
    const data = (await res.json()) as AuthResponse;
    accessToken = data.accessToken;
    handlers.onRefreshed(data.user);
    return data;
  } catch {
    return null;
  }
}

type Query = Record<string, string | number | boolean | undefined>;

interface RequestOptions {
  query?: Query;
  body?: unknown;
  headers?: Record<string, string>;
  /** Login must not trigger a refresh on its own 401. */
  skipRefresh?: boolean;
}

function buildUrl(path: string, query?: Query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return `${BASE}${path}${qs ? `?${qs}` : ''}`;
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const p = (await res.json()) as { detail?: string; code?: string; errors?: string[] };
    return new ApiError(res.status, p.code ?? 'ERROR', p.detail ?? res.statusText, p.errors);
  } catch {
    return new ApiError(res.status, 'ERROR', res.statusText || 'Request failed');
  }
}

async function send<T>(
  method: string,
  path: string,
  opts: RequestOptions,
  canRetry = true,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      credentials: 'include',
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Could not reach the server. Check your connection.');
  }

  if (res.status === 401 && canRetry && !opts.skipRefresh) {
    if (await refreshSession()) return send<T>(method, path, opts, false);
    handlers.onLost();
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => send<T>('GET', path, { query }),
  post: <T>(path: string, body?: unknown, opts: RequestOptions = {}) =>
    send<T>('POST', path, { ...opts, body }),
  patch: <T>(path: string, body: unknown, opts: RequestOptions = {}) =>
    send<T>('PATCH', path, { ...opts, body }),
};
