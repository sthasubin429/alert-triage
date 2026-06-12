/**
 * Deterministic mock-alert generator (seeded PRNG, fixed reference date).
 * Run with: node scripts/generate-alerts.ts
 * Output is committed at src/data/alerts.json so reviewers never need to run this.
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
const STATUSES = [
  'open',
  'acknowledged',
  'resolved',
  'false_positive',
] as const;
const SOURCES = [
  'CrowdStrike EDR',
  'Okta',
  'AWS GuardDuty',
  'Suricata IDS',
  'Email Gateway',
] as const;

const ANALYSTS = [
  'maya.chen',
  'liam.okafor',
  'sofia.reyes',
  'noah.lindqvist',
  'ava.petrov',
  'ethan.tanaka',
];

const TITLE_TEMPLATES: Record<(typeof SOURCES)[number], string[]> = {
  'CrowdStrike EDR': [
    'Suspicious PowerShell execution on {host}',
    'Credential dumping attempt detected on {host}',
    'Ransomware-like file encryption behavior on {host}',
    'Unsigned driver loaded on {host}',
    'Lateral movement via PsExec from {host}',
  ],
  Okta: [
    'Impossible travel sign-in for {user}',
    'MFA fatigue: repeated push denials for {user}',
    'Sign-in from anonymizing proxy for {user}',
    'Privileged role granted to {user} outside change window',
    'Brute-force lockout threshold reached for {user}',
  ],
  'AWS GuardDuty': [
    'EC2 instance {host} communicating with known C2 domain',
    'IAM access key exfiltration pattern for {user}',
    'S3 bucket enumeration from unusual ASN by {user}',
    'CryptoMining:EC2 bitcoin pool contact from {host}',
    'Root account console login without MFA',
  ],
  'Suricata IDS': [
    'ET MALWARE Cobalt Strike beacon from {host}',
    'SQL injection attempt against {host}',
    'Outbound TLS to newly-registered domain from {host}',
    'SMB exploit attempt (EternalBlue) targeting {host}',
    'DNS tunneling pattern detected from {host}',
  ],
  'Email Gateway': [
    'Phishing campaign: credential-harvest link delivered to {user}',
    'Malicious macro attachment quarantined for {user}',
    'Business email compromise attempt impersonating CFO to {user}',
    'Bulk spear-phish wave targeting finance team',
    'Suspicious inbox forwarding rule created by {user}',
  ],
};

const HOSTS = [
  'WS-ENG-042',
  'WS-FIN-007',
  'SRV-DB-PROD-01',
  'SRV-WEB-EDGE-03',
  'LT-SALES-118',
  'SRV-AD-DC-02',
  'WS-HR-015',
  'SRV-K8S-NODE-09',
];

// mulberry32 — tiny seeded PRNG, deterministic across runs
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(42);

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

// Fixed reference date so output never drifts between runs
const NOW = Date.parse('2026-06-12T00:00:00.000Z');
const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;

const COUNT = 200;
const alerts = Array.from({ length: COUNT }, (_, i) => {
  const source = pick(SOURCES);
  const title = pick(TITLE_TEMPLATES[source])
    .replace('{host}', pick(HOSTS))
    .replace(
      '{user}',
      `${pick(ANALYSTS).split('.')[0]}.${pick(['w', 'm', 'k', 't'])}@corp.example`,
    );
  const status = pick(STATUSES);
  return {
    id: `AL-${String(i + 1).padStart(4, '0')}`,
    title,
    severity: pick(SEVERITIES),
    status,
    source,
    createdAt: new Date(NOW - Math.floor(rand() * FOURTEEN_DAYS)).toISOString(),
    // open alerts are usually unassigned; triaged ones usually have an owner
    assignee:
      status === 'open'
        ? rand() < 0.25
          ? pick(ANALYSTS)
          : null
        : rand() < 0.85
          ? pick(ANALYSTS)
          : null,
  };
});

const outPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'data',
  'alerts.json',
);
writeFileSync(outPath, JSON.stringify(alerts, null, 2) + '\n');
console.log(`Wrote ${alerts.length} alerts to ${outPath}`);
