'use client';

import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Alert, SortKey, SortSpec } from '@/lib/types';
import { formatAge, isStale, slaRatio } from '@/lib/staleness';
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

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'severity', label: 'Severity' },
  { key: 'title', label: 'Title' },
  { key: 'source', label: 'Source' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Age' },
];

/** Title has no entry: it absorbs whatever width the others leave over. */
type ResizableColumn = Exclude<SortKey, 'title'> | 'assignee';

const DEFAULT_WIDTHS: Record<ResizableColumn, number> = {
  severity: 112,
  source: 144,
  status: 112,
  createdAt: 96,
  assignee: 128,
};

const WIDTHS_KEY = 'triage.columnWidths.v1';
const MIN_WIDTH = 60;
const MAX_WIDTH = 600;

function clampWidth(value: number): number {
  return Math.min(Math.max(value, MIN_WIDTH), MAX_WIDTH);
}

function parseStoredWidths(
  raw: string | null,
): Record<ResizableColumn, number> | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const widths = { ...DEFAULT_WIDTHS };
  for (const key of Object.keys(DEFAULT_WIDTHS) as ResizableColumn[]) {
    const value = (parsed as Record<string, unknown>)[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      widths[key] = clampWidth(value);
    }
  }
  return widths;
}

export default function AlertTable({
  alerts,
  selectedId,
  sort,
  now,
  onSort,
  onSelect,
}: AlertTableProps) {
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const [widths, setWidths] = useState(DEFAULT_WIDTHS);
  const widthsRef = useRef(widths);
  const dragRef = useRef<{
    column: ResizableColumn;
    startX: number;
    startWidth: number;
  } | null>(null);

  useEffect(() => {
    if (selectedId === null) return;
    const el = rowRefs.current.get(selectedId);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedId]);

  // Hydrate persisted widths after mount (never during render — SSR HTML
  // only knows the defaults).
  useEffect(() => {
    const stored = parseStoredWidths(window.localStorage.getItem(WIDTHS_KEY));
    if (stored !== null) setWidths(stored);
  }, []);

  useEffect(() => {
    widthsRef.current = widths;
  }, [widths]);

  const startResize =
    (column: ResizableColumn) => (event: ReactPointerEvent<HTMLElement>) => {
      // Keep the drag from reaching the sort button or selecting text.
      event.preventDefault();
      event.stopPropagation();
      // Guarded: jsdom has no pointer capture.
      event.currentTarget.setPointerCapture?.(event.pointerId);
      dragRef.current = {
        column,
        startX: event.clientX,
        startWidth: widthsRef.current[column],
      };
    };

  const moveResize = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (drag === null) return;
    const width = clampWidth(drag.startWidth + event.clientX - drag.startX);
    setWidths((prev) =>
      prev[drag.column] === width ? prev : { ...prev, [drag.column]: width },
    );
  };

  const endResize = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current === null) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    window.localStorage.setItem(WIDTHS_KEY, JSON.stringify(widthsRef.current));
  };

  const resizeHandle = (column: ResizableColumn, label: string) => (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label} column`}
      onPointerDown={startResize(column)}
      onPointerMove={moveResize}
      onPointerUp={endResize}
      className="absolute -right-1 top-0 h-full w-2 cursor-col-resize touch-none select-none hover:bg-accent/40"
    />
  );

  return (
    <table className="w-full table-fixed border-collapse text-left text-[13px]">
      <colgroup>
        {COLUMNS.map((col) => (
          <col
            key={col.key}
            data-column={col.key}
            style={col.key === 'title' ? undefined : { width: widths[col.key] }}
          />
        ))}
        <col data-column="assignee" style={{ width: widths.assignee }} />
      </colgroup>
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
                className="relative px-3 py-0"
              >
                <button
                  type="button"
                  onClick={() => onSort(col.key)}
                  className={`flex h-8 w-full items-center gap-1 font-mono text-[11px] font-medium uppercase tracking-[0.14em] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-accent/70 ${
                    active ? 'text-accent' : 'text-faint hover:text-fore'
                  }`}
                >
                  {col.label}
                  <span
                    aria-hidden
                    className={`text-[11px] ${active ? '' : 'invisible'}`}
                  >
                    {active && sort.direction === 'asc' ? '↑' : '↓'}
                  </span>
                </button>
                {col.key !== 'title' && resizeHandle(col.key, col.label)}
              </th>
            );
          })}
          <th
            scope="col"
            className="relative px-3 py-0 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-faint"
          >
            <span className="flex h-8 items-center">Assignee</span>
            {resizeHandle('assignee', 'Assignee')}
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
            const ratio = now === null ? null : slaRatio(alert, now);
            const ageClass = stale
              ? 'text-amber-300'
              : ratio !== null && ratio >= 0.75
                ? 'text-amber-200/80'
                : 'text-faint';
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
                  selected
                    ? 'border-l-accent'
                    : stale
                      ? 'border-l-amber-500/80'
                      : 'border-l-transparent'
                } ${
                  selected
                    ? 'bg-accent/10'
                    : `hover:bg-panel-2 ${stale ? 'bg-amber-500/[0.04]' : ''}`
                }`}
              >
                <td className="px-3 py-1.5">
                  <SeverityBadge severity={alert.severity} variant="plain" />
                </td>
                <td className="truncate px-3 py-1.5">
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
                <td
                  className={`whitespace-nowrap px-3 py-1.5 font-mono text-[11px] tabular-nums ${ageClass}`}
                >
                  {now === null ? '—' : formatAge(alert.createdAt, now)}
                  {stale && (
                    <span className="ml-1.5 rounded-sm border border-amber-500/50 bg-amber-500/15 px-1 text-[11px] uppercase tracking-[0.08em] text-amber-300">
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
