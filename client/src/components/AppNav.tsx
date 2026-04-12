import { useMediaQuery } from '../hooks/useMediaQuery';
import type { JobType } from '../types';

interface AppNavProps {
  activeTab: JobType;
  onTabChange: (tab: JobType) => void;
}

function CashMemoIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#974400' : '#8a7266'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function DacIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#974400' : '#8a7266'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

const tabs = [
  { key: 'cash_memo' as JobType, label: 'Cash Memo', Icon: CashMemoIcon },
  { key: 'dac' as JobType, label: 'DAC', Icon: DacIcon },
];

export default function AppNav({ activeTab, onTabChange }: AppNavProps) {
  const isDesktop = useMediaQuery('(min-width: 640px)');

  if (isDesktop) {
    return (
      <nav
        className="fixed left-0 top-0 h-screen flex flex-col z-30"
        style={{ width: 240, backgroundColor: '#f5f3ef' }}
      >
        <div className="px-5 pt-6 pb-8">
          <h1
            className="text-lg font-bold"
            style={{
              color: '#1b1c1a',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              letterSpacing: '-0.02em',
            }}
          >
            SDMS Automator
          </h1>
        </div>
        <div className="flex flex-col gap-1 px-3">
          {tabs.map(({ key, label, Icon }) => {
            const active = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => onTabChange(key)}
                className="flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all min-h-[44px]"
                style={{
                  backgroundColor: active ? 'rgba(151, 68, 0, 0.08)' : 'transparent',
                  color: active ? '#974400' : '#8a7266',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Icon active={active} />
                {label}
              </button>
            );
          })}
        </div>
      </nav>
    );
  }

  // Mobile: fixed bottom tab bar
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 flex"
      style={{
        backgroundColor: '#fbf9f5',
        boxShadow: '0 -4px 16px rgba(86, 67, 56, 0.06)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {tabs.map(({ key, label, Icon }) => {
        const active = activeTab === key;
        return (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] transition-all"
            style={{
              backgroundColor: 'transparent',
              color: active ? '#974400' : '#8a7266',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <Icon active={active} />
            <span className="text-[11px] font-semibold">{label}</span>
            {active && (
              <div
                className="w-5 h-0.5 rounded-full mt-0.5"
                style={{ backgroundColor: '#974400' }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
