import type { JobType, CalendarJob, JobDetail, PortalSettings, ReturnSettings } from '../types';

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

export async function getJob(id: number): Promise<JobDetail> {
  return (await request<{ job: JobDetail }>(`/jobs/${id}`)).job;
}

export async function getCalendarJobs(jobType: JobType, from: string, to: string): Promise<CalendarJob[]> {
  const params = new URLSearchParams({ jobType, from, to });
  return (await request<{ jobs: CalendarJob[] }>(`/jobs/calendar?${params.toString()}`)).jobs;
}

export async function createJob(
  orderNumber: string,
  jobType: JobType,
  details?: string,
): Promise<{ id: number; orderNumber: string; status: string; jobType: string }> {
  return request('/jobs', {
    method: 'POST',
    body: JSON.stringify({ orderNumber, jobType, details }),
  });
}

export async function cancelJob(id: number): Promise<void> {
  await request(`/jobs/${id}/cancel`, { method: 'POST' });
}

export async function getPortalSettings(): Promise<PortalSettings> {
  return request<PortalSettings>('/settings/portal');
}

export async function updatePortalSettings(settings: Partial<PortalSettings>): Promise<void> {
  await request('/settings/portal', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

export async function getReturnSettings(): Promise<ReturnSettings> {
  return request<ReturnSettings>('/settings/return');
}

export async function updateReturnSettings(settings: Partial<ReturnSettings>): Promise<void> {
  await request('/settings/return', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

// #15 fix: Centralized screenshot fetch with auth
export async function getScreenshotBlob(jobId: number): Promise<Blob | null> {
  const token = getToken();
  try {
    const res = await fetch(`${API_BASE}/jobs/${jobId}/screenshot`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
