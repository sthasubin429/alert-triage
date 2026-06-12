import type { Alert, Severity } from '@/lib/types';

/** Hours an open alert may sit before it is considered stale, by severity. */
export const STALE_SLA_HOURS: Record<Severity, number> = {
  critical: 2,
  high: 8,
  medium: 24,
  low: 72,
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * True iff the alert is still open and has exceeded the SLA window
 * for its severity at the given time.
 */
export function isStale(alert: Alert, now: number): boolean {
  if (alert.status !== 'open') {
    return false;
  }
  const ageMs = now - Date.parse(alert.createdAt);
  return ageMs > STALE_SLA_HOURS[alert.severity] * HOUR_MS;
}

/**
 * Compact age string using the largest applicable unit, floored:
 * '<1m', '5m', '3h', '2d'. Future timestamps clamp to '<1m'.
 */
export function formatAge(createdAt: string, now: number): string {
  const ageMs = now - Date.parse(createdAt);
  if (ageMs < MINUTE_MS) {
    return '<1m';
  }
  if (ageMs < HOUR_MS) {
    return `${Math.floor(ageMs / MINUTE_MS)}m`;
  }
  if (ageMs < DAY_MS) {
    return `${Math.floor(ageMs / HOUR_MS)}h`;
  }
  return `${Math.floor(ageMs / DAY_MS)}d`;
}
