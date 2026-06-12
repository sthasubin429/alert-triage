import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AlertTable from '@/components/AlertTable';
import type { Alert } from '@/lib/types';

const ALERTS: Alert[] = [
  {
    id: 'AL-2001',
    title: 'Resize fixture alert',
    severity: 'high',
    status: 'open',
    source: 'Okta',
    createdAt: '2026-06-01T00:00:00.000Z',
    assignee: null,
  },
];

// RTL auto-cleanup needs vitest globals; this config does not enable them.
// localStorage persists across tests in a file (column widths).
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function renderTable(onSort: (key: string) => void = () => {}) {
  return render(
    <AlertTable
      alerts={ALERTS}
      selectedId={null}
      sort={{ key: 'createdAt', direction: 'desc' }}
      now={null}
      onSort={onSort}
      onSelect={() => {}}
    />,
  );
}

function colWidth(container: HTMLElement, column: string): string {
  const col = container.querySelector<HTMLElement>(
    `col[data-column="${column}"]`,
  );
  if (!col) throw new Error(`col not found for: ${column}`);
  return col.style.width;
}

describe('AlertTable column resizing', () => {
  it('renders a colgroup with default widths; title has none (absorbs the rest)', () => {
    const { container } = renderTable();
    expect(colWidth(container, 'severity')).toBe('112px');
    expect(colWidth(container, 'source')).toBe('144px');
    expect(colWidth(container, 'status')).toBe('112px');
    expect(colWidth(container, 'createdAt')).toBe('96px');
    expect(colWidth(container, 'assignee')).toBe('128px');
    expect(colWidth(container, 'title')).toBe('');
  });

  it('dragging a handle resizes its column and persists the widths', () => {
    const { container } = renderTable();
    const handle = screen.getByRole('separator', {
      name: 'Resize Severity column',
    });

    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 140, pointerId: 1 });
    expect(colWidth(container, 'severity')).toBe('152px');

    fireEvent.pointerUp(handle, { clientX: 140, pointerId: 1 });
    const stored = JSON.parse(
      window.localStorage.getItem('triage.columnWidths.v1') ?? '{}',
    );
    expect(stored.severity).toBe(152);
    // other columns untouched
    expect(colWidth(container, 'source')).toBe('144px');
  });

  it('clamps widths to the minimum when dragged far left', () => {
    const { container } = renderTable();
    const handle = screen.getByRole('separator', {
      name: 'Resize Status column',
    });

    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: -500, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: -500, pointerId: 1 });

    expect(colWidth(container, 'status')).toBe('60px');
  });

  it('pointer interaction with a handle never triggers the sort button', () => {
    const onSort = vi.fn();
    renderTable(onSort);
    const handle = screen.getByRole('separator', {
      name: 'Resize Severity column',
    });

    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 100, pointerId: 1 });
    fireEvent.click(handle);

    expect(onSort).not.toHaveBeenCalled();
    expect(
      screen.getByRole('columnheader', { name: /Severity/ }),
    ).not.toHaveAttribute('aria-sort');
  });

  it('hydrates persisted widths on mount', () => {
    window.localStorage.setItem(
      'triage.columnWidths.v1',
      JSON.stringify({ severity: 200, status: 'garbage', createdAt: 5000 }),
    );
    const { container } = renderTable();
    expect(colWidth(container, 'severity')).toBe('200px');
    expect(colWidth(container, 'status')).toBe('112px'); // non-number ignored
    expect(colWidth(container, 'createdAt')).toBe('600px'); // clamped to max
  });
});
