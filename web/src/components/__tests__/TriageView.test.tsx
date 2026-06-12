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
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('focuses search on / and closes the drawer on Escape', async () => {
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
      screen.queryByRole('dialog', { name: 'Alert detail' }),
    ).not.toBeInTheDocument();
  });
});
