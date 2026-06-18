import { Config }  from '../../config/schema.js';
import { Finding, makeFinding } from '../../core/types.js';

export async function runL4(
  _config: Config,
  _targetDir: string,
  _serviceStatus: Record<string, boolean>,
): Promise<Finding[]> {
  return [makeFinding('L4','L4:Browser','Skipped','Info',
    'Level 4 (UI / Browser) — not yet implemented.',
    'Will be added in Iteration 4.')];
}
