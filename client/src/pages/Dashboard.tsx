import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import AppNav from '../components/AppNav';
import { NAV_WIDTH } from '../lib/layout';
import PortalSettingsDrawer from '../components/PortalSettingsDrawer';
import { loadPortalSettings } from '../lib/portalSettings';
import { useMediaQuery } from '../hooks/useMediaQuery';

export default function Dashboard() {
  const isDesktop = useMediaQuery('(min-width: 640px)');
  const [accountsOpen, setAccountsOpen] = useState(false);

  useEffect(() => {
    loadPortalSettings().catch(() => {});
  }, []);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--paper)' }}>
      <AppNav onOpenAccounts={() => setAccountsOpen(true)} />

      <main className={isDesktop ? '' : 'pb-20'} style={isDesktop ? { marginLeft: NAV_WIDTH } : undefined}>
        <Outlet />
      </main>

      <PortalSettingsDrawer isOpen={accountsOpen} onClose={() => setAccountsOpen(false)} />
    </div>
  );
}
