import { chromium } from 'playwright-extra';
import type { Page, BrowserContext } from 'playwright';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { existsSync, mkdirSync } from 'fs';

import logger from '../../shared/utils/logger';
import { getSetting } from '../../shared/utils/settings';

// Stealth plugin: patches navigator.webdriver, user-agent, chrome.runtime, etc.
chromium.use(StealthPlugin());

// Use system Chrome if installed (x86 production), fall back to bundled Chromium (ARM64/local dev)
const useSystemChrome = existsSync('/opt/google/chrome/chrome');

// Traces directory
const TRACES_DIR = '/data/traces';

// All element waits use 2 minutes
const WAIT_TIMEOUT = 120_000;

export interface AutomationResult {
  success: boolean;
  message: string;
  screenshot?: string; // base64 data URI on failure
}

// ─────────────────────────────────────────────────────────────────────────────
// Siebel Tab Navigation Helper
// ─────────────────────────────────────────────────────────────────────────────
async function clickSiebelTab(
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

// ─────────────────────────────────────────────────────────────────────────────
// IOCL SDMS (Siebel eDealer) – Sales Order Search & Invoice Creation
//
// Flow:
//   1. Login via SSO
//   2. Navigate to Sales Order screen tab
//   3. Click "Sales Order Search" sub-tab
//   4. Search by Consumer No or Mobile Number
//   5. Click the Relationship Id drilldown
//   6. Click the first Sales Order with status "Open"
//   7. Click "Create Invoice"
//   8. Logout
// ─────────────────────────────────────────────────────────────────────────────

export async function runCashMemoAutomation(params: {
  orderNumber: string;
  identifierType: 'consumer' | 'phone' | null;
}): Promise<AutomationResult> {
  const browser = await chromium.launch({
    headless: false,
    ...(useSystemChrome ? { channel: 'chrome' } : {}),
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-infobars',
      '--window-size=1920,1080',
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  // Start tracing for failure debugging
  await context.tracing.start({ screenshots: true, snapshots: true });

  const page = await context.newPage();
  const tag = `[${params.orderNumber}]`;
  const identifierType = params.identifierType || 'consumer';

  try {
    const label = identifierType === 'phone' ? 'Phone' : 'Consumer';
    logger.info(`${tag} Starting cash memo automation (${label})`);

    const toolUrl = await getSetting('cash_memo.tool_url');
    const toolUsername = await getSetting('cash_memo.tool_username');
    const toolPassword = await getSetting('cash_memo.tool_password');
    logger.info(`${tag} Portal URL: ${toolUrl || '(not configured)'}`);

    if (!toolUrl || !toolUsername || !toolPassword) {
      return { success: false, message: 'Portal URL, username, or password not configured' };
    }

    // ── 1. Login via SSO ─────────────────────────────────────────────────────
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

    // ── 2. Navigate to Sales Order screen tab ────────────────────────────────
    await clickSiebelTab(page, 'Sales Order', 'screen');
    logger.info(`${tag} Navigated to Sales Order screen`);

    // ── 3. Click "Sales Order Search" sub-tab ────────────────────────────────
    await clickSiebelTab(page, 'Sales Order Search', 'view');
    logger.info(`${tag} Navigated to Sales Order Search`);

    // Wait for the Relationships search grid
    await page.locator('div[title="Relationships List"]').waitFor({
      state: 'visible',
      timeout: WAIT_TIMEOUT,
    });

    // ── 4. Search by Consumer No or Mobile Number ────────────────────────────
    const relationshipsGrid = page.locator('table[summary="Relationships"]');

    if (identifierType === 'consumer') {
      const consumerNoCell = relationshipsGrid
        .locator('td[aria-roledescription="Consumer No"]')
        .first();
      await consumerNoCell.waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
      await consumerNoCell.click();
      await page.keyboard.type(params.orderNumber);
    } else {
      const mobileCell = relationshipsGrid
        .locator('td[aria-roledescription="Mobile Number"]')
        .first();
      await mobileCell.waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
      await mobileCell.click();
      await page.keyboard.type(params.orderNumber);
    }

    // Submit search
    await page.keyboard.press('Enter');
    logger.info(`${tag} Search submitted for ${label}: ${params.orderNumber}`);

    // Wait for relationship results to load
    const firstRow = relationshipsGrid.locator('tr.jqgrow').first();
    await firstRow.waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });

    // ── 5. Click the Relationship Id drilldown link ──────────────────────────
    const drilldownLink = relationshipsGrid
      .locator('td[aria-roledescription="Relationship Id"] a.drilldown')
      .first();
    await drilldownLink.waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
    await drilldownLink.click();
    logger.info(`${tag} Clicked Relationship Id drilldown`);

    // Wait for Relationship Detail view
    await page.locator('div[title="Relationship Form"]').waitFor({
      state: 'visible',
      timeout: WAIT_TIMEOUT,
    });

    // ── 6. Click the first Sales Order with status "Open" ────────────────────
    const ordersSubTab = page.locator(
      '#s_vctrl_div_tabScreen li.siebui-active-navtab a',
      { hasText: 'Orders' },
    );
    if (!(await ordersSubTab.isVisible().catch(() => false))) {
      await clickSiebelTab(page, 'Orders', 'subview');
    }

    // Wait for the Sales Order child grid
    const salesOrderGrid = page.locator('table[summary="Sales Order"]');
    await salesOrderGrid.locator('tr.jqgrow').first().waitFor({
      state: 'visible',
      timeout: WAIT_TIMEOUT,
    });

    // Find the first row where Order Status is "Open"
    const salesOrderRows = salesOrderGrid.locator('tr.jqgrow');
    const rowCount = await salesOrderRows.count();

    let clickedOpenOrder = false;
    let orderNumber = '';
    for (let i = 0; i < rowCount; i++) {
      const row = salesOrderRows.nth(i);
      const status = await row
        .locator('td[aria-roledescription="Order Status"]')
        .textContent();

      if (status?.trim() === 'Open') {
        const orderLink = row.locator('td[aria-roledescription="Sales Order #"] a.drilldown');
        orderNumber = (await orderLink.textContent())?.trim() || '';
        await orderLink.click();
        clickedOpenOrder = true;
        break;
      }
    }

    if (!clickedOpenOrder) {
      return { success: false, message: `No open Sales Order found for ${params.orderNumber}` };
    }

    logger.info(`${tag} Clicked open Sales Order: ${orderNumber}`);

    // Wait for Sales Order Detail view
    await page.locator('div[title="Sales Order Form"]').waitFor({
      state: 'visible',
      timeout: WAIT_TIMEOUT,
    });

    // ── 7. Click "Create Invoice" ────────────────────────────────────────────
    const createInvoiceBtn = page.locator('button[aria-label="Sales Order Form:Create Invoice"]');
    await createInvoiceBtn.waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
    await createInvoiceBtn.click();
    logger.info(`${tag} Clicked Create Invoice`);

    // Wait for confirmation — the form should update after invoice creation
    await page.locator('#siebui-threadbar').waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });

    // ── 8. Logout ────────────────────────────────────────────────────────────
    await page.locator('li[name="Root"][title="Settings"]').click();
    await page.locator('button[title="Logout"]').waitFor({
      state: 'visible',
      timeout: WAIT_TIMEOUT,
    });
    await page.locator('button[title="Logout"]').click();
    logger.info(`${tag} Logged out`);

    // Discard trace on success
    await context.tracing.stop();

    return {
      success: true,
      message: `Invoice created for order ${orderNumber}`,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error(`${tag} Automation failed: ${errorMessage}`);

    // Capture screenshot as base64 for DB storage
    let screenshot: string | undefined;
    try {
      const buffer = await page.screenshot({ fullPage: true });
      screenshot = `data:image/png;base64,${buffer.toString('base64')}`;
      logger.info(`${tag} Error screenshot captured (${Math.round(buffer.length / 1024)}KB)`);
    } catch {
      logger.warn(`${tag} Failed to capture error screenshot`);
    }

    // Save trace to filesystem for detailed debugging
    try {
      if (!existsSync(TRACES_DIR)) mkdirSync(TRACES_DIR, { recursive: true });
      const tracePath = `${TRACES_DIR}/${params.orderNumber}-${Date.now()}.zip`;
      await context.tracing.stop({ path: tracePath });
      logger.info(`${tag} Trace saved: ${tracePath}`);
    } catch {
      logger.warn(`${tag} Failed to save trace`);
    }

    return { success: false, message: errorMessage, screenshot };
  } finally {
    await context.close();
    await browser.close();
  }
}
