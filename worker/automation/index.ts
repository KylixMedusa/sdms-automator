import type { AutomationResult } from './cash-memo';
import { runCashMemoAutomation } from './cash-memo';
import { runDacAutomation } from './dac';
import type { Job } from '../../shared/db/schema';

export type { AutomationResult };

export async function runAutomation(job: Job): Promise<AutomationResult> {
  switch (job.jobType) {
    case 'cash_memo':
      return runCashMemoAutomation({
        orderNumber: job.orderNumber,
        identifierType: job.identifierType,
      });
    case 'dac':
      return runDacAutomation({
        orderNumber: job.orderNumber,
        details: job.details,
      });
    default:
      return { success: false, message: `Unknown job type: ${job.jobType}` };
  }
}
