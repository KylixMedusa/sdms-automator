import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAuthenticated } from '../api/client';
import type { Stats, JobType, JobStatus } from '../types';
import { useInfiniteJobs } from '../hooks/useInfiniteJobs';
import AppNav from '../components/AppNav';
import DateNav from '../components/DateNav';
import StatsCards from '../components/StatsCards';
import OrderList from '../components/OrderList';
import NewOrderModal from '../components/NewOrderModal';
import SearchOverlay from '../components/SearchOverlay';
import SettingsModal from '../components/SettingsModal';
import DacPlaceholder from '../components/DacPlaceholder';
import { useMediaQuery } from '../hooks/useMediaQuery';

function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

const emptyStats: Stats = { total: 0, completed: 0, failed: 0, pending: 0, running: 0 };

export default function Dashboard() {
  const navigate = useNavigate();
  const isDesktop = useMediaQuery('(min-width: 640px)');
  const [activeTab, setActiveTab] = useState<JobType>('cash_memo');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const authenticated = isAuthenticated();

  useEffect(() => {
    if (!authenticated) {
      navigate('/', { replace: true });
    }
  }, [authenticated, navigate]);

  const statusParam: JobStatus | undefined = useMemo(() => {
    if (statusFilter === 'completed') return 'completed';
    if (statusFilter === 'failed') return 'failed';
    if (statusFilter === 'queued') return 'pending';
    return undefined;
  }, [statusFilter]);

  const jobsQuery = useMemo(() => ({
    date: toDateStr(selectedDate),
    jobType: 'cash_memo' as JobType,
    status: statusParam,
  }), [selectedDate, statusParam]);

  // Single hook: jobs + stats in one request, smart polling
  const { jobs, stats, loading, loadingMore, sentinelRef, refresh } = useInfiniteJobs(
    jobsQuery,
    authenticated && activeTab === 'cash_memo',
  );

  const handlePrevDay = () => {
    setSelectedDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 1);
      return d;
    });
  };

  const handleNextDay = () => {
    if (!isToday(selectedDate)) {
      setSelectedDate((prev) => {
        const d = new Date(prev);
        d.setDate(d.getDate() + 1);
        return d;
      });
    }
  };

  const emptyMessage = statusFilter
    ? 'No orders match this filter'
    : 'Submit a new order to get started';

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#fbf9f5' }}>
      <AppNav activeTab={activeTab} onTabChange={setActiveTab} />

      <main className={isDesktop ? 'ml-[240px]' : 'pb-20'}>
        {activeTab === 'cash_memo' ? (
          <div className="pt-4 pb-8">
            <div className="px-4 mb-3 flex items-center justify-between">
              <h1
                className="text-xl font-bold"
                style={{
                  color: '#1b1c1a',
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                  letterSpacing: '-0.02em',
                }}
              >
                Cash Memo
              </h1>
              <button
                onClick={() => setSettingsOpen(true)}
                className="w-10 h-10 flex items-center justify-center"
                style={{
                  backgroundColor: '#f5f3ef',
                  borderRadius: '0.75rem',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#8a7266',
                }}
                aria-label="Settings"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            </div>

            <DateNav
              date={selectedDate}
              onPrev={handlePrevDay}
              onNext={handleNextDay}
              onDateChange={setSelectedDate}
              canGoNext={!isToday(selectedDate)}
            />

            <StatsCards
              stats={stats || emptyStats}
              activeFilter={statusFilter}
              onFilter={setStatusFilter}
            />

            {/* Search bar — opens fullscreen overlay */}
            <div className="px-4 mb-4">
              <button
                onClick={() => setSearchOpen(true)}
                className="w-full flex items-center gap-2 px-4 min-h-[48px] text-sm transition-colors"
                style={{
                  backgroundColor: '#f5f3ef',
                  borderRadius: '2rem',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#8a7266',
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8a7266" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
                Search orders...
              </button>
            </div>

            <OrderList
              jobs={jobs}
              loading={loading}
              loadingMore={loadingMore}
              sentinelRef={sentinelRef}
              emptyMessage={emptyMessage}
            />

            {/* FAB — New Order */}
            <button
              onClick={() => setModalOpen(true)}
              className="fixed z-30 flex items-center justify-center transition-transform active:scale-[0.92]"
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #974400, #bb5808)',
                border: 'none',
                cursor: 'pointer',
                right: isDesktop ? 24 : 20,
                bottom: isDesktop ? 24 : 80,
                boxShadow: '0 8px 24px rgba(151, 68, 0, 0.3)',
              }}
              aria-label="New order"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>

            <NewOrderModal
              isOpen={modalOpen}
              onClose={() => setModalOpen(false)}
              onCreated={refresh}
            />

            <SettingsModal
              isOpen={settingsOpen}
              onClose={() => setSettingsOpen(false)}
            />

            {searchOpen && (
              <SearchOverlay
                jobType="cash_memo"
                onClose={() => setSearchOpen(false)}
              />
            )}
          </div>
        ) : (
          <DacPlaceholder />
        )}
      </main>
    </div>
  );
}
