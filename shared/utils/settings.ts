import { db } from '../db';
import { settings } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);

  return row?.value ?? null;
}

// One round trip for several keys; missing keys are absent from the result.
export async function getSettings(keys: string[]): Promise<Map<string, string>> {
  const rows = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, keys));
  return new Map(rows.map((r) => [r.key, r.value]));
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() },
    });
}
