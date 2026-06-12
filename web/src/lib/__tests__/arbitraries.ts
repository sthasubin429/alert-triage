import fc from 'fast-check';
import { SEVERITIES, SOURCES, STATUSES } from '@/lib/types';
import type {
  Alert,
  AlertFilter,
  SortDirection,
  SortKey,
  SortSpec,
} from '@/lib/types';
import type { SavedView, SavedViewQuery } from '@/lib/saved-views';

export const SORT_KEYS: readonly SortKey[] = [
  'severity',
  'status',
  'source',
  'createdAt',
  'title',
];

/**
 * A small fixed pool keeps alert assignees and filter criteria overlapping,
 * so assignee-filter properties get real positive hits.
 */
export const ASSIGNEE_POOL = ['maya.chen', 'liam.okafor', 'sofia.reyes'];

const assigneeArb = fc.oneof(
  fc.constantFrom(...ASSIGNEE_POOL),
  fc.string({ minLength: 1 }),
);

export const alertArb: fc.Arbitrary<Alert> = fc.record({
  id: fc.string({ minLength: 1 }),
  title: fc.string(),
  severity: fc.constantFrom(...SEVERITIES),
  status: fc.constantFrom(...STATUSES),
  source: fc.constantFrom(...SOURCES),
  createdAt: fc
    .date({
      min: new Date('2020-01-01'),
      max: new Date('2030-01-01'),
      noInvalidDate: true,
    })
    .map((d) => d.toISOString()),
  assignee: fc.option(assigneeArb, { nil: null }),
});

export const alertsArb: fc.Arbitrary<Alert[]> = fc.array(alertArb);

export const uniqueAlertsArb: fc.Arbitrary<Alert[]> = fc.uniqueArray(alertArb, {
  selector: (a) => a.id,
});

export const filterArb: fc.Arbitrary<AlertFilter> = fc.record({
  severity: fc.subarray([...SEVERITIES]),
  status: fc.subarray([...STATUSES]),
  source: fc.subarray([...SOURCES]),
  assignee: fc.array(assigneeArb, { maxLength: 3 }),
});

export const sortKeyArb: fc.Arbitrary<SortKey> = fc.constantFrom(...SORT_KEYS);

export const sortDirectionArb: fc.Arbitrary<SortDirection> = fc.constantFrom(
  'asc',
  'desc',
);

export const sortSpecArb: fc.Arbitrary<SortSpec> = fc.record({
  key: sortKeyArb,
  direction: sortDirectionArb,
});

export const savedViewQueryArb: fc.Arbitrary<SavedViewQuery> = fc.record({
  filter: filterArb,
  search: fc.string(),
  sort: sortSpecArb,
});

export const savedViewArb: fc.Arbitrary<SavedView> = fc.record({
  // Custom-view ids never share the reserved built-in prefix.
  id: fc.string({ minLength: 1 }).filter((id) => !id.startsWith('builtin-')),
  // Stored names are always trimmed: SAVE_VIEW trims before persisting.
  name: fc
    .string({ minLength: 1 })
    .map((name) => name.trim())
    .filter((name) => name !== ''),
  query: savedViewQueryArb,
  builtIn: fc.constant(false),
});

export const customViewsArb: fc.Arbitrary<SavedView[]> = fc.uniqueArray(
  savedViewArb,
  { selector: (v) => v.id },
);
