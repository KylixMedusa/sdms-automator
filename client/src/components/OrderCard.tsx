import { Chip } from '@heroui/react';
import type { Job } from '../types';

interface OrderCardProps {
  job: Job;
  showDate?: boolean;
}

function getStatusConfig(status: Job['status']) {
  switch (status) {
    case 'pending':
      return { color: 'warning' as const, label: 'QUEUED', iconBg: '#fef3e2', iconColor: '#c87a1a' };
    case 'running':
      return { color: 'accent' as const, label: 'RUNNING', iconBg: '#e0f0ff', iconColor: '#006290' };
    case 'completed':
      return { color: 'success' as const, label: 'PASSED', iconBg: '#e8f5e8', iconColor: '#2e7d32' };
    case 'failed':
      return { color: 'danger' as const, label: 'FAILED', iconBg: '#fde8e8', iconColor: '#c62828' };
  }
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? '' : 's'} ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? '' : 's'} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function StatusIcon({ status }: { status: Job['status'] }) {
  const config = getStatusConfig(status);

  const icons: Record<string, React.ReactNode> = {
    pending: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={config.iconColor} strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
      </svg>
    ),
    running: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={config.iconColor} strokeWidth="2" strokeLinecap="round">
        <path d="M23 4l-6 6-3-3-8 8" /><path d="M17 4h6v6" />
      </svg>
    ),
    completed: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={config.iconColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    ),
    failed: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={config.iconColor} strokeWidth="2.5" strokeLinecap="round">
        <path d="M12 9v4" /><path d="M12 17h.01" /><circle cx="12" cy="12" r="10" />
      </svg>
    ),
  };

  return (
    <div
      className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: config.iconBg }}
    >
      {icons[status]}
    </div>
  );
}

export default function OrderCard({ job, showDate }: OrderCardProps) {
  const config = getStatusConfig(job.status);
  const identifierLabel = job.identifierType === 'phone' ? 'Phone' : 'Consumer';

  return (
    <div
      className="px-4 py-4 flex items-center gap-4 transition-transform active:scale-[0.99]"
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '1.25rem',
        boxShadow: '0 1px 4px rgba(86, 67, 56, 0.04)',
      }}
    >
      {/* Status icon */}
      <StatusIcon status={job.status} />

      {/* Main content */}
      <div className="min-w-0 flex-1">
        {/* Top line: identifier type label + time */}
        <div className="flex items-center gap-2 mb-0.5">
          {job.identifierType && (
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: '#8a7266' }}
            >
              {identifierLabel}
            </span>
          )}
        </div>

        {/* Order number */}
        <div
          className="text-[15px] font-bold leading-snug"
          style={{
            color: '#1b1c1a',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
          }}
        >
          {job.orderNumber}
        </div>

        {/* Subtitle line */}
        <div
          className="text-xs mt-0.5 flex items-center gap-1.5"
          style={{ color: '#8a7266' }}
        >
          <span>{showDate ? formatDate(job.createdAt) : timeAgo(job.createdAt)}</span>
          {job.status === 'failed' && job.errorMessage && (
            <>
              <span style={{ color: '#ddc1b3' }}>·</span>
              <span className="truncate" style={{ color: '#ba1a1a' }}>{job.errorMessage}</span>
            </>
          )}
        </div>
      </div>

      {/* Status chip */}
      <Chip
        color={config.color}
        size="sm"
        variant="soft"
        className="flex-shrink-0"
      >
        {config.label}
        {job.status === 'running' && (
          <span className="inline-flex ml-0.5">
            <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
            <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
            <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
          </span>
        )}
      </Chip>
    </div>
  );
}
