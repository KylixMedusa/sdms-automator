// All dates are local-time ISO strings (YYYY-MM-DD), which compare correctly as plain strings.

export function toISODate(date: Date): string {
  return date.toLocaleDateString('en-CA');
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10));
}

export function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function formatMonth(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

// Portal ranges exclude their end date, so [from, toExclusive) is shown as from–(toExclusive - 1).
export function formatRange(from: string, toExclusive: string): string {
  const last = addDays(toExclusive, -1);
  if (last <= from) return formatDay(from);
  if (from.slice(0, 7) === last.slice(0, 7)) return `${dayOfMonth(from)}–${formatDay(last)}`;
  return `${formatDay(from)} – ${formatDay(last)}`;
}

export function dayCount(from: string, toExclusive: string): number {
  return Math.round(
    (new Date(`${toExclusive}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000,
  );
}

// Monday-first weeks covering the whole month.
export function monthWeeks(year: number, month: number): string[][] {
  const first = new Date(year, month, 1);
  let cursor = addDays(toISODate(first), -((first.getDay() + 6) % 7));
  const lastOfMonth = toISODate(new Date(year, month + 1, 0));
  const weeks: string[][] = [];
  while (cursor <= lastOfMonth) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}
