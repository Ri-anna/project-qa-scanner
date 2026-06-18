import fs   from 'fs';
import path from 'path';
import { ScanResult, Finding, Status, Severity, Level } from '../core/types.js';

// ── helpers ──────────────────────────────────────────────────────────────────
const STATUS_EMOJI: Record<Status,   string> = { Pass:'✅', Warn:'⚠️', Fail:'❌', Skipped:'⏭️' };
const SEV_ORDER:    Severity[]               = ['Critical','High','Medium','Low','Info'];

function buildSummary(findings: Finding[], targetDir: string, stack: string): ScanResult['summary'] {
  const byStatus   = { Pass: 0, Warn: 0, Fail: 0, Skipped: 0 } as Record<Status,   number>;
  const bySeverity = { Critical: 0, High: 0, Medium: 0, Low: 0, Info: 0 } as Record<Severity, number>;
  const byLevel    = { L1: 0, L2: 0, L3: 0, L4: 0 } as Record<Level, number>;

  for (const f of findings) {
    byStatus[f.status]++;
    bySeverity[f.severity]++;
    byLevel[f.level]++;
  }

  const fails = byStatus.Fail + byStatus.Warn;
  const narrative = fails === 0
    ? `All ${findings.length} checks passed. The project appears healthy across all scanned levels.`
    : `Scan found ${byStatus.Fail} failure(s) and ${byStatus.Warn} warning(s) across ${findings.length} total checks. ` +
      `${bySeverity.Critical > 0 ? `${bySeverity.Critical} Critical issue(s) require immediate attention. ` : ''}` +
      `Review Fail findings before merging or deploying.`;

  return { scannedAt: new Date().toISOString(), targetDir, stack, byStatus, bySeverity, byLevel, narrative };
}

// ── JSON ─────────────────────────────────────────────────────────────────────
function toJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}

// ── Markdown ─────────────────────────────────────────────────────────────────
function toMarkdown(result: ScanResult): string {
  const { summary, findings } = result;
  const lines: string[] = [
    '# QA Scanner Report',
    '',
    `**Scanned:** ${summary.scannedAt}  `,
    `**Target:** \`${summary.targetDir}\`  `,
    `**Stack:** ${summary.stack}`,
    '',
    '## Overall Summary',
    '',
    summary.narrative,
    '',
    '| Status | Count |', '|--------|-------|',
    ...(['Pass','Warn','Fail','Skipped'] as Status[]).map(s =>
      `| ${STATUS_EMOJI[s]} ${s} | ${summary.byStatus[s]} |`),
    '',
    '| Severity | Count |', '|----------|-------|',
    ...SEV_ORDER.map(s => `| ${s} | ${summary.bySeverity[s]} |`),
    '',
    '---',
    '',
    '## Findings',
    '',
  ];

  const byLevel: Record<string, Finding[]> = {};
  for (const f of findings) { (byLevel[f.level] ??= []).push(f); }
  for (const lvl of ['L1','L2','L3','L4']) {
    const group = byLevel[lvl];
    if (!group?.length) continue;
    lines.push(`### ${lvl}`);
    for (const f of group) {
      lines.push(`\n#### ${STATUS_EMOJI[f.status]} ${f.finding}`);
      lines.push(`- **Status:** ${f.status}`);
      lines.push(`- **Severity:** ${f.severity}`);
      lines.push(`- **Analyser:** ${f.analyser}`);
      if (f.recommendation) lines.push(`- **Recommendation:** ${f.recommendation}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ── HTML ─────────────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<Status, string> = {
  Pass: '#375623', Warn: '#7D6608', Fail: '#C00000', Skipped: '#808080'
};
const STATUS_BG: Record<Status, string> = {
  Pass: '#D5E8D4', Warn: '#FEF9E7', Fail: '#F8CECC', Skipped: '#F2F2F2'
};

function toHtml(result: ScanResult): string {
  const { summary, findings } = result;
  const rows = findings.map(f => `
    <tr style="background:${STATUS_BG[f.status]}">
      <td style="color:${STATUS_COLOR[f.status]};font-weight:bold">${STATUS_EMOJI[f.status]} ${f.status}</td>
      <td><b>${f.level}</b> · ${f.analyser}</td>
      <td>${f.finding}</td>
      <td style="font-weight:bold">${f.severity}</td>
      <td>${f.recommendation || '—'}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>QA Scanner Report</title>
<style>
  body{font-family:Arial,sans-serif;margin:0;padding:24px;background:#f9f9f9;color:#222}
  h1{color:#1F497D;margin-bottom:4px}
  .meta{color:#888;font-size:13px;margin-bottom:24px}
  .narrative{background:#EBF2FB;border-left:4px solid #2E75B6;padding:12px 16px;border-radius:4px;margin-bottom:24px}
  .summary{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:24px}
  .badge{padding:8px 16px;border-radius:6px;font-weight:bold;font-size:14px}
  table{width:100%;border-collapse:collapse;font-size:13px;background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)}
  th{background:#1F497D;color:#fff;padding:10px 12px;text-align:left}
  td{padding:9px 12px;border-bottom:1px solid #eee;vertical-align:top}
</style>
</head>
<body>
<h1>🔍 QA Scanner Report</h1>
<div class="meta">Scanned: ${summary.scannedAt} · Target: <code>${summary.targetDir}</code> · Stack: ${summary.stack}</div>
<div class="narrative">${summary.narrative}</div>
<div class="summary">
  ${(['Pass','Warn','Fail','Skipped'] as Status[]).map(s =>
    `<div class="badge" style="background:${STATUS_BG[s]};color:${STATUS_COLOR[s]}">${STATUS_EMOJI[s]} ${s}: ${summary.byStatus[s]}</div>`
  ).join('')}
  ${SEV_ORDER.filter(s => summary.bySeverity[s] > 0).map(s =>
    `<div class="badge" style="background:#eee;color:#333">${s}: ${summary.bySeverity[s]}</div>`
  ).join('')}
</div>
<table>
  <thead><tr>
    <th>Status</th><th>Level · Analyser</th><th>Finding</th><th>Severity</th><th>Recommendation</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
</body></html>`;
}

// ── write ─────────────────────────────────────────────────────────────────────
export function writeReport(
  findings:  Finding[],
  targetDir: string,
  stack:     string,
  outputDir: string,
  formats:   string[],
): ScanResult {
  const result: ScanResult = { summary: buildSummary(findings, targetDir, stack), findings };
  fs.mkdirSync(outputDir, { recursive: true });

  if (formats.includes('json'))     fs.writeFileSync(path.join(outputDir, 'report.json'),     toJson(result),     'utf-8');
  if (formats.includes('markdown')) fs.writeFileSync(path.join(outputDir, 'report.md'),       toMarkdown(result), 'utf-8');
  if (formats.includes('html'))     fs.writeFileSync(path.join(outputDir, 'report.html'),     toHtml(result),     'utf-8');

  return result;
}
