'use client';

import { useEffect, useRef } from 'react';
import type { Alert, SortKey, SortSpec } from '@/lib/types';
import { formatAge, isStale } from '@/lib/staleness';
import SeverityBadge from '@/components/SeverityBadge';
import StatusBadge from '@/components/StatusBadge';

interface AlertTableProps {
  alerts: readonly Alert[];
  selectedId: string | null;
  sort: SortSpec;
  now: number | null;
  onSort: (key: SortKey) => void;
  onSelect: (id: string) => void;
}

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: 'severity', label: 'Severity', className: 'w-28' },
  { key: 'title', label: 'Title' },
  { key: 'source', label: 'Source', className: 'w-36' },
  { key: 'status', label: 'Status', className: 'w-28' },
  { key: 'createdAt', label: 'Age', className: 'w-24' },
];

export default function AlertTable({
  alerts,
  selectedId,
  sort,
  now,
  onSort,
  onSelect,
}: AlertTableProps) {
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  useEffect(() => {
    if (selectedId === null) return;
    const el = rowRefs.current.get(selectedId);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedId]);

  return (
    <table className="w-full border-collapse text-left text-[13px]">
      <thead className="sticky top-0 z-10">
        <tr className="border-b border-edge bg-panel shadow-[0_1px_0_0_var(--color-edge)]">
          {COLUMNS.map((col) => {
            const active = sort.key === col.key;
            return (
              <th
                key={col.key}
                scope="col"
                aria-sort={
                  active
                    ? sort.direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : undefined
                }
                className={`px-3 py-0 ${col.className ?? ''}`}
              >
                <button
                  type="button"
                  onClick={() => onSort(col.key)}
                  className={`flex h-8 w-full items-center gap-1 font-mono text-[10px] font-medium uppercase tracking-[0.14em] transition-colors ${
                    active ? 'text-accent' : 'text-faint hover:text-fore'
                  }`}
                >
                  {col.label}
                  <span
                    aria-hidden
                    className={`text-[8px] ${active ? '' : 'invisible'}`}
                  >
                    {active && sort.direction === 'asc' ? '▲' : '▼'}
                  </span>
                </button>
              </th>
            );
          })}
          <th
            scope="col"
            className="w-32 px-3 py-0 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-faint"
          >
            Assignee
          </th>
        </tr>
      </thead>
      <tbody>
        {alerts.length === 0 ? (
          <tr>
            <td colSpan={6} className="px-3 py-16 text-center">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-dim">
                No alerts match
              </p>
              <p className="mt-1.5 text-xs text-faint">
                Adjust the filters or clear the search query.
              </p>
            </td>
          </tr>
        ) : (
          alerts.map((alert) => {
            const selected = alert.id === selectedId;
            const stale = now !== null && isStale(alert, now);
            return (
              <tr
                key={alert.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(alert.id, el);
                  else rowRefs.current.delete(alert.id);
                }}
                data-alert-id={alert.id}
                aria-selected={selected}
                tabIndex={0}
                onClick={() => onSelect(alert.id)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  if (event.key === ' ') event.preventDefault();
                  // Keep the global Enter hotkey from also firing for this press.
                  event.stopPropagation();
                  onSelect(alert.id);
                }}
                className={`cursor-pointer border-b border-edge/60 border-l-2 transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-accent/70 ${
                  stale
                    ? 'border-l-amber-500/80 bg-amber-500/[0.04]'
                    : 'border-l-transparent'
                } ${
                  selected
                    ? 'bg-accent/10 shadow-[inset_0_0_0_1px_rgb(76_201_176/0.45)]'
                    : 'hover:bg-panel-2'
                }`}
              >
                <td className="px-3 py-1.5">
                  <SeverityBadge severity={alert.severity} />
                </td>
                <td className="w-full max-w-0 truncate px-3 py-1.5">
                  <span className="mr-2 font-mono text-[11px] text-dim">
                    {alert.id}
                  </span>
                  {alert.title}
                </td>
                <td className="truncate px-3 py-1.5 text-xs text-faint">
                  {alert.source}
                </td>
                <td className="px-3 py-1.5">
                  <StatusBadge status={alert.status} />
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[11px] tabular-nums text-faint">
                  {now === null ? '—' : formatAge(alert.createdAt, now)}
                  {stale && (
                    <span className="ml-1.5 rounded-sm border border-amber-500/50 bg-amber-500/15 px-1 text-[9px] uppercase tracking-[0.08em] text-amber-300">
                      SLA
                    </span>
                  )}
                </td>
                <td className="truncate px-3 py-1.5 font-mono text-[11px] text-faint">
                  {alert.assignee ?? '—'}
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
