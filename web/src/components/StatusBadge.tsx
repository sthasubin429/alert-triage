import type { Status } from '@/lib/types';

const STYLES: Record<Status, string> = {
  open: 'border-rose-500/50 bg-rose-500/10 text-rose-300',
  acknowledged: 'border-blue-500/50 bg-blue-500/10 text-blue-300',
  resolved: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  false_positive: 'border-zinc-600/60 bg-zinc-500/10 text-zinc-400',
};

const LABELS: Record<Status, string> = {
  open: 'open',
  acknowledged: 'ack',
  resolved: 'resolved',
  false_positive: 'false pos',
};

export default function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-px font-mono text-[11px] uppercase tracking-[0.08em] ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
