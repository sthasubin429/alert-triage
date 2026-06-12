import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  builtinViews,
  isValidViewName,
  nextViewId,
  parseStoredViews,
  serializeViews,
} from '@/lib/saved-views';
import type { SavedView } from '@/lib/saved-views';
import { customViewsArb, savedViewQueryArb } from './arbitraries';

describe('builtinViews', () => {
  it('returns fresh objects on every call (no shared references)', () => {
    const first = builtinViews();
    const second = builtinViews();
    expect(first).toEqual(second);
    first.forEach((view, i) => {
      expect(view).not.toBe(second[i]);
      expect(view.query.filter).not.toBe(second[i].query.filter);
    });
  });

  it('every built-in is flagged builtIn with a builtin- id', () => {
    for (const view of builtinViews()) {
      expect(view.builtIn).toBe(true);
      expect(view.id.startsWith('builtin-')).toBe(true);
    }
  });
});

describe('isValidViewName', () => {
  it('rejects whitespace-only names', () => {
    fc.assert(
      fc.property(
        customViewsArb,
        fc.string({ unit: fc.constantFrom(' ', '\t', '\n') }),
        (views, name) => {
          expect(isValidViewName(views, name)).toBe(false);
        },
      ),
    );
  });

  it('rejects case-insensitive duplicates of any existing name', () => {
    fc.assert(
      fc.property(
        customViewsArb.filter((v) => v.length > 0),
        fc.nat(),
        fc.constantFrom('verbatim', 'upper', 'lower'),
        (views, seed, variant) => {
          const existing = views[seed % views.length].name;
          const name =
            variant === 'upper'
              ? existing.toUpperCase()
              : variant === 'lower'
                ? existing.toLowerCase()
                : existing;
          // Unicode case folding is not always a round trip (e.g. ß → SS);
          // only variants that still fold back count as duplicates.
          fc.pre(name.toLowerCase() === existing.toLowerCase());
          expect(isValidViewName(views, name)).toBe(false);
        },
      ),
    );
  });

  it('accepts a trimmed non-empty name not present in the list', () => {
    fc.assert(
      fc.property(
        customViewsArb,
        fc.string({ minLength: 1 }).filter((n) => n.trim() !== ''),
        (views, name) => {
          fc.pre(
            !views.some(
              (v) => v.name.toLowerCase() === name.trim().toLowerCase(),
            ),
          );
          expect(isValidViewName(views, name)).toBe(true);
        },
      ),
    );
  });
});

describe('nextViewId', () => {
  it('never collides with an existing id, even after deletions', () => {
    fc.assert(
      fc.property(customViewsArb, savedViewQueryArb, (views, query) => {
        let current: SavedView[] = [...builtinViews(), ...views];
        // grow, shrink from the front, grow again — ids must stay unique
        for (let round = 0; round < 3; round += 1) {
          const id = nextViewId(current);
          expect(current.some((v) => v.id === id)).toBe(false);
          current = [
            ...current.slice(0, builtinViews().length),
            ...current.slice(builtinViews().length + 1),
            { id, name: `view ${round}`, query, builtIn: false },
          ];
        }
      }),
    );
  });

  it('starts at custom-1 with no custom views', () => {
    expect(nextViewId(builtinViews())).toBe('custom-1');
  });
});

describe('parseStoredViews / serializeViews', () => {
  it('round-trips custom views through serialize → parse', () => {
    fc.assert(
      fc.property(customViewsArb, (views) => {
        expect(parseStoredViews(serializeViews(views))).toEqual(views);
      }),
    );
  });

  it('serializes only custom views; built-ins stay in code', () => {
    fc.assert(
      fc.property(customViewsArb, (views) => {
        const all = [...builtinViews(), ...views];
        expect(parseStoredViews(serializeViews(all))).toEqual(views);
      }),
    );
  });

  it('returns [] for null, garbage, and non-array JSON', () => {
    for (const raw of [null, '', 'not json', '{}', '"str"', '42', 'null']) {
      expect(parseStoredViews(raw)).toEqual([]);
    }
  });

  it('drops malformed entries but keeps valid ones', () => {
    const valid: SavedView = {
      id: 'custom-1',
      name: 'mine',
      builtIn: false,
      query: {
        filter: { severity: [], status: [], source: [], assignee: [] },
        search: '',
        sort: { key: 'createdAt', direction: 'desc' },
      },
    };
    const raw = JSON.stringify([
      valid,
      { id: '', name: 'no id', query: valid.query },
      { id: 'custom-2', name: '   ', query: valid.query },
      {
        id: 'custom-3',
        name: 'bad sort',
        query: { ...valid.query, sort: { key: 'nope', direction: 'desc' } },
      },
      { id: 'custom-4', name: 'no query' },
      'not even an object',
    ]);
    expect(parseStoredViews(raw)).toEqual([valid]);
  });

  it('strips out-of-vocabulary filter values instead of rejecting the view', () => {
    const raw = JSON.stringify([
      {
        id: 'custom-1',
        name: 'stale vocab',
        query: {
          filter: {
            severity: ['critical', 'apocalyptic'],
            status: ['open', 'snoozed'],
            source: ['Okta', 'Carrier Pigeon'],
            assignee: ['maya.chen'],
          },
          search: '',
          sort: { key: 'severity', direction: 'desc' },
        },
      },
    ]);
    expect(parseStoredViews(raw)[0]?.query.filter).toEqual({
      severity: ['critical'],
      status: ['open'],
      source: ['Okta'],
      assignee: ['maya.chen'],
    });
  });

  it('coerces builtIn to false and drops duplicate ids', () => {
    const view = {
      id: 'custom-1',
      name: 'first',
      builtIn: true,
      query: {
        filter: { severity: [], status: [], source: [], assignee: [] },
        search: '',
        sort: { key: 'title', direction: 'asc' },
      },
    };
    const parsed = parseStoredViews(
      JSON.stringify([view, { ...view, name: 'second' }]),
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0].builtIn).toBe(false);
    expect(parsed[0].name).toBe('first');
  });
});
