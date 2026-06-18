import { Config }  from '../../config/schema.js';
import { Finding, makeFinding } from '../../core/types.js';
import { checkEndpoints }                    from './endpoint-checker.js';
import { checkOpenApi, checkRouteFallback }  from './openapi-checker.js';

export async function runL3(
  config: Config,
  targetDir: string,
  serviceStatus: Record<string, boolean>,
): Promise<Finding[]> {
  const findings: Finding[] = [];

  // ── Static analysis: OpenAPI spec + route discovery (always run) ──────
  findings.push(...await checkOpenApi(targetDir, config.api?.openApiPath));
  findings.push(...await checkRouteFallback(targetDir));

  // ── Runtime checks: only when API service is reachable (TC-L3-028 / TC-L3-030) ──
  const apiUrl = config.services?.['api'];
  const apiUp  = apiUrl ? (serviceStatus['api'] ?? false) : false;

  if (!apiUp) {
    if (apiUrl) {
      findings.push(makeFinding('L3', 'L3:Runtime', 'Skipped', 'Info',
        'Runtime API checks (contract, schema, latency) skipped — API service unreachable.',
        'Start the API service and re-run for full L3 coverage.'));
    } else if ((config.api?.endpoints ?? []).length > 0) {
      findings.push(makeFinding('L3', 'L3:Runtime', 'Skipped', 'Info',
        'API endpoints configured but no services.api URL set; runtime checks skipped.',
        'Add services.api to config with the base URL of your running API.'));
    }
    return findings;
  }

  findings.push(...await checkEndpoints(
    config.api?.endpoints ?? [],
    config.api?.auth,
    config.api?.latencyThresholdMs ?? 2000,
    apiUrl,
  ));

  return findings;
}
