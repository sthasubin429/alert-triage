export const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const STATUSES = [
  'open',
  'acknowledged',
  'resolved',
  'false_positive',
] as const;
export type Status = (typeof STATUSES)[number];

export const SOURCES = [
  'CrowdStrike EDR',
  'Okta',
  'AWS GuardDuty',
  'Suricata IDS',
  'Email Gateway',
] as const;
export type Source = (typeof SOURCES)[number];

export interface Alert {
  id: string;
  title: string;
  severity: Severity;
  status: Status;
  source: Source;
  /** ISO 8601 timestamp */
  createdAt: string;
  assignee: string | null;
}

export type SortKey = 'severity' | 'status' | 'source' | 'createdAt' | 'title';
export type SortDirection = 'asc' | 'desc';

export interface SortSpec {
  key: SortKey;
  direction: SortDirection;
}

export interface AlertFilter {
  /** Empty array = no constraint; otherwise the alert's value must be included. */
  severity: readonly Severity[];
  status: readonly Status[];
  source: readonly Source[];
  /** Matches by exact assignee; an unassigned alert never matches a non-empty criterion. */
  assignee: readonly string[];
}

export const EMPTY_FILTER: AlertFilter = {
  severity: [],
  status: [],
  source: [],
  assignee: [],
};

export type FilterToggle =
  | { key: 'severity'; value: Severity }
  | { key: 'status'; value: Status }
  | { key: 'source'; value: Source }
  | { key: 'assignee'; value: string };
