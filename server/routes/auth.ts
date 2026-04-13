import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { authRateLimit } from '../middleware/rateLimit';
import { requireAuth } from '../middleware/auth';

const router = Router();

// #2 fix: Fail-fast if secrets are not set
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
if (!process.env.APP_PIN) {
  throw new Error('APP_PIN environment variable is required');
}
const JWT_SECRET = process.env.JWT_SECRET;
const APP_PIN = process.env.APP_PIN;

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
