import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { getSetting, setSetting } from '../../shared/utils/settings';

const router = Router();

const updateSettingsSchema = z.object({
  toolUrl: z.string().url().optional(),
  toolUsername: z.string().min(1).optional(),
  toolPassword: z.string().min(1).optional(),
});

// GET /api/settings/cash_memo
router.get('/api/settings/cash_memo', requireAuth, async (_req, res) => {
  try {
    const [toolUrl, toolUsername, toolPassword] = await Promise.all([
      getSetting('cash_memo.tool_url'),
      getSetting('cash_memo.tool_username'),
      getSetting('cash_memo.tool_password'),
    ]);

    res.json({
      toolUrl: toolUrl || '',
      toolUsername: toolUsername || '',
      toolPassword: toolPassword || '',
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/settings/cash_memo
router.put('/api/settings/cash_memo', requireAuth, async (req, res) => {
  try {
    const parsed = updateSettingsSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const { toolUrl, toolUsername, toolPassword } = parsed.data;
    const updates: Promise<void>[] = [];

    if (toolUrl !== undefined) updates.push(setSetting('cash_memo.tool_url', toolUrl));
    if (toolUsername !== undefined) updates.push(setSetting('cash_memo.tool_username', toolUsername));
    if (toolPassword !== undefined) updates.push(setSetting('cash_memo.tool_password', toolPassword));

    await Promise.all(updates);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
