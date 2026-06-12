import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { initialTriageState, triageReducer } from '@/lib/triage-reducer';
import type { TriageState } from '@/lib/triage-reducer';
import { SEVERITIES, SOURCES, STATUSES } from '@/lib/types';
import type { Alert } from '@/lib/types';
import {
  alertArb,
  filterArb,
  sortDirectionArb,
  sortKeyArb,
  sortSpecArb,
  uniqueAlertsArb,
} from './arbitraries';

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

function makeState(alerts: readonly Alert[]): TriageState {
  // Clone the filter so deep-freezing a state never freezes the shared
  // EMPTY_FILTER module constant.
  return {
    ...initialTriageState(alerts),
    filter: { severity: [], status: [], source: [] },
  };
}

const nonEmptyUniqueAlertsArb = fc.uniqueArray(alertArb, {
  selector: (a) => a.id,
  minLength: 1,
});

/** (alerts, index of target alert, new status) */
const setStatusCaseArb = nonEmptyUniqueAlertsArb.chain((alerts) =>
  fc.tuple(
    fc.constant(alerts),
    fc.nat({ max: alerts.length - 1 }),
    fc.constantFrom(...STATUSES),
  ),
);

describe('triageReducer SET_STATUS', () => {
  it('keeps length and id sequence; changes only the target status; non-targets stay reference-equal', () => {
    fc.assert(
      fc.property(setStatusCaseArb, ([alerts, index, status]) => {
        const state = makeState(alerts);
        const target = state.alerts[index];
        const next = triageReducer(state, {
          type: 'SET_STATUS',
          id: target.id,
          status,
        });

        expect(next.alerts.length).toBe(state.alerts.length);
        expect(next.alerts.map((a) => a.id)).toEqual(
          state.alerts.map((a) => a.id),
        );
        expect(next.alerts[index]).toEqual({ ...target, status });
        next.alerts.forEach((alert, i) => {
          if (i !== index) {
            expect(alert).toBe(state.alerts[i]);
          }
        });
      }),
    );
  });

  it('returns the same state reference for an unknown id', () => {
    fc.assert(
      fc.property(
        uniqueAlertsArb,
        fc.string({ minLength: 1 }),
        fc.constantFrom(...STATUSES),
        (alerts, unknownId, status) => {
          fc.pre(!alerts.some((a) => a.id === unknownId));
          const state = makeState(alerts);
          const next = triageReducer(state, {
            type: 'SET_STATUS',
            id: unknownId,
            status,
          });
          expect(next).toBe(state);
        },
      ),
    );
  });

  it('is idempotent: applying twice deep-equals applying once', () => {
    fc.assert(
      fc.property(setStatusCaseArb, ([alerts, index, status]) => {
        const state = makeState(alerts);
        const action = {
          type: 'SET_STATUS',
          id: alerts[index].id,
          status,
        } as const;
        const once = triageReducer(state, action);
        const twice = triageReducer(once, action);
        expect(twice).toEqual(once);
      }),
    );
  });

  it('never mutates the prior state (deep-frozen state does not throw)', () => {
    fc.assert(
      fc.property(setStatusCaseArb, ([alerts, index, status]) => {
        const state = deepFreeze(makeState(structuredClone(alerts)));
        expect(() =>
          triageReducer(state, {
            type: 'SET_STATUS',
            id: alerts[index].id,
            status,
          }),
        ).not.toThrow();
      }),
      { numRuns: 50 },
    );
  });
});

