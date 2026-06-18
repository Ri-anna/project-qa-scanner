import fs   from 'fs';
import path from 'path';

export type Stack = 'node' | 'typescript' | 'python' | 'java' | 'go' | 'unknown';

export interface StackResult {
  primary:   Stack;
  detected:  Stack[];
  label:     string;
}

const MANIFEST_MAP: Array<[string, Stack]> = [
  ['package.json',      'node'],
  ['tsconfig.json',     'typescript'],
  ['requirements.txt',  'python'],
  ['pyproject.toml',    'python'],
  ['setup.py',          'python'],
  ['pom.xml',           'java'],
  ['build.gradle',      'java'],
  ['go.mod',            'go'],
];

export function detectStack(targetDir: string, override?: string): StackResult {
  if (override && override.trim()) {
    const s = override.trim().toLowerCase() as Stack;
    return { primary: s, detected: [s], label: s };
  }

  const found = new Set<Stack>();
  for (const [file, stack] of MANIFEST_MAP) {
    if (fs.existsSync(path.join(targetDir, file))) found.add(stack);
  }

  // node + typescript together → label as Node/TypeScript
  const detected = [...found];
  if (detected.length === 0) return { primary: 'unknown', detected: [], label: 'Unknown' };

  const hasTs   = found.has('typescript');
  const hasNode = found.has('node');
  const primary = hasTs ? 'typescript' : detected[0];
  const label   = hasTs && hasNode ? 'Node / TypeScript'
                : detected.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' + ');

  return { primary, detected, label };
}
