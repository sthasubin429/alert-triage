'use client';

import { STATUSES, type Alert, type Status } from '@/lib/types';
import { formatAge, isStale } from '@/lib/staleness';
import SeverityBadge from '@/components/SeverityBadge';
import StatusBadge from '@/components/StatusBadge';

interface DetailDrawerProps {
  alert: Alert | null;
  open: boolean;
  now: number | null;
  onClose: () => void;
  onSetStatus: (id: string, status: Status) => void;
}

const STATUS_LABELS: Record<Status, string> = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  resolved: 'Resolved',
  false_positive: 'False positive',
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-edge/60 py-2.5">
      <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-dim">
        {label}
      </dt>
      <dd className="mt-1 text-[13px]">{children}</dd>
    </div>
  );
}

export default function DetailDrawer({
  alert,
  open,
  now,
  onClose,
  onSetStatus,
}: DetailDrawerProps) {
  const visible = open && alert !== null;

  return (
    <aside
      role="dialog"
      aria-label="Alert detail"
      aria-hidden={!visible}
      inert={!visible}
      className={`fixed inset-y-0 right-0 z-30 flex w-[26rem] max-w-full flex-col border-l border-edge bg-panel shadow-[-24px_0_48px_-24px_rgb(0_0_0/0.8)] transition-transform duration-200 ease-out motion-reduce:transition-none ${
        visible ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      {alert !== null && (
        <>
          <header className="flex items-start gap-3 border-b border-edge px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[11px] text-dim">{alert.id}</p>
              <h2 className="mt-0.5 text-sm font-medium leading-snug">
                {alert.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close drawer"
              className="rounded-sm border border-edge px-2 py-1 font-mono text-[11px] text-faint transition-colors hover:border-edge-2 hover:text-fore focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-accent/70"
            >
              esc
            </button>
          </header>

          <dl className="flex-1 overflow-y-auto px-4">
            <Field label="Severity">
              <SeverityBadge severity={alert.severity} />
            </Field>
            <Field label="Status">
              <StatusBadge status={alert.status} />
              {now !== null && isStale(alert, now) && (
                <span className="ml-2 rounded-sm border border-amber-500/50 bg-amber-500/15 px-1.5 py-px font-mono text-[11px] uppercase tracking-[0.08em] text-amber-300">
                  SLA breach
                </span>
              )}
            </Field>
            <Field label="Source">{alert.source}</Field>
            <Field label="Created">
              <span className="font-mono text-xs tabular-nums">
                {alert.createdAt}
              </span>
              <span className="ml-2 font-mono text-[11px] text-faint">
                {now === null ? '—' : `${formatAge(alert.createdAt, now)} ago`}
              </span>
            </Field>
            <Field label="Assignee">
              {alert.assignee ?? <span className="text-dim">— unassigned</span>}
            </Field>
          </dl>

          <footer className="border-t border-edge px-4 py-3">
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-dim">
              Set status
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {STATUSES.map((status) => {
                const current = alert.status === status;
                return (
                  <button
                    key={status}
                    type="button"
                    disabled={current}
                    onClick={() => onSetStatus(alert.id, status)}
                    className={`h-8 rounded-sm border px-2 text-xs transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-accent/70 ${
                      current
                        ? 'border-accent/60 bg-accent/15 font-medium text-accent'
                        : 'border-edge bg-panel-2 text-faint hover:border-edge-2 hover:text-fore'
                    }`}
                  >
                    {STATUS_LABELS[status]}
                  </button>
                );
              })}
            </div>
          </footer>
        </>
      )}
    </aside>
  );
}
