import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as cliHelpers from '../src/cli-helpers';
import { CLIDeps, defaultCLIDeps } from '../src/cli-helpers';

describe('CLI Helpers — Additional Coverage', () => {
  let mockDeps: CLIDeps;

  beforeEach(() => {
    mockDeps = {
      exit: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      existsSync: vi.fn(),
      mkdirSync: vi.fn(),
      execFile: vi.fn(),
      cwd: vi.fn().mockReturnValue('/test/project')
    };
  });

  // ── computeMultiRepoSummary ──

  describe('computeMultiRepoSummary', () => {
    it('returns healthy when all repos have no errors or warnings', () => {
      const results = [
        { repo: 'org/repo1', results: [{ type: 'ci', status: 'success', message: 'OK' }] },
        { repo: 'org/repo2', results: [{ type: 'ci', status: 'success', message: 'OK' }] },
      ];
      const summary = cliHelpers.computeMultiRepoSummary(results);
      expect(summary.overallStatus).toBe('healthy');
      expect(summary.reposWithErrors).toBe(0);
      expect(summary.reposWithWarnings).toBe(0);
    });

    it('returns critical when any repo has errors', () => {
      const results = [
        { repo: 'org/repo1', results: [{ type: 'ci', status: 'error', message: 'FAIL' }] },
        { repo: 'org/repo2', results: [{ type: 'ci', status: 'success', message: 'OK' }] },
      ];
      const summary = cliHelpers.computeMultiRepoSummary(results);
      expect(summary.overallStatus).toBe('critical');
      expect(summary.reposWithErrors).toBe(1);
      expect(summary.totalCritical).toBe(1);
    });

    it('returns degraded when repos have warnings but no errors', () => {
      const results = [
        { repo: 'org/repo1', results: [{ type: 'ci', status: 'warning', message: 'WARN' }] },
        { repo: 'org/repo2', results: [{ type: 'ci', status: 'success', message: 'OK' }] },
      ];
      const summary = cliHelpers.computeMultiRepoSummary(results);
      expect(summary.overallStatus).toBe('degraded');
      expect(summary.reposWithWarnings).toBe(1);
    });

    it('counts error repos correctly', () => {
      const results = [
        { repo: 'org/repo1', results: [], error: 'API error' },
        { repo: 'org/repo2', results: [{ type: 'ci', status: 'error', message: 'FAIL' }] },
      ];
      const summary = cliHelpers.computeMultiRepoSummary(results);
      expect(summary.reposWithErrors).toBe(2);
      expect(summary.overallStatus).toBe('critical');
    });
  });

  // ── getTrendIcon ──

  describe('getTrendIcon', () => {
    it('returns up arrow for improving status', () => {
      expect(cliHelpers.getTrendIcon('error', 'success')).toBe('↑');
      expect(cliHelpers.getTrendIcon('warning', 'success')).toBe('↑');
      expect(cliHelpers.getTrendIcon('error', 'warning')).toBe('↑');
    });

    it('returns down arrow for degrading status', () => {
      expect(cliHelpers.getTrendIcon('success', 'error')).toBe('↓');
      expect(cliHelpers.getTrendIcon('success', 'warning')).toBe('↓');
      expect(cliHelpers.getTrendIcon('warning', 'error')).toBe('↓');
    });

    it('returns right arrow for same status', () => {
      expect(cliHelpers.getTrendIcon('success', 'success')).toBe('→');
      expect(cliHelpers.getTrendIcon('error', 'error')).toBe('→');
      expect(cliHelpers.getTrendIcon('warning', 'warning')).toBe('→');
    });
  });

  // ── compareWithPrevious ──

  describe('compareWithPrevious', () => {
    it('returns no comparison when no history', () => {
      // Pass empty history as second argument
      const result = cliHelpers.compareWithPrevious([], []);
      expect(result).toContain('No previous runs');
    });

    it('detects status changes', () => {
      const currentResults = [
        { type: 'ci', status: 'error', message: 'CI failed' },
        { type: 'deps', status: 'success', message: 'OK' },
      ];
      const previousResults = [
        { type: 'ci', status: 'success', message: 'CI passing' },
        { type: 'deps', status: 'success', message: 'OK' },
      ];
      const history = [{ timestamp: '2024-01-01T00:00:00Z', results: previousResults }];
      vi.spyOn(cliHelpers, 'loadHistory').mockReturnValue(history);

      const result = cliHelpers.compareWithPrevious(currentResults, history);
      expect(result).toContain('ci');
      expect(result).toContain('success → error');
    });

    it('reports no changes when status unchanged', () => {
      const currentResults = [
        { type: 'ci', status: 'success', message: 'CI passing' },
      ];
      const previousResults = [
        { type: 'ci', status: 'success', message: 'CI passing' },
      ];
      const history = [{ timestamp: '2024-01-01T00:00:00Z', results: previousResults }];
      
      const result = cliHelpers.compareWithPrevious(currentResults, history);
      expect(result).toContain('No significant changes');
    });
  });

  // ── formatTimeAgo ──

  describe('formatTimeAgo', () => {
    it('formats seconds ago', () => {
      const now = new Date();
      const result = cliHelpers.formatTimeAgo(new Date(now.getTime() - 30000).toISOString());
      expect(result).toContain('s ago');
    });

    it('formats minutes ago', () => {
      const now = new Date();
      const result = cliHelpers.formatTimeAgo(new Date(now.getTime() - 180000).toISOString());
      expect(result).toContain('m ago');
    });

    it('formats hours ago', () => {
      const now = new Date();
      const result = cliHelpers.formatTimeAgo(new Date(now.getTime() - 7200000).toISOString());
      expect(result).toContain('h ago');
    });

    it('formats days ago', () => {
      const now = new Date();
      const result = cliHelpers.formatTimeAgo(new Date(now.getTime() - 172800000).toISOString());
      expect(result).toContain('d ago');
    });
  });

  // ── extractMetricsFromResult ──

  describe('extractMetricsFromResult', () => {
    it('extracts CI metrics', () => {
      const result = { type: 'ci', status: 'success', message: 'OK', details: { runCount: 10, failCount: 2, flakinessScore: 20 } };
      const metrics = cliHelpers.extractMetricsFromResult(result as any);
      expect(metrics.runCount).toBe(10);
      expect(metrics.failCount).toBe(2);
      expect(metrics.flakinessScore).toBe(20);
    });

    it('extracts deps metrics', () => {
      const result = { type: 'deps', status: 'success', message: 'OK', details: { outdated: 5, vulnerable: 2, total: 100 } };
      const metrics = cliHelpers.extractMetricsFromResult(result as any);
      expect(metrics.outdated).toBe(5);
      expect(metrics.vulnerable).toBe(2);
    });

    it('extracts issues metrics', () => {
      const result = { type: 'issues', status: 'success', message: 'OK', details: { open: 15, closed: 30 } };
      const metrics = cliHelpers.extractMetricsFromResult(result as any);
      expect(metrics.open).toBe(15);
      expect(metrics.closed).toBe(30);
    });

    it('extracts coverage metrics', () => {
      const result = { type: 'coverage', status: 'success', message: 'OK', details: { percentage: 85 } };
      const metrics = cliHelpers.extractMetricsFromResult(result as any);
      expect(metrics.percentage).toBe(85);
    });

    it('extracts health metrics from array', () => {
      const result = { type: 'health', status: 'success', message: 'OK', details: [{ url: 'https://api.example.com', responseTime: 200, status: 'up' }] };
      const metrics = cliHelpers.extractMetricsFromResult(result as any);
      expect(metrics.endpoints).toHaveLength(1);
      expect(metrics.endpoints[0].latency).toBe(200);
    });

    it('returns empty object when no details', () => {
      const result = { type: 'ci', status: 'success', message: 'OK' };
      const metrics = cliHelpers.extractMetricsFromResult(result as any);
      expect(metrics).toEqual({});
    });
  });

  // ── mapToSchemaResult ──

  describe('mapToSchemaResult', () => {
    it('maps error status to critical severity', () => {
      const result = cliHelpers.mapToSchemaResult({ type: 'ci', status: 'error', message: 'CI failed' } as any);
      expect(result.severity).toBe('critical');
    });

    it('maps warning status to medium severity', () => {
      const result = cliHelpers.mapToSchemaResult({ type: 'deps', status: 'warning', message: 'Outdated' } as any);
      expect(result.severity).toBe('medium');
    });

    it('maps success status to low severity', () => {
      const result = cliHelpers.mapToSchemaResult({ type: 'git', status: 'success', message: 'Clean' } as any);
      expect(result.severity).toBe('low');
    });

    it('includes actionable and context for each check type', () => {
      const result = cliHelpers.mapToSchemaResult({ type: 'ci', status: 'error', message: 'CI failed' } as any);
      expect(result.actionable).toBeDefined();
      expect(result.context).toBeDefined();
      expect(result.actionable.length).toBeGreaterThan(0);
    });
  });

  // ── handleCheckExitCodes ──

  describe('handleCheckExitCodes', () => {
    it('exits 1 on error with exitCode flag', () => {
      cliHelpers.handleCheckExitCodes(
        [{ type: 'ci', status: 'error', message: 'FAIL' }],
        { exitCode: true },
        mockDeps
      );
      expect(mockDeps.exit).toHaveBeenCalledWith(1);
    });

    it('exits 2 on warning with exitCode flag', () => {
      cliHelpers.handleCheckExitCodes(
        [{ type: 'ci', status: 'warning', message: 'WARN' }],
        { exitCode: true },
        mockDeps
      );
      expect(mockDeps.exit).toHaveBeenCalledWith(2);
    });

    it('exits 0 on success with exitCode flag', () => {
      cliHelpers.handleCheckExitCodes(
        [{ type: 'ci', status: 'success', message: 'OK' }],
        { exitCode: true },
        mockDeps
      );
      expect(mockDeps.exit).toHaveBeenCalledWith(0);
    });

    it('exits 1 on error with failOnError flag', () => {
      cliHelpers.handleCheckExitCodes(
        [{ type: 'ci', status: 'error', message: 'FAIL' }],
        { failOnError: true },
        mockDeps
      );
      expect(mockDeps.exit).toHaveBeenCalledWith(1);
    });

    it('does not exit when no flags set', () => {
      cliHelpers.handleCheckExitCodes(
        [{ type: 'ci', status: 'error', message: 'FAIL' }],
        {},
        mockDeps
      );
      expect(mockDeps.exit).not.toHaveBeenCalled();
    });
  });
});