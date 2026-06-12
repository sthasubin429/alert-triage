import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import TriageView from '@/components/TriageView';
import type { Alert } from '@/lib/types';

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

// Default sort is createdAt desc, so FIXTURE[0] (newest) renders first.
const FIXTURE: Alert[] = [
  {
    id: 'AL-1001',
    title: 'Alpha beacon to known C2 infrastructure',
    severity: 'critical',
    status: 'open',
    source: 'CrowdStrike EDR',
    createdAt: minutesAgo(5),
    assignee: null,
  },
  {
    id: 'AL-1002',
    title: 'Bravo impossible-travel login for j.doe',
    severity: 'high',
    status: 'open',
    source: 'Okta',
    createdAt: minutesAgo(30),
    // CURRENT_ANALYST: the "Assigned to me" built-in view matches this row.
    assignee: 'maya.chen',
  },
  {
    id: 'AL-1003',
    title: 'Charlie S3 bucket policy made public',
    severity: 'medium',
    status: 'acknowledged',
    source: 'AWS GuardDuty',
    createdAt: minutesAgo(90),
    assignee: 'sam.ortiz',
  },
  {
    id: 'AL-1004',
    title: 'Delta phishing campaign targeting finance',
    severity: 'low',
    status: 'resolved',
    source: 'Email Gateway',
    createdAt: minutesAgo(240),
    assignee: null,
  },
  {
    id: 'AL-1005',
    title: 'Echo lateral SMB scanning from WS-ENG-042',
    severity: 'high',
    status: 'false_positive',
    source: 'Suricata IDS',
    createdAt: minutesAgo(600),
    assignee: 'mira.chen',
  },
];

// Scoped to the table: a selected alert's title also exists in the drawer.
function rowOf(title: string): HTMLElement {
  const table = screen.getByRole('table');
  const row = within(table).getByText(title).closest('tr');
  if (!row) throw new Error(`row not found for: ${title}`);
  return row;
}

