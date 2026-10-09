import { api, refreshSession, setAccessToken } from '@/api/http';
import type { AuthResponse } from '@/api/types';
import { queryClient } from '@/app/queryClient';
import { store } from '@/app/store';
import { signedIn, signedOut } from './authSlice';

let bootstrap: Promise<void> | null = null;

/** Restores the session from the refresh cookie once per page load. */
export function ensureSession(): Promise<void> {
  bootstrap ??= refreshSession().then((session) => {
    if (!session) store.dispatch(signedOut());
  });
  return bootstrap;
}

export async function login(email: string, password: string) {
  const res = await api.post<AuthResponse>(
    '/auth/login',
    { email, password },
    { skipRefresh: true },
  );
  setAccessToken(res.accessToken);
  store.dispatch(signedIn(res.user));
  return res.user;
}

export async function logout() {
  try {
    await api.post('/auth/logout', undefined, { skipRefresh: true });
  } finally {
    setAccessToken(null);
    queryClient.clear();
    store.dispatch(signedOut());
  }
}
