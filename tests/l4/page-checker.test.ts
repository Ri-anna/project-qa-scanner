/**
 * L4 tests use manual mocks for Playwright and @axe-core/playwright so they
 * run without a real browser — the logic under test is the analyser's
 * interpretation of browser results, not the browser itself.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoist mock functions so vi.mock factories can reference them ──────────────
const {
  mockPageGoto,
  mockPageTitle,
  mockPageClose,
  mockPageOn,
  mockPageFill,
  mockPageClick,
  mockPageWaitForSelector,
  mockPageSetViewportSize,
  mockPageEvaluate,
  mockCtxNewPage,
  mockCtxClose,
  mockAxeAnalyze,
} = vi.hoisted(() => {
  const mockPageGoto            = vi.fn();
  const mockPageTitle           = vi.fn();
  const mockPageClose           = vi.fn();
  const mockPageOn              = vi.fn();
  const mockPageFill            = vi.fn();
  const mockPageClick           = vi.fn();
  const mockPageWaitForSelector = vi.fn();
  const mockPageSetViewportSize = vi.fn();
  const mockPageEvaluate        = vi.fn();
  const mockCtxClose            = vi.fn();
  const mockAxeAnalyze          = vi.fn();

  const makeMockPage = () => ({
    goto:            mockPageGoto,
    title:           mockPageTitle,
    close:           mockPageClose,
    on:              mockPageOn,
    fill:            mockPageFill,
    click:           mockPageClick,
    waitForSelector: mockPageWaitForSelector,
    setViewportSize: mockPageSetViewportSize,
    evaluate:        mockPageEvaluate,
  });

  const mockCtxNewPage = vi.fn().mockResolvedValue(makeMockPage());

  return {
    mockPageGoto, mockPageTitle, mockPageClose, mockPageOn,
    mockPageFill, mockPageClick, mockPageWaitForSelector,
    mockPageSetViewportSize, mockPageEvaluate,
    mockCtxNewPage, mockCtxClose, mockAxeAnalyze,
  };
});

vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        newPage: mockCtxNewPage,
        close:   mockCtxClose,
      }),
      close: vi.fn(),
    }),
  },
}));

vi.mock('@axe-core/playwright', () => ({
  default: class AxeBuilder {
    constructor(_opts: unknown) {}
    analyze() { return mockAxeAnalyze(); }
  },
}));

import {
  checkPageLoad,
  checkConsoleErrors,
  checkBrokenImages,
  checkAccessibility,
  checkForms,
  checkBreakpoints,
} from '../../src/analysers/l4/page-checker.js';
import type { FormCfg, Viewport } from '../../src/config/schema.js';

// ─────────────────────────────────────────────────────────────────────────────

const makeMockPage = () => ({
  goto:            mockPageGoto,
  title:           mockPageTitle,
  close:           mockPageClose,
  on:              mockPageOn,
  fill:            mockPageFill,
  click:           mockPageClick,
  waitForSelector: mockPageWaitForSelector,
  setViewportSize: mockPageSetViewportSize,
  evaluate:        mockPageEvaluate,
});

const ctx = { newPage: mockCtxNewPage, close: mockCtxClose } as never;

beforeEach(() => {
  vi.clearAllMocks();
  mockCtxNewPage.mockResolvedValue(makeMockPage());
});
afterEach(() => { vi.restoreAllMocks(); });

// ── TC-L4-001: Page load ──────────────────────────────────────────────────────
describe('checkPageLoad', () => {
  it('TC-L4-001: passes when page loads with 200', async () => {
    mockPageGoto.mockResolvedValue({ status: () => 200 });
    const findings = await checkPageLoad(ctx, 'http://localhost:3000');
    expect(findings.some(f => f.status === 'Pass' && f.analyser === 'L4:PageLoad')).toBe(true);
  });

  it('TC-L4-001: fails when page returns 404', async () => {
    mockPageGoto.mockResolvedValue({ status: () => 404 });
    const findings = await checkPageLoad(ctx, 'http://localhost:3000/missing');
    expect(findings.some(f => f.status === 'Fail' && f.severity === 'High')).toBe(true);
  });

  it('TC-L4-001: skips gracefully when navigation throws', async () => {
    mockPageGoto.mockRejectedValue(new Error('net::ERR_CONNECTION_REFUSED'));
    const findings = await checkPageLoad(ctx, 'http://localhost:3000');
    expect(findings.every(f => f.status === 'Skipped')).toBe(true);
  });
});

// ── TC-L4-007: Console errors ─────────────────────────────────────────────────
describe('checkConsoleErrors', () => {
  it('TC-L4-007: passes when no console errors fired', async () => {
    mockPageGoto.mockResolvedValue({ status: () => 200 });
    // on() is called but no error events emitted
    const findings = await checkConsoleErrors(ctx, 'http://localhost:3000');
    expect(findings.some(f => f.status === 'Pass')).toBe(true);
  });

  it('TC-L4-007: warns when console errors are present', async () => {
    mockPageGoto.mockResolvedValue({ status: () => 200 });
    // Simulate console error event by calling the registered handler
    mockPageOn.mockImplementation((event: string, cb: (msg: { type: () => string; text: () => string }) => void) => {
      if (event === 'console') cb({ type: () => 'error', text: () => 'Uncaught TypeError: x is undefined' });
    });
    const findings = await checkConsoleErrors(ctx, 'http://localhost:3000');
    const warn = findings.find(f => f.status === 'Warn' && f.analyser === 'L4:Console');
    expect(warn).toBeDefined();
    expect(warn?.finding).toContain('1 console error');
  });
});

// ── TC-L4-012: Broken images ──────────────────────────────────────────────────
describe('checkBrokenImages', () => {
  it('TC-L4-012: passes when all images are loaded', async () => {
    mockPageGoto.mockResolvedValue({ status: () => 200 });
    mockPageEvaluate.mockResolvedValue([]);
    const findings = await checkBrokenImages(ctx, 'http://localhost:3000');
    expect(findings.some(f => f.status === 'Pass')).toBe(true);
  });

  it('TC-L4-012: warns when broken images detected', async () => {
    mockPageGoto.mockResolvedValue({ status: () => 200 });
    mockPageEvaluate.mockResolvedValue(['http://localhost:3000/missing.png']);
    const findings = await checkBrokenImages(ctx, 'http://localhost:3000');
    const warn = findings.find(f => f.status === 'Warn' && f.analyser === 'L4:Images');
    expect(warn).toBeDefined();
    expect(warn?.finding).toContain('1 broken image');
  });
});

// ── TC-L4-016: Accessibility ──────────────────────────────────────────────────
describe('checkAccessibility', () => {
  it('TC-L4-016: passes when axe reports no violations', async () => {
    mockPageGoto.mockResolvedValue({ status: () => 200 });
    mockAxeAnalyze.mockResolvedValue({ violations: [] });
    const findings = await checkAccessibility(ctx, 'http://localhost:3000');
    expect(findings.some(f => f.status === 'Pass' && f.analyser === 'L4:A11y')).toBe(true);
  });

  it('TC-L4-016: emits Fail Critical for critical axe violations', async () => {
    mockPageGoto.mockResolvedValue({ status: () => 200 });
    mockAxeAnalyze.mockResolvedValue({
      violations: [{
        id: 'color-contrast', description: 'Elements must have sufficient color contrast',
        impact: 'critical', helpUrl: 'https://dequeuniversity.com/rules/axe/color-contrast',
        nodes: [{ target: ['button'] }, { target: ['a'] }],
      }],
    });
    const findings = await checkAccessibility(ctx, 'http://localhost:3000');
    const fail = findings.find(f => f.status === 'Fail' && f.severity === 'Critical');
    expect(fail).toBeDefined();
    expect(fail?.finding).toContain('color contrast');
  });

  it('TC-L4-016: skips gracefully when axe throws', async () => {
    mockPageGoto.mockResolvedValue({ status: () => 200 });
    mockAxeAnalyze.mockRejectedValue(new Error('axe runtime error'));
    const findings = await checkAccessibility(ctx, 'http://localhost:3000');
    expect(findings.every(f => f.status === 'Skipped')).toBe(true);
  });
});

// ── TC-L4-021: Form submission ────────────────────────────────────────────────
describe('checkForms', () => {
  it('TC-L4-021: returns Skipped when no forms configured', async () => {
    const findings = await checkForms(ctx, []);
    expect(findings[0].status).toBe('Skipped');
  });

  it('TC-L4-021: passes when success selector appears after submit', async () => {
    mockPageGoto.mockResolvedValue({ status: () => 200 });
    mockPageFill.mockResolvedValue(undefined);
    mockPageClick.mockResolvedValue(undefined);
    mockPageWaitForSelector.mockResolvedValue(undefined); // success!

    const form: FormCfg = {
      url: 'http://localhost:3000/login',
      fields: { '#email': 'user@test.com', '#pass': 'secret' },
      submitSelector: 'button[type=submit]',
      successSelector: '.dashboard',
    };
    const findings = await checkForms(ctx, [form]);
    expect(findings.some(f => f.status === 'Pass')).toBe(true);
  });

  it('TC-L4-021: fails when success selector not found after submit', async () => {
    mockPageGoto.mockResolvedValue({ status: () => 200 });
    mockPageFill.mockResolvedValue(undefined);
    mockPageClick.mockResolvedValue(undefined);
    mockPageWaitForSelector.mockRejectedValue(new Error('Timeout'));

    const form: FormCfg = {
      url: 'http://localhost:3000/login',
      fields: { '#email': 'bad@test.com', '#pass': 'wrong' },
      submitSelector: 'button[type=submit]',
      successSelector: '.dashboard',
    };
    const findings = await checkForms(ctx, [form]);
    expect(findings.some(f => f.status === 'Fail' && f.severity === 'High')).toBe(true);
  });
});

// ── TC-L4-028 / TC-L4-029: Responsive breakpoints ────────────────────────────
describe('checkBreakpoints', () => {
  const bps: Viewport[] = [
    { width: 1920, height: 1080, label: 'Desktop' },
    { width: 375,  height: 812,  label: 'Mobile'  },
  ];

  it('TC-L4-028: passes when no overflow at any breakpoint', async () => {
    mockPageSetViewportSize.mockResolvedValue(undefined);
    mockPageGoto.mockResolvedValue({ status: () => 200 });
    mockPageEvaluate.mockResolvedValue([]); // no offenders

    const findings = await checkBreakpoints(ctx, 'http://localhost:3000', bps);
    expect(findings.filter(f => f.status === 'Pass')).toHaveLength(2);
  });

  it('TC-L4-029: warns when horizontal overflow detected on mobile', async () => {
    mockPageSetViewportSize.mockResolvedValue(undefined);
    mockPageGoto
      .mockResolvedValueOnce({ status: () => 200 })  // Desktop — ok
      .mockResolvedValueOnce({ status: () => 200 }); // Mobile — overflow
    mockPageEvaluate
      .mockResolvedValueOnce([])                       // Desktop: no overflow
      .mockResolvedValueOnce(['DIV.hero-banner']);      // Mobile: overflow

    const findings = await checkBreakpoints(ctx, 'http://localhost:3000', bps);
    const mobileWarn = findings.find(f => f.status === 'Warn' && f.analyser === 'L4:Responsive');
    expect(mobileWarn).toBeDefined();
    expect(mobileWarn?.metadata?.viewport).toBe('Mobile');
  });

  it('TC-L4-036: skips gracefully when navigation throws at a breakpoint', async () => {
    mockPageSetViewportSize.mockResolvedValue(undefined);
    mockPageGoto.mockRejectedValue(new Error('net::ERR_CONNECTION_REFUSED'));
    const findings = await checkBreakpoints(ctx, 'http://localhost:3000', bps);
    expect(findings.every(f => f.status === 'Skipped')).toBe(true);
  });
});
