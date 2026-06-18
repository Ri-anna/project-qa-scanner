import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { Finding, makeFinding } from '../../core/types.js';
import type { Endpoint, Config } from '../../config/schema.js';

function buildAuthHeaders(auth: Config['api']['auth']): Record<string, string> {
  if (!auth) return {};
  if (auth.type === 'bearer' && auth.token) return { Authorization: `Bearer ${auth.token}` };
  if (auth.type === 'basic' && auth.token) return { Authorization: `Basic ${auth.token}` };
  if (auth.type === 'apikey' && auth.key && auth.value) return { [auth.key]: auth.value };
  return {};
}

function validateShape(
  body: unknown,
  schema: Record<string, unknown>,
  pathPrefix = '',
): string[] {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return [`${pathPrefix || 'response'} is not an object`];
  }
  const errors: string[] = [];
  for (const key of Object.keys(schema)) {
    const fieldPath = pathPrefix ? `${pathPrefix}.${key}` : key;
    if (!(key in (body as Record<string, unknown>))) {
      errors.push(`Missing field: ${fieldPath}`);
    }
  }
  return errors;
}

export async function checkEndpoints(
  endpoints: Endpoint[],
  auth: Config['api']['auth'],
  defaultLatencyMs: number,
  baseUrl?: string,
): Promise<Finding[]> {
  if (!endpoints.length) {
    return [makeFinding('L3', 'L3:Endpoints', 'Skipped', 'Info',
      'No API endpoints configured.',
      'Add api.endpoints entries to config to enable contract and latency testing.')];
  }

  const findings: Finding[] = [];
  const authHeaders = buildAuthHeaders(auth);

  for (const ep of endpoints) {
    const url = baseUrl && !ep.url.startsWith('http') ? `${baseUrl}${ep.url}` : ep.url;
    const latencyThreshold = ep.latencyThresholdMs ?? defaultLatencyMs;

    const reqConfig: AxiosRequestConfig = {
      method:         ep.method,
      url,
      headers:        { ...(ep.sendAuth ? authHeaders : {}), ...(ep.headers ?? {}) },
      data:           ep.body,
      timeout:        latencyThreshold + 5000,
      validateStatus: () => true,
    };

    const start = Date.now();
    let res: AxiosResponse;
    try {
      res = await axios.request<unknown>(reqConfig);
    } catch {
      findings.push(makeFinding('L3', 'L3:Endpoints', 'Skipped', 'Info',
        `Endpoint unreachable: ${ep.method} ${url}`,
        'Start the API service and re-run.', { url, method: ep.method }));
      continue;
    }
    const latencyMs = Date.now() - start;

    // ── Status code check (TC-L3-001) ────────────────────────────────────
    if (res.status !== ep.expectedStatus) {
      findings.push(makeFinding('L3', 'L3:Contract', 'Fail', 'High',
        `${ep.method} ${url} returned ${res.status}, expected ${ep.expectedStatus}.`,
        `Investigate why the endpoint returns an unexpected status code.`,
        { url, method: ep.method, expected: ep.expectedStatus, actual: res.status }));
    } else {
      findings.push(makeFinding('L3', 'L3:Contract', 'Pass', 'Info',
        `${ep.method} ${url} returned expected status ${res.status}.`,
        '', { url, method: ep.method, status: res.status }));
    }

    // ── Response shape check (TC-L3-005) ──────────────────────────────────
    if (ep.responseSchema && Object.keys(ep.responseSchema).length > 0) {
      const shapeErrors = validateShape(res.data, ep.responseSchema);
      if (shapeErrors.length > 0) {
        findings.push(makeFinding('L3', 'L3:Schema', 'Fail', 'High',
          `Response shape mismatch for ${ep.method} ${url}: ${shapeErrors.join('; ')}`,
          'Align the API response with the declared responseSchema in config.',
          { url, errors: shapeErrors }));
      } else {
        findings.push(makeFinding('L3', 'L3:Schema', 'Pass', 'Info',
          `Response shape matches declared schema for ${ep.method} ${url}.`,
          '', { url }));
      }
    }

    // ── Latency check (TC-L3-009) ─────────────────────────────────────────
    if (latencyMs > latencyThreshold) {
      findings.push(makeFinding('L3', 'L3:Latency', 'Warn', 'Medium',
        `${ep.method} ${url} responded in ${latencyMs}ms (threshold: ${latencyThreshold}ms).`,
        'Profile the endpoint and optimise slow queries or add caching.',
        { url, latencyMs, thresholdMs: latencyThreshold }));
    } else {
      findings.push(makeFinding('L3', 'L3:Latency', 'Pass', 'Info',
        `${ep.method} ${url} responded in ${latencyMs}ms (within ${latencyThreshold}ms threshold).`,
        '', { url, latencyMs, thresholdMs: latencyThreshold }));
    }
  }

  return findings;
}
