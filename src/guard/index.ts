import { PulseliveConfig } from '../config.js';
import { execFileSync } from 'child_process';
import { Scanner } from '../scanner.js';

// Allowed commands for guard execution (prevent arbitrary command injection)
const ALLOWED_GUARD_COMMANDS = [
  'npm', 'yarn', 'pnpm',
  'node', 'npx',
  'git',
  'tsc', 'eslint', 'prettier',
  'jest', 'vitest', 'mocha',
  'cargo', 'go', 'python', 'python3',
  'make', 'cmake',
];

/**
 * Validate guard command for security.
 * Rejects absolute paths, shell metacharacters, and commands not in allowlist.
 */
export function validateGuardCommand(command: string): { valid: boolean; error?: string } {
  // Reject shell metacharacters first (before path check, since they might contain slashes)
  if (/[;&|<>$`"\\]/.test(command)) {
    return { valid: false, error: `Shell metacharacters not allowed in command: ${command}` };
  }

  // Reject absolute paths (could be anything)
  if (command.includes('/') || command.includes('\\')) {
    return { valid: false, error: `Absolute paths not allowed: ${command}` };
  }


  // Check against allowlist
  const baseCommand = command.split(' ')[0];
  if (!ALLOWED_GUARD_COMMANDS.includes(baseCommand)) {
    return { valid: false, error: `Command not in allowlist: ${baseCommand}. Allowed: ${ALLOWED_GUARD_COMMANDS.join(', ')}` };
  }

  return { valid: true };
}

export interface GuardOptions {
  config?: PulseliveConfig;
  command: string;
  args?: string[];
  cwd?: string;
  timeout?: number;
  threshold?: number;
}

export interface GuardResult {
  before: any;
  after: any;
  drift: {
    checks: string[];
    maxChangePercent: number;
    exceededThreshold: boolean;
  };
  exitCode: number;
  stdout: string;
  stderr: string;
}

export class PulsetelGuard {
  private config: PulseliveConfig;
  private options: GuardOptions;

  constructor(config: PulseliveConfig = {}, options: GuardOptions) {
    this.config = { ...config };
    this.options = options;
  }

  async run(): Promise<GuardResult> {
    // Validate command before execution
    const validation = validateGuardCommand(this.options.command);
    if (!validation.valid) {
      console.error(`Guard command rejected: ${validation.error}`);
      process.exit(1);
    }

    try {
      execFileSync(this.options.command, ['--help'], { stdio: 'ignore' });
    } catch (err) {
      console.error(`Command not found or not executable: ${this.options.command}`);
      process.exit(1);
    }

    const threshold = this.options.threshold ?? 20;

    console.log('Running pre-checks...');
    const before = await this.gatherState();

    console.log(`Running: ${this.options.command} ${this.options.args?.join(' ') || ''}`);
    let stdout = '';
    let stderr = '';
    let exitCode = 0;

    try {
      const result = execFileSync(
        this.options.command,
        this.options.args || [],
        {
          cwd: this.options.cwd,
          timeout: this.options.timeout || 30000,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'] as any
        }
      );
      stdout = (result as any).stdout || '';
      stderr = (result as any).stderr || '';
      exitCode = 0;
    } catch (err: any) {
      stdout = err.stdout || '';
      stderr = err.stderr || err.message;
      exitCode = err.status || 1;
    }

    console.log('Running post-checks...');
    const after = await this.gatherState();

    const drift = this.calculateDrift(before, after, threshold);

    const result: GuardResult = {
      before,
      after,
      drift,
      exitCode,
      stdout,
      stderr
    };

    this.outputResult(result);
    return result;
  }

  private async gatherState(): Promise<any> {
    const scanner = new Scanner(this.config);
    return await scanner.runAllChecks();
  }

  calculateDrift(before: any, after: any, threshold: number): GuardResult['drift'] {
    const beforeFlat = this.flattenResults(before);
    const afterFlat = this.flattenResults(after);

    const allKeys = new Set([
      ...Object.keys(beforeFlat),
      ...Object.keys(afterFlat)
    ]);

    const changedChecks: string[] = [];
    let maxChangePercent = 0;

    for (const key of allKeys) {
      const beforeVal = beforeFlat[key];
      const afterVal = afterFlat[key];

      if (beforeVal === undefined && afterVal === undefined) continue;

      let changePercent = 0;

      if (typeof beforeVal === 'number' && typeof afterVal === 'number') {
        if (beforeVal === 0) {
          changePercent = afterVal !== 0 ? 100 : 0;
        } else {
          changePercent = Math.abs((afterVal - beforeVal) / beforeVal) * 100;
        }
      } else if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
        changePercent = 100;
      }

      if (changePercent > 0) {
        changedChecks.push(key);
        if (changePercent > maxChangePercent) {
          maxChangePercent = changePercent;
        }
      }
    }

    return {
      checks: changedChecks,
      maxChangePercent,
      exceededThreshold: maxChangePercent > threshold
    };
  }

  private flattenResults(obj: any, prefix = ''): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, this.flattenResults(value, fullKey));
      } else {
        result[fullKey] = value;
      }
    }

    return result;
  }

  private outputResult(result: GuardResult): void {
    console.log(`\nPulsetel Guard Results\n`);

    if (result.exitCode !== 0) {
      console.error(`Command exited with code: ${result.exitCode}`);
    } else {
      console.log(`Command exited with code: ${result.exitCode}`);
    }

    if (result.drift.checks.length === 0) {
      console.log('No drift detected.');
    } else {
      if (result.drift.exceededThreshold) {
        console.warn(`Drift detected! ${result.drift.checks.length} checks changed ` +
                `(max ${result.drift.maxChangePercent.toFixed(1)}% change)`);
      } else {
        console.log(`Drift detected but within threshold: ${result.drift.checks.length} checks changed ` +
                `(max ${result.drift.maxChangePercent.toFixed(1)}% change)`);
      }

      console.log('\nChanged checks:');
      result.drift.checks.forEach(check => {
        const before = this.getValueByPath(result.before, check);
        const after = this.getValueByPath(result.after, check);
        console.log(`  ${check}:`);
        console.log(`    before: ${JSON.stringify(before)}`);
        console.log(`    after:  ${JSON.stringify(after)}`);
      });
    }

    if (result.stderr.trim() || process.env.PULSETEL_VERBOSE) {
      if (result.stderr.trim()) {
        console.log('\nCommand stderr:');
        console.log(result.stderr.trim());
      }
      if (process.env.PULSETEL_VERBOSE && result.stdout.trim()) {
        console.log('\nCommand stdout:');
        console.log(result.stdout.trim());
      }
    }
  }

  private getValueByPath(obj: any, path: string): any {
    return path.split('.').reduce((o: any, p: string) => (o && o[p] !== undefined) ? o[p] : undefined, obj);
  }
}
