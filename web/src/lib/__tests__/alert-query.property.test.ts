import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  applyQuery,
  filterAlerts,
  searchAlerts,
  sortAlerts,
} from '@/lib/alert-query';
import { EMPTY_FILTER } from '@/lib/types';
import type { Alert, AlertFilter, Severity, SortKey } from '@/lib/types';
import {
  alertsArb,
  filterArb,
  sortSpecArb,
  uniqueAlertsArb,
} from './arbitraries';

/**
 * Walks `input` and `output` in lockstep, matching by reference identity.
 * Returns whether `output` is a subsequence of `input`, plus the input
 * elements that were skipped (i.e. excluded from the output).
 */
function matchSubsequence<T>(
  input: readonly T[],
  output: readonly T[],
): { isSubsequence: boolean; excluded: T[] } {
  const excluded: T[] = [];
  let outIndex = 0;
  for (const element of input) {
    if (outIndex < output.length && output[outIndex] === element) {
      outIndex += 1;
    } else {
      excluded.push(element);
    }
  }
  return { isSubsequence: outIndex === output.length, excluded };
}

function satisfiesFilter(alert: Alert, filter: AlertFilter): boolean {
  return (
    (filter.severity === null || alert.severity === filter.severity) &&
    (filter.status === null || alert.status === filter.status) &&
    (filter.source === null || alert.source === filter.source)
  );
}

function matchesSearch(alert: Alert, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return [alert.title, alert.source, alert.id, alert.assignee ?? ''].some(
    (text) => text.toLowerCase().includes(needle),
  );
}

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
};

/** Explicit mirror of the documented comparator (ascending direction). */
function compareBySpec(a: Alert, b: Alert, key: SortKey): number {
  switch (key) {
    case 'severity':
      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    case 'createdAt':
      return Date.parse(a.createdAt) - Date.parse(b.createdAt);
    case 'title':
      return a.title.localeCompare(b.title);
    case 'status':
      return a.status.localeCompare(b.status);
    case 'source':
      return a.source.localeCompare(b.source);
  }
}

const whitespaceArb = fc.string({ unit: fc.constantFrom(' ', '\t', '\n') });

describe('filterAlerts', () => {
  it('output is an order-preserving subsequence of the input (by reference)', () => {
    fc.assert(
      fc.property(alertsArb, filterArb, (alerts, filter) => {
        const result = filterAlerts(alerts, filter);
        const { isSubsequence } = matchSubsequence(alerts, result);
        expect(isSubsequence).toBe(true);
      }),
    );
  });

  it('every output element satisfies all non-null criteria', () => {
    fc.assert(
      fc.property(alertsArb, filterArb, (alerts, filter) => {
        for (const alert of filterAlerts(alerts, filter)) {
          expect(satisfiesFilter(alert, filter)).toBe(true);
        }
      }),
    );
  });

  it('every excluded element violates at least one criterion', () => {
    fc.assert(
      fc.property(alertsArb, filterArb, (alerts, filter) => {
        const result = filterAlerts(alerts, filter);
        const { excluded } = matchSubsequence(alerts, result);
        for (const alert of excluded) {
          expect(satisfiesFilter(alert, filter)).toBe(false);
        }
      }),
    );
  });

  it('is idempotent', () => {
    fc.assert(
      fc.property(alertsArb, filterArb, (alerts, filter) => {
        const once = filterAlerts(alerts, filter);
        const twice = filterAlerts(once, filter);
        expect(twice.length).toBe(once.length);
        twice.forEach((alert, i) => expect(alert).toBe(once[i]));
      }),
    );
  });

  it('EMPTY_FILTER is the identity (same elements, same order)', () => {
    fc.assert(
      fc.property(alertsArb, (alerts) => {
        const result = filterAlerts(alerts, EMPTY_FILTER);
        expect(result.length).toBe(alerts.length);
        result.forEach((alert, i) => expect(alert).toBe(alerts[i]));
      }),
    );
  });

  it('does not mutate the input array', () => {
    fc.assert(
      fc.property(alertsArb, filterArb, (alerts, filter) => {
        const refs = [...alerts];
        const snapshot = structuredClone(alerts);
        filterAlerts(alerts, filter);
        expect(alerts.length).toBe(refs.length);
        alerts.forEach((alert, i) => expect(alert).toBe(refs[i]));
        expect(alerts).toEqual(snapshot);
      }),
    );
  });
});