// RTL auto-cleanup needs vitest globals; this config does not enable them.
// localStorage persists across tests in a file (saved views, column widths).
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('TriageView', () => {
  it('renders one row per alert in the fixture', () => {
    render(<TriageView initialAlerts={FIXTURE} />);
    for (const alert of FIXTURE) {
      expect(screen.getByText(alert.title)).toBeInTheDocument();
    }
    const tbodyRows = screen
      .getAllByRole('row')
      .filter((row) => row.closest('tbody'));
    expect(tbodyRows).toHaveLength(FIXTURE.length);
  });

  it('opens the drawer with the alert title when a row is clicked', async () => {
    const user = userEvent.setup();
    render(<TriageView initialAlerts={FIXTURE} />);

    await user.click(screen.getByText('Charlie S3 bucket policy made public'));

    const dialog = screen.getByRole('dialog', { name: 'Alert detail' });
    expect(
      within(dialog).getByRole('heading', {
        name: 'Charlie S3 bucket policy made public',
      }),
    ).toBeInTheDocument();
  });

  it('updates the row status badge when Acknowledged is clicked in the drawer', async () => {
    const user = userEvent.setup();
    render(<TriageView initialAlerts={FIXTURE} />);
    const title = 'Bravo impossible-travel login for j.doe';

    expect(within(rowOf(title)).getByText('open')).toBeInTheDocument();

    await user.click(screen.getByText(title));
    const dialog = screen.getByRole('dialog', { name: 'Alert detail' });
    await user.click(
      within(dialog).getByRole('button', { name: 'Acknowledged' }),
    );

    expect(within(rowOf(title)).getByText('ack')).toBeInTheDocument();
    expect(within(rowOf(title)).queryByText('open')).not.toBeInTheDocument();
  });

  it('acknowledges the first row via keyboard: j then a', async () => {
    const user = userEvent.setup();
    render(<TriageView initialAlerts={FIXTURE} />);
    const firstTitle = 'Alpha beacon to known C2 infrastructure';

    await user.keyboard('j');
    expect(rowOf(firstTitle)).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('a');
    expect(within(rowOf(firstTitle)).getByText('ack')).toBeInTheDocument();
  });

  it('narrows rows when typing in search', async () => {
    const user = userEvent.setup();
    render(<TriageView initialAlerts={FIXTURE} />);

    await user.type(screen.getByRole('searchbox'), 'Alpha');

    expect(
      screen.getByText('Alpha beacon to known C2 infrastructure'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Bravo impossible-travel login for j.doe'),
    ).not.toBeInTheDocument();
    const tbodyRows = screen
      .getAllByRole('row')
      .filter((row) => row.closest('tbody'));
    expect(tbodyRows).toHaveLength(1);
    expect(screen.getByLabelText('Result count')).toHaveTextContent('1 of 5');
  });

  it('focuses search on /; first Escape only blurs, second closes the drawer', async () => {
    const user = userEvent.setup();
    render(<TriageView initialAlerts={FIXTURE} />);

    await user.click(
      screen.getByText('Delta phishing campaign targeting finance'),
    );
    expect(
      screen.getByRole('dialog', { name: 'Alert detail' }),
    ).toBeInTheDocument();

    await user.keyboard('/');
    const search = screen.getByRole('searchbox');
    expect(search).toHaveFocus();
    expect(search).toHaveValue('');

    await user.keyboard('{Escape}');
    expect(search).not.toHaveFocus();
    expect(
      screen.getByRole('dialog', { name: 'Alert detail' }),
    ).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('dialog', { name: 'Alert detail' }),
    ).not.toBeInTheDocument();
  });

  it('does not change status when a hotkey is pressed with a modifier (Cmd+A)', async () => {
    const user = userEvent.setup();
    render(<TriageView initialAlerts={FIXTURE} />);
    const firstTitle = 'Alpha beacon to known C2 infrastructure';

    await user.keyboard('j');
    expect(rowOf(firstTitle)).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Meta>}a{/Meta}');
    expect(within(rowOf(firstTitle)).getByText('open')).toBeInTheDocument();
    expect(
      within(rowOf(firstTitle)).queryByText('ack'),
    ).not.toBeInTheDocument();
  });

  it('ignores status hotkeys once the selected row is filtered out (drawer closed)', async () => {
    const user = userEvent.setup();
    render(<TriageView initialAlerts={FIXTURE} />);
    const firstTitle = 'Alpha beacon to known C2 infrastructure';

    await user.keyboard('j'); // select Alpha
    expect(rowOf(firstTitle)).toHaveAttribute('aria-selected', 'true');

    await user.type(screen.getByRole('searchbox'), 'Bravo');
    await user.keyboard('{Escape}'); // blur search; Alpha is selected but not visible
    const table = screen.getByRole('table');
    expect(within(table).queryByText(firstTitle)).not.toBeInTheDocument();

    await user.keyboard('r'); // must no-op: selected row is not visible

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(within(rowOf(firstTitle)).getByText('open')).toBeInTheDocument();
    expect(
      within(rowOf(firstTitle)).queryByText('resolved'),
    ).not.toBeInTheDocument();
  });

  it('combines multiple selections within a filter group (critical OR medium)', async () => {
    const user = userEvent.setup();
    render(<TriageView initialAlerts={FIXTURE} />);
    const severityGroup = screen.getByRole('group', {
      name: 'Filter by severity',
    });
    const critical = within(severityGroup).getByRole('button', {
      name: 'critical',
    });
    const medium = within(severityGroup).getByRole('button', {
      name: 'medium',
    });

    await user.click(critical);
    await user.click(medium);
    expect(critical).toHaveAttribute('aria-pressed', 'true');
    expect(medium).toHaveAttribute('aria-pressed', 'true');

    const tbodyRows = screen
      .getAllByRole('row')
      .filter((row) => row.closest('tbody'));
    expect(tbodyRows).toHaveLength(2); // AL-1001 (critical) + AL-1003 (medium)
    expect(screen.getByLabelText('Result count')).toHaveTextContent('2 of 5');

    await user.click(medium); // deselect medium again
    expect(medium).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('Result count')).toHaveTextContent('1 of 5');

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByLabelText('Result count')).toHaveTextContent('5 of 5');
  });

  it('Enter on a focused sort header sorts without opening the drawer', async () => {
    const user = userEvent.setup();
    render(<TriageView initialAlerts={FIXTURE} />);

    await user.keyboard('j'); // select a row so a global Enter would open it
    screen.getByRole('button', { name: 'Severity' }).focus();
    await user.keyboard('{Enter}');

    // the resize handle's aria-label is part of the columnheader's name
    expect(
      screen.getByRole('columnheader', { name: /^Severity/ }),
    ).toHaveAttribute('aria-sort', 'descending');
    expect(
      screen.queryByRole('dialog', { name: 'Alert detail' }),
    ).not.toBeInTheDocument();
  });
});

function tablist(): HTMLElement {
  return screen.getByRole('tablist', { name: 'Saved views' });
}

function activeTabs(): HTMLElement[] {
  return within(tablist())
    .getAllByRole('tab')
    .filter((tab) => tab.getAttribute('aria-selected') === 'true');
}

