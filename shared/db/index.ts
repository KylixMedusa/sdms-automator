// dotenv must be loaded by the entry point (server/index.ts or worker/index.ts) before this module
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

const sql = neon(process.env.DATABASE_URL!);

export const db = drizzle(sql, { schema });

// Dummy pool object for backwards compat (graceful shutdown calls pool.end())
export const pool = { end: async () => {} };
