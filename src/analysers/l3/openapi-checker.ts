import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { Finding, makeFinding } from '../../core/types.js';

interface OpenApiPath {
  [method: string]: {
    responses?: Record<string, unknown>;
    parameters?: unknown[];
    requestBody?: unknown;
  };
}
interface OpenApiSpec {
  openapi?: string;
  swagger?: string;
  info?: { title?: string; version?: string };
  paths?: Record<string, OpenApiPath>;
}

/** Attempt to load an OpenAPI/Swagger spec from explicit path or by discovery. */
async function loadSpec(
  targetDir: string,
  explicitPath?: string,
): Promise<{ spec: OpenApiSpec; source: string } | null> {
  // 1. Explicit config path
  if (explicitPath) {
    const resolved = path.isAbsolute(explicitPath) ? explicitPath : path.join(targetDir, explicitPath);
    if (fs.existsSync(resolved)) {
      try {
        const raw = fs.readFileSync(resolved, 'utf-8');
        return { spec: JSON.parse(raw) as OpenApiSpec, source: resolved };
      } catch { /* fall through */ }
    }
  }

  // 2. Discovery fallback (TC-L3-018): scan well-known locations
  const candidates = [
    'openapi.json', 'openapi.yaml', 'swagger.json', 'swagger.yaml',
    'docs/openapi.json', 'docs/swagger.json',
    'api/openapi.json', 'api/swagger.json',
  ];
  for (const c of candidates) {
    const p = path.join(targetDir, c);
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf-8');
        return { spec: JSON.parse(raw) as OpenApiSpec, source: p };
      } catch { /* ignore parse failures */ }
    }
  }

  // 3. Glob scan for any *.json that contains "openapi" or "swagger" key
  const allJson = await glob('**/*.json', {
    cwd: targetDir, absolute: true, nodir: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
  });
  for (const f of allJson) {
    try {
      const raw = fs.readFileSync(f, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if ('openapi' in parsed || 'swagger' in parsed) {
        return { spec: parsed as OpenApiSpec, source: f };
      }
    } catch { /* skip */ }
  }

  return null;
}

/** TC-L3-017 / TC-L3-018: OpenAPI spec existence + basic validation */
export async function checkOpenApi(
  targetDir: string,
  openApiPath?: string,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const loaded = await loadSpec(targetDir, openApiPath);

  if (!loaded) {
    findings.push(makeFinding('L3', 'L3:OpenAPI', 'Warn', 'Medium',
      'No OpenAPI/Swagger spec found in the project.',
      'Add an openapi.json at the project root or set api.openApiPath in config. '
      + 'A spec enables automated contract validation and documentation generation.'));
    return findings;
  }

  const { spec, source } = loaded;
  const rel = path.relative(targetDir, source);

  findings.push(makeFinding('L3', 'L3:OpenAPI', 'Pass', 'Info',
    `OpenAPI spec found: ${rel} (${spec.info?.title ?? 'untitled'} v${spec.info?.version ?? '?'}).`,
    '', { source: rel }));

  // Basic spec quality checks
  const paths = Object.keys(spec.paths ?? {});
  if (paths.length === 0) {
    findings.push(makeFinding('L3', 'L3:OpenAPI', 'Warn', 'Low',
      `OpenAPI spec at ${rel} defines no paths.`,
      'Add at least one path definition to the spec.', { source: rel }));
  } else {
    findings.push(makeFinding('L3', 'L3:OpenAPI', 'Pass', 'Info',
      `OpenAPI spec defines ${paths.length} path(s).`,
      '', { pathCount: paths.length }));
  }

  // Check for missing response definitions
  const missingResponses: string[] = [];
  for (const [route, methods] of Object.entries(spec.paths ?? {})) {
    for (const [method, op] of Object.entries(methods)) {
      if (!['get','post','put','patch','delete','head','options'].includes(method)) continue;
      if (!op.responses || Object.keys(op.responses).length === 0) {
        missingResponses.push(`${method.toUpperCase()} ${route}`);
      }
    }
  }
  if (missingResponses.length > 0) {
    findings.push(makeFinding('L3', 'L3:OpenAPI', 'Warn', 'Low',
      `${missingResponses.length} operation(s) have no response definitions: ${missingResponses.slice(0,5).join(', ')}${missingResponses.length > 5 ? '…' : ''}.`,
      'Add response schema definitions to all operations in the OpenAPI spec.',
      { operations: missingResponses }));
  }

  return findings;
}

/** TC-L3-021: Route definition fallback — scan source for route declarations */
export async function checkRouteFallback(targetDir: string): Promise<Finding[]> {
  const routePatterns = [
    /app\.(get|post|put|patch|delete)\s*\(/gi,        // Express
    /@(Get|Post|Put|Patch|Delete)\s*\(/g,             // NestJS decorators
    /router\.(get|post|put|patch|delete)\s*\(/gi,     // Express Router
    /Route\s*\(\s*['"`]([^'"`]+)['"`]/g,             // Flask / FastAPI
    /@RequestMapping|@GetMapping|@PostMapping/g,      // Spring
  ];

  const sourceFiles = await glob('**/*.{ts,js,py,java,go}', {
    cwd: targetDir, absolute: true, nodir: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/*.test.*', '**/*.spec.*'],
  });

  let totalRoutes = 0;
  const filesWithRoutes: string[] = [];

  for (const file of sourceFiles) {
    let content: string;
    try { content = fs.readFileSync(file, 'utf-8'); }
    catch { continue; }

    let fileHasRoutes = false;
    for (const pattern of routePatterns) {
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        totalRoutes += matches.length;
        fileHasRoutes = true;
      }
    }
    if (fileHasRoutes) filesWithRoutes.push(path.relative(targetDir, file));
  }

  if (totalRoutes === 0) {
    return [makeFinding('L3', 'L3:Routes', 'Skipped', 'Info',
      'No route definitions detected in source files.',
      'Ensure the project contains route/endpoint definitions, or add api.openApiPath to config.',
      { scannedFiles: sourceFiles.length })];
  }

  return [makeFinding('L3', 'L3:Routes', 'Pass', 'Info',
    `Found ${totalRoutes} route definition(s) across ${filesWithRoutes.length} file(s).`,
    '',
    { routeCount: totalRoutes, files: filesWithRoutes.slice(0, 10) })];
}