describe('TriageView saved views', () => {
  it('renders the built-in tabs with All alerts active and no delete buttons', () => {
    render(<TriageView initialAlerts={FIXTURE} />);
    const tabs = within(tablist()).getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(within(tabs[0]).getByText('All alerts')).toBeInTheDocument();
    expect(
      within(tablist()).queryByRole('button', { name: /Delete view/ }),
    ).not.toBeInTheDocument();
  });

  it('clicking a tab applies its query; All alerts restores everything', async () => {
    const user = userEvent.setup();
    render(<TriageView initialAlerts={FIXTURE} />);

    await user.click(screen.getByRole('button', { name: /Assigned to me/ }));
    expect(screen.getByLabelText('Result count')).toHaveTextContent('1 of 5');
    expect(
      screen.getByText('Bravo impossible-travel login for j.doe'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Hot queue/ }));
    expect(screen.getByLabelText('Result count')).toHaveTextContent('2 of 5');

    await user.click(screen.getByRole('button', { name: /All alerts/ }));
    expect(screen.getByLabelText('Result count')).toHaveTextContent('5 of 5');
  });

  it('switches views with number hotkeys', async () => {
    const user = userEvent.setup();
    render(<TriageView initialAlerts={FIXTURE} />);

    await user.keyboard('2');
    expect(screen.getByLabelText('Result count')).toHaveTextContent('2 of 5');
    expect(activeTabs()).toHaveLength(1);
    expect(within(activeTabs()[0]).getByText('Hot queue')).toBeInTheDocument();

    await user.keyboard('1');
    expect(screen.getByLabelText('Result count')).toHaveTextContent('5 of 5');
  });

  it('changing a filter deselects the active tab (dirty query)', async () => {
    const user = userEvent.setup();
    render(<TriageView initialAlerts={FIXTURE} />);
    const severityGroup = screen.getByRole('group', {
      name: 'Filter by severity',
    });

    await user.click(
      within(severityGroup).getByRole('button', { name: 'critical' }),
    );
    expect(activeTabs()).toHaveLength(0);
  });

  it('typing a digit in the search box does not switch views', async () => {
    const user = userEvent.setup();
    render(<TriageView initialAlerts={FIXTURE} />);

    await user.type(screen.getByRole('searchbox'), '2');
    // an APPLY_VIEW would have reset the search and activated Hot queue
    expect(screen.getByRole('searchbox')).toHaveValue('2');
    expect(activeTabs()).toHaveLength(0);
  });

  it('saves the current query as a named view and re-applies it', async () => {
    const user = userEvent.setup();
    render(<TriageView initialAlerts={FIXTURE} />);
    const severityGroup = screen.getByRole('group', {
      name: 'Filter by severity',
    });

    await user.click(
      within(severityGroup).getByRole('button', { name: 'critical' }),
    );
    expect(screen.getByLabelText('Result count')).toHaveTextContent('1 of 5');

    await user.click(screen.getByRole('button', { name: 'Save current view' }));
    await user.type(screen.getByLabelText('View name'), 'crit only');
    await user.keyboard('{Enter}');

    expect(activeTabs()).toHaveLength(1);
    expect(within(activeTabs()[0]).getByText('crit only')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByLabelText('Result count')).toHaveTextContent('5 of 5');

    // exact: /crit only/ would also match the "Delete view crit only" button
    const critTab = within(tablist()).getByRole('button', {
      name: 'crit only',
    });
    await user.click(critTab);
    expect(screen.getByLabelText('Result count')).toHaveTextContent('1 of 5');
  });

  it('rejects empty and duplicate view names with an inline error', async () => {
    const user = userEvent.setup();
    render(<TriageView initialAlerts={FIXTURE} />);

    await user.click(screen.getByRole('button', { name: 'Save current view' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name');

    await user.type(screen.getByLabelText('View name'), 'all ALERTS');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Name already in use');
    expect(within(tablist()).getAllByRole('tab')).toHaveLength(3);
  });

  it('persists custom views across a remount via localStorage', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<TriageView initialAlerts={FIXTURE} />);

    await user.click(screen.getByRole('button', { name: 'Save current view' }));
    await user.type(screen.getByLabelText('View name'), 'my shift');
    await user.keyboard('{Enter}');
    expect(
      within(tablist()).getByRole('button', { name: 'my shift' }),
    ).toBeInTheDocument();

    unmount();
    render(<TriageView initialAlerts={FIXTURE} />);
    expect(
      within(tablist()).getByRole('button', { name: 'my shift' }),
    ).toBeInTheDocument();
  });

  it('deletes a custom view and falls back to All alerts when it was active', async () => {
    const user = userEvent.setup();
    render(<TriageView initialAlerts={FIXTURE} />);

    await user.keyboard('2'); // Hot queue: a non-default query to capture
    await user.click(screen.getByRole('button', { name: 'Save current view' }));
    await user.type(screen.getByLabelText('View name'), 'doomed');
    await user.keyboard('{Enter}');
    expect(activeTabs()).toHaveLength(1);

    await user.click(
      within(tablist()).getByRole('button', { name: 'Delete view doomed' }),
    );
    expect(
      within(tablist()).queryByRole('button', { name: /doomed/ }),
    ).not.toBeInTheDocument();
    expect(within(activeTabs()[0]).getByText('All alerts')).toBeInTheDocument();
    expect(screen.getByLabelText('Result count')).toHaveTextContent('5 of 5');
  });
});

