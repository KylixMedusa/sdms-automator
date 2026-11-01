import { useState, useEffect, useRef } from 'react';
import {
  Drawer,
  DrawerBackdrop,
  DrawerContent,
  DrawerDialog,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  Input,
  Button,
} from '@heroui/react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import MiniSpinner from './MiniSpinner';
import { updatePortalSettings } from '../api/client';
import { cachedPortalSettings, loadPortalSettings, setCachedPortalSettings } from '../lib/portalSettings';
import type { PortalAccount, PortalSettings } from '../types';

interface PortalSettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const labelClass = 'text-sm font-bold mb-2 block';
const labelStyle = { color: 'var(--muted)' };

export default function PortalSettingsDrawer({ isOpen, onClose }: PortalSettingsDrawerProps) {
  const [toolUrl, setToolUrl] = useState('');
  const [accounts, setAccounts] = useState<PortalAccount[]>([]);
  const [showPasswords, setShowPasswords] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 640px)');

  const originalRef = useRef<{ toolUrl: string; accounts: PortalAccount[] }>({ toolUrl: '', accounts: [] });

  const stateRef = useRef({ toolUrl, accounts });
  stateRef.current = { toolUrl, accounts };

  const urlChanged = toolUrl !== originalRef.current.toolUrl;
  const accountsChanged = JSON.stringify(accounts) !== JSON.stringify(originalRef.current.accounts);
  const hasChanges = urlChanged || accountsChanged;

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const apply = (s: PortalSettings) => {
      setToolUrl(s.toolUrl);
      setAccounts(s.accounts);
      originalRef.current = { toolUrl: s.toolUrl, accounts: s.accounts };
    };
    setError('');
    setSuccess(false);
    const cached = cachedPortalSettings();
    if (cached) apply(cached);
    setFetching(!cached);
    loadPortalSettings()
      .then((s) => {
        if (cancelled) return;
        const edited = JSON.stringify(stateRef.current) !== JSON.stringify(originalRef.current);
        if (!edited) apply(s);
      })
      .catch(() => {
        if (!cancelled && !cached) setError("Couldn't load accounts. Close and try again.");
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });
    return () => { cancelled = true; };
  }, [isOpen]);

  const updateAccount = (index: number, patch: Partial<PortalAccount>) =>
    setAccounts((list) => list.map((a, i) => (i === index ? { ...a, ...patch } : a)));

  const handleCancel = () => {
    setToolUrl(originalRef.current.toolUrl);
    setAccounts(originalRef.current.accounts);
    setShowPasswords(false);
    setError('');
    setSuccess(false);
    onClose();
  };

  const handleSave = async () => {
    setError('');
    setSuccess(false);

    const cleaned = accounts
      .map((a) => ({ username: a.username.trim(), password: a.password }))
      .filter((a) => a.username || a.password);
    if (cleaned.some((a) => !a.username || !a.password)) {
      setError('Each account needs a username and password');
      return;
    }
    if (new Set(cleaned.map((a) => a.username)).size !== cleaned.length) {
      setError('The same username is listed twice');
      return;
    }

    setLoading(true);
    try {
      await updatePortalSettings({
        ...(urlChanged ? { toolUrl } : {}),
        ...(accountsChanged ? { accounts: cleaned } : {}),
      });
      originalRef.current = { toolUrl, accounts: cleaned };
      setCachedPortalSettings({ toolUrl, accounts: cleaned });
      setAccounts(cleaned);
      setSuccess(true);
      setTimeout(() => onClose(), 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  const formContent = fetching ? (
    <div className="flex items-center justify-center py-8">
      <MiniSpinner size={20} />
    </div>
  ) : (
    <div className="flex flex-col gap-6">
      <div>
        <label className={labelClass} style={labelStyle}>
          Portal URL
        </label>
        <Input
          value={toolUrl}
          onChange={(e) => setToolUrl(e.target.value)}
          placeholder="https://sdms-portal.example.com"
          fullWidth
          className="min-h-[48px] text-sm w-full"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className={labelClass.replace('mb-2 ', '')} style={labelStyle}>
            Accounts{accounts.length > 0 ? ` (${accounts.length})` : ''}
          </span>
          {accounts.length > 0 && (
            <button
              type="button"
              onClick={() => setShowPasswords(!showPasswords)}
              className="text-xs font-semibold"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink)', textDecoration: 'underline' }}
            >
              {showPasswords ? 'Hide passwords' : 'Show passwords'}
            </button>
          )}
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>
          Each job's orders are split across all accounts, which work in parallel.
        </p>

        <div className="flex flex-col gap-3">
          {accounts.map((account, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 p-3"
              style={{ backgroundColor: 'var(--paper)', borderRadius: 10 }}
            >
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold" style={{ color: 'var(--ink-soft)' }}>
                  Account {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => setAccounts((list) => list.filter((_, j) => j !== i))}
                  className="w-8 h-8 flex items-center justify-center"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}
                  aria-label={`Remove account ${i + 1}`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <Input
                value={account.username}
                onChange={(e) => updateAccount(i, { username: e.target.value })}
                placeholder="Username"
                aria-label={`Account ${i + 1} username`}
                fullWidth
                className="min-h-[44px] text-sm w-full"
              />
              <Input
                value={account.password}
                onChange={(e) => updateAccount(i, { password: e.target.value })}
                placeholder="Password"
                type={showPasswords ? 'text' : 'password'}
                aria-label={`Account ${i + 1} password`}
                fullWidth
                className="min-h-[44px] text-sm w-full"
              />
            </div>
          ))}

          <button
            type="button"
            onClick={() => setAccounts((list) => [...list, { username: '', password: '' }])}
            className="min-h-[48px] text-sm font-semibold"
            style={{
              backgroundColor: 'transparent',
              border: '1.5px dashed var(--faint)',
              borderRadius: 10,
              cursor: 'pointer',
              color: 'var(--ink)',
            }}
          >
            + Add account
          </button>
        </div>
      </div>

      {error && (
        <div
          className="text-sm px-3 py-2"
          style={{ color: 'var(--fail)', backgroundColor: 'var(--fail-tint)', borderRadius: '0.75rem' }}
        >
          {error}
        </div>
      )}
      {success && (
        <div
          className="text-sm px-3 py-2"
          style={{ color: 'var(--done)', backgroundColor: 'var(--done-tint)', borderRadius: '0.75rem' }}
        >
          Settings saved
        </div>
      )}
    </div>
  );

  const secondaryButtonStyle = {
    backgroundColor: 'var(--tile)',
    color: 'var(--ink)',
    borderRadius: 8,
    border: '1px solid var(--line)',
  };

  const footerButtons = hasChanges ? (
    <div className="flex gap-3 w-full">
      <Button onPress={handleCancel} className="flex-1 font-semibold text-base min-h-[52px]" style={secondaryButtonStyle}>
        Cancel
      </Button>
      <Button
        onPress={handleSave}
        isDisabled={loading}
        className="flex-1 font-bold text-base transition-transform active:scale-[0.98] min-h-[52px]"
        style={{
          background: loading ? 'var(--muted)' : 'var(--gold)',
          color: 'var(--ink)',
          borderRadius: 8,
          border: 'none',
        }}
      >
        {loading ? <MiniSpinner /> : 'Save'}
      </Button>
    </div>
  ) : (
    <Button onPress={handleCancel} className="w-full font-semibold text-base min-h-[52px]" style={secondaryButtonStyle}>
      Close
    </Button>
  );

  return (
    <Drawer isOpen={isOpen} onOpenChange={(open) => { if (!open) handleCancel(); }}>
      <DrawerBackdrop className="bg-black/30 backdrop-blur-sm">
        <DrawerContent placement={isDesktop ? 'right' : 'bottom'}>
          <DrawerDialog
            className={isDesktop ? 'h-screen w-[420px] max-w-full flex flex-col' : 'max-h-[85vh] flex flex-col'}
            style={
              isDesktop
                ? { borderTopLeftRadius: 24, borderBottomLeftRadius: 24, backgroundColor: 'var(--tile)' }
                : { borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: 'var(--tile)' }
            }
          >
            {!isDesktop && <div className="w-10 h-1 rounded-full mx-auto mt-3" style={{ backgroundColor: 'var(--line)' }} />}
            <DrawerHeader className="display text-[28px]" style={{ color: 'var(--ink)' }}>
              Accounts
            </DrawerHeader>
            <DrawerBody className="overflow-y-auto flex-1">{formContent}</DrawerBody>
            <DrawerFooter>{footerButtons}</DrawerFooter>
          </DrawerDialog>
        </DrawerContent>
      </DrawerBackdrop>
    </Drawer>
  );
}
