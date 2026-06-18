import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs   from 'fs';
import path from 'path';
import os   from 'os';
import { detectStack } from '../../src/analysers/l1/stack-detector.js';

describe('Stack Detector', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-scan-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('TC-L1-001: detects Node/TypeScript from package.json + tsconfig.json', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}');
    const r = detectStack(tmpDir);
    expect(r.label).toBe('Node / TypeScript');
    expect(r.detected).toContain('typescript');
  });

  it('detects Python from requirements.txt', () => {
    fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), 'flask==3.0.0');
    const r = detectStack(tmpDir);
    expect(r.primary).toBe('python');
    expect(r.detected).toContain('python');
  });

  it('returns unknown for empty directory', () => {
    const r = detectStack(tmpDir);
    expect(r.primary).toBe('unknown');
    expect(r.label).toBe('Unknown');
  });

  it('respects override parameter', () => {
    const r = detectStack(tmpDir, 'go');
    expect(r.primary).toBe('go');
  });
});
