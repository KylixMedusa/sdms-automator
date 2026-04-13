// dotenv must be loaded by the entry point (server/index.ts or worker/index.ts) before this module
import dns from 'dns';
import net from 'net';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// Force IPv4 globally — Neon has AAAA records but some hosts lack IPv6,
// causing pg to hang when Node tries IPv6 first and it black-holes.
dns.setDefaultResultOrder('ipv4first');

// Monkey-patch net.connect to force IPv4 family for pg connections
const origConnect = net.connect;
(net as any).connect = function (...args: any[]) {
  if (typeof args[0] === 'object' && args[0] !== null && !args[0].family) {
    args[0].family = 4;
  }
  return origConnect.apply(this, args as any);
};

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });
export { pool };