describe('searchAlerts', () => {
  it('empty and whitespace-only queries are the identity', () => {
    fc.assert(
      fc.property(alertsArb, whitespaceArb, (alerts, query) => {
        for (const q of ['', query]) {
          const result = searchAlerts(alerts, q);
          expect(result.length).toBe(alerts.length);
          result.forEach((alert, i) => expect(alert).toBe(alerts[i]));
        }
      }),
    );
  });

  it('result is an order-preserving subsequence of the input', () => {
    fc.assert(
      fc.property(alertsArb, fc.string(), (alerts, query) => {
        const result = searchAlerts(alerts, query);
        const { isSubsequence } = matchSubsequence(alerts, result);
        expect(isSubsequence).toBe(true);
      }),
    );
  });

  it('every hit contains the query case-insensitively in title/source/id/assignee', () => {
    fc.assert(
      fc.property(alertsArb, fc.string(), (alerts, query) => {
        for (const alert of searchAlerts(alerts, query)) {
          expect(matchesSearch(alert, query)).toBe(true);
        }
      }),
    );
  });

  it('is case-insensitive: search(q) ≡ search(q.toUpperCase()) ≡ search(q.toLowerCase())', () => {
    fc.assert(
      fc.property(alertsArb, fc.string(), (alerts, query) => {
        const base = searchAlerts(alerts, query).map((a) => a.id);
        expect(
          searchAlerts(alerts, query.toUpperCase()).map((a) => a.id),
        ).toEqual(base);
        expect(
          searchAlerts(alerts, query.toLowerCase()).map((a) => a.id),
        ).toEqual(base);
      }),
    );
  });

  it('extending the query narrows the result set (by id)', () => {
    fc.assert(
      fc.property(
        uniqueAlertsArb,
        fc.string(),
        fc.string(),
        (alerts, query, suffix) => {
          const broad = new Set(searchAlerts(alerts, query).map((a) => a.id));
          for (const alert of searchAlerts(alerts, query + suffix)) {
            expect(broad.has(alert.id)).toBe(true);
          }
        },
      ),
    );
  });
});

describe('sortAlerts', () => {
  it('output is a permutation of the input (id multiset equality)', () => {
    fc.assert(
      fc.property(alertsArb, sortSpecArb, (alerts, sort) => {
        const result = sortAlerts(alerts, sort);
        expect(result.map((a) => a.id).sort()).toEqual(
          alerts.map((a) => a.id).sort(),
        );
      }),
    );
  });

  it('adjacent pairs are ordered per the documented comparator', () => {
    fc.assert(
      fc.property(alertsArb, sortSpecArb, (alerts, sort) => {
        const sign = sort.direction === 'asc' ? 1 : -1;
        const result = sortAlerts(alerts, sort);
        for (let i = 0; i + 1 < result.length; i += 1) {
          expect(
            sign * compareBySpec(result[i], result[i + 1], sort.key),
          ).toBeLessThanOrEqual(0);
        }
      }),
    );
  });

  it('is idempotent: sort(sort(x)) deep-equals sort(x)', () => {
    fc.assert(
      fc.property(alertsArb, sortSpecArb, (alerts, sort) => {
        const once = sortAlerts(alerts, sort);
        expect(sortAlerts(once, sort)).toEqual(once);
      }),
    );
  });

  it('does not mutate the input array', () => {
    fc.assert(
      fc.property(alertsArb, sortSpecArb, (alerts, sort) => {
        const refs = [...alerts];
        const snapshot = structuredClone(alerts);
        sortAlerts(alerts, sort);
        expect(alerts.length).toBe(refs.length);
        alerts.forEach((alert, i) => expect(alert).toBe(refs[i]));
        expect(alerts).toEqual(snapshot);
      }),
    );
  });

  it('is stable: equal-key elements keep their relative input order', () => {
    const constantField: Record<SortKey, Partial<Alert>> = {
      severity: { severity: 'high' },
      status: { status: 'open' },
      source: { source: 'Okta' },
      createdAt: { createdAt: '2024-06-01T12:00:00.000Z' },
      title: { title: 'identical title' },
    };
    fc.assert(
      fc.property(uniqueAlertsArb, sortSpecArb, (alerts, sort) => {
        const tied = alerts.map((a) => ({ ...a, ...constantField[sort.key] }));
        const result = sortAlerts(tied, sort);
        expect(result.map((a) => a.id)).toEqual(tied.map((a) => a.id));
      }),
    );
  });
});

describe('applyQuery', () => {
  const queryArb = fc.record({
    filter: filterArb,
    search: fc.string(),
    sort: sortSpecArb,
  });

  it('result elements all come from the input (by reference)', () => {
    fc.assert(
      fc.property(alertsArb, queryArb, (alerts, q) => {
        const inputRefs = new Set<Alert>(alerts);
        for (const alert of applyQuery(alerts, q)) {
          expect(inputRefs.has(alert)).toBe(true);
        }
      }),
    );
  });

  it('is deterministic: two calls deep-equal', () => {
    fc.assert(
      fc.property(alertsArb, queryArb, (alerts, q) => {
        expect(applyQuery(alerts, q)).toEqual(applyQuery(alerts, q));
      }),
    );
  });

  it('equals the composition filterAlerts → searchAlerts → sortAlerts', () => {
    fc.assert(
      fc.property(alertsArb, queryArb, (alerts, q) => {
        expect(applyQuery(alerts, q)).toEqual(
          sortAlerts(
            searchAlerts(filterAlerts(alerts, q.filter), q.search),
            q.sort,
          ),
        );
      }),
      { numRuns: 50 },
    );
  });
});
