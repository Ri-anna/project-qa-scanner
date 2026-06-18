import fs   from 'fs';
import path from 'path';
import { Finding, makeFinding } from '../../core/types.js';
import { Stack } from './stack-detector.js';

const MANIFEST_FILES: Partial<Record<Stack, string[]>> = {
  node:       ['package.json'],
  typescript: ['package.json'],
  python:     ['requirements.txt', 'pyproject.toml', 'setup.py'],
  java:       ['pom.xml', 'build.gradle'],
  go:         ['go.mod'],
};

function hasUnpinnedRanges(pkgJsonPath: string): string[] {
  try {
    const raw = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8')) as Record<string, unknown>;
    const deps = { ...(raw.dependencies as Record<string,string> ?? {}), ...(raw.devDependencies as Record<string,string> ?? {}) };
    return Object.entries(deps)
      .filter(([, v]) => typeof v === 'string' && /^[\^~]/.test(v))
      .map(([k]) => k);
  } catch { return []; }
}

export function checkManifest(targetDir: string, stacks: Stack[]): Finding[] {
  const findings: Finding[] = [];
  const relevant = stacks.flatMap(s => MANIFEST_FILES[s] ?? []);
  const unique   = [...new Set(relevant)];

  if (unique.length === 0) {
    findings.push(makeFinding('L1','L1:Manifest','Skipped','Info',
      'No manifest check applicable for detected stack.',
      'Add a dependency manifest if dependencies are used.'));
    return findings;
  }

  let found = false;
  for (const file of unique) {
    const full = path.join(targetDir, file);
    if (fs.existsSync(full)) {
      found = true;
      // Check for unpinned ranges in package.json
      if (file === 'package.json') {
        const unpinned = hasUnpinnedRanges(full);
        if (unpinned.length > 0) {
          findings.push(makeFinding('L1','L1:Manifest','Warn','Medium',
            `${unpinned.length} dependency version(s) use range specifiers (^, ~): ${unpinned.slice(0,5).join(', ')}${unpinned.length>5?'…':''}`,
            'Pin dependency versions to exact values for deterministic installs.',
            { unpinnedPackages: unpinned }));
        } else {
          findings.push(makeFinding('L1','L1:Manifest','Pass','Info',
            `Dependency manifest present (${file}); all versions are pinned.`,
            ''));
        }
      } else {
        findings.push(makeFinding('L1','L1:Manifest','Pass','Info',
          `Dependency manifest present: ${file}`,
          ''));
      }
    }
  }

  if (!found) {
    findings.push(makeFinding('L1','L1:Manifest','Fail','High',
      `No dependency manifest found for detected stack. Expected one of: ${unique.join(', ')}`,
      'Initialise the package manager (e.g. npm init, pip install --init) and commit the manifest.'));
  }

  // Lock file check (Node only)
  if (stacks.includes('node') || stacks.includes('typescript')) {
    const locks  = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
    const hasLock = locks.some(l => fs.existsSync(path.join(targetDir, l)));
    if (!hasLock) {
      findings.push(makeFinding('L1','L1:LockFile','Warn','Medium',
        'No lock file detected (package-lock.json / yarn.lock / pnpm-lock.yaml). Dependency resolution is non-deterministic.',
        'Run npm install (or yarn / pnpm install) to generate a lock file and commit it.'));
    } else {
      const lockNames = locks.filter(l => fs.existsSync(path.join(targetDir, l)));
      if (lockNames.length > 1) {
        findings.push(makeFinding('L1','L1:LockFile','Warn','Medium',
          `Multiple lock files detected (${lockNames.join(', ')}). Conflicting package managers may cause inconsistencies.`,
          'Choose a single package manager and remove the unused lock file.',
          { lockFiles: lockNames }));
      } else {
        findings.push(makeFinding('L1','L1:LockFile','Pass','Info',
          `Lock file present: ${lockNames[0]}`,
          ''));
      }
    }
  }

  return findings;
}
