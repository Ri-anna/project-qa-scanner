import axios from 'axios';
import { Finding, makeFinding } from '../../core/types.js';

// ── CORS ──────────────────────────────────────────────────────────────────────
export async function checkCors(baseUrl: string, timeoutMs = 8000): Promise<Finding[]> {
  try {
    const res = await axios.get(baseUrl, {
      timeout: timeoutMs, validateStatus: () => true,
      headers: { Origin: 'https://evil.example.com' },
    });

    const acao = res.headers['access-control-allow-origin'];
    if (!acao) {
      return [makeFinding('L2','L2:CORS','Pass','Info',
        'No CORS header present; cross-origin requests are blocked by default.',
        '')];
    }
    if (acao === '*') {
      return [makeFinding('L2','L2:CORS','Warn','High',
        `CORS wildcard detected (Access-Control-Allow-Origin: *); any origin may access the API at ${baseUrl}.`,
        'Restrict CORS to known origins. Set Access-Control-Allow-Origin to a specific domain.',
        { header: acao, url: baseUrl })];
    }
    return [makeFinding('L2','L2:CORS','Pass','Info',
      `CORS restricted to specific origin: "${acao}".`,
      '', { header: acao })];
  } catch {
    return [makeFinding('L2','L2:CORS','Skipped','Info',
      `CORS check skipped — service unreachable at ${baseUrl}.`,
      'Start the service and re-run the scan.')];
  }
}

// ── Security Headers ─────────────────────────────────────────────────────────
interface HeaderCheck { name: string; header: string; severity: 'High'|'Medium'; advice: string; }
const REQUIRED_HEADERS: HeaderCheck[] = [
  { name:'CSP',                header:'content-security-policy',    severity:'High',   advice:'Set a strict CSP. At minimum: default-src \'self\'' },
  { name:'X-Content-Type-Options', header:'x-content-type-options', severity:'Medium', advice:'Add header: X-Content-Type-Options: nosniff' },
  { name:'X-Frame-Options',    header:'x-frame-options',            severity:'Medium', advice:'Add header: X-Frame-Options: DENY or SAMEORIGIN' },
  { name:'HSTS',               header:'strict-transport-security',  severity:'High',   advice:'Add header: Strict-Transport-Security: max-age=31536000; includeSubDomains' },
];

export async function checkSecurityHeaders(baseUrl: string, timeoutMs = 8000): Promise<Finding[]> {
  try {
    const res = await axios.get(baseUrl, { timeout: timeoutMs, validateStatus: () => true });
    return REQUIRED_HEADERS.map(({ name, header, severity, advice }) => {
      if (res.headers[header]) {
        return makeFinding('L2','L2:Headers','Pass','Info',
          `${name} header present.`, '', { header });
      }
      return makeFinding('L2','L2:Headers','Warn', severity,
        `${name} header missing from ${baseUrl}.`,
        advice, { missingHeader: header });
    });
  } catch {
    return [makeFinding('L2','L2:Headers','Skipped','Info',
      `Security header check skipped — service unreachable at ${baseUrl}.`,
      'Start the service and re-run.')];
  }
}

// ── Auth Enforcement ──────────────────────────────────────────────────────────
export async function checkAuthEnforcement(
  baseUrl: string,
  protectedPaths: string[],
  timeoutMs = 8000,
): Promise<Finding[]> {
  if (!protectedPaths.length) {
    return [makeFinding('L2','L2:Auth','Skipped','Info',
      'No protected endpoints configured for auth enforcement check.',
      'Set security.protectedEndpoints in config to enable this check.')];
  }

  const findings: Finding[] = [];
  for (const ep of protectedPaths) {
    const url = `${baseUrl}${ep}`;
    try {
      const res = await axios.get(url, { timeout: timeoutMs, validateStatus: () => true });
      if (res.status >= 200 && res.status < 300) {
        findings.push(makeFinding('L2','L2:Auth','Fail','Critical',
          `Protected endpoint ${ep} is accessible without an auth token (returned ${res.status}).`,
          'Enforce authentication middleware on this endpoint.',
          { url, status: res.status }));
      } else {
        findings.push(makeFinding('L2','L2:Auth','Pass','Info',
          `Authentication enforced on ${ep} (returned ${res.status}).`,
          '', { url, status: res.status }));
      }
    } catch {
      findings.push(makeFinding('L2','L2:Auth','Skipped','Info',
        `Auth check skipped for ${ep} — endpoint unreachable.`,
        'Start the service and re-run.', { url }));
    }
  }
  return findings;
}
