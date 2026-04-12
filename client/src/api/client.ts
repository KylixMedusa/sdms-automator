import type { JobsPage, StatsResponse, Job, JobType, IdentifierType, JobsQuery, CashMemoSettings } from '../types';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

function getToken(): string | null {
  return localStorage.getItem('token');
}

function clearToken(): void {
  localStorage.removeItem('token');
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    clearToken();
    if (window.location.pathname !== '/') {
      window.location.href = '/';
    }
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(body.error || body.message || `HTTP ${res.status}`);
  }

  return res.json();
}

export async function login(pin: string): Promise<string> {
  const data = await request<{ token: string }>('/auth', {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });
  localStorage.setItem('token', data.token);
  return data.token;
}

export async function checkAuth(): Promise<boolean> {
  try {
    await request<{ ok: boolean }>('/me');
    return true;
  } catch {
    return false;
  }
}

export async function getJobs(query: JobsQuery): Promise<JobsPage> {
  const params = new URLSearchParams();
  if (query.date) params.set('date', query.date);
  if (query.jobType) params.set('jobType', query.jobType);
  if (query.status) params.set('status', query.status);
  if (query.search) params.set('search', query.search);
  if (query.cursor) params.set('cursor', String(query.cursor));
  if (query.limit) params.set('limit', String(query.limit));
  return request<JobsPage>(`/jobs?${params.toString()}`);
}

export async function getStats(date: string, jobType?: JobType): Promise<StatsResponse> {
  const params = new URLSearchParams({ date });
  if (jobType) params.set('jobType', jobType);
  return request<StatsResponse>(`/jobs/stats?${params.toString()}`);
}

export async function getJob(id: number): Promise<{ job: Job }> {
  return request<{ job: Job }>(`/jobs/${id}`);
}

export async function createJob(
  orderNumber: string,
  jobType: JobType,
  identifierType?: IdentifierType,
  details?: string,
): Promise<{ id: number; orderNumber: string; status: string; jobType: string }> {
  return request('/jobs', {
    method: 'POST',
    body: JSON.stringify({ orderNumber, jobType, identifierType, details }),
  });
}

export async function getCashMemoSettings(): Promise<CashMemoSettings> {
  return request<CashMemoSettings>('/settings/cash_memo');
}

export async function updateCashMemoSettings(settings: Partial<CashMemoSettings>): Promise<void> {
  await request('/settings/cash_memo', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function logout(): void {
  clearToken();
  window.location.href = '/';
}
