import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { getSettings, setSetting } from '../../shared/utils/settings';
import { getPortalSettings, setPortalAccounts, setPortalUrl } from '../../shared/utils/accounts';

const router = Router();

const updatePortalSettingsSchema = z.object({
  toolUrl: z.string().url().optional(),
  accounts: z
    .array(z.object({ username: z.string().trim().min(1, 'Username is required'), password: z.string().min(1, 'Password is required') }))
    .max(20)
    .refine((list) => new Set(list.map((a) => a.username)).size === list.length, { message: 'Usernames must be unique' })
    .optional(),
});

// GET /api/settings/portal
router.get('/api/settings/portal', requireAuth, async (_req, res) => {
  try {
    const { url, accounts } = await getPortalSettings();
    res.json({ toolUrl: url || '', accounts });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/settings/portal — `accounts` replaces the whole list
router.put('/api/settings/portal', requireAuth, async (req, res) => {
  try {
    const parsed = updatePortalSettingsSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const { toolUrl, accounts } = parsed.data;
    const updates: Promise<void>[] = [];

    if (toolUrl !== undefined) updates.push(setPortalUrl(toolUrl));
    if (accounts !== undefined) updates.push(setPortalAccounts(accounts));

    await Promise.all(updates);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

const updateReturnSettingsSchema = z.object({
  deliveryBoy: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
});

// GET /api/settings/return
router.get('/api/settings/return', requireAuth, async (_req, res) => {
  try {
    const values = await getSettings(['return.delivery_boy', 'return.reason']);
    res.json({
      deliveryBoy: values.get('return.delivery_boy') ?? '',
      reason: values.get('return.reason') ?? '',
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/settings/return
router.put('/api/settings/return', requireAuth, async (req, res) => {
  try {
    const parsed = updateReturnSettingsSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const { deliveryBoy, reason } = parsed.data;
    const updates: Promise<void>[] = [];

    if (deliveryBoy !== undefined) updates.push(setSetting('return.delivery_boy', deliveryBoy));
    if (reason !== undefined) updates.push(setSetting('return.reason', reason));

    await Promise.all(updates);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
