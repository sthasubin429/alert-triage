import fc from 'fast-check';
import { SEVERITIES, SOURCES, STATUSES } from '@/lib/types';
import type {
  Alert,
  AlertFilter,
  SortDirection,
  SortKey,
  SortSpec,
} from '@/lib/types';

export const SORT_KEYS: readonly SortKey[] = [
  'severity',
  'status',
  'source',
  'createdAt',
  'title',
];

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
  assignee: fc.option(fc.string({ minLength: 1 }), { nil: null }),
});

export const alertsArb: fc.Arbitrary<Alert[]> = fc.array(alertArb);

export const uniqueAlertsArb: fc.Arbitrary<Alert[]> = fc.uniqueArray(alertArb, {
  selector: (a) => a.id,
});

export const filterArb: fc.Arbitrary<AlertFilter> = fc.record({
  severity: fc.subarray([...SEVERITIES]),
  status: fc.subarray([...STATUSES]),
  source: fc.subarray([...SOURCES]),
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
