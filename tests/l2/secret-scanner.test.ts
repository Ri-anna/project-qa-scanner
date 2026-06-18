import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs   from 'fs';
import path from 'path';
import os   from 'os';
import { runSecretScanner } from '../../src/analysers/l2/secret-scanner.js';

describe('Secret Scanner', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-sec-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('TC-L2-006: detects AWS access key in TypeScript source', async () => {
    fs.writeFileSync(path.join(tmpDir, 'config.ts'),
      `const awsKey = 'AKIAIOSFODNN7EXAMPL1';\n`);
    const findings = await runSecretScanner(tmpDir, []);
    const fail = findings.find(f => f.status === 'Fail');
    expect(fail).toBeDefined();
    expect(fail?.severity).toBe('Critical');
    expect(fail?.finding).toMatch(/AWS Access Key/i);
    expect(fail?.metadata?.file).toContain('config.ts');
  });

  it('TC-L2-008: detects PEM private key block', async () => {
    fs.writeFileSync(path.join(tmpDir, 'key.ts'),
      `const k = \`-----BEGIN RSA PRIVATE KEY-----\nMIIE...\`;\n`);
    const findings = await runSecretScanner(tmpDir, []);
    expect(findings.some(f => f.status === 'Fail' && f.finding.includes('Private key'))).toBe(true);
  });

  it('TC-L2-010: passes when only process.env references are used', async () => {
    fs.writeFileSync(path.join(tmpDir, 'api.ts'),
      `const key = process.env.API_KEY;\nconst db = process.env.DATABASE_URL;\n`);
    const findings = await runSecretScanner(tmpDir, []);
    expect(findings.every(f => f.status === 'Pass')).toBe(true);
  });

  it('TC-L2-012: does NOT flag placeholder values as secrets', async () => {
    fs.writeFileSync(path.join(tmpDir, 'example.ts'),
      `const apiKey: 'YOUR_API_KEY_HERE';\n`);
    const findings = await runSecretScanner(tmpDir, []);
    expect(findings.every(f => f.status !== 'Fail')).toBe(true);
  });

  it('TC-L2-011: reports multiple secrets in same file as separate findings', async () => {
    fs.writeFileSync(path.join(tmpDir, 'bad.ts'), [
      `const awsKey = 'AKIAIOSFODNN7EXAMPL2';`,
      `const jwtSecret = 'superSecretJwtKey99!';`,
    ].join('\n'));
    const findings = await runSecretScanner(tmpDir, []);
    const fails = findings.filter(f => f.status === 'Fail');
    expect(fails.length).toBeGreaterThanOrEqual(2);
  });
});
