import { chromium } from 'playwright-extra';
import type { Page, BrowserContext, Browser } from 'playwright';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { existsSync } from 'fs';
import logger from '../../shared/utils/logger';

// Stealth plugin: patches navigator.webdriver, user-agent, chrome.runtime, etc.
// Registered once here — every flow imports `chromium` from this module instead
// of calling `.use()` again, which would register the plugin twice.
chromium.use(StealthPlugin());

// Use system Chrome if installed (x86 production), fall back to bundled Chromium (ARM64/local dev)
const useSystemChrome = existsSync('/opt/google/chrome/chrome');

// All element waits use 2 minutes
export const WAIT_TIMEOUT = 120_000;

export interface AutomationResult {
  success: boolean;
  message: string;
  screenshot?: string; // base64 data URI on failure
  cancelled?: boolean; // stopped early because the user cancelled it — don't retry
}

export async function launchSiebelBrowser(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== 'false',
    ...(useSystemChrome ? { channel: 'chrome' } : {}),
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-infobars',
      '--window-size=1280,800',
    ],
  });
  const { context, page } = await launchSiebelContext(browser);
  return { browser, context, page };
}

// A fresh, fully isolated context (its own cookie jar / Siebel session) on an
// already-running browser — used to give each order its own independent
// Siebel session instead of sharing one with whatever else is in progress.
export async function launchSiebelContext(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  return { context, page };
}

// ─────────────────────────────────────────────────────────────────────────────
// Siebel Tab Navigation Helper
// ─────────────────────────────────────────────────────────────────────────────
export async function clickSiebelTab(
  page: Page,
  tabText: string,
  scope: 'screen' | 'view' | 'subview',
) {
  let tabListSelector: string;
  let dropdownSelector: string;

  switch (scope) {
    case 'screen':
      tabListSelector = '#s_sctrl_tabScreen ul[role="tablist"]';
      dropdownSelector = 'select.siebui-nav-screenlist';
      break;
    case 'view':
      tabListSelector = '#s_sctrl_tabView ul[role="tablist"]';
      dropdownSelector = '#j_s_sctrl_tabView';
      break;
    case 'subview':
      tabListSelector = '#s_vctrl_div_tabScreen ul[role="tablist"]';
      dropdownSelector = '#j_s_vctrl_div_tabScreen';
      break;
  }

  const tab = page.locator(`${tabListSelector} a.ui-tabs-anchor`, {
    hasText: tabText,
  });

  if (await tab.isVisible().catch(() => false)) {
    await tab.click();
  } else {
    await page.locator(dropdownSelector).first().selectOption({ label: tabText });
  }

  // Wait for the tab to become active instead of networkidle
  await page.locator(`${tabListSelector} li.siebui-active-navtab a`, { hasText: tabText })
    .waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
}

export async function loginSiebel(
  page: Page,
  tag: string,
  toolUrl: string,
  toolUsername: string,
  toolPassword: string,
): Promise<void> {
  await page.goto(toolUrl, { timeout: WAIT_TIMEOUT, waitUntil: 'domcontentloaded' });
  logger.info(`${tag} Navigated to SSO login`);

  await page.locator('#username').waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
  await page.locator('#username').fill(toolUsername);
  await page.locator('#password').fill(toolPassword);
  await page.locator('#submitid').click();
  logger.info(`${tag} Submitted login credentials`);

  // Wait for Siebel to fully load after SSO redirect
  await page.waitForSelector('.siebui-nav-tabScreen', {
    state: 'visible',
    timeout: WAIT_TIMEOUT,
  });
  logger.info(`${tag} Siebel loaded`);
}

const LOGOUT_TIMEOUT = 20_000;
const MENU_TIMEOUT = 8_000;

// Close any Siebel popup left open by a failed step so it can't sit over the Settings menu.
async function dismissDialogs(page: Page): Promise<void> {
  const closeButtons = page.locator('button.ui-dialog-titlebar-close:visible');
  for (let i = await closeButtons.count(); i > 0; i--) {
    await closeButtons.last().click({ timeout: 2_000 }).catch(() => {});
  }
  await page.keyboard.press('Escape').catch(() => {});
}

async function waitForSiebelGone(page: Page): Promise<void> {
  await page.locator('.siebui-nav-tabScreen').waitFor({ state: 'detached', timeout: LOGOUT_TIMEOUT });
  await page.waitForLoadState('networkidle', { timeout: LOGOUT_TIMEOUT }).catch(() => {});
}

// Never throws: a session left open blocks the next login for that account, but it mustn't fail the job.
// Tries the Settings → Logout menu first, then Siebel's own SWECmd=Logoff (works even when a popup blocks the menu).
export async function logoutSiebel(page: Page, tag: string): Promise<boolean> {
  if (page.isClosed()) {
    logger.warn(`${tag} Logout skipped: browser already closed, portal session may still be open`);
    return false;
  }

  try {
    await dismissDialogs(page);
    await page.locator('li[name="Root"][title="Settings"]').click({ timeout: MENU_TIMEOUT });
    const logoutButton = page.locator('button[title="Logout"]');
    await logoutButton.waitFor({ state: 'visible', timeout: MENU_TIMEOUT });
    await logoutButton.click({ timeout: MENU_TIMEOUT });
    await waitForSiebelGone(page);
    logger.info(`${tag} Logged out (now at ${new URL(page.url()).pathname})`);
    return true;
  } catch (err) {
    logger.warn(`${tag} Logout via menu failed: ${err instanceof Error ? err.message : err}`);
  }

  try {
    const url = new URL(page.url());
    if (!url.pathname.includes('/siebel/')) throw new Error(`not on a Siebel page (${url.pathname})`);
    url.search = '?SWECmd=Logoff';
    await page.goto(url.toString(), { timeout: LOGOUT_TIMEOUT, waitUntil: 'domcontentloaded' });
    await waitForSiebelGone(page);
    logger.info(`${tag} Logged out via SWECmd=Logoff (now at ${new URL(page.url()).pathname})`);
    return true;
  } catch (err) {
    logger.warn(`${tag} Logout failed, portal session may still be open: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

export async function failWithScreenshot(
  page: Page,
  tag: string,
  message: string,
): Promise<AutomationResult> {
  logger.error(`${tag} Automation failed: ${message}`);

  let screenshot: string | undefined;
  try {
    const buffer = await page.screenshot({ fullPage: true });
    screenshot = `data:image/png;base64,${buffer.toString('base64')}`;
    logger.info(`${tag} Error screenshot captured (${Math.round(buffer.length / 1024)}KB)`);
  } catch {
    logger.warn(`${tag} Failed to capture error screenshot`);
  }

  return { success: false, message, screenshot };
}
