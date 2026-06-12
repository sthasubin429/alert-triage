'use client';

import type { RefObject } from 'react';
import {
  SEVERITIES,
  SOURCES,
  STATUSES,
  type AlertFilter,
  type Severity,
  type Source,
  type Status,
} from '@/lib/types';

interface FilterBarProps {
  filter: AlertFilter;
  search: string;
  resultCount: number;
  totalCount: number;
  searchRef: RefObject<HTMLInputElement | null>;
  onSearchChange: (search: string) => void;
  onFilterChange: (filter: Partial<AlertFilter>) => void;
  onClear: () => void;
}

const SELECT_CLASS =
  'h-7 rounded-sm border border-edge bg-panel-2 px-2 font-mono text-[11px] text-fore outline-none transition-colors hover:border-edge-2 focus:border-accent/60';

function formatStatus(status: Status): string {
  return status.replace('_', ' ');
}

export default function FilterBar({
  filter,
  search,
  resultCount,
  totalCount,
  searchRef,
  onSearchChange,
  onFilterChange,
  onClear,
}: FilterBarProps) {
  const anyActive =
    search.trim() !== '' ||
    filter.severity !== null ||
    filter.status !== null ||
    filter.source !== null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-edge bg-panel px-3 py-2">
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-[11px] text-dim"
        >
          /
        </span>
        <input
          ref={searchRef}
          type="text"
          role="searchbox"
          aria-label="Search alerts"
          placeholder="search title, source, id, assignee"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-7 w-64 rounded-sm border border-edge bg-panel-2 pl-6 pr-2 font-mono text-[11px] text-fore placeholder:text-dim outline-none transition-colors hover:border-edge-2 focus:border-accent/60"
        />
      </div>

      <select
        aria-label="Filter by severity"
        className={SELECT_CLASS}
        value={filter.severity ?? ''}
        onChange={(e) =>
          onFilterChange({
            severity:
              e.target.value === '' ? null : (e.target.value as Severity),
          })
        }
      >
        <option value="">All severities</option>
        {SEVERITIES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <select
        aria-label="Filter by status"
        className={SELECT_CLASS}
        value={filter.status ?? ''}
        onChange={(e) =>
          onFilterChange({
            status: e.target.value === '' ? null : (e.target.value as Status),
          })
        }
      >
        <option value="">All statuses</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {formatStatus(s)}
          </option>
        ))}
      </select>

      <select
        aria-label="Filter by source"
        className={SELECT_CLASS}
        value={filter.source ?? ''}
        onChange={(e) =>
          onFilterChange({
            source: e.target.value === '' ? null : (e.target.value as Source),
          })
        }
      >
        <option value="">All sources</option>
        {SOURCES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      {anyActive && (
        <button
          type="button"
          onClick={onClear}
          className="h-7 rounded-sm border border-edge px-2 font-mono text-[11px] text-faint transition-colors hover:border-edge-2 hover:text-fore"
        >
          Clear filters
        </button>
      )}

      <span className="ml-auto font-mono text-[11px] tabular-nums text-faint">
        <span className="text-fore">{resultCount}</span> of {totalCount}
      </span>
    </div>
  );
}
