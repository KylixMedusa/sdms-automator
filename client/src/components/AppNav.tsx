import { NavLink } from 'react-router-dom';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { NAV_WIDTH } from '../lib/layout';
import { useTheme } from '../lib/theme';

interface AppNavProps {
  onOpenAccounts: () => void;
}

function ReturnIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 10 4 15 9 20" />
      <path d="M20 4v7a4 4 0 0 1-4 4H4" />
    </svg>
  );
}

function CancelIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function AccountsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ThemeIcon({ dark }: { dark: boolean }) {
  return dark ? (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  ) : (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

const tabs = [
  { path: '/return', label: 'Return', Icon: ReturnIcon },
  { path: '/cancel', label: 'Cancel', Icon: CancelIcon },
];

export default function AppNav({ onOpenAccounts }: AppNavProps) {
  const isDesktop = useMediaQuery('(min-width: 640px)');
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  const themeLabel = dark ? 'Light mode' : 'Dark mode';

  if (isDesktop) {
    return (
      <nav
        className="fixed left-0 top-0 h-screen flex flex-col items-center z-30 py-4"
        style={{ width: NAV_WIDTH, backgroundColor: 'var(--rail)' }}
        aria-label="Main"
      >
        <img src="/indianoil-roundel.svg" alt="" title="SDMS Automator" className="w-10 h-10 mb-5" />
        <div className="flex flex-col gap-1.5 flex-1 w-full px-2">
          {tabs.map(({ path, label, Icon }) => (
            <NavLink
              key={path}
              to={path}
              title={label}
              aria-label={label}
              className="nav-item flex flex-col items-center justify-center gap-0.5 py-2 transition-colors"
              style={({ isActive }) => ({
                borderRadius: 8,
                backgroundColor: isActive ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                color: isActive ? '#FFFFFF' : 'rgba(255, 255, 255, 0.62)',
                textDecoration: 'none',
              })}
            >
              <Icon />
              <span className="text-[11px] font-semibold leading-none">{label}</span>
            </NavLink>
          ))}
        </div>
        <button
          onClick={toggle}
          title={themeLabel}
          aria-label={themeLabel}
          className="nav-item w-[calc(100%-16px)] flex flex-col items-center justify-center gap-0.5 py-2 mb-1"
          style={{ backgroundColor: 'transparent', color: 'rgba(255, 255, 255, 0.62)', border: 'none', borderRadius: 8, cursor: 'pointer' }}
        >
          <ThemeIcon dark={dark} />
          <span className="text-[11px] font-semibold leading-none">{dark ? 'Light' : 'Dark'}</span>
        </button>
        <button
          onClick={onOpenAccounts}
          title="Accounts"
          aria-label="Accounts"
          className="nav-item w-[calc(100%-16px)] flex flex-col items-center justify-center gap-0.5 py-2 mb-1"
          style={{ backgroundColor: 'transparent', color: 'rgba(255, 255, 255, 0.62)', border: 'none', borderRadius: 8, cursor: 'pointer' }}
        >
          <AccountsIcon />
          <span className="text-[11px] font-semibold leading-none">Accounts</span>
        </button>
      </nav>
    );
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 flex"
      style={{
        backgroundColor: 'var(--tile)',
        borderTop: '1px solid var(--line)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {tabs.map(({ path, label, Icon }) => (
        <NavLink
          key={path}
          to={path}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] transition-all"
          style={({ isActive }) => ({
            color: isActive ? 'var(--ink)' : 'var(--muted)',
            textDecoration: 'none',
          })}
        >
          {({ isActive }) => (
            <>
              <Icon />
              <span className="text-[11px] font-bold">{label}</span>
              {isActive && (
                <div className="w-5 h-0.5 rounded-full mt-0.5" style={{ backgroundColor: 'var(--gold)' }} />
              )}
            </>
          )}
        </NavLink>
      ))}
      <button
        onClick={onOpenAccounts}
        className="flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] transition-all"
        style={{ backgroundColor: 'transparent', color: 'var(--muted)', border: 'none', cursor: 'pointer' }}
      >
        <AccountsIcon />
        <span className="text-[11px] font-bold">Accounts</span>
      </button>
      <button
        onClick={toggle}
        aria-label={themeLabel}
        className="flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] transition-all"
        style={{ backgroundColor: 'transparent', color: 'var(--muted)', border: 'none', cursor: 'pointer' }}
      >
        <ThemeIcon dark={dark} />
        <span className="text-[11px] font-bold">{dark ? 'Light' : 'Dark'}</span>
      </button>
    </nav>
  );
}
