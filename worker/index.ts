import 'dotenv/config';
import { startJobProcessor, gracefulShutdown } from './processor';
import { pool } from '../shared/db';
import logger from '../shared/utils/logger';

logger.info('Worker starting...');

startJobProcessor().catch((err) => {
  logger.error('Job processor crashed', err);
  process.exit(1);
});

const shutdown = async () => {
  logger.info('Worker shutdown signal received');
  await gracefulShutdown();
  await pool.end();
  logger.info('Worker stopped');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
