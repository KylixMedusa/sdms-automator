// dotenv must be loaded by the entry point (server/index.ts or worker/index.ts) before this module
import dns from 'dns';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// Force IPv4 — Neon has AAAA records but some hosts lack IPv6,
// causing pg to hang when Node tries IPv6 first.
dns.setDefaultResultOrder('ipv4first');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });
export { pool };
