import type { AutomationResult } from './siebel';
import { runSplitReturnAutomation } from './return-split';
import type { ReturnOrderOutcome } from './return';
import type { Job } from '../../shared/db/schema';
import { db } from '../../shared/db';
import { jobs } from '../../shared/db/schema';
import { eq } from 'drizzle-orm';
import logger from '../../shared/utils/logger';

export type { AutomationResult };

export async function runAutomation(job: Job): Promise<AutomationResult> {
  switch (job.jobType) {
    case 'return':
    case 'cancel': {
      if (!job.details) {
        return { success: false, message: `To date is missing for this ${job.jobType} job` };
      }
      let parsed: {
        toDate: string;
        startAfterOrderNumber?: string;
        includeOrderNumbers?: string[];
        excludeOrderNumbers?: string[];
        useDeliveryBoy?: boolean;
        toolUsername?: string;
      };
      try {
        parsed = JSON.parse(job.details);
      } catch {
        return { success: false, message: `${job.jobType} job details are malformed` };
      }
      let processedOrders: Array<{ orderNumber: string; outcome: ReturnOrderOutcome }>;
      try {
        processedOrders = job.processedOrders ? JSON.parse(job.processedOrders) : [];
      } catch {
        processedOrders = [];
      }
      // Split lanes report concurrently; chain writes so an older snapshot never lands last.
      let writes = Promise.resolve();
      const persist = (fn: () => Promise<void>) => (writes = writes.then(fn));

      return runSplitReturnAutomation({
        mode: job.jobType,
        fromDate: job.orderNumber,
        toDate: parsed.toDate,
        startAfterOrderNumber: parsed.startAfterOrderNumber,
        includeOrderNumbers: parsed.includeOrderNumbers,
        excludeOrderNumbers: parsed.excludeOrderNumbers,
        useDeliveryBoy: parsed.useDeliveryBoy,
        toolUsername: parsed.toolUsername,
        // Latest outcome wins — an order set earlier but later failing verification must be redone.
        previouslyProcessedOrderNumbers: [
          ...new Map(processedOrders.map((o) => [o.orderNumber, o.outcome])).entries(),
        ]
          .filter(([, outcome]) => outcome !== 'failed')
          .map(([orderNumber]) => orderNumber),
        onProgress: async (lastProcessedOrderNumber) => {
          const updatedDetails = JSON.stringify({ ...parsed, lastProcessedOrderNumber });
          await persist(async () => {
            try {
              await db.update(jobs).set({ details: updatedDetails }).where(eq(jobs.id, job.id));
            } catch (err) {
              logger.warn(`Failed to persist return job #${job.id} progress: ${err instanceof Error ? err.message : err}`);
            }
          });
        },
        onOrderProcessed: async (orderNumber, outcome) => {
          processedOrders.push({ orderNumber, outcome });
          const snapshot = JSON.stringify(processedOrders);
          await persist(async () => {
            try {
              await db.update(jobs).set({ processedOrders: snapshot }).where(eq(jobs.id, job.id));
            } catch (err) {
              logger.warn(`Failed to persist return job #${job.id} order history: ${err instanceof Error ? err.message : err}`);
            }
          });
        },
        isCancelled: async () => {
          try {
            const [row] = await db
              .select({ cancelRequested: jobs.cancelRequested })
              .from(jobs)
              .where(eq(jobs.id, job.id))
              .limit(1);
            return row?.cancelRequested ?? false;
          } catch {
            return false;
          }
        },
      });
    }
    default:
      return { success: false, message: `Unknown job type: ${job.jobType}` };
  }
}
