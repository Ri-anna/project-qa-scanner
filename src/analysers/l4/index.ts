import { Config }  from '../../config/schema.js';
import { Finding, makeFinding } from '../../core/types.js';
import { runPageChecks } from './page-checker.js';

export async function runL4(
  config: Config,
  _targetDir: string,
  serviceStatus: Record<string, boolean>,
): Promise<Finding[]> {
  // TC-L4-036: If a UI service is declared and unreachable, skip gracefully
  const uiUrl = config.services?.['ui'];
  if (uiUrl && !(serviceStatus['ui'] ?? false)) {
    return [makeFinding('L4', 'L4:Browser', 'Skipped', 'Info',
      'Level 4 browser checks skipped — UI service is unreachable.',
      'Start the UI service and re-run for full L4 coverage.')];
  }

  return runPageChecks(config);
}
