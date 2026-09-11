// S-05 (frozen contract): DB timestamps = UTC (timestamptz). Business "day"/
// "week" boundaries are computed in the LOCATION's IANA timezone
// (locations.timezone). Mirrors the DB helper public.local_day().
//
// These helpers let a server route compute a UTC ISO range for [localDay,
// localDay+1) without depending on the server's or browser's local timezone.

const DAY_MS = 86_400_000;

/**
 * Format a UTC instant as YYYY-MM-DD in the given IANA timezone.
 * `tz` empty/invalid → server (system) timezone, matching the DB fallback.
 */
export function dayInTz(date: Date, tz?: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * UTC millisecond timestamp of local midnight (00:00) of the given
 * Y/M/D calendar date in IANA timezone `tz`. Exact IANA math (handles
 * DST transitions); invalid tz falls back to UTC.
 */
function localMidnightUtcMs(y: number, m: number, d: number, tz?: string | null): number {
  const utcGuess = Date.UTC(y, m - 1, d);
  let offsetMs: number;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz || undefined,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(utcGuess));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
    offsetMs = asUtc - utcGuess;
  } catch {
    offsetMs = 0;
  }
  return utcGuess - offsetMs;
}

/**
 * UTC ISO boundary for the local `date` at 00:00 in `tz`, plus one day.
 * Returns [startIso, endIso) for use as a timestamptz range filter.
 */
export function localDayRange(date: Date, tz?: string | null): { start: string; end: string } {
  const d = dayInTz(date, tz).split('-').map(Number);
  const next = new Date(Date.UTC(d[0], d[1] - 1, d[2] + 1)); // local next calendar date
  const ny = next.getUTCFullYear();
  const nm = next.getUTCMonth() + 1;
  const nd = next.getUTCDate();
  const start = localMidnightUtcMs(d[0], d[1], d[2], tz);
  const end = localMidnightUtcMs(ny, nm, nd, tz); // DST days are 23h/25h, not 24h
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

/**
 * UTC ISO [start,end) for the ISO week (Monday 00:00 → next Monday 00:00)
 * containing the local `date` in `tz`. Matches get_time_clock_status.
 */
export function localWeekRange(date: Date, tz?: string | null): { start: string; end: string } {
  const d = dayInTz(date, tz).split('-').map(Number);
  const dayAtNoonUtc = new Date(Date.UTC(d[0], d[1] - 1, d[2], 12, 0, 0, 0));
  const weekday = (dayAtNoonUtc.getUTCDay() + 6) % 7; // 0 = Monday
  const monday = d[2] - weekday;
  return {
    start: new Date(localMidnightUtcMs(d[0], d[1], monday, tz)).toISOString(),
    end: new Date(localMidnightUtcMs(d[0], d[1], monday, tz) + 7 * DAY_MS).toISOString(),
  };
}
