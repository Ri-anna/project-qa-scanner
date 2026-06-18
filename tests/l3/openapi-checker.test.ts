import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs   from 'fs';
import path from 'path';
import os   from 'os';
import { checkOpenApi, checkRouteFallback } from '../../src/analysers/l3/openapi-checker.js';

describe('OpenAPI Checker', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-l3-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('TC-L3-017: warns when no OpenAPI spec is present', async () => {
    const findings = await checkOpenApi(tmpDir, undefined);
    const warn = findings.find(f => f.status === 'Warn');
    expect(warn).toBeDefined();
    expect(warn?.finding).toMatch(/No OpenAPI/i);
  });

  it('TC-L3-017: passes when valid openapi.json found at root', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: { '/health': { get: { responses: { '200': { description: 'ok' } } } } },
    };
    fs.writeFileSync(path.join(tmpDir, 'openapi.json'), JSON.stringify(spec));
    const findings = await checkOpenApi(tmpDir, undefined);
    expect(findings.some(f => f.status === 'Pass' && f.finding.includes('Test API'))).toBe(true);
  });

  it('TC-L3-018: discovers spec from explicit config path', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'My API', version: '2.0' },
      paths: { '/users': { get: { responses: { '200': {} } } } },
    };
    const specPath = path.join(tmpDir, 'custom', 'spec.json');
    fs.mkdirSync(path.dirname(specPath), { recursive: true });
    fs.writeFileSync(specPath, JSON.stringify(spec));
    const findings = await checkOpenApi(tmpDir, 'custom/spec.json');
    expect(findings.some(f => f.status === 'Pass' && f.finding.includes('My API'))).toBe(true);
  });

  it('TC-L3-018: warns when spec has no paths', async () => {
    const spec = { openapi: '3.0.0', info: { title: 'Empty', version: '1.0' }, paths: {} };
    fs.writeFileSync(path.join(tmpDir, 'openapi.json'), JSON.stringify(spec));
    const findings = await checkOpenApi(tmpDir, undefined);
    expect(findings.some(f => f.status === 'Warn' && f.finding.includes('no paths'))).toBe(true);
  });
});

describe('Route Fallback Checker', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-routes-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('TC-L3-021: detects Express route definitions in TypeScript', async () => {
    fs.writeFileSync(path.join(tmpDir, 'routes.ts'), [
      `app.get('/users', handler);`,
      `app.post('/users', createHandler);`,
      `router.delete('/users/:id', deleteHandler);`,
    ].join('\n'));
    const findings = await checkRouteFallback(tmpDir);
    expect(findings.some(f => f.status === 'Pass')).toBe(true);
    const pass = findings.find(f => f.status === 'Pass');
    expect(Number(pass?.metadata?.routeCount)).toBeGreaterThanOrEqual(3);
  });

  it('TC-L3-021: returns Skipped when no routes detected', async () => {
    fs.writeFileSync(path.join(tmpDir, 'utils.ts'), `export function helper() { return 42; }`);
    const findings = await checkRouteFallback(tmpDir);
    expect(findings[0].status).toBe('Skipped');
  });
});
