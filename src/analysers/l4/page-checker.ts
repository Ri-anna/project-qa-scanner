import { chromium, Browser, BrowserContext, Page, ConsoleMessage } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { Finding, makeFinding } from '../../core/types.js';
import type { Config, Viewport, FormCfg } from '../../config/schema.js';

// ── helpers ───────────────────────────────────────────────────────────────────

async function withPage<T>(
  ctx: BrowserContext,
  fn: (page: Page) => Promise<T>,
): Promise<T> {
  const page = await ctx.newPage();
  try { return await fn(page); }
  finally { await page.close(); }
}

// ── TC-L4-001: Page load & title ─────────────────────────────────────────────
export async function checkPageLoad(
  ctx: BrowserContext,
  url: string,
  expectedTitle?: string,
  timeoutMs = 30_000,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  try {
    await withPage(ctx, async (page) => {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

      if (!resp) {
        findings.push(makeFinding('L4', 'L4:PageLoad', 'Fail', 'High',
          `No response received from ${url}.`,
          'Verify the URL is correct and the server is running.', { url }));
        return;
      }

      const status = resp.status();
      if (status >= 400) {
        findings.push(makeFinding('L4', 'L4:PageLoad', 'Fail', 'High',
          `${url} returned HTTP ${status}.`,
          'Fix the server error before re-running UI checks.', { url, status }));
        return;
      }

      findings.push(makeFinding('L4', 'L4:PageLoad', 'Pass', 'Info',
        `Page loaded successfully: ${url} (HTTP ${status}).`,
        '', { url, status }));

      // Optional title assertion
      if (expectedTitle) {
        const title = await page.title();
        if (!title.includes(expectedTitle)) {
          findings.push(makeFinding('L4', 'L4:PageLoad', 'Warn', 'Low',
            `Page title "${title}" does not contain expected "${expectedTitle}".`,
            'Update the page title or the expectedTitle config.',
            { url, actualTitle: title, expectedTitle }));
        } else {
          findings.push(makeFinding('L4', 'L4:PageLoad', 'Pass', 'Info',
            `Page title matches expected: "${title}".`,
            '', { url, title }));
        }
      }
    });
  } catch (err) {
    findings.push(makeFinding('L4', 'L4:PageLoad', 'Skipped', 'Info',
      `Page load check skipped for ${url}: ${(err as Error).message}`,
      'Ensure the URL is reachable and Playwright is installed.', { url }));
  }
  return findings;
}

// ── TC-L4-007: Console error detection ───────────────────────────────────────
export async function checkConsoleErrors(
  ctx: BrowserContext,
  url: string,
  timeoutMs = 30_000,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const errors: string[] = [];

  try {
    await withPage(ctx, async (page) => {
      page.on('console', (msg: ConsoleMessage) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });
    });

    if (errors.length > 0) {
      findings.push(makeFinding('L4', 'L4:Console', 'Warn', 'Medium',
        `${errors.length} console error(s) detected on ${url}.`,
        'Investigate and resolve browser console errors before release.',
        { url, errors: errors.slice(0, 10) }));
    } else {
      findings.push(makeFinding('L4', 'L4:Console', 'Pass', 'Info',
        `No console errors detected on ${url}.`,
        '', { url }));
    }
  } catch (err) {
    findings.push(makeFinding('L4', 'L4:Console', 'Skipped', 'Info',
      `Console error check skipped for ${url}: ${(err as Error).message}`,
      'Ensure the URL is reachable and Playwright is installed.', { url }));
  }
  return findings;
}

