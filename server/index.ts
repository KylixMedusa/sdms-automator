import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth';
import jobRoutes from './routes/jobs';
import settingsRoutes from './routes/settings';
import { startJobProcessor, gracefulShutdown } from './processor';
import { pool } from './db';
import logger from './utils/logger';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// CORS — restrict to CORS_ORIGIN in production, allow all in dev
const corsOrigin = process.env.CORS_ORIGIN;
app.use(
  cors({
    origin: corsOrigin
      ? corsOrigin.split(',').map((o) => o.trim())
      : true,
    credentials: true,
  }),
);
app.use(express.json());

// Health check — no auth, used by Railway
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// Routes
app.use(authRoutes);
app.use(jobRoutes);
app.use(settingsRoutes);

// Production: serve client build (only when co-located, not on Railway split deploy)
if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Start server
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);

  // Start job processor in background (non-blocking)
  startJobProcessor().catch((err) => {
    logger.error('Job processor crashed', err);
  });
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutdown signal received');
  await gracefulShutdown();
  await pool.end();
  logger.info('Database pool closed');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
