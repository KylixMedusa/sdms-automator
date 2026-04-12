import type { Stats } from '../types';

interface StatsCardsProps {
  stats: Stats;
  activeFilter: string | null;
  onFilter: (filter: string | null) => void;
}

interface StatItem {
  label: string;
  value: number;
  filter: string | null;
  dotColor: string;
}

export default function StatsCards({ stats, activeFilter, onFilter }: StatsCardsProps) {
  const items: StatItem[] = [
    { label: 'Total Orders', value: stats.total, filter: null, dotColor: '#1b1c1a' },
    { label: 'Passed', value: stats.completed, filter: 'completed', dotColor: '#17c964' },
    { label: 'Failed', value: stats.failed, filter: 'failed', dotColor: '#f31260' },
    { label: 'Queued', value: stats.pending + stats.running, filter: 'queued', dotColor: '#f5a524' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 px-4 mb-5 sm:grid-cols-4">
      {items.map((item) => {
        const isActive = activeFilter === item.filter;
        return (
          <button
            key={item.label}
            onClick={() => onFilter(isActive ? null : item.filter)}
            className="text-left p-4 transition-transform active:scale-[0.98]"
            style={{
              backgroundColor: isActive ? '#f5f3ef' : '#ffffff',
              borderRadius: '1.5rem',
              border: 'none',
              boxShadow: isActive
                ? 'inset 0 2px 8px rgba(86, 67, 56, 0.06)'
                : '0 12px 32px rgba(86, 67, 56, 0.08)',
              cursor: 'pointer',
              minHeight: '44px',
            }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ backgroundColor: item.dotColor }}
              />
              <span
                className="text-xs font-medium"
                style={{ color: '#564338' }}
              >
                {item.label}
              </span>
            </div>
            <div
              className="text-2xl font-bold"
              style={{
                color: '#1b1c1a',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
              }}
            >
              {item.value}
            </div>
          </button>
        );
      })}
    </div>
  );
}
