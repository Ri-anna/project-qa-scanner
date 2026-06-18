import fs   from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { ConfigSchema, Config } from './schema.js';

/** Resolve ${VAR} references from environment variables */
function resolveEnvRefs(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{([^}]+)\}/g, (_, k) => process.env[k] ?? '');
  }
  if (Array.isArray(obj)) return obj.map(resolveEnvRefs);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, resolveEnvRefs(v)])
    );
  }
  return obj;
}

export function loadConfig(configPath: string): Config {
  // Load .env from the config file's directory
  const configDir = path.dirname(path.resolve(configPath));
  dotenv.config({ path: path.join(configDir, '.env') });

  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}\nRun: cp qa-scanner.config.example.json qa-scanner.config.json`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (e) {
    throw new Error(`Config file is not valid JSON: ${configPath}\n${(e as Error).message}`);
  }

  const resolved = resolveEnvRefs(raw);
  const result   = ConfigSchema.safeParse(resolved);

  if (!result.success) {
    const issues = result.error.issues.map(i => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Config validation failed:\n${issues}`);
  }

  return result.data;
}
