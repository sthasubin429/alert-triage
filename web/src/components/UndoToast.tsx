'use client';

import type { StatusChange } from '@/lib/triage-reducer';
import type { Status } from '@/lib/types';

function formatStatus(status: Status): string {
  return status.replace('_', ' ');
}

/** Live region stays mounted so screen readers announce content changes. */
export default function UndoToast({ change }: { change: StatusChange | null }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-10 left-3 z-30"
    >
      {change !== null && (
        <p className="rounded-sm border border-edge-2 bg-panel-2 px-3 py-2 font-mono text-[11px] text-fore shadow-lg">
          <span className="text-accent">{change.id}</span>
          {' → '}
          {formatStatus(change.to)}
          <span className="text-faint">
            {' — press '}
            <kbd className="rounded-sm border border-edge bg-panel px-1 py-px text-faint">
              u
            </kbd>
            {' to undo'}
          </span>
        </p>
      )}
    </div>
  );
}
