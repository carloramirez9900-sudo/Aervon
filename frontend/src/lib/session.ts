import type { AuthTokens } from './types';

const KEY = 'aervon.session';

export function loadSession(): AuthTokens | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) as AuthTokens : null;
  } catch {
    return null;
  }
}

export function saveSession(session: AuthTokens) {
  sessionStorage.setItem(KEY, JSON.stringify(session));
}

export function clearSession() {
  sessionStorage.removeItem(KEY);
}
