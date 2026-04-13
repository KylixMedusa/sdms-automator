import { readdirSync, statSync, unlinkSync, existsSync } from 'fs';
import { db } from '../../shared/db';
import { jobs } from '../../shared/db/schema';
import type { Job } from '../../shared/db/schema';
import { eq, asc } from 'drizzle-orm';
import { runAutomation } from '../automation';
import logger from '../../shared/utils/logger';

const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || '3000', 10);
const TRACES_DIR = '/data/traces';
const TRACE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let shuttingDown = false;
let currentJobPromise: Promise<void> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getNextPendingJob(): Promise<Job | null> {
  const [job] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.status, 'pending'))
    .orderBy(asc(jobs.createdAt))
    .limit(1);

  return job || null;
}

async function markRunning(id: number): Promise<void> {
  await db
    .update(jobs)
    .set({
      status: 'running',
      startedAt: new Date(),
      attempts: jobs.attempts,
    })
    .where(eq(jobs.id, id));

  // Increment attempts separately using raw SQL to avoid type issues
  await db.execute(
    `UPDATE jobs SET attempts = attempts + 1 WHERE id = ${id}`,
  );
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

async function handleFailure(job: Job, errorMessage: string, screenshot?: string): Promise<void> {
  const currentAttempts = job.attempts + 1;
  if (currentAttempts < job.maxRetries) {
    logger.info(`Job #${job.id} failed attempt ${currentAttempts}/${job.maxRetries}, will retry`);
    await db
      .update(jobs)
      .set({ status: 'pending', errorMessage })
      .where(eq(jobs.id, job.id));
  } else {
    logger.warn(`Job #${job.id} failed after ${currentAttempts} attempts: ${errorMessage}`);
    await markFailed(job.id, errorMessage, screenshot);
  }
}

async function processJob(job: Job): Promise<void> {
  logger.info(`Processing job #${job.id} (${job.jobType}/${job.orderNumber}), attempt ${job.attempts + 1}`);
  await markRunning(job.id);

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
  await db
    .update(jobs)
    .set({ status: 'pending' })
    .where(eq(jobs.status, 'running'));
  logger.info('Reset any stuck running jobs to pending');

  // Clean up old trace files on startup
  cleanupOldTraces();

  logger.info('Job processor started — polling for pending jobs');

  while (!shuttingDown) {
    try {
      const job = await getNextPendingJob();

      if (!job) {
        await sleep(POLL_INTERVAL);
        continue;
      }

      currentJobPromise = processJob(job);
      await currentJobPromise;
      currentJobPromise = null;

      // Don't sleep — immediately check for next job
    } catch (err) {
      logger.error('Job processor error', err);
      await sleep(POLL_INTERVAL);
    }
  }

  logger.info('Job processor stopped');
}

function cleanupOldTraces(): void {
  try {
    if (!existsSync(TRACES_DIR)) return;
    const now = Date.now();
    const files = readdirSync(TRACES_DIR);
    let cleaned = 0;
    for (const file of files) {
      const filePath = `${TRACES_DIR}/${file}`;
      const stat = statSync(filePath);
      if (now - stat.mtimeMs > TRACE_MAX_AGE_MS) {
        unlinkSync(filePath);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} old trace file(s)`);
    }
  } catch {
    logger.warn('Failed to clean up traces');
  }
}

export async function gracefulShutdown(): Promise<void> {
  logger.info('Graceful shutdown initiated...');
  shuttingDown = true;

  if (currentJobPromise) {
    logger.info('Waiting for current job to finish...');
    await currentJobPromise;
  }
}