describe('TriageView auto-advance and undo', () => {
  it('a status hotkey advances the selection to the next visible row', async () => {
    const user = userEvent.setup();
    render(<TriageView initialAlerts={FIXTURE} />);
    const alpha = 'Alpha beacon to known C2 infrastructure';
    const bravo = 'Bravo impossible-travel login for j.doe';

    await user.keyboard('j'); // select Alpha (first row)
    await user.keyboard('a');

    expect(within(rowOf(alpha)).getByText('ack')).toBeInTheDocument();
    expect(rowOf(bravo)).toHaveAttribute('aria-selected', 'true');
  });

  it('disposing the last visible row selects the previous one', async () => {
    const user = userEvent.setup();
    render(<TriageView initialAlerts={FIXTURE} />);
    const delta = 'Delta phishing campaign targeting finance';
    const echo = 'Echo lateral SMB scanning from WS-ENG-042';

    await user.keyboard('k'); // from nothing, k selects the last row (Echo)
    expect(rowOf(echo)).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('o'); // re-open the false positive
    expect(within(rowOf(echo)).getByText('open')).toBeInTheDocument();
    expect(rowOf(delta)).toHaveAttribute('aria-selected', 'true');
  });

  it('disposing the only visible row clears the selection', async () => {
    const user = userEvent.setup();
    render(<TriageView initialAlerts={FIXTURE} />);

    await user.type(screen.getByRole('searchbox'), 'Alpha');
    await user.keyboard('{Escape}'); // blur the search box
    await user.keyboard('j');
    await user.keyboard('a');

    const tbodyRows = screen
      .getAllByRole('row')
      .filter((row) => row.closest('tbody'));
    expect(tbodyRows).toHaveLength(1); // Alpha still matches the search
    for (const row of tbodyRows) {
      expect(row).toHaveAttribute('aria-selected', 'false');
    }
  });

  it('disposing from the drawer does not move the selection', async () => {
    const user = userEvent.setup();
    render(<TriageView initialAlerts={FIXTURE} />);
    const bravo = 'Bravo impossible-travel login for j.doe';

    await user.click(screen.getByText(bravo));
    const dialog = screen.getByRole('dialog', { name: 'Alert detail' });
    await user.click(
      within(dialog).getByRole('button', { name: 'Acknowledged' }),
    );

    expect(rowOf(bravo)).toHaveAttribute('aria-selected', 'true');
  });

  it('shows an undo toast after a hotkey disposition and u reverts it', async () => {
    const user = userEvent.setup();
    render(<TriageView initialAlerts={FIXTURE} />);
    const alpha = 'Alpha beacon to known C2 infrastructure';

    await user.keyboard('j');
    await user.keyboard('a');
    expect(screen.getByRole('status')).toHaveTextContent(
      'AL-1001 → acknowledged — press u to undo',
    );

    await user.keyboard('u');
    expect(within(rowOf(alpha)).getByText('open')).toBeInTheDocument();
    expect(rowOf(alpha)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('undo unwinds multiple changes in reverse order', async () => {
    const user = userEvent.setup();
    render(<TriageView initialAlerts={FIXTURE} />);
    const alpha = 'Alpha beacon to known C2 infrastructure';
    const bravo = 'Bravo impossible-travel login for j.doe';

    await user.keyboard('j'); // Alpha
    await user.keyboard('a'); // ack Alpha, advance to Bravo
    await user.keyboard('r'); // resolve Bravo

    await user.keyboard('u'); // Bravo back to open
    expect(within(rowOf(bravo)).getByText('open')).toBeInTheDocument();
    await user.keyboard('u'); // Alpha back to open
    expect(within(rowOf(alpha)).getByText('open')).toBeInTheDocument();
  });
});
