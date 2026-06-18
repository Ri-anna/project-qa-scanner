import fs   from 'fs';
import path from 'path';
import { Finding, makeFinding } from '../../core/types.js';

const REQUIRED_PATTERNS = [
  { pattern: '.env',          regex: /^\.env($|\/|\s)/m,          label: '.env' },
  { pattern: 'node_modules/', regex: /^node_modules\//m,          label: 'node_modules/' },
  { pattern: 'dist/',         regex: /^dist\//m,                   label: 'dist/' },
];

export function checkGitignore(targetDir: string): Finding[] {
  const giPath = path.join(targetDir, '.gitignore');

  if (!fs.existsSync(giPath)) {
    return [makeFinding('L1','L1:Gitignore','Fail','High',
      '.gitignore not found; sensitive files and build artefacts may be tracked by git.',
      'Create a .gitignore file. At minimum include: .env, node_modules/, dist/, *.log')];
  }

  const content  = fs.readFileSync(giPath, 'utf-8');
  const findings: Finding[] = [];

  for (const { pattern, regex, label } of REQUIRED_PATTERNS) {
    const missing = !regex.test(content);
    if (pattern === '.env' && missing) {
      findings.push(makeFinding('L1','L1:Gitignore','Fail','Critical',
        `.env not in .gitignore — secrets risk being committed to version control.`,
        'Add ".env" and ".env.*" to .gitignore immediately, then rotate any secrets that may have been exposed.'));
    } else if (missing) {
      findings.push(makeFinding('L1','L1:Gitignore','Warn','Medium',
        `"${label}" is not in .gitignore and may be accidentally committed.`,
        `Add "${label}" to .gitignore.`));
    }
  }

  if (findings.length === 0) {
    findings.push(makeFinding('L1','L1:Gitignore','Pass','Info',
      '.gitignore present with all recommended patterns (.env, node_modules/, dist/).',
      ''));
  }

  return findings;
}
