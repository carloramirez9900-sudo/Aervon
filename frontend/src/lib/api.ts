import { clearSession, loadSession, saveSession } from './session';
import type { AccountProfile, AccountSession, AuthTokens, DashboardData, DepositAddress, DepositItem, InvestmentOverview, ReferralSummary, TradingCurrentResponse, TradingHistoryResponse, WithdrawalItem } from './types';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

type ApiErrorPayload = { message?: string | string[]; error?: string };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
  let payload: ApiErrorPayload = {};
  try { payload = await response.json() as ApiErrorPayload; } catch { /* no-op */ }
  const message = Array.isArray(payload.message) ? payload.message.join('. ') : payload.message;
  throw new ApiError(response.status, message || payload.error || 'No se pudo completar la solicitud');
}

let refreshInFlight: Promise<AuthTokens | null> | null = null;

async function refreshSession(): Promise<AuthTokens | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const current = loadSession();
    if (!current?.refreshToken) return null;
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      const renewed = await parseResponse<AuthTokens>(response);
      saveSession(renewed);
      return renewed;
    } catch {
      clearSession();
      return null;
    }
  })();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const session = loadSession();
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (session?.accessToken) headers.set('Authorization', `Bearer ${session.accessToken}`);

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (response.status === 401 && retry && session?.refreshToken) {
    const renewed = await refreshSession();
    if (renewed) return apiFetch<T>(path, init, false);
  }
  return parseResponse<T>(response);
}

export const authApi = {
  startRegistration: (phone: string, referralCode?: string) =>
    apiFetch<{ registrationToken: string; telegramDeepLink: string; expiresAt: string }>('/auth/register/start', {
      method: 'POST', body: JSON.stringify({ phone, referralCode: referralCode || undefined }),
    }),
  registrationStatus: (registrationToken: string) =>
    apiFetch<{ status: string; telegramVerified: boolean; expiresAt: string }>('/auth/register/status', {
      method: 'POST', body: JSON.stringify({ registrationToken }),
    }),
  completeRegistration: (registrationToken: string, password: string, preferredLanguage: 'en' | 'es') =>
    apiFetch<AuthTokens>('/auth/register/complete', {
      method: 'POST', body: JSON.stringify({ registrationToken, password, preferredLanguage }),
    }),
  login: (phone: string, password: string) =>
    apiFetch<AuthTokens>('/auth/login', { method: 'POST', body: JSON.stringify({ phone, password }) }),
  logout: async () => {
    const session = loadSession();
    if (session?.refreshToken) {
      try { await apiFetch<void>('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: session.refreshToken }) }); } catch { /* local logout anyway */ }
    }
    clearSession();
  },
  profile: () => apiFetch<AccountProfile>('/auth/profile'),
  updateLanguage: (language: 'en' | 'es') => apiFetch<{ preferredLanguage: 'en' | 'es' }>('/auth/preferences/language', { method: 'PATCH', body: JSON.stringify({ language }) }),
  sessions: () => apiFetch<AccountSession[]>('/auth/sessions'),
  revokeSession: (id: string) => apiFetch<void>(`/auth/sessions/${id}`, { method: 'DELETE' }),
  revokeOtherSessions: () => apiFetch<void>('/auth/sessions/revoke-others', { method: 'POST' }),
  changePassword: async (currentPassword: string, newPassword: string) => {
    const renewed = await apiFetch<AuthTokens>('/auth/password/change', {
      method: 'POST', body: JSON.stringify({ currentPassword, newPassword }),
    });
    saveSession(renewed);
    return renewed;
  },
};

export const dashboardApi = {
  get: () => apiFetch<DashboardData>('/dashboard'),
};


export const depositsApi = {
  address: () => apiFetch<DepositAddress>('/deposits/address'),
  history: () => apiFetch<DepositItem[]>('/deposits/history'),
};

export const withdrawalsApi = {
  list: () => apiFetch<WithdrawalItem[]>('/withdrawals'),
  request: (amount: string, destination: string, idempotencyKey: string) =>
    apiFetch<WithdrawalItem>('/withdrawals', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ amount, destination }),
    }),
};

export const tradingApi = {
  current: () => apiFetch<TradingCurrentResponse>('/trading/current'),
  history: (limit = 100) => apiFetch<TradingHistoryResponse>(`/trading/history?limit=${limit}`),
};


export const investmentsApi = {
  get: () => apiFetch<InvestmentOverview>('/investments/me'),
  compound: (amount: string, idempotencyKey: string) => apiFetch<InvestmentOverview>('/investments/compound', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ amount }),
  }),
  setCompoundMode: (mode: 'MANUAL' | 'AUTOMATIC') => apiFetch<{ compoundMode: 'MANUAL' | 'AUTOMATIC' }>('/investments/compound-mode', {
    method: 'PATCH',
    body: JSON.stringify({ mode }),
  }),
};

export const referralsApi = {
  summary: () => apiFetch<ReferralSummary>('/referrals/summary'),
};

export const adminApi = {
  me: () => apiFetch<import('./types').AdminMe>('/admin/me'),
  dashboard: () => apiFetch<import('./types').AdminDashboard>('/admin/dashboard'),
  users: (params = '') => apiFetch<import('./types').AdminPaged<import('./types').AdminUserListItem>>(`/admin/users${params ? `?${params}` : ''}`),
  user: (id: string) => apiFetch<any>(`/admin/users/${id}`),
  setUserStatus: (id: string, status: string, reason: string) => apiFetch<any>(`/admin/users/${id}/status`, { method:'PATCH', body:JSON.stringify({status,reason}) }),
  setUserRoles: (id: string, roles: import('./types').AdminRole[], reason: string) => apiFetch<any>(`/admin/users/${id}/roles`, { method:'PATCH', body:JSON.stringify({roles,reason}) }),
  adjustBalance: (id:string, amount:string, direction:'CREDIT'|'DEBIT', reason:string) => apiFetch<any>(`/admin/users/${id}/adjustments`, { method:'POST', headers:{'Idempotency-Key': crypto.randomUUID()}, body:JSON.stringify({amount,direction,reason}) }),
  deposits: (params='') => apiFetch<import('./types').AdminPaged<import('./types').AdminDeposit>>(`/admin/deposits${params ? `?${params}`:''}`),
  withdrawals: (params='') => apiFetch<import('./types').AdminPaged<import('./types').AdminWithdrawal>>(`/admin/withdrawals${params ? `?${params}`:''}`),
  withdrawalAction: (id:string, action:'hold'|'release-hold'|'cancel', reason:string) => apiFetch<any>(`/admin/withdrawals/${id}/${action}`, {method:'POST', body:JSON.stringify({reason})}),
  cycles: (params='') => apiFetch<import('./types').AdminPaged<import('./types').AdminCycle>>(`/admin/cycles${params ? `?${params}`:''}`),
  investments: (params='') => apiFetch<import('./types').AdminPaged<import('./types').AdminInvestment>>(`/admin/investments${params ? `?${params}`:''}`),
  referrals: () => apiFetch<any>('/admin/referrals/summary'),
  settings: () => apiFetch<import('./types').AdminSettings>('/admin/settings'),
  setOperational: (key:string, value:boolean, reason:string) => apiFetch<any>(`/admin/settings/operational/${key}`, {method:'PATCH', body:JSON.stringify({value,reason})}),
  audit: (params='') => apiFetch<import('./types').AdminPaged<import('./types').AdminAuditItem>>(`/admin/audit${params ? `?${params}`:''}`),
};