// ── TC-L4-012: Broken image detection ────────────────────────────────────────
export async function checkBrokenImages(
  ctx: BrowserContext,
  url: string,
  timeoutMs = 30_000,
): Promise<Finding[]> {
  const findings: Finding[] = [];

  try {
    await withPage(ctx, async (page) => {
      await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });

      const broken: string[] = await page.evaluate((): string[] => {
        return Array.from(document.images)
          .filter(img => !img.complete || img.naturalWidth === 0)
          .map(img => img.src);
      });

      if (broken.length > 0) {
        findings.push(makeFinding('L4', 'L4:Images', 'Warn', 'Medium',
          `${broken.length} broken image(s) found on ${url}.`,
          'Fix or remove broken image references.',
          { url, brokenImages: broken.slice(0, 10) }));
      } else {
        findings.push(makeFinding('L4', 'L4:Images', 'Pass', 'Info',
          `All images loaded successfully on ${url}.`,
          '', { url }));
      }
    });
  } catch (err) {
    findings.push(makeFinding('L4', 'L4:Images', 'Skipped', 'Info',
      `Broken image check skipped for ${url}: ${(err as Error).message}`,
      'Ensure the URL is reachable.', { url }));
  }
  return findings;
}

// ── TC-L4-016: Accessibility (axe-core) ──────────────────────────────────────
export async function checkAccessibility(
  ctx: BrowserContext,
  url: string,
  timeoutMs = 30_000,
): Promise<Finding[]> {
  const findings: Finding[] = [];

  try {
    await withPage(ctx, async (page) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

      const results = await new AxeBuilder({ page }).analyze();

      const violations = results.violations;
      if (violations.length === 0) {
        findings.push(makeFinding('L4', 'L4:A11y', 'Pass', 'Info',
          `No accessibility violations found on ${url}.`,
          '', { url }));
        return;
      }

      for (const v of violations) {
        const severity = v.impact === 'critical' ? 'Critical'
                       : v.impact === 'serious'  ? 'High'
                       : v.impact === 'moderate' ? 'Medium'
                       : 'Low';
        findings.push(makeFinding('L4', 'L4:A11y',
          v.impact === 'critical' || v.impact === 'serious' ? 'Fail' : 'Warn',
          severity as 'Critical' | 'High' | 'Medium' | 'Low',
          `A11y violation (${v.impact}): ${v.description} — ${v.nodes.length} element(s) affected on ${url}.`,
          v.helpUrl,
          { url, ruleId: v.id, impact: v.impact, nodes: v.nodes.length }));
      }
    });
  } catch (err) {
    findings.push(makeFinding('L4', 'L4:A11y', 'Skipped', 'Info',
      `Accessibility check skipped for ${url}: ${(err as Error).message}`,
      'Ensure the URL is reachable and @axe-core/playwright is installed.', { url }));
  }
  return findings;
}

