import type { Alert, AlertFilter, Severity, SortSpec } from '@/lib/types';

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
};

/**
 * Returns the alerts matching every non-empty criterion in the filter,
 * preserving input order. An empty criterion imposes no constraint;
 * a non-empty one matches any of its selected values (OR within a
 * criterion, AND across criteria).
 */
export function filterAlerts(
  alerts: readonly Alert[],
  filter: AlertFilter,
): Alert[] {
  return alerts.filter(
    (alert) =>
      (filter.severity.length === 0 ||
        filter.severity.includes(alert.severity)) &&
      (filter.status.length === 0 || filter.status.includes(alert.status)) &&
      (filter.source.length === 0 || filter.source.includes(alert.source)) &&
      (filter.assignee.length === 0 ||
        (alert.assignee !== null && filter.assignee.includes(alert.assignee))),
  );
}

/**
 * Case-insensitive substring search over title, source, id, and assignee
 * (when non-null). An empty or whitespace-only query returns the input
 * list unchanged (same elements, same order).
 */
export function searchAlerts(alerts: readonly Alert[], query: string): Alert[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return [...alerts];
  }
  return alerts.filter((alert) => {
    const haystacks = [alert.title, alert.source, alert.id];
    if (alert.assignee !== null) {
      haystacks.push(alert.assignee);
    }
    return haystacks.some((text) => text.toLowerCase().includes(needle));
  });
}

function compareAlerts(a: Alert, b: Alert, key: SortSpec['key']): number {
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

/**
 * Returns a new array sorted by the given spec. Stable; never mutates
 * the input. 'desc' for severity puts critical first; 'desc' for
 * createdAt puts newest first.
 */
export function sortAlerts(alerts: readonly Alert[], sort: SortSpec): Alert[] {
  const sign = sort.direction === 'asc' ? 1 : -1;
  return [...alerts].sort((a, b) => sign * compareAlerts(a, b, sort.key));
}

/** Composition: filterAlerts → searchAlerts → sortAlerts. */
export function applyQuery(
  alerts: readonly Alert[],
  q: { filter: AlertFilter; search: string; sort: SortSpec },
): Alert[] {
  return sortAlerts(
    searchAlerts(filterAlerts(alerts, q.filter), q.search),
    q.sort,
  );
}
