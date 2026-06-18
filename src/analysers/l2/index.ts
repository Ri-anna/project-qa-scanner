import { Config }  from '../../config/schema.js';
import { Finding, makeFinding } from '../../core/types.js';
import { runCveScanner }     from './cve-scanner.js';
import { runSecretScanner }  from './secret-scanner.js';
import { checkCors, checkSecurityHeaders, checkAuthEnforcement } from './runtime-checker.js';

export async function runL2(
  config: Config,
  targetDir: string,
  serviceStatus: Record<string, boolean>,
): Promise<Finding[]> {
  const findings: Finding[] = [];

  // ── Static checks (always run — TC-L2-036) ─────────────────────────────
  findings.push(...await runCveScanner(targetDir, config.security?.skipCveCheck ?? false));
  findings.push(...await runSecretScanner(targetDir, config.security?.secretsPatterns ?? []));

  // ── Runtime checks (only when a service is reachable) ──────────────────
  const apiUrl = config.services?.api;
  const apiUp  = apiUrl ? (serviceStatus['api'] ?? false) : false;

  if (!apiUp) {
    if (apiUrl) {
      findings.push(makeFinding('L2','L2:Runtime','Skipped','Info',
        'Runtime security checks (CORS, headers, auth) skipped — API service unreachable.',
        'Start the API service and re-run for full L2 coverage.'));
    }
    return findings;
  }

  findings.push(...await checkCors(apiUrl!));
  findings.push(...await checkSecurityHeaders(apiUrl!));
  findings.push(...await checkAuthEnforcement(
    apiUrl!,
    config.security?.protectedEndpoints ?? [],
  ));

  return findings;
}
