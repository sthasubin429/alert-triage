import alertsJson from '@/data/alerts.json';
import type { Alert } from '@/lib/types';
import TriageView from '@/components/TriageView';

const alerts = alertsJson as Alert[];

export default function Home() {
  return <TriageView initialAlerts={alerts} />;
}
