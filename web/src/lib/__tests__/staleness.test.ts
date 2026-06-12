import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { STALE_SLA_HOURS, formatAge, isStale, slaRatio } from '@/lib/staleness';
import { SEVERITIES, STATUSES } from '@/lib/types';
import type { Alert, Severity, Status } from '@/lib/types';
import { alertArb } from './arbitraries';

const NOW = Date.parse('2026-06-12T12:00:00.000Z');
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 'AL-0001',
    title: 'Suspicious login burst',
    severity: 'critical',
    status: 'open',
    source: 'Okta',
    createdAt: new Date(NOW - HOUR_MS).toISOString(),
    assignee: null,
    ...overrides,
  };
}

function createdAgo(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

describe('STALE_SLA_HOURS', () => {
  it('matches the documented SLA windows', () => {
    expect(STALE_SLA_HOURS).toEqual({
      critical: 2,
      high: 8,
      medium: 24,
      low: 72,
    });
  });
});

describe('isStale', () => {
  it('critical/open: 1h59m old is not stale, 2h01m old is stale', () => {
    const fresh = makeAlert({ createdAt: createdAgo(2 * HOUR_MS - MINUTE_MS) });
    const overdue = makeAlert({
      createdAt: createdAgo(2 * HOUR_MS + MINUTE_MS),
    });
    expect(isStale(fresh, NOW)).toBe(false);
    expect(isStale(overdue, NOW)).toBe(true);
  });

  it('age exactly equal to the SLA is not stale (strictly greater than)', () => {
    const atBoundary = makeAlert({ createdAt: createdAgo(2 * HOUR_MS) });
    expect(isStale(atBoundary, NOW)).toBe(false);
  });

  it.each(SEVERITIES)(
    '%s/open: just inside the SLA is fresh, just past it is stale',
    (severity: Severity) => {
      const slaMs = STALE_SLA_HOURS[severity] * HOUR_MS;
      const inside = makeAlert({
        severity,
        createdAt: createdAgo(slaMs - MINUTE_MS),
      });
      const past = makeAlert({
        severity,
        createdAt: createdAgo(slaMs + MINUTE_MS),
      });
      expect(isStale(inside, NOW)).toBe(false);
      expect(isStale(past, NOW)).toBe(true);
    },
  );

  it.each(['acknowledged', 'resolved', 'false_positive'] as Status[])(
    '%s alerts are never stale, even far past the SLA',
    (status: Status) => {
      const ancient = makeAlert({ status, createdAt: createdAgo(30 * DAY_MS) });
      expect(isStale(ancient, NOW)).toBe(false);
    },
  );

  it('property: any alert with status !== open is never stale', () => {
    const nonOpenAlertArb = fc
      .tuple(alertArb, fc.constantFrom(...STATUSES.filter((s) => s !== 'open')))
      .map(([alert, status]) => ({ ...alert, status }));
    fc.assert(
      fc.property(
        nonOpenAlertArb,
        fc.integer({
          min: Date.parse('2000-01-01T00:00:00.000Z'),
          max: Date.parse('2050-01-01T00:00:00.000Z'),
        }),
        (alert, now) => {
          expect(isStale(alert, now)).toBe(false);
        },
      ),
    );
  });
});

describe('slaRatio', () => {
  const nowArb = fc.integer({
    min: Date.parse('2000-01-01T00:00:00.000Z'),
    max: Date.parse('2050-01-01T00:00:00.000Z'),
  });
  const openAlertArb = alertArb.map(
    (alert): Alert => ({ ...alert, status: 'open' }),
  );

  it('is the consumed fraction of the SLA window for open alerts', () => {
    const halfway = makeAlert({ createdAt: createdAgo(HOUR_MS) });
    expect(slaRatio(halfway, NOW)).toBe(0.5);
    const lowQuarter = makeAlert({
      severity: 'low',
      createdAt: createdAgo(18 * HOUR_MS),
    });
    expect(slaRatio(lowQuarter, NOW)).toBe(0.25);
  });

  it('property: null iff the alert is not open', () => {
    fc.assert(
      fc.property(alertArb, nowArb, (alert, now) => {
        expect(slaRatio(alert, now) === null).toBe(alert.status !== 'open');
      }),
    );
  });

  it('property: ratio above 1 exactly when the alert is stale', () => {
    fc.assert(
      fc.property(openAlertArb, nowArb, (alert, now) => {
        expect(slaRatio(alert, now)! > 1).toBe(isStale(alert, now));
      }),
    );
  });

  it('property: strictly increases as time passes', () => {
    fc.assert(
      fc.property(
        openAlertArb,
        fc.uniqueArray(nowArb, { minLength: 2, maxLength: 2 }),
        (alert, nows) => {
          const [earlier, later] = [...nows].sort((a, b) => a - b);
          expect(slaRatio(alert, later)!).toBeGreaterThan(
            slaRatio(alert, earlier)!,
          );
        },
      ),
    );
  });
});

describe('formatAge', () => {
  it("returns '<1m' under a minute", () => {
    expect(formatAge(createdAgo(0), NOW)).toBe('<1m');
    expect(formatAge(createdAgo(30_000), NOW)).toBe('<1m');
    expect(formatAge(createdAgo(MINUTE_MS - 1), NOW)).toBe('<1m');
  });

  it("clamps future timestamps to '<1m'", () => {
    expect(formatAge(new Date(NOW + HOUR_MS).toISOString(), NOW)).toBe('<1m');
    expect(formatAge(new Date(NOW + 3 * DAY_MS).toISOString(), NOW)).toBe(
      '<1m',
    );
  });

  it('formats minutes, floored', () => {
    expect(formatAge(createdAgo(MINUTE_MS), NOW)).toBe('1m');
    expect(formatAge(createdAgo(5 * MINUTE_MS + 30_000), NOW)).toBe('5m');
    expect(formatAge(createdAgo(59 * MINUTE_MS), NOW)).toBe('59m');
  });

  it('formats hours, floored', () => {
    expect(formatAge(createdAgo(HOUR_MS), NOW)).toBe('1h');
    expect(formatAge(createdAgo(3 * HOUR_MS + 59 * MINUTE_MS), NOW)).toBe('3h');
    expect(formatAge(createdAgo(23 * HOUR_MS), NOW)).toBe('23h');
  });

  it('formats days, floored', () => {
    expect(formatAge(createdAgo(DAY_MS), NOW)).toBe('1d');
    expect(formatAge(createdAgo(2 * DAY_MS + 12 * HOUR_MS), NOW)).toBe('2d');
  });

  it('property: never returns a negative-looking value', () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date('2020-01-01'),
          max: new Date('2030-01-01'),
          noInvalidDate: true,
        }),
        fc.integer({
          min: Date.parse('2020-01-01T00:00:00.000Z'),
          max: Date.parse('2030-01-01T00:00:00.000Z'),
        }),
        (created, now) => {
          const result = formatAge(created.toISOString(), now);
          expect(result).toMatch(/^(<1m|\d+m|\d+h|\d+d)$/);
          expect(result).not.toContain('-');
        },
      ),
    );
  });
});
