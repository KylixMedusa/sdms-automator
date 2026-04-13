import { db } from '../../shared/db';
import { jobs } from '../../shared/db/schema';
import type { Job } from '../../shared/db/schema';
import { eq, sql } from 'drizzle-orm';
import { runAutomation } from '../automation';
import logger from '../../shared/utils/logger';

const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || '3000', 10);

let shuttingDown = false;
let currentJobPromise: Promise<void> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// #6 fix: Atomic claim — SELECT FOR UPDATE SKIP LOCKED + UPDATE in one shot
// Prevents race conditions if multiple workers ever run simultaneously
async function claimNextJob(): Promise<Job | null> {
  const result = await db.execute<Job>(sql`
    UPDATE jobs SET
      status = 'running',
      started_at = now(),
      attempts = attempts + 1
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);

  return result.rows?.[0] || null;
}

async function markCompleted(id: number, resultMessage: string): Promise<void> {
  await db
    .update(jobs)
    .set({
      status: 'completed',
      resultMessage,
      completedAt: new Date(),
    })
    .where(eq(jobs.id, id));
}

async function markFailed(id: number, errorMessage: string, errorScreenshot?: string): Promise<void> {
  await db
    .update(jobs)
    .set({
      status: 'failed',
      errorMessage,
      errorScreenshot: errorScreenshot || null,
      completedAt: new Date(),
    })
    .where(eq(jobs.id, id));
}

// #7 fix: Use fresh `attempts` from the claimed job (already incremented by claimNextJob)
async function handleFailure(job: Job, errorMessage: string, screenshot?: string): Promise<void> {
  if (job.attempts < job.maxRetries) {
    logger.info(`Job #${job.id} failed attempt ${job.attempts}/${job.maxRetries}, will retry`);
    await db
      .update(jobs)
      .set({ status: 'pending', errorMessage })
      .where(eq(jobs.id, job.id));
  } else {
    logger.warn(`Job #${job.id} failed after ${job.attempts} attempts: ${errorMessage}`);
    await markFailed(job.id, errorMessage, screenshot);
  }
}

async function processJob(job: Job): Promise<void> {
  logger.info(`Processing job #${job.id} (${job.jobType}/${job.orderNumber}), attempt ${job.attempts}`);

  try {
    const result = await runAutomation(job);

    if (result.success) {
      await markCompleted(job.id, result.message);
      logger.info(`Job #${job.id} completed: ${result.message}`);
    } else {
      await handleFailure(job, result.message, result.screenshot);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await handleFailure(job, errorMessage);
  }
}

export async function startJobProcessor(): Promise<void> {
  // Startup recovery: reset any stuck "running" jobs
  try {
    await db
      .update(jobs)
      .set({ status: 'pending' })
      .where(eq(jobs.status, 'running'));
    logger.info('Reset any stuck running jobs to pending');
  } catch (err: any) {
    logger.error(`Startup recovery failed: ${err?.message || err}`);
    throw err;
  }

  logger.info('Job processor started — polling for pending jobs');

  while (!shuttingDown) {
    try {
      const job = await claimNextJob();

      if (!job) {
        await sleep(POLL_INTERVAL);
        continue;
      }

      currentJobPromise = processJob(job);
      await currentJobPromise;
      currentJobPromise = null;
    } catch (err) {
      logger.error('Job processor error', err);
      await sleep(POLL_INTERVAL);
    }
  }

  logger.info('Job processor stopped');
}

export async function gracefulShutdown(): Promise<void> {
  logger.info('Graceful shutdown initiated...');
  shuttingDown = true;

  if (currentJobPromise) {
    logger.info('Waiting for current job to finish...');
    await currentJobPromise;
  }
}
