import { useCallback, useEffect, useState } from 'react';
import { getCalendarJobs } from '../api/client';
import type { CalendarJob, JobType } from '../types';

// Module-level so switching months/tabs shows the last known data instantly while it revalidates.
const cache = new Map<string, CalendarJob[]>();
const errors = new Set<string>();
const inflight = new Map<string, Promise<CalendarJob[]>>();
const listeners = new Set<() => void>();

const keyOf = (jobType: JobType, from: string, to: string) => `${jobType}:${from}:${to}`;

export function fetchCalendarJobs(jobType: JobType, from: string, to: string): Promise<CalendarJob[]> {
  const key = keyOf(jobType, from, to);
  const pending = inflight.get(key);
  if (pending) return pending;
  const request = getCalendarJobs(jobType, from, to)
    .then((jobs) => {
      cache.set(key, jobs);
      errors.delete(key);
      return jobs;
    })
    .catch((err) => {
      errors.add(key);
      throw err;
    })
    .finally(() => {
      inflight.delete(key);
      listeners.forEach((l) => l());
    });
  inflight.set(key, request);
  if (errors.delete(key)) listeners.forEach((l) => l());
  return request;
}

export function prefetchCalendarJobs(jobType: JobType, from: string, to: string): void {
  if (!cache.has(keyOf(jobType, from, to))) fetchCalendarJobs(jobType, from, to).catch(() => {});
}

// Shows a just-created job everywhere it would appear, before the next fetch confirms it.
export function addOptimisticJob(jobType: JobType, job: CalendarJob): void {
  for (const [key, jobs] of cache) {
    const [type, from, to] = key.split(':');
    if (type === jobType && job.fromDate < to && job.toDate > from) cache.set(key, [...jobs, job]);
  }
  listeners.forEach((l) => l());
}

export function useCalendarJobs(jobType: JobType, from: string, to: string) {
  const key = keyOf(jobType, from, to);
  const [, setVersion] = useState(0);

  useEffect(() => {
    const listener = () => setVersion((v) => v + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  const refresh = useCallback(() => fetchCalendarJobs(jobType, from, to).catch(() => []), [jobType, from, to]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const jobs = cache.get(key);
  // Only an error with nothing cached is worth showing; stale data beats an error message.
  return { jobs: jobs ?? [], loaded: jobs !== undefined, failed: jobs === undefined && errors.has(key), refresh };
}
