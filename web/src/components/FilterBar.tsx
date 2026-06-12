'use client';

import type { RefObject } from 'react';
import {
  SEVERITIES,
  SOURCES,
  STATUSES,
  type AlertFilter,
  type FilterToggle,
  type Status,
} from '@/lib/types';

interface FilterBarProps {
  filter: AlertFilter;
  search: string;
  resultCount: number;
  totalCount: number;
  searchRef: RefObject<HTMLInputElement | null>;
  onSearchChange: (search: string) => void;
  onToggleFilter: (toggle: FilterToggle) => void;
  onClear: () => void;
}

function formatStatus(status: Status): string {
  return status.replace('_', ' ');
}

function FilterGroup<T extends string>({
  label,
  values,
  active,
  format,
  onToggle,
}: {
  label: string;
  values: readonly T[];
  active: readonly T[];
  format?: (value: T) => string;
  onToggle: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={`Filter by ${label}`}
      className="flex items-center gap-1"
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
        {label}
      </span>
      {values.map((value) => {
        const isActive = active.includes(value);
        return (
          <button
            key={value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onToggle(value)}
            className={`h-7 rounded-sm border px-2 font-mono text-[11px] transition-colors ${
              isActive
                ? 'border-accent/60 bg-accent/15 text-fore'
                : 'border-edge bg-panel-2 text-faint hover:border-edge-2 hover:text-fore'
            }`}
          >
            {format ? format(value) : value}
          </button>
        );
      })}
    </div>
  );
}

export default function FilterBar({
  filter,
  search,
  resultCount,
  totalCount,
  searchRef,
  onSearchChange,
  onToggleFilter,
  onClear,
}: FilterBarProps) {
  const anyActive =
    search.trim() !== '' ||
    filter.severity.length > 0 ||
    filter.status.length > 0 ||
    filter.source.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-edge bg-panel px-3 py-2">
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

      <FilterGroup
        label="severity"
        values={SEVERITIES}
        active={filter.severity}
        onToggle={(value) => onToggleFilter({ key: 'severity', value })}
      />

      <FilterGroup
        label="status"
        values={STATUSES}
        active={filter.status}
        format={formatStatus}
        onToggle={(value) => onToggleFilter({ key: 'status', value })}
      />

      <FilterGroup
        label="source"
        values={SOURCES}
        active={filter.source}
        onToggle={(value) => onToggleFilter({ key: 'source', value })}
      />

      {anyActive && (
        <button
          type="button"
          onClick={onClear}
          className="h-7 rounded-sm border border-edge px-2 font-mono text-[11px] text-faint transition-colors hover:border-edge-2 hover:text-fore"
        >
          Clear filters
        </button>
      )}

      <span
        aria-label="Result count"
        className="ml-auto font-mono text-[11px] tabular-nums text-faint"
      >
        <span className="text-fore">{resultCount}</span> of {totalCount}
      </span>
    </div>
  );
}
