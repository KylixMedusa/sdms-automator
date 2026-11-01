import logger from '../../shared/utils/logger';
import { getSetting } from '../../shared/utils/settings';
import type { AutomationResult } from './siebel';
import { getPortalAccounts, getPortalUrl } from '../../shared/utils/accounts';
import type { PortalAccount } from '../../shared/utils/accounts';
import {
  clickSiebelTab,
  failWithScreenshot,
  launchSiebelBrowser,
  loginSiebel,
  logoutSiebel,
  WAIT_TIMEOUT,
} from './siebel';

// "Copy Record" accelerator — macOS Chrome binds this to Cmd, not Ctrl.
const COPY_RECORD_SHORTCUT =
  process.platform === 'darwin' ? 'Meta+b' : 'Control+b';

// ─────────────────────────────────────────────────────────────────────────────
// IOCL SDMS (Siebel eDealer) – Bulk Confirm Delivery Return Flow
//
// 1. Scan: run the date/delivery-boy query once, sort ascending, and page
//    through it read-only to collect every Sales Order #.
// 2. Process: for each scanned order, re-query Bulk Confirm Delivery with that
//    Sales Order # so the grid holds just that row, drill in, and set the
//    Return Reason if it's empty. No paging back to where we were — Siebel
//    tags the list URL with the drilled-into row, so back()/URL replay only
//    ever shows that one row anyway.
// 3. Rescan: a single Siebel scan can miss rows, so once the list is drained
//    scan again and process anything new, until a scan turns up nothing.
//
// Work runs in chunks of CHUNK_SIZE orders, each with a fresh login/browser.
// ─────────────────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 150;
export const MAX_SCANS = 4;
const MAX_CONSECUTIVE_FAILED_CHUNKS = 3;
// The portal refuses a re-login while the account's previous session is still winding down.
const LOGIN_RETRY_DELAYS_MS = [15_000, 30_000, 60_000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
const MAX_CHUNKS = 100; // hard safety valve

export function formatSiebelDate(date: Date): string {
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const dd = String(date.getDate()).padStart(2, '0');
  const mmm = months[date.getMonth()];
  const yyyy = date.getFullYear();
  return `${dd}-${mmm}-${yyyy} 12:00:00 AM`;
}

export interface QueryParams {
  fromDateStr: string;
  toDateStr: string;
  deliveryBoy?: string;
}

// Searches by the given date/delivery-boy filters, or by a single Sales Order # alone.
async function submitBulkConfirmQuery(
  page: import('playwright').Page,
  filter: QueryParams | { orderNumber: string },
): Promise<{ grid: import('playwright').Locator; empty: boolean }> {
  await clickSiebelTab(page, 'Sales Order', 'screen');
  await clickSiebelTab(page, 'Bulk Confirm Delivery', 'view');

  await page.locator('#s_1_1_39_0_Ctrl').click();

  if ('orderNumber' in filter) {
    await page.locator('input[name="s_1_2_90_0"]').fill(filter.orderNumber);
  } else {
    await page.locator('input[name="s_1_2_8_0"]').fill(filter.fromDateStr);
    await page.locator('input[name="s_1_2_16_0"]').fill(filter.toDateStr);
    if (filter.deliveryBoy) await page.locator('input[name="s_1_1_4_0"]').fill(filter.deliveryBoy);
  }

  await page.locator('#s_1_1_17_0_Ctrl').click();

  const salesOrderGrid = page.locator('table[summary="Sales Order"]');

  // Cancelled orders drop out of this list, so an empty result is a normal outcome for cancel jobs.
  const state = await page
    .waitForFunction(
      () => {
        const row = document.querySelector('table[summary="Sales Order"] tr.jqgrow') as HTMLElement | null;
        if (row && row.offsetParent !== null) return 'rows';
        const counter = document.querySelector('#s_1_rc')?.textContent ?? '';
        return /no record/i.test(counter) ? 'empty' : false;
      },
      null,
      { timeout: WAIT_TIMEOUT },
    )
    .then((h) => h.jsonValue());
  return { grid: salesOrderGrid, empty: state === 'empty' };
}

// Assumes the page is already logged in.
export async function openSortedResultsGrid(
  page: import('playwright').Page,
  tag: string,
  q: QueryParams,
): Promise<{ grid: import('playwright').Locator; empty: boolean }> {
  const { grid: salesOrderGrid, empty } = await submitBulkConfirmQuery(page, q);
  if (empty) {
    logger.info(`${tag} Query run — no results`);
    return { grid: salesOrderGrid, empty };
  }
  const firstOrderLink = 'table[summary="Sales Order"] tr.jqgrow td[aria-roledescription="Sales Order #"] a.drilldown';
  const unsortedFirst = (await page.locator(firstOrderLink).first().textContent())?.trim() ?? '';

  // Sort by Order Date ascending (oldest first) — left-click the column
  // header to open its sort popover, then pick "Sort ascending".
  await page.locator('#jqgh_s_1_l_Order_Date').click();
  const sortAscItem = page.locator('#SortAsc_1 a');
  await sortAscItem.waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
  await sortAscItem.click();
  await page.waitForLoadState('networkidle', { timeout: WAIT_TIMEOUT });

  // networkidle fires before Siebel swaps in the sorted rows; reading early gave an
  // unsorted page 1 that shifted every later page by one and hid the true last page.
  await page
    .waitForFunction(
      ({ sel, prev }) => {
        const a = document.querySelector(sel);
        return !!a && (a.textContent || '').trim() !== prev;
      },
      { sel: firstOrderLink, prev: unsortedFirst },
      { timeout: 15_000 },
    )
    .catch(() => logger.warn(`${tag} First row didn't change after sort — it may already have been first`));

  await salesOrderGrid.locator('tr.jqgrow').first().waitFor({
    state: 'visible',
    timeout: WAIT_TIMEOUT,
  });

  logger.info(`${tag} Query run, sorted by Order Date ascending`);
  return { grid: salesOrderGrid, empty: false };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class OrderNotListedError extends Error {}

// Returns the drilldown link for exactly `orderNumber`; throws if the search doesn't surface it.
async function searchOrder(
  page: import('playwright').Page,
  tag: string,
  orderNumber: string,
): Promise<import('playwright').Locator> {
  const { grid, empty } = await submitBulkConfirmQuery(page, { orderNumber });
  if (empty) throw new OrderNotListedError(`Search for order ${orderNumber} returned no results`);
  const link = grid
    .locator('tr.jqgrow td[aria-roledescription="Sales Order #"] a.drilldown')
    .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(orderNumber)}\\s*$`) })
    .first();
  try {
    await link.waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
  } catch {
    throw new Error(`Search for order ${orderNumber} did not return it`);
  }
  logger.info(`${tag} Searched order ${orderNumber}`);
  return link;
}

// Read-only pass over every result page (no order is opened): records which
// orders are on which page, the pager's own range label, and whether the Next
// button ever stopped working before the pager said we were done.
async function scanAllPages(
  page: import('playwright').Page,
  grid: import('playwright').Locator,
  tag: string,
): Promise<{ pages: string[][]; stoppedEarly: boolean }> {
  const pages: string[][] = [];
  let stoppedEarly = false;

  for (let pageNo = 1; pageNo <= 200; pageNo++) {
    const links = grid.locator('tr.jqgrow td[aria-roledescription="Sales Order #"] a.drilldown');
    const orders = (await links.allTextContents()).map((t) => t.trim());
    const label = await page
      .locator('#pager_s_1_l .ui-paging-info, #pager_s_1_l [class*="paging-info"]')
      .first()
      .textContent({ timeout: 2_000 })
      .then((t) => t?.trim() ?? '')
      .catch(() => '');
    logger.info(`${tag} Scan page ${pageNo}: ${orders.length} row(s)${label ? ` [pager: ${label}]` : ''}: ${orders.join(', ')}`);

    if (pages.length > 0 && pages[pages.length - 1].join() === orders.join()) {
      logger.warn(`${tag} Scan page ${pageNo} is identical to the previous page — Next didn't advance, stopping scan`);
      stoppedEarly = true;
      break;
    }
    pages.push(orders);

    const next = page.locator('#next_pager_s_1_l');
    const disabled = await next.evaluate((el) => el.classList.contains('ui-state-disabled'));
    if (disabled) break;

    let advanced = false;
    for (let attempt = 1; attempt <= 2 && !advanced; attempt++) {
      try {
        await page.waitForLoadState('networkidle', { timeout: WAIT_TIMEOUT });
        await next.click({ timeout: 10_000 });
        // The old rows stay visible until Siebel swaps in the new page, so
        // "rows visible" isn't enough — wait for the first order to change.
        await page.waitForFunction(
          (prev) => {
            const a = document.querySelector(
              'table[summary="Sales Order"] tr.jqgrow td[aria-roledescription="Sales Order #"] a.drilldown',
            );
            return !!a && (a.textContent || '').trim() !== prev;
          },
          orders[0],
          { timeout: 20_000 },
        );
        await page.waitForLoadState('networkidle', { timeout: WAIT_TIMEOUT });
        advanced = true;
      } catch (err) {
        logger.warn(`${tag} Scan: Next click failed on page ${pageNo} (attempt ${attempt}): ${err instanceof Error ? err.message : err}`);
      }
    }
    if (!advanced) {
      logger.info(`${tag} Scan: pager not disabled but Next won't advance after page ${pageNo} (${orders.length} row(s)) — treating page ${pageNo} as last`);
      break;
    }
  }

  const all = pages.flat();
  const unique = new Set(all);
  const dupes = all.filter((o, i) => all.indexOf(o) !== i);
  logger.info(
    `${tag} SCAN SUMMARY: ${pages.length} page(s), ${all.length} row(s), ${unique.size} unique order(s), page sizes [${pages.map((p) => p.length).join(', ')}]` +
      (dupes.length ? `, DUPLICATES: ${[...new Set(dupes)].join(', ')}` : ''),
  );
  return { pages, stoppedEarly };
}

