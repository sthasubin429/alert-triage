import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  UNDO_LIMIT,
  initialTriageState,
  triageReducer,
} from '@/lib/triage-reducer';
import type { TriageAction, TriageState } from '@/lib/triage-reducer';
import { builtinViews } from '@/lib/saved-views';
import { SEVERITIES, SOURCES, STATUSES } from '@/lib/types';
import type { Alert } from '@/lib/types';
import {
  alertArb,
  customViewsArb,
  filterArb,
  savedViewQueryArb,
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
  // EMPTY_FILTER module constant. (Views need no clone: builtinViews() is
  // a factory returning fresh objects.)
  return {
    ...initialTriageState(alerts),
    filter: { severity: [], status: [], source: [], assignee: [] },
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

  it('returns the same state reference when the status is unchanged', () => {
    fc.assert(
      fc.property(nonEmptyUniqueAlertsArb, fc.nat(), (alerts, seed) => {
        const index = seed % alerts.length;
        const state = makeState(alerts);
        const next = triageReducer(state, {
          type: 'SET_STATUS',
          id: alerts[index].id,
          status: alerts[index].status,
        });
        expect(next).toBe(state);
      }),
    );
  });

  it('a real change pushes {id, from, to} and records lastStatusChange', () => {
    fc.assert(
      fc.property(setStatusCaseArb, ([alerts, index, status]) => {
        fc.pre(alerts[index].status !== status);
        const state = makeState(alerts);
        const next = triageReducer(state, {
          type: 'SET_STATUS',
          id: alerts[index].id,
          status,
        });
        const change = {
          id: alerts[index].id,
          from: alerts[index].status,
          to: status,
        };
        expect(next.undoStack).toEqual([change]);
        expect(next.lastStatusChange).toEqual(change);
      }),
    );
  });

  it('caps the undo stack at UNDO_LIMIT, keeping the most recent entries', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...STATUSES), {
          minLength: UNDO_LIMIT + 5,
          maxLength: UNDO_LIMIT + 10,
        }),
        (statuses) => {
          const alert: Alert = {
            id: 'cap-1',
            title: 'cap',
            severity: 'low',
            status: 'open',
            source: 'Okta',
            createdAt: '2024-06-01T12:00:00.000Z',
            assignee: null,
          };
          let state = makeState([alert]);
          const pushed: string[] = [];
          for (const status of statuses) {
            const before = state.alerts[0].status;
            state = triageReducer(state, {
              type: 'SET_STATUS',
              id: alert.id,
              status,
            });
            if (before !== status) pushed.push(`${before}->${status}`);
          }
          expect(state.undoStack.length).toBeLessThanOrEqual(UNDO_LIMIT);
          expect(state.undoStack.map((e) => `${e.from}->${e.to}`)).toEqual(
            pushed.slice(-UNDO_LIMIT),
          );
        },
      ),
      { numRuns: 25 },
    );
  });
});

