import { getSettings, setSetting } from './settings';

export interface PortalAccount {
  username: string;
  password: string;
}

const KEYS = [
  'portal.url',
  'portal.accounts',
  'cash_memo.tool_url',
  'cash_memo.tool_username',
  'cash_memo.tool_password',
  'cash_memo.extra_accounts',
];

// Settings still live under the legacy cash_memo.* keys until the portal.* ones are first saved.
export async function getPortalSettings(): Promise<{ url: string | null; accounts: PortalAccount[] }> {
  const values = await getSettings(KEYS);
  const url = values.get('portal.url') ?? values.get('cash_memo.tool_url') ?? null;

  const raw = values.get('portal.accounts');
  if (raw !== undefined) {
    try {
      return { url, accounts: JSON.parse(raw) };
    } catch {
      throw new Error('portal.accounts setting is malformed');
    }
  }

  let extras: Record<string, string> = {};
  try {
    extras = JSON.parse(values.get('cash_memo.extra_accounts') || '{}');
  } catch {
    extras = {};
  }
  const accounts: PortalAccount[] = [];
  const add = (u: string | undefined, p: string | undefined) => {
    if (u && p && !accounts.some((a) => a.username === u)) accounts.push({ username: u, password: p });
  };
  add(values.get('cash_memo.tool_username'), values.get('cash_memo.tool_password'));
  for (const [u, p] of Object.entries(extras)) add(u, p);
  return { url, accounts };
}

export async function getPortalUrl(): Promise<string | null> {
  return (await getPortalSettings()).url;
}

export async function getPortalAccounts(): Promise<PortalAccount[]> {
  return (await getPortalSettings()).accounts;
}

export async function setPortalUrl(url: string): Promise<void> {
  await setSetting('portal.url', url);
}

export async function setPortalAccounts(accounts: PortalAccount[]): Promise<void> {
  await setSetting('portal.accounts', JSON.stringify(accounts));
}
