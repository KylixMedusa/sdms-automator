import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { authRateLimit } from '../middleware/rateLimit';
import { requireAuth } from '../middleware/auth';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const APP_PIN = process.env.APP_PIN || '1234';

const pinSchema = z.object({
  pin: z.string().length(4),
});

router.post('/api/auth', authRateLimit, (req, res) => {
  const parsed = pinSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }

  const { pin } = parsed.data;

  if (pin !== APP_PIN) {
    res.status(401).json({ error: 'Invalid PIN' });
    return;
  }

  const token = jwt.sign({ role: 'user' }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

router.get('/api/me', requireAuth, (_req, res) => {
  res.json({ ok: true });
});

export default router;
