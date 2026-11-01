import { getPortalSettings } from '../api/client';
import type { PortalSettings } from '../types';

// Kept across opens so the accounts drawer shows data immediately and only revalidates in the background.
let cached: PortalSettings | null = null;
let inflight: Promise<PortalSettings> | null = null;

export function cachedPortalSettings(): PortalSettings | null {
  return cached;
}

export function setCachedPortalSettings(settings: PortalSettings): void {
  cached = settings;
}

export function loadPortalSettings(): Promise<PortalSettings> {
  inflight ??= getPortalSettings()
    .then((s) => {
      cached = s;
      return s;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