describe('triageReducer MOVE_SELECTION', () => {
  const visibleIdsArb = fc.uniqueArray(fc.string());
  const deltaArb = fc.constantFrom<1 | -1>(1, -1);

  it('leaves state unchanged (same reference) when visibleIds is empty', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string(), { nil: null }),
        deltaArb,
        (selectedId, delta) => {
          const state = { ...makeState([]), selectedId };
          expect(
            triageReducer(state, {
              type: 'MOVE_SELECTION',
              delta,
              visibleIds: [],
            }),
          ).toBe(state);
        },
      ),
    );
  });

  it('result selectedId is null only if visibleIds is empty', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string(), { nil: null }),
        deltaArb,
        visibleIdsArb,
        (selectedId, delta, visibleIds) => {
          const state = { ...makeState([]), selectedId };
          const next = triageReducer(state, {
            type: 'MOVE_SELECTION',
            delta,
            visibleIds,
          });
          if (visibleIds.length === 0) {
            expect(next.selectedId).toBe(selectedId);
          } else {
            expect(next.selectedId).not.toBeNull();
          }
        },
      ),
    );
  });

  it('selects first (delta 1) or last (delta -1) when selection is null or not visible', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string(), { nil: null }),
        deltaArb,
        visibleIdsArb,
        (selectedId, delta, visibleIds) => {
          fc.pre(visibleIds.length > 0);
          fc.pre(selectedId === null || !visibleIds.includes(selectedId));
          const state = { ...makeState([]), selectedId };
          const next = triageReducer(state, {
            type: 'MOVE_SELECTION',
            delta,
            visibleIds,
          });
          expect(next.selectedId).toBe(
            delta === 1 ? visibleIds[0] : visibleIds[visibleIds.length - 1],
          );
        },
      ),
    );
  });

  it('moves by delta and clamps at the ends (no wrap)', () => {
    fc.assert(
      fc.property(
        visibleIdsArb.filter((ids) => ids.length > 0),
        deltaArb,
        fc.nat(),
        (visibleIds, delta, seed) => {
          const index = seed % visibleIds.length;
          const state = { ...makeState([]), selectedId: visibleIds[index] };
          const next = triageReducer(state, {
            type: 'MOVE_SELECTION',
            delta,
            visibleIds,
          });
          const expected = Math.min(
            Math.max(index + delta, 0),
            visibleIds.length - 1,
          );
          expect(next.selectedId).toBe(visibleIds[expected]);
        },
      ),
    );
  });

  it('never opens the drawer', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string(), { nil: null }),
        fc.boolean(),
        deltaArb,
        visibleIdsArb,
        (selectedId, drawerOpen, delta, visibleIds) => {
          const state = { ...makeState([]), selectedId, drawerOpen };
          const next = triageReducer(state, {
            type: 'MOVE_SELECTION',
            delta,
            visibleIds,
          });
          expect(next.drawerOpen).toBe(drawerOpen);
        },
      ),
    );
  });
});

describe('triageReducer SET_SORT', () => {
  it('toggles direction when the key is unchanged', () => {
    fc.assert(
      fc.property(sortKeyArb, sortDirectionArb, (key, direction) => {
        const state = { ...makeState([]), sort: { key, direction } };
        const next = triageReducer(state, { type: 'SET_SORT', key });
        expect(next.sort).toEqual({
          key,
          direction: direction === 'asc' ? 'desc' : 'asc',
        });
      }),
    );
  });

  it('applies the documented default direction for a new key', () => {
    fc.assert(
      fc.property(sortSpecArb, sortKeyArb, (sort, key) => {
        fc.pre(sort.key !== key);
        const state = { ...makeState([]), sort };
        const next = triageReducer(state, { type: 'SET_SORT', key });
        expect(next.sort).toEqual({
          key,
          direction: key === 'createdAt' || key === 'severity' ? 'desc' : 'asc',
        });
      }),
    );
  });
});

