import { SEVERITIES, SOURCES, STATUSES } from '@/lib/types';
import type {
  AlertFilter,
  Severity,
  SortDirection,
  SortKey,
  SortSpec,
  Source,
  Status,
} from '@/lib/types';

/** The analyst using this console; "Assigned to me" filters on this name. */
export const CURRENT_ANALYST = 'maya.chen';

export interface SavedViewQuery {
  filter: AlertFilter;
  search: string;
  sort: SortSpec;
}

export interface SavedView {
  id: string;
  name: string;
  query: SavedViewQuery;
  builtIn: boolean;
}

/**
 * Factory rather than a module constant: reducer states embed these objects,
 * and the property suite deep-freezes states, so sharing one instance would
 * freeze it for every later test run.
 */
export function builtinViews(): SavedView[] {
  return [
    {
      id: 'builtin-all',
      name: 'All alerts',
      builtIn: true,
      query: {
        filter: { severity: [], status: [], source: [], assignee: [] },
        search: '',
        sort: { key: 'createdAt', direction: 'desc' },
      },
    },
    {
      id: 'builtin-hot',
      name: 'Hot queue',
      builtIn: true,
      query: {
        filter: {
          severity: ['critical', 'high'],
          status: ['open'],
          source: [],
          assignee: [],
        },
        search: '',
        sort: { key: 'createdAt', direction: 'asc' },
      },
    },
    {
      id: 'builtin-mine',
      name: 'Assigned to me',
      builtIn: true,
      query: {
        filter: {
          severity: [],
          status: [],
          source: [],
          assignee: [CURRENT_ANALYST],
        },
        search: '',
        sort: { key: 'createdAt', direction: 'desc' },
      },
    },
  ];
}

export function isValidViewName(
  views: readonly SavedView[],
  name: string,
): boolean {
  const trimmed = name.trim();
  return (
    trimmed !== '' &&
    !views.some((v) => v.name.toLowerCase() === trimmed.toLowerCase())
  );
}

/** Deterministic id: one past the highest existing custom-view suffix. */
export function nextViewId(views: readonly SavedView[]): string {
  let max = 0;
  for (const view of views) {
    const match = /^custom-(\d+)$/.exec(view.id);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }
  return `custom-${max + 1}`;
}

const SORT_KEYS: readonly SortKey[] = [
  'severity',
  'status',
  'source',
  'createdAt',
  'title',
];
const SORT_DIRECTIONS: readonly SortDirection[] = ['asc', 'desc'];

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function parseFilter(value: unknown): AlertFilter | null {
  if (typeof value !== 'object' || value === null) return null;
  const { severity, status, source, assignee } = value as Record<
    string,
    unknown
  >;
  if (
    !isStringArray(severity) ||
    !isStringArray(status) ||
    !isStringArray(source) ||
    !isStringArray(assignee)
  ) {
    return null;
  }
  // Drop values outside the current vocabulary rather than rejecting the
  // whole view, so stored views survive vocabulary changes.
  return {
    severity: severity.filter((v): v is Severity =>
      (SEVERITIES as readonly string[]).includes(v),
    ),
    status: status.filter((v): v is Status =>
      (STATUSES as readonly string[]).includes(v),
    ),
    source: source.filter((v): v is Source =>
      (SOURCES as readonly string[]).includes(v),
    ),
    assignee,
  };
}

function parseView(value: unknown): SavedView | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, name, query } = value as Record<string, unknown>;
  if (typeof id !== 'string' || id === '') return null;
  if (typeof name !== 'string' || name.trim() === '') return null;
  if (typeof query !== 'object' || query === null) return null;
  const { filter, search, sort } = query as Record<string, unknown>;
  const parsedFilter = parseFilter(filter);
  if (parsedFilter === null || typeof search !== 'string') return null;
  if (typeof sort !== 'object' || sort === null) return null;
  const { key, direction } = sort as Record<string, unknown>;
  if (
    !SORT_KEYS.includes(key as SortKey) ||
    !SORT_DIRECTIONS.includes(direction as SortDirection)
  ) {
    return null;
  }
  return {
    id,
    name,
    builtIn: false,
    query: {
      filter: parsedFilter,
      search,
      sort: { key: key as SortKey, direction: direction as SortDirection },
    },
  };
}

/** Parses a stored custom-view list; malformed input yields []. */
export function parseStoredViews(raw: string | null): SavedView[] {
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const views: SavedView[] = [];
  for (const entry of parsed) {
    const view = parseView(entry);
    if (view !== null && !views.some((v) => v.id === view.id)) {
      views.push(view);
    }
  }
  return views;
}

/** Serializes only the analyst-created views; built-ins live in code. */
export function serializeViews(views: readonly SavedView[]): string {
  return JSON.stringify(views.filter((v) => !v.builtIn));
}
