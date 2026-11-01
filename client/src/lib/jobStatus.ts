import type { CalendarJob, JobStatus, OrderCounts } from '../types';

export type Outcome = 'done' | 'attention' | 'running' | 'queued' | 'stopped';

export const outcomeStyle: Record<Outcome, { label: string; fg: string; bg: string; tint: string }> = {
  done: { label: 'Done', fg: 'var(--done)', bg: 'var(--done-tint)', tint: 'var(--done-tint)' },
  attention: { label: 'Needs a look', fg: 'var(--fail)', bg: 'var(--fail-tint)', tint: 'var(--fail-tint)' },
  running: { label: 'Running', fg: 'var(--run)', bg: 'var(--run-tint)', tint: 'var(--run-tint)' },
  queued: { label: 'Queued', fg: 'var(--queue)', bg: 'var(--queue-tint)', tint: 'var(--queue-tint)' },
  stopped: { label: 'Stopped', fg: 'var(--stopped)', bg: 'var(--line)', tint: 'var(--paper)' },
};

type JobLike = { status: JobStatus; errorMessage: string | null; cancelRequested: boolean; counts: OrderCounts };

export function jobOutcome(job: JobLike): Outcome {
  if (job.status === 'running') return 'running';
  if (job.status === 'pending') return 'queued';
  if (job.status === 'failed') return job.errorMessage?.startsWith('Cancelled by user') ? 'stopped' : 'attention';
  return job.counts.failed > 0 ? 'attention' : 'done';
}

// A day takes the state of any active job covering it, otherwise of the most recent job.
export function dayOutcome(jobsCoveringDay: CalendarJob[]): Outcome | null {
  if (jobsCoveringDay.length === 0) return null;
  const active = jobsCoveringDay.find((j) => j.status === 'running') ?? jobsCoveringDay.find((j) => j.status === 'pending');
  if (active) return jobOutcome(active);
  return jobOutcome(jobsCoveringDay.reduce((a, b) => (b.id > a.id ? b : a)));
}

export function doneLabel(jobType: 'return' | 'cancel'): string {
  return jobType === 'cancel' ? 'Cancelled' : 'Reason set';
}
