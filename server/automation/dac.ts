import type { AutomationResult } from './cash-memo';
import logger from '../utils/logger';

export async function runDacAutomation(params: {
  orderNumber: string;
  details: string | null;
}): Promise<AutomationResult> {
  logger.warn(`[${params.orderNumber}] DAC automation not implemented yet`);
  return {
    success: false,
    message: 'DAC automation is not yet implemented',
  };
}
