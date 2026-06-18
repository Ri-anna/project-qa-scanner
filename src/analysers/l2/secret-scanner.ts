import fs   from 'fs';
import path from 'path';
import { glob } from 'glob';
import { Finding, makeFinding } from '../../core/types.js';

interface SecretPattern {
  id:          string;
  label:       string;
  regex:       RegExp;
  placeholder: RegExp; // patterns that are NOT real secrets
}

const BUILT_IN_PATTERNS: SecretPattern[] = [
  {
    id: 'aws-access-key', label: 'AWS Access Key',
    regex:       /AKIA[A-Z0-9]{16}/,
    placeholder: /AKIAIOSFODNN7EXAMPLE|AKIA_EXAMPLE|YOUR_AWS_KEY/,
  },
  {
    id: 'generic-api-key', label: 'API Key assignment',
    regex:       /(?:api[_-]?key|apikey)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/i,
    placeholder: /YOUR_API_KEY|<REPLACE|EXAMPLE|placeholder/i,
  },
  {
    id: 'private-key', label: 'Private key / PEM block',
    regex:       /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    placeholder: /-----BEGIN EXAMPLE PRIVATE KEY-----/,
  },
  {
    id: 'jwt-secret', label: 'Hardcoded JWT secret',
    regex:       /(?:jwt[_-]?secret|jwtSecret)\s*[:=]\s*['"][^'"]{8,}['"]/i,
    placeholder: /YOUR_JWT_SECRET|<REPLACE|EXAMPLE/i,
  },
  {
    id: 'generic-password', label: 'Hardcoded password',
    regex:       /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{6,}['"]/i,
    placeholder: /YOUR_PASSWORD|<REPLACE|EXAMPLE|placeholder|changeme/i,
  },
];

const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'];
const SCAN_EXTS   = ['.ts','.js','.tsx','.jsx','.mjs','.cjs','.py','.java','.go','.env','.env.*','.sh','.yaml','.yml','.json'];

export async function runSecretScanner(targetDir: string, extraPatterns: string[]): Promise<Finding[]> {
  const findings: Finding[] = [];

  // Build pattern list
  const patterns: SecretPattern[] = [...BUILT_IN_PATTERNS];
  for (const p of extraPatterns) {
    patterns.push({
      id: 'custom', label: 'Custom pattern',
      regex: new RegExp(p),
      placeholder: /^$/,
    });
  }

  // Collect files
  const ignoreGlobs = IGNORE_DIRS.map(d => `**/${d}/**`);
  const files = await glob('**/*', {
    cwd: targetDir, absolute: true, nodir: true,
    ignore: ignoreGlobs,
  });

  const scanFiles = files.filter(f => {
    const ext = path.extname(f).toLowerCase();
    const base = path.basename(f);
    return SCAN_EXTS.includes(ext) || base.startsWith('.env');
  });

  let foundAny = false;

  for (const file of scanFiles) {
    let content: string;
    try { content = fs.readFileSync(file, 'utf-8'); }
    catch { continue; }

    const lines = content.split('\n');
    const rel   = path.relative(targetDir, file);

    for (const pat of patterns) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (pat.regex.test(line) && !pat.placeholder.test(line)) {
          foundAny = true;
          findings.push(makeFinding('L2','L2:Secrets','Fail','Critical',
            `${pat.label} detected in ${rel} (line ${i + 1}).`,
            'Remove the secret from source immediately, rotate the credential, and use environment variables instead.',
            { file: rel, line: i + 1, patternId: pat.id }));
        }
      }
    }
  }

  if (!foundAny) {
    findings.push(makeFinding('L2','L2:Secrets','Pass','Info',
      'No secrets detected in source files.',
      ''));
  }

  return findings;
}
