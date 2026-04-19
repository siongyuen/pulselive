import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runSingleRepoCheck,
  formatCheckOutput,
  handleCheckExitCodes,
  handleComparison,
  handleHistory
} from '../src/cli-helpers';
import { CheckResult } from '../src/scanner';
import { CLIDeps } from '../src/cli-helpers';

describe('cli-helpers check functions', () => {
  let mockDeps: CLIDeps;
  let mockExit: any;
  let mockLog: any;

  beforeEach(() => {
    mockExit = vi.fn();
    mockLog = vi.fn();
    mockDeps = {
      exit: mockExit,
      log: mockLog,
      error: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      existsSync: vi.fn(),
      mkdirSync: vi.fn(),
      execFile: vi.fn(),
      cwd: vi.fn()
    };
  });

  // ── runSingleRepoCheck ───

  describe('runSingleRepoCheck', () => {
    it('should run checks in specified directory', async () => {
      mockDeps.cwd.mockReturnValue('/test/dir');
      mockDeps.existsSync.mockReturnValue(true);
      mockDeps.readFile.mockReturnValue('{}');

      const result = await runSingleRepoCheck('/test/dir', { json: false }, mockDeps);
      
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('config');
      expect(result).toHaveProperty('workingDir');
      expect(result.workingDir).toBe('/test/dir');
    });

    it('should use current directory when no dir specified', async () => {
      mockDeps.cwd.mockReturnValue('/current/dir');
      mockDeps.existsSync.mockReturnValue(true);
      mockDeps.readFile.mockReturnValue('{}');

      const result = await runSingleRepoCheck(undefined, { json: false }, mockDeps);
      
      expect(result.workingDir).toBe('/current/dir');
    });

    it('should run quick checks when quick option is true', async () => {
      mockDeps.cwd.mockReturnValue('/test/dir');
      mockDeps.existsSync.mockReturnValue(true);
      mockDeps.readFile.mockReturnValue('{}');

      const result = await runSingleRepoCheck('/test/dir', { quick: true }, mockDeps);
      
      expect(result).toHaveProperty('results');
      expect(result.duration).toBeGreaterThan(0);
    });
  });

  // ── formatCheckOutput ───

  describe('formatCheckOutput', () => {
    const mockResults: CheckResult[] = [
      {
        type: 'ci',
        status: 'success',
        message: 'CI is healthy',
        details: {},
        duration: 100
      },
      {
        type: 'deps',
        status: 'warning',
        message: 'Some dependencies outdated',
        details: {},
        duration: 150
      }
    ];

    it('should output JSON when json option is true', () => {
      formatCheckOutput(mockResults, 200, { json: true }, mockDeps);
      
      expect(mockLog).toHaveBeenCalled();
      const callArg = mockLog.mock.calls[0][0];
      expect(() => JSON.parse(callArg)).not.toThrow();
      const parsed = JSON.parse(callArg);
      expect(parsed.schema_version).toBe('1.0.0');
      expect(parsed.results).toHaveLength(2);
    });

    it('should output JUnit when junit option is true', () => {
      formatCheckOutput(mockResults, 200, { junit: true }, mockDeps);
      
      expect(mockLog).toHaveBeenCalled();
      const callArg = mockLog.mock.calls[0][0];
      expect(callArg).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    });

    it('should output verbose format when verbose option is true', () => {
      formatCheckOutput(mockResults, 200, { verbose: true }, mockDeps);
      
      expect(mockLog).toHaveBeenCalled();
      const callArg = mockLog.mock.calls[0][0];
      expect(callArg).toContain('CI is healthy');
      expect(callArg).toContain('Some dependencies outdated');
    });

    it('should output standard format by default', () => {
      // Use mock results that won't cause reporter issues
      const mockResults: CheckResult[] = [
        {
          type: 'ci',
          status: 'success',
          message: 'CI is healthy',
          details: { runCount: 10, failCount: 0, flakinessScore: 0 },
          duration: 100
        }
      ];
      
      formatCheckOutput(mockResults, 200, {}, mockDeps);
      
      expect(mockLog).toHaveBeenCalled();
      const callArg = mockLog.mock.calls[0][0];
      expect(callArg).toContain('✅');
    });

    it('should include trends when includeTrends option is true', () => {
      // Use mock results that won't cause reporter issues
      const mockResults: CheckResult[] = [
        {
          type: 'ci',
          status: 'success',
          message: 'CI is healthy',
          details: { runCount: 10, failCount: 0, flakinessScore: 0 },
          duration: 100
        }
      ];
      
      formatCheckOutput(mockResults, 200, { json: true, includeTrends: true }, mockDeps);
      
      expect(mockLog).toHaveBeenCalled();
      const callArg = mockLog.mock.calls[0][0];
      const parsed = JSON.parse(callArg);
      expect(parsed).toHaveProperty('trends');
      expect(parsed).toHaveProperty('anomalies');
    });
  });

  // ── handleCheckExitCodes ───

  describe('handleCheckExitCodes', () => {
    const mockResults: CheckResult[] = [
      {
        type: 'ci',
        status: 'success',
        message: 'CI is healthy',
        details: {},
        duration: 100
      }
    ];

    const mockResultsWithError: CheckResult[] = [
      {
        type: 'ci',
        status: 'error',
        message: 'CI failed',
        details: {},
        duration: 100
      }
    ];

    const mockResultsWithWarning: CheckResult[] = [
      {
        type: 'deps',
        status: 'warning',
        message: 'Some dependencies outdated',
        details: {},
        duration: 100
      }
    ];

    it('should exit with code 0 when all checks are healthy and exitCode option is true', () => {
      handleCheckExitCodes(mockResults, { exitCode: true }, mockDeps);
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('should exit with code 1 when there are errors and exitCode option is true', () => {
      handleCheckExitCodes(mockResultsWithError, { exitCode: true }, mockDeps);
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should exit with code 2 when there are only warnings and exitCode option is true', () => {
      handleCheckExitCodes(mockResultsWithWarning, { exitCode: true }, mockDeps);
      expect(mockExit).toHaveBeenCalledWith(2);
    });

    it('should exit with code 1 when there are errors and failOnError option is true', () => {
      handleCheckExitCodes(mockResultsWithError, { failOnError: true }, mockDeps);
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should exit with code 1 when there are errors and ci option is true', () => {
      handleCheckExitCodes(mockResultsWithError, { ci: true }, mockDeps);
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should not exit when no exit options are specified', () => {
      handleCheckExitCodes(mockResults, {}, mockDeps);
      expect(mockExit).not.toHaveBeenCalled();
    });
  });

  // ── handleComparison ───

  describe('handleComparison', () => {
    const mockResults: CheckResult[] = [
      {
        type: 'ci',
        status: 'success',
        message: 'CI is healthy',
        details: {},
        duration: 100
      }
    ];

    it('should complete without throwing when compare option is true', () => {
      // This test just verifies the function doesn't throw
      expect(() => handleComparison(mockResults, { compare: true }, mockDeps)).not.toThrow();
    });

    it('should not throw when compare option is false', () => {
      expect(() => handleComparison(mockResults, { compare: false }, mockDeps)).not.toThrow();
    });
  });

  // ── handleHistory ───

  describe('handleHistory', () => {
    const mockResults: CheckResult[] = [
      {
        type: 'ci',
        status: 'success',
        message: 'CI is healthy',
        details: {},
        duration: 100
      }
    ];

    it('should complete without throwing when compare option is false', () => {
      expect(() => handleHistory(mockResults, { compare: false }, '/test/dir', mockDeps)).not.toThrow();
    });

    it('should not throw when compare option is true', () => {
      expect(() => handleHistory(mockResults, { compare: true }, '/test/dir', mockDeps)).not.toThrow();
    });
  });
});