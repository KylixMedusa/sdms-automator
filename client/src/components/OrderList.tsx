import { Spinner } from '@heroui/react';
import type { Job } from '../types';
import OrderCard from './OrderCard';

interface OrderListProps {
  jobs: Job[];
  loading: boolean;
  loadingMore: boolean;
  sentinelRef: (node: HTMLDivElement | null) => void;
  emptyMessage?: string;
}

export default function OrderList({ jobs, loading, loadingMore, sentinelRef, emptyMessage }: OrderListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="lg" color="current" />
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="text-5xl mb-4" aria-hidden="true">
          📋
        </div>
        <div
          className="text-lg font-semibold mb-1"
          style={{
            color: '#1b1c1a',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
          }}
        >
          No orders found
        </div>
        <div
          className="text-sm text-center"
          style={{ color: '#564338' }}
        >
          {emptyMessage || 'Submit a new order to get started'}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-6">
      <div className="flex items-center justify-between mb-3">
        <h2
          className="text-sm font-semibold"
          style={{ color: '#1b1c1a', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
        >
          Active Orders
        </h2>
      </div>
      <div className="flex flex-col gap-4">
        {jobs.map((job) => (
          <OrderCard key={job.id} job={job} />
        ))}
      </div>
      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-1" />
      {loadingMore && (
        <div className="flex justify-center py-4">
          <Spinner size="sm" color="current" />
        </div>
      )}
    </div>
  );
}