function buildQueryParams(fromDate: string, toDate: string, deliveryBoy: string | null): QueryParams {
  return {
    fromDateStr: formatSiebelDate(new Date(`${fromDate}T00:00:00`)),
    toDateStr: formatSiebelDate(new Date(`${toDate}T00:00:00`)),
    deliveryBoy: deliveryBoy ?? undefined,
  };
}

// One read-only pass over the date query in its own session, for callers that split the work themselves.
// The first login of a job often lands right after the previous job's logout, so give it one patient retry.
export async function scanReturnOrders(params: {
  tag: string;
  fromDate: string;
  toDate: string;
  useDeliveryBoy?: boolean;
  account: PortalAccount;
}): Promise<string[]> {
  try {
    return await scanReturnOrdersOnce(params);
  } catch (err) {
    if (!(err instanceof LoginError)) throw err;
    logger.warn(`${params.tag} Scan login failed (${err.message}) — retrying in 20s`);
    await sleep(20_000);
    return scanReturnOrdersOnce(params);
  }
}

class LoginError extends Error {}

async function scanReturnOrdersOnce(params: {
  tag: string;
  fromDate: string;
  toDate: string;
  useDeliveryBoy?: boolean;
  account: PortalAccount;
}): Promise<string[]> {
  const toolUrl = await getPortalUrl();
  if (!toolUrl) throw new Error('Portal URL not configured');
  const deliveryBoy = (params.useDeliveryBoy ?? true) ? await getSetting('return.delivery_boy') : null;
  if ((params.useDeliveryBoy ?? true) && !deliveryBoy) throw new Error('Delivery boy not configured');

  const tag = `${params.tag}[scan@${params.account.username}]`;
  const { browser, context, page } = await launchSiebelBrowser();
  page.on('dialog', (dialog) => dialog.accept().catch(() => {}));
  let loggedIn = false;
  try {
    try {
      await loginSiebel(page, tag, toolUrl, params.account.username, params.account.password);
    } catch (err) {
      throw new LoginError(err instanceof Error ? err.message : String(err));
    }
    loggedIn = true;
    const orders = await scanQueryResults(page, tag, buildQueryParams(params.fromDate, params.toDate, deliveryBoy));
    return [...new Set(orders)];
  } finally {
    if (loggedIn) await logoutSiebel(page, tag);
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function scanQueryResults(
  page: import('playwright').Page,
  tag: string,
  q: QueryParams,
): Promise<string[]> {
  const { grid, empty } = await openSortedResultsGrid(page, tag, q);
  if (empty) return [];
  return (await scanAllPages(page, grid, tag)).pages.flat();
}

// 'verified' / 'reapplied' come from the verification pass that re-reads every handled order.
export type ReturnOrderOutcome = 'set_reason' | 'already_had_reason' | 'verified' | 'reapplied' | 'failed';

// 'return' copies the reason row (Ctrl+B); 'cancel' adds it and confirms with OK, which cancels the invoice.
export type ReturnMode = 'return' | 'cancel';

export async function runReturnAutomation(params: {
  mode?: ReturnMode;
  fromDate: string; // ISO date string (YYYY-MM-DD) picked by the user
  toDate: string; // ISO date string (YYYY-MM-DD), must be > fromDate
  startAfterOrderNumber?: string; // skip every order up to and including this one (ignored when includeOrderNumbers is set)
  includeOrderNumbers?: string[]; // if non-empty, ONLY these orders are processed (searched directly, no scan)
  excludeOrderNumbers?: string[]; // never touched, even if listed in includeOrderNumbers
  useDeliveryBoy?: boolean; // false skips the Delivery Boy filter in the query (default true)
  toolUsername?: string; // log in as this portal user instead of the first configured account
  account?: PortalAccount; // explicit credentials; takes precedence over toolUsername
  previouslyProcessedOrderNumbers?: string[]; // orders already set/confirmed in an earlier attempt of this job
  onProgress?: (lastProcessedOrderNumber: string) => Promise<void> | void;
  onOrderProcessed?: (orderNumber: string, outcome: ReturnOrderOutcome) => Promise<void> | void;
  isCancelled?: () => Promise<boolean>;
}): Promise<AutomationResult> {
  const mode = params.mode ?? 'return';
  const tag = `[${mode}:${params.fromDate}${params.account ? `@${params.account.username}` : ''}]`;

  const reasonSetFor: string[] = [];
  const alreadyHadReason: string[] = [];
  const failedOrders: string[] = [];
  const verifiedOrders: string[] = [];
  const reappliedOrders: string[] = [];
  const unverifiedOrders: string[] = [];
  const chunkErrors: string[] = [];
  let processedCount = 0;
  let lastProcessedOrderNumber: string | undefined;

  const processed = new Set<string>(params.previouslyProcessedOrderNumbers ?? []);
  for (const o of params.excludeOrderNumbers ?? []) processed.add(o);
  const includeSet = params.includeOrderNumbers?.length ? new Set(params.includeOrderNumbers) : null;
  let startAfterPending = !!params.startAfterOrderNumber && !includeSet;
  let startAfterNotFound = false;

  // Ordered, de-duplicated list of every order discovered so far (scan order).
  const queue: string[] = [];
  const queued = new Set<string>();
  const enqueue = (orders: Iterable<string>): number => {
    let added = 0;
    for (const o of orders) {
      if (includeSet && !includeSet.has(o)) continue;
      if (queued.has(o)) continue;
      queued.add(o);
      queue.push(o);
      if (!processed.has(o)) added++;
    }
    return added;
  };
  const remainingOrders = () => queue.filter((o) => !processed.has(o));

  // Orders known to have a reason (this run or an earlier attempt) — the verification pass re-reads each.
  const handled = new Set<string>(params.previouslyProcessedOrderNumbers ?? []);
  const verifyDone = new Set<string>();
  let verifyTargets: string[] = [];
  let phase = 'execute' as 'execute' | 'verify';
  // Cancel verification re-runs the original query: cancelled orders vanish from it, so anything still
  // listed gets cancelled again, until the query comes back empty or the rounds run out.
  const excluded = new Set(params.excludeOrderNumbers ?? []);
  let cancelVerifyRounds = 0;
  let cancelVerifyFinished = false;
  let stillListedAfterVerify: string[] = [];
  const pendingOrders = () =>
    phase === 'execute' ? remainingOrders() : verifyTargets.filter((o) => !verifyDone.has(o));

  if (includeSet) enqueue(includeSet);

  logger.info(`${tag} Starting ${mode} automation${params.useDeliveryBoy === false ? ' (no delivery boy filter)' : ''}${params.toolUsername ? ` as ${params.toolUsername}` : ''}`);

  const toolUrl = await getPortalUrl();
  let account = params.account;
  if (!account) {
    let accounts: PortalAccount[];
    try {
      accounts = await getPortalAccounts();
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
    account = params.toolUsername ? accounts.find((a) => a.username === params.toolUsername) : accounts[0];
    if (!account && params.toolUsername) {
      return { success: false, message: `No password configured for portal user ${params.toolUsername}` };
    }
  }
  const toolUsername = account?.username;
  const toolPassword = account?.password;
  const deliveryBoy = await getSetting('return.delivery_boy');
  const returnReason = await getSetting('return.reason');

  if (!toolUrl || !toolUsername || !toolPassword) {
    return { success: false, message: 'Portal URL, username, or password not configured' };
  }
  const useDeliveryBoy = params.useDeliveryBoy ?? true;
  if (useDeliveryBoy && !deliveryBoy) {
    return { success: false, message: 'Delivery boy not configured' };
  }
  if (!returnReason) {
    return { success: false, message: 'Return reason not configured' };
  }

  const queryParams = buildQueryParams(params.fromDate, params.toDate, useDeliveryBoy ? deliveryBoy : null);

  let needScan = !includeSet;
  let scanCount = 0;
  let chunkNumber = 0;
  let consecutiveFailedChunks = 0;
  let consecutiveLoginFailures = 0;
  let cancelled = false;

  // The initial pass (first scan + execution) gets its own session. Rescans and verification
  // share the next fresh login, so verification never reads back in the session that wrote.
  let initialPassDone = false;
  const startVerify = () => {
    phase = 'verify';
    verifyTargets = queue.filter((o) => handled.has(o));
    logger.info(`${tag} Execution done — verifying ${verifyTargets.length} order(s)`);
  };

  while (chunkNumber < MAX_CHUNKS && consecutiveFailedChunks < MAX_CONSECUTIVE_FAILED_CHUNKS) {
    if (phase === 'execute' && !needScan && remainingOrders().length === 0) {
      initialPassDone = true;
      startVerify();
    }
    if (phase === 'verify' && (mode === 'cancel' ? cancelVerifyFinished : pendingOrders().length === 0)) break;

    if (params.isCancelled && (await params.isCancelled())) {
      logger.info(`${tag} Cancellation requested — stopping before chunk ${chunkNumber + 1}`);
      cancelled = true;
      break;
    }

    chunkNumber++;
    const chunkTag = `${tag}[chunk ${chunkNumber}]`;
    const chunkIsInitial = !initialPassDone;
    const { browser, context, page } = await launchSiebelBrowser();
    page.on('dialog', (dialog) => dialog.accept().catch(() => {}));

    let chunkProcessedCount = 0;
    let loggedIn = false;
    let lastOrderSeen: string | undefined;

    try {
      logger.info(`${chunkTag} Starting chunk (${phase}, ${pendingOrders().length} order(s) pending)`);

      await loginSiebel(page, chunkTag, toolUrl, toolUsername, toolPassword);
      loggedIn = true;

      for (;;) {
        if (phase === 'verify' && mode === 'cancel') {
          while (!cancelVerifyFinished && !cancelled && chunkProcessedCount < CHUNK_SIZE) {
            const stillListed = (await scanQueryResults(page, chunkTag, queryParams)).filter(
              (o) => !excluded.has(o) && (!includeSet || includeSet.has(o)),
            );
            cancelVerifyRounds++;
            stillListedAfterVerify = stillListed;
            logger.info(`${chunkTag} Cancel verify round ${cancelVerifyRounds}: ${stillListed.length} order(s) still listed${stillListed.length ? `: ${stillListed.join(', ')}` : ''}`);
            if (stillListed.length === 0 || cancelVerifyRounds > MAX_SCANS) {
              cancelVerifyFinished = true;
              break;
            }

            for (const orderNumber of stillListed) {
              if (chunkProcessedCount >= CHUNK_SIZE) break;
              if (params.isCancelled && (await params.isCancelled())) {
                logger.info(`${chunkTag} Cancellation requested — stopping mid-verify`);
                cancelled = true;
                break;
              }
              try {
                const orderLink = await searchOrder(page, chunkTag, orderNumber);
                await processOrder(page, chunkTag, orderLink, orderNumber, returnReason, mode);
                if (!reappliedOrders.includes(orderNumber)) reappliedOrders.push(orderNumber);
                await params.onOrderProcessed?.(orderNumber, 'reapplied');
              } catch (err) {
                if (page.isClosed()) throw err;
                if (err instanceof OrderNotListedError) continue;
                logger.warn(`${chunkTag} Order ${orderNumber} failed re-cancel: ${err instanceof Error ? err.message : err}`);
                await params.onOrderProcessed?.(orderNumber, 'failed');
              }
              chunkProcessedCount++;
            }
          }
          break;
        }

        if (
          phase === 'execute' &&
          needScan &&
          (scanCount === 0 || (!chunkIsInitial && remainingOrders().length === 0))
        ) {
          const scanned = await scanQueryResults(page, chunkTag, queryParams);
          scanCount++;

          if (startAfterPending && params.startAfterOrderNumber) {
            startAfterPending = false;
            const idx = scanned.indexOf(params.startAfterOrderNumber);
            if (idx >= 0) {
              for (const o of scanned.slice(0, idx + 1)) processed.add(o);
              logger.info(`${chunkTag} Start-after ${params.startAfterOrderNumber} is row ${idx + 1} of ${scanned.length} — skipping the first ${idx + 1} order(s)`);
            } else {
              startAfterNotFound = true;
              logger.warn(`${chunkTag} Start-after ${params.startAfterOrderNumber} not found among ${scanned.length} scanned order(s) — processing everything`);
            }
          }

          const added = enqueue(scanned);
          // Rescan once this batch is drained, until a scan turns up nothing new.
          needScan = added > 0 && scanCount < MAX_SCANS;
          logger.info(`${chunkTag} Scan ${scanCount}: ${added} new order(s), ${remainingOrders().length} queued`);
        }

        for (const orderNumber of pendingOrders()) {
          if (chunkProcessedCount >= CHUNK_SIZE) break;

          if (params.isCancelled && (await params.isCancelled())) {
            logger.info(`${chunkTag} Cancellation requested — stopping mid-chunk`);
            cancelled = true;
            break;
          }

          try {
            if (phase === 'execute') {
              let orderLink: import('playwright').Locator | null = null;
              try {
                orderLink = await searchOrder(page, chunkTag, orderNumber);
              } catch (err) {
                // A cancelled order drops out of Bulk Confirm Delivery, e.g. one cancelled by an earlier attempt.
                if (!(mode === 'cancel' && err instanceof OrderNotListedError)) throw err;
                logger.info(`${chunkTag} Order ${orderNumber} is no longer listed — already cancelled`);
              }
              const outcome = orderLink
                ? await processOrder(page, chunkTag, orderLink, orderNumber, returnReason, mode)
                : 'already_had_reason';
              processed.add(orderNumber);
              handled.add(orderNumber);
              processedCount++;
              if (outcome === 'set_reason') reasonSetFor.push(orderNumber);
              else alreadyHadReason.push(orderNumber);
              await params.onOrderProcessed?.(orderNumber, outcome);
            } else {
              const outcome = await verifyOrder(page, chunkTag, orderNumber, returnReason, mode);
              verifyDone.add(orderNumber);
              if (outcome === 'verified') verifiedOrders.push(orderNumber);
              else if (outcome === 'reapplied') reappliedOrders.push(orderNumber);
              else unverifiedOrders.push(orderNumber);
              await params.onOrderProcessed?.(orderNumber, outcome);
            }
          } catch (err) {
            // A dead browser isn't this order's fault — let the chunk fail and retry it fresh.
            if (page.isClosed()) throw err;
            const msg = err instanceof Error ? err.message : String(err);
            logger.warn(`${chunkTag} Order ${orderNumber} failed${phase === 'verify' ? ' verification' : ''}: ${msg}`);
            if (phase === 'execute') {
              processed.add(orderNumber);
              failedOrders.push(orderNumber);
            } else {
              verifyDone.add(orderNumber);
              unverifiedOrders.push(orderNumber);
            }
            await params.onOrderProcessed?.(orderNumber, 'failed');
          }
          chunkProcessedCount++;
          if (phase === 'execute') lastOrderSeen = orderNumber;
        }

        if (cancelled || chunkProcessedCount >= CHUNK_SIZE || phase === 'verify') break;
        if (remainingOrders().length > 0) break;
        if (chunkIsInitial) {
          initialPassDone = true;
          break;
        }
        if (needScan) continue;
        startVerify();
      }

      consecutiveFailedChunks = 0;
      consecutiveLoginFailures = 0;
      logger.info(`${chunkTag} Chunk complete — ${chunkProcessedCount} order(s) touched`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.warn(`${chunkTag} Chunk failed: ${errorMessage}`);
      chunkErrors.push(errorMessage);
      if (chunkProcessedCount === 0) consecutiveFailedChunks++;
      else consecutiveFailedChunks = 0;
      await failWithScreenshot(page, chunkTag, errorMessage).catch(() => {});
    } finally {
      // Runs after the error screenshot, so a failed chunk still frees its portal session.
      if (loggedIn) await logoutSiebel(page, chunkTag);
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    }

    if (loggedIn) {
      consecutiveLoginFailures = 0;
    } else if (consecutiveFailedChunks < MAX_CONSECUTIVE_FAILED_CHUNKS && !cancelled) {
      const delay = LOGIN_RETRY_DELAYS_MS[Math.min(consecutiveLoginFailures, LOGIN_RETRY_DELAYS_MS.length - 1)];
      consecutiveLoginFailures++;
      logger.info(`${chunkTag} Login didn't complete — waiting ${delay / 1000}s for the portal to release the session`);
      await sleep(delay);
    }

    if (lastOrderSeen) {
      lastProcessedOrderNumber = lastOrderSeen;
      await params.onProgress?.(lastOrderSeen);
    }

    if (cancelled) break;
  }

  if (cancelled) {
    return {
      success: false,
      cancelled: true,
      message: `Cancelled by user — processed ${processedCount} order(s) for ${params.fromDate} before stopping`,
    };
  }

  // Headline is counts only; the per-order breakdown stays in the worker logs.
  const parts: string[] = [];
  if (reasonSetFor.length > 0) parts.push(`${reasonSetFor.length} ${mode === 'cancel' ? 'cancelled' : 'new reason(s) set'}`);
  if (alreadyHadReason.length > 0) parts.push(`${alreadyHadReason.length} already done`);
  if (failedOrders.length > 0) parts.push(`failed: ${failedOrders.join(', ')}`);
  const verifyPending =
    mode === 'cancel'
      ? cancelVerifyFinished ? [] : queue.filter((o) => handled.has(o))
      : queue.filter((o) => handled.has(o) && !verifyDone.has(o));
  if (mode === 'cancel' && cancelVerifyFinished) {
    let v = stillListedAfterVerify.length === 0
      ? `verified: query is empty after ${cancelVerifyRounds} check(s)`
      : `STILL LISTED after ${cancelVerifyRounds} check(s): ${stillListedAfterVerify.join(', ')}`;
    if (reappliedOrders.length > 0) v += `, re-cancelled ${reappliedOrders.length}: ${reappliedOrders.join(', ')}`;
    parts.push(v);
  } else if (phase === 'execute' && verifyPending.length > 0) {
    parts.push(`verification never ran for ${verifyPending.length} order(s)`);
  } else if (verifyTargets.length > 0) {
    let v = `verified ${verifiedOrders.length}/${verifyTargets.length}`;
    if (reappliedOrders.length > 0) v += `, ${reappliedOrders.length} were empty and re-set: ${reappliedOrders.join(', ')}`;
    if (unverifiedOrders.length > 0) v += `, STILL EMPTY/unverifiable: ${unverifiedOrders.join(', ')}`;
    if (verifyPending.length > 0) v += `, ${verifyPending.length} not verified (chunks failed): ${verifyPending.join(', ')}`;
    parts.push(v);
  }
  if (lastProcessedOrderNumber) parts.push(`last processed: ${lastProcessedOrderNumber}`);
  if (remainingOrders().length > 0)
    parts.push(`${remainingOrders().length} scanned order(s) never reached: ${remainingOrders().join(', ')}`);
  if (startAfterNotFound)
    parts.push(`start-after order ${params.startAfterOrderNumber} was not found in the results, so nothing was skipped`);
  if (chunkErrors.length > 0)
    parts.push(`${chunkErrors.length} chunk(s) hit an error`);

  const message =
    parts.length > 0
      ? `Processed ${processedCount} order(s) for ${params.fromDate} across ${chunkNumber} chunk(s) — ${parts.join(', ')}`
      : `No orders found for ${params.fromDate}`;

  // Unfinished work fails the attempt so the processor retries; the retry skips executed orders and goes on to verify.
  const incomplete =
    remainingOrders().length > 0 ||
    verifyPending.length > 0 ||
    (mode === 'cancel' && phase === 'verify' && (!cancelVerifyFinished || stillListedAfterVerify.length > 0));
  return { success: !incomplete, message };
}

// Opens the order's Invoice subview and returns the topmost row's Return Reason cell, plus the
// text of whichever column marks this mode's work as done (Return Reason / Cancel Reason).
async function openReturnReasonCell(
  page: import('playwright').Page,
  tag: string,
  orderLink: import('playwright').Locator,
  orderNumber: string,
  mode: ReturnMode,
): Promise<{ cell: import('playwright').Locator; reason: string }> {
  await orderLink.click();
  logger.info(`${tag} Opened order ${orderNumber}`);

  // Note: "Sales Order Form" (by title) also exists as the read-only summary
  // applet next to the results list in Bulk Confirm Delivery, so it resolves
  // before the real navigation finishes. The subview tab bar only renders once
  // we're actually inside the order detail view, so wait on that instead.
  await page.locator('#s_vctrl_div_tabScreen').waitFor({
    state: 'visible',
    timeout: WAIT_TIMEOUT,
  });

  await clickSiebelTab(page, 'Invoice', 'subview');

  const invoiceGrid = page.locator('#s_3_l');
  await invoiceGrid.locator('tr.jqgrow').first().waitFor({
    state: 'visible',
    timeout: WAIT_TIMEOUT,
  });

  const firstRow = invoiceGrid.locator('tr.jqgrow').first();
  const cell = firstRow.locator('td[aria-roledescription="Return Reason"]');
  const doneColumn = mode === 'cancel' ? 'Cancel Reason' : 'Return Reason';
  const reason =
    (await firstRow.locator(`td[aria-roledescription="${doneColumn}"]`).textContent())?.trim() ?? '';
  return { cell, reason };
}

async function setReturnReason(
  page: import('playwright').Page,
  returnReasonCell: import('playwright').Locator,
  returnReason: string,
  mode: ReturnMode,
): Promise<void> {
  await returnReasonCell.click();

  const mvgIcon = returnReasonCell.locator('.siebui-icon-mvg');
  await mvgIcon.waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
  await mvgIcon.click();

  const newButton = page.locator(
    'button[aria-label="Return Reason List:New"]',
  );
  await newButton.waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
  await newButton.click();

  const reasonInput = page.locator('input[name="EPIC_Return_Reason"]').last();
  await reasonInput.waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
  await reasonInput.fill(returnReason);

  if (mode === 'cancel') {
    // OK raises a window.confirm() ("Are You Sure to Return Invoice?...") that the page-level handler accepts.
    const okButton = page.locator('button[aria-label="Return Reason List:OK"]');
    await okButton.click();
    await okButton.waitFor({ state: 'hidden', timeout: WAIT_TIMEOUT });
    await page.waitForLoadState('networkidle', { timeout: WAIT_TIMEOUT });
    return;
  }

  // Note: the autocomplete suggestion dropdown only appears for real
  // keystrokes — Playwright's fill() doesn't trigger it, so there's nothing
  // to click here in automation. The new row already has focus, so go
  // straight to Cmd/Ctrl+b — it duplicates and saves in one action.
  await page.keyboard.press(COPY_RECORD_SHORTCUT);
  await page.waitForLoadState('networkidle', { timeout: WAIT_TIMEOUT });

  // Close the "Return Reason" picklist dialog via its titlebar Close (X) —
  // left open, its modal overlay blocks every click on the page behind it
  // (including the next re-query's tab clicks). A window.confirm() may pop
  // up on close; the page-level dialog handler accepts it.
  const closeButton = page.locator('button.ui-dialog-titlebar-close[title="Close"]').last();
  await closeButton.waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
  await closeButton.click();
  await page.waitForLoadState('networkidle', { timeout: WAIT_TIMEOUT });
}

async function processOrder(
  page: import('playwright').Page,
  tag: string,
  orderLink: import('playwright').Locator,
  orderNumber: string,
  returnReason: string,
  mode: ReturnMode,
): Promise<'set_reason' | 'already_had_reason'> {
  const { cell, reason } = await openReturnReasonCell(page, tag, orderLink, orderNumber, mode);

  if (reason) {
    logger.info(`${tag} Order ${orderNumber} already has a ${mode === 'cancel' ? 'cancel' : 'return'} reason ("${reason}"), skipping`);
    return 'already_had_reason';
  }

  await setReturnReason(page, cell, returnReason, mode);
  logger.info(`${tag} ${mode === 'cancel' ? 'Cancelled invoice' : 'Set return reason'} for order ${orderNumber}`);
  return 'set_reason';
}

// Re-reads the saved Return/Cancel Reason; if it's empty, applies it once more and re-reads from a fresh search.
async function verifyOrder(
  page: import('playwright').Page,
  tag: string,
  orderNumber: string,
  returnReason: string,
  mode: ReturnMode,
): Promise<'verified' | 'reapplied' | 'failed'> {
  const first = await openReturnReasonCell(page, tag, await searchOrder(page, tag, orderNumber), orderNumber, mode);
  if (first.reason) {
    logger.info(`${tag} Verified ${orderNumber}: "${first.reason}"`);
    return 'verified';
  }

  logger.warn(`${tag} Verify: ${orderNumber} has no ${mode === 'cancel' ? 'cancel' : 'return'} reason — applying it again`);
  await setReturnReason(page, first.cell, returnReason, mode);

  const second = await openReturnReasonCell(page, tag, await searchOrder(page, tag, orderNumber), orderNumber, mode);
  if (second.reason) {
    logger.info(`${tag} Verified ${orderNumber} after re-setting: "${second.reason}"`);
    return 'reapplied';
  }

  logger.warn(`${tag} Verify: ${orderNumber} is STILL empty after re-setting`);
  return 'failed';
}
