import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../shared/db';
import { jobs } from '../../shared/db/schema';
import { eq, and, or, sql } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import logger from '../../shared/utils/logger';

const router = Router();

// For return/cancel jobs, `details` carries JSON:
// { toDate, startAfterOrderNumber?, includeOrderNumbers?, excludeOrderNumbers?, useDeliveryBoy?, toolUsername? }
const orderNumberList = z.array(z.string().trim().min(1)).max(500).optional();
const returnDetailsSchema = z.object({
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'To date must be a valid date (YYYY-MM-DD)'),
  startAfterOrderNumber: z.string().min(1).optional(),
  includeOrderNumbers: orderNumberList,
  excludeOrderNumbers: orderNumberList,
  useDeliveryBoy: z.boolean().optional(),
  toolUsername: z.string().trim().min(1).optional(),
});

function parseReturnDetails(details: string | undefined): ReturnType<typeof returnDetailsSchema.safeParse> {
  try {
    return returnDetailsSchema.safeParse(JSON.parse(details || ''));
  } catch {
    return returnDetailsSchema.safeParse(undefined);
  }
}

const createJobSchema = z
  .object({
    orderNumber: z.string().min(1, 'Order number is required'),
    jobType: z.enum(['return', 'cancel']),
    details: z.string().optional(),
  })
  .refine(
    (data) => /^\d{4}-\d{2}-\d{2}$/.test(data.orderNumber),
    { message: 'From date must be a valid date (YYYY-MM-DD)', path: ['orderNumber'] },
  )
  .refine(
    (data) => parseReturnDetails(data.details).success,
    { message: 'To date must be a valid date (YYYY-MM-DD)', path: ['details'] },
  )
  .refine(
    (data) => {
      const parsed = parseReturnDetails(data.details);
      return !parsed.success || parsed.data.toDate > data.orderNumber;
    },
    { message: 'To date must be after from date', path: ['details'] },
  );

type OrderStatus = 'done' | 'already_done' | 'failed';

// A cancelled order drops out of the portal query, so an empty cancel-verify query
// means every order in the job is cancelled — including ones whose attempt errored.
function cancelVerifiedEmpty(jobType: string, resultMessage: string | null): boolean {
  return jobType === 'cancel' && !!resultMessage?.includes('query is empty') && !resultMessage.includes('STILL LISTED');
}

// Collapses processed_orders' per-attempt history into one row per order: latest failure wins,
// otherwise 'done' if this app set the reason at any point, else 'already_done'.
function summarizeOrders(raw: string | null, cleared = false) {
  let history: Array<{ orderNumber: string; outcome: string }> = [];
  try {
    history = raw ? JSON.parse(raw) : [];
  } catch {
    history = [];
  }

  const byOrder = new Map<string, { latest: string; setByUs: boolean }>();
  for (const { orderNumber, outcome } of history) {
    const entry = byOrder.get(orderNumber) ?? { latest: outcome, setByUs: false };
    entry.latest = outcome;
    if (outcome === 'set_reason' || outcome === 'reapplied') entry.setByUs = true;
    byOrder.set(orderNumber, entry);
  }

  const orders = [...byOrder.entries()].map(([orderNumber, { latest, setByUs }]) => ({
    orderNumber,
    status: (latest === 'failed' ? (cleared ? 'done' : 'failed') : setByUs ? 'done' : 'already_done') as OrderStatus,
    verified: cleared || latest === 'verified' || latest === 'reapplied',
  }));
  const counts = {
    total: orders.length,
    done: orders.filter((o) => o.status === 'done').length,
    alreadyDone: orders.filter((o) => o.status === 'already_done').length,
    failed: orders.filter((o) => o.status === 'failed').length,
    verified: orders.filter((o) => o.verified).length,
  };
  return { orders, counts };
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA');
}

const calendarQuerySchema = z.object({
  jobType: z.enum(['return', 'cancel']),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});