// ── TC-L4-021: Form submission flow ──────────────────────────────────────────
export async function checkForms(
  ctx: BrowserContext,
  forms: FormCfg[],
  timeoutMs = 30_000,
): Promise<Finding[]> {
  if (!forms.length) {
    return [makeFinding('L4', 'L4:Forms', 'Skipped', 'Info',
      'No forms configured for submission testing.',
      'Add ui.forms entries to config to enable form testing.')];
  }

  const findings: Finding[] = [];

  for (const form of forms) {
    try {
      await withPage(ctx, async (page) => {
        await page.goto(form.url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

        for (const [selector, value] of Object.entries(form.fields)) {
          await page.fill(selector, value);
        }
        await page.click(form.submitSelector);

        try {
          await page.waitForSelector(form.successSelector, { timeout: timeoutMs });
          findings.push(makeFinding('L4', 'L4:Forms', 'Pass', 'Info',
            `Form at ${form.url} submitted successfully; success element "${form.successSelector}" found.`,
            '', { url: form.url }));
        } catch {
          findings.push(makeFinding('L4', 'L4:Forms', 'Fail', 'High',
            `Form at ${form.url}: success element "${form.successSelector}" not found after submission.`,
            'Verify the form submit flow and success selector.',
            { url: form.url, successSelector: form.successSelector }));
        }
      });
    } catch (err) {
      findings.push(makeFinding('L4', 'L4:Forms', 'Skipped', 'Info',
        `Form check skipped for ${form.url}: ${(err as Error).message}`,
        'Ensure the URL is reachable and form selectors are correct.', { url: form.url }));
    }
  }
  return findings;
}

// ── TC-L4-028 / TC-L4-029: Responsive breakpoints ────────────────────────────
export async function checkBreakpoints(
  ctx: BrowserContext,
  url: string,
  breakpoints: Viewport[],
  timeoutMs = 30_000,
): Promise<Finding[]> {
  const findings: Finding[] = [];

  for (const bp of breakpoints) {
    try {
      await withPage(ctx, async (page) => {
        await page.setViewportSize({ width: bp.width, height: bp.height });
        const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
        const label = bp.label ?? `${bp.width}x${bp.height}`;

        if (!resp || resp.status() >= 400) {
          findings.push(makeFinding('L4', 'L4:Responsive', 'Fail', 'Medium',
            `Page failed to load at ${label} (${bp.width}×${bp.height}): HTTP ${resp?.status() ?? 'no response'}.`,
            'Verify the page renders correctly at this viewport.',
            { url, viewport: label, width: bp.width, height: bp.height }));
          return;
        }

        // Check for horizontal overflow (TC-L4-029)
        const overflows = await page.evaluate((vpWidth: number): string[] => {
          const offenders: string[] = [];
          document.querySelectorAll('*').forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.right > vpWidth + 5) {
              const htmlEl = el as HTMLElement;
              const cls = htmlEl.className && typeof htmlEl.className === 'string'
                ? '.' + htmlEl.className.split(' ').filter(Boolean).join('.')
                : '';
              offenders.push(el.tagName + (htmlEl.id ? `#${htmlEl.id}` : '') + cls);
            }
          });
          return offenders.slice(0, 5);
        }, bp.width);

        if (overflows.length > 0) {
          findings.push(makeFinding('L4', 'L4:Responsive', 'Warn', 'Medium',
            `Horizontal overflow detected at ${label} (${bp.width}×${bp.height}) on ${url}: ${overflows.join(', ')}.`,
            'Ensure all elements fit within the viewport at this breakpoint. Use max-width and overflow-x: hidden.',
            { url, viewport: label, offenders: overflows }));
        } else {
          findings.push(makeFinding('L4', 'L4:Responsive', 'Pass', 'Info',
            `No overflow at ${label} (${bp.width}×${bp.height}) on ${url}.`,
            '', { url, viewport: label }));
        }
      });
    } catch (err) {
      const label = bp.label ?? `${bp.width}x${bp.height}`;
      findings.push(makeFinding('L4', 'L4:Responsive', 'Skipped', 'Info',
        `Breakpoint check skipped for ${label}: ${(err as Error).message}`,
        'Ensure the URL is reachable.', { url, viewport: label }));
    }
  }
  return findings;
}

// ── TC-L4-034 / TC-L4-036: Main L4 runner ────────────────────────────────────
export async function runPageChecks(
  config: Config,
): Promise<Finding[]> {
  const urls  = config.ui?.urls ?? [];
  const forms = config.ui?.forms ?? [];
  const bps   = config.ui?.breakpoints ?? [];
  const timeoutMs = config.navigationTimeoutMs ?? 30_000;

  if (urls.length === 0 && forms.length === 0) {
    return [makeFinding('L4', 'L4:Browser', 'Skipped', 'Info',
      'No UI URLs or forms configured; Level 4 checks skipped.',
      'Add ui.urls and/or ui.forms to config to enable browser testing.')];
  }

  const findings: Finding[] = [];
  let browser: Browser | undefined;

  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();

    for (const url of urls) {
      findings.push(...await checkPageLoad(ctx, url, config.ui?.expectedTitle, timeoutMs));
      findings.push(...await checkConsoleErrors(ctx, url, timeoutMs));
      findings.push(...await checkBrokenImages(ctx, url, timeoutMs));
      findings.push(...await checkAccessibility(ctx, url, timeoutMs));
      findings.push(...await checkBreakpoints(ctx, url, bps, timeoutMs));
    }

    findings.push(...await checkForms(ctx, forms, timeoutMs));

    await ctx.close();
  } catch (err) {
    // TC-L4-036: graceful degradation — never throw
    findings.push(makeFinding('L4', 'L4:Browser', 'Skipped', 'Info',
      `Browser launch failed: ${(err as Error).message}`,
      'Ensure Playwright browsers are installed (npx playwright install chromium).'));
  } finally {
    await browser?.close();
  }

  return findings;
}
