import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { existsSync } from 'fs';

import logger from '../utils/logger';
import { getSetting } from '../utils/settings';

// Stealth plugin: patches navigator.webdriver, user-agent, chrome.runtime, etc.
chromium.use(StealthPlugin());

// Use system Chrome if installed (x86 production), fall back to bundled Chromium (ARM64/local dev)
const useSystemChrome = existsSync('/opt/google/chrome/chrome');

export interface AutomationResult {
  success: boolean;
  message: string;
}

export async function runCashMemoAutomation(params: {
  orderNumber: string;
  identifierType: 'consumer' | 'phone' | null;
}): Promise<AutomationResult> {
  // WAF bypass: Imperva blocks headless Chrome at the TLS level.
  // Headed Chrome + stealth plugin + xvfb (in production) passes detection.
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
  const page = await context.newPage();

  try {
    const label = params.identifierType === 'phone' ? 'Phone' : 'Consumer';
    logger.info(
      `[${params.orderNumber}] Starting cash memo automation (${label})`,
    );

    // Load credentials from DB settings
    const toolUrl = await getSetting('cash_memo.tool_url');
    const toolUsername = await getSetting('cash_memo.tool_username');
    const toolPassword = await getSetting('cash_memo.tool_password');
    logger.info(
      `[${params.orderNumber}] Portal URL: ${toolUrl || '(not configured)'}`,
    );

    if (!toolUrl || !toolUsername || !toolPassword) {
      return {
        success: false,
        message: 'URL, username, or password not configured',
      };
    }

    // Navigate to SDMS portal — use longer timeout and waitUntil: 'domcontentloaded'
    // since WAF (Imperva) can delay full page load from cloud IPs
    await page.goto(toolUrl, { timeout: 90000, waitUntil: 'domcontentloaded' });
    logger.info(`[${params.orderNumber}] Navigated to portal`);

    await page.waitForSelector('input[id="username"]', { state: 'visible' });
    await page.fill('input[id="username"]', toolUsername);
    await page.fill('input[id="password"]', toolPassword);

    return {
      success: true,
      message: 'Success',
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error(`[${params.orderNumber}] Automation failed: ${errorMessage}`);

    try {
      const screenshotPath = `/tmp/error-${params.orderNumber}-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      logger.info(
        `[${params.orderNumber}] Error screenshot saved: ${screenshotPath}`,
      );
    } catch {
      logger.warn(`[${params.orderNumber}] Failed to take error screenshot`);
    }

    return {
      success: false,
      message: errorMessage,
    };
  } finally {
    await context.close();
    await browser.close();
  }
}
