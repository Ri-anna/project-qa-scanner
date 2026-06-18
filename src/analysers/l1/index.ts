import { Config }  from '../../config/schema.js';
import { Finding } from '../../core/types.js';
import { detectStack } from './stack-detector.js';
import { checkManifest } from './manifest-checker.js';
import { checkGitignore } from './gitignore-checker.js';
import { checkCi }        from './ci-checker.js';

export async function runL1(config: Config, targetDir: string): Promise<Finding[]> {
  const findings: Finding[] = [];

  // Stack detection
  const stackResult = detectStack(targetDir, config.stack);
  // Attach stack info to config for downstream levels
  config.stack = stackResult.label;

  // Run all L1 checks — these are all static, no service required (TC-L1-026)
  findings.push(...checkManifest(targetDir, stackResult.detected.length ? stackResult.detected : ['unknown' as const]));
  findings.push(...checkGitignore(targetDir));
  findings.push(...await checkCi(targetDir));

  return findings;
}

export { detectStack };
