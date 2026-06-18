import { Config }  from '../../config/schema.js';
import { Finding, makeFinding } from '../../core/types.js';

export async function runL2(
  _config: Config,
  _targetDir: string,
  _serviceStatus: Record<string, boolean>,
): Promise<Finding[]> {
  return [makeFinding('L2','L2:Security','Skipped','Info',
    'Level 2 (Security) — not yet implemented.',
    'Will be added in Iteration 2.')];
}
