# QA Scanner

A TypeScript CLI that scans a project and produces a structured quality report across four analysis levels — from static code checks through live browser testing. It is designed to run locally or in CI, produces zero false positives on placeholder values, and degrades gracefully when services are unavailable.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [CLI Reference](#cli-reference)
5. [Analysis Levels](#analysis-levels)
6. [Report Output](#report-output)
7. [Architecture](#architecture)
8. [AI Component Justification](#ai-component-justification)
9. [Known Gaps & Limitations](#known-gaps--limitations)
10. [Running Tests](#running-tests)

---

## Quick Start

```bash
# Clone and install
git clone <repo-url>
cd qa-scanner
npm install
npx playwright install chromium   # only needed for L4 browser checks

# Copy example config and customise
cp qa-scanner.config.example.json qa-scanner.config.json

# Build and run
npm run build
npx qa-scan --config qa-scanner.config.json
```

The scanner exits with code `0` (all Pass/Warn/Skipped) or `1` (at least one Fail). Reports are written to `./qa-report/` by default.

---

## Installation

**Prerequisites**

- Node.js ≥ 18
- npm ≥ 9
- Chromium (for L4 only): `npx playwright install chromium`

```bash
npm install
npm run build          # compiles TypeScript → dist/
```

To use the `qa-scan` binary globally:

```bash
npm link               # makes `qa-scan` available system-wide
```

---

## Configuration

Create `qa-scanner.config.json` in the directory where you run the scanner (or pass `--config <path>`). A fully annotated example is provided in `qa-scanner.config.example.json`.

**Environment variable interpolation** — any string value in the config can reference an environment variable with `${VAR_NAME}`. The scanner reads `.env` from the same directory as the config file at startup.

```json
{
  "targetDir": "./",
  "outputFormat": ["html", "json", "markdown"],
  "outputDir": "./qa-report",
  "navigationTimeoutMs": 30000,

  "services": {
    "api": "http://localhost:3000",
    "ui":  "http://localhost:5173"
  },

  "security": {
    "skipCveCheck": false,
    "secretsPatterns": [],
    "protectedEndpoints": ["/api/admin", "/api/users"]
  },

  "api": {
    "openApiPath": "./openapi.json",
    "latencyThresholdMs": 2000,
    "auth": { "type": "bearer", "token": "${AUTH_TOKEN}" },
    "endpoints": [
      {
        "url": "/api/health",
        "method": "GET",
        "expectedStatus": 200,
        "responseSchema": { "status": {} }
      }
    ]
  },

  "ui": {
    "urls": ["http://localhost:5173/", "http://localhost:5173/about"],
    "expectedTitle": "My App",
    "breakpoints": [
      { "width": 1920, "height": 1080, "label": "Desktop" },
      { "width": 375,  "height": 812,  "label": "Mobile"  }
    ],
    "forms": [
      {
        "url": "http://localhost:5173/contact",
        "fields": { "input[name=email]": "test@example.com" },
        "submitSelector": "button[type=submit]",
        "successSelector": ".success-message"
      }
    ]
  }
}
```

**Auth types supported:** `bearer` (Authorization: Bearer …), `basic` (Authorization: Basic …), `apikey` (custom header).

---

## CLI Reference

```
Usage: qa-scan [options]

Options:
  -c, --config <path>   Path to config file  (default: qa-scanner.config.json)
  -o, --output <dir>    Override output directory
  --no-l1               Skip Level 1 (Code & Repository)
  --no-l2               Skip Level 2 (Security)
  --no-l3               Skip Level 3 (API/Backend)
  --no-l4               Skip Level 4 (UI/Browser)
  -V, --version         Print version
  -h, --help            Show help
```

**Examples**

```bash
# Full scan
qa-scan --config qa-scanner.config.json

# Static checks only (no live services needed)
qa-scan --no-l3 --no-l4

# API checks only
qa-scan --no-l1 --no-l2 --no-l4

# Custom output dir
qa-scan --output ./reports/2026-06-18
```

---

## Analysis Levels

Each level builds on the previous. Runtime levels degrade gracefully — if the target service is unreachable, all runtime checks emit `Skipped` findings instead of failing the run.

### L1 — Code & Repository (static, no service required)

| Check | What it detects |
|---|---|
| Stack detection | `package.json`, `tsconfig.json`, `requirements.txt`, `pom.xml`, `go.mod` |
| Manifest checker | Missing manifest, unpinned dependency versions (`*`, `latest`, `^`), missing lock file, multiple competing lock files |
| `.gitignore` checker | Missing `.gitignore`; `.env` not excluded; `node_modules/` or `dist/` not excluded |
| CI config checker | Presence of GitHub Actions, GitLab CI, Jenkins, CircleCI, Travis, Azure Pipelines; whether workflows include test/lint steps |

### L2 — Security (static always; runtime when API is reachable)

| Check | What it detects |
|---|---|
| CVE scanner | Runs `npm audit --json`; maps critical/high → Fail, moderate → Warn |
| Secret scanner | AWS access keys, generic API key assignments, PEM private key blocks, hardcoded JWT secrets, hardcoded passwords. Placeholder values (`YOUR_API_KEY_HERE`, `EXAMPLE`, `<REPLACE>`, etc.) are excluded from findings |
| CORS | Wildcard `Access-Control-Allow-Origin: *` |
| Security headers | Missing CSP, `X-Content-Type-Options`, `X-Frame-Options`, HSTS |
| Auth enforcement | Configured protected endpoints probed without credentials — 2xx response → Fail Critical |

Custom secret patterns can be added via `security.secretsPatterns` (regex strings).

### L3 — API/Backend (static always; runtime when API is reachable)

| Check | What it detects |
|---|---|
| OpenAPI discovery | Explicit `api.openApiPath` → well-known locations (`openapi.json`, `swagger.json`, `docs/`) → glob scan. Warns if spec is absent or defines no paths |
| Route fallback | Scans source files for Express, NestJS, Flask, FastAPI, Spring route declarations when no spec is present |
| Contract testing | Each configured `api.endpoints` entry is called; HTTP status is compared against `expectedStatus` |
| Schema validation | Response body checked for presence of all fields declared in `responseSchema` |
| Latency | Response time compared against `latencyThresholdMs` (per-endpoint or global default) |

### L4 — UI/Browser (Playwright; skipped if `services.ui` is unreachable)

| Check | What it detects |
|---|---|
| Page load | HTTP status ≥ 400 → Fail; optional `expectedTitle` assertion |
| Console errors | Any `console.error` events fired during page load |
| Broken images | `<img>` elements where `complete === false` or `naturalWidth === 0` |
| Accessibility | axe-core via `@axe-core/playwright`; critical/serious violations → Fail, others → Warn |
| Form submission | Fills configured fields, clicks submit, asserts success selector appears |
| Responsive breakpoints | Resizes viewport to each configured breakpoint; detects horizontal overflow (`getBoundingClientRect().right > viewport + 5px`) |

---

## Report Output

Three formats are written simultaneously (configurable via `outputFormat`):

**HTML** (`qa-report/report.html`) — Self-contained, single-file report. No external dependencies; safe to attach to a ticket or email.

**JSON** (`qa-report/report.json`) — Machine-readable. Suitable for CI badge scripts or downstream tooling.

**Markdown** (`qa-report/report.md`) — GitHub-flavoured Markdown. Renders well in pull request descriptions.

Every report includes:
- Scanned-at timestamp and target directory
- Detected stack
- Finding counts by status (Pass / Warn / Fail / Skipped), severity (Critical → Info), and level (L1–L4)
- A plain-English narrative summary
- Full finding list with `analyser`, `severity`, `recommendation`, and `metadata`

---

## Architecture

```
src/
├── cli.ts                     Entry point — Commander.js, orchestrates all levels
├── config/
│   ├── schema.ts              Zod schema — single source of truth for all config fields
│   └── loader.ts              Reads config file, resolves ${ENV_VAR} interpolation, validates
├── core/
│   ├── types.ts               Finding, ScanResult, makeFinding factory, Status/Severity/Level types
│   └── service-probe.ts       HTTP reachability probe — used before runtime-level checks
├── analysers/
│   ├── l1/                    Stack detector, manifest checker, .gitignore checker, CI checker
│   ├── l2/                    CVE scanner, secret scanner, runtime-checker (CORS/headers/auth)
│   ├── l3/                    OpenAPI checker, route fallback scanner, endpoint checker
│   └── l4/                    Playwright page-checker (load, console, images, a11y, forms, breakpoints)
└── report/
    └── index.ts               Builds ScanResult, renders HTML/JSON/Markdown, writes files
```

**Key design decisions:**

*Universal Finding interface* — Every check across every level returns the same `Finding` shape. This makes the report renderer, the summary aggregator, and any future CI integrations agnostic to which analyser produced each finding.

*Config-first, no hardcoding* — All URLs, thresholds, patterns, and selectors come from the config file and are validated by a single Zod schema at startup. This means the scanner works against any project without code changes.

*Static checks always run* — L2's CVE and secret scanner, and L3's OpenAPI and route discovery, execute regardless of whether a service is reachable. Only the HTTP-probing sub-checks are gated behind the service-probe result. This ensures that a dormant codebase still gets meaningful analysis.

*Graceful degradation* — Every analyser wraps its logic in try/catch and returns a `Skipped` finding on error rather than throwing. The CLI never crashes on a bad endpoint, a missing browser binary, or a network timeout.

*Single responsibility per file* — Each check is a standalone exported async function that takes plain data (targetDir, a URL, a list of endpoints) and returns `Finding[]`. This makes unit testing straightforward: no class hierarchies, no global state.

---

## AI Component Justification

The scanner uses `@axe-core/playwright` for accessibility analysis (L4). axe-core is not an LLM — it is a deterministic rule-based engine that maps DOM state to WCAG 2.x rules. It is included because:

1. **WCAG compliance cannot be inferred from source alone.** Contrast ratios, ARIA relationships, focus order, and landmark structure all require a rendered DOM. Static analysis of HTML templates produces too many false positives on dynamic content.

2. **It is the industry standard.** axe-core is maintained by Deque Systems, is embedded in the Lighthouse audit suite, and is used by the majority of automated accessibility pipelines. Its rule set is publicly auditable.

3. **It integrates natively with Playwright.** `@axe-core/playwright` injects axe at runtime via `page.evaluate`, runs synchronously in the browser context, and returns a structured violations array — no network calls, no external service dependency.

4. **Findings are directly actionable.** Every violation includes a `helpUrl` linking to the Deque rule documentation, an `impact` level (critical/serious/moderate/minor), and the specific DOM nodes affected. The scanner maps these directly to the `Finding` interface without transformation or summarisation.

No LLM or generative AI component is used anywhere in the scanner's analysis pipeline. All findings are deterministic and reproducible given the same input.

---

## Known Gaps & Limitations

**L1**
- Only reads `package.json` for Node stacks; does not parse `composer.json` (PHP), `Cargo.toml` (Rust), or `*.csproj` (.NET).
- CI keyword detection (`test`, `lint`) is string-based; it will not detect workflows that invoke test runners under non-standard step names.

**L2**
- CVE scanner calls `npm audit` only; Yarn, pnpm, pip, and Maven are not yet supported.
- Secret scanner uses line-level regex. Multi-line secrets (e.g. a base64-encoded private key split across lines) may not be detected.
- The placeholder exclusion list is fixed; projects with non-standard placeholder conventions may generate false positives.

**L3**
- `responseSchema` validation checks field presence only (shallow, first level). It does not validate field types, nested objects, or array item schemas. Full JSON Schema validation is a planned enhancement.
- OpenAPI spec parsing is JSON-only; YAML specs are detected by filename but not parsed (JSON.parse will fail on YAML).
- Auth injection for `api.endpoints` sends the same credential to every endpoint; per-endpoint auth overrides are not yet supported.

**L4**
- Playwright is launched in `headless: true` only; no configuration option for headed mode.
- `checkBreakpoints` detects layout overflow but not visual regressions (e.g. overlapping elements that stay within bounds, clipped text). Visual regression testing would require a screenshot baseline.
- Form testing fills every field with a static value. It does not handle multi-step forms, file upload fields, or CAPTCHAs.
- axe-core rules run at page load; dynamically injected content (modals, lazy-loaded sections) is not re-scanned.

**General**
- Authentication tokens are read from config/env; OAuth flows and cookie-based sessions are not automated.
- The scanner does not retry on transient network errors; a single timeout on a protected endpoint will produce a `Skipped` finding.
- Parallel execution of level runners is not implemented; levels run sequentially.