describe('triageReducer SET_FILTER / TOGGLE_FILTER / SET_SEARCH', () => {
  const partialFilterArb = fc.record(
    {
      severity: fc.subarray([...SEVERITIES]),
      status: fc.subarray([...STATUSES]),
      source: fc.subarray([...SOURCES]),
    },
    { requiredKeys: [] },
  );

  const filterToggleArb = fc.oneof(
    fc.record({
      key: fc.constant('severity' as const),
      value: fc.constantFrom(...SEVERITIES),
    }),
    fc.record({
      key: fc.constant('status' as const),
      value: fc.constantFrom(...STATUSES),
    }),
    fc.record({
      key: fc.constant('source' as const),
      value: fc.constantFrom(...SOURCES),
    }),
  );

  it('SET_FILTER merges the partial filter into the existing filter', () => {
    fc.assert(
      fc.property(filterArb, partialFilterArb, (filter, partial) => {
        const state = { ...makeState([]), filter };
        const next = triageReducer(state, {
          type: 'SET_FILTER',
          filter: partial,
        });
        expect(next.filter).toEqual({ ...filter, ...partial });
        expect(state.filter).toEqual(filter);
      }),
    );
  });

  it('TOGGLE_FILTER flips membership of exactly that value in that criterion', () => {
    fc.assert(
      fc.property(filterArb, filterToggleArb, (filter, toggle) => {
        const state = deepFreeze({ ...makeState([]), filter });
        const next = triageReducer(state, {
          type: 'TOGGLE_FILTER',
          ...toggle,
        });

        const wasActive = (filter[toggle.key] as readonly string[]).includes(
          toggle.value,
        );
        const nowActive = (
          next.filter[toggle.key] as readonly string[]
        ).includes(toggle.value);
        expect(nowActive).toBe(!wasActive);

        // every other value of the toggled criterion keeps its membership
        for (const other of next.filter[toggle.key]) {
          if (other !== toggle.value) {
            expect(filter[toggle.key] as readonly string[]).toContain(other);
          }
        }
        // the two untouched criteria are reference-equal
        for (const key of ['severity', 'status', 'source'] as const) {
          if (key !== toggle.key) {
            expect(next.filter[key]).toBe(filter[key]);
          }
        }
      }),
    );
  });

  it('TOGGLE_FILTER twice restores the original membership set', () => {
    fc.assert(
      fc.property(filterArb, filterToggleArb, (filter, toggle) => {
        const state = { ...makeState([]), filter };
        const action = { type: 'TOGGLE_FILTER' as const, ...toggle };
        const twice = triageReducer(triageReducer(state, action), action);
        expect([...twice.filter[toggle.key]].sort()).toEqual(
          [...filter[toggle.key]].sort(),
        );
      }),
    );
  });

  it('SET_SEARCH sets search and leaves everything else untouched', () => {
    fc.assert(
      fc.property(uniqueAlertsArb, fc.string(), (alerts, search) => {
        const state = makeState(alerts);
        const next = triageReducer(state, { type: 'SET_SEARCH', search });
        expect(next.search).toBe(search);
        expect(next.alerts).toBe(state.alerts);
        expect(next.filter).toBe(state.filter);
        expect(next.sort).toBe(state.sort);
        expect(next.selectedId).toBe(state.selectedId);
        expect(next.drawerOpen).toBe(state.drawerOpen);
      }),
    );
  });
});

describe('triageReducer SELECT / CLOSE_DRAWER', () => {
  it('SELECT with a non-null id selects it and opens the drawer', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.boolean(),
        (id, drawerOpen) => {
          const state = { ...makeState([]), drawerOpen };
          const next = triageReducer(state, { type: 'SELECT', id });
          expect(next.selectedId).toBe(id);
          expect(next.drawerOpen).toBe(true);
        },
      ),
    );
  });

  it('SELECT null clears the selection and closes the drawer', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string(), { nil: null }),
        fc.boolean(),
        (selectedId, drawerOpen) => {
          const state = { ...makeState([]), selectedId, drawerOpen };
          const next = triageReducer(state, { type: 'SELECT', id: null });
          expect(next.selectedId).toBeNull();
          expect(next.drawerOpen).toBe(false);
        },
      ),
    );
  });

  it('CLOSE_DRAWER only closes the drawer and keeps the selection', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string(), { nil: null }),
        fc.boolean(),
        (selectedId, drawerOpen) => {
          const state = { ...makeState([]), selectedId, drawerOpen };
          const next = triageReducer(state, { type: 'CLOSE_DRAWER' });
          expect(next.drawerOpen).toBe(false);
          expect(next.selectedId).toBe(selectedId);
        },
      ),
    );
  });
});

describe('initialTriageState', () => {
  it('copies the alerts and starts with the documented defaults', () => {
    fc.assert(
      fc.property(uniqueAlertsArb, (alerts) => {
        const state = initialTriageState(alerts);
        expect(state.alerts).not.toBe(alerts);
        expect(state.alerts).toEqual(alerts);
        expect(state.filter).toEqual({
          severity: [],
          status: [],
          source: [],
        });
        expect(state.search).toBe('');
        expect(state.sort).toEqual({ key: 'createdAt', direction: 'desc' });
        expect(state.selectedId).toBeNull();
        expect(state.drawerOpen).toBe(false);
      }),
    );
  });
});
