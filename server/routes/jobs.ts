import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { jobs } from '../db/schema';
import { eq, and, desc, gte, lt, or, ilike } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import logger from '../utils/logger';

const router = Router();

const createJobSchema = z
  .object({
    orderNumber: z.string().min(1, 'Order number is required'),
    jobType: z.enum(['cash_memo', 'dac']).default('cash_memo'),
    identifierType: z.enum(['consumer', 'phone']).optional(),
    details: z.string().optional(),
  })
  .refine(
    (data) => data.jobType !== 'cash_memo' || data.identifierType !== undefined,
    { message: 'Identifier type is required for cash memo jobs', path: ['identifierType'] },
  );

const jobsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  jobType: z.enum(['cash_memo', 'dac']).optional(),
  status: z.enum(['pending', 'running', 'completed', 'failed']).optional(),
  search: z.string().optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const statsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  jobType: z.enum(['cash_memo', 'dac']).optional(),
});

// Create a new job
router.post('/api/jobs', requireAuth, async (req, res) => {
  try {
    const parsed = createJobSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const { orderNumber, jobType, identifierType, details } = parsed.data;

    // Check for duplicate pending/running jobs with same order number and job type
    const existing = await db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.orderNumber, orderNumber),
          eq(jobs.jobType, jobType),
          or(eq(jobs.status, 'pending'), eq(jobs.status, 'running')),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({
        error: 'duplicate',
        message: `Order ${orderNumber} is already being processed.`,
      });
      return;
    }

    const maxRetries = parseInt(process.env.MAX_RETRIES || '2', 10);

    const [job] = await db
      .insert(jobs)
      .values({
        orderNumber,
        jobType,
        identifierType: identifierType || null,
        details: details || null,
        maxRetries,
      })
      .returning({
        id: jobs.id,
        orderNumber: jobs.orderNumber,
        status: jobs.status,
        jobType: jobs.jobType,
      });

    logger.info(`Job created: #${job.id} (${jobType}/${orderNumber})`);
    res.status(201).json(job);
  } catch (err) {
    logger.error('Failed to create job', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get jobs — paginated, server-side filtering + search
router.get('/api/jobs', requireAuth, async (req, res) => {
  try {
    const parsed = jobsQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const { date, jobType, status, search, cursor, limit } = parsed.data;

    // Build WHERE conditions
    const conditions = [];

    // Date filter — use local time (server and user share timezone)
    if (!search) {
      const dateStr = date || new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local tz
      const startOfDay = new Date(`${dateStr}T00:00:00`); // local midnight
      const endOfDay = new Date(`${dateStr}T23:59:59.999`); // local end of day
      conditions.push(gte(jobs.createdAt, startOfDay));
      conditions.push(lt(jobs.createdAt, endOfDay));
    }

    if (jobType) {
      conditions.push(eq(jobs.jobType, jobType));
    }

    if (status) {
      if (status === 'pending') {
        // "queued" means pending + running
        conditions.push(or(eq(jobs.status, 'pending'), eq(jobs.status, 'running')));
      } else {
        conditions.push(eq(jobs.status, status));
      }
    }

    if (search) {
      conditions.push(ilike(jobs.orderNumber, `%${search}%`));
    }

    // Cursor-based pagination: fetch items with id < cursor
    if (cursor) {
      conditions.push(lt(jobs.id, cursor));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Fetch limit + 1 to determine if there's a next page
    const rows = await db
      .select()
      .from(jobs)
      .where(where)
      .orderBy(desc(jobs.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    const response: Record<string, unknown> = { jobs: items, nextCursor, hasMore };

    // Include stats on the first page of date-filtered requests (no cursor, no search)
    if (!cursor && !search) {
      const statsDateStr = date || new Date().toLocaleDateString('en-CA');
      const statsStart = new Date(`${statsDateStr}T00:00:00`);
      const statsEnd = new Date(`${statsDateStr}T23:59:59.999`);
      const statsConditions = [gte(jobs.createdAt, statsStart), lt(jobs.createdAt, statsEnd)];
      if (jobType) statsConditions.push(eq(jobs.jobType, jobType));

      const allStatuses = await db
        .select({ status: jobs.status })
        .from(jobs)
        .where(and(...statsConditions));

      response.stats = {
        total: allStatuses.length,
        completed: allStatuses.filter((j) => j.status === 'completed').length,
        failed: allStatuses.filter((j) => j.status === 'failed').length,
        pending: allStatuses.filter((j) => j.status === 'pending').length,
        running: allStatuses.filter((j) => j.status === 'running').length,
      };
    }

    res.json(response);
  } catch (err) {
    logger.error('Failed to fetch jobs', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get stats for a date — lightweight, separate from pagination
router.get('/api/jobs/stats', requireAuth, async (req, res) => {
  try {
    const parsed = statsQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid query' });
      return;
    }

    const dateStr = parsed.data.date || new Date().toLocaleDateString('en-CA');
    const jobType = parsed.data.jobType;
    const startOfDay = new Date(`${dateStr}T00:00:00`);
    const endOfDay = new Date(`${dateStr}T23:59:59.999`);

    const conditions = [gte(jobs.createdAt, startOfDay), lt(jobs.createdAt, endOfDay)];
    if (jobType) {
      conditions.push(eq(jobs.jobType, jobType));
    }

    const where = and(...conditions);

    const allJobs = await db
      .select({ status: jobs.status })
      .from(jobs)
      .where(where);

    const stats = {
      total: allJobs.length,
      completed: allJobs.filter((j) => j.status === 'completed').length,
      failed: allJobs.filter((j) => j.status === 'failed').length,
      pending: allJobs.filter((j) => j.status === 'pending').length,
      running: allJobs.filter((j) => j.status === 'running').length,
    };

    res.json({ stats });
  } catch (err) {
    logger.error('Failed to fetch stats', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a single job by ID
router.get('/api/jobs/:id', requireAuth, async (req, res) => {
  try {
    const idParam = req.params.id;
    const id = parseInt(Array.isArray(idParam) ? idParam[0] : idParam, 10);

    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid job ID' });
      return;
    }

    const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json({ job });
  } catch (err) {
    logger.error('Failed to fetch job', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
