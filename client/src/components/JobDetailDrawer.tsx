import { useEffect, useRef, useState } from 'react';
import {
  Drawer,
  DrawerBackdrop,
  DrawerContent,
  DrawerDialog,
  DrawerHeader,
  DrawerBody,
} from '@heroui/react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import MiniSpinner from './MiniSpinner';
import { cancelJob, createJob, getJob, getScreenshotBlob } from '../api/client';
import type { CalendarJob, JobDetail, JobOrder, JobType } from '../types';
import { formatRange, dayCount } from '../lib/dates';
import { doneLabel, jobOutcome, outcomeStyle } from '../lib/jobStatus';

interface JobDetailDrawerProps {
  initial: CalendarJob | null; // what the calendar already knows, shown while the full job loads
  jobType: JobType;
  onClose: () => void;
  onChanged: () => void;
}

type OrderFilter = 'all' | JobOrder['status'];

function parseDetails(details: string | null): Record<string, unknown> {
  try {
    return details ? JSON.parse(details) : {};
  } catch {
    return {};
  }
}

function formatTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

const button: React.CSSProperties = {
  border: '1px solid var(--line)',
  backgroundColor: 'var(--tile)',
  color: 'var(--ink)',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 13,
  padding: '0 14px',
  height: 36,
};

export default function JobDetailDrawer({ initial, jobType, onClose, onChanged }: JobDetailDrawerProps) {
  const isDesktop = useMediaQuery('(min-width: 640px)');
  const jobId = initial?.id ?? null;
  const [job, setJob] = useState<JobDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<OrderFilter>('all');
  const [copied, setCopied] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const screenshotRef = useRef<string | null>(null);

  useEffect(() => {
    setJob(null);
    setError('');
    setFilter('all');
    setScreenshotUrl(null);
    if (screenshotRef.current) URL.revokeObjectURL(screenshotRef.current);
    screenshotRef.current = null;
    if (jobId === null) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const j = await getJob(jobId);
        if (cancelled) return;
        setJob(j);
        if (j.status === 'pending' || j.status === 'running') timer = setTimeout(load, 4000);
      } catch {
        if (!cancelled) setError("Couldn't load this job. Close and open it again.");
      }
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId]);

  useEffect(() => () => {
    if (screenshotRef.current) URL.revokeObjectURL(screenshotRef.current);
  }, []);

  if (!initial) return null;

  const status = job?.status ?? initial.status;
  const counts = job?.counts ?? initial.counts;
  const outcome = jobOutcome({
    status,
    errorMessage: job?.errorMessage ?? initial.errorMessage,
    cancelRequested: job?.cancelRequested ?? initial.cancelRequested,
    counts,
  });
  const active = status === 'pending' || status === 'running';
  const details = parseDetails(job?.details ?? null);
  const days = dayCount(initial.fromDate, initial.toDate);
  const includeCount = Array.isArray(details.includeOrderNumbers) ? details.includeOrderNumbers.length : 0;
  const failedOrders = job?.orders.filter((o) => o.status === 'failed').map((o) => o.orderNumber) ?? [];
  const message = job ? (job.status === 'failed' ? job.errorMessage : job.resultMessage) : null;

  const handleStop = async () => {
    if (!window.confirm('Stop this job? Orders already processed stay done.')) return;
    setBusy(true);
    try {
      await cancelJob(initial.id);
      onChanged();
      setJob(await getJob(initial.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't stop the job");
    } finally {
      setBusy(false);
    }
  };

  const handleRetryFailed = async () => {
    setBusy(true);
    try {
      await createJob(initial.fromDate, jobType, JSON.stringify({
        toDate: initial.toDate,
        includeOrderNumbers: failedOrders,
        ...(details.useDeliveryBoy === false ? { useDeliveryBoy: false } : {}),
      }));
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't queue the retry");
    } finally {
      setBusy(false);
    }
  };

  const handleScreenshot = async () => {
    if (screenshotUrl) {
      setScreenshotUrl(null);
      return;
    }
    const blob = await getScreenshotBlob(initial.id);
    if (!blob) return;
    if (screenshotRef.current) URL.revokeObjectURL(screenshotRef.current);
    screenshotRef.current = URL.createObjectURL(blob);
    setScreenshotUrl(screenshotRef.current);
  };

  const visibleOrders = (job?.orders ?? [])
    .filter((o) => filter === 'all' || o.status === filter)
    .sort((a, b) => Number(b.status === 'failed') - Number(a.status === 'failed'));

  const copyVisible = async () => {
    await navigator.clipboard.writeText(visibleOrders.map((o) => o.orderNumber).join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const stats: Array<{ key: OrderFilter; label: string; value: number; color: string }> = [
    { key: 'all', label: 'Orders', value: counts.total, color: 'var(--ink)' },
    { key: 'done', label: doneLabel(jobType), value: counts.done, color: 'var(--done)' },
    { key: 'already_done', label: 'Already done', value: counts.alreadyDone, color: 'var(--muted)' },
    { key: 'failed', label: 'Failed', value: counts.failed, color: counts.failed ? 'var(--fail)' : 'var(--muted)' },
  ];
  const filterLabel = stats.find((s) => s.key === filter)?.label ?? 'Orders';

  const content = (
    <div className="flex flex-col gap-6 pb-8">
      <div className="text-sm" style={{ color: 'var(--muted)' }}>
        <span className="font-semibold" style={{ color: outcomeStyle[outcome].fg }}>
          {job?.cancelRequested && active ? 'Stopping' : outcomeStyle[outcome].label}
        </span>
        <span>, {days} day{days === 1 ? '' : 's'}, job #{initial.id}</span>
        <div className="mt-1">
          Queued {formatTime(initial.createdAt)}
          {(job?.startedAt ?? initial.startedAt) && <>, started {formatTime(job?.startedAt ?? initial.startedAt)}</>}
          {(job?.completedAt ?? initial.completedAt) && <>, finished {formatTime(job?.completedAt ?? initial.completedAt)}</>}
        </div>
        {(includeCount > 0 || typeof details.startAfterOrderNumber === 'string' || details.useDeliveryBoy === false) && (
          <div className="mt-1">
            {includeCount > 0 && <>Only {includeCount} chosen order{includeCount === 1 ? '' : 's'}. </>}
            {typeof details.startAfterOrderNumber === 'string' && <>Started after {details.startAfterOrderNumber}. </>}
            {details.useDeliveryBoy === false && <>All delivery boys.</>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {stats.map((s) => {
          const selected = filter === s.key && s.key !== 'all';
          return (
            <button
              key={s.key}
              onClick={() => setFilter(filter === s.key ? 'all' : s.key)}
              className="text-left py-3 px-3"
              style={{
                border: `1px solid ${selected ? 'var(--faint)' : 'var(--line)'}`,
                borderRadius: 8,
                backgroundColor: selected ? 'var(--paper)' : 'var(--tile)',
                cursor: 'pointer',
              }}
              aria-pressed={selected}
            >
              <div
                className="text-[24px] font-bold leading-none tracking-tight"
                style={{ color: s.color, fontFeatureSettings: "'tnum'" }}
              >
                {s.value}
              </div>
              <div className="text-xs mt-1.5" style={{ color: 'var(--muted)' }}>{s.label}</div>
            </button>
          );
        })}
      </div>

      {(active || failedOrders.length > 0 || initial.hasScreenshot) && (
        <div className="flex flex-wrap gap-2">
          {active && !job?.cancelRequested && (
            <button onClick={handleStop} disabled={busy} style={{ ...button, color: 'var(--fail)' }}>
              Stop job
            </button>
          )}
          {!active && failedOrders.length > 0 && (
            <button onClick={handleRetryFailed} disabled={busy} className="btn btn-gold" style={{ height: 40, padding: '0 16px' }}>
              Retry {failedOrders.length} failed order{failedOrders.length === 1 ? '' : 's'}
            </button>
          )}
          {(job?.hasScreenshot ?? initial.hasScreenshot) && (
            <button onClick={handleScreenshot} style={button}>
              {screenshotUrl ? 'Hide error screenshot' : 'Show error screenshot'}
            </button>
          )}
        </div>
      )}

      {screenshotUrl && <img src={screenshotUrl} alt="Portal screen when the job failed" className="w-full rounded-lg" style={{ border: '1px solid var(--line)' }} />}

      {error && (
        <div className="text-sm px-3 py-2 rounded-lg" style={{ color: 'var(--fail)', backgroundColor: 'var(--fail-tint)' }}>
          {error}
        </div>
      )}

      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="display text-[22px]" style={{ color: 'var(--ink)' }}>
            {filter === 'all' ? 'Orders' : filterLabel}
            {job && <span className="font-normal" style={{ color: 'var(--muted)', fontFamily: 'inherit' }}> {visibleOrders.length}</span>}
          </h3>
          {visibleOrders.length > 0 && (
            <button
              onClick={copyVisible}
              className="text-[13px] font-semibold"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink)', textDecoration: 'underline' }}
            >
              {copied ? 'Copied' : 'Copy order numbers'}
            </button>
          )}
        </div>
        {!job ? (
          <div className="py-8 flex justify-center" style={{ color: 'var(--muted)' }}><MiniSpinner size={18} label="Loading orders" /></div>
        ) : visibleOrders.length === 0 ? (
          <p className="text-sm py-4" style={{ color: 'var(--muted)' }}>
            {active ? 'Orders show up here as each one is processed.' : 'No orders in this view.'}
          </p>
        ) : (
          <ul>
            {visibleOrders.map((o) => (
              <li
                key={o.orderNumber}
                className="side-row flex items-center justify-between py-2 px-1 text-sm"
              >
                <span style={{ color: 'var(--ink)', fontFeatureSettings: "'tnum'", letterSpacing: '0.01em' }}>{o.orderNumber}</span>
                <span className="text-xs font-bold" style={{ color: o.status === 'failed' ? 'var(--fail)' : o.status === 'done' ? 'var(--done)' : 'var(--muted)' }}>
                  {o.status === 'failed' ? 'Failed' : o.status === 'done' ? doneLabel(jobType) : 'Already done'}
                  {o.verified && <span style={{ color: 'var(--muted)', fontWeight: 500 }}>, re-checked</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {message && (
        <details>
          <summary className="text-[13px] font-semibold cursor-pointer" style={{ color: 'var(--muted)' }}>Worker log summary</summary>
          <p className="text-xs mt-2 break-words leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{message}</p>
        </details>
      )}
    </div>
  );

  return (
    <Drawer isOpen onOpenChange={(open) => { if (!open) onClose(); }}>
      <DrawerBackdrop className="bg-black/25">
        <DrawerContent placement={isDesktop ? 'right' : 'bottom'}>
          <DrawerDialog
            className={isDesktop ? 'h-screen w-[480px] max-w-full flex flex-col' : 'max-h-[88vh] flex flex-col'}
            style={isDesktop ? { borderRadius: 0, backgroundColor: 'var(--tile)' } : { borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: 'var(--tile)' }}
          >
            {!isDesktop && <div className="w-10 h-1 rounded-full mx-auto mt-3" style={{ backgroundColor: 'var(--line)' }} />}
            <DrawerHeader className="pb-1">
              <h2 className="display text-[28px] leading-tight" style={{ color: 'var(--ink)' }}>
                {jobType === 'cancel' ? 'Cancel' : 'Return'} {formatRange(initial.fromDate, initial.toDate)}
              </h2>
            </DrawerHeader>
            <DrawerBody className="overflow-y-auto flex-1">{content}</DrawerBody>
          </DrawerDialog>
        </DrawerContent>
      </DrawerBackdrop>
    </Drawer>
  );
}