describe('triageReducer SET_STATUS auto-advance', () => {
  /** (alerts with a real status change, target index, new status) */
  const advanceCaseArb = setStatusCaseArb.filter(
    ([alerts, index, status]) => alerts[index].status !== status,
  );

  it('advances to the next visible id (previous when last, null when only)', () => {
    fc.assert(
      fc.property(advanceCaseArb, ([alerts, index, status]) => {
        const visibleIds = alerts.map((a) => a.id);
        const state = { ...makeState(alerts), selectedId: alerts[index].id };
        const next = triageReducer(state, {
          type: 'SET_STATUS',
          id: alerts[index].id,
          status,
          advanceWithin: visibleIds,
        });
        const expected =
          visibleIds.length === 1
            ? null
            : visibleIds[
                index === visibleIds.length - 1 ? index - 1 : index + 1
              ];
        expect(next.selectedId).toBe(expected);
      }),
    );
  });

  it('leaves selection unchanged when the disposed alert is not selected', () => {
    fc.assert(
      fc.property(
        advanceCaseArb,
        fc.option(fc.string(), { nil: null }),
        ([alerts, index, status], selectedId) => {
          fc.pre(selectedId !== alerts[index].id);
          const state = { ...makeState(alerts), selectedId };
          const next = triageReducer(state, {
            type: 'SET_STATUS',
            id: alerts[index].id,
            status,
            advanceWithin: alerts.map((a) => a.id),
          });
          expect(next.selectedId).toBe(selectedId);
        },
      ),
    );
  });

  it('leaves selection unchanged when advanceWithin is absent', () => {
    fc.assert(
      fc.property(advanceCaseArb, ([alerts, index, status]) => {
        const state = { ...makeState(alerts), selectedId: alerts[index].id };
        const next = triageReducer(state, {
          type: 'SET_STATUS',
          id: alerts[index].id,
          status,
        });
        expect(next.selectedId).toBe(alerts[index].id);
      }),
    );
  });

  it('leaves selection unchanged when the disposed id is not in advanceWithin', () => {
    fc.assert(
      fc.property(advanceCaseArb, ([alerts, index, status]) => {
        const others = alerts
          .filter((a) => a.id !== alerts[index].id)
          .map((a) => a.id);
        const state = { ...makeState(alerts), selectedId: alerts[index].id };
        const next = triageReducer(state, {
          type: 'SET_STATUS',
          id: alerts[index].id,
          status,
          advanceWithin: others,
        });
        expect(next.selectedId).toBe(alerts[index].id);
      }),
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
      assignee: fc.array(fc.string({ minLength: 1 }), { maxLength: 3 }),
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
    fc.record({
      key: fc.constant('assignee' as const),
      value: fc.string({ minLength: 1 }),
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
        // the untouched criteria are reference-equal
        for (const key of [
          'severity',
          'status',
          'source',
          'assignee',
        ] as const) {
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

  it('SET_SEARCH sets search, clears the active view, and leaves the rest untouched', () => {
    fc.assert(
      fc.property(uniqueAlertsArb, fc.string(), (alerts, search) => {
        const state = makeState(alerts);
        const next = triageReducer(state, { type: 'SET_SEARCH', search });
        expect(next.search).toBe(search);
        expect(next.activeViewId).toBeNull();
        expect(next.alerts).toBe(state.alerts);
        expect(next.filter).toBe(state.filter);
        expect(next.sort).toBe(state.sort);
        expect(next.selectedId).toBe(state.selectedId);
        expect(next.drawerOpen).toBe(state.drawerOpen);
        expect(next.views).toBe(state.views);
        expect(next.undoStack).toBe(state.undoStack);
        expect(next.lastStatusChange).toBe(state.lastStatusChange);
      }),
    );
  });

  it('every query-changing action clears the active view id', () => {
    const queryActionArb: fc.Arbitrary<TriageAction> = fc.oneof(
      partialFilterArb.map(
        (filter): TriageAction => ({ type: 'SET_FILTER', filter }),
      ),
      filterToggleArb.map(
        (toggle): TriageAction => ({ type: 'TOGGLE_FILTER', ...toggle }),
      ),
      fc
        .string()
        .map((search): TriageAction => ({ type: 'SET_SEARCH', search })),
      sortKeyArb.map((key): TriageAction => ({ type: 'SET_SORT', key })),
    );
    fc.assert(
      fc.property(queryActionArb, (action) => {
        const state = makeState([]);
        expect(state.activeViewId).not.toBeNull();
        expect(triageReducer(state, action).activeViewId).toBeNull();
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

describe('triageReducer APPLY_VIEW', () => {
  it('applies the view query, marks it active, and touches nothing else', () => {
    fc.assert(
      fc.property(
        uniqueAlertsArb,
        customViewsArb,
        fc.nat(),
        (alerts, customs, seed) => {
          const base = triageReducer(makeState(alerts), {
            type: 'HYDRATE_VIEWS',
            views: customs,
          });
          const view = base.views[seed % base.views.length];
          const next = triageReducer(base, { type: 'APPLY_VIEW', id: view.id });
          expect(next.filter).toEqual(view.query.filter);
          expect(next.search).toBe(view.query.search);
          expect(next.sort).toEqual(view.query.sort);
          expect(next.activeViewId).toBe(view.id);
          expect(next.alerts).toBe(base.alerts);
          expect(next.views).toBe(base.views);
          expect(next.selectedId).toBe(base.selectedId);
          expect(next.drawerOpen).toBe(base.drawerOpen);
          expect(next.undoStack).toBe(base.undoStack);
        },
      ),
    );
  });

  it('returns the same state reference for an unknown view id', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (id) => {
        const state = makeState([]);
        fc.pre(!state.views.some((v) => v.id === id));
        expect(triageReducer(state, { type: 'APPLY_VIEW', id })).toBe(state);
      }),
    );
  });

  it('never mutates the prior state (deep-frozen state does not throw)', () => {
    fc.assert(
      fc.property(customViewsArb, fc.nat(), (customs, seed) => {
        const base = triageReducer(makeState([]), {
          type: 'HYDRATE_VIEWS',
          views: customs,
        });
        const view = base.views[seed % base.views.length];
        deepFreeze(base);
        expect(() =>
          triageReducer(base, { type: 'APPLY_VIEW', id: view.id }),
        ).not.toThrow();
      }),
      { numRuns: 50 },
    );
  });
});

describe('triageReducer SAVE_VIEW', () => {
  const validNameArb = fc
    .string({ minLength: 1 })
    .filter((name) => name.trim() !== '');

  const stateWithQueryArb = fc
    .tuple(filterArb, fc.string(), sortSpecArb)
    .map(([filter, search, sort]) => ({
      ...makeState([]),
      filter,
      search,
      sort,
    }));

  it('appends one custom view capturing the live query and activates it', () => {
    fc.assert(
      fc.property(stateWithQueryArb, validNameArb, (state, name) => {
        fc.pre(
          !state.views.some(
            (v) => v.name.toLowerCase() === name.trim().toLowerCase(),
          ),
        );
        const next = triageReducer(state, { type: 'SAVE_VIEW', name });
        expect(next.views.length).toBe(state.views.length + 1);
        state.views.forEach((view, i) => expect(next.views[i]).toBe(view));
        const added = next.views[next.views.length - 1];
        expect(added.name).toBe(name.trim());
        expect(added.builtIn).toBe(false);
        expect(added.query.filter).toEqual(state.filter);
        expect(added.query.search).toBe(state.search);
        expect(added.query.sort).toEqual(state.sort);
        expect(next.activeViewId).toBe(added.id);
        expect(next.views.filter((v) => v.id === added.id)).toHaveLength(1);
      }),
    );
  });

  it('rejects whitespace-only names (same reference)', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: fc.constantFrom(' ', '\t', '\n') }),
        (name) => {
          const state = makeState([]);
          expect(triageReducer(state, { type: 'SAVE_VIEW', name })).toBe(state);
        },
      ),
    );
  });

  it('rejects names that duplicate an existing view case-insensitively', () => {
    fc.assert(
      fc.property(fc.nat(), fc.boolean(), (seed, upper) => {
        const state = makeState([]);
        const existing = state.views[seed % state.views.length].name;
        const name = upper ? existing.toUpperCase() : existing.toLowerCase();
        expect(triageReducer(state, { type: 'SAVE_VIEW', name })).toBe(state);
      }),
    );
  });

  it('saving twice with distinct names yields distinct ids', () => {
    fc.assert(
      fc.property(validNameArb, validNameArb, (first, second) => {
        const state = makeState([]);
        fc.pre(first.trim().toLowerCase() !== second.trim().toLowerCase());
        fc.pre(
          [first, second].every(
            (name) =>
              !state.views.some(
                (v) => v.name.toLowerCase() === name.trim().toLowerCase(),
              ),
          ),
        );
        const once = triageReducer(state, { type: 'SAVE_VIEW', name: first });
        const twice = triageReducer(once, { type: 'SAVE_VIEW', name: second });
        const ids = twice.views.map((v) => v.id);
        expect(new Set(ids).size).toBe(ids.length);
      }),
    );
  });
});

describe('triageReducer DELETE_VIEW', () => {
  const withCustoms = (customs: Parameters<typeof triageReducer>[0]['views']) =>
    triageReducer(makeState([]), { type: 'HYDRATE_VIEWS', views: customs });

  const nonEmptyCustomsArb = customViewsArb.filter((c) => c.length > 0);

  it('returns the same reference for built-in or unknown ids', () => {
    fc.assert(
      fc.property(
        customViewsArb,
        fc.string({ minLength: 1 }),
        (customs, randomId) => {
          const state = withCustoms(customs);
          for (const view of state.views.filter((v) => v.builtIn)) {
            expect(
              triageReducer(state, { type: 'DELETE_VIEW', id: view.id }),
            ).toBe(state);
          }
          fc.pre(!state.views.some((v) => v.id === randomId));
          expect(
            triageReducer(state, { type: 'DELETE_VIEW', id: randomId }),
          ).toBe(state);
        },
      ),
    );
  });

  it('removes exactly the deleted view; the rest keep order and reference', () => {
    fc.assert(
      fc.property(nonEmptyCustomsArb, fc.nat(), (customs, seed) => {
        const state = withCustoms(customs);
        const customViews = state.views.filter((v) => !v.builtIn);
        const target = customViews[seed % customViews.length];
        const next = triageReducer(state, {
          type: 'DELETE_VIEW',
          id: target.id,
        });
        const remaining = state.views.filter((v) => v.id !== target.id);
        expect(next.views.length).toBe(remaining.length);
        next.views.forEach((view, i) => expect(view).toBe(remaining[i]));
      }),
    );
  });

  it('deleting the active custom view falls back to All alerts and its query', () => {
    fc.assert(
      fc.property(nonEmptyCustomsArb, fc.nat(), (customs, seed) => {
        const base = withCustoms(customs);
        const customViews = base.views.filter((v) => !v.builtIn);
        const target = customViews[seed % customViews.length];
        const active = triageReducer(base, {
          type: 'APPLY_VIEW',
          id: target.id,
        });
        const next = triageReducer(active, {
          type: 'DELETE_VIEW',
          id: target.id,
        });
        const all = builtinViews().find((v) => v.id === 'builtin-all');
        expect(all).toBeDefined();
        expect(next.activeViewId).toBe('builtin-all');
        expect(next.filter).toEqual(all?.query.filter);
        expect(next.search).toBe(all?.query.search);
        expect(next.sort).toEqual(all?.query.sort);
        expect(next.views.some((v) => v.id === target.id)).toBe(false);
      }),
    );
  });

  it('deleting an inactive view leaves the live query and active id alone', () => {
    fc.assert(
      fc.property(
        nonEmptyCustomsArb,
        fc.nat(),
        savedViewQueryArb,
        (customs, seed, query) => {
          const base = withCustoms(customs);
          const customViews = base.views.filter((v) => !v.builtIn);
          const target = customViews[seed % customViews.length];
          const state = { ...base, ...query, activeViewId: null };
          const next = triageReducer(state, {
            type: 'DELETE_VIEW',
            id: target.id,
          });
          expect(next.filter).toBe(state.filter);
          expect(next.search).toBe(state.search);
          expect(next.sort).toBe(state.sort);
          expect(next.activeViewId).toBeNull();
        },
      ),
    );
  });
});

describe('triageReducer HYDRATE_VIEWS', () => {
  it('result is the built-ins followed by the payload, coerced to custom', () => {
    fc.assert(
      fc.property(customViewsArb, (customs) => {
        const state = makeState([]);
        const next = triageReducer(state, {
          type: 'HYDRATE_VIEWS',
          views: customs,
        });
        const builtins = state.views.filter((v) => v.builtIn);
        expect(next.views.slice(0, builtins.length).map((v) => v.id)).toEqual(
          builtins.map((v) => v.id),
        );
        expect(next.views.slice(builtins.length)).toEqual(
          customs.map((v) => ({ ...v, builtIn: false })),
        );
        expect(next.activeViewId).toBe(state.activeViewId);
        expect(next.filter).toBe(state.filter);
        expect(next.search).toBe(state.search);
        expect(next.sort).toBe(state.sort);
      }),
    );
  });

  it('is idempotent: hydrating twice deep-equals hydrating once', () => {
    fc.assert(
      fc.property(customViewsArb, (customs) => {
        const action = { type: 'HYDRATE_VIEWS', views: customs } as const;
        const once = triageReducer(makeState([]), action);
        expect(triageReducer(once, action)).toEqual(once);
      }),
    );
  });
});

describe('triageReducer UNDO', () => {
  it('returns the same state reference when the stack is empty', () => {
    fc.assert(
      fc.property(uniqueAlertsArb, (alerts) => {
        const state = makeState(alerts);
        expect(triageReducer(state, { type: 'UNDO' })).toBe(state);
      }),
    );
  });

  it('SET_STATUS then UNDO restores every original status and pops the entry', () => {
    fc.assert(
      fc.property(setStatusCaseArb, ([alerts, index, status]) => {
        const state = makeState(alerts);
        const changed = triageReducer(state, {
          type: 'SET_STATUS',
          id: alerts[index].id,
          status,
        });
        const undone = triageReducer(changed, { type: 'UNDO' });
        expect(
          undone.alerts.map((a) => ({ id: a.id, status: a.status })),
        ).toEqual(state.alerts.map((a) => ({ id: a.id, status: a.status })));
        expect(undone.undoStack.length).toBe(
          Math.max(changed.undoStack.length - 1, 0),
        );
      }),
    );
  });

  it('a sequence of changes fully unwinds to the original statuses', () => {
    const changesCaseArb = nonEmptyUniqueAlertsArb.chain((alerts) =>
      fc.tuple(
        fc.constant(alerts),
        fc.array(
          fc.tuple(
            fc.nat({ max: alerts.length - 1 }),
            fc.constantFrom(...STATUSES),
          ),
          { maxLength: 10 },
        ),
      ),
    );
    fc.assert(
      fc.property(changesCaseArb, ([alerts, changes]) => {
        let state = makeState(alerts);
        for (const [index, status] of changes) {
          state = triageReducer(state, {
            type: 'SET_STATUS',
            id: alerts[index].id,
            status,
          });
        }
        while (state.undoStack.length > 0) {
          state = triageReducer(state, { type: 'UNDO' });
        }
        expect(
          state.alerts.map((a) => ({ id: a.id, status: a.status })),
        ).toEqual(alerts.map((a) => ({ id: a.id, status: a.status })));
      }),
    );
  });

  it('selects the undone alert and clears lastStatusChange', () => {
    fc.assert(
      fc.property(setStatusCaseArb, ([alerts, index, status]) => {
        fc.pre(alerts[index].status !== status);
        const changed = triageReducer(makeState(alerts), {
          type: 'SET_STATUS',
          id: alerts[index].id,
          status,
        });
        const undone = triageReducer(changed, { type: 'UNDO' });
        expect(undone.selectedId).toBe(alerts[index].id);
        expect(undone.lastStatusChange).toBeNull();
      }),
    );
  });

  it('never mutates the prior state (deep-frozen state does not throw)', () => {
    fc.assert(
      fc.property(setStatusCaseArb, ([alerts, index, status]) => {
        fc.pre(alerts[index].status !== status);
        const changed = triageReducer(makeState(structuredClone(alerts)), {
          type: 'SET_STATUS',
          id: alerts[index].id,
          status,
        });
        deepFreeze(changed);
        expect(() => triageReducer(changed, { type: 'UNDO' })).not.toThrow();
      }),
      { numRuns: 50 },
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
          assignee: [],
        });
        expect(state.search).toBe('');
        expect(state.sort).toEqual({ key: 'createdAt', direction: 'desc' });
        expect(state.selectedId).toBeNull();
        expect(state.drawerOpen).toBe(false);
        expect(state.views).toEqual(builtinViews());
        expect(state.activeViewId).toBe('builtin-all');
        expect(state.undoStack).toEqual([]);
        expect(state.lastStatusChange).toBeNull();
      }),
    );
  });

  it('the "All alerts" built-in query matches the initial live query', () => {
    const state = initialTriageState([]);
    const all = state.views.find((v) => v.id === 'builtin-all');
    expect(all).toBeDefined();
    expect(all?.query.filter).toEqual(state.filter);
    expect(all?.query.search).toBe(state.search);
    expect(all?.query.sort).toEqual(state.sort);
  });
});
