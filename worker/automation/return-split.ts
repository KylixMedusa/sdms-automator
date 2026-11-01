import logger from '../../shared/utils/logger';
import type { AutomationResult } from './siebel';
import { getPortalAccounts } from '../../shared/utils/accounts';
import type { PortalAccount } from '../../shared/utils/accounts';
import { MAX_SCANS, runReturnAutomation, scanReturnOrders } from './return';

type ReturnParams = Parameters<typeof runReturnAutomation>[0];

// Scans once, deals the orders round-robin across every portal account (one browser each, in parallel),
// then rescans for orders Siebel left out and deals those too. Each lane does its own execute + verify.
export async function runSplitReturnAutomation(params: ReturnParams): Promise<AutomationResult> {
  const mode = params.mode ?? 'return';
  const tag = `[${mode}:${params.fromDate}]`;

  let accounts: PortalAccount[];
  try {
    accounts = await getPortalAccounts();
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
  if (params.toolUsername) return runReturnAutomation(params);
  if (accounts.length === 0) return { success: false, message: 'No portal accounts configured' };
  if (accounts.length === 1) return runReturnAutomation({ ...params, account: accounts[0] });

  const includeList = params.includeOrderNumbers?.length ? params.includeOrderNumbers : null;
  const excluded = new Set(params.excludeOrderNumbers ?? []);
  const assigned = new Set<string>();
  const skipped = new Set<string>();
  let startAfterPending = !!params.startAfterOrderNumber && !includeList;
  const notes: string[] = [];
  const laneMessages: string[] = [];
  let allSucceeded = true;
  let cancelled = false;

  logger.info(`${tag} Splitting ${mode} across ${accounts.length} account(s): ${accounts.map((a) => a.username).join(', ')}`);

  for (let round = 1; round <= MAX_SCANS; round++) {
    if (params.isCancelled && (await params.isCancelled())) {
      cancelled = true;
      break;
    }

    let candidates: string[];
    if (includeList) {
      if (round > 1) break;
      candidates = includeList;
    } else {
      try {
        candidates = await scanReturnOrders({
          tag,
          fromDate: params.fromDate,
          toDate: params.toDate,
          useDeliveryBoy: params.useDeliveryBoy,
          account: accounts[0],
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`${tag} Scan ${round} failed: ${msg}`);
        if (round === 1) return { success: false, message: `Scan failed for ${params.fromDate}: ${msg}` };
        notes.push(`rescan ${round} failed: ${msg}`);
        allSucceeded = false;
        break;
      }

      if (startAfterPending && params.startAfterOrderNumber) {
        startAfterPending = false;
        const idx = candidates.indexOf(params.startAfterOrderNumber);
        if (idx >= 0) for (const o of candidates.slice(0, idx + 1)) skipped.add(o);
        else notes.push(`start-after order ${params.startAfterOrderNumber} was not found in the results, so nothing was skipped`);
      }
    }

    const fresh = [...new Set(candidates)].filter((o) => !excluded.has(o) && !skipped.has(o) && !assigned.has(o));
    logger.info(`${tag} Round ${round}: ${fresh.length} new order(s) to split`);
    if (fresh.length === 0) break;
    for (const o of fresh) assigned.add(o);

    const lanes = accounts
      .map((account, i) => ({ account, orders: fresh.filter((_, j) => j % accounts.length === i) }))
      .filter((lane) => lane.orders.length > 0);

    const results = await Promise.all(
      lanes.map(({ account, orders }) =>
        runReturnAutomation({
          ...params,
          includeOrderNumbers: orders,
          startAfterOrderNumber: undefined,
          toolUsername: undefined,
          account,
        }).catch((err): AutomationResult => ({
          success: false,
          message: err instanceof Error ? err.message : String(err),
        })),
      ),
    );

    results.forEach((r, i) => {
      laneMessages.push(`${lanes[i].account.username} (${lanes[i].orders.length}): ${r.message}`);
      if (r.cancelled) cancelled = true;
      else if (!r.success) allSucceeded = false;
    });
    if (cancelled) break;
  }

  if (assigned.size === 0 && !cancelled) {
    return { success: allSucceeded, message: [`No orders found for ${params.fromDate}`, ...notes].join(' — ') };
  }

  const message = [
    `${cancelled ? 'Cancelled by user — ' : ''}Split ${assigned.size} order(s) for ${params.fromDate} across ${accounts.length} account(s)`,
    ...laneMessages,
    ...notes,
  ].join(' | ');

  return cancelled ? { success: false, cancelled: true, message } : { success: allSucceeded, message };
}
