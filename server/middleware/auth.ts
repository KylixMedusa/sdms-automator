import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// #2 fix: Fail-fast if JWT_SECRET is not set
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
const JWT_SECRET = process.env.JWT_SECRET;

export interface AuthPayload {
  role: string;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    (req as Request & { user: AuthPayload }).user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}