// Create a new job
router.post('/api/jobs', requireAuth, async (req, res) => {
  try {
    const parsed = createJobSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const { orderNumber, jobType, details } = parsed.data;

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

// Jobs whose order-date range [fromDate, toDate) overlaps [from, to) — feeds the calendar view
router.get('/api/jobs/calendar', requireAuth, async (req, res) => {
  try {
    const parsed = calendarQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { jobType, from, to } = parsed.data;

    // order_number holds the ISO from-date, so plain text comparison works; the 1-year lookback
    // bounds the scan for ranges that started long before the window. Order counts are aggregated
    // here so processed_orders (the bulk of each row) never leaves the database.
    const result = await db.execute(sql`
      SELECT j.id, j.order_number, j.details, j.status, j.cancel_requested, j.error_message,
        j.error_screenshot IS NOT NULL AS has_screenshot, j.created_at, j.started_at, j.completed_at,
        (j.job_type = 'cancel' AND j.result_message LIKE '%query is empty%' AND j.result_message NOT LIKE '%STILL LISTED%') AS cleared,
        coalesce(c.total, 0) AS total, coalesce(c.done, 0) AS done, coalesce(c.already, 0) AS already,
        coalesce(c.failed, 0) AS failed, coalesce(c.verified, 0) AS verified
      FROM jobs j
      LEFT JOIN LATERAL (
        SELECT count(*) AS total,
          count(*) FILTER (WHERE latest = 'failed') AS failed,
          count(*) FILTER (WHERE latest <> 'failed' AND set_by_us) AS done,
          count(*) FILTER (WHERE latest <> 'failed' AND NOT set_by_us) AS already,
          count(*) FILTER (WHERE latest IN ('verified', 'reapplied')) AS verified
        FROM (
          SELECT (array_agg(e.value->>'outcome' ORDER BY e.ord DESC))[1] AS latest,
            bool_or(e.value->>'outcome' IN ('set_reason', 'reapplied')) AS set_by_us
          FROM jsonb_array_elements(coalesce(j.processed_orders, '[]')::jsonb) WITH ORDINALITY e(value, ord)
          GROUP BY e.value->>'orderNumber'
        ) per_order
      ) c ON true
      WHERE j.job_type = ${jobType} AND j.order_number < ${to} AND j.order_number >= ${addDays(from, -366)}
      ORDER BY j.id
    `);

    const items = (result.rows as Record<string, unknown>[]).flatMap((row) => {
      const fromDate = row.order_number as string;
      const parsedDetails = parseReturnDetails((row.details as string | null) ?? undefined);
      const toDate = parsedDetails.success ? parsedDetails.data.toDate : addDays(fromDate, 1);
      if (toDate <= from) return [];
      const n = (key: string) => Number(row[key]);
      const cleared = row.cleared === true;
      return [{
        id: row.id as number,
        status: row.status,
        fromDate,
        toDate,
        filtered: parsedDetails.success && !!(parsedDetails.data.includeOrderNumbers?.length || parsedDetails.data.startAfterOrderNumber),
        cancelRequested: row.cancel_requested,
        errorMessage: row.error_message,
        hasScreenshot: row.has_screenshot,
        createdAt: row.created_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        counts: {
          total: n('total'),
          done: cleared ? n('done') + n('failed') : n('done'),
          alreadyDone: n('already'),
          failed: cleared ? 0 : n('failed'),
          verified: cleared ? n('total') : n('verified'),
        },
      }];
    });

    res.json({ jobs: items });
  } catch (err) {
    logger.error('Failed to fetch calendar jobs', err);
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

    const [row] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);

    if (!row) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const { errorScreenshot, processedOrders, ...job } = row;
    const summary = summarizeOrders(processedOrders, cancelVerifiedEmpty(job.jobType, job.resultMessage));
    res.json({ job: { ...job, hasScreenshot: !!errorScreenshot, ...summary } });
  } catch (err) {
    logger.error('Failed to fetch job', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cancel a job — a pending job is killed immediately, a running job is
// flagged and stops itself at its next check point (see return.ts).
router.post('/api/jobs/:id/cancel', requireAuth, async (req, res) => {
  try {
    const idParam = req.params.id;
    const id = parseInt(Array.isArray(idParam) ? idParam[0] : idParam, 10);
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid job ID' }); return; }

    const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
    if (!job) { res.status(404).json({ error: 'Job not found' }); return; }

    if (job.status === 'completed' || job.status === 'failed') {
      res.status(409).json({ error: 'Job has already finished' });
      return;
    }

    if (job.status === 'pending') {
      await db
        .update(jobs)
        .set({ status: 'failed', errorMessage: 'Cancelled by user', completedAt: new Date() })
        .where(eq(jobs.id, id));
    } else {
      await db.update(jobs).set({ cancelRequested: true }).where(eq(jobs.id, id));
    }

    logger.info(`Job #${id} cancel requested (was ${job.status})`);
    res.json({ ok: true });
  } catch (err) {
    logger.error('Failed to cancel job', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get error screenshot for a job (raw image)
router.get('/api/jobs/:id/screenshot', requireAuth, async (req, res) => {
  try {
    const idParam = req.params.id;
    const id = parseInt(Array.isArray(idParam) ? idParam[0] : idParam, 10);
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid job ID' }); return; }

    const [job] = await db
      .select({ errorScreenshot: jobs.errorScreenshot })
      .from(jobs)
      .where(eq(jobs.id, id))
      .limit(1);

    if (!job?.errorScreenshot) {
      res.status(404).json({ error: 'No screenshot available' });
      return;
    }

    // errorScreenshot is "data:image/png;base64,..." — extract the base64 part
    const base64 = job.errorScreenshot.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    logger.error('Failed to fetch screenshot', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
