import { PulseliveConfig } from '../config.js';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { Scanner } from '../scanner.js';

export interface DiffOptions {
  config?: PulseliveConfig;
  baseDir?: string;
  format?: 'text' | 'json';
  since?: string;
  limit?: number;
}

export interface RunDiff {
  timestamp: string;
  added: string[];
  removed: string[];
  changed: { check: string; from: any; to: any }[];
}

export class PulsetelDiff {
  private config: PulseliveConfig;
  private historyDir: string;

  constructor(config: PulseliveConfig = {}, baseDir?: string) {
    this.config = { ...config };
    this.historyDir = join(baseDir || process.cwd(), '.pulsetel-history');
  }

  private loadHistory(): Array<{ timestamp: string; data: any }> {
    if (!existsSync(this.historyDir)) {
      return [];
    }

    const files = readdirSync(this.historyDir)
      .filter((f: string) => f.endsWith('.json') && f.startsWith('run-'))
      .map((f: string) => ({
        timestamp: f.slice(4, -5),
        path: join(this.historyDir, f)
      }))
      .sort((a: any, b: any) => b.timestamp.localeCompare(a.timestamp));

    return files.map(({ timestamp, path }: { timestamp: string; path: string }) => ({
      timestamp,
      data: JSON.parse(readFileSync(path, 'utf8'))
    }));
  }

  diffSnapshots(oldSnap: any, newSnap: any): RunDiff {
    const added: string[] = [];
    const removed: string[] = [];
    const changed: RunDiff['changed'] = [];

    const oldFlat = this.flattenResults(oldSnap);
    const newFlat = this.flattenResults(newSnap);

    const oldKeys = new Set(Object.keys(oldFlat));
    const newKeys = new Set(Object.keys(newFlat));

    for (const key of oldKeys) {
      if (!newKeys.has(key)) {
        removed.push(key);
      }
    }

    for (const key of newKeys) {
      if (!oldKeys.has(key)) {
        added.push(key);
      }
    }

    for (const key of newKeys) {
      if (oldKeys.has(key)) {
        const oldVal = oldFlat[key];
        const newVal = newFlat[key];
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          changed.push({
            check: key,
            from: oldVal,
            to: newVal
          });
        }
      }
    }

    return { added, removed, changed, timestamp: new Date().toISOString() };
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

  async run(options: DiffOptions = {}): Promise<void> {
    const history = this.loadHistory();

    if (history.length === 0) {
      console.log('No history found. Run pulsetel at least twice to use diff.');
      return;
    }

    const baseSnapshot = history[0];
    const currentSnapshot = { timestamp: new Date().toISOString(), data: await this.gatherCurrentState() };

    const diffResult = this.diffSnapshots(baseSnapshot.data, currentSnapshot.data);

    if (options.format === 'json') {
      console.log(JSON.stringify(diffResult, null, 2));
      return;
    }

    if (diffResult.added.length === 0 && 
        diffResult.removed.length === 0 && 
        diffResult.changed.length === 0) {
      console.log('No changes detected since ' + baseSnapshot.timestamp);
      return;
    }

    console.log(`\nPulsetel Diff: ${baseSnapshot.timestamp} → ${new Date().toISOString()}\n`);

    if (diffResult.added.length > 0) {
      console.log('Added:');
      diffResult.added.forEach((item: string) => console.log(`  + ${item}`));
      console.log('');
    }

    if (diffResult.removed.length > 0) {
      console.log('Removed:');
      diffResult.removed.forEach((item: string) => console.log(`  - ${item}`));
      console.log('');
    }

    if (diffResult.changed.length > 0) {
      console.log('Changed:');
      diffResult.changed.forEach((change) => {
        console.log(`  ${change.check}:`);
        console.log(`    - ${JSON.stringify(change.from)}`);
        console.log(`    + ${JSON.stringify(change.to)}`);
      });
      console.log('');
    }
  }

  private async gatherCurrentState(): Promise<any> {
    const scanner = new Scanner(this.config);
    return await scanner.runAllChecks();
  }
}