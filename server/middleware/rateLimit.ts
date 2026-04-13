import type { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const store = new Map<string, RateLimitEntry>();

const WINDOW_MS = 60_000; // 1 minute
const MAX_ATTEMPTS = 5;

// #4 fix: Periodic cleanup to prevent memory leak from accumulated IPs
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of store) {
    if (now > entry.resetTime) {
      store.delete(ip);
    }
  }
}, 60_000);

export function authRateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now > entry.resetTime) {
    store.set(ip, { count: 1, resetTime: now + WINDOW_MS });
    next();
    return;
  }

  if (entry.count >= MAX_ATTEMPTS) {
    res.status(429).json({ error: 'Too many attempts. Try again later.' });
    return;
  }

  entry.count++;
  next();
}
