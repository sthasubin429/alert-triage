import type { Severity } from '@/lib/types';

const STYLES: Record<Severity, string> = {
  critical: 'border-red-500/50 bg-red-500/15 text-red-300',
  high: 'border-orange-500/50 bg-orange-500/15 text-orange-300',
  medium: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
  low: 'border-sky-700/50 bg-sky-500/10 text-sky-300/80',
};

const DOT: Record<Severity, string> = {
  critical: 'bg-red-400',
  high: 'bg-orange-400',
  medium: 'bg-amber-300',
  low: 'bg-sky-400/70',
};

export default function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.08em] ${STYLES[severity]}`}
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${DOT[severity]} ${
          severity === 'critical' ? 'animate-pulse' : ''
        }`}
      />
      {severity}
    </span>
  );
}
