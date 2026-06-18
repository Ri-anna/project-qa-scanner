import fs   from 'fs';
import path from 'path';
import { glob } from 'glob';
import { Finding, makeFinding } from '../../core/types.js';

const CI_INDICATORS = [
  '.github/workflows',
  '.gitlab-ci.yml',
  'Jenkinsfile',
  '.circleci/config.yml',
  '.travis.yml',
  'azure-pipelines.yml',
  '.bitbucket-pipelines.yml',
];

const TEST_KEYWORDS  = ['test','vitest','jest','pytest','mocha','jasmine','spec'];
const LINT_KEYWORDS  = ['lint','eslint','pylint','flake8','ruff','prettier','checkstyle'];

function detectSteps(content: string): { hasTest: boolean; hasLint: boolean } {
  const lower = content.toLowerCase();
  return {
    hasTest: TEST_KEYWORDS.some(k => lower.includes(k)),
    hasLint: LINT_KEYWORDS.some(k => lower.includes(k)),
  };
}

export async function checkCi(targetDir: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  let foundAny = false;

  for (const indicator of CI_INDICATORS) {
    const full = path.join(targetDir, indicator);
    if (!fs.existsSync(full)) continue;

    foundAny = true;

    // For workflow directories, read all yml files
    const files = fs.statSync(full).isDirectory()
      ? await glob(`${full}/**/*.{yml,yaml}`)
      : [full];

    let hasTest = false;
    let hasLint = false;

    for (const f of files) {
      const content = fs.readFileSync(f, 'utf-8');
      const steps   = detectSteps(content);
      if (steps.hasTest) hasTest = true;
      if (steps.hasLint) hasLint = true;
    }

    if (!hasTest) {
      findings.push(makeFinding('L1','L1:CI','Warn','Medium',
        `CI configuration found (${indicator}) but no test step detected.`,
        'Add a test step to your CI pipeline (e.g. "npm test" or "pytest").'));
    }
    if (!hasLint) {
      findings.push(makeFinding('L1','L1:CI','Warn','Low',
        `CI configuration found (${indicator}) but no lint step detected.`,
        'Add a lint step to your CI pipeline (e.g. "npm run lint").'));
    }
    if (hasTest && hasLint) {
      findings.push(makeFinding('L1','L1:CI','Pass','Info',
        `CI configuration detected (${indicator}) with test and lint steps.`,
        ''));
    }
  }

  if (!foundAny) {
    findings.push(makeFinding('L1','L1:CI','Warn','Medium',
      'No CI configuration found (.github/workflows, .gitlab-ci.yml, Jenkinsfile, etc.).',
      'Add a CI pipeline to automate testing and linting on every push.'));
  }

  return findings;
}
