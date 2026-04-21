import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PulsetelDiff } from '../src/diff/index.js';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

describe('PulsetelDiff', () => {
  let diff: PulsetelDiff;
  const testDir = '/tmp/pulsetel-test-diff';

  beforeEach(() => {
    // Clean up and recreate test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, '.pulsetel-history'), { recursive: true });
    
    diff = new PulsetelDiff({}, testDir);
  });

  afterEach(() => {
    // Clean up
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('diffSnapshots', () => {
    it('should detect added fields', () => {
      const oldSnap = { a: 1, b: 2 };
      const newSnap = { a: 1, b: 2, c: 3 };

      const result = diff.diffSnapshots(oldSnap, newSnap);

      expect(result.added).toContain('c');
      expect(result.removed).toHaveLength(0);
      expect(result.changed).toHaveLength(0);
    });

    it('should detect removed fields', () => {
      const oldSnap = { a: 1, b: 2, c: 3 };
      const newSnap = { a: 1, b: 2 };

      const result = diff.diffSnapshots(oldSnap, newSnap);

      expect(result.removed).toContain('c');
      expect(result.added).toHaveLength(0);
      expect(result.changed).toHaveLength(0);
    });

    it('should detect changed fields', () => {
      const oldSnap = { status: 'success', duration: 100 };
      const newSnap = { status: 'warning', duration: 150 };

      const result = diff.diffSnapshots(oldSnap, newSnap);

      expect(result.changed).toHaveLength(2);
      expect(result.changed).toContainEqual({
        check: 'status',
        from: 'success',
        to: 'warning'
      });
      expect(result.changed).toContainEqual({
        check: 'duration',
        from: 100,
        to: 150
      });
    });

    it('should detect nested changes', () => {
      const oldSnap = { results: { ci: { status: 'success' } } };
      const newSnap = { results: { ci: { status: 'error' } } };

      const result = diff.diffSnapshots(oldSnap, newSnap);

      expect(result.changed).toHaveLength(1);
      expect(result.changed[0].check).toBe('results.ci.status');
      expect(result.changed[0].from).toBe('success');
      expect(result.changed[0].to).toBe('error');
    });

    it('should handle identical snapshots', () => {
      const oldSnap = { a: 1, b: { c: 2 } };
      const newSnap = { a: 1, b: { c: 2 } };

      const result = diff.diffSnapshots(oldSnap, newSnap);

      expect(result.added).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
      expect(result.changed).toHaveLength(0);
    });

    it('should handle empty snapshots', () => {
      const oldSnap = {};
      const newSnap = { a: 1 };

      const result = diff.diffSnapshots(oldSnap, newSnap);

      expect(result.added).toContain('a');
      expect(result.removed).toHaveLength(0);
    });

    it('should handle complex mixed changes', () => {
      const oldSnap = {
        fieldA: 'value1',
        fieldB: 100,
        timestamp: '2026-01-01'
      };

      const newSnap = {
        fieldA: 'value2',
        fieldB: 100,
        newField: 'added'
      };

      const result = diff.diffSnapshots(oldSnap, newSnap);

      // fieldA changed, timestamp removed, newField added
      expect(result.changed).toContainEqual({
        check: 'fieldA',
        from: 'value1',
        to: 'value2'
      });
      expect(result.added).toContain('newField');
      expect(result.removed).toContain('timestamp');
    });
  });

  describe('calculateDelta', () => {
    it('should detect status degradation as high significance', () => {
      const oldResults = [
        { type: 'ci', status: 'success', details: {} },
        { type: 'coverage', status: 'success', details: { percentage: 85 } }
      ];
      const newResults = [
        { type: 'ci', status: 'error', details: {} },
        { type: 'coverage', status: 'success', details: { percentage: 85 } }
      ];

      const result = (diff as any).calculateDelta(oldResults, newResults, 5);

      expect(result.significant_changes).toBe(1);
      expect(result.risk).toBe('high');
      expect(result.checks_changed.ci).toBeDefined();
      expect(result.checks_changed.ci.change).toBe('degradation');
    });

    it('should detect coverage drop as medium significance', () => {
      const oldResults = [
        { type: 'coverage', status: 'success', details: { percentage: 85 } }
      ];
      const newResults = [
        { type: 'coverage', status: 'success', details: { percentage: 78 } }
      ];

      const result = (diff as any).calculateDelta(oldResults, newResults, 5);

      expect(result.significant_changes).toBe(1);
      expect(result.risk).toBe('medium');
      expect(result.checks_changed.coverage.delta).toBeLessThan(0);
    });

    it('should detect new critical vulnerabilities as critical risk', () => {
      const oldResults = [
        { type: 'deps', status: 'success', details: { vulnerabilities: { critical: 0, high: 0 } } }
      ];
      const newResults = [
        { type: 'deps', status: 'success', details: { vulnerabilities: { critical: 2, high: 3 } } }
      ];

      const result = (diff as any).calculateDelta(oldResults, newResults, 5);

      expect(result.significant_changes).toBe(1);
      expect(result.risk).toBe('critical');
      expect(result.checks_changed.deps.new_critical).toBe(2);
    });

    it('should detect new checks as significant', () => {
      const oldResults = [
        { type: 'ci', status: 'success', details: {} }
      ];
      const newResults = [
        { type: 'ci', status: 'success', details: {} },
        { type: 'health', status: 'error', details: {} }
      ];

      const result = (diff as any).calculateDelta(oldResults, newResults, 5);

      expect(result.significant_changes).toBe(1);
      expect(result.checks_changed.health.status).toBe('new');
    });

    it('should detect removed checks', () => {
      const oldResults = [
        { type: 'ci', status: 'success', details: {} },
        { type: 'coverage', status: 'success', details: {} }
      ];
      const newResults = [
        { type: 'ci', status: 'success', details: {} }
      ];

      const result = (diff as any).calculateDelta(oldResults, newResults, 5);

      expect(result.significant_changes).toBe(1);
      expect(result.checks_changed.coverage.status).toBe('removed');
    });

    it('should return no significant changes when below threshold', () => {
      const oldResults = [
        { type: 'coverage', status: 'success', details: { percentage: 85 } }
      ];
      const newResults = [
        { type: 'coverage', status: 'success', details: { percentage: 83 } }
      ];

      const result = (diff as any).calculateDelta(oldResults, newResults, 5);

      expect(result.significant_changes).toBe(0);
      expect(result.risk).toBe('none');
    });

    it('should use custom threshold parameter', () => {
      const oldResults = [
        { type: 'coverage', status: 'success', details: { percentage: 85 } }
      ];
      const newResults = [
        { type: 'coverage', status: 'success', details: { percentage: 83 } }
      ];

      const result = (diff as any).calculateDelta(oldResults, newResults, 1);

      expect(result.significant_changes).toBe(1);
      expect(result.checks_changed.coverage).toBeDefined();
    });
  });

  describe('analyzeSignificantChange', () => {
    it('should detect status degradation', () => {
      const oldResult = { type: 'ci', status: 'success', details: {} };
      const newResult = { type: 'ci', status: 'error', details: {} };

      const result = (diff as any).analyzeSignificantChange(oldResult, newResult, 'ci', 5);

      expect(result).not.toBeNull();
      expect(result?.significance).toBe('high');
      expect(result?.summary).toContain('success → error');
    });

    it('should detect coverage drop', () => {
      const oldResult = { type: 'coverage', status: 'success', details: { percentage: 85 } };
      const newResult = { type: 'coverage', status: 'success', details: { percentage: 75 } };

      const result = (diff as any).analyzeSignificantChange(oldResult, newResult, 'coverage', 5);

      expect(result).not.toBeNull();
      expect(result?.significance).toBe('medium');
      expect(result?.details.delta).toBeLessThan(0);
    });

    it('should detect new vulnerabilities', () => {
      const oldResult = { 
        type: 'deps', 
        status: 'success', 
        details: { vulnerabilities: { critical: 0, high: 0 } } 
      };
      const newResult = { 
        type: 'deps', 
        status: 'success', 
        details: { vulnerabilities: { critical: 1, high: 2 } } 
      };

      const result = (diff as any).analyzeSignificantChange(oldResult, newResult, 'deps', 5);

      expect(result).not.toBeNull();
      expect(result?.significance).toBe('critical');
      expect(result?.details.new_critical).toBe(1);
    });

    it('should detect latency increase', () => {
      const oldResult = { 
        type: 'health', 
        status: 'success', 
        details: { latency: 100 } 
      };
      const newResult = { 
        type: 'health', 
        status: 'success', 
        details: { latency: 250 } 
      };

      const result = (diff as any).analyzeSignificantChange(oldResult, newResult, 'health', 5);

      expect(result).not.toBeNull();
      expect(result?.significance).toBe('medium');
      expect(result?.details.multiplier).toBeGreaterThan(2);
    });

    it('should return null for non-significant changes', () => {
      const oldResult = { 
        type: 'coverage', 
        status: 'success', 
        details: { percentage: 85 } 
      };
      const newResult = { 
        type: 'coverage', 
        status: 'success', 
        details: { percentage: 84 } 
      };

      const result = (diff as any).analyzeSignificantChange(oldResult, newResult, 'coverage', 5);

      expect(result).toBeNull();
    });
  });

  describe('generateRecommendation', () => {
    it('should return no action needed for no risk', () => {
      const result = (diff as any).generateRecommendation({}, 'none');
      expect(result).toContain('No action needed');
    });

    it('should return urgent message for critical risk', () => {
      const changes = { deps: { new_critical: 2 } };
      const result = (diff as any).generateRecommendation(changes, 'critical');
      expect(result).toContain('URGENT');
    });

    it('should return CI fix message for high risk with CI failure', () => {
      const changes = { ci: { current: 'error' } };
      const result = (diff as any).generateRecommendation(changes, 'high');
      expect(result).toContain('CI is failing');
    });

    it('should return coverage message for coverage drop', () => {
      const changes = { coverage: { delta: -5 } };
      const result = (diff as any).generateRecommendation(changes, 'medium');
      expect(result).toContain('Consider adding tests');
    });

    it('should return health investigation message', () => {
      const changes = { health: { multiplier: 2.5 } };
      const result = (diff as any).generateRecommendation(changes, 'medium');
      expect(result).toContain('Investigate endpoint performance');
    });
  });

  describe('loadHistory', () => {
    it('should return empty array when no history directory', () => {
      const result = (diff as any).loadHistory();
      expect(result).toHaveLength(0);
    });

    it('should load and parse history files', () => {
      const historyDir = join(testDir, '.pulsetel-history');
      
      // Create some history files
      writeFileSync(join(historyDir, 'run-2026-01-01T10-00-00.json'), JSON.stringify({
        results: [{ type: 'ci', status: 'success' }]
      }));
      
      writeFileSync(join(historyDir, 'run-2026-01-02T10-00-00.json'), JSON.stringify({
        results: [{ type: 'ci', status: 'error' }]
      }));

      const result = (diff as any).loadHistory();

      expect(result).toHaveLength(2);
      expect(result[0].timestamp).toBe('2026-01-02T10-00-00');
      expect(result[0].data.results[0].status).toBe('error');
    });

    it('should sort history files by timestamp descending', () => {
      const historyDir = join(testDir, '.pulsetel-history');
      
      writeFileSync(join(historyDir, 'run-2026-01-01T10-00-00.json'), JSON.stringify({ a: 1 }));
      writeFileSync(join(historyDir, 'run-2026-01-03T10-00-00.json'), JSON.stringify({ a: 3 }));
      writeFileSync(join(historyDir, 'run-2026-01-02T10-00-00.json'), JSON.stringify({ a: 2 }));

      const result = (diff as any).loadHistory();

      expect(result).toHaveLength(3);
      expect(result[0].timestamp).toBe('2026-01-03T10-00-00');
      expect(result[1].timestamp).toBe('2026-01-02T10-00-00');
      expect(result[2].timestamp).toBe('2026-01-01T10-00-00');
    });

    it('should ignore non-run files', () => {
      const historyDir = join(testDir, '.pulsetel-history');
      
      writeFileSync(join(historyDir, 'run-2026-01-01T10-00-00.json'), JSON.stringify({ a: 1 }));
      writeFileSync(join(historyDir, 'other-file.json'), JSON.stringify({ b: 2 }));
      writeFileSync(join(historyDir, 'run-2026-01-02T10-00-00.txt'), 'not json');

      const result = (diff as any).loadHistory();

      expect(result).toHaveLength(1);
      expect(result[0].timestamp).toBe('2026-01-01T10-00-00');
    });
  });

  describe('printDeltaText', () => {
    it('should print delta text format', () => {
      const delta = {
        risk: 'high',
        summary: 'CI is failing',
        checked_at: '2026-01-01T10:00:00.000Z',
        since: '2026-01-01T09:00:00.000Z',
        significant_changes: 1,
        checks_changed: {
          ci: { status: 'degradation', previous: 'success', current: 'error' }
        },
        recommendation: 'Fix CI immediately'
      };

      // Mock console.log to capture output
      const logSpy = vi.spyOn(console, 'log');
      (diff as any).printDeltaText(delta);

      expect(logSpy).toHaveBeenCalled();
      const output = logSpy.mock.calls.join('\n');
      expect(output).toContain('🔴');
      expect(output).toContain('CI is failing');
      expect(output).toContain('Risk: HIGH');
      expect(output).toContain('ci: success → error');
      logSpy.mockRestore();
    });

    it('should handle different risk levels with correct emojis', () => {
      const risks: Array<'none' | 'low' | 'medium' | 'high' | 'critical'> = ['none', 'low', 'medium', 'high', 'critical'];
      const emojiMap: Record<string, string> = {
        none: '✅',
        low: 'ℹ️',
        medium: '⚠️',
        high: '🔴',
        critical: '💥'
      };

      risks.forEach(risk => {
        const delta = {
          risk,
          summary: 'Test',
          checked_at: '2026-01-01T10:00:00.000Z',
          since: '2026-01-01T09:00:00.000Z',
          significant_changes: 0,
          checks_changed: {},
          recommendation: 'Test'
        };

        const logSpy = vi.spyOn(console, 'log');
        (diff as any).printDeltaText(delta);

        const output = logSpy.mock.calls.join('\n');
        expect(output).toContain(emojiMap[risk]);
        logSpy.mockRestore();
      });
    });
  });

  describe('run method', () => {
    it('should handle no history gracefully', async () => {
      const logSpy = vi.spyOn(console, 'log');
      await diff.run({});

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('No history found'));
      logSpy.mockRestore();
    });

    it('should run delta mode when delta option is true', async () => {
      // Create history file
      const historyDir = join(testDir, '.pulsetel-history');
      writeFileSync(join(historyDir, 'run-2026-01-01T10-00-00.json'), JSON.stringify({
        results: [{ type: 'ci', status: 'success' }]
      }));

      // Mock gatherCurrentState to return current data
      const mockGather = vi.fn().mockResolvedValue({
        results: [{ type: 'ci', status: 'error' }]
      });
      vi.spyOn(diff as any, 'gatherCurrentState').mockImplementation(mockGather);

      const logSpy = vi.spyOn(console, 'log');
      await diff.run({ delta: true });

      expect(mockGather).toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('PulseTel Delta'));
      logSpy.mockRestore();
    });

    it('should use JSON format when format is json', async () => {
      const historyDir = join(testDir, '.pulsetel-history');
      writeFileSync(join(historyDir, 'run-2026-01-01T10-00-00.json'), JSON.stringify({
        results: [{ type: 'ci', status: 'success' }]
      }));

      const mockGather = vi.fn().mockResolvedValue({
        results: [{ type: 'ci', status: 'error' }]
      });
      vi.spyOn(diff as any, 'gatherCurrentState').mockImplementation(mockGather);

      const logSpy = vi.spyOn(console, 'log');
      await diff.run({ delta: true, format: 'json' });

      const output = logSpy.mock.calls[0][0];
      expect(() => JSON.parse(output)).not.toThrow();
      logSpy.mockRestore();
    });
  });
});
