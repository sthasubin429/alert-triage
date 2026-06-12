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
    assignee: 'mira.chen',
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
afterEach(cleanup);

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
    const statusFilter = screen.getByLabelText('Filter by status');

    await user.selectOptions(statusFilter, 'open');
    await user.keyboard('{Escape}'); // blur the select so hotkeys are live
    await user.keyboard('j');
    await user.keyboard('a'); // acknowledge: row leaves the "open" filter

    const table = screen.getByRole('table');
    expect(within(table).queryByText(firstTitle)).not.toBeInTheDocument();
    await user.keyboard('r'); // must no-op: selected row is not visible

    await user.selectOptions(statusFilter, '');
    expect(within(rowOf(firstTitle)).getByText('ack')).toBeInTheDocument();
    expect(
      within(rowOf(firstTitle)).queryByText('resolved'),
    ).not.toBeInTheDocument();
  });

  it('Enter on a focused sort header sorts without opening the drawer', async () => {
    const user = userEvent.setup();
    render(<TriageView initialAlerts={FIXTURE} />);

    await user.keyboard('j'); // select a row so a global Enter would open it
    screen.getByRole('button', { name: 'Severity' }).focus();
    await user.keyboard('{Enter}');

    expect(
      screen.getByRole('columnheader', { name: 'Severity' }),
    ).toHaveAttribute('aria-sort', 'descending');
    expect(
      screen.queryByRole('dialog', { name: 'Alert detail' }),
    ).not.toBeInTheDocument();
  });
});
