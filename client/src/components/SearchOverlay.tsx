import { useState, useEffect, useRef } from 'react';
import { Spinner } from '@heroui/react';
import { useInfiniteJobs } from '../hooks/useInfiniteJobs';
import OrderCard from './OrderCard';
import type { JobType } from '../types';

interface SearchOverlayProps {
  jobType: JobType;
  onClose: () => void;
}

export default function SearchOverlay({ jobType, onClose }: SearchOverlayProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Autofocus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const { jobs, hasMore, loading, loadingMore, sentinelRef } = useInfiniteJobs(
    { jobType, search: debouncedQuery || undefined, limit: 20 },
    debouncedQuery.length > 0,
  );

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col overflow-hidden"
      style={{ backgroundColor: '#fbf9f5' }}
    >
      {/* Search header */}
      <div
        className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ backgroundColor: '#fbf9f5' }}
      >
        <button
          onClick={onClose}
          className="w-11 h-11 flex items-center justify-center flex-shrink-0"
          style={{
            backgroundColor: '#f5f3ef',
            borderRadius: '1rem',
            border: 'none',
            cursor: 'pointer',
            color: '#1b1c1a',
          }}
          aria-label="Close search"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div
          className="flex-1 flex items-center gap-2 px-4 min-h-[48px]"
          style={{
            backgroundColor: '#f5f3ef',
            borderRadius: '2rem',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8a7266" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by number..."
            className="flex-1 bg-transparent outline-none text-sm"
            style={{
              color: '#1b1c1a',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              border: 'none',
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="w-6 h-6 flex items-center justify-center"
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#8a7266' }}
              aria-label="Clear search"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {!debouncedQuery ? (
          <div className="flex flex-col items-center justify-center py-16">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ddc1b3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <p className="mt-4 text-sm" style={{ color: '#8a7266' }}>
              Search by consumer number or phone number
            </p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" color="current" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="text-4xl mb-3" aria-hidden="true">🔍</div>
            <p className="text-sm font-semibold" style={{ color: '#1b1c1a' }}>No results found</p>
            <p className="text-xs mt-1" style={{ color: '#8a7266' }}>
              Try a different number
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs font-medium mb-3" style={{ color: '#8a7266' }}>
              {jobs.length}{hasMore ? '+' : ''} result{jobs.length !== 1 ? 's' : ''}
            </p>
            <div className="flex flex-col gap-4">
              {jobs.map((job) => (
                <OrderCard key={job.id} job={job} showDate />
              ))}
            </div>
            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="h-1" />
            {loadingMore && (
              <div className="flex justify-center py-4">
                <Spinner size="sm" color="current" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
