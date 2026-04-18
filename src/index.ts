#!/usr/bin/env node

import { Command } from 'commander';
import { ConfigLoader } from './config';
import { Scanner } from './scanner';
import { Reporter } from './reporter';
import { MCPServer } from './mcp-server';
import { writeFileSync } from 'fs';
import yaml from 'yaml';

const program = new Command();

program
  .name('pulselive')
  .description('Real-time project health checker')
  .version('0.1.0');

program
  .command('check')
  .description('Run all checks and show report')
  .option('--json', 'Output results as JSON')
  .option('--fail-on-error', 'Exit with code 1 if critical issues found')
  .option('--ci', 'Deprecated: use --fail-on-error instead')
  .option('--type <type>', 'Run only specific check type (ci, health, deps, git, issues, deploy)')
  .action(async (options) => {
    const configLoader = new ConfigLoader();
    const config = configLoader.autoDetect();
    const scanner = new Scanner(config);
    const reporter = new Reporter(!options.json);

    let results: any;
    
    if (options.type) {
      results = [await scanner.runSingleCheck(options.type)];
    } else {
      results = await scanner.runAllChecks();
    }

    if (options.json) {
      console.log(reporter.formatJson(results));
    } else {
      console.log(reporter.format(results));
    }

    if (options.failOnError || options.ci) {
      const hasCritical = results.some((r: any) => r.status === 'error');
      if (hasCritical) {
        process.exit(1);
      }
    }
  });

program
  .command('init')
  .description('Generate .pulselive.yml configuration file')
  .action(() => {
    const configLoader = new ConfigLoader();
    const detected = configLoader.autoDetect();

    const defaultConfig = {
      github: {
        repo: detected.github?.repo || '',
        token: detected.github?.token || ''
      },
      health: {
        endpoints: detected.health?.endpoints || [
          {
            name: 'API',
            url: 'http://localhost:3000/health'
          }
        ]
      },
      checks: detected.checks || {
        ci: true,
        deps: true,
        git: true,
        health: true,
        issues: true,
        deploy: true
      }
    };

    writeFileSync('.pulselive.yml', yaml.stringify(defaultConfig));
    console.log('Generated .pulselive.yml configuration file');
    if (detected.github?.repo) {
      console.log(`  Auto-detected GitHub repo: ${detected.github.repo}`);
    }
  });

program
  .command('mcp')
  .description('Start MCP server')
  .option('--port <port>', 'Port to listen on', '3000')
  .action((options) => {
    const configLoader = new ConfigLoader();
    const mcpServer = new MCPServer(configLoader, parseInt(options.port));
    mcpServer.start();
    
    console.log('MCP Server started. Press Ctrl+C to stop.');
  });

program.parse(process.argv);

// Handle no command case
if (!process.argv.slice(2).length) {
  program.outputHelp();
}