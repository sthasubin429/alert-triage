'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { EMPTY_FILTER, type Alert, type Status } from '@/lib/types';
import { applyQuery } from '@/lib/alert-query';
import { isStale } from '@/lib/staleness';
import { initialTriageState, triageReducer } from '@/lib/triage-reducer';
import AlertTable from '@/components/AlertTable';
import DetailDrawer from '@/components/DetailDrawer';
import FilterBar from '@/components/FilterBar';

const STATUS_KEYS: Record<string, Status> = {
  a: 'acknowledged',
  r: 'resolved',
  f: 'false_positive',
  o: 'open',
};

const HINTS: { keys: string; action: string }[] = [
  { keys: 'j / k', action: 'move' },
  { keys: 'enter', action: 'open' },
  { keys: 'a', action: 'ack' },
  { keys: 'r', action: 'resolve' },
  { keys: 'f', action: 'false pos' },
  { keys: 'o', action: 're-open' },
  { keys: '/', action: 'search' },
  { keys: 'esc', action: 'close' },
];

function isEditableTarget(el: Element | null): el is HTMLElement {
  return (
    el instanceof HTMLElement &&
    (el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT' ||
      el.isContentEditable)
  );
}

export default function TriageView({
  initialAlerts,
}: {
  initialAlerts: Alert[];
}) {
  const [state, dispatch] = useReducer(
    triageReducer,
    initialAlerts,
    initialTriageState,
  );
  const [now, setNow] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const { filter, search, sort, selectedId } = state;

  const visible = useMemo(
    () => applyQuery(state.alerts, { filter, search, sort }),
    [state.alerts, filter, search, sort],
  );

  const selectedAlert = useMemo(
    () => state.alerts.find((a) => a.id === selectedId) ?? null,
    [state.alerts, selectedId],
  );

  const counts = useMemo(() => {
    const open = state.alerts.filter((a) => a.status === 'open').length;
    const stale =
      now === null ? null : state.alerts.filter((a) => isStale(a, now)).length;
    return { open, stale };
  }, [state.alerts, now]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const active = document.activeElement;
      const editable = isEditableTarget(active);

      if (event.key === 'Escape') {
        if (editable) {
          active.blur();
          return;
        }
        dispatch({ type: 'CLOSE_DRAWER' });
        return;
      }
      if (editable) return;
      if (active instanceof HTMLElement && active.tagName === 'BUTTON') return;

      if (event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }

      const visibleIds = visible.map((a) => a.id);
      switch (event.key) {
        case 'j':
        case 'ArrowDown':
          event.preventDefault();
          dispatch({ type: 'MOVE_SELECTION', delta: 1, visibleIds });
          return;
        case 'k':
        case 'ArrowUp':
          event.preventDefault();
          dispatch({ type: 'MOVE_SELECTION', delta: -1, visibleIds });
          return;
        case 'Enter':
          if (selectedId !== null) {
            dispatch({ type: 'SELECT', id: selectedId });
          }
          return;
        default: {
          const status = STATUS_KEYS[event.key];
          if (
            status !== undefined &&
            selectedId !== null &&
            (visibleIds.includes(selectedId) || state.drawerOpen)
          ) {
            dispatch({ type: 'SET_STATUS', id: selectedId, status });
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, selectedId, state.drawerOpen]);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-4 border-b border-edge bg-panel px-3 py-2">
        <h1 className="font-mono text-xs font-semibold uppercase tracking-[0.28em] text-fore">
          <span className="text-accent">▮</span> Alert Triage
        </h1>
        <span className="font-mono text-[11px] tabular-nums text-faint">
          {counts.open} open
        </span>
        <span className="font-mono text-[11px] tabular-nums text-faint">
          {counts.stale === null ? '—' : counts.stale} past SLA
        </span>
        <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.14em] text-dim">
          SOC console / mini-view
        </span>
      </header>

      <FilterBar
        filter={filter}
        search={search}
        resultCount={visible.length}
        totalCount={state.alerts.length}
        searchRef={searchRef}
        onSearchChange={(s) => dispatch({ type: 'SET_SEARCH', search: s })}
        onToggleFilter={(t) => dispatch({ type: 'TOGGLE_FILTER', ...t })}
        onClear={() => {
          dispatch({ type: 'SET_FILTER', filter: EMPTY_FILTER });
          dispatch({ type: 'SET_SEARCH', search: '' });
        }}
      />

      <main className="min-h-0 flex-1 overflow-y-auto">
        <AlertTable
          alerts={visible}
          selectedId={selectedId}
          sort={sort}
          now={now}
          onSort={(key) => dispatch({ type: 'SET_SORT', key })}
          onSelect={(id) => dispatch({ type: 'SELECT', id })}
        />
      </main>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-edge bg-panel px-3 py-1.5">
        {HINTS.map((hint) => (
          <span
            key={hint.keys}
            className="font-mono text-[11px] tracking-wide text-dim"
          >
            <kbd className="rounded-sm border border-edge bg-panel-2 px-1 py-px text-faint">
              {hint.keys}
            </kbd>{' '}
            {hint.action}
          </span>
        ))}
      </footer>

      <DetailDrawer
        alert={selectedAlert}
        open={state.drawerOpen}
        now={now}
        onClose={() => dispatch({ type: 'CLOSE_DRAWER' })}
        onSetStatus={(id, status) =>
          dispatch({ type: 'SET_STATUS', id, status })
        }
      />
    </div>
  );
}
