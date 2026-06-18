#!/usr/bin/env node
import { Command } from 'commander';
import path        from 'path';
import chalk       from 'chalk';
import { loadConfig }     from './config/loader.js';
import { probeServices }  from './core/service-probe.js';
import { runL1 }          from './analysers/l1/index.js';
import { runL2 }          from './analysers/l2/index.js';
import { runL3 }          from './analysers/l3/index.js';
import { runL4 }          from './analysers/l4/index.js';
import { writeReport }    from './report/index.js';
import { Finding, Status } from './core/types.js';

const STATUS_SYMBOL: Record<Status, string> = {
  Pass: chalk.green('✅'), Warn: chalk.yellow('⚠️ '), Fail: chalk.red('❌'), Skipped: chalk.grey('⏭️ '),
};

const program = new Command();

program
  .name('qa-scan')
  .description('QA Scanner — static + runtime quality analysis across 4 levels')
  .version('1.0.0')
  .option('-c, --config <path>', 'path to config file', 'qa-scanner.config.json')
  .option('-o, --output <dir>',  'output directory override')
  .option('--no-l1', 'skip Level 1 (Code & Repo)')
  .option('--no-l2', 'skip Level 2 (Security)')
  .option('--no-l3', 'skip Level 3 (API/Backend)')
  .option('--no-l4', 'skip Level 4 (UI/Browser)')
  .action(async (opts) => {
    console.log(chalk.bold.blue('\n🔍 QA Scanner v1.0.0\n'));

    // ── load config ──────────────────────────────────────────────────────────
    let config;
    try {
      config = loadConfig(path.resolve(opts.config));
    } catch (e) {
      console.error(chalk.red(`\n❌ ${(e as Error).message}\n`));
      process.exit(1);
    }

    const targetDir = path.resolve(config.targetDir);
    const outputDir = opts.output ? path.resolve(opts.output) : path.resolve(config.outputDir);

    console.log(`  Target : ${chalk.cyan(targetDir)}`);
    console.log(`  Output : ${chalk.cyan(outputDir)}\n`);

    // ── probe services ───────────────────────────────────────────────────────
    console.log(chalk.bold('Probing services…'));
    const serviceStatus = await probeServices(config.services ?? {});
    for (const [name, up] of Object.entries(serviceStatus)) {
      console.log(`  ${name.padEnd(10)} ${up ? chalk.green('reachable') : chalk.yellow('unreachable')} (${config.services[name]})`);
    }
    console.log('');

    // ── run levels ───────────────────────────────────────────────────────────
    const allFindings: Finding[] = [];
    const levels: Array<[string, () => Promise<Finding[]>]> = [];

    if (opts.l1 !== false) levels.push(['L1 — Code & Repository', () => runL1(config, targetDir)]);
    if (opts.l2 !== false) levels.push(['L2 — Security',          () => runL2(config, targetDir, serviceStatus)]);
    if (opts.l3 !== false) levels.push(['L3 — API / Backend',     () => runL3(config, serviceStatus)]);
    if (opts.l4 !== false) levels.push(['L4 — UI / Browser',      () => runL4(config, serviceStatus)]);

    for (const [label, runner] of levels) {
      console.log(chalk.bold(`Running ${label}…`));
      try {
        const findings = await runner();
        allFindings.push(...findings);
        for (const f of findings) {
          console.log(`  ${STATUS_SYMBOL[f.status]} [${f.severity.padEnd(8)}] ${f.finding}`);
        }
      } catch (e) {
        console.error(chalk.red(`  ❌ Level runner threw unexpectedly: ${(e as Error).message}`));
      }
      console.log('');
    }

    // ── write report ─────────────────────────────────────────────────────────
    const stack = (config.stack ?? 'auto-detected');
    const result = writeReport(allFindings, targetDir, stack, outputDir, config.outputFormat);

    // ── print summary ─────────────────────────────────────────────────────────
    const { byStatus, bySeverity } = result.summary;
    console.log(chalk.bold('Summary'));
    console.log(`  ${chalk.green(`✅ Pass: ${byStatus.Pass}`)}  ${chalk.yellow(`⚠️  Warn: ${byStatus.Warn}`)}  ${chalk.red(`❌ Fail: ${byStatus.Fail}`)}  ${chalk.grey(`⏭️  Skipped: ${byStatus.Skipped}`)}`);
    if (bySeverity.Critical > 0) console.log(chalk.red.bold(`  ⛔ ${bySeverity.Critical} Critical finding(s) require immediate attention.`));
    console.log(`\n  Report written to: ${chalk.cyan(outputDir)}\n`);

    process.exit(byStatus.Fail > 0 ? 1 : 0);
  });

program.parse();
