import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { checkEndpoints } from '../../src/analysers/l3/endpoint-checker.js';
import type { Endpoint } from '../../src/config/schema.js';

const BASE_EP: Endpoint = {
  url: '/api/health',
  method: 'GET',
  expectedStatus: 200,
  sendAuth: false,
};

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('Endpoint Checker', () => {
  it('TC-L3-001: passes when status matches expectedStatus', async () => {
    vi.spyOn(axios, 'request').mockResolvedValue({ status: 200, data: {}, headers: {} });
    const findings = await checkEndpoints([BASE_EP], undefined, 2000, 'http://localhost:3000');
    const statusFinding = findings.find(f => f.analyser === 'L3:Contract');
    expect(statusFinding?.status).toBe('Pass');
    expect(statusFinding?.finding).toContain('200');
  });

  it('TC-L3-001: fails when status does not match expectedStatus', async () => {
    vi.spyOn(axios, 'request').mockResolvedValue({ status: 500, data: {}, headers: {} });
    const ep = { ...BASE_EP, expectedStatus: 200 };
    const findings = await checkEndpoints([ep], undefined, 2000, 'http://localhost:3000');
    const fail = findings.find(f => f.analyser === 'L3:Contract' && f.status === 'Fail');
    expect(fail).toBeDefined();
    expect(fail?.severity).toBe('High');
    expect(fail?.finding).toContain('500');
  });

  it('TC-L3-005: fails when response is missing declared schema fields', async () => {
    vi.spyOn(axios, 'request').mockResolvedValue({ status: 200, data: { id: 1 }, headers: {} });
    const ep: Endpoint = {
      ...BASE_EP,
      responseSchema: { id: {}, name: {}, email: {} },
    };
    const findings = await checkEndpoints([ep], undefined, 2000, 'http://localhost:3000');
    const fail = findings.find(f => f.analyser === 'L3:Schema' && f.status === 'Fail');
    expect(fail).toBeDefined();
    expect(fail?.finding).toMatch(/name|email/i);
  });

  it('TC-L3-005: passes when response matches declared schema', async () => {
    vi.spyOn(axios, 'request').mockResolvedValue({
      status: 200, data: { id: 1, name: 'Alice', email: 'a@b.com' }, headers: {},
    });
    const ep: Endpoint = {
      ...BASE_EP,
      responseSchema: { id: {}, name: {}, email: {} },
    };
    const findings = await checkEndpoints([ep], undefined, 2000, 'http://localhost:3000');
    const schemaPassing = findings.find(f => f.analyser === 'L3:Schema' && f.status === 'Pass');
    expect(schemaPassing).toBeDefined();
  });

  it('TC-L3-009: warns when latency exceeds threshold', async () => {
    let callCount = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      callCount++;
      return callCount === 1 ? 0 : 3000; // 3 000 ms elapsed
    });
    vi.spyOn(axios, 'request').mockResolvedValue({ status: 200, data: {}, headers: {} });
    const ep = { ...BASE_EP, latencyThresholdMs: 2000 };
    const findings = await checkEndpoints([ep], undefined, 2000, 'http://localhost:3000');
    const warn = findings.find(f => f.analyser === 'L3:Latency' && f.status === 'Warn');
    expect(warn).toBeDefined();
    expect(Number(warn?.metadata?.latencyMs)).toBeGreaterThan(2000);
  });

  it('TC-L3-030: skips with Skipped finding when endpoint unreachable', async () => {
    vi.spyOn(axios, 'request').mockRejectedValue(new Error('connect ECONNREFUSED'));
    const findings = await checkEndpoints([BASE_EP], undefined, 2000, 'http://localhost:3000');
    expect(findings.every(f => f.status === 'Skipped')).toBe(true);
  });

  it('returns Skipped Info when no endpoints configured', async () => {
    const findings = await checkEndpoints([], undefined, 2000, 'http://localhost:3000');
    expect(findings).toHaveLength(1);
    expect(findings[0].status).toBe('Skipped');
    expect(findings[0].analyser).toBe('L3:Endpoints');
  });
});
