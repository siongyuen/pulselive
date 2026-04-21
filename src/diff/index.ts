import { PulseliveConfig } from '../config.js';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { Scanner } from '../scanner.js';
import { VERSION } from '../version.js';

export interface DiffOptions {
  config?: PulseliveConfig;
  baseDir?: string;
  format?: 'text' | 'json';
  since?: string;
  limit?: number;
  delta?: boolean;
  threshold?: number;
}

export interface RunDiff {
  timestamp: string;
  added: string[];
  removed: string[];
  changed: { check: string; from: any; to: any }[];
}

export interface DeltaResult {
  schema_version: string;
  checked_at: string;
  since: string;
  summary: string;
  significant_changes: number;
  risk: 'none' | 'low' | 'medium' | 'high' | 'critical';
  checks_changed: Record<string, any>;
  recommendation: string;
}

export class PulsetelDiff {
  private config: PulseliveConfig;
  private historyDir: string;

  constructor(config: PulseliveConfig = {}, baseDir?: string) {
    this.config = { ...config };
    this.historyDir = join(baseDir || process.cwd(), '.pulsetel-history');
  }

  loadHistory(): Array<{ timestamp: string; data: any }> {
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

  /**
   * Calculate delta with significance filtering and risk assessment.
   * Returns only significant changes based on threshold.
   */
  calculateDelta(
    oldResults: CheckResult[],
    newResults: CheckResult[],
    threshold: number = 5
  ): DeltaResult {
    const oldMap = new Map(oldResults.map(r => [r.type, r]));
    const newMap = new Map(newResults.map(r => [r.type, r]));
    
    const checksChanged: Record<string, any> = {};
    let hasCritical = false;
    let hasHigh = false;
    let hasMedium = false;
    const summaries: string[] = [];

    // Compare each check type
    for (const [type, newResult] of newMap) {
      const oldResult = oldMap.get(type);
      
      if (!oldResult) {
        // New check appeared
        checksChanged[type] = { status: 'new', current: newResult.status };
        if (newResult.status === 'error') {
          hasHigh = true;
          summaries.push(`${type} now failing`);
        }
        continue;
      }

      const change = this.analyzeSignificantChange(oldResult, newResult, type, threshold);
      if (change) {
        checksChanged[type] = change.details;
        if (change.significance === 'critical') hasCritical = true;
        if (change.significance === 'high') hasHigh = true;
        if (change.significance === 'medium') hasMedium = true;
        if (change.summary) summaries.push(change.summary);
      }
    }

    // Check for removed checks
    for (const [type, oldResult] of oldMap) {
      if (!newMap.has(type)) {
        checksChanged[type] = { status: 'removed', previous: oldResult.status };
      }
    }

    const significantCount = Object.keys(checksChanged).length;
    
    // Determine risk level
    let risk: DeltaResult['risk'] = 'none';
    if (hasCritical) risk = 'critical';
    else if (hasHigh) risk = 'high';
    else if (hasMedium) risk = 'medium';
    else if (significantCount > 0) risk = 'low';

    // Generate recommendation
    const recommendation = this.generateRecommendation(checksChanged, risk);

    // Generate summary
    const summary = summaries.length > 0 
      ? summaries.join(', ')
      : 'No significant changes detected';

    return {
      schema_version: '1.0.0',
      checked_at: new Date().toISOString(),
      since: oldResults[0]?.timestamp || new Date().toISOString(),
      summary,
      significant_changes: significantCount,
      risk,
      checks_changed: checksChanged,
      recommendation
    };
  }

  /**
   * Analyze if a change is significant and return its details.
   */
  private analyzeSignificantChange(
    oldResult: CheckResult,
    newResult: CheckResult,
    type: string,
    threshold: number
  ): { significance: 'critical' | 'high' | 'medium' | 'low'; summary: string; details: any } | null {
    
    // Status changes are always significant
    if (oldResult.status !== newResult.status) {
      const isDegradation = 
        (oldResult.status === 'success' && newResult.status !== 'success') ||
        (oldResult.status === 'warning' && newResult.status === 'error');
      
      if (isDegradation) {
        return {
          significance: newResult.status === 'error' ? 'high' : 'medium',
          summary: `${type}: ${oldResult.status} → ${newResult.status}`,
          details: {
            previous: oldResult.status,
            current: newResult.status,
            change: 'degradation'
          }
        };
      }
    }

    // Coverage changes above threshold
    if (type === 'coverage') {
      const oldPct = oldResult.details?.percentage || 0;
      const newPct = newResult.details?.percentage || 0;
      const delta = newPct - oldPct;
      
      if (Math.abs(delta) >= threshold) {
        const direction = delta > 0 ? 'improved' : 'dropped';
        return {
          significance: delta < 0 ? 'medium' : 'low',
          summary: `coverage ${direction} ${Math.abs(delta).toFixed(1)}%`,
          details: {
            previous: oldPct,
            current: newPct,
            delta: Number(delta.toFixed(2))
          }
        };
      }
    }

    // Dependencies: new critical/high vulnerabilities
    if (type === 'deps') {
      const oldVulns = oldResult.details?.vulnerabilities || {};
      const newVulns = newResult.details?.vulnerabilities || {};
      
      const newCritical = (newVulns.critical || 0) - (oldVulns.critical || 0);
      const newHigh = (newVulns.high || 0) - (oldVulns.high || 0);
      
      if (newCritical > 0 || newHigh > 0) {
        const parts: string[] = [];
        if (newCritical > 0) parts.push(`${newCritical} critical`);
        if (newHigh > 0) parts.push(`${newHigh} high`);
        return {
          significance: newCritical > 0 ? 'critical' : 'high',
          summary: `${newCritical + newHigh} new ${parts.join(', ')} vuln(s)`,
          details: {
            previous: oldVulns,
            current: newVulns,
            new_critical: newCritical,
            new_high: newHigh
          }
        };
      }

      // Significant outdated package changes
      const oldOutdated = oldResult.details?.outdated || 0;
      const newOutdated = newResult.details?.outdated || 0;
      if (Math.abs(newOutdated - oldOutdated) >= 5) {
        return {
          significance: 'low',
          summary: `outdated packages ${newOutdated > oldOutdated ? 'increased' : 'decreased'} by ${Math.abs(newOutdated - oldOutdated)}`,
          details: {
            previous_outdated: oldOutdated,
            current_outdated: newOutdated
          }
        };
      }
    }

    // Health: latency >2x baseline
    if (type === 'health') {
      const oldLatency = oldResult.details?.avgLatency || oldResult.details?.latency;
      const newLatency = newResult.details?.avgLatency || newResult.details?.latency;
      
      if (oldLatency && newLatency && newLatency > oldLatency * 2) {
        return {
          significance: 'medium',
          summary: `endpoint latency increased ${(newLatency / oldLatency).toFixed(1)}x`,
          details: {
            previous_latency: oldLatency,
            current_latency: newLatency,
            multiplier: Number((newLatency / oldLatency).toFixed(2))
          }
        };
      }
    }

    // Issues/PRs: count change >10
    if (type === 'issues' || type === 'prs') {
      const oldCount = oldResult.details?.total || oldResult.details?.count || 0;
      const newCount = newResult.details?.total || newResult.details?.count || 0;
      const delta = newCount - oldCount;
      
      if (Math.abs(delta) >= 10) {
        return {
          significance: 'low',
          summary: `${delta > 0 ? '+' : ''}${delta} ${type}`,
          details: {
            previous: oldCount,
            current: newCount,
            delta
          }
        };
      }
    }

    return null; // Not significant
  }

  /**
   * Generate a recommendation based on changes and risk level.
   */
  private generateRecommendation(changes: Record<string, any>, risk: DeltaResult['risk']): string {
    if (risk === 'none') {
      return 'No action needed - project health is stable';
    }

    if (risk === 'critical') {
      return 'URGENT: Address new critical vulnerabilities immediately before continuing';
    }

    if (risk === 'high') {
      if (changes.ci?.current === 'error') {
        return 'CI is failing - investigate and fix before merging';
      }
      if (changes.deps?.new_critical || changes.deps?.new_high) {
        return 'Review and update vulnerable dependencies';
      }
      return 'Address high-priority issues before continuing';
    }

    if (changes.coverage?.delta && changes.coverage.delta < 0) {
      return 'Consider adding tests to restore coverage';
    }

    if (changes.health?.multiplier && changes.health.multiplier > 2) {
      return 'Investigate endpoint performance degradation';
    }

    return 'Review changes at your convenience';
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

    // Delta mode: condensed, token-efficient output
    if (options.delta) {
      const threshold = options.threshold || 5;
      const deltaResult = this.calculateDelta(
        baseSnapshot.data.results || baseSnapshot.data,
        currentSnapshot.data.results || currentSnapshot.data,
        threshold
      );

      if (options.format === 'json') {
        console.log(JSON.stringify(deltaResult, null, 2));
      } else {
        this.printDeltaText(deltaResult);
      }
      return;
    }

    // Standard diff mode
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

  /**
   * Print delta result in condensed text format.
   */
  private printDeltaText(delta: DeltaResult): void {
    const riskEmoji = {
      none: '✅',
      low: 'ℹ️',
      medium: '⚠️',
      high: '🔴',
      critical: '💥'
    };

    console.log(`\n${riskEmoji[delta.risk]} PulseTel Delta: ${delta.summary}\n`);
    console.log(`Risk: ${delta.risk.toUpperCase()} | Changes: ${delta.significant_changes}`);
    console.log(`Since: ${delta.since}\n`);

    if (Object.keys(delta.checks_changed).length > 0) {
      console.log('Significant changes:');
      for (const [type, change] of Object.entries(delta.checks_changed)) {
        if (change.delta !== undefined) {
          const arrow = change.delta > 0 ? '↑' : '↓';
          console.log(`  ${type}: ${arrow} ${Math.abs(change.delta).toFixed(1)}%`);
        } else if (change.previous !== undefined && change.current !== undefined) {
          console.log(`  ${type}: ${change.previous} → ${change.current}`);
        } else if (change.new_critical !== undefined) {
          console.log(`  ${type}: +${change.new_critical} critical, +${change.new_high || 0} high`);
        } else if (change.status) {
          console.log(`  ${type}: ${change.status}`);
        }
      }
      console.log('');
    }

    console.log(`💡 ${delta.recommendation}\n`);
  }

  private async gatherCurrentState(): Promise<any> {
    const scanner = new Scanner(this.config);
    return await scanner.runAllChecks();
  }
}

// Type for check results used in delta calculation
interface CheckResult {
  type: string;
  status: 'success' | 'warning' | 'error';
  message?: string;
  details?: any;
  timestamp?: string;
}
