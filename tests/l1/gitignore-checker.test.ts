import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs   from 'fs';
import path from 'path';
import os   from 'os';
import { checkGitignore } from '../../src/analysers/l1/gitignore-checker.js';

describe('Gitignore Checker', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-gi-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('TC-L1-014: emits Fail High when .gitignore is missing', () => {
    const [f] = checkGitignore(tmpDir);
    expect(f.status).toBe('Fail');
    expect(f.severity).toBe('High');
    expect(f.finding).toMatch(/not found/i);
  });

  it('TC-L1-016: emits Fail Critical when .env missing from .gitignore', () => {
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), 'node_modules/\ndist/');
    const findings = checkGitignore(tmpDir);
    const envFail  = findings.find(f => f.finding.includes('.env'));
    expect(envFail?.status).toBe('Fail');
    expect(envFail?.severity).toBe('Critical');
  });

  it('TC-L1-013: emits Pass when all required patterns are present', () => {
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), '.env\nnode_modules/\ndist/\n*.log');
    const findings = checkGitignore(tmpDir);
    expect(findings.every(f => f.status === 'Pass')).toBe(true);
  });
});
