import { db } from '../db';
import { jobs } from '../db/schema';
import type { Job } from '../db/schema';
import { eq, asc } from 'drizzle-orm';
import { runAutomation } from '../automation';
import logger from '../utils/logger';

const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || '3000', 10);

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

async function markFailed(id: number, errorMessage: string): Promise<void> {
  await db
    .update(jobs)
    .set({
      status: 'failed',
      errorMessage,
      completedAt: new Date(),
    })
    .where(eq(jobs.id, id));
}

async function handleFailure(job: Job, errorMessage: string): Promise<void> {
  // job.attempts was already incremented in markRunning
  // maxRetries default is 2, so after 2 attempts we fail
  const currentAttempts = job.attempts + 1; // +1 because markRunning incremented it
  if (currentAttempts < job.maxRetries) {
    logger.info(`Job #${job.id} failed attempt ${currentAttempts}/${job.maxRetries}, will retry`);
    await db
      .update(jobs)
      .set({ status: 'pending', errorMessage })
      .where(eq(jobs.id, job.id));
  } else {
    logger.warn(`Job #${job.id} failed after ${currentAttempts} attempts: ${errorMessage}`);
    await markFailed(job.id, errorMessage);
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
      await handleFailure(job, result.message);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await handleFailure(job, errorMessage);
  }
}

export async function startJobProcessor(): Promise<void> {
  // Startup recovery: reset any stuck "running" jobs
  const resetResult = await db
    .update(jobs)
    .set({ status: 'pending' })
    .where(eq(jobs.status, 'running'))
    .returning({ id: jobs.id });

  if (resetResult.length > 0) {
    logger.info(`Reset ${resetResult.length} stuck running job(s) to pending`);
  }

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

export async function gracefulShutdown(): Promise<void> {
  logger.info('Graceful shutdown initiated...');
  shuttingDown = true;

  if (currentJobPromise) {
    logger.info('Waiting for current job to finish...');
    await currentJobPromise;
  }
}
