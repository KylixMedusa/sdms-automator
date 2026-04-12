import { useState, useCallback, useRef, useEffect } from 'react';
import { getJobs } from '../api/client';
import type { Job, Stats, JobsQuery } from '../types';

const POLL_INTERVAL = 5000;

interface UseInfiniteJobsReturn {
  jobs: Job[];
  stats: Stats | null;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  refresh: () => void;
  sentinelRef: (node: HTMLDivElement | null) => void;
}

export function useInfiniteJobs(query: Omit<JobsQuery, 'cursor'>, enabled = true): UseInfiniteJobsReturn {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const cursorRef = useRef<number | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const queryKeyRef = useRef('');
  const hasActiveJobsRef = useRef(false);

  const queryKey = JSON.stringify(query);

  const fetchFirstPage = useCallback(async () => {
    if (!enabled) return;
    try {
      const data = await getJobs({ ...query });
      setJobs(data.jobs);
      setHasMore(data.hasMore);
      cursorRef.current = data.nextCursor;
      if (data.stats) {
        setStats(data.stats);
        hasActiveJobsRef.current = (data.stats.pending + data.stats.running) > 0;
      }
    } catch {
      // 401 handled by API client
    }
  }, [queryKey, enabled]);

  // Initial load + reset when query changes
  useEffect(() => {
    if (!enabled) return;
    if (queryKeyRef.current === queryKey) return;
    queryKeyRef.current = queryKey;
    cursorRef.current = null;
    setLoading(true);
    setJobs([]);
    fetchFirstPage().finally(() => setLoading(false));
  }, [queryKey, enabled, fetchFirstPage]);

  // Smart polling: 5s when active jobs exist, skip otherwise.
  // Always poll at least once every 15s as a heartbeat.
  useEffect(() => {
    if (!enabled || query.search) return;
    let tickCount = 0;
    const interval = setInterval(() => {
      tickCount++;
      // Poll every tick (5s) if active jobs, otherwise only every 3rd tick (15s)
      if (hasActiveJobsRef.current || tickCount % 3 === 0) {
        cursorRef.current = null;
        fetchFirstPage();
      }
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [enabled, query.search, fetchFirstPage]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !cursorRef.current) return;
    setLoadingMore(true);
    try {
      const data = await getJobs({ ...query, cursor: cursorRef.current });
      setJobs((prev) => [...prev, ...data.jobs]);
      setHasMore(data.hasMore);
      cursorRef.current = data.nextCursor;
    } catch {
      // handled
    }
    setLoadingMore(false);
  }, [hasMore, loadingMore, queryKey]);

  const refresh = useCallback(() => {
    cursorRef.current = null;
    setLoading(true);
    fetchFirstPage().finally(() => setLoading(false));
  }, [fetchFirstPage]);

  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) observerRef.current.disconnect();
      if (!node) return;
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasMore && !loadingMore) {
            loadMore();
          }
        },
        { rootMargin: '200px' },
      );
      observerRef.current.observe(node);
    },
    [hasMore, loadingMore, loadMore],
  );

  return { jobs, stats, hasMore, loading, loadingMore, loadMore, refresh, sentinelRef };
}
